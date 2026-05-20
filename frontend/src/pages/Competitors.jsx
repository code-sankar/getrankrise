import { useState } from "react";
import Sidebar from "../components/Sidebar.jsx";
import TopBar from "../components/TopBar.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
} from "recharts";

// ── Mock Data ─────────────────────────────────────────────────────────────────
const myClinic = {
  name: "Bright Smile Dental",
  rating: 4.2,
  totalReviews: 247,
  responseRate: 91,
  newThisMonth: 47,
  sentiment: 88,
  color: "#6366f1",
};

const competitors = [
  {
    id: 1,
    name: "ClearView Dental",
    rating: 4.5,
    totalReviews: 312,
    responseRate: 78,
    newThisMonth: 38,
    sentiment: 92,
    color: "#f59e0b",
    recentReviews: [
      {
        id: 1,
        author: "James T.",
        rating: 5,
        text: "Best dental experience I've ever had. Highly recommend!",
        date: "1 day ago",
      },
      {
        id: 2,
        author: "Nina W.",
        rating: 3,
        text: "Good clinic but waiting times are too long.",
        date: "3 days ago",
      },
    ],
  },
  {
    id: 2,
    name: "SmileCare Plus",
    rating: 3.8,
    totalReviews: 189,
    responseRate: 55,
    newThisMonth: 21,
    sentiment: 74,
    color: "#10b981",
    recentReviews: [
      {
        id: 1,
        author: "Paul O.",
        rating: 4,
        text: "Friendly staff and clean environment. Will return.",
        date: "2 days ago",
      },
      {
        id: 2,
        author: "Sara K.",
        rating: 2,
        text: "Billing issues and rude receptionist. Not impressed.",
        date: "4 days ago",
      },
    ],
  },
  {
    id: 3,
    name: "ProDent Clinic",
    rating: 4.0,
    totalReviews: 205,
    responseRate: 63,
    newThisMonth: 29,
    sentiment: 80,
    color: "#3b82f6",
    recentReviews: [
      {
        id: 1,
        author: "Lena M.",
        rating: 5,
        text: "Great service, very professional and gentle.",
        date: "1 day ago",
      },
      {
        id: 2,
        author: "Chris B.",
        rating: 4,
        text: "Solid clinic. Appointment was on time which I appreciated.",
        date: "5 days ago",
      },
    ],
  },
];

const radarData = [
  {
    metric: "Rating",
    you: 84,
    ...Object.fromEntries(
      competitors.map((c) => [c.name, Math.round(c.rating * 20)]),
    ),
  },
  {
    metric: "Response",
    you: 91,
    ...Object.fromEntries(competitors.map((c) => [c.name, c.responseRate])),
  },
  {
    metric: "Volume",
    you: 70,
    ...Object.fromEntries(
      competitors.map((c) => [
        c.name,
        Math.round((c.totalReviews / 312) * 100),
      ]),
    ),
  },
  {
    metric: "Sentiment",
    you: 88,
    ...Object.fromEntries(competitors.map((c) => [c.name, c.sentiment])),
  },
  {
    metric: "Growth",
    you: 90,
    ...Object.fromEntries(
      competitors.map((c) => [c.name, Math.round((c.newThisMonth / 47) * 90)]),
    ),
  },
];

const barData = [myClinic, ...competitors].map((c) => ({
  name: c.name.split(" ")[0],
  rating: c.rating,
  color: c.color,
}));

function Stars({ rating }) {
  return (
    <span className="text-amber-400 text-[10px]">
      {"★".repeat(Math.round(rating))}
      {"☆".repeat(5 - Math.round(rating))}
    </span>
  );
}

function MetricBadge({ value, suffix = "", good = true }) {
  return (
    <span
      className={`font-bold text-xs ${good ? "text-emerald-500" : "text-amber-500"}`}
    >
      {value}
      {suffix}
    </span>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

export default function Competitors() {
  const { dark } = useTheme();
  const [selectedCompetitor, setSelectedCompetitor] = useState(competitors[0]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const cardBg = dark
    ? "bg-slate-900 border-slate-800"
    : "bg-white border-slate-200 shadow-sm";
  const textPrimary = dark ? "text-white" : "text-slate-900";
  const textMuted = dark ? "text-slate-300" : "text-slate-500";
  const divider = dark ? "divide-slate-800" : "divide-slate-100";
  const tableHead = dark
    ? "bg-slate-800/50 text-slate-400"
    : "bg-slate-50 text-slate-500";
  const tableRow = dark
    ? "hover:bg-slate-800/40 transition-colors"
    : "hover:bg-slate-50 transition-colors";

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
              <TopBar title="Your Compititors" onMenuClick={() => setSidebarOpen(true)} />
            </div>

        {/* Main */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
          {/* ── Comparison Table ─────────────────────────────────────── */}
          <div className={`border rounded-2xl overflow-hidden ${cardBg}`}>
            <div
              className={`px-6 py-5 border-b ${dark ? "border-slate-800" : "border-slate-100"}`}
            >
              <h2 className={`font-bold text-base ${textPrimary}`}>
                Side-by-Side Performance
              </h2>
              <p className={`text-xs ${textMuted}`}>
                Live benchmarks against local competitors
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr
                    className={`text-[10px] font-black uppercase tracking-widest ${tableHead}`}
                  >
                    <th className="px-6 py-4">Clinic Name</th>
                    <th className="px-6 py-4 text-center">Avg Rating</th>
                    <th className="px-6 py-4 text-center">Total</th>
                    <th className="px-6 py-4 text-center">New/Mo</th>
                    <th className="px-6 py-4 text-center">Response</th>
                    <th className="px-6 py-4 text-center">Sentiment</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${divider}`}>
                  {/* Your Clinic */}
                  <tr className={dark ? "bg-indigo-500/5" : "bg-indigo-50/30"}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                        <span className={`font-bold text-sm ${textPrimary}`}>
                          {myClinic.name}
                        </span>
                        <span className="text-[9px] bg-indigo-500 text-white px-1.5 py-0.5 rounded uppercase font-black">
                          You
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Stars rating={myClinic.rating} />
                      <p className={`text-xs font-bold ${textPrimary}`}>
                        {myClinic.rating}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-center text-sm font-semibold">
                      {myClinic.totalReviews}
                    </td>
                    <td className="px-6 py-4 text-center text-emerald-500 font-bold">
                      +{myClinic.newThisMonth}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <MetricBadge
                        value={myClinic.responseRate}
                        suffix="%"
                        good={true}
                      />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <MetricBadge
                        value={myClinic.sentiment}
                        suffix="%"
                        good={true}
                      />
                    </td>
                  </tr>
                  {competitors.map((c) => (
                    <tr key={c.id} className={tableRow}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-sm">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ background: c.color }}
                          />
                          <span
                            className={
                              dark ? "text-slate-300" : "text-slate-700"
                            }
                          >
                            {c.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Stars rating={c.rating} />
                        <p className="text-xs font-bold text-slate-500">
                          {c.rating}
                        </p>
                      </td>
                      <td className="px-6 py-4 text-center text-sm">
                        {c.totalReviews}
                      </td>
                      <td className="px-6 py-4 text-center text-sm">
                        +{c.newThisMonth}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <MetricBadge
                          value={c.responseRate}
                          suffix="%"
                          good={c.responseRate < myClinic.responseRate}
                        />
                      </td>
                      <td className="px-6 py-4 text-center">
                        <MetricBadge
                          value={c.sentiment}
                          suffix="%"
                          good={c.sentiment < myClinic.sentiment}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Charts Row ───────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className={`p-6 rounded-2xl border ${cardBg}`}>
              <h3 className={`font-bold text-sm mb-4 ${textPrimary}`}>
                Competitor Radar
              </h3>
              <ResponsiveContainer width="100%" height={250}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke={dark ? "#334155" : "#e2e8f0"} />
                  <PolarAngleAxis
                    dataKey="metric"
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                  />
                  <Radar
                    name="You"
                    dataKey="you"
                    stroke="#6366f1"
                    fill="#6366f1"
                    fillOpacity={0.2}
                    strokeWidth={2}
                  />
                  {competitors.map((c) => (
                    <Radar
                      key={c.name}
                      name={c.name}
                      dataKey={c.name}
                      stroke={c.color}
                      fill={c.color}
                      fillOpacity={0.05}
                    />
                  ))}
                  <Tooltip
                    contentStyle={{
                      borderRadius: "12px",
                      background: dark ? "#1e293b" : "#fff",
                      border: "none",
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            <div className={`p-6 rounded-2xl border ${cardBg}`}>
              <h3 className={`font-bold text-sm mb-4 ${textPrimary}`}>
                Market Rating Rank
              </h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={barData} barSize={40}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke={dark ? "#1e293b" : "#f1f5f9"}
                  />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10 }}
                    axisLine={false}
                  />
                  <YAxis domain={[0, 5]} hide />
                  <Tooltip cursor={{ fill: "transparent" }} />
                  <Bar dataKey="rating" radius={[8, 8, 0, 0]}>
                    {barData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── Competitor Reviews ───────────────────────────────────── */}
          <div className={`border rounded-2xl ${cardBg}`}>
            <div
              className={`px-6 py-4 border-b ${dark ? "border-slate-800" : "border-slate-100"}`}
            >
              <h2 className={`font-bold text-base ${textPrimary}`}>
                Competitor Review Feed
              </h2>
              <div className="flex gap-2 mt-4 overflow-x-auto pb-2">
                {competitors.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCompetitor(c)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                      selectedCompetitor.id === c.id
                        ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                        : "bg-slate-500/10 text-slate-500 hover:bg-slate-500/20"
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
            <div className={`divide-y ${divider}`}>
              {selectedCompetitor.recentReviews.map((review) => (
                <div
                  key={review.id}
                  className="p-6 flex gap-4 items-start hover:bg-slate-500/5 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                    {review.author[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between items-center mb-1">
                      <h4 className={`text-sm font-bold ${textPrimary}`}>
                        {review.author}
                      </h4>
                      <span className="text-[10px] text-slate-500">
                        {review.date}
                      </span>
                    </div>
                    <Stars rating={review.rating} />
                    <p
                      className={`text-sm mt-2 leading-relaxed ${dark ? "text-slate-400" : "text-slate-600"}`}
                    >
                      {review.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
