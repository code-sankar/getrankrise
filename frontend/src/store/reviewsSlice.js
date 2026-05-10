import { createSlice } from "@reduxjs/toolkit";

const mockReviews = [
  {
    id: 1,
    name: "Jessica R.",
    rating: 5,
    text: "Loved the latte art! Staff was super friendly.",
    date: "2 days ago",
    platform: "Google",
    replied: false,
    reviewCount: 2,
  },
  {
    id: 2,
    name: "Marcus Webb",
    rating: 2,
    text: "Long wait times and felt rushed. Not happy.",
    date: "3 days ago",
    platform: "Google",
    replied: false,
    reviewCount: 5,
  },
  {
    id: 3,
    name: "Emily Chen",
    rating: 5,
    text: "Best clinic in the city! Very professional.",
    date: "4 days ago",
    platform: "Yelp",
    replied: true,
    reviewCount: 8,
  },
  {
    id: 4,
    name: "Tom Richards",
    rating: 4,
    text: "Great service. Waiting area needs improvement.",
    date: "5 days ago",
    platform: "Facebook",
    replied: false,
    reviewCount: 1,
  },
  {
    id: 5,
    name: "Linda Park",
    rating: 1,
    text: "Billed incorrectly and staff was rude.",
    date: "6 days ago",
    platform: "Google",
    replied: false,
    reviewCount: 3,
  },
  {
    id: 6,
    name: "Sarah M.",
    rating: 5,
    text: "Wonderful experience. Dr. Johnson was great!",
    date: "1 week ago",
    platform: "Google",
    replied: true,
    reviewCount: 4,
  },
];

const reviewsSlice = createSlice({
  name: "reviews",
  initialState: {
    list: mockReviews, // TODO: replace with real API fetch
    loading: false,
    error: null,
    filters: {
      platform: "All", // "All" | "Google" | "Yelp" | "Facebook"
      rating: "All", // "All" | "1" | "2" | "3" | "4" | "5"
      status: "All", // "All" | "Unanswered" | "Answered"
    },
  },
  reducers: {
    fetchReviewsStart(state) {
      state.loading = true;
      state.error = null;
    },
    fetchReviewsSuccess(state, action) {
      state.list = action.payload;
      state.loading = false;
    },
    fetchReviewsFailure(state, action) {
      state.loading = false;
      state.error = action.payload;
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
  },
});

export const {
  fetchReviewsStart,
  fetchReviewsSuccess,
  fetchReviewsFailure,
  markReplied,
  setFilter,
  clearFilters,
} = reviewsSlice.actions;

// ── Selectors (use these in components with useSelector) ──────────────────────
export const selectFilteredReviews = (state) => {
  const { list, filters } = state.reviews;
  return list.filter((r) => {
    if (filters.platform !== "All" && r.platform !== filters.platform)
      return false;
    if (filters.rating !== "All" && r.rating !== parseInt(filters.rating))
      return false;
    if (filters.status === "Unanswered" && r.replied) return false;
    if (filters.status === "Answered" && !r.replied) return false;
    return true;
  });
};

export const selectReviewStats = (state) => {
  const { list } = state.reviews;
  const total = list.length;
  return {
    avg: (list.reduce((s, r) => s + r.rating, 0) / total).toFixed(1),
    coverage: Math.round((list.filter((r) => r.replied).length / total) * 100),
    sentiment: Math.round(
      (list.filter((r) => r.rating >= 4).length / total) * 100,
    ),
  };
};

export default reviewsSlice.reducer;
