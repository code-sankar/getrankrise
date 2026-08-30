import { useState, useEffect, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import Sidebar from "../components/Sidebar.jsx";
import StatCard from "../components/StatCard.jsx";
import ReviewCard from "../components/ReviewCard/ReviewCard.jsx";
import TopBar from "../components/TopBar.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import {
  getUserReviews,
  getMoreUserReviews,
  REVIEWS_PAGE_SIZE,
} from "../hooks/reviews.hook.js";
import ReviewsQueueState from "../components/Dashboard/ReviewsQueueState.jsx";
import SyncNowButton from "../components/Dashboard/SyncNowButton.jsx";
import {
  selectFilteredReviews,
  selectReviewStats,
  selectReviewsViewState,
  selectReviewsTotal,
  setFilter,
  clearFilters,
} from "../store/reviewsSlice.js";

const PLATFORMS = ["All", "Google", "Yelp", "Facebook"];
const RATINGS = ["All", "5★", "4★", "3★", "2★", "1★"];
const STATUSES = ["All", "Unanswered", "Answered"];

// Bar colours, index 0 = 5★ … index 4 = 1★ — the same order
// selectReviewStats builds `distribution` in.
const RATING_COLORS = ["#22c55e", "#84cc16", "#eab308", "#f97316", "#ef4444"];

// distribution (counts) → the { pct, color } shape StatCard renders. Scaled to
// the largest bucket so the tallest bar is always full height; an all-zero
// distribution yields all-zero bars rather than NaN.
const toRatingChart = (distribution = []) => {
  const peak = Math.max(...distribution, 0);
  return RATING_COLORS.map((color, i) => ({
    color,
    pct: peak > 0 ? (distribution[i] || 0) / peak : 0,
  }));
};
const FilterGroup = ({ label, options, active, onChange, dark }) => (
  <div className="flex items-center gap-3 overflow-x-auto pb-1 no-scrollbar">
    <span
      className={`text-[10px] font-bold uppercase tracking-widest min-w-[75px] text-slate-600 dark:text-slate-400`}
    >
      {label}
    </span>
    <div className="flex gap-1.5">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${
            active === opt
              ? "bg-cyan-700 hover:bg-cyan-600 border-cyan-700 text-white shadow-md shadow-cyan-500/20"
              : dark
                ? "border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-500 bg-slate-800/40"
                : "border-slate-200 text-slate-600 dark:text-slate-400 hover:border-slate-300 bg-white"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  </div>
);

const EmptyState = ({ dark, onClear }) => (
  <div className="py-24 flex flex-col items-center justify-center">
    <div
      className={`w-16 h-16 rounded-3xl mb-4 flex items-center justify-center ${dark ? "bg-slate-800" : "bg-slate-100"}`}
    >
      <span className="text-3xl">✨</span>
    </div>
    <h3
      className={`text-lg font-bold ${dark ? "text-white" : "text-slate-900"}`}
    >
      Inbox Zero!
    </h3>
    <p className={`text-sm text-slate-600 dark:text-slate-400`}>
      No reviews match your current filters.
    </p>
    <button
      onClick={onClear}
      className="mt-4 text-cyan-700 dark:text-cyan-400 text-sm font-bold hover:text-cyan-400 transition-colors"
    >
      Clear all filters
    </button>
  </div>
);

export default function Dashboard() {
  const { dark } = useTheme();
  const dispatch = useDispatch();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── Redux selectors ────────────────────────────────────────────────────────
  const filteredReviews = useSelector(selectFilteredReviews);
  const stats = useSelector(selectReviewStats);
  const filters = useSelector((state) => state.reviews.filters);
  // loading / error / empty / ready — the four states the queue must tell
  // apart. Before this was wired, all four rendered as "no reviews".
  const viewState = useSelector(selectReviewsViewState);
  // How many reviews the SERVER holds, vs how many we have actually loaded.
  // The gap between these two numbers was previously invisible: the page took
  // the server's default page of 50 and reported that as the whole truth.
  const totalReviews = useSelector(selectReviewsTotal);
  const loadedCount = useSelector((state) => state.reviews.list.length);
  const isFetching = useSelector((state) => state.reviews.loading);
  // ──────────────────────────────────────────────────────────────────────────

  const hasMore = loadedCount < totalReviews;

  // Fetch the first page on mount. getUserReviews dispatches
  // start/success/failure itself, so viewState above is driven by the slice.
  useEffect(() => {
    getUserReviews(dispatch, { offset: 0 });
  }, [dispatch]);

  // Filtering is client-side over what has been loaded, so "Load more" is how
  // a filter reaches reviews deeper than the current page.
  const handleLoadMore = () => {
    if (isFetching || !hasMore) return;
    getMoreUserReviews(dispatch, { offset: loadedCount });
  };

  // A sync can change the underlying set, so re-fetch from the top rather than
  // appending onto a window that may no longer line up.
  const handleRefresh = () => getUserReviews(dispatch, { offset: 0 });

  const handleFilterChange = (key, value) => {
    dispatch(setFilter({ key, value }));
  };

  const handleClearFilters = () => {
    dispatch(clearFilters());
  };

  const ratingChart = useMemo(
    () => toRatingChart(stats.distribution),
    [stats.distribution]
  );

  return (
    <div
      className={`min-h-screen ${dark ? "bg-[#0b0f1a]" : "bg-slate-50"} transition-colors duration-300`}
    >
      {/* Desktop Sidebar */}
      <div className="hidden lg:block fixed inset-y-0 left-0 w-64 z-50">
        <Sidebar />
      </div>

      {/* Mobile Sidebar */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-[60]">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative w-64 h-full shadow-2xl">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      <div className="lg:ml-64 flex flex-col min-h-screen">
        {/* Mobile Header */}
        <header
          className={`lg:hidden flex items-center justify-between p-4 border-b flex-shrink-0 ${
            dark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
          }`}
        >
          <span className="font-black tracking-tight text-cyan-700 dark:text-cyan-400 text-lg">
            Kirtify
          </span>
          <button
            onClick={() => setSidebarOpen(true)}
            className={`p-2 rounded-xl transition-colors duration-200 active:scale-95 ${
              dark
                ? "bg-slate-800 text-slate-100 hover:bg-slate-700"
                : "bg-slate-100 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
            }`}
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
        </header>

        <TopBar title="Unified Reviews" />

        <main className="p-4 sm:p-6 lg:p-8 space-y-8 max-w-[1400px] mx-auto w-full">
          {/* Stats */}
          <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-6">
            <StatCard
              label="Avg Rating"
              value={stats.avg}
              chart={ratingChart}
            />

            <StatCard
              label="New Reviews"
              value={String(stats.newThisMonth)}
              sub="Last 30 days"
              subColor="text-emerald-700 dark:text-emerald-400"
            />
            <StatCard
              label="AI Coverage"
              value={`${stats.coverage}%`}
              sub="Response rate"
            />
            <StatCard
              label="Sentiment"
              value={`${stats.sentiment}%`}
              sub="Positive feedback"
            />
          </section>

          {/* Reviews Queue */}
          <section
            className={`rounded-2xl border transition-all ${dark ? "bg-slate-900/50 border-slate-800/50 backdrop-blur-xl" : "bg-white border-slate-200 shadow-sm"}`}
          >
            <div className="p-6 border-b border-inherit">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2
                    className={`text-xl font-bold ${dark ? "text-white" : "text-slate-900"}`}
                  >
                    Reviews Queue
                  </h2>
                  <p
                    className={`text-sm text-slate-600 dark:text-slate-400`}
                  >
                    Monitor and respond to customer feedback
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {/* "N Reviews Found" used to report the length of the loaded
                      page, which silently became the number the user believed
                      they had. It now names the server total alongside it. */}
                  <div
                    className={`px-3 py-1 rounded-full text-xs font-bold ${dark ? "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400" : "bg-cyan-50 text-cyan-700 dark:text-cyan-400"}`}
                  >
                    {filteredReviews.length} of {totalReviews} Reviews
                  </div>
                  <SyncNowButton dark={dark} onSynced={handleRefresh} />
                </div>
              </div>

              {/* Filters — dispatch setFilter to Redux */}
              <div className="mt-8 space-y-5">
                <FilterGroup
                  label="Platform"
                  options={PLATFORMS}
                  dark={dark}
                  active={filters.platform}
                  onChange={(val) => handleFilterChange("platform", val)}
                />
                <FilterGroup
                  label="Rating"
                  options={RATINGS}
                  dark={dark}
                  active={
                    filters.rating === "All" ? "All" : `${filters.rating}★`
                  }
                  onChange={(val) =>
                    handleFilterChange("rating", val === "All" ? "All" : val[0])
                  }
                />
                <FilterGroup
                  label="Status"
                  options={STATUSES}
                  dark={dark}
                  active={filters.status}
                  onChange={(val) => handleFilterChange("status", val)}
                />
              </div>
            </div>

            {/* Review List — ReviewCard now takes no onMarkReplied prop (uses Redux internally) */}
            <div className="divide-y divide-inherit">
              {viewState !== "ready" ? (
                // loading / error / confirmed-empty — distinct from the
                // "filters exclude everything" card below.
                <ReviewsQueueState
                  state={viewState}
                  dark={dark}
                  onRetry={handleRefresh}
                />
              ) : filteredReviews.length === 0 ? (
                <EmptyState dark={dark} onClear={handleClearFilters} />
              ) : (
                filteredReviews.map((review) => (
                  <ReviewCard key={review.id} review={review} />
                ))
              )}
            </div>

            {/* Pagination. Filters run client-side over the loaded set, so the
                second line is the honest caveat: a filter can only match what
                has been fetched so far. */}
            {viewState === "ready" && hasMore && (
              <div className="p-6 border-t border-inherit flex flex-col items-center gap-2">
                <button
                  onClick={handleLoadMore}
                  disabled={isFetching}
                  className={`px-6 py-2.5 rounded-full text-sm font-bold border transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                    dark
                      ? "border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-500 bg-slate-800/40"
                      : "border-slate-200 text-slate-700 dark:text-slate-300 hover:border-slate-300 bg-white"
                  }`}
                >
                  {isFetching
                    ? "Loading…"
                    : `Load ${Math.min(REVIEWS_PAGE_SIZE, totalReviews - loadedCount)} more`}
                </button>
                <p
                  className={`text-xs text-slate-600 dark:text-slate-400`}
                >
                  Showing {loadedCount} of {totalReviews} · filters apply to
                  loaded reviews
                </p>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
