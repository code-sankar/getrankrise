// frontend/src/utils/sentiment.test.js
//
// Pins the rating → sentiment mapping and the Dashboard's aggregate.
//
// ── WHY THE NUMBERS ARE WRITTEN OUT LITERALLY ───────────────────────────────
// This mapping now exists in three places: backend/src/utils/sentiment.js as a
// JS object, the RATING_SENTIMENT_SQL CASE expression beside it, and the copy
// in frontend/src/utils/sentiment.js. There is no shared module to import —
// the packages have no common code — so the only thing preventing a drift is a
// test that states the expected values rather than deriving them.
//
// Asserting `reviewSentiment({rating: 5}) === RATING_TO_SENTIMENT[5]` would
// pass no matter what the table said. These assert 95.
//
// ── THE BUG THIS GUARDS ─────────────────────────────────────────────────────
// The Dashboard used to compute "Sentiment" as the percentage of reviews rated
// 4★ or better, while Analytics rendered the backend's mean 0–100 score. Same
// label, same % sign, different measure: 56% and 70% on the same clinic at the
// same moment.

import { describe, test, expect } from "vitest";
import { reviewSentiment, meanSentiment, RATING_TO_SENTIMENT } from "./sentiment.js";

describe("reviewSentiment", () => {
  test("the rating heuristic matches the backend table exactly", () => {
    // Written out, not derived — see the header.
    expect(reviewSentiment({ rating: 1 })).toBe(10);
    expect(reviewSentiment({ rating: 2 })).toBe(30);
    expect(reviewSentiment({ rating: 3 })).toBe(55);
    expect(reviewSentiment({ rating: 4 })).toBe(80);
    expect(reviewSentiment({ rating: 5 })).toBe(95);
  });

  test("the exported table has exactly these five entries", () => {
    expect(RATING_TO_SENTIMENT).toEqual({ 1: 10, 2: 30, 3: 55, 4: 80, 5: 95 });
  });

  test("a stored score wins over the heuristic", () => {
    // Mirrors COALESCE(r.sentiment, CASE r.rating …): once the backend has
    // scored a row, that score is the answer even if it disagrees with the
    // star. A future text-aware model is exactly this case.
    expect(reviewSentiment({ rating: 5, sentiment: 20 })).toBe(20);
    expect(reviewSentiment({ rating: 1, sentiment: 90 })).toBe(90);
  });

  test("zero is a stored score, not a missing one", () => {
    // The trap in `sentiment || heuristic`: 0 is falsy, so the most negative
    // score possible would silently become the 5★ heuristic.
    expect(reviewSentiment({ rating: 5, sentiment: 0 })).toBe(0);
  });

  test("null, undefined and NaN fall back to the rating", () => {
    expect(reviewSentiment({ rating: 4, sentiment: null })).toBe(80);
    expect(reviewSentiment({ rating: 4, sentiment: undefined })).toBe(80);
    expect(reviewSentiment({ rating: 4, sentiment: NaN })).toBe(80);
  });

  test("an unknown or absent rating is neutral, never NaN", () => {
    expect(reviewSentiment({ rating: 0 })).toBe(55);
    expect(reviewSentiment({})).toBe(55);
    expect(reviewSentiment(undefined)).toBe(55);
  });
});

describe("meanSentiment", () => {
  test("averages and rounds", () => {
    // (95 + 30) / 2 = 62.5 → 63
    expect(meanSentiment([{ rating: 5 }, { rating: 2 }])).toBe(63);
  });

  test("an empty or missing list scores 0 rather than NaN", () => {
    // The backend returns `?? 0` for the same case; a NaN here would render
    // as "NaN%" in a stat card.
    expect(meanSentiment([])).toBe(0);
    expect(meanSentiment(undefined)).toBe(0);
    expect(meanSentiment(null)).toBe(0);
  });

  test("it is NOT the old measure — percentage of 4★+", () => {
    // Four 5★ and one 1★. The old Dashboard formula gave 80 (4 of 5 are 4★+).
    // The real mean is (95×4 + 10) / 5 = 78.
    const reviews = [{ rating: 5 }, { rating: 5 }, { rating: 5 }, { rating: 5 }, { rating: 1 }];
    expect(meanSentiment(reviews)).toBe(78);
    expect(meanSentiment(reviews)).not.toBe(80);
  });

  test("it agrees with a hand-computed backend AVG over stored scores", () => {
    // The shape the API actually returns: every row already scored.
    const reviews = [
      { rating: 2, sentiment: 30 },
      { rating: 3, sentiment: 55 },
      { rating: 5, sentiment: 95 },
      { rating: 4, sentiment: 80 },
    ];
    // (30 + 55 + 95 + 80) / 4 = 65
    expect(meanSentiment(reviews)).toBe(65);
  });
});
