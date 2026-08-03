-- ============================================================================
-- 0010_platform_connections_initial_sync.sql
--
-- ⚠ RENUMBER IF NEEDED: `ls backend/migrations` before applying. This assumes
-- 0009 (reply publishing columns) is the current highest. Ordering is
-- lexicographic, so a collision would be silent-ish and annoying.
--
-- Adds the two columns that make a ONE-TIME initial sync possible on every
-- plan, including Free.
--
-- ── THE PROBLEM THIS SOLVES ─────────────────────────────────────────────────
-- config/plans.js gives the Free tier syncIntervalHours: null (no automatic
-- sync) AND reviewSyncsPerDay: 0 (manual button returns 403 UPGRADE_REQUIRED).
-- Both are correct in isolation. Together they mean a Free clinic that
-- connects Google can never ingest a single review, by any route, ever. Their
-- dashboard is permanently empty, the "20 stored historical reviews" the
-- pricing page promises is unreachable, and the free-tier trim — the code that
-- enforces that promise — has no production caller at all (which is why
-- scripts/test-freetier-trim.js has to invoke the service layer directly to
-- test it).
--
-- Free is meant to be a view-only tier, not an empty one. It needs exactly one
-- sync: the backfill that fills the 20-row window. After that the window is a
-- frozen snapshot, and upgrading is what makes it live again — which is the
-- actual conversion surface the tier was designed around.
--
--   initial_sync_at        set the first time a connection syncs SUCCESSFULLY.
--                          NULL = the backfill still owes this connection.
--                          This is the flag, not last_synced_at — see below.
--   initial_sync_attempts  bounded retry counter. Without it, a connection
--                          whose first sync fails (GBP quota 0, revoked grant,
--                          Yelp key missing) would either retry forever on
--                          every tick or — on Free, which has no recurring
--                          cadence to fall back on — never retry at all and
--                          sit empty permanently.
--
-- ── WHY NOT JUST USE last_synced_at IS NULL ─────────────────────────────────
-- Because the scheduler stamps last_synced_at BEFORE running the sync
-- (claim-by-stamping — the stamp IS the claim). One tick after a connection is
-- claimed, last_synced_at is non-NULL whether the sync succeeded, threw, or
-- the worker died mid-pagination. It answers "has this been claimed?", not
-- "has this ever produced data?". The Free tier's whole ingestion story hangs
-- on the second question, so it gets its own column.
--
-- No BEGIN/COMMIT — src/db/migrator.js wraps every file in one transaction.
-- Idempotent, per the migrator's conventions.
-- ============================================================================

ALTER TABLE platform_connections
  ADD COLUMN IF NOT EXISTS initial_sync_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS initial_sync_attempts SMALLINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN platform_connections.initial_sync_at IS
  'First SUCCESSFUL sync. NULL = one-time backfill still pending (runs on every plan, including free).';
COMMENT ON COLUMN platform_connections.initial_sync_attempts IS
  'Bounded retry counter for the initial backfill. Stops a permanently-broken connection from being claimed every retry window forever.';

-- ── Backfill for existing rows ──────────────────────────────────────────────
-- Any connection that already has a last_synced_at has, in practice, already
-- had its first sync (it was on a paid plan and the recurring cadence ran, or
-- someone pressed the manual button). Marking those as initially-synced keeps
-- them out of the new due-branch entirely.
--
-- Connections with last_synced_at IS NULL are left NULL on purpose: those are
-- exactly the Free-tier connections that have been sitting idle since the day
-- they were connected, and they are the ones this whole migration is for. They
-- will be claimed by the next scheduler tick.
UPDATE platform_connections
   SET initial_sync_at = last_synced_at
 WHERE initial_sync_at IS NULL
   AND last_synced_at IS NOT NULL;

-- ── Index for the new due-branch ────────────────────────────────────────────
-- The recurring branch rides idx_platform_conn_sync_due (migration 0008).
-- This is its one-time twin: a much smaller partial index, since a connection
-- leaves it permanently after its first successful sync. Ordered NULLS FIRST
-- to match the claim query's ORDER BY.
CREATE INDEX IF NOT EXISTS idx_platform_conn_initial_sync_pending
  ON platform_connections (last_synced_at ASC NULLS FIRST)
  WHERE status = 'connected' AND initial_sync_at IS NULL;