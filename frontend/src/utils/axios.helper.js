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
// The 403 branch below dispatches into the store from outside React. Safe to
// import here: store.js pulls in the slices only, never this file, so there is
// no cycle.
import store from "../store/store.js";

// ── API base ─────────────────────────────────────────────────────────────────
// The localhost default is DEV-ONLY on purpose. It used to apply to every
// build, so a production bundle with VITE_API_URL unset silently shipped
// pointing at http://localhost:5000 — every request in the deployed app failed
// against the user's own machine, and nothing in the build output said so.
//
// Two guards, because they catch it at different moments:
//   * vite.config.js fails `vite build` outright when VITE_API_URL is unset —
//     that is the one that stops a broken bundle from ever being deployed.
//   * the throw below is the backstop for anything that reaches this module
//     without a base URL anyway (a hand-rolled bundler, a test harness). It
//     surfaces in the browser rather than at deploy time, so it is the weaker
//     of the two — but a blank page with a precise console error still beats
//     an app that silently calls the visitor's own machine.
//
// VITE_API_URL is inlined at BUILD time, so it must be present when
// `vite build` runs — setting it on the server afterwards is too late.
const API_BASE =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "http://localhost:5000/api/v1" : null);

if (!API_BASE) {
  throw new Error(
    "VITE_API_URL is not set. Production builds have no API URL to fall back to — " +
      "set it in your hosting provider's build environment (e.g. Vercel → Settings → " +
      "Environment Variables) and rebuild.",
  );
}

// ── Base instance ─────────────────────────────────────────────────────────────
// 10s suits ordinary CRUD. Two endpoints legitimately exceed it and pass their
// own timeout at the call site: POST /reviews/sync (walks paginated provider
// APIs) and POST /campaigns (parses up to 300KB of CSV). Without that, both
// aborted client-side while the server completed, and the retry double-sent.
const axiosInstance = axios.create({
  baseURL: API_BASE,
  withCredentials: true, // sends httpOnly cookies (refresh token)
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

/** Timeout for endpoints that do real work. Use as: { timeout: LONG_TIMEOUT } */
export const LONG_TIMEOUT = 60000;

// ── Single-flight refresh ─────────────────────────────────────────────────────
// The backend ROTATES the refresh token on every /auth/refresh-token call and
// rejects any token that doesn't match the stored one. So N concurrent 401s
// firing N refreshes means the first response invalidates the rest, and the
// user is logged out mid-session for no reason. All callers share one in-flight
// promise instead.
let refreshPromise = null;

const refreshAccessToken = () => {
  refreshPromise ??= axios
    .post(`${API_BASE}/auth/refresh-token`, {}, { withCredentials: true })
    .then(({ data }) => {
      const newToken = data?.data?.accessToken;
      if (!newToken) throw new Error("No access token in refresh response");
      localStorage.setItem("token", newToken);
      axiosInstance.defaults.headers.common["Authorization"] = `Bearer ${newToken}`;
      return newToken;
    })
    .finally(() => {
      // Clear regardless of outcome so a later 401 can try again.
      refreshPromise = null;
    });

  return refreshPromise;
};

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
        // Shared in-flight promise — see refreshAccessToken above for why this
        // must not be one request per caller.
        const newToken = await refreshAccessToken();

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
