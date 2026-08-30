/**
 * analyticsAPI.js — Phase 4 rewrite. The mock is gone.
 *
 * Contract change from the mock era: getAnalytics() now returns the SERVER-
 * aggregated payload and is the page's one data call. getRawReviews() — the
 * old "ship rows to the browser and derive there" path — is deleted along
 * with the slice's derive functions; nothing calls it anymore.
 *
 * Uses utils/axios.helper.js (the single surviving client: /api/v1 baseURL,
 * auto-JWT + refresh, upgrade-modal interceptor).
 */

import axiosInstance from "../utils/axios.helper.js";

export const analyticsAPI = {
  /**
   * Server-aggregated analytics for a date range.
   * range: "last_7_days" | "last_30_days" | "last_6_months" | "all_time"
   * → { summaryStats, growthData, ratingBreakdown, platformData,
   *     range, cappedByPlan }
   */
  getAnalytics: async (range = "last_30_days") => {
    const { data } = await axiosInstance.get("/analytics", { params: { range } });
    return data.data;
  },

  /** Downloads the range as CSV via the browser's save dialog. */
  exportCSV: async (range = "last_30_days") => {
    const { data } = await axiosInstance.get("/analytics/export", {
      params: { range },
      responseType: "blob",
    });
    const url = URL.createObjectURL(new Blob([data], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `kirtify_analytics_${range}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};