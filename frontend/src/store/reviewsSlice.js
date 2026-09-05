/**
 * reviewsSlice.js — Phase 3 rewrite.
 *
 * What changed and why:
 *
 *   1. mockReviews is GONE. The slice starts empty and `hydrated` tracks
 *      whether a fetch has completed. Components use that to distinguish
 *      "loading" from "genuinely zero reviews" — previously impossible,
 *      because the mock list made the store look populated from frame one.
 *
 *   2. Normalisation lives HERE (normalizeReview), in one exported function.
 *      The backend speaks { reviewerName, reviewText, reviewDate, replyText };
 *      every component renders { name, text, date, replied }. One translation
 *      point, not five ad-hoc ones.
 *
 *   3. fetchReviewsSuccess takes the backend envelope
 *      { reviews, total, cappedByPlan } — NOT a bare array. The old hook
 *      dispatched the entire envelope into state.list, so the first real
 *      response would have crashed selectFilteredReviews (.filter on an
 *      object). Accepting the envelope here makes the contract explicit and
 *      lets us keep total/cappedByPlan for the free-tier banner.
 *
 *   4. selectReviewStats no longer divides by zero. With the mock list gone,
 *      total === 0 is the NORMAL state until Phase 2 ships — the old selector
 *      would have rendered "NaN" in three dashboard stat cards.
 */

import { createSlice, createSelector } from "@reduxjs/toolkit";
import { formatRelativeDate } from "../utils/formatRelativeDate.js";
import { meanSentiment } from "../utils/sentiment.js";

// ── Normalisation ─────────────────────────────────────────────────────────────
// Backend Review model → the shape every component renders. Tolerates already-
// normalised input (re-dispatch safety) by falling back field-by-field.
export const normalizeReview = (raw = {}) => ({
  id: raw.id,
  name: raw.reviewerName ?? raw.name ?? "Anonymous",
  rating: Number(raw.rating) || 0,
  text: raw.reviewText ?? raw.text ?? "",
  // Human string for display; keep the raw timestamp too so future sorting
  // doesn't have to parse "3 days ago".
  date: formatRelativeDate(raw.reviewDate ?? raw.rawDate ?? raw.createdAt),
  rawDate: raw.reviewDate ?? raw.rawDate ?? raw.createdAt ?? null,
  platform: raw.platform ?? "Google",
  replied: Boolean(raw.replied),
  replyText: raw.replyText ?? null,
  // The backend scores every review 0–100 at write time and the API returns
  // it. Dropping it here forced the Dashboard to invent its own sentiment
  // measure from `rating` alone, which is how it ended up disagreeing with
  // the Analytics page. Null is meaningful: reviewSentiment() falls back to
  // the rating heuristic exactly as the SQL COALESCE does.
  sentiment:
    typeof raw.sentiment === "number" && Number.isFinite(raw.sentiment)
      ? raw.sentiment
      : null,
});

const initialState = {
  list: [], // ← was mockReviews
  total: 0, // server-side count (may exceed list.length when capped/paginated)
  cappedByPlan: false, // free tier hit its 20-review ceiling
  hydrated: false, // true once any fetch has settled (success OR failure)
  loading: false,
  error: null,
  filters: {
    platform: "All", // "All" | "Google" | "Yelp" | "Facebook"
    rating: "All", // "All" | "1" | "2" | "3" | "4" | "5"
    status: "All", // "All" | "Unanswered" | "Answered"
  },
};

const reviewsSlice = createSlice({
  name: "reviews",
  initialState,
  reducers: {
    fetchReviewsStart(state) {
      state.loading = true;
      state.error = null;
    },

    // payload: the backend envelope { reviews, total, cappedByPlan } plus the
    // hook's { append, offset } (the hook normalises each review first).
    //
    // `append` supports "Load more". De-duplication by id is not decoration:
    // rows are ordered by review_date, so a sync landing between two page
    // fetches shifts the window and can return a row the previous page already
    // held. Without the guard that row renders twice and React warns on the
    // duplicate key.
    fetchReviewsSuccess(state, action) {
      const {
        reviews = [],
        total = 0,
        cappedByPlan = false,
        append = false,
      } = action.payload || {};

      if (append) {
        const seen = new Set(state.list.map((r) => r.id));
        state.list = state.list.concat(reviews.filter((r) => !seen.has(r.id)));
      } else {
        state.list = reviews;
      }

      state.total = total;
      state.cappedByPlan = Boolean(cappedByPlan);
      state.loading = false;
      state.hydrated = true;
    },

    fetchReviewsFailure(state, action) {
      state.loading = false;
      state.error = action.payload;
      state.hydrated = true;
      // Deliberately NOT clearing state.list: on a transient refetch failure,
      // stale-but-real data beats a flash to empty.
    },

    markReplied(state, action) {
      const review = state.list.find((r) => r.id === action.payload);
      if (review) review.replied = true;
    },

    setFilter(state, action) {
      const { key, value } = action.payload;
      state.filters[key] = value;
    },

    clearFilters(state) {
      state.filters = { platform: "All", rating: "All", status: "All" };
    },

    // On logout — prevents the next user briefly seeing the previous
    // clinic's reviews out of the persisted store.
    resetReviews() {
      return initialState;
    },
  },
});

export const {
  fetchReviewsStart,
  fetchReviewsSuccess,
  fetchReviewsFailure,
  markReplied,
  setFilter,
  clearFilters,
  resetReviews,
} = reviewsSlice.actions;

// ── Selectors ────────────────────────────────────────────────────────────────
//
// The two derived selectors below are memoized with createSelector because
// both build a NEW array/object on every call. Unmemoized, they returned a
// fresh reference each time useSelector ran, so every component reading them
// re-rendered on ANY store change — a notification arriving re-rendered the
// whole review list. React-Redux detects this and logged it on every Dashboard
// load: "Selector selectFilteredReviews returned a different result when
// called with the same parameters."
//
// The input selectors are the cheap ones (plain property reads). createSelector
// only re-runs the expensive body when one of those identities actually
// changes, so filtering 136 rows now happens when the list or the filters
// change rather than on every dispatch.

const selectReviewsList = (state) => state.reviews.list;
const selectReviewFilters = (state) => state.reviews.filters;

export const selectFilteredReviews = createSelector(
  [selectReviewsList, selectReviewFilters],
  (list, filters) =>
    list.filter((r) => {
      if (filters.platform !== "All" && r.platform !== filters.platform) return false;
      if (filters.rating !== "All" && r.rating !== parseInt(filters.rating, 10)) return false;
      if (filters.status === "Unanswered" && r.replied) return false;
      if (filters.status === "Answered" && !r.replied) return false;
      return true;
    })
);

/**
 * Dashboard stat pills. Guarded: total === 0 is the normal pre-ingestion state
 * and must render as em-dashes, not NaN.
 *
 *   avg           "4.2" | "—"
 *   coverage      0–100 (% replied)
 *   sentiment     0–100 mean review sentiment — the SAME measure the
 *                 Analytics page calls sentimentScore. See utils/sentiment.js.
 *   total         list length, for "n reviews" captions
 *   distribution  [5★,4★,3★,2★,1★] counts — drives the Avg Rating mini-chart,
 *                 which was five hardcoded percentages until Step 2
 *   newThisMonth  reviews dated in the last 30 days, replacing the literal
 *                 string "14" the New Reviews card used to render
 *
 * Memoized: this returns a fresh object every call, so an unmemoized version
 * re-rendered all four StatCards on every unrelated dispatch.
 */
export const selectReviewStats = createSelector([selectReviewsList], (list) => {
  const total = list.length;

  if (total === 0) {
    return {
      avg: "—",
      coverage: 0,
      sentiment: 0,
      total: 0,
      distribution: [0, 0, 0, 0, 0],
      newThisMonth: 0,
      empty: true,
    };
  }

  // Index 0 = 5★ … index 4 = 1★, matching the chart's colour order.
  const distribution = [0, 0, 0, 0, 0];
  for (const r of list) {
    const i = 5 - r.rating;
    if (i >= 0 && i < 5) distribution[i]++;
  }

  // rawDate is the ISO timestamp normalizeReview keeps alongside the human
  // "3 days ago" string, precisely so derivations like this don't have to
  // parse prose. Rows with a null/unparseable rawDate simply don't count.
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const newThisMonth = list.filter((r) => {
    const t = r.rawDate ? Date.parse(r.rawDate) : NaN;
    return !Number.isNaN(t) && t >= cutoff;
  }).length;

  return {
    avg: (list.reduce((s, r) => s + r.rating, 0) / total).toFixed(1),
    coverage: Math.round((list.filter((r) => r.replied).length / total) * 100),
    // The SAME definition the backend uses for `summaryStats.sentimentScore`,
    // not a second one. This was `% of reviews rated 4★+`, which is a
    // different measure that happened to share the label and the % sign — on
    // real data the Dashboard read 56% while Analytics read 70% for the same
    // clinic. The two still legitimately differ in SCOPE (this covers the
    // loaded feed, Analytics covers the selected date range, and that page
    // says so), but they no longer differ in what they mean.
    sentiment: meanSentiment(list),
    total,
    distribution,
    newThisMonth,
    empty: false,
  };
});

/** Distinguishes the three UI states the Dashboard queue must render. */
export const selectReviewsViewState = (state) => {
  const { list, loading, hydrated, error } = state.reviews;
  if (loading && !hydrated) return "loading"; // first fetch in flight
  if (error && list.length === 0) return "error"; // fetch failed, nothing cached
  if (hydrated && list.length === 0) return "empty"; // real, confirmed zero
  return "ready";
};

export const selectReviewsCapped = (state) => state.reviews.cappedByPlan;
export const selectReviewsTotal = (state) => state.reviews.total;

export default reviewsSlice.reducer;