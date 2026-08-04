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

function CustomTooltip({ active, payload, dark }) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className={`p-3 rounded-xl border shadow-xl text-xs ${dark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200"}`}>
      <p className={`font-bold mb-1 ${dark ? "text-slate-200" : "text-slate-800"}`}>
        {d.payload.star}
      </p>
      <p className="text-indigo-400 font-bold">{d.value} reviews</p>
      <p className={dark ? "text-slate-500" : "text-slate-400"}>{d.payload.percentage}%</p>
    </div>
  );
}

export default function RatingDistribution({ ratingData, total, dark }) {
  const axisColor = dark ? "#475569" : "#94a3b8";

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
                <Cell key={i} fill={entry.color} />
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
          <div key={i} className="text-center">
            <p className="text-[10px] font-bold" style={{ color: r.color }}>
              {r.star.split(" ")[0]}★
            </p>
            <p className={`text-xs font-black mt-0.5 ${dark ? "text-white" : "text-slate-900"}`}>
              {r.count}
            </p>
            <p className={`text-[9px] font-bold ${dark ? "text-slate-500" : "text-slate-400"}`}>
              {r.percentage}%
            </p>
          </div>
        ))}
      </div>
    </AnalyticsCard>
  );
}