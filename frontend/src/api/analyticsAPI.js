import api from "./axiosInstance.js";

// ── Analytics API ─────────────────────────────────────────────────────────────
// All functions return the data directly.
// Error handling is done at the call site (dispatch in the component/thunk).
// ─────────────────────────────────────────────────────────────────────────────

export const analyticsAPI = {
  // Fetch all analytics for a given date range
  // range: "last_7_days" | "last_30_days" | "last_6_months" | "all_time"
  getAnalytics: async (range = "last_30_days") => {
    // TODO: Uncomment when backend is ready
    // const { data } = await api.get("/analytics", { params: { range } });
    // return data;

    // ── Mock response (remove when backend is ready) ──────────────────────
    await new Promise((r) => setTimeout(r, 800)); // simulate network delay
    return {
      summaryStats: {
        totalReviews: 247,
        avgRating: 4.2,
        responseRate: 91,
        sentimentScore: 88,
        newThisMonth: 47,
        urgentCount: 2,
        growth: 12,
      },
      growthData: [
        { month: "Oct", reviews: 18, responses: 12, avgRating: 3.9 },
        { month: "Nov", reviews: 24, responses: 18, avgRating: 4.1 },
        { month: "Dec", reviews: 20, responses: 16, avgRating: 4.0 },
        { month: "Jan", reviews: 32, responses: 28, avgRating: 4.2 },
        { month: "Feb", reviews: 28, responses: 24, avgRating: 4.3 },
        { month: "Mar", reviews: 38, responses: 35, avgRating: 4.4 },
        { month: "Apr", reviews: 47, responses: 43, avgRating: 4.5 },
      ],
      ratingBreakdown: [
        { star: "5 ★", count: 120, percentage: 49, color: "#6366f1" },
        { star: "4 ★", count: 68, percentage: 28, color: "#818cf8" },
        { star: "3 ★", count: 32, percentage: 13, color: "#a5b4fc" },
        { star: "2 ★", count: 18, percentage: 7, color: "#c7d2fe" },
        { star: "1 ★", count: 9, percentage: 3, color: "#e0e7ff" },
      ],
      platformData: [
        {
          name: "Google",
          value: 147,
          color: "#4285F4",
          avgRating: 4.3,
          responseRate: 91,
        },
        {
          name: "Yelp",
          value: 63,
          color: "#FF1A1A",
          avgRating: 4.0,
          responseRate: 85,
        },
        {
          name: "Facebook",
          value: 37,
          color: "#1877F2",
          avgRating: 4.5,
          responseRate: 78,
        },
      ],
    };
    // ─────────────────────────────────────────────────────────────────────
  },
  getRawReviews: async (range = "all_time") => {
    // TODO: Replace with real API call when backend is ready
    // const { data } = await api.get("/analytics/raw", { params: { range } });
    // return data; // returns array of raw review objects

    // Mock — returns the same rawReviews array from the slice
    await new Promise((r) => setTimeout(r, 600));

    // Import and return the mock data
    // For now just return null so the slice uses its own initialState
    return null;
  },
  // Export analytics as CSV
  exportCSV: async (range = "last_30_days") => {
    // TODO: Uncomment when backend is ready
    // const { data } = await api.get("/analytics/export", {
    //   params: { range },
    //   responseType: "blob",
    // });
    // const url = URL.createObjectURL(new Blob([data]));
    // const a   = document.createElement("a");
    // a.href    = url;
    // a.download = `analytics_${range}.csv`;
    // a.click();
    // URL.revokeObjectURL(url);
    console.log("Export CSV — backend not connected yet");
  },
};
