/**
 * GrowthChart.jsx
 * Area chart showing reviews received vs responses sent per month.
 * The summary row below the chart shows exact counts per month —
 * these match the chart bars exactly because both come from the same
 * Redux-derived growthData array.
 *
 * Props:
 *   growthData — array of { month, reviews, responses, avgRating }
 *   summary    — selectSummaryStats (for subtitle and badge)
 *   trend      — { label, color }
 *   dark       — boolean
 */
import {
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import AnalyticsCard from "./AnalyticsCard.jsx";

function CustomTooltip({ active, payload, label, dark }) {
  if (!active || !payload?.length) return null;
  return (
    <div className={`p-3 rounded-xl border shadow-xl text-xs ${dark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200"}`}>
      <p className={`font-bold uppercase tracking-wider mb-2 text-[10px] ${dark ? "text-slate-500" : "text-slate-400"}`}>
        {label}
      </p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 mb-1 last:mb-0">
          <div className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
          <span className={`font-medium ${dark ? "text-slate-300" : "text-slate-700"}`}>
            {entry.name}:{" "}
            <span className="font-bold text-indigo-400">{entry.value}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export default function GrowthChart({ growthData, summary, trend, dark }) {
  const gridColor = dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)";
  const axisColor = dark ? "#475569" : "#94a3b8";
  const PRIMARY   = "#6366f1";
  const SECONDARY = "#10b981";

  return (
    <AnalyticsCard
      dark={dark}
      title="Review Growth"
      subtitle={`${summary.totalReviews} total reviews · ${summary.responseRate}% response rate`}
      badge={
        <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
          dark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-600"
        }`}>
          {trend.label} vs prev month
        </span>
      }
    >
      {/* Area Chart */}
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={growthData}
            margin={{ top: 5, right: 5, left: -20, bottom: 0 }}
          >
            <defs>
              <linearGradient id="gR" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={PRIMARY}   stopOpacity={0.3} />
                <stop offset="95%" stopColor={PRIMARY}   stopOpacity={0}   />
              </linearGradient>
              <linearGradient id="gS" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={SECONDARY} stopOpacity={0.2} />
                <stop offset="95%" stopColor={SECONDARY} stopOpacity={0}   />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fill: axisColor, fontSize: 11 }}
              dy={8}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: axisColor, fontSize: 11 }}
            />
            <Tooltip content={<CustomTooltip dark={dark} />} />

            {/* reviews = exact count of rawReviews per month */}
            <Area
              type="monotone"
              dataKey="reviews"
              stroke={PRIMARY}
              strokeWidth={2.5}
              fill="url(#gR)"
              name="Reviews"
            />
            {/* responses = count of replied:true per month */}
            <Area
              type="monotone"
              dataKey="responses"
              stroke={SECONDARY}
              strokeWidth={2}
              fill="url(#gS)"
              name="Responses"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Summary row — exact counts per month, matches chart above */}
      <div className={`flex justify-between mt-4 pt-4 border-t ${dark ? "border-slate-800" : "border-slate-100"}`}>
        {growthData.map((m) => (
          <div key={m.month} className="text-center">
            <p className={`text-[10px] font-bold ${dark ? "text-slate-500" : "text-slate-400"}`}>
              {m.month}
            </p>
            <p className={`text-xs font-black mt-0.5 ${dark ? "text-white" : "text-slate-900"}`}>
              {m.reviews}
            </p>
            <p className="text-[9px] text-indigo-400 font-bold">{m.responses}↩</p>
          </div>
        ))}
      </div>
    </AnalyticsCard>
  );
}