/**
 * analyticsSlice.js — Phase 4 rewrite.
 *
 * What was deleted, and why it HAD to go rather than just being emptied:
 *
 *   * ~200 hardcoded rawReviews rows seeding the store, so the Analytics page
 *     showed a convincing fake dashboard before any request fired.
 *   * The four derive* functions. Beyond being redundant once SQL aggregates,
 *     deriveGrowthData iterated a HARDCODED month list ["Oct".."Apr"] — any
 *     review dated outside those seven literal months silently vanished from
 *     every chart. The client-side derivation wasn't just mock-fed, it was
 *     structurally wrong for real data.
 *
 * The slice is now a thin store: the backend sends final chart shapes
 * (summaryStats, growthData, ratingBreakdown, platformData) and the ONLY
 * transformation here is attaching colors — colors are presentation, so they
 * live with the presentation layer, keyed by star/platform name.
 *
 * `hydrated` mirrors the Phase 3 reviewsSlice pattern: it lets the page tell
 * "loading" from "genuinely zero data" now that nothing fake fills the gap.
 */

import { createSlice } from "@reduxjs/toolkit";

// ── Presentation constants (the frontend's only contribution to the data) ────
const RATING_COLORS = {
  "5 ★": "#6366f1",
  "4 ★": "#818cf8",
  "3 ★": "#a5b4fc",
  "2 ★": "#c7d2fe",
  "1 ★": "#e0e7ff",
};

const PLATFORM_COLORS = {
  Google: "#4285F4",
  Yelp: "#FF1A1A",
  Facebook: "#1877F2",
};

const EMPTY_SUMMARY = {
  totalReviews: 0,
  avgRating: 0,
  responseRate: 0,
  sentimentScore: 0,
  newThisMonth: 0,
  urgentCount: 0,
  growth: 0,
};

const initialState = {
  summaryStats: EMPTY_SUMMARY,
  growthData: [],
  ratingBreakdown: [],
  platformData: [],
  cappedByPlan: false,
  dateRange: "last_30_days",
  hydrated: false,
  loading: false,
  error: null,
  lastFetched: null,
};

const analyticsSlice = createSlice({
  name: "analytics",
  initialState,
  reducers: {
    fetchAnalyticsStart(state) {
      state.loading = true;
      state.error = null;
    },

    // payload: the backend aggregate
    // { summaryStats, growthData, ratingBreakdown, platformData, cappedByPlan }
    fetchAnalyticsSuccess(state, action) {
      const {
        summaryStats = EMPTY_SUMMARY,
        growthData = [],
        ratingBreakdown = [],
        platformData = [],
        cappedByPlan = false,
      } = action.payload || {};

      state.summaryStats = summaryStats;
      state.growthData = growthData;
      state.ratingBreakdown = ratingBreakdown.map((r) => ({
        ...r,
        color: RATING_COLORS[r.star] || "#94a3b8",
      }));
      state.platformData = platformData.map((p) => ({
        ...p,
        color: PLATFORM_COLORS[p.name] || "#94a3b8",
      }));
      state.cappedByPlan = Boolean(cappedByPlan);
      state.loading = false;
      state.hydrated = true;
      state.lastFetched = Date.now();
    },

    fetchAnalyticsFailure(state, action) {
      state.loading = false;
      state.hydrated = true;
      state.error = action.payload || null;
      // Keep previous data on refetch failure — stale beats a flash to zero.
    },

    setDateRange(state, action) {
      state.dateRange = action.payload;
      state.lastFetched = null;
    },

    clearError(state) {
      state.error = null;
    },

    resetAnalytics() {
      return initialState;
    },
  },
});

export const {
  fetchAnalyticsStart,
  fetchAnalyticsSuccess,
  fetchAnalyticsFailure,
  setDateRange,
  clearError,
  resetAnalytics,
} = analyticsSlice.actions;

// ── Selectors — same names/shapes the page already imports ───────────────────
export const selectSummaryStats = (s) => s.analytics.summaryStats;
export const selectGrowthData = (s) => s.analytics.growthData;
export const selectRatingBreakdown = (s) => s.analytics.ratingBreakdown;
export const selectPlatformData = (s) => s.analytics.platformData;
export const selectDateRange = (s) => s.analytics.dateRange;
export const selectAnalyticsLoading = (s) => s.analytics.loading;
export const selectAnalyticsError = (s) => s.analytics.error;
export const selectAnalyticsHydrated = (s) => s.analytics.hydrated;
export const selectAnalyticsCapped = (s) => s.analytics.cappedByPlan;

/** True when a completed fetch confirmed the clinic has no reviews at all. */
export const selectAnalyticsEmpty = (s) =>
  s.analytics.hydrated && !s.analytics.loading && s.analytics.summaryStats.totalReviews === 0;

export default analyticsSlice.reducer;