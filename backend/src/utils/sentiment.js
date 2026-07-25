// backend/src/utils/sentiment.js
//
// Per-review sentiment scoring, 0–100 — the same scale CompetitorSnapshot
// already uses, so "you vs them" comparisons are apples-to-apples.
//
// v1 is a RATING-DERIVED HEURISTIC, and that's a deliberate scoping call:
// running every review through OpenAI costs real money per row, needs batch
// plumbing, and — for star-rated reviews — barely beats the star itself
// (a 1★ review is negative; the text rarely overturns that). The column plus
// this mapping gets the dashboard honest today, and upgrading later is a
// backfill job, not a schema change.
//
// The band mapping is chosen so the score lands in the label bands the UI
// already renders (85+ Excellent / 70+ Good / 50+ Fair / else Needs Work):
//
//     5★ → 95    clearly "Excellent" territory
//     4★ → 80    "Good"
//     3★ → 55    "Fair"
//     2★ → 30    "Needs Work"
//     1★ → 10    firmly negative
//
// THE ONE RULE: the JS map and the SQL expression below MUST stay identical.
// The JS runs at write time (Phase 2 ingestion, migration 0005's backfill uses
// the SQL twin); the SQL runs at read time as the COALESCE fallback for rows
// with NULL sentiment. If they diverge, the same review scores differently
// depending on whether its column was populated — a maddening class of bug.

const RATING_TO_SENTIMENT = Object.freeze({ 1: 10, 2: 30, 3: 55, 4: 80, 5: 95 });

/**
 * Write-time scoring. Phase 2's review ingestion calls this per row.
 * @param {number} rating 1–5
 * @param {string} [_text] reserved for a future text-aware model — accepted
 *        now so call sites don't change when the upgrade lands.
 * @returns {number} 0–100
 */
export function computeSentiment(rating, _text) {
  return RATING_TO_SENTIMENT[rating] ?? 55;
}

/**
 * The identical mapping as a SQL CASE expression, for read-time COALESCE
 * fallbacks and the migration backfill.
 * @param {string} col column reference, e.g. "r.rating"
 */
export const RATING_SENTIMENT_SQL = (col) =>
  `CASE ${col} WHEN 1 THEN 10 WHEN 2 THEN 30 WHEN 3 THEN 55 WHEN 4 THEN 80 WHEN 5 THEN 95 ELSE 55 END`;