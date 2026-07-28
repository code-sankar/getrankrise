import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import axiosInstance from "../utils/axios.helper.js";
import {
  hydrateSession,
  setBootstrapped,
  logout,
  loginSuccess,
} from "../store/authSlice.js";
import {
  isMockToken,
  MOCK_TOKEN,
  MOCK_USER,
  DEMO_AUTH_ENABLED,
} from "../mocks/mockAuth.js";

/**
 * AppBootstrap
 * ──────────────────────────────────────────────────────────────────────────
 * Runs once on app mount. If we have a token in localStorage, calls /auth/me
 * to verify it's still valid and hydrate the Redux store with user + clinic.
 *
 * If the probe fails (token expired, network error, etc.), clears local state
 * and marks the app as bootstrapped so PrivateRoute can redirect to /login.
 *
 * Demo login: when the stored token is the mock sentinel (set by the login
 * form when the demo credentials are used), we re-hydrate the demo session
 * and skip the /auth/me probe so it survives page refreshes with no backend.
 */
export default function AppBootstrap({ children }) {
  const dispatch = useDispatch();
  const token = useSelector((state) => state.auth.token);
  const bootstrapped = useSelector((state) => state.auth.bootstrapped);

  useEffect(() => {
    let cancelled = false;

    const probe = async () => {
      // ── Demo session: skip the network probe, restore the fake session ───
      if (isMockToken(token)) {
        dispatch(loginSuccess({ accessToken: MOCK_TOKEN, user: MOCK_USER }));
        return;
      }

      // No token? Nothing to hydrate. Mark bootstrapped immediately.
      if (!token) {
        dispatch(setBootstrapped());
        return;
      }

      try {
        const { data } = await axiosInstance.get("/auth/me");
        if (cancelled) return;
        if (data?.data) {
          dispatch(hydrateSession(data.data));
        } else {
          dispatch(setBootstrapped());
        }
      } catch (err) {
        if (cancelled) return;
        // 401 already handled by axios interceptor; this catches network errors etc.
        // Either way, clear session so PrivateRoute sends us to /login.
        console.warn("Session probe failed:", err?.message);
        dispatch(logout());
      }
    };

    probe();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Centered loading spinner while we figure out who you are
  if (!bootstrapped) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#030712]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-slate-700 border-t-blue-500 animate-spin" />
          <p className="text-xs text-slate-500 font-medium tracking-widest uppercase">
            Loading GetRankRise
          </p>
        </div>
      </div>
    );
  }

  return children;
}
