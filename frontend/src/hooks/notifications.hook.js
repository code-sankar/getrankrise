/**
 * notifications.hook.js
 * All API calls related to notifications.
 * Dispatches to both userSlice and notificationsSlice.
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
  markAsRead,
  markAllAsRead,
  dismiss,
} from "../store/notificationsSlice.js";

// ── Fetch all notifications for the user ──────────────────────────────────────
export const getUserNotifications = async (dispatch) => {
  try {
    const response = await axiosInstance.get("/notifications");
    if (response?.data?.data) {
      dispatch(addUserNotifications(response.data.data));
      return response.data;
    }
  } catch (error) {
    console.error("getUserNotifications error:", error);
  }
};

// ── Mark a single notification as read ────────────────────────────────────────
export const markNotificationRead = async (dispatch, notificationId) => {
  try {
    // Optimistic update both slices immediately
    dispatch(toggleUserNotificationRead(notificationId));
    dispatch(markAsRead(notificationId));
    await axiosInstance.patch(`/notifications/${notificationId}/read`);
  } catch (error) {
    // Revert on failure
    dispatch(toggleUserNotificationRead(notificationId));
    dispatch(markAsRead(notificationId));
    console.error("markNotificationRead error:", error);
  }
};

// ── Mark all notifications as read ───────────────────────────────────────────
export const markAllNotificationsRead = async (dispatch) => {
  try {
    // Optimistic update
    dispatch(markAllUserNotificationsRead());
    dispatch(markAllAsRead());
    await axiosInstance.patch("/notifications/read-all");
  } catch (error) {
    console.error("markAllNotificationsRead error:", error);
    toast.error("Failed to mark notifications as read.");
  }
};

// ── Dismiss (delete) a single notification ────────────────────────────────────
export const dismissNotification = async (dispatch, notificationId) => {
  try {
    // Optimistic update
    dispatch(dismissUserNotification(notificationId));
    dispatch(dismiss(notificationId));
    await axiosInstance.delete(`/notifications/${notificationId}`);
  } catch (error) {
    console.error("dismissNotification error:", error);
  }
};

// ── Clear all notifications locally (e.g. on logout) ─────────────────────────
export const clearUserNotifications = (dispatch) => {
  dispatch(removeUserNotifications());
};