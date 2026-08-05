// frontend/src/store/sessionTeardown.js
//
// The single definition of "what has to be forgotten when a session ends".
//
// ── Why this is its own module ──────────────────────────────────────────────
// Signing out has three obligations, and every caller that reimplemented it
// satisfied a different subset:
//
//   Sidebar.handleLogout    cleared the auth slice, never called the server —
//                           so the refresh_tokens row and the httpOnly cookie
//                           stayed live for the token's full 7-day life.
//   logoutUser              called the server, cleared two userSlice fields,
//                           and never touched the auth slice at all — so
//                           state.auth.isAuthenticated stayed true, which is
//                           exactly what PrivateRoute and PublicOnlyRoute read.
//
// Neither cleared the tenant-scoped caches. Four reset actions had been written
// for precisely that purpose, each with a comment explaining the leak it
// prevented, and not one was ever dispatched. Because logout is SPA navigation,
// the store survives it: the next person to sign in on that tab saw the
// PREVIOUS clinic's reviews, send history, notifications and analytics until
// their own fetches landed — patient review content crossing a tenant boundary,
// on the shared front-desk machine this product is designed for.
//
// Collecting the teardown here means there is one list to keep correct instead
// of one per call site. Adding a tenant-scoped slice? Add its reset below and
// every logout path in the app picks it up.
//
// ── Why it has no network call and no React ─────────────────────────────────
// Deliberately pure: dispatch in, dispatch out. Revoking the server session is
// logoutUser's job (it owns the axios instance), and keeping this module free
// of axios.helper.js — which reads Vite's import.meta.env at module scope and
// throws outside a Vite build — is what lets store/sessionTeardown.test.js
// exercise the real reducers under plain `node --test`.

import { logout as authLogout } from "./authSlice.js";
import { resetUser } from "./userSlice.js";
import { resetReviews } from "./reviewsSlice.js";
import { resetRequests } from "./requestsSlice.js";
import { resetNotifications } from "./notificationsSlice.js";
import { resetAnalytics } from "./analyticsSlice.js";
import { resetCompetitors } from "./competitorsSlice.js";

/**
 * Every action a sign-out must dispatch, in order.
 *
 * Exported as data rather than hidden inside the function below so the test can
 * assert on the list itself — "does this cover every tenant-scoped slice in the
 * store?" is the question that actually matters, and it is answerable against
 * an array in a way it is not against a function body.
 */
export const SESSION_TEARDOWN_ACTIONS = [
  // Identity. Also clears localStorage.token — do not remove that key
  // separately anywhere else, or the two places drift the next time it changes.
  authLogout,

  // Tenant-scoped data. userSlice mirrors several of the others, so it is reset
  // too: clearing reviewsSlice while userSlice still holds the same rows would
  // fix only the half that happens to be rendered today.
  resetUser,
  resetReviews,
  resetRequests,
  resetNotifications,
  resetAnalytics,
  resetCompetitors,
];

/**
 * Forgets everything belonging to the outgoing session.
 *
 * Safe to call twice — every action is either an assignment to null/false or a
 * `return initialState`, so a double sign-out is a no-op rather than a crash.
 *
 * @param {import("redux").Dispatch} dispatch
 */
export const clearSessionState = (dispatch) => {
  for (const action of SESSION_TEARDOWN_ACTIONS) dispatch(action());
};
