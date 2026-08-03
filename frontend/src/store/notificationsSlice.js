// frontend/src/store/notificationsSlice.js
//
// STEP 3 — the mock list is gone.
//
// ── WHAT WAS HERE ───────────────────────────────────────────────────────────
// Four hardcoded notifications seeded into initialState:
//   "New 1-star review from Linda Park"      (urgent, unread)
//   "New 2-star review from Marcus Webb"     (urgent, unread)
//   "Monthly report is ready to download"    (info)
//   "Review request sent to 12 patients"     (success)
//
// Because NotificationBell read this slice and nothing ever fetched, every
// account in the product showed those four rows and a permanent unread badge
// of 2 — for Linda Park and Marcus Webb, who do not exist. "Mark all read"
// dispatched the local reducer, so the badge cleared until refresh and then
// came back. The two urgent rows even described the exact feature that had no
// backend write path (now shipped:
// services/notifications/reviewAlerts.service.js).
//
// ── WHAT CHANGED ────────────────────────────────────────────────────────────
//   1. initialState.items is []. `hydrated` distinguishes "not fetched yet"
//      from "genuinely nothing" — the reviewsSlice pattern, for the same
//      reason: the bell's empty state ("All caught up!") is a LIE before the
//      first fetch settles and the TRUTH after it.
//   2. normalizeNotification maps the backend row onto the shape the bell
//      already renders. The component's JSX needs no changes for this: it
//      reads n.id / n.type / n.message / n.read / n.time exactly as before,
//      and `time` is now derived from created_at instead of being the literal
//      string "5 min ago".
//   3. setNotifications replaces the whole list from a fetch. The reducers
//      that mutate in place (markAsRead / markAllAsRead / dismiss) stay —
//      they are the optimistic half of the hooks, which then confirm against
//      the API.
//   4. resetNotifications for logout, mirroring resetReviews. Without it the
//      next user on a shared machine briefly sees the previous user's alerts,
//      which for a "new 1-star review" alert is a small data leak between
//      clinics.

import { createSlice } from "@reduxjs/toolkit";
import { formatRelativeDate } from "../utils/formatRelativeDate.js";

// ── Normalisation ────────────────────────────────────────────────────────────
// Backend Notification model → the shape the bell renders. Tolerates already-
// normalised input (re-dispatch safety) by falling back field by field.
//
// NOTE ON id: the backend is Postgres/Sequelize and returns `id`. Several
// userSlice reducers still match on `_id`, a Mongo-ism from an early scaffold
// — see the Step 3 patch notes. Accepting both here means this slice is
// correct regardless of which one the caller hands over.
export const normalizeNotification = (raw = {}) => ({
  id: raw.id ?? raw._id,
  type: raw.type ?? "info", // "urgent" | "info" | "success" | "warning"
  message: raw.message ?? "",
  read: Boolean(raw.read),
  // Human string for display; raw timestamp kept for sorting/filtering later.
  time: formatRelativeDate(raw.createdAt ?? raw.created_at ?? raw.time),
  rawDate: raw.createdAt ?? raw.created_at ?? null,
  reviewId: raw.reviewId ?? raw.review_id ?? null,
});

const initialState = {
  items: [], // ← was four invented notifications
  hydrated: false, // true once any fetch has settled (success OR failure)
  loading: false,
  error: null,
};

const notificationsSlice = createSlice({
  name: "notifications",
  initialState,
  reducers: {
    fetchStart(state) {
      state.loading = true;
      state.error = null;
    },

    // payload: raw backend rows (array) — normalised here so every caller
    // gets the same shape without having to remember to map first.
    setNotifications(state, action) {
      const rows = Array.isArray(action.payload) ? action.payload : [];
      state.items = rows.map(normalizeNotification);
      state.loading = false;
      state.hydrated = true;
      state.error = null;
    },

    fetchFailure(state, action) {
      state.loading = false;
      state.hydrated = true;
      state.error = action.payload || null;
      // Deliberately NOT clearing items: on a transient refetch failure,
      // stale-but-real alerts beat a flash to empty.
    },

    // Mark a single notification as read (optimistic half of the hook)
    markAsRead(state, action) {
      const item = state.items.find((n) => n.id === action.payload);
      if (item) item.read = true;
    },

    // Mark all notifications as read
    markAllAsRead(state) {
      state.items.forEach((n) => {
        n.read = true;
      });
    },

    // Remove a single notification
    dismiss(state, action) {
      state.items = state.items.filter((n) => n.id !== action.payload);
    },

    // Add a locally-generated notification (e.g. "request sent" on the Send
    // Requests page). These are client-side only and vanish on refresh —
    // which is correct: they're feedback about an action the user just took,
    // not a server-side alert. Anything that must survive a reload has to be
    // written by the backend, the way review alerts now are.
    addNotification(state, action) {
      state.items.unshift({
        id: `local_${Date.now()}`,
        read: false,
        time: "Just now",
        rawDate: new Date().toISOString(),
        reviewId: null,
        ...action.payload, // { type, message }
      });
    },

    // On logout — see the header note about cross-clinic leakage.
    resetNotifications() {
      return initialState;
    },
  },
});

export const {
  fetchStart,
  setNotifications,
  fetchFailure,
  markAsRead,
  markAllAsRead,
  dismiss,
  addNotification,
  resetNotifications,
} = notificationsSlice.actions;

// ── Selectors ─────────────────────────────────────────────────────────────────
export const selectNotifications = (state) => state.notifications.items;

export const selectUnreadCount = (state) =>
  state.notifications.items.filter((n) => !n.read).length;

export const selectUrgentCount = (state) =>
  state.notifications.items.filter((n) => n.type === "urgent" && !n.read).length;

/** Lets the bell tell "not fetched yet" from "genuinely all caught up". */
export const selectNotificationsHydrated = (state) => state.notifications.hydrated;

export default notificationsSlice.reducer;