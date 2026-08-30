/**
 * RatingDistribution.jsx
 * Horizontal bar chart showing count per star rating.
 * The percentage row below verifies numbers — all add up to 100%
 * because both count and percentage are derived from the same
 * rawReviews in analyticsSlice.
 *
 * Props:
 *   ratingData — selectRatingBreakdown from Redux
 *                [ { star, count, percentage, color } ]
 *   total      — summary.totalReviews, i.e. the count for the SELECTED RANGE,
 *                not the clinic's lifetime total (that is summary.lifetimeReviews)
 *   dark       — boolean
 */
import {
  BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import AnalyticsCard from "./AnalyticsCard.jsx";
import { CHART } from "../../theme.js";

function CustomTooltip({ active, payload, dark }) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className={`p-3 rounded-xl border shadow-xl text-xs ${dark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200"}`}>
      <p className={`font-bold mb-1 ${dark ? "text-slate-200" : "text-slate-800"}`}>
        {d.payload.star}
      </p>
      <p className={`font-bold ${dark ? "text-white" : "text-slate-900"}`}>
        {d.value} reviews
      </p>
      <p className={"text-slate-500 dark:text-slate-400"}>{d.payload.percentage}%</p>
    </div>
  );
}

export default function RatingDistribution({ ratingData, total, dark }) {
  const mode = dark ? "dark" : "light";
  const axisColor = CHART.axis[mode];
  // Star rating is an ORDERED category, which is the one case where colouring
  // by category is correct rather than double-encoding. Index 0 is 5★, so the
  // ramp is read in the order the rows are already in — the colour follows the
  // star, never the bar's current rank, so filtering cannot repaint the rows.
  const ramp = CHART.ratingRamp[mode];
  const colorFor = (i) => ramp[Math.min(i, ramp.length - 1)];

  return (
    <AnalyticsCard
      dark={dark}
      title="Rating Distribution"
      // "all N reviews" — but ratingData, like `total`, is range-scoped, so
      // "all" overclaimed on every range except all_time.
      subtitle={`Breakdown of ${total} reviews in range by star`}
    >
      {/* Horizontal bar chart */}
      <div className="h-[210px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={ratingData}
            layout="vertical"
            margin={{ left: -30 }}
          >
            <XAxis type="number" hide />
            <YAxis
              dataKey="star"
              type="category"
              axisLine={false}
              tickLine={false}
              tick={{ fill: axisColor, fontSize: 11 }}
            />
            <Tooltip
              content={<CustomTooltip dark={dark} />}
              cursor={{ fill: "transparent" }}
            />
            <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={18} name="Reviews">
              {ratingData.map((entry, i) => (
                <Cell key={entry.star ?? i} fill={colorFor(i)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Percentage row — count + % both derived from rawReviews, adds to 100% */}
      <div className={`flex justify-between mt-3 pt-3 border-t ${
        dark ? "border-slate-800" : "border-slate-100"
      }`}>
        {ratingData.map((r, i) => (
          <div key={r.star ?? i} className="text-center">
            {/* The label is ink and the swatch beside it carries the colour.
                Painting the "1★" text itself in the ramp's lightest step put a
                10px glyph on the card at 2.37:1 — the row that matters most in
                a reputation product was the least legible one on it. */}
            <p className="text-[10px] font-bold flex items-center justify-center gap-1 text-slate-600 dark:text-slate-300">
              <span
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ background: colorFor(i) }}
                aria-hidden="true"
              />
              {r.star.split(" ")[0]}★
            </p>
            <p className={`text-xs font-black mt-0.5 ${dark ? "text-white" : "text-slate-900"}`}>
              {r.count}
            </p>
            <p className={`text-[9px] font-bold text-slate-500 dark:text-slate-400`}>
              {r.percentage}%
            </p>
          </div>
        ))}
      </div>
    </AnalyticsCard>
  );
}