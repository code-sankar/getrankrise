// frontend/src/components/Dashboard/SyncNowButton.jsx
//
// The manual "Sync now" control for POST /api/v1/reviews/sync.
//
// That endpoint has had a route (review.routes.js), a controller with
// reserve-before-sync metering and refund-on-failure (reviewSync.controller.js)
// and a daily budget in config/plans.js for some time. Nothing in the UI ever
// called it. This is that call.
//
// ── WHY THE ERROR HANDLING LIVES IN THE HOOK, NOT HERE ──────────────────────
// syncReviewsNow() in hooks/reviews.hook.js owns the toasts, because the
// failure modes are backend contracts (NO_CONNECTION / GBP_NOT_APPROVED /
// GBP_AUTH / 403 UPGRADE_REQUIRED) and phrasing them in a button would put
// API knowledge in a presentational component. This file owns exactly two
// things: the spinner and the refetch.
//
// ── FREE TIER ───────────────────────────────────────────────────────────────
// reviewSyncsPerDay is 0 on Free, so the reservation inside the controller
// returns 403 UPGRADE_REQUIRED and the axios interceptor opens the upgrade
// modal. That is the intended funnel and the button stays visible on purpose
// — a hidden button teaches nothing. It becomes a genuine dead end only until
// Step 4 lands the one-time initial sync for Free clinics.

import { useState } from "react";
import { useDispatch } from "react-redux";
import { syncReviewsNow } from "../../hooks/reviews.hook.js";

export default function SyncNowButton({ dark, onSynced }) {
  const dispatch = useDispatch();
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      await syncReviewsNow(dispatch);
      // Refetch regardless of how many rows were created: an "up to date"
      // sync can still have UPDATED existing rows (rating edits, replies
      // imported from the platform), and the list should reflect that.
      await onSynced?.();
    } catch {
      // Already toasted in the hook. Swallow so the spinner clears.
    } finally {
      setSyncing(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleSync}
      disabled={syncing}
      title="Fetch new reviews from your connected platforms"
      className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 ${
        dark
          ? "border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-500 hover:text-white bg-slate-800/40"
          : "border-slate-200 text-slate-600 dark:text-slate-400 hover:border-slate-300 hover:text-slate-900 bg-white"
      }`}
    >
      <svg
        className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
      {syncing ? "Syncing…" : "Sync now"}
    </button>
  );
}