/**
 * Analytics.jsx
 * Page-level orchestrator — handles:
 *   1. Redux data fetching + state
 *   2. Business logic helpers (getTrend, getSentimentLabel)
 *   3. Page layout (sidebar, topbar, grid)
 *   4. Loading / error states
 *
 * NO chart code lives here — each chart is its own component.
 */
import { useEffect, useCallback, useState } from "react";
import { useSelector, useDispatch } from "react-redux";

import Sidebar            from "../components/Sidebar.jsx";
import TopBar             from "../components/TopBar.jsx";
import StatPillGrid       from "../components/Analytics/StatPillGrid.jsx";
import GrowthChart        from "../components/Analytics/GrowthChart.jsx";
import PlatformBreakdown  from "../components/Analytics/PlatformBreakdown.jsx";
import RatingDistribution from "../components/Analytics/RatingDistribution.jsx";
import RatingTrendChart   from "../components/Analytics/RatingTrendChart.jsx";
import SEOInsightBanner   from "../components/Analytics/SEOInsightBanner.jsx";
import { useTheme }       from "../context/ThemeContext.jsx";
import { analyticsAPI }   from "../api/analyticsAPI.js";
import {
  fetchAnalyticsStart,
  fetchAnalyticsSuccess,
  fetchAnalyticsFailure,
  setDateRange,
  clearError,
  selectSummaryStats,
  selectGrowthData,
  selectRatingBreakdown,
  selectPlatformData,
  selectDateRange,
  selectAnalyticsLoading,
  selectAnalyticsError,
} from "../store/analyticsSlice.js";

// ── Date range options ────────────────────────────────────────────────────────
const DATE_RANGES = [
  { value: "last_7_days",   label: "7 Days"   },
  { value: "last_30_days",  label: "30 Days"  },
  { value: "last_6_months", label: "6 Months" },
  { value: "all_time",      label: "All Time" },
];

// ── Business logic helpers ────────────────────────────────────────────────────
const getTrend = v =>
  v > 0 ? { label: `↑ ${v}%`,           color: "text-emerald-500" }
  : v < 0 ? { label: `↓ ${Math.abs(v)}%`, color: "text-red-400"    }
  :         { label: "Stable",            color: "text-slate-500"  };

const getSentimentLabel = s =>
  s >= 85 ? { label: "Excellent",  color: "text-emerald-500" }
  : s >= 70 ? { label: "Good",     color: "text-blue-500"    }
  : s >= 50 ? { label: "Fair",     color: "text-amber-500"   }
  :           { label: "Needs Work", color: "text-red-400"   };

// ── Loading skeleton ──────────────────────────────────────────────────────────
function LoadingSkeleton({ dark }) {
  const b = `rounded-2xl animate-pulse ${dark ? "bg-slate-800" : "bg-slate-200"}`;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {Array(6).fill(0).map((_, i) => <div key={i} className={`h-20 ${b}`} />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className={`lg:col-span-8 h-96 ${b}`} />
        <div className={`lg:col-span-4 h-96 ${b}`} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className={`h-72 ${b}`} />
        <div className={`h-72 ${b}`} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function Analytics() {
  const { dark } = useTheme();
  const dispatch = useDispatch();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── Redux — all data derived from same rawReviews source ──────────────────
  const summary    = useSelector(selectSummaryStats);
  const growthData = useSelector(selectGrowthData);
  const ratingData = useSelector(selectRatingBreakdown);
  const platforms  = useSelector(selectPlatformData);
  const dateRange  = useSelector(selectDateRange);
  const loading    = useSelector(selectAnalyticsLoading);
  const error      = useSelector(selectAnalyticsError);
  // ──────────────────────────────────────────────────────────────────────────

  // Business logic computed from Redux data
  const trend         = getTrend(summary.growth);
  const sentiment     = getSentimentLabel(summary.sentimentScore);
  const totalPlatform = platforms.reduce((s, p) => s + p.value, 0);
  const lastMonth     = growthData[growthData.length - 1]?.month;

  // ── Fetch — API returns raw reviews, slice derives everything ─────────────
  const fetchData = useCallback(async () => {
  dispatch(fetchAnalyticsStart());
  try {
    const rawReviews = await analyticsAPI.getRawReviews(dateRange);
    // If API returns null, skip dispatch — slice keeps its own initial data
    if (rawReviews) {
      dispatch(fetchAnalyticsSuccess(rawReviews));
    } else {
      dispatch(fetchAnalyticsFailure(null)); // clears loading, keeps mock data
    }
  } catch (err) {
    dispatch(fetchAnalyticsFailure(
      err.response?.data?.message || err.message || "Failed to load analytics."
    ));
  }
}, [dispatch, dateRange]);

  // Re-fetch whenever dateRange changes
  useEffect(() => { fetchData(); }, [fetchData]);
  // ──────────────────────────────────────────────────────────────────────────

  return (
    <div
      className={`h-screen overflow-hidden flex transition-colors duration-300 ${
        dark ? "bg-slate-950" : "bg-slate-50"
      }`}
    >
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:block w-64 flex-shrink-0 border-r border-slate-200 dark:border-slate-800">
        <Sidebar />
      </aside>

      {/* Sidebar - Mobile Overlay & Component */}
      {sidebarOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60]"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="lg:hidden fixed inset-y-0 left-0 w-64 z-[70] transform transition-transform duration-300">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </aside>
        </>
      )}

      {/* Main Content Area - Scrollable Container */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto custom-scrollbar">
        
        {/* Mobile Header - Scrolls with content */}
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
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </header>

        {/* TopBar - Sticky over the content */}
        <div className="sticky top-0 z-50">
          <TopBar title="Analytics" onMenuClick={() => setSidebarOpen(true)} />
        </div>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto w-full space-y-6">

          {/* ── Page Header + Date Range Selector ──────────────────── */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className={`text-lg font-bold ${dark ? "text-white" : "text-slate-900"}`}>
                Analytics Overview
              </h2>
              <p className={`text-xs mt-0.5 ${dark ? "text-slate-500" : "text-slate-400"}`}>
                All data calculated from {summary.totalReviews} real reviews
              </p>
            </div>

            <div className={`flex items-center gap-1 p-1 rounded-xl border ${dark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
              {DATE_RANGES.map(r => (
                <button
                  key={r.value}
                  onClick={() => dispatch(setDateRange(r.value))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    dateRange === r.value
                      ? "bg-indigo-600 text-white"
                      : dark ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Error Banner ────────────────────────────────────────── */}
          {error && (
            <div className={`flex items-center justify-between gap-4 px-5 py-4 rounded-xl border text-sm ${dark ? "bg-red-950/30 border-red-900 text-red-400" : "bg-red-50 border-red-200 text-red-600"}`}>
              <span className="font-semibold">⚠ {error}</span>
              <button
                onClick={() => { dispatch(clearError()); fetchData(); }}
                className="text-xs font-bold underline"
              >
                Retry
              </button>
            </div>
          )}

          {/* ── Loading Skeleton / Content ───────────────────────────── */}
          {loading ? <LoadingSkeleton dark={dark} /> : (
            <>
              {/* 6 stat pills */}
              <StatPillGrid
                summary={summary}
                trend={trend}
                sentiment={sentiment}
                lastMonth={lastMonth}
                dark={dark}
              />

              {/* Growth chart + Platform breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-8">
                  <GrowthChart
                    growthData={growthData}
                    summary={summary}
                    trend={trend}
                    dark={dark}
                  />
                </div>
                <div className="lg:col-span-4">
                  <PlatformBreakdown
                    platforms={platforms}
                    total={totalPlatform}
                    dark={dark}
                  />
                </div>
              </div>

              {/* Rating distribution + Rating trend */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <RatingDistribution
                  ratingData={ratingData}
                  total={summary.totalReviews}
                  dark={dark}
                />
                <RatingTrendChart
                  growthData={growthData}
                  avgRating={summary.avgRating}
                  dark={dark}
                />
              </div>

              {/* SEO banner — only renders when urgentCount > 0 */}
              <SEOInsightBanner
                urgentCount={summary.urgentCount}
                dark={dark}
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
}