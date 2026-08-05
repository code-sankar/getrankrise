// backend/src/services/auth/refreshToken.service.js
//
// Session storage for refresh tokens. See migrations/0014 for why the single
// users.refresh_token column had to go — in short, it allowed exactly one
// session per account and survived a password change.
//
// The refresh JWT remains the credential; this table is the revocation list
// and the multi-device index. A token is valid only if all of the following
// hold, which is what verifyAndRotate checks in one statement:
//
//     the JWT signature verifies (caller does this first)
//     a row exists for its hash
//     that row is not revoked
//     that row has not expired
//
// Raw SQL rather than a model, for the same reason credits.service.js is: the
// rotation has to be atomic. "Check the token is live, then revoke it" as two
// statements lets two concurrent refreshes both pass the check and both
// succeed, which is precisely the replay this is meant to catch.

import crypto from "node:crypto";
import { QueryTypes } from "sequelize";
import { sequelize } from "../../config/db.js";

/** SHA-256 hex. See the migration for why this is not bcrypt. */
export const hashToken = (token) =>
  crypto.createHash("sha256").update(String(token)).digest("hex");

/** Trimmed request context, for a future "active sessions" screen. */
function describeClient(req) {
  if (!req) return { userAgent: null, ip: null };
  return {
    userAgent: (req.get?.("user-agent") || "").slice(0, 200) || null,
    ip: (req.ip || "").slice(0, 64) || null,
  };
}

/**
 * Records a newly-issued refresh token as a live session.
 *
 * @param {object}  params
 * @param {string}  params.userId
 * @param {string}  params.token       the refresh JWT itself (never stored)
 * @param {Date}    params.expiresAt
 * @param {object}  [params.req]       for user-agent / ip labelling
 * @param {import("sequelize").Transaction} [params.transaction]
 */
export async function issueRefreshToken({ userId, token, expiresAt, req, transaction }) {
  const { userAgent, ip } = describeClient(req);

  await sequelize.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip)
     VALUES ($1::uuid, $2::text, $3::timestamptz, $4::text, $5::text)`,
    {
      bind: [userId, hashToken(token), expiresAt, userAgent, ip],
      type: QueryTypes.INSERT,
      transaction,
    }
  );
}

/**
 * Consumes a refresh token and reports whether it was legitimately live.
 *
 * Single atomic UPDATE: the WHERE clause is the validity check and the SET is
 * the consumption, so two concurrent refreshes with the same token cannot both
 * win — the second matches zero rows and is treated as reuse.
 *
 * @returns {Promise<{ ok: true, userId: string }
 *                 | { ok: false, reason: "UNKNOWN"|"REUSED"|"REVOKED"|"EXPIRED",
 *                     revokedReason?: string }>}
 */
export async function consumeRefreshToken(token) {
  const tokenHash = hashToken(token);

  const [consumed] = await sequelize.query(
    `UPDATE refresh_tokens
        SET revoked_at     = NOW(),
            revoked_reason = 'rotated',
            last_used_at   = NOW()
      WHERE token_hash = $1::text
        AND revoked_at IS NULL
        AND expires_at > NOW()
      RETURNING user_id`,
    { bind: [tokenHash], type: QueryTypes.SELECT }
  );

  if (consumed) return { ok: true, userId: consumed.user_id };

  // Nothing was consumed. Find out why, because "already revoked" is a
  // security event and the other cases are ordinary.
  // revoked_reason is part of the SELECT because the branch below turns on it:
  // only a 'rotated' token is evidence of theft. Omitting it made every
  // revoked token read as undefined and take the benign branch, so reuse
  // detection never fired at all.
  const [row] = await sequelize.query(
    `SELECT user_id, revoked_at, revoked_reason, expires_at
       FROM refresh_tokens WHERE token_hash = $1::text`,
    { bind: [tokenHash], type: QueryTypes.SELECT }
  );

  if (!row) return { ok: false, reason: "UNKNOWN" };

  if (row.revoked_at) {
    // ── Only a ROTATED token is evidence of theft ──────────────────────────
    // Rotation makes a token single-use, so seeing a rotated one again means
    // two parties hold the same token: the legitimate client replaying, or an
    // attacker with a stolen copy. We cannot tell which, so we assume the
    // expensive-to-be-wrong-about one and end every session.
    //
    // Every OTHER revocation reason is an action we ourselves took. A device
    // signed out by a logout elsewhere, or by a password change, will present
    // its dead token exactly once on its next refresh — that is the expected
    // behaviour of a client that has not noticed yet, not an attack.
    //
    // Escalating those was actively harmful, and the session test caught it:
    // changing your password signs out your other devices, the first of those
    // devices then refreshes, that gets read as theft, and the whole family is
    // revoked — including the brand-new session belonging to the person who
    // just changed their password. Locking out the user for doing the secure
    // thing is the opposite of what this mechanism is for.
    if (row.revoked_reason === "rotated") {
      await revokeAllForUser(row.user_id, "reuse_detected");
      return { ok: false, reason: "REUSED" };
    }

    return { ok: false, reason: "REVOKED", revokedReason: row.revoked_reason };
  }

  return { ok: false, reason: "EXPIRED" };
}

/** Revokes one session — the logout path. Safe to call with an unknown token. */
export async function revokeRefreshToken(token, reason = "logout") {
  await sequelize.query(
    `UPDATE refresh_tokens
        SET revoked_at = NOW(), revoked_reason = $2::text
      WHERE token_hash = $1::text AND revoked_at IS NULL`,
    { bind: [hashToken(token), reason], type: QueryTypes.UPDATE }
  );
}

/**
 * Revokes every live session for a user.
 *
 * This is what a password change must call. Without it, changing your password
 * — the thing people do precisely because they believe they are compromised —
 * left every existing refresh token working for its remaining lifetime.
 */
export async function revokeAllForUser(userId, reason = "password_change") {
  const rows = await sequelize.query(
    `UPDATE refresh_tokens
        SET revoked_at = NOW(), revoked_reason = $2::text
      WHERE user_id = $1::uuid AND revoked_at IS NULL
      RETURNING id`,
    { bind: [userId, reason], type: QueryTypes.SELECT }
  );
  return rows.length;
}

/** Live session count — used by tests and a future sessions screen. */
export async function countLiveSessions(userId) {
  const [row] = await sequelize.query(
    `SELECT COUNT(*)::int AS n FROM refresh_tokens
      WHERE user_id = $1::uuid AND revoked_at IS NULL AND expires_at > NOW()`,
    { bind: [userId], type: QueryTypes.SELECT }
  );
  return row?.n ?? 0;
}

/**
 * Deletes rows that can no longer authenticate anything.
 *
 * Revoked rows are kept for a grace window rather than deleted immediately:
 * they are what makes reuse detection possible, since a hash with no row at
 * all is indistinguishable from a forged token.
 */
export async function pruneExpiredTokens({ retentionDays = 30 } = {}) {
  const rows = await sequelize.query(
    `DELETE FROM refresh_tokens
      WHERE expires_at < NOW() - ($1 || ' days')::interval
         OR (revoked_at IS NOT NULL AND revoked_at < NOW() - ($1 || ' days')::interval)
      RETURNING id`,
    { bind: [String(retentionDays)], type: QueryTypes.SELECT }
  );
  return rows.length;
}
