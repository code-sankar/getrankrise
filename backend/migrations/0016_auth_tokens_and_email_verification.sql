-- ============================================================================
-- 0016 — Self-service password reset, and email verification.
--
-- ── What was missing ────────────────────────────────────────────────────────
-- There was no way to recover an account. `changePassword` requires the
-- CURRENT password, so a user who forgot theirs was locked out permanently
-- with no path back that did not involve someone running SQL by hand. For a
-- paid product that is not a missing nicety, it is a churn event on the first
-- forgotten password.
--
-- Nothing verified that the address on an account could receive mail, either.
-- The owner's email is where urgent-review alerts and every billing message
-- go, so an unverified typo means those land nowhere, silently, forever.
--
-- ── One table, two purposes ─────────────────────────────────────────────────
-- Password reset and email verification are the same object: a single-use,
-- short-lived, emailed secret that authorises exactly one action. Same
-- issuance, same hashing, same expiry rules, same consumption semantics, same
-- pruning. Splitting them into two tables would duplicate all of that and
-- guarantee the two copies drift. `purpose` is what differs, so `purpose` is
-- a column.
--
-- Invitations are NOT in here — they carry a clinic, a role and an inviter,
-- and they can be accepted by someone who does not have an account yet, so
-- they are not "a token for a user". They get their own table in 0017.
--
-- ── token_hash, never the token ─────────────────────────────────────────────
-- Same reasoning as refresh_tokens (0014): a database dump must not hand the
-- attacker working reset links. SHA-256 rather than bcrypt because the value
-- is 256 bits of CSPRNG output, not a guessable human password — there is
-- nothing to brute force, and we get a cheap index probe instead.
--
-- ── At most one live token per (user, purpose) ──────────────────────────────
-- The partial unique index below is load-bearing, not tidiness. Without it,
-- clicking "email me a reset link" five times leaves FIVE working links in
-- five separate emails, each valid for the full window — five chances for one
-- to be read out of an inbox someone else has access to. With it, issuing is
-- an ON CONFLICT upsert that overwrites the hash, so a new link atomically
-- kills the previous one and only the most recent email ever works.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'auth_token_purpose_enum') THEN
    CREATE TYPE auth_token_purpose_enum AS ENUM ('password_reset', 'email_verification');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS auth_tokens (
  id           UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID                    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose      auth_token_purpose_enum NOT NULL,

  -- SHA-256 hex of the emailed secret. UNIQUE so lookup is one index probe and
  -- a collision is impossible.
  token_hash   CHAR(64)                NOT NULL UNIQUE,

  created_at   TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ             NOT NULL,

  -- Set the moment the token is spent. Single-use is enforced by the UPDATE in
  -- consumeAuthToken having `consumed_at IS NULL` in its WHERE clause, so the
  -- check and the spend are one statement and two concurrent redemptions
  -- cannot both win — the same discipline as consumeRefreshToken.
  consumed_at  TIMESTAMPTZ,

  -- Who asked. Best-effort label for abuse investigation, not an identifier.
  requested_ip VARCHAR(64)
);

-- The uniqueness that makes issuing an atomic "invalidate the old link".
-- Partial on consumed_at IS NULL so spent tokens accumulate for the audit
-- trail without blocking the next request.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_auth_token_live
  ON auth_tokens (user_id, purpose)
  WHERE consumed_at IS NULL;

-- Supports the expiry sweep.
CREATE INDEX IF NOT EXISTS idx_auth_tokens_expires
  ON auth_tokens (expires_at);

COMMENT ON TABLE auth_tokens IS
  'Single-use emailed secrets for password reset and email verification. The token itself is never stored — only its SHA-256.';
COMMENT ON COLUMN auth_tokens.consumed_at IS
  'When the token was spent. NULL = still live. Set in the same UPDATE that validates it, so a token cannot be redeemed twice.';

-- ── Email verification state on the user ────────────────────────────────────
-- A timestamp rather than a boolean: "verified" and "verified at 09:14 on the
-- 3rd" cost the same to store, and the second one can answer a support
-- question. NULL means unverified.
--
-- users is a CORE table (sequelize.sync owns its CREATE), so this column is
-- declared on the User model too. sync() runs BEFORE migrations and does not
-- ALTER, which is why both are needed: on a fresh database the model creates
-- the column and this ADD is a no-op; on an existing one this ADD is what
-- actually puts it there.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- ── Grandfather every account that already exists ───────────────────────────
-- Enforcement (requireVerifiedEmail) gates sending. Rolling that out against a
-- live database with this column NULL everywhere would lock every existing
-- customer out of the paid feature they are already using, over a check they
-- had no way to satisfy before this deploy shipped. Verification applies to
-- accounts created from here on.
UPDATE users
   SET email_verified_at = NOW()
 WHERE email_verified_at IS NULL;

COMMENT ON COLUMN users.email_verified_at IS
  'When this address was confirmed by clicking an emailed link. NULL = unverified; requireVerifiedEmail blocks outbound sends for those accounts. Backfilled to NOW() in 0016 for accounts predating verification.';
