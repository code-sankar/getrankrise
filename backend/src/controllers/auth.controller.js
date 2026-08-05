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
 
    // 7. Return success with access token
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