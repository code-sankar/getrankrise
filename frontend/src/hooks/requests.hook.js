/**
 * requests.hook.js
 * All API calls related to sending review requests to patients.
 * Dispatches to userSlice and requestsSlice after responses.
 *
 * Usage:
 *   import { getUserRequests, sendReviewRequest } from "../hooks/requests.hook";
 *   await sendReviewRequest(dispatch, formData);
 */

import { toast } from "react-toastify";
import axiosInstance from "../utils/axios.helper.js";
import { getFriendlyError } from "../utils/parseErrorMsg.js";
import {
  addUserRequests,
  removeUserRequests,
  addSingleUserRequest,
  updateUserRequestStatus,
  addSingleUserActivity,
} from "../store/userSlice.js";
import {
  sendRequestStart,
  sendRequestSuccess,
  sendRequestFailure,
} from "../store/requestsSlice.js";

// ── Fetch all recent review requests ─────────────────────────────────────────
export const getUserRequests = async (dispatch) => {
  try {
    const response = await axiosInstance.get("/requests");
    if (response?.data?.data) {
      dispatch(addUserRequests(response.data.data));
      return response.data;
    }
  } catch (error) {
    console.error("getUserRequests error:", error);
  }
};

// ── Send a new review request to a patient ────────────────────────────────────
export const sendReviewRequest = async (dispatch, formData) => {
  dispatch(sendRequestStart());
  try {
    const response = await axiosInstance.post("/requests", formData);
    if (response?.data?.data) {
      const newRequest = response.data.data;

      // Add to userSlice
      dispatch(addSingleUserRequest(newRequest));

      // Update requestsSlice (updates form + recent list)
      dispatch(sendRequestSuccess({
        name:    formData.patientName,
        contact: formData.sendVia === "SMS" ? formData.phone : formData.email,
        via:     formData.sendVia,
        message: `Review request sent to ${formData.patientName} via ${formData.sendVia}!`,
      }));

      // Log activity
      dispatch(addSingleUserActivity({
        _id:    Date.now().toString(),
        action: `Sent review request to ${formData.patientName}`,
        time:   "Just now",
        icon:   "✉",
        type:   "info",
      }));

      toast.success(`Request sent to ${formData.patientName}!`);
      return response.data;
    }
  } catch (error) {
    const msg = getFriendlyError(error.response?.data?.message);
    dispatch(sendRequestFailure(msg));
    toast.error(msg);
    console.error("sendReviewRequest error:", error);
    throw error;
  }
};

// ── Update the status of a request (e.g. Sent → Opened) ──────────────────────
export const updateRequestStatus = async (dispatch, requestId, status) => {
  try {
    await axiosInstance.patch(`/requests/${requestId}/status`, { status });
    dispatch(updateUserRequestStatus({ requestId, status }));
  } catch (error) {
    console.error("updateRequestStatus error:", error);
  }
};

// ── Clear requests from store ─────────────────────────────────────────────────
export const clearUserRequests = (dispatch) => {
  dispatch(removeUserRequests());
};