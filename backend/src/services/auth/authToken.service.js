// backend/src/services/auth/authToken.service.js
//
// Issue and redeem the single-use emailed secrets behind password reset and
// email verification (migration 0016).
//
// Same shape as refreshToken.service.js and for the same reason: the token is
// the credential, the table is the revocation list, and validation happens in
// ONE statement so a token cannot be redeemed twice. Raw SQL rather than a
// model, because "check it is live, then mark it spent" as two statements lets
// two concurrent redemptions both pass the check — which for a password reset
// means a link that was already used still works.
//
// ── The threat this is shaped around ────────────────────────────────────────
// A reset link is a bearer credential that grants full account takeover. So:
//
//   * only the SHA-256 is stored — a database dump yields nothing usable
//   * 256 bits of CSPRNG output, base64url so it survives a URL intact
//   * one hour to live, not a day
//   * single-use, enforced by the UPDATE's WHERE clause
//   * issuing a new one atomically kills the previous one (the partial unique
//     index in 0016 turns issuance into an upsert)
//   * consumption is by token hash ALONE — never "find the user, then check
//     their token", which would let a caller probe which addresses exist

import crypto from "node:crypto";
import { QueryTypes } from "sequelize";
import { sequelize } from "../../config/db.js";
import { hashToken } from "./refreshToken.service.js";

/** How long each kind of link stays usable. */
export const TOKEN_TTL_MINUTES = Object.freeze({
  // Short on purpose. A reset link is full account takeover, and the user is
  // by definition sitting at their inbox when they request it.
  password_reset: 60,
  // Longer: someone may sign up, get distracted, and confirm the next morning.
  // The link grants nothing except "this address is real".
  email_verification: 60 * 24 * 3,
});

/**
 * A URL-safe secret with 256 bits of entropy.
 *
 * base64url rather than hex: same entropy in 43 characters instead of 64, and
 * no percent-encoding when it goes in a query string. Never store the return
 * value — hand it to the mailer and forget it.
 */
export const generateToken = () => crypto.randomBytes(32).toString("base64url");

/**
 * Issues a token, invalidating any live one for the same (user, purpose).
 *
 * The ON CONFLICT arm is the invalidation: it targets the partial unique index
 * `uniq_auth_token_live`, so a second request overwrites the stored hash and
 * the link in the first email stops working immediately. Doing this as
 * DELETE-then-INSERT would leave a window in which the user has zero valid
 * tokens, and a race in which two concurrent requests both delete and both
 * insert.
 *
 * @returns {Promise<{ token: string, expiresAt: Date }>} the RAW token — this
 *          is the only moment it exists in plaintext anywhere.
 */
export async function issueAuthToken({ userId, purpose, ip = null, transaction }) {
  if (!TOKEN_TTL_MINUTES[purpose]) {
    throw new Error(`Unknown auth token purpose: ${purpose}`);
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES[purpose] * 60_000);

  await sequelize.query(
    `INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at, requested_ip)
     VALUES ($1::uuid, $2::auth_token_purpose_enum, $3::char(64), $4::timestamptz, $5::text)
     ON CONFLICT (user_id, purpose) WHERE consumed_at IS NULL
     DO UPDATE SET token_hash   = EXCLUDED.token_hash,
                   expires_at   = EXCLUDED.expires_at,
                   created_at   = NOW(),
                   requested_ip = EXCLUDED.requested_ip`,
    {
      bind: [userId, purpose, hashToken(token), expiresAt, ip],
      type: QueryTypes.INSERT,
      transaction,
    }
  );

  return { token, expiresAt };
}

/**
 * Redeems a token. One statement: the WHERE clause is the validity check and
 * the SET is the spend, so a link cannot be used twice even under a double
 * click that fires two requests.
 *
 * `purpose` is part of the WHERE, not merely read back, so a verification
 * token can never be presented to the reset endpoint and vice versa.
 *
 * @returns {Promise<{ ok: true, userId: string }
 *                 | { ok: false, reason: "INVALID"|"USED"|"EXPIRED" }>}
 */
export async function consumeAuthToken({ token, purpose, transaction }) {
  if (!token || typeof token !== "string") return { ok: false, reason: "INVALID" };

  const tokenHash = hashToken(token);

  const [consumed] = await sequelize.query(
    `UPDATE auth_tokens
        SET consumed_at = NOW()
      WHERE token_hash = $1::char(64)
        AND purpose    = $2::auth_token_purpose_enum
        AND consumed_at IS NULL
        AND expires_at > NOW()
      RETURNING user_id`,
    { bind: [tokenHash, purpose], type: QueryTypes.SELECT, transaction }
  );

  if (consumed) return { ok: true, userId: consumed.user_id };

  // Nothing was spent. Distinguish why — the three cases deserve different
  // sentences to the user ("that link has already been used" vs "that link has
  // expired" vs a generic failure), and only this query can tell them apart.
  const [row] = await sequelize.query(
    `SELECT consumed_at, expires_at FROM auth_tokens
      WHERE token_hash = $1::char(64) AND purpose = $2::auth_token_purpose_enum`,
    { bind: [tokenHash, purpose], type: QueryTypes.SELECT, transaction }
  );

  if (!row) return { ok: false, reason: "INVALID" };
  if (row.consumed_at) return { ok: false, reason: "USED" };
  return { ok: false, reason: "EXPIRED" };
}

/**
 * Drops every live token of a purpose for a user, without redeeming one.
 *
 * Called after a successful password change: any reset link still sitting in
 * an inbox must stop working, because the whole point of changing a password
 * is to invalidate what an attacker might be holding.
 */
export async function revokeAuthTokens({ userId, purpose, transaction }) {
  const rows = await sequelize.query(
    `UPDATE auth_tokens
        SET consumed_at = NOW()
      WHERE user_id = $1::uuid
        AND purpose = $2::auth_token_purpose_enum
        AND consumed_at IS NULL
      RETURNING id`,
    { bind: [userId, purpose], type: QueryTypes.SELECT, transaction }
  );
  return rows.length;
}

/**
 * Deletes rows that can no longer authorise anything.
 *
 * Unlike refresh tokens there is no reuse-detection reason to keep spent rows
 * around long-term, but a short retention window makes "did they ever actually
 * click the link?" answerable in a support conversation.
 */
export async function pruneAuthTokens({ retentionDays = 7 } = {}) {
  const rows = await sequelize.query(
    `DELETE FROM auth_tokens
      WHERE expires_at < NOW() - ($1 || ' days')::interval
         OR (consumed_at IS NOT NULL AND consumed_at < NOW() - ($1 || ' days')::interval)
      RETURNING id`,
    { bind: [String(retentionDays)], type: QueryTypes.SELECT }
  );
  return rows.length;
}
