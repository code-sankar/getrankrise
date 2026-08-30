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
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import AnalyticsCard from "./AnalyticsCard.jsx";
import { CHART } from "../../theme.js";

function CustomTooltip({ active, payload, label, dark }) {
  if (!active || !payload?.length) return null;
  return (
    <div className={`p-3 rounded-xl border shadow-xl text-xs ${dark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200"}`}>
      <p className={`font-bold uppercase tracking-wider mb-2 text-[10px] text-slate-500 dark:text-slate-400`}>
        {label}
      </p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 mb-1 last:mb-0">
          <div className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
          {/* The swatch carries the series identity; the text stays in ink.
              Painting the number itself in the series colour made "responses"
              read as green-for-good rather than as a count. */}
          <span className={`font-medium ${dark ? "text-slate-300" : "text-slate-700"}`}>
            {entry.name}:{" "}
            <span className={`font-bold ${dark ? "text-white" : "text-slate-900"}`}>
              {entry.value}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

export default function GrowthChart({ growthData, summary, trend, dark }) {
  const mode = dark ? "dark" : "light";
  const gridColor = CHART.grid[mode];
  const axisColor = CHART.axis[mode];
  const [PRIMARY, SECONDARY] = CHART.series[mode];

  return (
    <AnalyticsCard
      dark={dark}
      title="Review Growth"
      // "total reviews" here named the range-scoped count. Both this chart and
      // the count it describes are range-scoped, so the wording — not the
      // number — was the wrong half.
      subtitle={`${summary.totalReviews} reviews in range · ${summary.responseRate}% response rate`}
      badge={
        <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
          dark ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-emerald-50 text-emerald-700 dark:text-emerald-400"
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

            {/* Solid hairline. A dashed grid reads as "threshold" or
                "projection" when it is only a grid. */}
            <CartesianGrid vertical={false} stroke={gridColor} />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fill: axisColor, fontSize: 11 }}
              dy={8}
            />
            {/* allowDecimals={false} because this axis counts reviews. Without
                it Recharts picked 0.25 / 0.5 / 0.75 ticks whenever the range
                was small, offering the reader three quarters of a review. */}
            <YAxis
              allowDecimals={false}
              axisLine={false}
              tickLine={false}
              tick={{ fill: axisColor, fontSize: 11 }}
            />
            <Tooltip content={<CustomTooltip dark={dark} />} />
            {/* Two series, so identity can never rest on colour alone. */}
            <Legend
              verticalAlign="top"
              align="right"
              height={28}
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 11, color: axisColor }}
            />

            {/* ── type="linear", NOT "monotone" ─────────────────────────────
                This is a count of discrete events at known dates. A spline
                invents the values BETWEEN those dates, and with sparse data
                it invents dramatic ones: eight days holding at 1 review each
                rendered as a sine wave that repeatedly dipped to zero, so the
                chart showed days with no reviews that in fact had one. A
                straight segment between two real points claims only that the
                endpoints are real, which is the most this data supports. */}
            <Area
              type="linear"
              dataKey="reviews"
              stroke={PRIMARY}
              strokeWidth={2}
              fill="url(#gR)"
              dot={{ r: 2.5, fill: PRIMARY, strokeWidth: 0 }}
              activeDot={{ r: 4 }}
              name="Reviews"
            />
            {/* responses = count of replied:true per month */}
            <Area
              type="linear"
              dataKey="responses"
              stroke={SECONDARY}
              strokeWidth={2}
              fill="url(#gS)"
              dot={{ r: 2.5, fill: SECONDARY, strokeWidth: 0 }}
              activeDot={{ r: 4 }}
              name="Responses"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── The chart's table view ───────────────────────────────────────────
          Not decoration and not a duplicate axis: this is the exact-value
          reading of the plot above, which is what makes the chart usable
          without colour vision and what lets someone check a number rather
          than estimate it off an axis. It is labelled as such, and it scrolls
          on its own rather than crushing 30 columns into 300px. */}
      <div className={`mt-4 pt-4 border-t ${dark ? "border-slate-800" : "border-slate-100"}`}>
        <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 text-slate-500 dark:text-slate-400`}>
          Reviews · responses per period
        </p>
        <div className="flex gap-4 overflow-x-auto pb-1">
          {growthData.map((m) => (
            <div key={m.month} className="text-center shrink-0 min-w-[44px]">
              <p className={`text-[10px] font-bold text-slate-500 dark:text-slate-400`}>
                {m.month}
              </p>
              <p className={`text-xs font-black mt-0.5 ${dark ? "text-white" : "text-slate-900"}`}>
                {m.reviews}
              </p>
              <p className={`text-[9px] font-bold text-slate-500 dark:text-slate-400`}>
                {m.responses} replied
              </p>
            </div>
          ))}
        </div>
      </div>
    </AnalyticsCard>
  );
}