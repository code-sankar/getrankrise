/**
 * user.hook.js
 * All API calls related to the user profile and clinic.
 * Each function dispatches to userSlice after a successful response.
 *
 * Usage in a component:
 *   import { getUserProfile, updateUserClinic } from "../hooks/user.hook";
 *   await getUserProfile(dispatch);
 */

import { toast } from "react-toastify";
import axiosInstance from "../utils/axios.helper.js";
import { getFriendlyError } from "../utils/parseErrorMsg.js";
import {
  addUser,
  addUserClinic,
  updateUserClinicName,
  addUserSettings,
  toggleUserSettingNotification,
  addUserSubscription,
} from "../store/userSlice.js";
// The one definition of what a sign-out has to forget. See that file for the
// three obligations and which caller used to drop which.
import { clearSessionState } from "../store/sessionTeardown.js";

// ── Get current logged-in user profile ───────────────────────────────────────
export const getUserProfile = async (dispatch) => {
  try {
    const response = await axiosInstance.get("/auth/me");
    if (response?.data?.data) {
      dispatch(addUser(response.data.data));
      return response.data;
    }
  } catch (error) {
    const msg = getFriendlyError(error.response?.data?.message);
    toast.error(msg);
    console.error("getUserProfile error:", error);
  }
};

// ── Get clinic profile for the logged-in user ─────────────────────────────────
export const getUserClinic = async (dispatch) => {
  try {
    const response = await axiosInstance.get("/clinic/me");
    if (response?.data?.data) {
      dispatch(addUserClinic(response.data.data));
      return response.data;
    }
  } catch (error) {
    console.error("getUserClinic error:", error);
  }
};

// ── Update clinic profile ─────────────────────────────────────────────────────
export const updateUserClinic = async (dispatch, clinicData) => {
  try {
    const response = await axiosInstance.put("/clinic/me", clinicData);
    if (response?.data?.data) {
      dispatch(addUserClinic(response.data.data));
      // Also sync clinic name if it changed
      if (clinicData.clinicName) {
        dispatch(updateUserClinicName(clinicData.clinicName));
      }
      toast.success("Clinic profile updated!");
      return response.data;
    }
  } catch (error) {
    const msg = getFriendlyError(error.response?.data?.message);
    toast.error(msg);
    console.error("updateUserClinic error:", error);
  }
};

// ── Get user notification settings ───────────────────────────────────────────
export const getUserSettings = async (dispatch) => {
  try {
    const response = await axiosInstance.get("/settings");
    if (response?.data?.data) {
      dispatch(addUserSettings(response.data.data));
      return response.data;
    }
  } catch (error) {
    console.error("getUserSettings error:", error);
  }
};

// ── Update notification settings ─────────────────────────────────────────────
export const updateUserSettings = async (dispatch, settings) => {
  try {
    const response = await axiosInstance.put("/settings", settings);
    if (response?.data?.data) {
      dispatch(addUserSettings(response.data.data));
      toast.success("Settings saved!");
      return response.data;
    }
  } catch (error) {
    const msg = getFriendlyError(error.response?.data?.message);
    toast.error(msg);
    console.error("updateUserSettings error:", error);
  }
};

// ── Toggle a single notification preference ───────────────────────────────────
export const toggleSettingNotification = async (dispatch, key) => {
  try {
    // Optimistic update — update Redux immediately, sync with backend
    dispatch(toggleUserSettingNotification(key));
    await axiosInstance.patch(`/settings/toggle`, { key });
  } catch (error) {
    // Revert on failure
    dispatch(toggleUserSettingNotification(key));
    toast.error("Failed to update preference.");
    console.error("toggleSettingNotification error:", error);
  }
};

// ── Change password ────────────────────────────────────────────────────────────
export const changeUserPassword = async (currentPassword, newPassword) => {
  try {
    const response = await axiosInstance.put("/auth/change-password", {
      currentPassword,
      newPassword,
    });

    // The server now ends every session on a password change and re-issues one
    // for THIS device. Adopting the new access token keeps the current tab
    // working seamlessly; without it the tab would keep using the old one until
    // it expired, which still works but leaves a stale credential in play.
    const { accessToken, otherSessionsEnded } = response?.data?.data ?? {};
    if (accessToken) {
      localStorage.setItem("token", accessToken);
      axiosInstance.defaults.headers.common["Authorization"] = `Bearer ${accessToken}`;
    }

    toast.success(
      otherSessionsEnded > 0
        ? `Password updated. Signed out of ${otherSessionsEnded} other device${otherSessionsEnded === 1 ? "" : "s"}.`
        : "Password updated successfully!",
    );
    return response.data;
  } catch (error) {
    const msg = getFriendlyError(error.response?.data?.message);
    toast.error(msg);
    console.error("changeUserPassword error:", error);
    throw error; // re-throw so the component can handle it
  }
};

// NOTE: there is no getUserActivity() here on purpose. It used to GET
// /activity, an endpoint the backend has never implemented, and nothing
// rendered the result (the Activity tab is absent from ProfileTabs). The
// userActivity slice field stays — reviews.hook and requests.hook still push
// client-side entries onto it via addSingleUserActivity. Restore this fetch
// when a server-side activity feed actually exists to call.

// ── Get user subscription ─────────────────────────────────────────────────────
export const getUserSubscription = async (dispatch) => {
  try {
    const response = await axiosInstance.get("/subscription");
    if (response?.data?.data) {
      dispatch(addUserSubscription(response.data.data));
      return response.data;
    }
  } catch (error) {
    console.error("getUserSubscription error:", error);
  }
};

// ── Logout user ───────────────────────────────────────────────────────────────
//
// THE single logout path. Sidebar and Settings both call this; nothing else
// should sign a user out, because "sign out" is three separate obligations and
// each caller that reimplements it has historically satisfied a different two:
//
//   1. END THE SERVER SESSION.  POST /auth/logout revokes the refresh_tokens
//      row and clears the httpOnly cookie. Only the server can do the latter —
//      JS cannot touch an httpOnly cookie — so a client-only logout leaves a
//      live, redeemable session behind for the token's full 7-day life. The
//      Sidebar button (on every authenticated page) did exactly that: it
//      dispatched the auth reducer and navigated away, and anyone on that
//      shared front-desk browser could mint a fresh access token afterwards
//      with a single POST to /auth/refresh-token.
//
//   2. CLEAR THE AUTH SLICE.  This function used to dispatch removeUser() and
//      removeUserClinic() — both from userSlice — and never authSlice.logout().
//      state.auth.isAuthenticated stayed true, and PrivateRoute/PublicOnlyRoute
//      both read exactly that. It only appeared to work because Settings.jsx
//      followed it with window.location.href, a hard reload that rebuilds the
//      store from an empty localStorage. Under SPA navigation the user would
//      have been bounced straight back to /dashboard by PublicOnlyRoute.
//
//   3. DROP THE TENANT-SCOPED CACHES.  Four reset actions existed for exactly
//      this and not one was ever dispatched. Because logout is SPA navigation,
//      the store survives it: the next person to sign in on that tab rendered
//      the PREVIOUS clinic's reviews, send history, notifications and analytics
//      until their own fetches landed. That is patient review content crossing
//      a tenant boundary, in a product whose deployment model is a shared
//      front-desk machine.
//
// (2) and (3) both live in store/sessionTeardown.js now, so there is one list
// to keep correct rather than one per call site. clearSessionState also owns
// localStorage.token — don't remove that key here as well, or the two places
// drift the next time it changes.
export const logoutUser = async (dispatch) => {
  try {
    await axiosInstance.post("/auth/logout");
  } catch (error) {
    // A failed revoke must not strand the user in a signed-in UI. The local
    // teardown below runs regardless; the worst case is a server session that
    // outlives the client one — the pre-existing behaviour, not a regression
    // introduced by swallowing this.
    console.error("logoutUser error:", error);
  } finally {
    clearSessionState(dispatch);
    localStorage.removeItem("clinicName");
    localStorage.removeItem("userEmail");
  }
};