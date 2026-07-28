-- ============================================================================
-- 0009_reviews_reply_publish_columns.sql
--
-- Phase 8 (reply publishing) bookkeeping:
--
--   reply_published_at   set when a reply was successfully pushed to Google
--                        (GBP v4 reviews.updateReply). NULL = not published:
--                        either publishing failed/was deferred, or the row
--                        predates Phase 8, or the reply was IMPORTED from
--                        Google in the first place (see backfill note).
--   reply_publish_error  why the last publish attempt failed, nulled on
--                        success. Lets the UI distinguish "replied ✓ on
--                        Google" / "reply saved, publishing pending" /
--                        "publish failed: reconnect Google".
--
-- IF NOT EXISTS on both columns: on a FRESH database sequelize.sync() creates
-- the reviews table from the model (which now declares both fields), so ADD
-- COLUMN no-ops. On an EXISTING database sync({alter:false}) never adds
-- columns, so this migration is the only thing that will. (Same pattern as
-- 0005's sentiment column — see that file.)
--
-- BACKFILL: deliberately none. Rows where the reply text was imported FROM
-- Google during sync are already live on Google, but the schema cannot
-- distinguish an imported reply from a pre-Phase-8 local one, so guessing a
-- reply_published_at would manufacture false certainty. NULL means "unknown /
-- pre-Phase-8", and the UI should treat replied=true + NULL published as
-- simply "replied" with no Google badge either way. Every reply posted
-- through the app from this migration forward gets an accurate value.
--
-- No BEGIN/COMMIT — src/db/migrator.js wraps every file in one transaction.
-- ============================================================================

ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS reply_published_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reply_publish_error TEXT;

COMMENT ON COLUMN reviews.reply_published_at IS
  'When the reply was successfully published to the source platform (GBP v4 updateReply). NULL = unpublished, unknown, or imported.';

COMMENT ON COLUMN reviews.reply_publish_error IS
  'Last publish failure message; NULL on success. Drives the "publish pending/failed" badge.';