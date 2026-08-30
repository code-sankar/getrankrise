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
import { CHART } from "../../theme.js";

function CustomTooltip({ active, payload, label, dark }) {
  if (!active || !payload?.length) return null;
  return (
    <div className={`p-3 rounded-xl border shadow-xl text-xs ${dark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200"}`}>
      <p className={`font-bold mb-1 text-[10px] uppercase tracking-wider text-slate-600 dark:text-slate-400`}>
        {label}
      </p>
      <p className="font-bold text-amber-700 dark:text-amber-500">
        ★ {payload[0].value}
      </p>
    </div>
  );
}

export default function RatingTrendChart({ growthData, avgRating, dark }) {
  const mode = dark ? "dark" : "light";
  const gridColor = CHART.grid[mode];
  const axisColor = CHART.axis[mode];
  // Amber, and deliberately not the chart accent. Amber is normally reserved
  // as status.warn, but a star is gold everywhere else in this product — the
  // review cards, the rating pills, the distribution labels — and a rating
  // line in cyan would be the one gold thing on the page that isn't. Here the
  // convention is stronger than the reservation.
  const AMBER = "#f59e0b";

  // Determine if rating is trending up, down or flat
  const first = growthData[0]?.avgRating || 0;
  const last  = growthData[growthData.length - 1]?.avgRating || 0;
  const diff  = parseFloat((last - first).toFixed(2));
  const trendLabel = diff > 0 ? `↑ +${diff} since ${growthData[0]?.month}`
    : diff < 0 ? `↓ ${diff} since ${growthData[0]?.month}`
    : "Stable";
  const trendColor = diff > 0 ? "text-emerald-700 dark:text-emerald-400" : diff < 0 ? "text-red-600 dark:text-red-400" : "text-slate-600 dark:text-slate-400";

  return (
    <AnalyticsCard
      dark={dark}
      title="Rating Trend"
      subtitle="Average star rating per month — computed from raw reviews"
      badge={
        <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
          dark ? "bg-amber-500/10 text-amber-700 dark:text-amber-500" : "bg-amber-50 text-amber-700 dark:text-amber-500"
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
            <CartesianGrid vertical={false} stroke={gridColor} />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fill: axisColor, fontSize: 11 }}
              dy={8}
            />
            {/* ── The full 1–5 scale, not a zoomed 3–5 window ───────────────
                The domain used to start at 3 "so month-to-month changes are
                visible". Two things were wrong with that. It doubled the
                apparent slope of every change, so a drift from 4.6 to 4.4
                looked like a collapse. And it clipped: a clinic averaging 2.8
                — precisely the clinic that most needs to see this chart —
                had its line disappear off the bottom of the card entirely.
                A star rating is a 1–5 scale and readers already know its
                range, so showing the real one costs nothing. */}
            <YAxis
              domain={[1, 5]}
              ticks={[1, 2, 3, 4, 5]}
              axisLine={false}
              tickLine={false}
              tick={{ fill: axisColor, fontSize: 11 }}
            />
            <Tooltip content={<CustomTooltip dark={dark} />} />
            {/* linear, not monotone: a spline through monthly averages
                overshoots its endpoints, and an overshoot here draws a rating
                above 5 — a value that cannot exist. */}
            <Line
              type="linear"
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
        <span className={"text-slate-600 dark:text-slate-400"}>
          {growthData[0]?.month} → {growthData[growthData.length - 1]?.month}
        </span>
        <span className={`font-bold ${trendColor}`}>{trendLabel}</span>
      </div>
    </AnalyticsCard>
  );
}