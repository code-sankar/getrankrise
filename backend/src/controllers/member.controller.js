// backend/src/controllers/member.controller.js
//
// Team management: who belongs to a clinic, and how someone new gets added.
//
// Migration 0015 built the authorization model — clinic_members, owner/staff,
// loadClinic resolving the tenant through membership, restrictTo() enforcing
// it — and left the only way to USE it as a shell script run against the
// production database. This is the flow that makes it a product feature.
//
// ── The permission boundary ────────────────────────────────────────────────
// Every mutating route here is restrictTo("owner"). The owner/staff split
// exists to answer "can this person spend or cancel", and being able to grant
// yourself an owner seat is strictly more powerful than either — a staff
// member who could invite could invite themselves an owner account and then
// change the plan. Listing stays open to staff: knowing who your colleagues
// are is not a privilege, and hiding it would make the app feel broken to the
// receptionist it was built for.
//
// ── One clinic per person ──────────────────────────────────────────────────
// clinic_members.uniq_member_user (0015) enforces it, because loadClinic takes
// the first membership row and there is no clinic switcher. Rather than let an
// invitation acceptance collide with that constraint and surface as a 500,
// acceptInvite checks first and explains.

import { QueryTypes } from "sequelize";
import { sequelize } from "../config/db.js";
import { User, Clinic } from "../models/index.js";
import { hashPassword } from "../utils/hash.js";
import { hashToken } from "../services/auth/refreshToken.service.js";
import { generateToken } from "../services/auth/authToken.service.js";
import {
  generateTokenPair,
  setRefreshTokenCookie,
  getTokenExpiry,
} from "../utils/jwt.js";
import { issueRefreshToken } from "../services/auth/refreshToken.service.js";
import {
  isEmailConfigured,
  sendClinicInviteEmail,
} from "../services/email/email.service.js";
import { env } from "../config/env.js";
import {
  successResponse,
  createdResponse,
  badRequestResponse,
  notFoundResponse,
  conflictResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "../utils/apiResponse.js";
import { auditFromReq, AUDIT_EVENTS } from "../utils/auditLog.js";

/** How long an invitation stays acceptable. */
export const INVITE_TTL_DAYS = 14;

const acceptUrlFor = (token) =>
  `${String(env.CLIENT_URL || "").split(",")[0].trim().replace(/\/+$/, "")}` +
  `/accept-invite?token=${encodeURIComponent(token)}`;

// ── GET /api/v1/clinic/members ───────────────────────────────────────────────
// Members and pending invitations in one response — they are one list in the
// UI ("who has access?"), and splitting them across two requests would let the
// screen render a half-truth while the second one is in flight.
export const listMembers = async (req, res) => {
  const members = await sequelize.query(
    `SELECT m.user_id      AS "userId",
            m.role         AS role,
            m.created_at   AS "joinedAt",
            u.name         AS name,
            u.email        AS email,
            u.is_active    AS "isActive",
            (u.email_verified_at IS NOT NULL) AS "emailVerified"
       FROM clinic_members m
       JOIN users u ON u.id = m.user_id
      WHERE m.clinic_id = $1::uuid
      ORDER BY (m.role = 'owner') DESC, m.created_at ASC`,
    { bind: [req.clinic.id], type: QueryTypes.SELECT }
  );

  // Expired invitations are filtered out rather than shown as "expired": an
  // owner cannot act on one (there is no "extend"), so listing it is a row of
  // noise. Re-inviting the same address is the action, and the partial unique
  // index lets that happen because an expired row is still "pending" to the
  // index — which is why revoking on re-invite is handled in inviteMember.
  const invitations = await sequelize.query(
    `SELECT i.id, i.email, i.role, i.created_at AS "invitedAt",
            i.expires_at AS "expiresAt", u.name AS "invitedByName"
       FROM clinic_invitations i
       LEFT JOIN users u ON u.id = i.invited_by
      WHERE i.clinic_id = $1::uuid
        AND i.accepted_at IS NULL
        AND i.revoked_at IS NULL
        AND i.expires_at > NOW()
      ORDER BY i.created_at DESC`,
    { bind: [req.clinic.id], type: QueryTypes.SELECT }
  );

  return successResponse(res, {
    message: "Members fetched",
    data: {
      members,
      invitations,
      // So the UI can hide owner-only controls without re-deriving the rule.
      yourRole: req.clinicRole,
      canInvite: req.clinicRole === "owner" && isEmailConfigured(),
      emailConfigured: isEmailConfigured(),
    },
  });
};

// ── POST /api/v1/clinic/members/invite ───────────────────────────────────────
export const inviteMember = async (req, res) => {
  try {
    const { email, role } = req.body; // Joi validated: email, role ∈ owner|staff

    // An invitation IS an email. Without a mailer this would create a row whose
    // token nobody can ever receive — a pending invite that can never be
    // accepted, which looks to the owner exactly like one that was sent.
    if (!isEmailConfigured()) {
      return res.status(503).json({
        success: false,
        code: "EMAIL_NOT_CONFIGURED",
        message:
          "Invitations need email to be configured on the server. Please contact support.",
      });
    }

    // Already on this team? Say so — the owner's intent is satisfied.
    const [existingMember] = await sequelize.query(
      `SELECT u.name FROM clinic_members m
         JOIN users u ON u.id = m.user_id
        WHERE m.clinic_id = $1::uuid AND LOWER(u.email) = LOWER($2::text)`,
      { bind: [req.clinic.id, email], type: QueryTypes.SELECT }
    );
    if (existingMember) {
      return conflictResponse(
        res,
        `${existingMember.name} is already a member of this clinic.`
      );
    }

    // On another team? uniq_member_user would reject the acceptance later, so
    // refusing now is the honest moment — after the invite is sent, the person
    // has already been told they can join.
    const [otherMembership] = await sequelize.query(
      `SELECT c.clinic_name AS "clinicName"
         FROM users u
         JOIN clinic_members m ON m.user_id = u.id
         JOIN clinics c        ON c.id = m.clinic_id
        WHERE LOWER(u.email) = LOWER($1::text)`,
      { bind: [email], type: QueryTypes.SELECT }
    );
    if (otherMembership) {
      return conflictResponse(
        res,
        `That email already belongs to a member of ${otherMembership.clinicName}. ` +
          `A person can only belong to one clinic — they'll need to leave that one first.`
      );
    }

    const token = generateToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000);

    // Re-inviting replaces the pending invitation rather than adding a second.
    // The ON CONFLICT arm targets uniq_clinic_invitation_pending, so the older
    // link stops working the instant the new one is minted — the same rule as
    // auth_tokens, for the same reason: two live links in two inboxes is one
    // more chance for the wrong person to use one.
    const [row] = await sequelize.query(
      `INSERT INTO clinic_invitations
         (clinic_id, email, role, token_hash, invited_by, expires_at)
       VALUES ($1::uuid, $2::text, $3::clinic_role_enum, $4::char(64), $5::uuid, $6::timestamptz)
       ON CONFLICT (clinic_id, lower(email)) WHERE accepted_at IS NULL AND revoked_at IS NULL
       DO UPDATE SET role       = EXCLUDED.role,
                     token_hash = EXCLUDED.token_hash,
                     invited_by = EXCLUDED.invited_by,
                     created_at = NOW(),
                     expires_at = EXCLUDED.expires_at
       RETURNING id, email, role, created_at AS "invitedAt", expires_at AS "expiresAt"`,
      {
        bind: [req.clinic.id, email, role, hashToken(token), req.user.id, expiresAt],
        type: QueryTypes.SELECT,
      }
    );

    try {
      await sendClinicInviteEmail({
        to: email,
        clinicName: req.clinic.clinicName,
        inviterName: req.user.name,
        role,
        acceptUrl: acceptUrlFor(token),
        expiryDays: INVITE_TTL_DAYS,
      });
    } catch (err) {
      // The row exists but nobody can act on it — that is a pending invitation
      // that will never be accepted, and the owner would sit waiting. Remove it
      // and report the failure, so "invite sent" always means one was.
      await sequelize
        .query(`DELETE FROM clinic_invitations WHERE id = $1::uuid`, {
          bind: [row.id],
          type: QueryTypes.DELETE,
        })
        .catch(() => {});
      console.error("inviteMember: send failed:", err.message);
      return serverErrorResponse(
        res,
        "We couldn't send that invitation email. Please check the address and try again."
      );
    }

    auditFromReq(req, AUDIT_EVENTS.SETTINGS_UPDATED, {
      metadata: { section: "team", action: "invited", email, role },
    });

    return createdResponse(res, { invitation: row }, `Invitation sent to ${email}.`);
  } catch (err) {
    console.error("inviteMember error:", err);
    return serverErrorResponse(res, "Could not send that invitation.");
  }
};

// ── DELETE /api/v1/clinic/members/invitations/:id ────────────────────────────
export const revokeInvitation = async (req, res) => {
  const [row] = await sequelize.query(
    `UPDATE clinic_invitations
        SET revoked_at = NOW(), revoked_reason = 'revoked_by_owner'
      WHERE id = $1::uuid
        AND clinic_id = $2::uuid       -- tenant boundary
        AND accepted_at IS NULL
        AND revoked_at IS NULL
      RETURNING email`,
    { bind: [req.params.id, req.clinic.id], type: QueryTypes.SELECT }
  );

  if (!row) return notFoundResponse(res, "That invitation is no longer pending.");

  auditFromReq(req, AUDIT_EVENTS.SETTINGS_UPDATED, {
    metadata: { section: "team", action: "invitation_revoked", email: row.email },
  });

  return successResponse(res, {
    message: `Invitation to ${row.email} revoked.`,
    data: { id: req.params.id },
  });
};

// ── DELETE /api/v1/clinic/members/:userId ────────────────────────────────────
export const removeMember = async (req, res) => {
  const { userId } = req.params;

  // Removing yourself is not "leaving the team", it is locking yourself out of
  // your own clinic — loadClinic resolves through membership, so the next
  // request would 404 on every route. If a real "transfer ownership then
  // leave" flow is ever wanted, it needs to be exactly that, deliberately.
  if (userId === req.user.id) {
    return badRequestResponse(
      res,
      "You can't remove yourself. Transfer ownership to someone else first."
    );
  }

  // Never leave a clinic with no owner: billing, cancellation and invitations
  // are all restrictTo("owner"), so an ownerless clinic is one nobody can
  // administer or close.
  const [{ n: ownerCount }] = await sequelize.query(
    `SELECT COUNT(*)::int AS n FROM clinic_members
      WHERE clinic_id = $1::uuid AND role = 'owner'`,
    { bind: [req.clinic.id], type: QueryTypes.SELECT }
  );

  const [target] = await sequelize.query(
    `SELECT m.role, u.name FROM clinic_members m
       JOIN users u ON u.id = m.user_id
      WHERE m.clinic_id = $1::uuid AND m.user_id = $2::uuid`,
    { bind: [req.clinic.id, userId], type: QueryTypes.SELECT }
  );

  if (!target) return notFoundResponse(res, "That person isn't a member of this clinic.");

  if (target.role === "owner" && ownerCount <= 1) {
    return forbiddenResponse(
      res,
      "This is the clinic's only owner. Make someone else an owner first."
    );
  }

  await sequelize.query(
    `DELETE FROM clinic_members WHERE clinic_id = $1::uuid AND user_id = $2::uuid`,
    { bind: [req.clinic.id, userId], type: QueryTypes.DELETE }
  );

  // Their sessions must end with their access. Without this, a removed staff
  // member keeps a working access token for up to 15 minutes and a refresh
  // token for 7 days — and loadClinic would still resolve nothing, so they'd
  // get 404s rather than a clean "you were removed", which is worse.
  await sequelize.query(
    `UPDATE refresh_tokens
        SET revoked_at = NOW(), revoked_reason = 'removed_from_clinic'
      WHERE user_id = $1::uuid AND revoked_at IS NULL`,
    { bind: [userId], type: QueryTypes.UPDATE }
  );

  auditFromReq(req, AUDIT_EVENTS.SETTINGS_UPDATED, {
    metadata: { section: "team", action: "member_removed", removedUserId: userId },
  });

  return successResponse(res, {
    message: `${target.name} no longer has access to this clinic.`,
    data: { userId },
  });
};

// ── PATCH /api/v1/clinic/members/:userId ─────────────────────────────────────
// Role change. Same last-owner protection as removal.
export const updateMemberRole = async (req, res) => {
  const { userId } = req.params;
  const { role } = req.body;

  if (userId === req.user.id) {
    return badRequestResponse(
      res,
      "You can't change your own role. Ask another owner to do it."
    );
  }

  const [target] = await sequelize.query(
    `SELECT m.role, u.name FROM clinic_members m
       JOIN users u ON u.id = m.user_id
      WHERE m.clinic_id = $1::uuid AND m.user_id = $2::uuid`,
    { bind: [req.clinic.id, userId], type: QueryTypes.SELECT }
  );
  if (!target) return notFoundResponse(res, "That person isn't a member of this clinic.");

  if (target.role === "owner" && role !== "owner") {
    const [{ n: ownerCount }] = await sequelize.query(
      `SELECT COUNT(*)::int AS n FROM clinic_members
        WHERE clinic_id = $1::uuid AND role = 'owner'`,
      { bind: [req.clinic.id], type: QueryTypes.SELECT }
    );
    if (ownerCount <= 1) {
      return forbiddenResponse(
        res,
        "This is the clinic's only owner. Promote someone else first."
      );
    }
  }

  await sequelize.query(
    `UPDATE clinic_members SET role = $3::clinic_role_enum
      WHERE clinic_id = $1::uuid AND user_id = $2::uuid`,
    { bind: [req.clinic.id, userId, role], type: QueryTypes.UPDATE }
  );

  auditFromReq(req, AUDIT_EVENTS.SETTINGS_UPDATED, {
    metadata: { section: "team", action: "role_changed", targetUserId: userId, role },
  });

  return successResponse(res, {
    message: `${target.name} is now ${role === "owner" ? "an owner" : "a team member"}.`,
    data: { userId, role },
  });
};

// ── GET /api/v1/clinic/members/invitations/:token — PUBLIC ───────────────────
// Lets the accept page render "Join Bright Smiles Dental as a team member"
// before asking for anything. Returns only what the holder of the token is
// already entitled to know, and never reveals whether an account exists for
// the address — that is what `hasAccount` deliberately omits.
export const previewInvitation = async (req, res) => {
  const [row] = await sequelize.query(
    `SELECT i.email, i.role, i.expires_at AS "expiresAt",
            c.clinic_name AS "clinicName", u.name AS "invitedByName"
       FROM clinic_invitations i
       JOIN clinics c        ON c.id = i.clinic_id
       LEFT JOIN users u     ON u.id = i.invited_by
      WHERE i.token_hash = $1::char(64)
        AND i.accepted_at IS NULL
        AND i.revoked_at IS NULL
        AND i.expires_at > NOW()`,
    { bind: [hashToken(String(req.params.token))], type: QueryTypes.SELECT }
  );

  if (!row) {
    return notFoundResponse(
      res,
      "This invitation is no longer valid. It may have been used, revoked, or expired — ask for a new one."
    );
  }

  // Whether the invited address already has an account decides which form the
  // page shows (sign in vs choose a password). Safe to return: the caller
  // already holds a secret naming that exact address, so it tells them nothing
  // they could not confirm by trying.
  const existing = await User.findOne({ where: { email: row.email } });

  return successResponse(res, {
    message: "Invitation fetched",
    data: { ...row, hasAccount: Boolean(existing) },
  });
};

// ── POST /api/v1/auth/accept-invite — PUBLIC ─────────────────────────────────
//
// Public by necessity: the invitee may not have an account yet, and the link is
// clicked from an inbox rather than from inside the app. The token is the
// proof — same posture as the OAuth callback and the Paddle webhook.
//
// Two paths, one transaction each:
//   existing account → add the membership
//   no account yet   → create the user, then add the membership
//
// Both consume the invitation in the SAME statement that validates it, so a
// double-clicked link cannot be accepted twice.
export const acceptInvitation = async (req, res) => {
  try {
    const { token, name, password } = req.body;
    const tokenHash = hashToken(String(token || ""));

    const result = await sequelize.transaction(async (transaction) => {
      // Claim the invitation atomically. Everything below is conditional on
      // this row coming back, so two concurrent accepts cannot both proceed.
      const [invite] = await sequelize.query(
        `UPDATE clinic_invitations
            SET accepted_at = NOW()
          WHERE token_hash = $1::char(64)
            AND accepted_at IS NULL
            AND revoked_at IS NULL
            AND expires_at > NOW()
          RETURNING id, clinic_id AS "clinicId", email, role`,
        { bind: [tokenHash], type: QueryTypes.SELECT, transaction }
      );

      if (!invite) return { ok: false, reason: "INVALID" };

      let user = await User.findOne({
        where: { email: invite.email },
        transaction,
      });
      let created = false;

      if (user) {
        if (!user.isActive) return { ok: false, reason: "INACTIVE" };

        // uniq_member_user: one clinic per person. Checked rather than caught,
        // so the message explains instead of surfacing a constraint name.
        const [existingMembership] = await sequelize.query(
          `SELECT clinic_id FROM clinic_members WHERE user_id = $1::uuid`,
          { bind: [user.id], type: QueryTypes.SELECT, transaction }
        );
        if (existingMembership) {
          return {
            ok: false,
            reason:
              existingMembership.clinic_id === invite.clinicId
                ? "ALREADY_MEMBER"
                : "OTHER_CLINIC",
          };
        }
      } else {
        // No account: this invitation is also the signup. A password is
        // required here and the route's Joi schema enforces it.
        if (!password || !name) return { ok: false, reason: "NEEDS_DETAILS" };

        user = await User.create(
          {
            name,
            email: invite.email,
            password: await hashPassword(password),
            role: "admin", // platform label; clinic permission is the row below
            // Accepting an emailed invitation IS proof the address receives
            // mail — the same proof the verification link provides. Making
            // them confirm a second time would be theatre.
            emailVerifiedAt: new Date(),
          },
          { transaction }
        );
        created = true;
      }

      await sequelize.query(
        `INSERT INTO clinic_members (clinic_id, user_id, role)
         VALUES ($1::uuid, $2::uuid, $3::clinic_role_enum)
         ON CONFLICT ON CONSTRAINT uniq_clinic_member DO NOTHING`,
        {
          bind: [invite.clinicId, user.id, invite.role],
          type: QueryTypes.INSERT,
          transaction,
        }
      );

      await sequelize.query(
        `UPDATE clinic_invitations SET accepted_user_id = $2::uuid WHERE id = $1::uuid`,
        { bind: [invite.id, user.id], type: QueryTypes.UPDATE, transaction }
      );

      const clinic = await Clinic.findByPk(invite.clinicId, { transaction });
      return { ok: true, user, clinic, role: invite.role, created };
    });

    if (!result.ok) {
      const messages = {
        INVALID:
          "This invitation is no longer valid. It may have been used, revoked, or expired — ask for a new one.",
        INACTIVE: "This account is no longer active. Please contact support.",
        ALREADY_MEMBER: "You're already a member of this clinic — just sign in.",
        OTHER_CLINIC:
          "Your account already belongs to another clinic. A person can only belong to one, so you'll need to leave that one first.",
        NEEDS_DETAILS: "Please provide your name and choose a password.",
      };
      const status = result.reason === "INVALID" ? 400 : 409;
      return res.status(status).json({
        success: false,
        code: result.reason,
        message: messages[result.reason] || messages.INVALID,
      });
    }

    // Sign them straight in — they have just proved they hold the invited
    // inbox and (for a new account) chosen a password. Bouncing them to a
    // login screen at this point would be a step with no security value.
    const { user, clinic, role, created } = result;
    const { accessToken, refreshToken } = generateTokenPair(user);

    await issueRefreshToken({
      userId: user.id,
      token: refreshToken,
      expiresAt: getTokenExpiry(refreshToken),
      req,
    });
    setRefreshTokenCookie(res, refreshToken);

    return successResponse(res, {
      message: `Welcome to ${clinic.clinicName}!`,
      data: {
        accessToken,
        createdAccount: created,
        clinicRole: role,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          clinicName: clinic.clinicName,
          emailVerifiedAt: user.emailVerifiedAt ?? null,
        },
      },
    });
  } catch (err) {
    console.error("acceptInvitation error:", err);
    return serverErrorResponse(res, "Could not accept that invitation.");
  }
};
