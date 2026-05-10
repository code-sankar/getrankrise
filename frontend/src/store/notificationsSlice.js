import { createSlice } from "@reduxjs/toolkit";

const notificationsSlice = createSlice({
  name: "notifications",
  initialState: {
    items: [
      {
        id: 1,
        type: "urgent",
        message: "New 1-star review from Linda Park",
        read: false,
        time: "5 min ago",
      },
      {
        id: 2,
        type: "urgent",
        message: "New 2-star review from Marcus Webb",
        read: false,
        time: "3 hours ago",
      },
      {
        id: 3,
        type: "info",
        message: "Monthly report is ready to download",
        read: true,
        time: "1 day ago",
      },
      {
        id: 4,
        type: "success",
        message: "Review request sent to 12 patients",
        read: true,
        time: "2 days ago",
      },
    ],
  },
  reducers: {
    // Mark a single notification as read
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

    // Add a new notification (called after events like sending a request)
    addNotification(state, action) {
      state.items.unshift({
        id: Date.now(),
        read: false,
        time: "Just now",
        ...action.payload, // { type, message }
      });
    },
  },
});

export const { markAsRead, markAllAsRead, dismiss, addNotification } =
  notificationsSlice.actions;

// ── Selectors ─────────────────────────────────────────────────────────────────
export const selectUnreadCount = (state) =>
  state.notifications.items.filter((n) => !n.read).length;

export const selectUrgentCount = (state) =>
  state.notifications.items.filter((n) => n.type === "urgent" && !n.read)
    .length;

export default notificationsSlice.reducer;
