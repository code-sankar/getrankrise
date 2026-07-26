-- ============================================================================
-- 0008_platform_connections_sync_columns.sql
--
-- Adds the two columns reviewSync.service.js already writes but 0004 never
-- created:
--
--   last_synced_at   stamped after every successful sync (manual endpoint
--                    stamps it itself; the Phase 3 scheduler will stamp its
--                    own claims). Read by the incremental early-stop logic
--                    (pages older than last_synced_at - 24h buffer are
--                    skipped) and by the scheduler's "is this connection
--                    due?" query.
--   last_sync_error  last failure message, nulled on success. Distinct from
--                    0004's last_error, which tracks OAuth/token failures —
--                    "your Google connection is broken" and "your last sync
--                    failed" are different problems with different fixes,
--                    and the Settings UI should be able to say which.
--
-- WHY THIS EXISTS: without these columns the very first
--     UPDATE platform_connections SET last_synced_at = NOW(), ...
-- in syncClinicReviews() dies with 42703 "column does not exist" — the
-- Sequelize-model-vs-migration drift class of bug (same family as the
-- countryCode column that silently dropped SMS routing values, except this
-- one fails loudly because it's raw SQL, not a model attribute Sequelize
-- would quietly ignore).
--
-- ACTION REQUIRED alongside this migration: models/PlatformConnection.js
-- gains the matching lastSyncedAt / lastSyncError fields (shipped together
-- with this file). Model and migration land in the same commit or not at all.
--
-- No BEGIN/COMMIT — src/db/migrator.js wraps every file in one transaction.
-- Idempotent (ADD COLUMN IF NOT EXISTS) as cheap insurance against a
-- half-applied deploy, per the migrator's conventions.
-- ============================================================================

ALTER TABLE platform_connections
  ADD COLUMN IF NOT EXISTS last_synced_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_sync_error TEXT;

-- ── Scheduler due-query index (Phase 3 groundwork) ──────────────────────────
-- The sync scheduler's core query will be, in essence:
--
--     SELECT ... FROM platform_connections pc
--      JOIN clinics c ON c.id = pc.clinic_id
--     WHERE pc.status = 'connected'
--       AND (pc.last_synced_at IS NULL
--            OR pc.last_synced_at < NOW() - (plan interval))
--     ORDER BY pc.last_synced_at ASC NULLS FIRST
--     FOR UPDATE SKIP LOCKED LIMIT n
--
-- Partial on status='connected' (the only rows the scheduler ever considers),
-- ordered NULLS FIRST so never-synced connections are claimed before
-- recently-synced ones. Harmless while the scheduler doesn't exist yet;
-- load-bearing the day it does.
CREATE INDEX IF NOT EXISTS idx_platform_conn_sync_due
  ON platform_connections (last_synced_at ASC NULLS FIRST)
  WHERE status = 'connected';