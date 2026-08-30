/**
 * ReviewsQueueState.jsx
 * The non-"ready" states of the Dashboard reviews queue, now that the mock
 * list is gone and an empty store is the honest default.
 *
 * Three distinct situations that the old UI collapsed into one:
 *
 *   loading   first fetch in flight            → skeleton rows
 *   error     fetch failed, nothing cached     → retry card
 *   empty     confirmed zero reviews           → "connect / sync" onboarding
 *             nudge — NOT the "no results, clear filters" card, which is for
 *             when reviews exist but the active filters exclude them all.
 *
 * Plus <PlanCapBanner/> for free-tier clinics viewing a capped list.
 *
 * Usage in Dashboard.jsx (see PHASE-3-APPLY.md for the exact diff):
 *
 *   const viewState = useSelector(selectReviewsViewState);
 *   ...
 *   {viewState !== "ready" ? (
 *     <ReviewsQueueState state={viewState} dark={dark} onRetry={refetch} />
 *   ) : filteredReviews.length === 0 ? (
 *     <EmptyState dark={dark} onClear={handleClearFilters} />   // existing card
 *   ) : (
 *     filteredReviews.map(r => <ReviewCard key={r.id} review={r} />)
 *   )}
 */

import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import { selectReviewsCapped, selectReviewsTotal } from "../../store/reviewsSlice.js";

export default function ReviewsQueueState({ state, dark, onRetry }) {
  if (state === "loading") return <SkeletonRows dark={dark} />;
  if (state === "error") return <ErrorCard dark={dark} onRetry={onRetry} />;
  if (state === "empty") return <NoReviewsYet dark={dark} />;
  return null;
}

// ── Loading ──────────────────────────────────────────────────────────────────
function SkeletonRows({ dark }) {
  const bar = dark ? "bg-slate-800" : "bg-slate-200";
  return (
    <div className="p-6 space-y-4" aria-busy="true" aria-label="Loading reviews">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-start gap-4">
          <div className={`w-12 h-12 rounded-2xl animate-pulse flex-shrink-0 ${bar}`} />
          <div className="flex-1 space-y-2 py-1">
            <div className={`h-3.5 w-1/3 rounded animate-pulse ${bar}`} />
            <div className={`h-3 w-5/6 rounded animate-pulse ${bar}`} />
            <div className={`h-3 w-2/3 rounded animate-pulse ${bar}`} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Error ────────────────────────────────────────────────────────────────────
function ErrorCard({ dark, onRetry }) {
  return (
    <div className="p-10 text-center">
      <p className={`text-sm font-medium ${dark ? "text-slate-300" : "text-slate-600"}`}>
        We couldn't load your reviews.
      </p>
      <p className={`text-xs mt-1 text-slate-500 dark:text-slate-400`}>
        Check your connection and try again.
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 px-4 py-2 rounded-xl text-xs font-bold bg-cyan-700 hover:bg-cyan-600 text-white transition-colors active:scale-95"
        >
          Retry
        </button>
      )}
    </div>
  );
}

// ── Genuinely zero reviews ───────────────────────────────────────────────────
// The onboarding nudge. Two flavours depending on whether Google is connected;
// the component doesn't know that, so it links to Settings where both paths
// (connect / wait for first sync) live.
function NoReviewsYet({ dark }) {
  return (
    <div className="p-10 text-center">
      <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-cyan-500/10 flex items-center justify-center">
        <svg
          className="w-6 h-6 text-cyan-700 dark:text-cyan-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
          />
        </svg>
      </div>
      <h3 className={`font-bold text-base ${dark ? "text-white" : "text-slate-900"}`}>
        No reviews yet
      </h3>
      <p className={`text-sm mt-1 max-w-sm mx-auto text-slate-500 dark:text-slate-400`}>
        Once your Google Business Profile is connected and synced, your customer
        reviews will appear here automatically.
      </p>
      <Link
        to="/settings"
        className="inline-block mt-4 px-4 py-2 rounded-xl text-xs font-bold bg-cyan-700 hover:bg-cyan-600 text-white transition-colors active:scale-95"
      >
        Check connection
      </Link>
    </div>
  );
}

// ── Free-tier cap banner ─────────────────────────────────────────────────────
// Renders only when the backend flagged cappedByPlan. Sits above the list.
export function PlanCapBanner({ dark }) {
  const capped = useSelector(selectReviewsCapped);
  const total = useSelector(selectReviewsTotal);
  if (!capped) return null;

  return (
    <div
      className={`mx-6 mt-4 p-3 rounded-xl border text-xs leading-relaxed ${
        dark
          ? "bg-amber-950/40 border-amber-900/50 text-amber-300"
          : "bg-amber-50 border-amber-200 text-amber-800"
      }`}
    >
      <span className="font-bold">Free plan: </span>
      showing your {total} most recent stored reviews. Upgrade to Starter to keep
      your full review history and unlock AI replies.
    </div>
  );
}