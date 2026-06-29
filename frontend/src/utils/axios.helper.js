/**
 * axios.helper.js
 * Central axios instance for all API calls in GetRankRise.
 *
 * Features:
 *   1. Attaches JWT token to every request automatically
 *   2. On 401 TokenExpiredError — silently refreshes token and retries
 *   3. On hard auth failure — clears token, redirects to login
 *   4. Shows toast notifications for auth errors
 */

import axios from "axios";
import { toast } from "react-toastify";
import { parseErrorMessage, getFriendlyError } from "./parseErrorMsg.js";
import { showUpgradeModal } from "../store/upgradeModalSlice.js";

// ── Base instance ─────────────────────────────────────────────────────────────
const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api/v1",
  withCredentials: true, // sends httpOnly cookies (refresh token)
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

// ── Request Interceptor ───────────────────────────────────────────────────────
// Attaches the access token to every outgoing request
axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers["Authorization"] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// ── Response Interceptor ──────────────────────────────────────────────────────
// Handles token expiry, retries the original request with a fresh token
axiosInstance.interceptors.response.use(
  // ── Success — pass through ────────────────────────────────────────────────
  (response) => response,

  // ── Error handling ────────────────────────────────────────────────────────
  async (error) => {
    // Guard against network errors with no response
    if (!error.response) {
      toast.error("Network error. Please check your connection.");
      return Promise.reject(error);
    }

    const originalRequest = error.config;
    const errorMsg = parseErrorMessage(error.response.data);
    const status = error.response.status;

    // ── Token Expired — try to refresh silently ───────────────────────────
    if (
      status === 401 &&
      errorMsg === "TokenExpiredError" &&
      !originalRequest._retry // prevent infinite retry loop
    ) {
      originalRequest._retry = true;

      try {
        // Call the refresh endpoint — uses httpOnly cookie automatically
        const { data } = await axios.post(
          `${import.meta.env.VITE_API_URL || "http://localhost:5000/api/v1"}/auth/refresh-token`,
          {},
          { withCredentials: true },
        );

        const newToken = data.data.accessToken;

        // Save new token
        localStorage.setItem("token", newToken);

        // Update default headers for future requests
        axiosInstance.defaults.headers.common["Authorization"] =
          `Bearer ${newToken}`;

        // Retry the original failed request with new token
        originalRequest.headers["Authorization"] = `Bearer ${newToken}`;
        return axiosInstance(originalRequest);
      } catch (refreshError) {
        // Refresh failed — session is fully expired
        console.error("Token refresh failed:", refreshError);
        localStorage.removeItem("token");
        localStorage.removeItem("clinicName");
        localStorage.removeItem("userEmail");
        toast.error("Session expired. Please log in again.");
        window.location.href = "/login";
        return Promise.reject(refreshError);
      }
    }

    // ── Other 401 — not a token expiry, just unauthorised ─────────────────
    if (status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login";
      return Promise.reject(error);
    }

    // ── 403 Forbidden ─────────────────────────────────────────────────────
    if (status === 403) {
      const code = error.response?.data?.code;

      if (code === "UPGRADE_REQUIRED" || code === "SUBSCRIPTION_INACTIVE") {
        store.dispatch(
          showUpgradeModal({
            currentPlan: error.response.data.currentPlan,
            requiredPlans: error.response.data.requiredPlans,
            message: error.response.data.message,
          }),
        );
        // Don't toast — the modal is the UX
      } else {
        toast.error(getFriendlyError("FORBIDDEN"));
      }
      return Promise.reject(error);
    }

    // ── 404 Not Found ─────────────────────────────────────────────────────
    if (status === 404) {
      // Don't toast — let the calling hook handle 404s
      return Promise.reject(error);
    }

    // ── 500 Server Error ──────────────────────────────────────────────────
    if (status >= 500) {
      toast.error("Server error. Please try again later.");
      return Promise.reject(error);
    }

    return Promise.reject(error);
  },
);

export default axiosInstance;
