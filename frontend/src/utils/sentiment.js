// frontend/src/utils/sentiment.js
//
// The rating → sentiment mapping, mirrored from backend/src/utils/sentiment.js.
//
// ── WHY A SECOND COPY EXISTS ────────────────────────────────────────────────
// The two packages share no code, and this mapping is needed on both sides:
// the backend scores at write time and aggregates in SQL, the Dashboard
// aggregates client-side over the reviews it already has. The alternative to
// duplicating it was an extra /analytics request on a page that already holds
// every row it needs.
//
// ── THE BUG THIS FIXES ──────────────────────────────────────────────────────
// The Dashboard used to compute its "Sentiment" pill as
//
//     % of reviews rated 4★ or better
//
// while the Analytics page rendered the backend's `sentimentScore`, the mean
// of per-review 0–100 scores. Two different measures, both labelled
// "Sentiment", both suffixed "%", two clicks apart. On real data they read 56%
// and 70% for the same clinic at the same moment — the kind of disagreement
// that makes a reporting product's numbers stop being believed.
//
// ── THE ONE RULE ────────────────────────────────────────────────────────────
// This table must stay identical to RATING_TO_SENTIMENT in
// backend/src/utils/sentiment.js and to RATING_SENTIMENT_SQL beside it. There
// are now THREE copies of these five numbers; they are pinned by tests on both
// sides, and utils/sentiment.test.js states the expected values literally so a
// drift shows up as a failure rather than as two pages quietly disagreeing.
const RATING_TO_SENTIMENT = Object.freeze({ 1: 10, 2: 30, 3: 55, 4: 80, 5: 95 });

/** Neutral fallback for a rating outside 1–5, matching the backend's `?? 55`. */
const NEUTRAL = 55;

/**
 * A single review's 0–100 score: the stored value when the backend has one,
 * otherwise the rating heuristic. Mirrors the SQL
 * `COALESCE(r.sentiment, CASE r.rating …)`.
 *
 * @param {{sentiment?: number|null, rating?: number}} review
 * @returns {number} 0–100
 */
export function reviewSentiment(review) {
  const stored = review?.sentiment;
  if (typeof stored === "number" && Number.isFinite(stored)) return stored;
  return RATING_TO_SENTIMENT[review?.rating] ?? NEUTRAL;
}

/**
 * Mean sentiment across a list, rounded — the number the Analytics page calls
 * `sentimentScore`. An empty list scores 0, matching the backend's `?? 0`
 * rather than producing NaN.
 *
 * @param {Array<{sentiment?: number|null, rating?: number}>} reviews
 * @returns {number} 0–100
 */
export function meanSentiment(reviews) {
  if (!Array.isArray(reviews) || reviews.length === 0) return 0;
  const sum = reviews.reduce((acc, r) => acc + reviewSentiment(r), 0);
  return Math.round(sum / reviews.length);
}

export { RATING_TO_SENTIMENT };
