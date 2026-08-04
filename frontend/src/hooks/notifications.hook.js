/**
 * notifications.hook.js
 * All API calls related to notifications.
 *
 * ── WHAT CHANGED AND WHY ────────────────────────────────────────────────────
 * The fetch used to dispatch ONLY addUserNotifications (userSlice). Nothing
 * rendered that field — NotificationBell reads state.notifications.items,
 * which is notificationsSlice. So even once the backend existed, the bell
 * stayed empty. Every function below now dispatches to notificationsSlice as
 * the primary target, mirroring into userSlice for the components that read
 * it there.
 *
 * The mutations are optimistic: update locally, then confirm against the API.
 * On failure they REFETCH rather than trying to invert the local change —
 * markAsRead sets read=true rather than toggling it, so the old "dispatch it
 * again to revert" path re-applied the change instead of undoing it.
 *
 * Usage:
 *   import { getUserNotifications, markNotificationRead } from "../hooks/notifications.hook";
 *   await getUserNotifications(dispatch);
 */

import { toast } from "react-toastify";
import axiosInstance from "../utils/axios.helper.js";
import {
  addUserNotifications,
  removeUserNotifications,
  toggleUserNotificationRead,
  markAllUserNotificationsRead,
  dismissUserNotification,
} from "../store/userSlice.js";
import {
  fetchStart,
  setNotifications,
  fetchFailure,
  markAsRead,
  markAllAsRead,
  dismiss,
} from "../store/notificationsSlice.js";

// ── Fetch all notifications for the user ──────────────────────────────────────
// GET /notifications returns a bare array in `data`. setNotifications REPLACES
// the list (and normalises each row); addUserNotifications appends, which is
// why only the former is safe to call on every refetch.
export const getUserNotifications = async (dispatch) => {
  dispatch(fetchStart());
  try {
    const response = await axiosInstance.get("/notifications");
    const rows = Array.isArray(response?.data?.data) ? response.data.data : [];
    dispatch(setNotifications(rows));
    dispatch(addUserNotifications(rows));
    return rows;
  } catch (error) {
    console.error("getUserNotifications error:", error);
    // hydrated becomes true either way, so the bell can tell "failed" from
    // "genuinely nothing" instead of showing "All caught up!" on a 500.
    dispatch(fetchFailure(error?.response?.data?.message || "Failed to load"));
    return [];
  }
};

// ── Mark a single notification as read ────────────────────────────────────────
export const markNotificationRead = async (dispatch, notificationId) => {
  dispatch(markAsRead(notificationId));
  dispatch(toggleUserNotificationRead(notificationId));
  try {
    await axiosInstance.patch(`/notifications/${notificationId}/read`);
  } catch (error) {
    console.error("markNotificationRead error:", error);
    await getUserNotifications(dispatch); // resync to server truth
  }
};

// ── Mark all notifications as read ───────────────────────────────────────────
export const markAllNotificationsRead = async (dispatch) => {
  dispatch(markAllAsRead());
  dispatch(markAllUserNotificationsRead());
  try {
    await axiosInstance.patch("/notifications/read-all");
  } catch (error) {
    console.error("markAllNotificationsRead error:", error);
    toast.error("Failed to mark notifications as read.");
    await getUserNotifications(dispatch);
  }
};

// ── Dismiss (delete) a single notification ────────────────────────────────────
export const dismissNotification = async (dispatch, notificationId) => {
  dispatch(dismiss(notificationId));
  dispatch(dismissUserNotification(notificationId));
  try {
    await axiosInstance.delete(`/notifications/${notificationId}`);
  } catch (error) {
    console.error("dismissNotification error:", error);
    await getUserNotifications(dispatch); // the row is still there — put it back
  }
};

// ── Clear all notifications locally (e.g. on logout) ─────────────────────────
export const clearUserNotifications = (dispatch) => {
  dispatch(removeUserNotifications());
};
