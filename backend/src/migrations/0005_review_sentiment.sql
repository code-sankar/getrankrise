-- ============================================================================
-- 0005_review_sentiment.sql
--
-- Adds per-review sentiment (0–100, same scale as competitor_snapshots) and
-- backfills existing rows from the rating heuristic.
--
-- The audit line this answers: "you compute sentiment for competitors but
-- never for yourself" — the competitor comparison table showed THEIR
-- sentiment next to a hardcoded number for the clinic's own.
--
-- The CASE mapping below is the SQL twin of computeSentiment() in
-- src/utils/sentiment.js. THEY MUST STAY IDENTICAL — see that file for why.
--
-- IF NOT EXISTS on the column: on a FRESH database, sequelize.sync() creates
-- the reviews table from the model (which now declares sentiment), so the
-- column already exists when this migration runs and ADD COLUMN becomes a
-- no-op. On an EXISTING database, sync({alter:false}) never adds columns, so
-- this migration is the only thing that will.
-- ============================================================================

ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS sentiment SMALLINT
  CHECK (sentiment IS NULL OR (sentiment >= 0 AND sentiment <= 100));

COMMENT ON COLUMN reviews.sentiment IS
  '0-100 sentiment score. v1: rating heuristic (utils/sentiment.js). NULL rows fall back to the same heuristic at read time.';

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Only NULL rows: safe to re-run, and a future AI-scored value is never
-- clobbered back to the heuristic.
UPDATE reviews
   SET sentiment = CASE rating
                     WHEN 1 THEN 10
                     WHEN 2 THEN 30
                     WHEN 3 THEN 55
                     WHEN 4 THEN 80
                     WHEN 5 THEN 95
                     ELSE 55
                   END
 WHERE sentiment IS NULL;