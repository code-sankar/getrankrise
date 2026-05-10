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
  removeUser,
  addUserClinic,
  removeUserClinic,
  updateUserClinicName,
  addUserSettings,
  toggleUserSettingNotification,
  addUserActivity,
  addUserSubscription,
} from "../store/userSlice.js";

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
    toast.success("Password updated successfully!");
    return response.data;
  } catch (error) {
    const msg = getFriendlyError(error.response?.data?.message);
    toast.error(msg);
    console.error("changeUserPassword error:", error);
    throw error; // re-throw so the component can handle it
  }
};

// ── Get user activity log ─────────────────────────────────────────────────────
export const getUserActivity = async (dispatch) => {
  try {
    const response = await axiosInstance.get("/activity");
    if (response?.data?.data) {
      dispatch(addUserActivity(response.data.data));
      return response.data;
    }
  } catch (error) {
    console.error("getUserActivity error:", error);
  }
};

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
export const logoutUser = async (dispatch) => {
  try {
    await axiosInstance.post("/auth/logout");
  } catch (error) {
    console.error("logoutUser error:", error);
  } finally {
    // Always clear local state regardless of API success
    dispatch(removeUser());
    dispatch(removeUserClinic());
    localStorage.removeItem("token");
    localStorage.removeItem("clinicName");
    localStorage.removeItem("userEmail");
  }
};