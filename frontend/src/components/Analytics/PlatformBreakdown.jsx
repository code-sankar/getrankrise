/**
 * PlatformBreakdown.jsx
 * Donut pie chart + per-platform metrics list.
 * All values (count, avgRating, responseRate) are derived from
 * rawReviews in analyticsSlice — nothing is hardcoded here.
 *
 * Props:
 *   platforms — selectPlatformData from Redux
 *               [ { name, value, color, avgRating, responseRate } ]
 *   total     — total reviews across all platforms (sum of value)
 *   dark      — boolean
 */
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from "recharts";
import AnalyticsCard from "./AnalyticsCard.jsx";

function CustomTooltip({ active, payload, dark }) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className={`p-3 rounded-xl border shadow-xl text-xs ${dark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200"}`}>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full" style={{ background: d.payload.color }} />
        <span className={`font-bold ${dark ? "text-slate-200" : "text-slate-800"}`}>{d.name}</span>
      </div>
      <p className="mt-1 text-indigo-400 font-bold">{d.value} reviews</p>
    </div>
  );
}

export default function PlatformBreakdown({ platforms, total, dark }) {
  return (
    <AnalyticsCard
      dark={dark}
      title="Platform Breakdown"
      subtitle={`${total} reviews across all platforms`}
    >
      {/* Donut pie */}
      <ResponsiveContainer width="100%" height={170}>
        <PieChart>
          <Pie
            data={platforms}
            dataKey="value"
            innerRadius={50}
            outerRadius={72}
            paddingAngle={4}
          >
            {platforms.map((p, i) => (
              <Cell key={i} fill={p.color} stroke="none" />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip dark={dark} />} />
        </PieChart>
      </ResponsiveContainer>

      {/* Per-platform rows */}
      <div className="space-y-2 mt-3">
        {platforms.map((p, i) => (
          <div
            key={i}
            className={`flex items-center justify-between px-3 py-2.5 rounded-xl ${
              dark ? "bg-slate-800/40" : "bg-slate-50"
            }`}
          >
            {/* Platform name */}
            <div className="flex items-center gap-2">
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ background: p.color }}
              />
              <span className={`text-xs font-semibold ${dark ? "text-slate-300" : "text-slate-700"}`}>
                {p.name}
              </span>
            </div>

            {/* Metrics — all derived from rawReviews */}
            <div className="flex items-center gap-3 text-[10px] font-bold">
              {/* count: exact number of rawReviews for this platform */}
              <span className={dark ? "text-slate-400" : "text-slate-500"}>
                {p.value}
              </span>
              {/* avgRating: mean rating of this platform's reviews */}
              <span style={{ color: p.color }}>★ {p.avgRating}</span>
              {/* responseRate: replied reviews / total reviews × 100 */}
              <span className={p.responseRate >= 85 ? "text-emerald-500" : "text-amber-500"}>
                {p.responseRate}%
              </span>
            </div>
          </div>
        ))}

        {/* Total row */}
        <div className={`flex justify-between px-3 pt-2 border-t text-xs font-bold ${
          dark ? "border-slate-800 text-slate-400" : "border-slate-100 text-slate-500"
        }`}>
          <span>Total</span>
          <span className={dark ? "text-white" : "text-slate-900"}>{total} reviews</span>
        </div>
      </div>
    </AnalyticsCard>
  );
}