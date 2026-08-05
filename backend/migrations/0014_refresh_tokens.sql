-- ============================================================================
-- 0014 — Per-device refresh tokens.
--
-- ── What was wrong with users.refresh_token ─────────────────────────────────
-- The whole session model was ONE column on the user row, holding the current
-- refresh JWT. Two consequences, both verified against a running server:
--
--   1. ONE SESSION PER ACCOUNT. Logging in issues a token and overwrites that
--      column, so the previous device's token no longer matches and
--      /auth/refresh-token 401s it. Sign in on your phone and your desktop is
--      silently signed out the moment its 15-minute access token expires. For
--      a clinic where the owner and the front desk share an account, that is
--      two people fighting over one session all day.
--
--   2. NO REVOCATION ON PASSWORD CHANGE. changePassword updated the hash and
--      left the column untouched, so a stolen refresh token stayed valid for
--      its full 7 days. Changing your password is the one action a user takes
--      *because* they think they are compromised, and it did nothing to the
--      session the attacker was holding.
--
-- ── What this table adds ────────────────────────────────────────────────────
-- One row per issued refresh token, so sessions are independent and each can
-- be revoked on its own. Logout revokes one row; changePassword revokes every
-- row for the user.
--
-- token_hash, not the token. A leaked database dump of the old column handed
-- the attacker working session tokens directly. SHA-256 is the right primitive
-- here rather than bcrypt: the value being hashed is 200+ bits of signed JWT,
-- not a guessable human password, so there is nothing for an attacker to brute
-- force and we get a cheap, constant-time-comparable lookup key instead.
--
-- ── Reuse detection ─────────────────────────────────────────────────────────
-- Rotation means a refresh token is single-use. If an ALREADY-REVOKED token is
-- presented, either the legitimate client replayed an old request or someone
-- is using a stolen copy — and the two are indistinguishable from here. The
-- service treats it as theft and revokes the user's whole family of tokens,
-- which logs everyone out once rather than letting an attacker ride a stolen
-- token indefinitely. revoked_reason records which of those happened.
-- ============================================================================

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- SHA-256 hex of the JWT. UNIQUE so a rotation collision is impossible and
  -- so lookup is a single index probe.
  token_hash     CHAR(64)     NOT NULL UNIQUE,

  issued_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ  NOT NULL,
  last_used_at   TIMESTAMPTZ,

  revoked_at     TIMESTAMPTZ,
  revoked_reason TEXT,

  -- Context for a future "your active sessions" screen. Best-effort and
  -- deliberately short: this is a label for a human, not an identifier.
  user_agent     VARCHAR(200),
  ip             VARCHAR(64)
);

-- The hot path: "find this user's live sessions". Partial, because a revoked
-- row is only ever read for forensics.
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_live
  ON refresh_tokens (user_id)
  WHERE revoked_at IS NULL;

-- Supports the expiry sweep.
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires
  ON refresh_tokens (expires_at);

COMMENT ON TABLE refresh_tokens IS
  'One row per issued refresh token. Replaces the single users.refresh_token column so sessions are per-device and individually revocable.';
COMMENT ON COLUMN refresh_tokens.token_hash IS
  'SHA-256 hex of the refresh JWT. The token itself is never stored.';
COMMENT ON COLUMN refresh_tokens.revoked_reason IS
  'rotated | logout | password_change | reuse_detected — why this token stopped being valid.';

-- The old column goes. Leaving it would be worse than useless: it would still
-- look like the source of truth to the next person reading the User model,
-- while nothing wrote to it. IF EXISTS because a database created after the
-- model change never had it.
ALTER TABLE users
  DROP COLUMN IF EXISTS refresh_token;
