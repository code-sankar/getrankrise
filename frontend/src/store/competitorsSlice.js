import { createSlice } from "@reduxjs/toolkit";

/**
 * competitorsSlice
 * State for the Competitor Intelligence Tracker. Mirrors the analyticsSlice
 * pattern: fetch lifecycle flags + selectors, no API calls in here (those live
 * in api/competitorsAPI.js and are dispatched from the page).
 */
// Extracted from the createSlice call so resetCompetitors can return it. The
// other tenant-scoped slices (reviews, requests, notifications, analytics) all
// already follow this shape.
const initialState = {
  self:        null,   // { name, rating, totalReviews, responseRate, sentiment }
  list:        [],     // normalized competitor objects
  usage:       { tracked: 0, limit: 0, canAdd: false },

  selectedId:  null,   // currently inspected competitor
  snapshots:   [],     // trend rows for the selected competitor

  loading:     false,  // overview fetch
  trendLoading: false, // snapshot fetch
  adding:      false,  // add-competitor in flight
  refreshingId: null,  // id currently being re-synced
  error:       null,   // string | { blocked: true } when tier-gated
};

const competitorsSlice = createSlice({
  name: "competitors",
  initialState,
  reducers: {
    // ── Overview ─────────────────────────────────────────────────────────
    fetchStart(state) {
      state.loading = true;
      state.error = null;
    },
    fetchSuccess(state, action) {
      const { self, competitors, usage } = action.payload;
      state.self = self;
      state.list = competitors;
      if (usage) state.usage = usage;
      state.loading = false;
      // Keep a valid selection
      if (!state.selectedId && competitors.length) {
        state.selectedId = competitors[0].id;
      }
    },
    fetchFailure(state, action) {
      state.loading = false;
      state.error = action.payload ?? null;
    },
    setUsage(state, action) {
      state.usage = action.payload;
    },

    // ── Selection + trend ────────────────────────────────────────────────
    selectCompetitor(state, action) {
      state.selectedId = action.payload;
      state.snapshots = [];
    },
    fetchTrendStart(state) {
      state.trendLoading = true;
    },
    fetchTrendSuccess(state, action) {
      state.snapshots = action.payload;
      state.trendLoading = false;
    },
    fetchTrendFailure(state) {
      state.trendLoading = false;
      state.snapshots = [];
    },

    // ── Mutations (optimistic-friendly, in-place) ────────────────────────
    setAdding(state, action) {
      state.adding = action.payload;
    },
    competitorUpserted(state, action) {
      const c = action.payload;
      const i = state.list.findIndex((x) => x.id === c.id);
      if (i === -1) state.list.push(c);
      else state.list[i] = c;
    },
    setRefreshing(state, action) {
      state.refreshingId = action.payload;
    },
    competitorRemoved(state, action) {
      const id = action.payload;
      state.list = state.list.filter((c) => c.id !== id);
      state.usage.tracked = Math.max(0, state.usage.tracked - 1);
      state.usage.canAdd = state.usage.tracked < state.usage.limit;
      if (state.selectedId === id) {
        state.selectedId = state.list[0]?.id ?? null;
        state.snapshots = [];
      }
    },

    clearError(state) {
      state.error = null;
    },

    // On logout — competitor names, ratings and trend snapshots are all
    // clinic-scoped, so they must not survive into the next session on a
    // shared browser. See the note on logoutUser in hooks/user.hook.js.
    resetCompetitors() {
      return initialState;
    },
  },
});

export const {
  fetchStart,
  fetchSuccess,
  fetchFailure,
  setUsage,
  selectCompetitor,
  fetchTrendStart,
  fetchTrendSuccess,
  fetchTrendFailure,
  setAdding,
  competitorUpserted,
  setRefreshing,
  competitorRemoved,
  clearError,
  resetCompetitors,
} = competitorsSlice.actions;

// ── Selectors ─────────────────────────────────────────────────────────────────
export const selectSelf          = (s) => s.competitors.self;
export const selectCompetitors   = (s) => s.competitors.list;
export const selectUsage         = (s) => s.competitors.usage;
export const selectCompLoading   = (s) => s.competitors.loading;
export const selectCompError     = (s) => s.competitors.error;
export const selectSelectedId    = (s) => s.competitors.selectedId;
export const selectSnapshots     = (s) => s.competitors.snapshots;
export const selectTrendLoading  = (s) => s.competitors.trendLoading;
export const selectAdding        = (s) => s.competitors.adding;
export const selectRefreshingId  = (s) => s.competitors.refreshingId;

export const selectSelectedCompetitor = (s) =>
  s.competitors.list.find((c) => c.id === s.competitors.selectedId) || null;

export default competitorsSlice.reducer;