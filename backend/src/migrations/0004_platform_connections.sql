-- ============================================================================
-- 0004_platform_connections.sql
--
-- One row per (clinic, platform) OAuth connection. This is where encrypted
-- Google/Facebook tokens live; Yelp has no OAuth (public Fusion API key) but
-- gets a row anyway so "which platforms are connected" is one query.
--
-- SECURITY MODEL
--   * refresh_token_enc / access_token_enc hold AES-256-GCM ciphertext
--     produced by src/utils/crypto.js. The database NEVER sees a plaintext
--     token; neither do logs, API responses, or Sequelize's default toJSON
--     (the model strips them).
--   * The encryption key (TOKEN_ENCRYPTION_KEY) lives only in the app's
--     environment. A dumped database alone cannot decrypt anything.
--
-- LIFECYCLE (status column)
--   pending_location  tokens stored, user hasn't picked which GBP location
--                     this clinic maps to yet
--   connected         location chosen, sync-ready
--   error             last refresh/API call failed (see last_error)
--   revoked           user disconnected, or Google invalidated the grant
--                     (invalid_grant on refresh). Tokens are nulled on revoke.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'platform_enum') THEN
    CREATE TYPE platform_enum AS ENUM ('google', 'yelp', 'facebook');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'connection_status_enum') THEN
    CREATE TYPE connection_status_enum AS ENUM
      ('pending_location', 'connected', 'error', 'revoked');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS platform_connections (
  id                       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id                UUID          NOT NULL
                                         REFERENCES clinics(id) ON DELETE CASCADE,
  platform                 platform_enum NOT NULL,
  status                   connection_status_enum NOT NULL DEFAULT 'pending_location',

  -- ── Encrypted OAuth material ────────────────────────────────────────────
  -- Format: base64("v1" || iv || authTag || ciphertext) — see crypto.js.
  -- access_token_enc is a cache; it expires (expires_at below) and is
  -- re-minted from the refresh token on demand. refresh_token_enc is the
  -- long-lived credential and the thing that actually needs protecting.
  refresh_token_enc        TEXT,
  access_token_enc         TEXT,
  access_token_expires_at  TIMESTAMPTZ,
  scopes                   TEXT,          -- space-separated, as Google returns them

  -- ── Identity on the remote platform ─────────────────────────────────────
  -- Google: account = accounts/{id} from Account Management v1,
  --         location = locations/{id} from Business Information v1.
  -- The location is what review sync reads from.
  external_account_id      VARCHAR(255),
  external_account_name    VARCHAR(255),  -- human label ("My Clinic Group")
  external_location_id     VARCHAR(255),
  external_location_name   VARCHAR(255),  -- human label ("Smile Dental, Thoubal")

  -- Google account email that granted consent — shown in settings so the user
  -- knows WHICH Google identity is wired up.
  connected_email          VARCHAR(255),

  -- ── Bookkeeping ─────────────────────────────────────────────────────────
  connected_at             TIMESTAMPTZ,
  last_refreshed_at        TIMESTAMPTZ,
  last_error               TEXT,

  created_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- One connection per platform per clinic. Reconnecting overwrites in place.
  CONSTRAINT uniq_platform_connection UNIQUE (clinic_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_platform_conn_clinic ON platform_connections(clinic_id);
CREATE INDEX IF NOT EXISTS idx_platform_conn_status ON platform_connections(status)
  WHERE status IN ('connected', 'error');

-- reuse the updated_at trigger function created in 0001
DROP TRIGGER IF EXISTS trg_platform_conn_set_updated_at ON platform_connections;
CREATE TRIGGER trg_platform_conn_set_updated_at
BEFORE UPDATE ON platform_connections
FOR EACH ROW EXECUTE FUNCTION set_updated_at();