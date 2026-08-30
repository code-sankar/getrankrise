/**
 * Competitors.jsx
 * Competitor Intelligence Tracker — page orchestrator.
 *   1. Redux data fetching (overview + per-competitor trend)
 *   2. Business-logic helpers (radar/bar builders, sync-age formatting)
 *   3. Page layout (sidebar, topbar, table, charts, trend panel)
 *   4. Loading / empty / tier-blocked / error states
 */
import { useEffect, useCallback, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { toast } from "react-toastify";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell,
  LineChart, Line,
  ResponsiveContainer, Tooltip,
} from "recharts";

import Sidebar from "../components/Sidebar.jsx";
import TopBar from "../components/TopBar.jsx";
import AddCompetitorModal from "../components/Competitors/AddCompetitorModal.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { competitorsAPI } from "../api/competitorsAPI.js";
import {
  fetchStart, fetchSuccess, fetchFailure,
  selectCompetitor, fetchTrendStart, fetchTrendSuccess, fetchTrendFailure,
  setAdding, competitorUpserted, setRefreshing, competitorRemoved, setUsage,
  selectSelf, selectCompetitors, selectUsage, selectCompLoading, selectCompError,
  selectSelectedId, selectSnapshots, selectTrendLoading, selectAdding, selectRefreshingId,
  selectSelectedCompetitor,
} from "../store/competitorsSlice.js";

// ── Palette for competitor accents (dark tech theme) ──────────────────────────
const YOU_COLOR = "#06b6d4";
const PALETTE = ["#06b6d4", "#f59e0b", "#10b981", "#8b5cf6", "#ec4899", "#3b82f6", "#ef4444", "#14b8a6", "#eab308", "#f97316"];
const colorFor = (i) => PALETTE[i % PALETTE.length];

// ── Business-logic helpers ────────────────────────────────────────────────────
const buildRadar = (self, competitors) => {
  const maxVolume = Math.max(self?.totalReviews || 0, ...competitors.map((c) => c.totalReviews), 1);
  const maxGrowth = Math.max(self?.newThisMonth || 0, ...competitors.map((c) => c.newThisMonth), 1);
  const compEntries = (pick) => Object.fromEntries(competitors.map((c) => [c.name, pick(c)]));

  return [
    { metric: "Rating",    you: Math.round((self?.rating || 0) * 20),         ...compEntries((c) => Math.round(c.rating * 20)) },
    { metric: "Response",  you: self?.responseRate || 0,                       ...compEntries((c) => c.responseRate) },
    { metric: "Volume",    you: Math.round(((self?.totalReviews || 0) / maxVolume) * 100), ...compEntries((c) => Math.round((c.totalReviews / maxVolume) * 100)) },
    { metric: "Sentiment", you: self?.sentiment || 0,                          ...compEntries((c) => c.sentiment) },
    { metric: "Growth",    you: Math.round(((self?.newThisMonth || 0) / maxGrowth) * 100),  ...compEntries((c) => Math.round((c.newThisMonth / maxGrowth) * 100)) },
  ];
};

const buildBar = (self, competitors) => [
  { name: "You", rating: self?.rating || 0, color: YOU_COLOR },
  ...competitors.map((c, i) => ({ name: c.name.split(" ")[0], rating: c.rating, color: colorFor(i) })),
];

const syncAge = (iso) => {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
};

// ── Small presentational bits ─────────────────────────────────────────────────
function Stars({ rating }) {
  return (
    <span className="text-amber-700 dark:text-amber-500 text-[10px]">
      {"★".repeat(Math.round(rating))}{"☆".repeat(5 - Math.round(rating))}
    </span>
  );
}
function MetricBadge({ value, suffix = "", good = true }) {
  return (
    <span className={`font-bold text-xs ${good ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-500"}`}>
      {value}{suffix}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function Competitors() {
  const { dark } = useTheme();
  const dispatch = useDispatch();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const self         = useSelector(selectSelf);
  const competitors  = useSelector(selectCompetitors);
  const usage        = useSelector(selectUsage);
  const loading      = useSelector(selectCompLoading);
  const error        = useSelector(selectCompError);
  const selectedId   = useSelector(selectSelectedId);
  const selected     = useSelector(selectSelectedCompetitor);
  const snapshots    = useSelector(selectSnapshots);
  const trendLoading = useSelector(selectTrendLoading);
  const adding       = useSelector(selectAdding);
  const refreshingId = useSelector(selectRefreshingId);

  // ── Theme tokens ──────────────────────────────────────────────────────────
  const cardBg      = dark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200 shadow-sm";
  const textPrimary = dark ? "text-white" : "text-slate-900";
  const textMuted   = dark ? "text-slate-300" : "text-slate-500";
  const divider     = dark ? "divide-slate-800" : "divide-slate-100";
  const tableHead   = dark ? "bg-slate-800/50 text-slate-500 dark:text-slate-400" : "bg-slate-50 text-slate-500";
  const tableRow    = dark ? "hover:bg-slate-800/40 transition-colors" : "hover:bg-slate-50 transition-colors";

  // ── Fetch overview ──────────────────────────────────────────────────────────
  const fetchOverview = useCallback(async () => {
    dispatch(fetchStart());
    try {
      const [overview, listed] = await Promise.all([
        competitorsAPI.getOverview(),
        competitorsAPI.list(),
      ]);
      dispatch(fetchSuccess({ ...overview, usage: listed.usage }));
    } catch (err) {
      // 403 → plan doesn't include competitor tracking (Free tier)
      if (err.response?.status === 403) {
        dispatch(fetchFailure({ blocked: true, message: err.response.data?.message }));
      } else {
        dispatch(fetchFailure(err.response?.data?.message || err.message || "Failed to load competitors."));
      }
    }
  }, [dispatch]);

  useEffect(() => { fetchOverview(); }, [fetchOverview]);

  // ── Fetch trend for the selected competitor ──────────────────────────────────
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    (async () => {
      dispatch(fetchTrendStart());
      try {
        const { snapshots } = await competitorsAPI.getOne(selectedId, 30);
        if (!cancelled) dispatch(fetchTrendSuccess(snapshots));
      } catch {
        if (!cancelled) dispatch(fetchTrendFailure());
      }
    })();
    return () => { cancelled = true; };
  }, [selectedId, dispatch]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleAdd = async (payload) => {
    dispatch(setAdding(true));
    try {
      const created = await competitorsAPI.add(payload);
      dispatch(competitorUpserted(created));
      dispatch(setUsage({
        tracked: usage.tracked + 1,
        limit:   usage.limit,
        canAdd:  usage.tracked + 1 < usage.limit,
      }));
      dispatch(selectCompetitor(created.id));
      setModalOpen(false);
      toast.success(`Now tracking ${created.name}`);
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not add competitor.");
    } finally {
      dispatch(setAdding(false));
    }
  };

  const handleRefresh = async (id) => {
    dispatch(setRefreshing(id));
    try {
      const updated = await competitorsAPI.refresh(id);
      dispatch(competitorUpserted(updated));
      if (id === selectedId) {
        const { snapshots } = await competitorsAPI.getOne(id, 30);
        dispatch(fetchTrendSuccess(snapshots));
      }
      toast.success("Synced");
    } catch (err) {
      toast.error(err.response?.data?.message || "Sync failed.");
    } finally {
      dispatch(setRefreshing(null));
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Stop tracking ${name}? Its history will be deleted.`)) return;
    try {
      await competitorsAPI.remove(id);
      dispatch(competitorRemoved(id));
      toast.success("Removed");
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not remove competitor.");
    }
  };

  // ── Derived chart data ──────────────────────────────────────────────────────
  const radarData = self ? buildRadar(self, competitors) : [];
  const barData   = self ? buildBar(self, competitors) : [];
  const trendData = snapshots.map((s) => ({
    date:   new Date(s.capturedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    rating: s.rating,
    reviews: s.totalReviews,
  }));

  // ── Layout shell ────────────────────────────────────────────────────────────
  return (
    <div className={`h-screen overflow-hidden flex transition-colors duration-300 ${dark ? "bg-slate-950" : "bg-slate-50"}`}>
      <aside className="hidden lg:block w-64 flex-shrink-0 border-r border-slate-200 dark:border-slate-800">
        <Sidebar />
      </aside>

      {sidebarOpen && (
        <>
          <div className="lg:hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60]" onClick={() => setSidebarOpen(false)} />
          <aside className="lg:hidden fixed inset-y-0 left-0 w-64 z-[70] transform transition-transform duration-300">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </aside>
        </>
      )}

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto custom-scrollbar">
        <header className={`lg:hidden flex items-center justify-between p-4 border-b flex-shrink-0 ${dark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"}`}>
          <span className="font-black tracking-tight text-cyan-700 dark:text-cyan-400 text-lg">Kirtify</span>
          <button onClick={() => setSidebarOpen(true)} className={`p-2 rounded-xl transition-colors active:scale-95 ${dark ? "bg-slate-800 text-slate-100 hover:bg-slate-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </header>

        <div className="sticky top-0 z-50">
          <TopBar title="Competitors" onMenuClick={() => setSidebarOpen(true)} />
        </div>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
          {/* ── Header row: usage + add ────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className={`text-lg font-bold ${textPrimary}`}>Competitor Intelligence</h2>
              <p className={`text-xs mt-0.5 ${textMuted}`}>
                {usage.limit > 0
                  ? `Tracking ${usage.tracked} of ${usage.limit} competitors on your plan`
                  : "Benchmark your rivals' ratings, volume, response rate and sentiment"}
              </p>
            </div>
            <button
              onClick={() => (usage.canAdd ? setModalOpen(true) : toast.info("You've reached your plan's competitor limit. Upgrade to track more."))}
              disabled={loading || (error && error.blocked)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-40 ${
                usage.canAdd ? "bg-cyan-700 hover:bg-cyan-600 text-white" : "bg-slate-700 text-slate-300 cursor-not-allowed"
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add competitor
            </button>
          </div>

          {/* ── Tier-blocked (Free plan) ───────────────────────────────── */}
          {error?.blocked && (
            <div className={`border rounded-2xl p-10 text-center ${cardBg}`}>
              <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-cyan-500/10 flex items-center justify-center">
                <svg className="w-6 h-6 text-cyan-700 dark:text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <h3 className={`font-bold text-base ${textPrimary}`}>Competitor tracking is a paid feature</h3>
              <p className={`text-sm mt-1 max-w-md mx-auto ${textMuted}`}>
                Upgrade to Starter to track up to 3 local rivals, or Premium for up to 10 with real-time syncing.
              </p>
            </div>
          )}

          {/* ── Generic error ──────────────────────────────────────────── */}
          {error && !error.blocked && (
            <div className="border rounded-2xl p-6 text-center border-red-500/30 bg-red-500/5">
              <p className="text-sm text-red-600 dark:text-red-400 font-medium">{String(error)}</p>
              <button onClick={fetchOverview} className="mt-3 text-xs font-bold text-cyan-700 dark:text-cyan-400 hover:underline">Retry</button>
            </div>
          )}

          {/* ── Loading skeleton ───────────────────────────────────────── */}
          {loading && !error && (
            <div className="space-y-6">
              <div className={`h-64 rounded-2xl animate-pulse ${dark ? "bg-slate-800" : "bg-slate-200"}`} />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className={`h-72 rounded-2xl animate-pulse ${dark ? "bg-slate-800" : "bg-slate-200"}`} />
                <div className={`h-72 rounded-2xl animate-pulse ${dark ? "bg-slate-800" : "bg-slate-200"}`} />
              </div>
            </div>
          )}

          {/* ── Empty state ────────────────────────────────────────────── */}
          {!loading && !error && competitors.length === 0 && (
            <div className={`border rounded-2xl p-10 text-center ${cardBg}`}>
              <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-cyan-500/10 flex items-center justify-center">
                <svg className="w-6 h-6 text-cyan-700 dark:text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className={`font-bold text-base ${textPrimary}`}>No competitors tracked yet</h3>
              <p className={`text-sm mt-1 ${textMuted}`}>Add your first local rival to start benchmarking.</p>
            </div>
          )}

          {/* ── Data ───────────────────────────────────────────────────── */}
          {!loading && !error && competitors.length > 0 && (
            <>
              {/* Comparison table */}
              <div className={`border rounded-2xl overflow-hidden ${cardBg}`}>
                <div className={`px-6 py-5 border-b ${dark ? "border-slate-800" : "border-slate-100"}`}>
                  <h2 className={`font-bold text-base ${textPrimary}`}>Side-by-Side Performance</h2>
                  <p className={`text-xs ${textMuted}`}>Live benchmarks against local competitors</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className={`text-[10px] font-black uppercase tracking-widest ${tableHead}`}>
                        <th className="px-6 py-4">Clinic Name</th>
                        <th className="px-6 py-4 text-center">Avg Rating</th>
                        <th className="px-6 py-4 text-center">Total</th>
                        <th className="px-6 py-4 text-center">New</th>
                        <th className="px-6 py-4 text-center">Response</th>
                        <th className="px-6 py-4 text-center">Sentiment</th>
                        <th className="px-6 py-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${divider}`}>
                      {/* You */}
                      <tr className={dark ? "bg-cyan-500/5" : "bg-cyan-50/30"}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
                            <span className={`font-bold text-sm ${textPrimary}`}>{self?.name || "You"}</span>
                            <span className="text-[9px] bg-cyan-700 hover:bg-cyan-600 text-white px-1.5 py-0.5 rounded uppercase font-black">You</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <Stars rating={self?.rating || 0} />
                          <p className={`text-xs font-bold ${textPrimary}`}>{self?.rating ?? 0}</p>
                        </td>
                        <td className="px-6 py-4 text-center text-sm font-semibold">{self?.totalReviews ?? 0}</td>
                        <td className="px-6 py-4 text-center text-emerald-700 dark:text-emerald-400 font-bold">+{self?.newThisMonth ?? 0}</td>
                        <td className="px-6 py-4 text-center"><MetricBadge value={self?.responseRate ?? 0} suffix="%" good /></td>
                        <td className="px-6 py-4 text-center"><MetricBadge value={self?.sentiment ?? 0} suffix="%" good /></td>
                        <td className="px-6 py-4" />
                      </tr>

                      {/* Competitors */}
                      {competitors.map((c, i) => (
                        <tr key={c.id} className={tableRow}>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2 text-sm">
                              <div className="w-2 h-2 rounded-full" style={{ background: colorFor(i) }} />
                              <span className={dark ? "text-slate-300" : "text-slate-700"}>{c.name}</span>
                              {c.syncStatus === "failed" && (
                                <span className="text-[9px] bg-red-500/20 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded uppercase font-black" title="Last sync failed">sync error</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <Stars rating={c.rating} />
                            <p className="text-xs font-bold text-slate-500">{c.rating}</p>
                          </td>
                          <td className="px-6 py-4 text-center text-sm">{c.totalReviews}</td>
                          <td className="px-6 py-4 text-center text-sm">+{c.newThisMonth}</td>
                          <td className="px-6 py-4 text-center"><MetricBadge value={c.responseRate} suffix="%" good={c.responseRate < (self?.responseRate ?? 100)} /></td>
                          <td className="px-6 py-4 text-center"><MetricBadge value={c.sentiment} suffix="%" good={c.sentiment < (self?.sentiment ?? 100)} /></td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => handleRefresh(c.id)}
                                disabled={refreshingId === c.id}
                                title="Re-sync"
                                className={`p-1.5 rounded-lg transition-colors ${dark ? "hover:bg-slate-700 text-slate-500 dark:text-slate-400" : "hover:bg-slate-100 text-slate-500"}`}
                              >
                                <svg className={`w-4 h-4 ${refreshingId === c.id ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleDelete(c.id, c.name)}
                                title="Stop tracking"
                                className={`p-1.5 rounded-lg transition-colors ${dark ? "hover:bg-red-500/10 text-slate-500 dark:text-slate-400 hover:text-red-400" : "hover:bg-red-50 text-slate-500 hover:text-red-500"}`}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Charts row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className={`p-6 rounded-2xl border ${cardBg}`}>
                  <h3 className={`font-bold text-sm mb-4 ${textPrimary}`}>Competitor Radar</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <RadarChart data={radarData}>
                      <PolarGrid stroke={dark ? "#334155" : "#e2e8f0"} />
                      <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                      <Radar name="You" dataKey="you" stroke={YOU_COLOR} fill={YOU_COLOR} fillOpacity={0.2} strokeWidth={2} />
                      {competitors.map((c, i) => (
                        <Radar key={c.id} name={c.name} dataKey={c.name} stroke={colorFor(i)} fill={colorFor(i)} fillOpacity={0.05} />
                      ))}
                      <Tooltip contentStyle={{ borderRadius: "12px", background: dark ? "#1e293b" : "#fff", border: "none" }} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>

                <div className={`p-6 rounded-2xl border ${cardBg}`}>
                  <h3 className={`font-bold text-sm mb-4 ${textPrimary}`}>Market Rating Rank</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={barData} barSize={40}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={dark ? "#1e293b" : "#f1f5f9"} />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} />
                      <YAxis domain={[0, 5]} hide />
                      <Tooltip cursor={{ fill: "transparent" }} />
                      <Bar dataKey="rating" radius={[8, 8, 0, 0]}>
                        {barData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Tracking-trend panel (replaces the old review-text feed) */}
              <div className={`border rounded-2xl ${cardBg}`}>
                <div className={`px-6 py-4 border-b ${dark ? "border-slate-800" : "border-slate-100"}`}>
                  <h2 className={`font-bold text-base ${textPrimary}`}>Tracking Trend</h2>
                  <div className="flex gap-2 mt-4 overflow-x-auto pb-2">
                    {competitors.map((c, i) => (
                      <button
                        key={c.id}
                        onClick={() => dispatch(selectCompetitor(c.id))}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap border ${
                          selectedId === c.id
                            ? "bg-cyan-700 hover:bg-cyan-600 border-cyan-500 text-white"
                            : dark ? "bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600" : "bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300"
                        }`}
                        style={selectedId === c.id ? undefined : { borderLeftColor: colorFor(i), borderLeftWidth: 3 }}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-6">
                  {selected && (
                    <div className="flex flex-wrap items-center gap-x-8 gap-y-2 mb-6 text-sm">
                      <div><span className={textMuted}>Rating </span><span className={`font-bold ${textPrimary}`}>{selected.rating}</span></div>
                      <div><span className={textMuted}>Reviews </span><span className={`font-bold ${textPrimary}`}>{selected.totalReviews}</span></div>
                      <div><span className={textMuted}>New </span><span className="font-bold text-emerald-700 dark:text-emerald-400">+{selected.newThisMonth}</span></div>
                      <div><span className={textMuted}>Synced </span><span className={`font-bold ${textPrimary}`}>{syncAge(selected.lastSyncedAt)}</span></div>
                      <button
                        onClick={() => handleRefresh(selected.id)}
                        disabled={refreshingId === selected.id}
                        className="ml-auto inline-flex items-center gap-1.5 text-xs font-bold text-cyan-700 dark:text-cyan-400 hover:text-cyan-400 disabled:opacity-40"
                      >
                        <svg className={`w-3.5 h-3.5 ${refreshingId === selected.id ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Sync now
                      </button>
                    </div>
                  )}

                  {trendLoading ? (
                    <div className={`h-56 rounded-xl animate-pulse ${dark ? "bg-slate-800" : "bg-slate-100"}`} />
                  ) : trendData.length < 2 ? (
                    <p className={`text-sm text-center py-12 ${textMuted}`}>
                      Not enough history yet — trend appears after a few syncs.
                    </p>
                  ) : (
                    <ResponsiveContainer width="100%" height={224}>
                      <LineChart data={trendData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={dark ? "#1e293b" : "#f1f5f9"} />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} />
                        <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} width={32} />
                        <YAxis yAxisId="right" orientation="right" domain={[0, 5]} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} width={28} />
                        <Tooltip contentStyle={{ borderRadius: "12px", background: dark ? "#1e293b" : "#fff", border: "none" }} />
                        <Line yAxisId="left" type="monotone" dataKey="reviews" name="Total reviews" stroke="#06b6d4" strokeWidth={2} dot={false} />
                        <Line yAxisId="right" type="monotone" dataKey="rating" name="Rating" stroke="#f59e0b" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      <AddCompetitorModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleAdd}
        submitting={adding}
      />
    </div>
  );
}