/**
 * StatPillGrid.jsx
 * Renders the 6 key metric pills at the top of the Analytics page.
 * All values come from the Redux-derived summaryStats — nothing is hardcoded.
 *
 * Props:
 *   summary   — selectSummaryStats from Redux
 *   trend     — { label, color } from getTrend(summary.growth)
 *   sentiment — { label, color } from getSentimentLabel(summary.sentimentScore)
 *   lastMonth — string e.g. "Apr" — last month name from growthData
 *   dark      — boolean
 */

function StatPill({ label, value, sub, subColor, dark }) {
  return (
    <div
      className={`p-4 rounded-2xl border ${
        dark
          ? "bg-slate-900/40 border-slate-800"
          : "bg-white border-slate-200 shadow-sm"
      }`}
    >
      <p className={`text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400`}>
        {label}
      </p>
      <p className={`text-xl font-black mt-1 ${dark ? "text-white" : "text-slate-900"}`}>
        {value}
      </p>
      {sub && (
        <p className={`text-[10px] font-bold mt-1 ${subColor || ("text-slate-500 dark:text-slate-400")}`}>
          {sub}
        </p>
      )}
    </div>
  );
}

export default function StatPillGrid({ summary, trend, sentiment, lastMonth, dark }) {
  const pills = [
    {
      // Labelled "Total Reviews" until this pill was caught reading 1 while
      // the review feed showed 34 — it has always counted only the SELECTED
      // RANGE, like every other pill here. The name now says so, and the
      // sub-line carries the lifetime figure the feed agrees with.
      label:    "Reviews in Range",
      value:    summary.totalReviews,
      sub:      summary.lifetimeReviews > summary.totalReviews
        ? `${summary.lifetimeReviews} all time`
        : trend.label,
      subColor: summary.lifetimeReviews > summary.totalReviews
        ? undefined
        : trend.color,
    },
    {
      label:    "Avg Rating",
      value:    `★ ${summary.avgRating}`,
      sub:      "Out of 5.0",
      subColor: "text-amber-700 dark:text-amber-500",
    },
    {
      label:    "Response Rate",
      value:    `${summary.responseRate}%`,
      sub:      summary.responseRate >= 90 ? "↑ Top tier" : "Room to improve",
      subColor: summary.responseRate >= 90 ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-500",
    },
    {
      label:    "Sentiment",
      value:    `${summary.sentimentScore}%`,
      sub:      sentiment.label,
      subColor: sentiment.color,
    },
    {
      label:    "New This Month",
      value:    `+${summary.newThisMonth}`,
      sub:      lastMonth ? `as of ${lastMonth}` : "Latest month",
      subColor: "text-cyan-700 dark:text-cyan-400",
    },
    {
      label:    "Urgent Alerts",
      value:    summary.urgentCount,
      sub:      summary.urgentCount > 0 ? "Needs reply" : "All clear",
      subColor: summary.urgentCount > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {pills.map((p) => (
        <StatPill key={p.label} dark={dark} {...p} />
      ))}
    </div>
  );
}