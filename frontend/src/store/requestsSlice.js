// frontend/src/store/requestsSlice.js
//
// STEP 3 — the mock list is gone.
//
// ── WHAT WAS HERE ───────────────────────────────────────────────────────────
// Four hardcoded rows in initialState.recentRequests — James Owens, Priya Nair,
// David Okafor, Angela Torres — with invented phone numbers, statuses and
// "2 hours ago" timestamps.
//
// ── THE PART THAT WASN'T OBVIOUS ────────────────────────────────────────────
// Deleting the array alone would have left the Send Requests page permanently
// empty, because NOTHING EVER FILLED IT. hooks/requests.hook.js's
// getUserRequests() dispatches addUserRequests() — into userSlice.userRequests
// — and stops there. It has never written to this slice. The page selects
// s.requests.recentRequests, so the list it displayed was: four fakes, plus
// whatever the user sent during this page session (sendRequestSuccess
// unshifts a synthetic row), lost on refresh.
//
// SendRequests.jsx's own comment recorded the symptom without diagnosing it:
// "Fails silently if the backend isn't reachable" — in fact it failed silently
// when the backend was PERFECTLY reachable, because the response went into a
// different slice that nothing on that page reads.
//
// So this rewrite does two things, and needs both:
//   1. recentRequests starts empty, with `hydrated` to distinguish "not
//      fetched" from "you haven't sent any requests yet".
//   2. setRequests + normalizeRequest give the fetch somewhere to land. The
//      matching one-line change in requests.hook.js is part of this step.
//
// ── OPTIMISTIC ROWS ─────────────────────────────────────────────────────────
// sendRequestSuccess still unshifts a local row so the list updates the moment
// a send succeeds, without waiting for a refetch. It now carries a `local`
// flag and a real timestamp, so a subsequent setRequests cleanly replaces it
// with the server's authoritative version rather than leaving a duplicate.

import { createSlice } from "@reduxjs/toolkit";
import { formatRelativeDate } from "../utils/formatRelativeDate.js";

// ── Normalisation ────────────────────────────────────────────────────────────
// Backend Request row → the shape the table renders { id, name, contact, via,
// status, sentAt }. Field names are probed defensively: this slice should not
// break if the API envelope is later tightened.
export const normalizeRequest = (raw = {}) => ({
  id: raw.id ?? raw._id,
  name: raw.patientName ?? raw.name ?? "—",
  contact: raw.phone || raw.email || raw.contact || "—",
  via: raw.sendVia ?? raw.via ?? "SMS",
  status: raw.status ?? "Sent",
  sentAt: formatRelativeDate(raw.createdAt ?? raw.created_at ?? raw.sentAt),
  rawDate: raw.createdAt ?? raw.created_at ?? null,
  local: false,
});

const initialState = {
  // Form state
  form: {
    patientName: "",
    phone: "",
    email: "",
    sendVia: "SMS", // "SMS" | "WhatsApp" | "Email" | "Both"
  },
  // Recent requests list — ← was four invented patients
  recentRequests: [],
  hydrated: false, // true once a fetch has settled
  loading: false,
  error: null,
  successMsg: "",
};

const requestsSlice = createSlice({
  name: "requests",
  initialState,
  reducers: {
    // Update a single form field
    updateFormField(state, action) {
      const { field, value } = action.payload;
      state.form[field] = value;
      state.error = null;
      state.successMsg = "";
    },

    // Reset form back to empty
    resetForm(state) {
      state.form = { patientName: "", phone: "", email: "", sendVia: "SMS" };
    },

    // ── Fetch lifecycle ──────────────────────────────────────────────────
    fetchRequestsStart(state) {
      state.loading = true;
      state.error = null;
    },

    // payload: raw backend rows (array). Replaces the list wholesale —
    // including any optimistic `local` rows, which the server copy supersedes.
    setRequests(state, action) {
      const rows = Array.isArray(action.payload) ? action.payload : [];
      state.recentRequests = rows.map(normalizeRequest);
      state.loading = false;
      state.hydrated = true;
      state.error = null;
    },

    fetchRequestsFailure(state, action) {
      state.loading = false;
      state.hydrated = true;
      state.error = action.payload || null;
      // Keep whatever is already listed — stale beats a flash to empty.
    },

    // ── Send lifecycle ───────────────────────────────────────────────────
    sendRequestStart(state) {
      state.loading = true;
      state.error = null;
      state.successMsg = "";
    },

    // Called when a request is sent successfully.
    sendRequestSuccess(state, action) {
      state.loading = false;
      state.successMsg = action.payload.message;
      // Optimistic row so the table reacts immediately. `local: true` marks it
      // as unconfirmed; the next setRequests replaces it with the server's row.
      state.recentRequests.unshift({
        id: `local_${Date.now()}`,
        name: action.payload.name,
        contact: action.payload.contact,
        via: action.payload.via,
        status: "Sent",
        sentAt: "Just now",
        rawDate: new Date().toISOString(),
        local: true,
      });
      // A local row means the list is no longer "unknown".
      state.hydrated = true;
      // Reset form after success
      state.form = { patientName: "", phone: "", email: "", sendVia: "SMS" };
    },

    // Called when sending fails
    sendRequestFailure(state, action) {
      state.loading = false;
      state.error = action.payload;
    },

    // Clear success message
    clearSuccessMsg(state) {
      state.successMsg = "";
    },

    // On logout — prevents the next user seeing the previous clinic's
    // patient names and phone numbers out of a persisted store.
    resetRequests() {
      return initialState;
    },
  },
});

export const {
  updateFormField,
  resetForm,
  fetchRequestsStart,
  setRequests,
  fetchRequestsFailure,
  sendRequestStart,
  sendRequestSuccess,
  sendRequestFailure,
  clearSuccessMsg,
  resetRequests,
} = requestsSlice.actions;

// ── Selectors ─────────────────────────────────────────────────────────────────
export const selectRecentRequests = (state) => state.requests.recentRequests;

/** "loading" | "empty" | "ready" — same three-state pattern as the reviews queue. */
export const selectRequestsViewState = (state) => {
  const { recentRequests, loading, hydrated } = state.requests;
  if (loading && !hydrated) return "loading";
  if (hydrated && recentRequests.length === 0) return "empty";
  return "ready";
};

export default requestsSlice.reducer;