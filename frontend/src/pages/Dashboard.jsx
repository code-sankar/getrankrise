import { useState, useEffect, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import Sidebar from "../components/Sidebar.jsx";
import StatCard from "../components/StatCard.jsx";
import ReviewCard from "../components/ReviewCard/ReviewCard.jsx";
import TopBar from "../components/TopBar.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { getUserReviews } from "../hooks/reviews.hook.js";
import {
  selectFilteredReviews,
  selectReviewStats,
  setFilter,
  clearFilters,
} from "../store/reviewsSlice.js";

const PLATFORMS = ["All", "Google", "Yelp", "Facebook"];
const RATINGS = ["All", "5★", "4★", "3★", "2★", "1★"];
const STATUSES = ["All", "Unanswered", "Answered"];

const ratingChart = [
  { pct: 0.7, color: "#22c55e" },
  { pct: 0.45, color: "#84cc16" },
  { pct: 0.2, color: "#eab308" },
  { pct: 0.1, color: "#f97316" },
  { pct: 0.05, color: "#ef4444" },
];
const dispatch = useDispatch();
const { loading, error } = useSelector((s) => s.reviews);

useEffect(() => {
  getUserReviews(dispatch);
}, [dispatch]);

const FilterGroup = ({ label, options, active, onChange, dark }) => (
  <div className="flex items-center gap-3 overflow-x-auto pb-1 no-scrollbar">
    <span
      className={`text-[10px] font-bold uppercase tracking-widest min-w-[75px] ${dark ? "text-slate-500" : "text-slate-400"}`}
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
              ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-500/20"
              : dark
                ? "border-slate-700 text-slate-400 hover:border-slate-500 bg-slate-800/40"
                : "border-slate-200 text-slate-600 hover:border-slate-300 bg-white"
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
    <p className={`text-sm ${dark ? "text-slate-400" : "text-slate-500"}`}>
      No reviews match your current filters.
    </p>
    <button
      onClick={onClear}
      className="mt-4 text-indigo-500 text-sm font-bold hover:text-indigo-400 transition-colors"
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
  // ──────────────────────────────────────────────────────────────────────────

  const handleFilterChange = (key, value) => {
    dispatch(setFilter({ key, value }));
  };

  const handleClearFilters = () => {
    dispatch(clearFilters());
  };

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
          <span className="font-black tracking-tight text-indigo-600 text-lg">
            GetRankRise
          </span>
          <button
            onClick={() => setSidebarOpen(true)}
            className={`p-2 rounded-xl transition-colors duration-200 active:scale-95 ${
              dark
                ? "bg-slate-800 text-slate-100 hover:bg-slate-700"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
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
              value="14"
              sub="↑ 8% this month"
              subColor="text-emerald-500"
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
                    className={`text-sm ${dark ? "text-slate-400" : "text-slate-500"}`}
                  >
                    Monitor and respond to customer feedback
                  </p>
                </div>
                <div
                  className={`px-3 py-1 rounded-full text-xs font-bold ${dark ? "bg-indigo-500/10 text-indigo-400" : "bg-indigo-50 text-indigo-600"}`}
                >
                  {filteredReviews.length} Reviews Found
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
              {filteredReviews.length === 0 ? (
                <EmptyState dark={dark} onClear={handleClearFilters} />
              ) : (
                filteredReviews.map((review) => (
                  <ReviewCard key={review.id} review={review} />
                ))
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
