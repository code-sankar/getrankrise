import { createSlice } from "@reduxjs/toolkit";

// ── Initial State ─────────────────────────────────────────────────────────────
// Mirrors exactly what the backend will return per user.
// Each field has a matching add/remove action pair following reference pattern.
const initialState = {
  // Core user/clinic identity
  user:               null,  // { _id, name, email, role, avatar, createdAt }
  userClinic:         null,  // { _id, clinicName, phone, location, googleUrl, reviewLink }

  // Reviews the clinic has received
  userReviews:        [],    // [ { _id, platform, rating, text, replied, date } ]

  // Review requests sent to patients
  userRequests:       [],    // [ { _id, patientName, contact, via, status, sentAt } ]

  // Notifications for this user
  userNotifications:  [],    // [ { _id, type, message, read, time } ]

  // Analytics / performance data
  userAnalytics:      null,  // { totalReviews, avgRating, responseRate, sentimentScore, ... }

  // Competitor clinics tracked by this user
  userCompetitors:    [],    // [ { _id, name, rating, totalReviews, responseRate } ]

  // Settings / notification preferences
  userSettings:       null,  // { urgentAlerts, newReviewAlert, weeklyReport, monthlyReport }

  // Activity log
  userActivity:       [],    // [ { _id, action, time, icon, type } ]

  // Subscription plan
  userSubscription:   null,  // { plan, status, renewsAt, features: [] }
};
// ─────────────────────────────────────────────────────────────────────────────

const userSlice = createSlice({
  name: "user",
  initialState,
  reducers: {

    // ── Core User ──────────────────────────────────────────────────────────
    addUser: (state, action) => {
      state.user = action.payload;
    },
    removeUser: (state) => {
      state.user = null;
    },

    // ── Clinic Profile ─────────────────────────────────────────────────────
    addUserClinic: (state, action) => {
      state.userClinic = action.payload;
    },
    removeUserClinic: (state) => {
      state.userClinic = null;
    },
    updateUserClinicName: (state, action) => {
      if (state.userClinic) {
        state.userClinic.clinicName = action.payload;
      }
    },

    // ── Reviews ────────────────────────────────────────────────────────────
    addUserReviews: (state, action) => {
      state.userReviews = [...state.userReviews, ...action.payload];
    },
    removeUserReviews: (state) => {
      state.userReviews = [];
    },
    // Toggle replied status on a single review
    toggleUserReviewReplied: (state, action) => {
      state.userReviews = state.userReviews.map((review) =>
        review._id === action.payload
          ? { ...review, replied: true }
          : review
      );
    },

    // ── Review Requests ────────────────────────────────────────────────────
    addUserRequests: (state, action) => {
      state.userRequests = [...state.userRequests, ...action.payload];
    },
    removeUserRequests: (state) => {
      state.userRequests = [];
    },
    // Add a single new request to top of list (after sending)
    addSingleUserRequest: (state, action) => {
      state.userRequests = [action.payload, ...state.userRequests];
    },
    // Update status of a specific request (e.g. "Sent" → "Opened" → "Reviewed")
    updateUserRequestStatus: (state, action) => {
      state.userRequests = state.userRequests.map((req) =>
        req._id === action.payload.requestId
          ? { ...req, status: action.payload.status }
          : req
      );
    },

    // ── Notifications ──────────────────────────────────────────────────────
    addUserNotifications: (state, action) => {
      state.userNotifications = [...state.userNotifications, ...action.payload];
    },
    removeUserNotifications: (state) => {
      state.userNotifications = [];
    },
    // Add a single new notification (e.g. after replying to a review)
    addSingleUserNotification: (state, action) => {
      state.userNotifications = [action.payload, ...state.userNotifications];
    },
    // Mark a single notification as read
    toggleUserNotificationRead: (state, action) => {
      state.userNotifications = state.userNotifications.map((notif) =>
        notif._id === action.payload
          ? { ...notif, read: true }
          : notif
      );
    },
    // Mark all notifications as read
    markAllUserNotificationsRead: (state) => {
      state.userNotifications = state.userNotifications.map((notif) => ({
        ...notif,
        read: true,
      }));
    },
    // Dismiss (remove) a single notification
    dismissUserNotification: (state, action) => {
      state.userNotifications = state.userNotifications.filter(
        (notif) => notif._id !== action.payload
      );
    },

    // ── Analytics ──────────────────────────────────────────────────────────
    addUserAnalytics: (state, action) => {
      state.userAnalytics = action.payload;
    },
    removeUserAnalytics: (state) => {
      state.userAnalytics = null;
    },

    // ── Competitors ────────────────────────────────────────────────────────
    addUserCompetitors: (state, action) => {
      state.userCompetitors = [...state.userCompetitors, ...action.payload];
    },
    removeUserCompetitors: (state) => {
      state.userCompetitors = [];
    },
    // Toggle tracking a competitor (add if not tracked, remove if tracked)
    toggleUserCompetitor: (state, action) => {
      const exists = state.userCompetitors.find(
        (c) => c._id === action.payload._id
      );
      if (exists) {
        state.userCompetitors = state.userCompetitors.filter(
          (c) => c._id !== action.payload._id
        );
      } else {
        state.userCompetitors = [action.payload, ...state.userCompetitors];
      }
    },

    // ── Settings ───────────────────────────────────────────────────────────
    addUserSettings: (state, action) => {
      state.userSettings = action.payload;
    },
    removeUserSettings: (state) => {
      state.userSettings = null;
    },
    // Toggle a single notification preference
    toggleUserSettingNotification: (state, action) => {
      if (state.userSettings) {
        state.userSettings[action.payload] = !state.userSettings[action.payload];
      }
    },

    // ── Activity Log ───────────────────────────────────────────────────────
    addUserActivity: (state, action) => {
      state.userActivity = [...state.userActivity, ...action.payload];
    },
    removeUserActivity: (state) => {
      state.userActivity = [];
    },
    // Prepend a new single activity entry
    addSingleUserActivity: (state, action) => {
      state.userActivity = [action.payload, ...state.userActivity];
    },

    // ── Subscription ───────────────────────────────────────────────────────
    addUserSubscription: (state, action) => {
      state.userSubscription = action.payload;
    },
    removeUserSubscription: (state) => {
      state.userSubscription = null;
    },
    // Update plan (e.g. after upgrade)
    updateUserSubscriptionPlan: (state, action) => {
      if (state.userSubscription) {
        state.userSubscription.plan = action.payload;
      }
    },

    // ── On logout — clear the WHOLE mirror in one action ──────────────────
    // logoutUser used to dispatch removeUser() + removeUserClinic() and stop
    // there, which left userReviews, userRequests, userNotifications,
    // userAnalytics, userCompetitors, userSettings, userActivity and
    // userSubscription populated with the previous clinic's data.
    //
    // One action rather than eight remove* calls, deliberately: the failure
    // mode being fixed is "somebody added a field and forgot to clear it on
    // logout", and a list of eight calls at the call site reproduces exactly
    // that. Returning initialState covers every field this slice will ever
    // have, including the ones not written yet.
    resetUser() {
      return initialState;
    },
  },
});

export const {
  // User
  addUser,
  removeUser,

  // Clinic
  addUserClinic,
  removeUserClinic,
  updateUserClinicName,

  // Reviews
  addUserReviews,
  removeUserReviews,
  toggleUserReviewReplied,

  // Requests
  addUserRequests,
  removeUserRequests,
  addSingleUserRequest,
  updateUserRequestStatus,

  // Notifications
  addUserNotifications,
  removeUserNotifications,
  addSingleUserNotification,
  toggleUserNotificationRead,
  markAllUserNotificationsRead,
  dismissUserNotification,

  // Analytics
  addUserAnalytics,
  removeUserAnalytics,

  // Competitors
  addUserCompetitors,
  removeUserCompetitors,
  toggleUserCompetitor,

  // Settings
  addUserSettings,
  removeUserSettings,
  toggleUserSettingNotification,

  // Activity
  addUserActivity,
  removeUserActivity,
  addSingleUserActivity,

  // Subscription
  addUserSubscription,
  removeUserSubscription,
  updateUserSubscriptionPlan,

  // Logout
  resetUser,
} = userSlice.actions;

export default userSlice.reducer;