/**
 * RatingTrendChart.jsx
 * Line chart showing average star rating per month.
 * avgRating per month is computed in analyticsSlice.deriveGrowthData()
 * from rawReviews — so the line reflects real review data, not estimates.
 *
 * Props:
 *   growthData — selectGrowthData from Redux
 *                [ { month, reviews, responses, avgRating } ]
 *   avgRating  — summary.avgRating (overall average, shown in badge)
 *   dark       — boolean
 */
import {
  LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import AnalyticsCard from "./AnalyticsCard.jsx";

function CustomTooltip({ active, payload, label, dark }) {
  if (!active || !payload?.length) return null;
  return (
    <div className={`p-3 rounded-xl border shadow-xl text-xs ${dark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200"}`}>
      <p className={`font-bold mb-1 text-[10px] uppercase tracking-wider ${dark ? "text-slate-500" : "text-slate-400"}`}>
        {label}
      </p>
      <p className="font-bold text-amber-400">
        ★ {payload[0].value}
      </p>
    </div>
  );
}

export default function RatingTrendChart({ growthData, avgRating, dark }) {
  const gridColor = dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)";
  const axisColor = dark ? "#475569" : "#94a3b8";
  const AMBER     = "#f59e0b";

  // Determine if rating is trending up, down or flat
  const first = growthData[0]?.avgRating || 0;
  const last  = growthData[growthData.length - 1]?.avgRating || 0;
  const diff  = parseFloat((last - first).toFixed(2));
  const trendLabel = diff > 0 ? `↑ +${diff} since ${growthData[0]?.month}`
    : diff < 0 ? `↓ ${diff} since ${growthData[0]?.month}`
    : "Stable";
  const trendColor = diff > 0 ? "text-emerald-500" : diff < 0 ? "text-red-400" : "text-slate-500";

  return (
    <AnalyticsCard
      dark={dark}
      title="Rating Trend"
      subtitle="Average star rating per month — computed from raw reviews"
      badge={
        <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
          dark ? "bg-amber-500/10 text-amber-400" : "bg-amber-50 text-amber-600"
        }`}>
          ★ {avgRating} overall
        </span>
      }
    >
      <div className="h-[210px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={growthData}
            margin={{ top: 5, right: 5, left: -20, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fill: axisColor, fontSize: 11 }}
              dy={8}
            />
            {/* Domain starts at 3 so month-to-month changes are visible */}
            <YAxis
              domain={[3, 5]}
              axisLine={false}
              tickLine={false}
              tick={{ fill: axisColor, fontSize: 11 }}
            />
            <Tooltip content={<CustomTooltip dark={dark} />} />
            <Line
              type="monotone"
              dataKey="avgRating"
              stroke={AMBER}
              strokeWidth={2.5}
              dot={{ r: 4, fill: AMBER, strokeWidth: 0 }}
              activeDot={{ r: 6 }}
              name="Avg Rating"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Trend summary below chart */}
      <div className={`flex items-center justify-between mt-3 pt-3 border-t text-xs ${
        dark ? "border-slate-800" : "border-slate-100"
      }`}>
        <span className={dark ? "text-slate-500" : "text-slate-400"}>
          {growthData[0]?.month} → {growthData[growthData.length - 1]?.month}
        </span>
        <span className={`font-bold ${trendColor}`}>{trendLabel}</span>
      </div>
    </AnalyticsCard>
  );
}