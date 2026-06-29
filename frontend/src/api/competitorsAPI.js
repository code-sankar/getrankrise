/**
 * competitorsAPI.js
 * Thin wrapper over the real /api/v1/competitors endpoints.
 *
 * Uses axios.helper (baseURL /api/v1, auto JWT + token refresh) — the same
 * instance the live hooks use. Every backend response is { success, message,
 * data }, so each function unwraps and returns `data` directly. Error handling
 * is done at the call site (the slice dispatch in Competitors.jsx).
 */

import axiosInstance from "../utils/axios.helper.js";

// ── Normaliser ────────────────────────────────────────────────────────────────
// The /overview endpoint already returns a flat shape, but add/update/refresh
// return the raw Competitor model (latestRating, newReviewsThisPeriod…).
// Collapse both into one shape so the slice never has to branch.
export const normalizeCompetitor = (raw = {}) => ({
  id:           raw.id,
  name:         raw.name,
  platform:     raw.platform,
  rating:       raw.rating       ?? raw.latestRating        ?? 0,
  totalReviews: raw.totalReviews ?? raw.latestTotalReviews  ?? 0,
  responseRate: raw.responseRate ?? raw.latestResponseRate  ?? 0,
  sentiment:    raw.sentiment    ?? raw.latestSentiment     ?? 0,
  newThisMonth: raw.newThisMonth ?? raw.newReviewsThisPeriod ?? 0,
  lastSyncedAt: raw.lastSyncedAt ?? null,
  syncStatus:   raw.syncStatus   ?? "pending",
  isActive:     raw.isActive     ?? true,
});

export const competitorsAPI = {
  // Self metrics + all active competitors, for the comparison dashboard
  getOverview: async () => {
    const { data } = await axiosInstance.get("/competitors/overview");
    return data.data; // { self, competitors }
  },

  // Full list + plan usage ({ tracked, limit, canAdd })
  list: async (includeInactive = false) => {
    const { data } = await axiosInstance.get("/competitors", {
      params: { includeInactive },
    });
    return data.data; // { competitors, usage }
  },

  // One competitor + snapshot trend
  getOne: async (id, days = 30) => {
    const { data } = await axiosInstance.get(`/competitors/${id}`, {
      params: { days },
    });
    return data.data; // { competitor, snapshots }
  },

  add: async (payload) => {
    const { data } = await axiosInstance.post("/competitors", payload);
    return normalizeCompetitor(data.data);
  },

  update: async (id, payload) => {
    const { data } = await axiosInstance.patch(`/competitors/${id}`, payload);
    return normalizeCompetitor(data.data);
  },

  remove: async (id) => {
    const { data } = await axiosInstance.delete(`/competitors/${id}`);
    return data.data; // { id }
  },

  refresh: async (id) => {
    const { data } = await axiosInstance.post(`/competitors/${id}/refresh`);
    return normalizeCompetitor(data.data.competitor);
  },
};