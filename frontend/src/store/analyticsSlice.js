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

// ── Presentation constants ───────────────────────────────────────────────────
// Only the PLATFORM identity lives here now, and it is re-exported from
// theme.js rather than restated — this file used to carry its own copy with a
// different Yelp red (#FF1A1A vs #D32323), so the same platform was two
// colours depending on which component you were looking at.
//
// Rating colours are deliberately NOT here any more. A ramp has to be chosen
// against the surface it is drawn on, and this slice cannot know whether the
// card is light or dark; the old indigo ramp ended on #e0e7ff, which is
// invisible on a white card. The component picks the mode's ramp from
// CHART.ratingRamp instead.
import { PLATFORM as PLATFORM_COLORS } from "../theme.js";

const EMPTY_SUMMARY = {
  // totalReviews is scoped to the selected date range; lifetimeReviews counts
  // every review the feed can show. Keeping both is what stopped the pill from
  // contradicting the review list — see analytics.service.js summaryStats.
  totalReviews: 0,
  lifetimeReviews: 0,
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
      // No `color` here — RatingDistribution reads the mode's ramp by index.
      state.ratingBreakdown = ratingBreakdown;
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