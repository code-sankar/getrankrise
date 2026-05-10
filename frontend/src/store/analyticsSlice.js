import { createSlice } from "@reduxjs/toolkit";

// ── Raw review data — this is the SINGLE SOURCE OF TRUTH ─────────────────────
// Everything else (stats, charts, breakdowns) is DERIVED from this array.
// When the backend is connected, replace this with the API response.
const rawReviews = [
  { id: 1, month: "Oct", platform: "Google", rating: 4, replied: true },
  { id: 2, month: "Oct", platform: "Yelp", rating: 3, replied: false },
  { id: 3, month: "Oct", platform: "Google", rating: 5, replied: true },
  { id: 4, month: "Oct", platform: "Facebook", rating: 2, replied: false },
  { id: 5, month: "Oct", platform: "Google", rating: 5, replied: true },
  { id: 6, month: "Oct", platform: "Yelp", rating: 4, replied: true },
  { id: 7, month: "Oct", platform: "Google", rating: 3, replied: false },
  { id: 8, month: "Oct", platform: "Facebook", rating: 5, replied: true },
  { id: 9, month: "Oct", platform: "Google", rating: 1, replied: false },
  { id: 10, month: "Oct", platform: "Yelp", rating: 4, replied: true },
  { id: 11, month: "Oct", platform: "Google", rating: 5, replied: true },
  { id: 12, month: "Oct", platform: "Facebook", rating: 4, replied: false },
  { id: 13, month: "Oct", platform: "Google", rating: 2, replied: true },
  { id: 14, month: "Oct", platform: "Yelp", rating: 5, replied: true },
  { id: 15, month: "Oct", platform: "Google", rating: 4, replied: false },
  { id: 16, month: "Oct", platform: "Facebook", rating: 3, replied: true },
  { id: 17, month: "Oct", platform: "Google", rating: 5, replied: true },
  { id: 18, month: "Oct", platform: "Yelp", rating: 4, replied: true },

  { id: 19, month: "Nov", platform: "Google", rating: 5, replied: true },
  { id: 20, month: "Nov", platform: "Google", rating: 4, replied: true },
  { id: 21, month: "Nov", platform: "Yelp", rating: 3, replied: false },
  { id: 22, month: "Nov", platform: "Facebook", rating: 5, replied: true },
  { id: 23, month: "Nov", platform: "Google", rating: 2, replied: false },
  { id: 24, month: "Nov", platform: "Google", rating: 5, replied: true },
  { id: 25, month: "Nov", platform: "Yelp", rating: 4, replied: true },
  { id: 26, month: "Nov", platform: "Google", rating: 5, replied: true },
  { id: 27, month: "Nov", platform: "Facebook", rating: 3, replied: false },
  { id: 28, month: "Nov", platform: "Google", rating: 4, replied: true },
  { id: 29, month: "Nov", platform: "Yelp", rating: 5, replied: true },
  { id: 30, month: "Nov", platform: "Google", rating: 1, replied: false },
  { id: 31, month: "Nov", platform: "Facebook", rating: 4, replied: true },
  { id: 32, month: "Nov", platform: "Google", rating: 5, replied: true },
  { id: 33, month: "Nov", platform: "Yelp", rating: 4, replied: false },
  { id: 34, month: "Nov", platform: "Google", rating: 3, replied: true },
  { id: 35, month: "Nov", platform: "Facebook", rating: 5, replied: true },
  { id: 36, month: "Nov", platform: "Google", rating: 4, replied: true },
  { id: 37, month: "Nov", platform: "Yelp", rating: 5, replied: true },
  { id: 38, month: "Nov", platform: "Google", rating: 4, replied: false },
  { id: 39, month: "Nov", platform: "Facebook", rating: 2, replied: true },
  { id: 40, month: "Nov", platform: "Google", rating: 5, replied: true },
  { id: 41, month: "Nov", platform: "Google", rating: 4, replied: true },
  { id: 42, month: "Nov", platform: "Yelp", rating: 3, replied: false },

  { id: 43, month: "Dec", platform: "Google", rating: 4, replied: true },
  { id: 44, month: "Dec", platform: "Yelp", rating: 5, replied: true },
  { id: 45, month: "Dec", platform: "Facebook", rating: 3, replied: false },
  { id: 46, month: "Dec", platform: "Google", rating: 5, replied: true },
  { id: 47, month: "Dec", platform: "Google", rating: 4, replied: true },
  { id: 48, month: "Dec", platform: "Yelp", rating: 2, replied: false },
  { id: 49, month: "Dec", platform: "Facebook", rating: 5, replied: true },
  { id: 50, month: "Dec", platform: "Google", rating: 4, replied: true },
  { id: 51, month: "Dec", platform: "Google", rating: 3, replied: false },
  { id: 52, month: "Dec", platform: "Yelp", rating: 5, replied: true },
  { id: 53, month: "Dec", platform: "Google", rating: 1, replied: false },
  { id: 54, month: "Dec", platform: "Facebook", rating: 4, replied: true },
  { id: 55, month: "Dec", platform: "Google", rating: 5, replied: true },
  { id: 56, month: "Dec", platform: "Yelp", rating: 4, replied: false },
  { id: 57, month: "Dec", platform: "Google", rating: 3, replied: true },
  { id: 58, month: "Dec", platform: "Facebook", rating: 5, replied: true },
  { id: 59, month: "Dec", platform: "Google", rating: 4, replied: true },
  { id: 60, month: "Dec", platform: "Yelp", rating: 4, replied: true },
  { id: 61, month: "Dec", platform: "Google", rating: 5, replied: false },
  { id: 62, month: "Dec", platform: "Facebook", rating: 3, replied: true },

  { id: 63, month: "Jan", platform: "Google", rating: 5, replied: true },
  { id: 64, month: "Jan", platform: "Google", rating: 4, replied: true },
  { id: 65, month: "Jan", platform: "Yelp", rating: 5, replied: true },
  { id: 66, month: "Jan", platform: "Facebook", rating: 4, replied: false },
  { id: 67, month: "Jan", platform: "Google", rating: 3, replied: true },
  { id: 68, month: "Jan", platform: "Google", rating: 5, replied: true },
  { id: 69, month: "Jan", platform: "Yelp", rating: 4, replied: true },
  { id: 70, month: "Jan", platform: "Facebook", rating: 5, replied: true },
  { id: 71, month: "Jan", platform: "Google", rating: 4, replied: false },
  { id: 72, month: "Jan", platform: "Google", rating: 5, replied: true },
  { id: 73, month: "Jan", platform: "Yelp", rating: 3, replied: false },
  { id: 74, month: "Jan", platform: "Facebook", rating: 4, replied: true },
  { id: 75, month: "Jan", platform: "Google", rating: 5, replied: true },
  { id: 76, month: "Jan", platform: "Google", rating: 4, replied: true },
  { id: 77, month: "Jan", platform: "Yelp", rating: 5, replied: true },
  { id: 78, month: "Jan", platform: "Facebook", rating: 2, replied: false },
  { id: 79, month: "Jan", platform: "Google", rating: 4, replied: true },
  { id: 80, month: "Jan", platform: "Google", rating: 5, replied: true },
  { id: 81, month: "Jan", platform: "Yelp", rating: 4, replied: true },
  { id: 82, month: "Jan", platform: "Facebook", rating: 3, replied: false },
  { id: 83, month: "Jan", platform: "Google", rating: 5, replied: true },
  { id: 84, month: "Jan", platform: "Google", rating: 4, replied: true },
  { id: 85, month: "Jan", platform: "Yelp", rating: 5, replied: true },
  { id: 86, month: "Jan", platform: "Facebook", rating: 4, replied: true },
  { id: 87, month: "Jan", platform: "Google", rating: 3, replied: false },
  { id: 88, month: "Jan", platform: "Google", rating: 5, replied: true },
  { id: 89, month: "Jan", platform: "Yelp", rating: 4, replied: true },
  { id: 90, month: "Jan", platform: "Facebook", rating: 5, replied: true },
  { id: 91, month: "Jan", platform: "Google", rating: 4, replied: true },
  { id: 92, month: "Jan", platform: "Google", rating: 5, replied: true },
  { id: 93, month: "Jan", platform: "Yelp", rating: 4, replied: false },
  { id: 94, month: "Jan", platform: "Facebook", rating: 3, replied: true },

  { id: 95, month: "Feb", platform: "Google", rating: 5, replied: true },
  { id: 96, month: "Feb", platform: "Google", rating: 4, replied: true },
  { id: 97, month: "Feb", platform: "Yelp", rating: 5, replied: true },
  { id: 98, month: "Feb", platform: "Facebook", rating: 4, replied: true },
  { id: 99, month: "Feb", platform: "Google", rating: 5, replied: true },
  { id: 100, month: "Feb", platform: "Google", rating: 3, replied: false },
  { id: 101, month: "Feb", platform: "Yelp", rating: 4, replied: true },
  { id: 102, month: "Feb", platform: "Facebook", rating: 5, replied: true },
  { id: 103, month: "Feb", platform: "Google", rating: 4, replied: false },
  { id: 104, month: "Feb", platform: "Google", rating: 5, replied: true },
  { id: 105, month: "Feb", platform: "Yelp", rating: 4, replied: true },
  { id: 106, month: "Feb", platform: "Facebook", rating: 3, replied: false },
  { id: 107, month: "Feb", platform: "Google", rating: 5, replied: true },
  { id: 108, month: "Feb", platform: "Google", rating: 4, replied: true },
  { id: 109, month: "Feb", platform: "Yelp", rating: 5, replied: true },
  { id: 110, month: "Feb", platform: "Facebook", rating: 4, replied: true },
  { id: 111, month: "Feb", platform: "Google", rating: 5, replied: true },
  { id: 112, month: "Feb", platform: "Google", rating: 4, replied: false },
  { id: 113, month: "Feb", platform: "Yelp", rating: 3, replied: true },
  { id: 114, month: "Feb", platform: "Facebook", rating: 5, replied: true },
  { id: 115, month: "Feb", platform: "Google", rating: 4, replied: true },
  { id: 116, month: "Feb", platform: "Google", rating: 5, replied: true },
  { id: 117, month: "Feb", platform: "Yelp", rating: 4, replied: true },
  { id: 118, month: "Feb", platform: "Facebook", rating: 2, replied: false },
  { id: 119, month: "Feb", platform: "Google", rating: 5, replied: true },
  { id: 120, month: "Feb", platform: "Google", rating: 4, replied: true },
  { id: 121, month: "Feb", platform: "Yelp", rating: 5, replied: true },
  { id: 122, month: "Feb", platform: "Facebook", rating: 4, replied: true },

  { id: 123, month: "Mar", platform: "Google", rating: 5, replied: true },
  { id: 124, month: "Mar", platform: "Google", rating: 5, replied: true },
  { id: 125, month: "Mar", platform: "Yelp", rating: 4, replied: true },
  { id: 126, month: "Mar", platform: "Facebook", rating: 5, replied: true },
  { id: 127, month: "Mar", platform: "Google", rating: 4, replied: false },
  { id: 128, month: "Mar", platform: "Google", rating: 5, replied: true },
  { id: 129, month: "Mar", platform: "Yelp", rating: 3, replied: true },
  { id: 130, month: "Mar", platform: "Facebook", rating: 4, replied: true },
  { id: 131, month: "Mar", platform: "Google", rating: 5, replied: true },
  { id: 132, month: "Mar", platform: "Google", rating: 4, replied: true },
  { id: 133, month: "Mar", platform: "Yelp", rating: 5, replied: false },
  { id: 134, month: "Mar", platform: "Facebook", rating: 4, replied: true },
  { id: 135, month: "Mar", platform: "Google", rating: 5, replied: true },
  { id: 136, month: "Mar", platform: "Google", rating: 3, replied: false },
  { id: 137, month: "Mar", platform: "Yelp", rating: 4, replied: true },
  { id: 138, month: "Mar", platform: "Facebook", rating: 5, replied: true },
  { id: 139, month: "Mar", platform: "Google", rating: 4, replied: true },
  { id: 140, month: "Mar", platform: "Google", rating: 5, replied: true },
  { id: 141, month: "Mar", platform: "Yelp", rating: 4, replied: true },
  { id: 142, month: "Mar", platform: "Facebook", rating: 3, replied: false },
  { id: 143, month: "Mar", platform: "Google", rating: 5, replied: true },
  { id: 144, month: "Mar", platform: "Google", rating: 4, replied: true },
  { id: 145, month: "Mar", platform: "Yelp", rating: 5, replied: true },
  { id: 146, month: "Mar", platform: "Facebook", rating: 4, replied: true },
  { id: 147, month: "Mar", platform: "Google", rating: 5, replied: true },
  { id: 148, month: "Mar", platform: "Google", rating: 4, replied: true },
  { id: 149, month: "Mar", platform: "Yelp", rating: 3, replied: false },
  { id: 150, month: "Mar", platform: "Facebook", rating: 5, replied: true },
  { id: 151, month: "Mar", platform: "Google", rating: 4, replied: true },
  { id: 152, month: "Mar", platform: "Google", rating: 5, replied: true },
  { id: 153, month: "Mar", platform: "Yelp", rating: 4, replied: true },
  { id: 154, month: "Mar", platform: "Facebook", rating: 4, replied: true },
  { id: 155, month: "Mar", platform: "Google", rating: 5, replied: false },
  { id: 156, month: "Mar", platform: "Google", rating: 4, replied: true },
  { id: 157, month: "Mar", platform: "Yelp", rating: 5, replied: true },
  { id: 158, month: "Mar", platform: "Facebook", rating: 3, replied: true },
  { id: 159, month: "Mar", platform: "Google", rating: 4, replied: true },
  { id: 160, month: "Mar", platform: "Google", rating: 5, replied: true },

  { id: 161, month: "Apr", platform: "Google", rating: 5, replied: true },
  { id: 162, month: "Apr", platform: "Google", rating: 5, replied: true },
  { id: 163, month: "Apr", platform: "Yelp", rating: 4, replied: true },
  { id: 164, month: "Apr", platform: "Facebook", rating: 5, replied: true },
  { id: 165, month: "Apr", platform: "Google", rating: 4, replied: true },
  { id: 166, month: "Apr", platform: "Google", rating: 5, replied: false },
  { id: 167, month: "Apr", platform: "Yelp", rating: 5, replied: true },
  { id: 168, month: "Apr", platform: "Facebook", rating: 4, replied: true },
  { id: 169, month: "Apr", platform: "Google", rating: 5, replied: true },
  { id: 170, month: "Apr", platform: "Google", rating: 4, replied: true },
  { id: 171, month: "Apr", platform: "Yelp", rating: 5, replied: true },
  { id: 172, month: "Apr", platform: "Facebook", rating: 3, replied: false },
  { id: 173, month: "Apr", platform: "Google", rating: 5, replied: true },
  { id: 174, month: "Apr", platform: "Google", rating: 4, replied: true },
  { id: 175, month: "Apr", platform: "Yelp", rating: 5, replied: true },
  { id: 176, month: "Apr", platform: "Facebook", rating: 4, replied: true },
  { id: 177, month: "Apr", platform: "Google", rating: 5, replied: true },
  { id: 178, month: "Apr", platform: "Google", rating: 4, replied: true },
  { id: 179, month: "Apr", platform: "Yelp", rating: 5, replied: false },
  { id: 180, month: "Apr", platform: "Facebook", rating: 4, replied: true },
  { id: 181, month: "Apr", platform: "Google", rating: 5, replied: true },
  { id: 182, month: "Apr", platform: "Google", rating: 4, replied: true },
  { id: 183, month: "Apr", platform: "Yelp", rating: 5, replied: true },
  { id: 184, month: "Apr", platform: "Facebook", rating: 5, replied: true },
  { id: 185, month: "Apr", platform: "Google", rating: 4, replied: true },
  { id: 186, month: "Apr", platform: "Google", rating: 5, replied: true },
  { id: 187, month: "Apr", platform: "Yelp", rating: 4, replied: true },
  { id: 188, month: "Apr", platform: "Facebook", rating: 5, replied: true },
  { id: 189, month: "Apr", platform: "Google", rating: 4, replied: false },
  { id: 190, month: "Apr", platform: "Google", rating: 5, replied: true },
  { id: 191, month: "Apr", platform: "Yelp", rating: 5, replied: true },
  { id: 192, month: "Apr", platform: "Facebook", rating: 4, replied: true },
  { id: 193, month: "Apr", platform: "Google", rating: 5, replied: true },
  { id: 194, month: "Apr", platform: "Google", rating: 4, replied: true },
  { id: 195, month: "Apr", platform: "Yelp", rating: 5, replied: true },
  { id: 196, month: "Apr", platform: "Facebook", rating: 3, replied: false },
  { id: 197, month: "Apr", platform: "Google", rating: 5, replied: true },
  { id: 198, month: "Apr", platform: "Google", rating: 4, replied: true },
  { id: 199, month: "Apr", platform: "Yelp", rating: 5, replied: true },
  { id: 200, month: "Apr", platform: "Facebook", rating: 4, replied: true },
  { id: 201, month: "Apr", platform: "Google", rating: 5, replied: true },
  { id: 202, month: "Apr", platform: "Google", rating: 4, replied: true },
  { id: 203, month: "Apr", platform: "Yelp", rating: 4, replied: true },
  { id: 204, month: "Apr", platform: "Facebook", rating: 5, replied: true },
  { id: 205, month: "Apr", platform: "Google", rating: 5, replied: true },
  { id: 206, month: "Apr", platform: "Google", rating: 4, replied: false },
  { id: 207, month: "Apr", platform: "Yelp", rating: 5, replied: true },
];

// ── Pure functions that DERIVE data from rawReviews ───────────────────────────

export function deriveGrowthData(reviews) {
  const months = ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr"];
  return months.map((month) => {
    const monthReviews = reviews.filter((r) => r.month === month);
    const total = monthReviews.length;
    const responses = monthReviews.filter((r) => r.replied).length;
    const avgRating =
      total > 0
        ? parseFloat(
            (monthReviews.reduce((s, r) => s + r.rating, 0) / total).toFixed(2),
          )
        : 0;
    return { month, reviews: total, responses, avgRating };
  });
}

export function deriveRatingBreakdown(reviews) {
  const total = reviews.length;
  const colors = {
    5: "#6366f1",
    4: "#818cf8",
    3: "#a5b4fc",
    2: "#c7d2fe",
    1: "#e0e7ff",
  };
  return [5, 4, 3, 2, 1].map((star) => {
    const count = reviews.filter((r) => r.rating === star).length;
    const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
    return { star: `${star} ★`, count, percentage, color: colors[star] };
  });
}

export function derivePlatformData(reviews) {
  const platforms = [
    { name: "Google", color: "#4285F4" },
    { name: "Yelp", color: "#FF1A1A" },
    { name: "Facebook", color: "#1877F2" },
  ];
  return platforms.map((p) => {
    const pr = reviews.filter((r) => r.platform === p.name);
    const total = pr.length;
    const replied = pr.filter((r) => r.replied).length;
    const avgRating =
      total > 0
        ? parseFloat((pr.reduce((s, r) => s + r.rating, 0) / total).toFixed(1))
        : 0;
    const responseRate = total > 0 ? Math.round((replied / total) * 100) : 0;
    return { ...p, value: total, avgRating, responseRate };
  });
}

export function deriveSummaryStats(reviews) {
  const total = reviews.length;
  const replied = reviews.filter((r) => r.replied).length;
  const positive = reviews.filter((r) => r.rating >= 4).length;
  const urgent = reviews.filter((r) => r.rating <= 2 && !r.replied).length;
  const avgRating =
    total > 0
      ? parseFloat(
          (reviews.reduce((s, r) => s + r.rating, 0) / total).toFixed(1),
        )
      : 0;
  const responseRate = total > 0 ? Math.round((replied / total) * 100) : 0;
  const sentimentScore = total > 0 ? Math.round((positive / total) * 100) : 0;

  // Growth: compare last month vs second-to-last month
  const months = [...new Set(reviews.map((r) => r.month))];
  const lastMonth = months[months.length - 1];
  const prevMonth = months[months.length - 2];
  const lastCount = reviews.filter((r) => r.month === lastMonth).length;
  const prevCount = reviews.filter((r) => r.month === prevMonth).length;
  const growth =
    prevCount > 0 ? Math.round(((lastCount - prevCount) / prevCount) * 100) : 0;

  return {
    totalReviews: total,
    avgRating,
    responseRate,
    sentimentScore,
    newThisMonth: lastCount,
    urgentCount: urgent,
    growth,
  };
}

// ── Compute all derived data from rawReviews once at startup ──────────────────
const initialGrowthData = deriveGrowthData(rawReviews);
const initialRatingBreakdown = deriveRatingBreakdown(rawReviews);
const initialPlatformData = derivePlatformData(rawReviews);
const initialSummaryStats = deriveSummaryStats(rawReviews);

// ─────────────────────────────────────────────────────────────────────────────

const analyticsSlice = createSlice({
  name: "analytics",
  initialState: {
    rawReviews, // source of truth
    summaryStats: initialSummaryStats,
    growthData: initialGrowthData,
    ratingBreakdown: initialRatingBreakdown,
    platformData: initialPlatformData,
    dateRange: "all_time",
    loading: false,
    error: null,
    lastFetched: null,
  },
  reducers: {
    fetchAnalyticsStart(state) {
      state.loading = true;
      state.error = null;
    },

    // When real API returns raw reviews, derive everything from them
    fetchAnalyticsSuccess(state, action) {
      const reviews = action.payload; // array of raw review objects
      state.rawReviews = reviews;
      state.summaryStats = deriveSummaryStats(reviews);
      state.growthData = deriveGrowthData(reviews);
      state.ratingBreakdown = deriveRatingBreakdown(reviews);
      state.platformData = derivePlatformData(reviews);
      state.loading = false;
      state.lastFetched = Date.now();
    },

    fetchAnalyticsFailure(state, action) {
      state.loading = false;
      // Only set error if there's an actual message
      state.error = action.payload || null;
    },

    setDateRange(state, action) {
      state.dateRange = action.payload;
      state.lastFetched = null;
    },

    clearError(state) {
      state.error = null;
    },
  },
});

export const {
  fetchAnalyticsStart,
  fetchAnalyticsSuccess,
  fetchAnalyticsFailure,
  setDateRange,
  clearError,
} = analyticsSlice.actions;

// ── Selectors ─────────────────────────────────────────────────────────────────
export const selectSummaryStats = (s) => s.analytics.summaryStats;
export const selectGrowthData = (s) => s.analytics.growthData;
export const selectRatingBreakdown = (s) => s.analytics.ratingBreakdown;
export const selectPlatformData = (s) => s.analytics.platformData;
export const selectDateRange = (s) => s.analytics.dateRange;
export const selectAnalyticsLoading = (s) => s.analytics.loading;
export const selectAnalyticsError = (s) => s.analytics.error;

export default analyticsSlice.reducer;
