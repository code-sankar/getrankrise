import { QueryTypes } from "sequelize";
import { sequelize } from "../config/db.js";
import { provisionFreeSubscription } from "../services/subscription/provisionSubscription.service.js";
import { User, Clinic }        from "../models/index.js";
import { hashPassword, comparePassword } from "../utils/hash.js";
import {
  generateTokenPair,
  verifyRefreshToken,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  getTokenExpiry,
} from "../utils/jwt.js";
import {
  issueRefreshToken,
  consumeRefreshToken,
  revokeRefreshToken,
  revokeAllForUser,
} from "../services/auth/refreshToken.service.js";
import {
  issueAuthToken,
  consumeAuthToken,
  revokeAuthTokens,
  TOKEN_TTL_MINUTES,
} from "../services/auth/authToken.service.js";
import {
  isEmailConfigured,
  sendPasswordResetEmail,
  sendEmailVerificationEmail,
} from "../services/email/email.service.js";
import { env } from "../config/env.js";
import {
  successResponse,
  createdResponse,
  unauthorisedResponse,
  conflictResponse,
  badRequestResponse,
  serverErrorResponse,
} from "../utils/apiResponse.js";


// ── POST /api/v1/auth/register ────────────────────────────────────────────────
export const register = async (req, res) => {
  try {
    const { name, email, password, clinicName } = req.body;
 
    // 1. Check email not already registered.
    //    This is a fast-path courtesy check for a friendly error message — it
    //    is NOT the real guarantee. Two simultaneous signups with the same
    //    email can both pass it. The users.email UNIQUE constraint is the
    //    actual protection, caught below.
    const existing = await User.findOne({ where: { email } });
    if (existing) {
      return conflictResponse(res, "An account with this email already exists");
    }
 
    // 2. Hash password (outside the transaction — bcrypt is CPU-bound and slow,
    //    and holding a transaction open across it wastes a pooled connection).
    const hashedPassword = await hashPassword(password);
 
    // 3. Create user + clinic + subscription atomically.
    //    Any throw inside this callback rolls back all three.
    const { user, clinic } = await sequelize.transaction(async (transaction) => {
      const createdUser = await User.create(
        {
          name,
          email,
          password: hashedPassword,
          role: "admin",
        },
        { transaction }
      );
 
      const createdClinic = await Clinic.create(
        {
          userId: createdUser.id,
          clinicName,
        },
        { transaction }
      );
 
      // Every clinic must have a billing row from the moment it exists.
      await provisionFreeSubscription({
        clinicId: createdClinic.id,
        transaction,
      });

      // …and a membership row, because loadClinic resolves the tenant through
      // clinic_members (migration 0015), not through clinics.user_id. Without
      // this the account would register successfully and then 404 on every
      // authenticated route. Inside the same transaction as the other three
      // writes, so a partial signup is impossible.
      await sequelize.query(
        `INSERT INTO clinic_members (clinic_id, user_id, role)
         VALUES ($1::uuid, $2::uuid, 'owner'::clinic_role_enum)
         ON CONFLICT ON CONSTRAINT uniq_clinic_member DO NOTHING`,
        {
          bind: [createdClinic.id, createdUser.id],
          type: QueryTypes.INSERT,
          transaction,
        }
      );

      return { user: createdUser, clinic: createdClinic };
    });
 
    // 4. Generate token pair.
    //    Deliberately AFTER the commit. If token generation somehow failed we
    //    would rather have a valid account the user can simply log into than
    //    roll back a successful signup.
    const { accessToken, refreshToken } = generateTokenPair(user);

    // 5. Record the session. One row per device (migrations/0014) — this used
    //    to overwrite a single users.refresh_token column, which is why a
    //    second login silently ended the first device's session.
    await issueRefreshToken({
      userId: user.id,
      token: refreshToken,
      expiresAt: getTokenExpiry(refreshToken),
      req,
    });

    // 6. Set refresh token as httpOnly cookie
    setRefreshTokenCookie(res, refreshToken);

    // 7. Send the confirmation link. Best-effort BY DESIGN: the account is
    //    already committed, and failing the signup because SendGrid had a bad
    //    minute would be the worst possible trade. Settings has a "resend"
    //    button for exactly this case.
    await deliverVerificationEmail(user, req).catch((err) =>
      console.error("register: verification email failed:", err.message)
    );

    // 8. Return success with access token
    return createdResponse(
      res,
      {
        accessToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          clinicName: clinic.clinicName,
          emailVerifiedAt: user.emailVerifiedAt ?? null,
        },
      },
      "Account created successfully"
    );
  } catch (err) {
    // Lost the race on the email uniqueness check above.
    if (err.name === "SequelizeUniqueConstraintError") {
      return conflictResponse(res, "An account with this email already exists");
    }
    console.error("register error:", err);
    return serverErrorResponse(res);
  }
};

// ── POST /api/v1/auth/login ───────────────────────────────────────────────────
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Find user including password (uses withPassword scope)
    const user = await User.scope("withPassword").findOne({ where: { email } });

    if (!user) {
      return unauthorisedResponse(res, "Invalid email or password");
    }

    if (!user.isActive) {
      return unauthorisedResponse(res, "Account has been deactivated");
    }

    // 2. Compare password
    const isMatch = await comparePassword(password, user.password);
    if (!isMatch) {
      return unauthorisedResponse(res, "Invalid email or password");
    }

    // 3. Get clinic name — resolved through clinic_members, the same way
    //    loadClinic and getMe do it.
    //
    //    This was the last `Clinic.findOne({ where: { userId } })` left in the
    //    codebase. clinics.user_id is the ORIGINAL-OWNER pointer, not the
    //    membership record, so a staff member (migration 0015) matched nothing
    //    and logged in with clinicName: null — the sidebar showed "My Clinic"
    //    until the next page load, when AppBootstrap's /auth/me quietly
    //    corrected it through the membership table. Two lookups for one
    //    question is how they drift; there is now one.
    const [membership] = await sequelize.query(
      `SELECT clinic_id FROM clinic_members WHERE user_id = $1::uuid LIMIT 1`,
      { bind: [user.id], type: QueryTypes.SELECT }
    );
    const clinic = membership
      ? await Clinic.findByPk(membership.clinic_id)
      : null;

    // 4. Generate token pair
    const { accessToken, refreshToken } = generateTokenPair(user);

    // 5. Record this session alongside any others the user already has open.
    //    Signing in on a second device no longer ends the first one's session.
    await issueRefreshToken({
      userId: user.id,
      token: refreshToken,
      expiresAt: getTokenExpiry(refreshToken),
      req,
    });

    // 6. Set refresh token cookie
    setRefreshTokenCookie(res, refreshToken);

    // 7. Return access token
    return successResponse(res, {
      message: "Login successful",
      data: {
        accessToken,
        user: {
          id:         user.id,
          name:       user.name,
          email:      user.email,
          role:       user.role,
          clinicName: clinic?.clinicName || null,
          // Drives the "confirm your email" banner. Sent on every auth
          // response so the client never has to guess.
          emailVerifiedAt: user.emailVerifiedAt ?? null,
        },
      },
    });

  } catch (err) {
    console.error("login error:", err);
    return serverErrorResponse(res);
  }
};

// ── POST /api/v1/auth/logout ──────────────────────────────────────────────────
export const logout = async (req, res) => {
  try {
    // Revoke ONLY this device's session. Clearing the old single column ended
    // every session the account had, so logging out of a shared front-desk
    // browser also signed the owner out on their phone.
    const token = req.cookies?.refreshToken;
    if (token) await revokeRefreshToken(token, "logout");

    // Clear cookie
    clearRefreshTokenCookie(res);

    return successResponse(res, { message: "Logged out successfully" });

  } catch (err) {
    console.error("logout error:", err);
    return serverErrorResponse(res);
  }
};

// ── POST /api/v1/auth/refresh-token ──────────────────────────────────────────
// Called automatically by axios.helper.js when access token expires
export const refreshToken = async (req, res) => {
  try {
    // 1. Get refresh token from httpOnly cookie
    const token = req.cookies?.refreshToken;

    if (!token) {
      return unauthorisedResponse(res, "No refresh token");
    }

    // 2. Verify refresh token
    let decoded;
    try {
      decoded = verifyRefreshToken(token);
    } catch (err) {
      return unauthorisedResponse(res, err.message);
    }

    // 3. Consume this token. Single atomic statement: it verifies the session
    //    is live AND marks it used, so two concurrent refreshes with the same
    //    token cannot both succeed. A token presented twice is treated as
    //    theft and ends every session this user has — see the service.
    const consumed = await consumeRefreshToken(token);

    if (!consumed.ok) {
      clearRefreshTokenCookie(res);
      if (consumed.reason === "REUSED") {
        console.warn(
          `[auth] refresh-token reuse detected for user ${decoded.id} — all sessions revoked`
        );
        return unauthorisedResponse(
          res,
          "This session was ended for security. Please log in again."
        );
      }
      if (consumed.reason === "REVOKED") {
        // A session we ourselves ended — a logout elsewhere, or a password
        // change. Ordinary, and phrased as such rather than as an alarm.
        return unauthorisedResponse(
          res,
          consumed.revokedReason === "password_change"
            ? "Your password was changed. Please log in again."
            : "You've been signed out. Please log in again."
        );
      }
      return unauthorisedResponse(res, "Invalid refresh token");
    }

    // 4. The session was live; confirm the account still is.
    const user = await User.findByPk(consumed.userId);
    if (!user || !user.isActive) {
      clearRefreshTokenCookie(res);
      return unauthorisedResponse(res, "Account is no longer active");
    }

    // 5. Issue the replacement and record it as this device's new session.
    const { accessToken, refreshToken: newRefreshToken } = generateTokenPair(user);

    await issueRefreshToken({
      userId: user.id,
      token: newRefreshToken,
      expiresAt: getTokenExpiry(newRefreshToken),
      req,
    });

    // 6. Set new cookie
    setRefreshTokenCookie(res, newRefreshToken);

    // 7. Return new access token
    return successResponse(res, {
      message: "Token refreshed",
      data: { accessToken },
    });

  } catch (err) {
    console.error("refreshToken error:", err);
    return serverErrorResponse(res);
  }
};

// ── GET /api/v1/auth/me ───────────────────────────────────────────────────────
// Returns current logged in user + clinic
export const getMe = async (req, res) => {
  try {
    // Resolved through clinic_members, not clinics.user_id. This route mounts
    // `protect` without `loadClinic`, so it does its own lookup — and if that
    // lookup stayed on the ownership pointer, a staff member would get
    // clinic:null here while every other route resolved their clinic fine.
    const [membership] = await sequelize.query(
      `SELECT clinic_id, role FROM clinic_members WHERE user_id = $1::uuid LIMIT 1`,
      { bind: [req.user.id], type: QueryTypes.SELECT }
    );

    const clinic = membership
      ? await Clinic.findByPk(membership.clinic_id)
      : null;

    return successResponse(res, {
      message: "User fetched",
      data: {
        user: {
          id:    req.user.id,
          name:  req.user.name,
          email: req.user.email,
          role:  req.user.role,          // platform role — see models/User.js
          emailVerifiedAt: req.user.emailVerifiedAt ?? null,
        },
        clinic: clinic || null,
        // What this person may do INSIDE the clinic. The frontend uses it to
        // hide owner-only actions; the server enforces it independently via
        // restrictTo(), so hiding is presentation, not security.
        clinicRole: membership?.role ?? null,
      },
    });

  } catch (err) {
    console.error("getMe error:", err);
    return serverErrorResponse(res);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// ACCOUNT RECOVERY AND EMAIL VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════

/** Frontend URL a mailed link points at. CLIENT_URL is the single source. */
const clientUrl = (path, token) =>
  `${String(env.CLIENT_URL || "").split(",")[0].trim().replace(/\/+$/, "")}` +
  `${path}?token=${encodeURIComponent(token)}`;

/** Mints a verification token and mails it. Shared by register and resend. */
async function deliverVerificationEmail(user, req) {
  if (!isEmailConfigured()) return { sent: false, reason: "EMAIL_NOT_CONFIGURED" };

  const { token } = await issueAuthToken({
    userId: user.id,
    purpose: "email_verification",
    ip: req?.ip ?? null,
  });

  await sendEmailVerificationEmail({
    to: user.email,
    name: user.name,
    verifyUrl: clientUrl("/verify-email", token),
    expiryHours: Math.round(TOKEN_TTL_MINUTES.email_verification / 60),
  });

  return { sent: true };
}

// ── POST /api/v1/auth/forgot-password ────────────────────────────────────────
//
// ── Why the response is identical whether or not the account exists ─────────
// Answering "no account with that email" turns this endpoint into an account
// enumeration oracle: anyone can test an address list against it and learn who
// has a GetRankRise account. For a product whose customers are named,
// findable clinics, that is a real disclosure — and the rate limiter does not
// prevent it, it only slows it down.
//
// So every call returns the same 200 and the same sentence. The user learns
// nothing from the response; they learn from their inbox.
//
// The same reasoning covers the deactivated-account and email-send-failure
// branches below: all three return the identical body.
export const forgotPassword = async (req, res) => {
  const genericReply = () =>
    successResponse(res, {
      message:
        "If an account exists for that email, we've sent a link to reset its password.",
      data: null,
    });

  try {
    const { email } = req.body;

    // Nothing to send TO. Say so plainly rather than pretending — this is a
    // server misconfiguration, not a fact about the caller's account, so it
    // does not leak anything and hiding it would waste a support cycle.
    if (!isEmailConfigured()) {
      console.error(
        "[auth] forgot-password requested but email is not configured — " +
          "set SENDGRID_API_KEY + SENDGRID_FROM_EMAIL (or EMAIL_SIMULATE=true in dev)"
      );
      return res.status(503).json({
        success: false,
        code: "EMAIL_NOT_CONFIGURED",
        message:
          "Password reset isn't available right now. Please contact support and we'll help you back in.",
      });
    }

    const user = await User.findOne({ where: { email } });

    // Unknown address, or an account someone deactivated. Same reply either way.
    if (!user || !user.isActive) return genericReply();

    const { token } = await issueAuthToken({
      userId: user.id,
      purpose: "password_reset",
      ip: req.ip,
    });

    try {
      await sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        resetUrl: clientUrl("/reset-password", token),
        expiryMinutes: TOKEN_TTL_MINUTES.password_reset,
      });
    } catch (err) {
      // Logged, not surfaced: a send failure that only happens for REAL
      // accounts would itself be the enumeration signal this endpoint exists
      // to avoid.
      console.error("forgotPassword: send failed:", err.message);
    }

    return genericReply();
  } catch (err) {
    console.error("forgotPassword error:", err);
    return genericReply();
  }
};

// ── POST /api/v1/auth/reset-password ─────────────────────────────────────────
//
// Consuming the token, writing the hash and ending every session happen
// together. A reset that changed the password but left the old sessions alive
// would leave an attacker holding a working refresh token AFTER the owner had
// taken the one action available to lock them out — the exact failure
// changePassword was already fixed for.
//
// No session is issued back here, unlike changePassword. The caller of THIS
// endpoint is someone who could not log in a minute ago, and whose identity we
// know only from a link in an inbox we cannot see. Making them sign in with
// the password they just chose is one extra step that proves they hold it.
export const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    // Hash outside the transaction — bcrypt is CPU-bound and slow, and holding
    // a transaction open across it wastes a pooled connection.
    const hashed = await hashPassword(newPassword);

    const outcome = await sequelize.transaction(async (transaction) => {
      const consumed = await consumeAuthToken({
        token,
        purpose: "password_reset",
        transaction,
      });
      if (!consumed.ok) return { ok: false, reason: consumed.reason };

      const user = await User.findByPk(consumed.userId, { transaction });
      if (!user || !user.isActive) return { ok: false, reason: "INACTIVE" };

      await User.update(
        { password: hashed },
        { where: { id: user.id }, transaction }
      );

      return { ok: true, userId: user.id };
    });

    if (!outcome.ok) {
      const messages = {
        USED: "That reset link has already been used. Request a new one to continue.",
        EXPIRED: "That reset link has expired. Request a new one to continue.",
        INACTIVE: "This account is no longer active. Please contact support.",
        INVALID: "That reset link isn't valid. Request a new one to continue.",
      };
      return badRequestResponse(res, messages[outcome.reason] || messages.INVALID);
    }

    // Outside the transaction: both are cleanup of credentials the commit above
    // already invalidated in principle, and neither should be able to roll the
    // password change back if it fails.
    const sessionsEnded = await revokeAllForUser(outcome.userId, "password_change");
    // Any OTHER reset link still sitting in an inbox dies too. Issuing is an
    // upsert so there is normally at most one, but a link mailed before an
    // admin-side change could otherwise outlive this.
    await revokeAuthTokens({ userId: outcome.userId, purpose: "password_reset" });

    return successResponse(res, {
      message: "Password updated. Please sign in with your new password.",
      data: { sessionsEnded },
    });
  } catch (err) {
    console.error("resetPassword error:", err);
    return serverErrorResponse(res);
  }
};

// ── POST /api/v1/auth/verify-email ───────────────────────────────────────────
// Public: the link is clicked from an inbox, which may not be the browser the
// session lives in. The token is the proof, exactly like the OAuth callback and
// the Paddle webhook — signed (here, unguessable and single-use), not sessioned.
export const verifyEmail = async (req, res) => {
  try {
    const { token } = req.body;

    const consumed = await consumeAuthToken({ token, purpose: "email_verification" });

    if (!consumed.ok) {
      // An already-used token is the overwhelmingly common "failure" here:
      // mail clients prefetch links, and people click twice. The address IS
      // verified in that case, so reporting an error would be both wrong and
      // alarming.
      if (consumed.reason === "USED") {
        return successResponse(res, {
          message: "Your email is already confirmed.",
          data: { alreadyVerified: true },
        });
      }
      const messages = {
        EXPIRED: "That confirmation link has expired. Sign in and request a new one.",
        INVALID: "That confirmation link isn't valid. Sign in and request a new one.",
      };
      return badRequestResponse(res, messages[consumed.reason] || messages.INVALID);
    }

    // Idempotent: re-confirming keeps the ORIGINAL timestamp rather than moving
    // it, so the column keeps meaning "when this address was first proven".
    await User.update(
      { emailVerifiedAt: new Date() },
      { where: { id: consumed.userId, emailVerifiedAt: null } }
    );

    return successResponse(res, {
      message: "Email confirmed. Thanks!",
      data: { alreadyVerified: false },
    });
  } catch (err) {
    console.error("verifyEmail error:", err);
    return serverErrorResponse(res);
  }
};

// ── POST /api/v1/auth/resend-verification ────────────────────────────────────
// Authenticated: this one is triggered from inside the app by someone already
// signed in, so there is no address to enumerate and no reason to be coy.
export const resendVerification = async (req, res) => {
  try {
    if (req.user.emailVerifiedAt) {
      return successResponse(res, {
        message: "Your email is already confirmed.",
        data: { alreadyVerified: true },
      });
    }

    const result = await deliverVerificationEmail(req.user, req);

    if (!result.sent) {
      return res.status(503).json({
        success: false,
        code: "EMAIL_NOT_CONFIGURED",
        message:
          "We can't send confirmation emails right now. Please contact support.",
      });
    }

    return successResponse(res, {
      message: `Confirmation link sent to ${req.user.email}.`,
      data: { alreadyVerified: false },
    });
  } catch (err) {
    console.error("resendVerification error:", err);
    return serverErrorResponse(res, "Could not send the confirmation email.");
  }
};

// ── PUT /api/v1/auth/change-password ─────────────────────────────────────────
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Get user with password
    const user = await User.scope("withPassword").findByPk(req.user.id);

    // Verify current password
    const isMatch = await comparePassword(currentPassword, user.password);
    if (!isMatch) {
      return badRequestResponse(res, "Current password is incorrect");
    }

    // Hash and save new password
    const hashed = await hashPassword(newPassword);
    await User.update({ password: hashed }, { where: { id: user.id } });

    // ── End every other session ────────────────────────────────────────────
    // Changing a password is the action people take when they believe they are
    // compromised. It previously did nothing to existing sessions, so a stolen
    // refresh token kept working for its full 7-day life — the attacker was
    // unaffected by the exact step taken to lock them out.
    //
    // The caller's own session is re-issued below so they are not logged out of
    // the device they just used, which is what makes this safe to do silently.
    // Retire the caller's own session first so the count below is exactly
    // "other devices", not "other devices plus me".
    const currentToken = req.cookies?.refreshToken;
    if (currentToken) await revokeRefreshToken(currentToken, "password_change");
    const otherSessionsEnded = await revokeAllForUser(user.id, "password_change");
    // A reset link mailed moments ago is a working credential for this account.
    // Someone who changes their password because they feel compromised must not
    // leave one live in an inbox.
    await revokeAuthTokens({ userId: user.id, purpose: "password_reset" });

    const { accessToken, refreshToken } = generateTokenPair(user);
    await issueRefreshToken({
      userId: user.id,
      token: refreshToken,
      expiresAt: getTokenExpiry(refreshToken),
      req,
    });
    setRefreshTokenCookie(res, refreshToken);

    return successResponse(res, {
      message: "Password updated successfully",
      data: {
        accessToken,
        // How many OTHER devices were signed out, so the UI can say so.
        otherSessionsEnded,
      },
    });

  } catch (err) {
    console.error("changePassword error:", err);
    return serverErrorResponse(res);
  }
};