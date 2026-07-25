-- ============================================================================
-- 0003_reviews_external_id_unique_index.sql
--
-- Makes the review de-duplication guarantee explicit.
--
-- WHY THIS EXISTS
-- models/Review.js declares its unique index like this:
--
--     {
--       unique: true,
--       fields: ["clinic_id", "external_id", "platform"],
--       where: { external_id: { [Symbol.for("ne")]: null } },
--     }
--
-- That reaches for Sequelize's operator symbol by rebuilding it with
-- Symbol.for() instead of importing Op — it depends on a Sequelize internal
-- that is not part of the public API, and on sync() correctly translating
-- `!= null` into `IS NOT NULL` (a plain `!= NULL` in SQL is never true, which
-- would silently produce an index covering ZERO rows).
--
-- This index is the ONLY thing standing between the Phase 2 ingestion pipeline
-- and duplicate reviews multiplying on every sync. It is far too important to
-- leave resting on an inference. So: declare it in SQL, where you can read
-- exactly what Postgres will enforce.
--
-- ACTION REQUIRED alongside this migration:
-- delete the `unique: true` index entry from the `indexes` array in
-- models/Review.js (keep the clinic_id / platform / rating ones). Leaving it
-- there is harmless with alter:false but will conflict if anyone ever flips
-- DB_SYNC_ALTER=true.
--
-- SAFE TO RUN NOW: the reviews table has no ingested rows yet (nothing writes
-- external_id), so no CONCURRENTLY is needed and no duplicate-key failure is
-- possible. Once ingestion is live and this table is large, a future index
-- would need `-- umzug:no-transaction` plus CREATE INDEX CONCURRENTLY.
-- ============================================================================

-- Drop whatever sync() may have created under its generated name, so this
-- migration owns the constraint outright rather than sitting beside a rival.
DROP INDEX IF EXISTS reviews_clinic_id_external_id_platform;

-- The real thing.
--
-- Partial (WHERE external_id IS NOT NULL) because manually-created reviews and
-- any row whose platform did not return a stable ID have external_id NULL, and
-- in Postgres every NULL is distinct — so those rows must be excluded or they
-- would each occupy a slot and defeat the point.
--
-- Column order (clinic_id, platform, external_id) is deliberate: it puts the
-- highest-selectivity tenant key first, which lets the same index serve
-- "all reviews for this clinic on this platform" lookups during sync.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_reviews_clinic_platform_external
  ON reviews (clinic_id, platform, external_id)
  WHERE external_id IS NOT NULL;

-- Supports the default review feed ordering (newest first, per clinic) that
-- review.controller.js listReviews already issues:
--     ORDER BY review_date DESC, created_at DESC
CREATE INDEX IF NOT EXISTS idx_reviews_clinic_review_date
  ON reviews (clinic_id, review_date DESC NULLS LAST);