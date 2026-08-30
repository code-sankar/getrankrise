/**
 * PlatformBreakdown.jsx
 * Share of reviews per platform, plus each platform's rating and response rate.
 * All values (count, avgRating, responseRate) are derived from
 * rawReviews in analyticsSlice — nothing is hardcoded here.
 *
 * ── WHY THIS IS NO LONGER A DONUT ───────────────────────────────────────────
 * It used to be a donut whose segments were the platforms' own brand colours.
 * Google #4285F4 against Facebook #1877F2 measures ΔE 4.8 for normal colour
 * vision — the threshold for telling two marks apart is 15 — and 3.9 under
 * deuteranopia. Two adjacent segments, both blue, and nothing else to tell
 * them apart: the most common real reading of that chart was "one blue ring".
 *
 * Repainting Facebook a colour Facebook is not would fix the contrast and
 * break the recognition the brand colour was there for. So the encoding
 * changed instead of the palette: a labelled bar per platform, where the NAME
 * carries the identity and length carries the quantity. Brand colour stays as
 * a dot beside its own label, which is the one place it was always safe.
 *
 * The donut was also redundant — it showed share, and the rows below it
 * already showed share. One of the two had to go.
 *
 * Props:
 *   platforms — selectPlatformData from Redux
 *               [ { name, value, color, avgRating, responseRate } ]
 *   total     — total reviews across all platforms (sum of value)
 *   dark      — boolean
 */
import AnalyticsCard from "./AnalyticsCard.jsx";

export default function PlatformBreakdown({ platforms, total, dark }) {
  const safeTotal = total > 0 ? total : 1; // never divide by zero on an empty clinic

  return (
    <AnalyticsCard
      dark={dark}
      title="Platform Breakdown"
      subtitle={`${total} reviews across all platforms`}
    >
      {/* Column headers. Three bare numbers per row previously sat beside a
          donut showing share, so the reader had every reason to read the
          percentage as that share — it is the response rate. Naming the
          columns is the whole fix. */}
      <div className={`flex items-center justify-between px-3 pb-2 text-[10px] font-bold uppercase tracking-wider ${
        "text-slate-600 dark:text-slate-400"
      }`}>
        <span>Platform</span>
        <div className="flex items-center gap-3 text-right">
          <span className="w-14">Reviews</span>
          <span className="w-10">Rating</span>
          <span className="w-14">Replied</span>
        </div>
      </div>

      <div className="space-y-2">
        {platforms.map((p) => {
          const share = Math.round((p.value / safeTotal) * 100);
          return (
            <div
              key={p.name}
              className={`px-3 py-2.5 rounded-xl ${dark ? "bg-slate-800/40" : "bg-slate-50"}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ background: p.color }}
                  />
                  <span className={`text-xs font-semibold truncate ${dark ? "text-slate-700 dark:text-slate-300" : "text-slate-700 dark:text-slate-300"}`}>
                    {p.name}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-[11px] font-bold shrink-0 text-right">
                  <span className={`w-14 ${dark ? "text-white" : "text-slate-900"}`}>
                    {p.value}
                    <span className={`ml-1 font-medium text-slate-600 dark:text-slate-400`}>
                      {share}%
                    </span>
                  </span>
                  {/* Ink, not the series colour — a rating painted Facebook
                      blue reads as a brand mark rather than a number. */}
                  <span className={`w-10 ${dark ? "text-slate-700 dark:text-slate-300" : "text-slate-600 dark:text-slate-400"}`}>
                    ★ {p.avgRating}
                  </span>
                  {/* Response rate IS a status — it is good or it needs work —
                      so a status colour is correct here, unlike above. */}
                  <span className={`w-14 ${p.responseRate >= 85 ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-500"}`}>
                    {p.responseRate}%
                  </span>
                </div>
              </div>

              {/* Share of total, drawn. One accent for every bar: the bar
                  encodes quantity, the label above encodes identity. */}
              <div
                className={`mt-2 h-1.5 rounded-full overflow-hidden ${dark ? "bg-slate-700/50" : "bg-slate-200"}`}
                role="img"
                aria-label={`${p.name}: ${p.value} of ${total} reviews, ${share}%`}
              >
                <div
                  className="h-full rounded-full bg-cyan-500"
                  style={{ width: `${share}%` }}
                />
              </div>
            </div>
          );
        })}

        {/* Total row */}
        <div className={`flex justify-between px-3 pt-2 border-t text-xs font-bold ${
          dark ? "border-slate-800 text-slate-600 dark:text-slate-400" : "border-slate-100 text-slate-600 dark:text-slate-400"
        }`}>
          <span>Total</span>
          <span className={dark ? "text-white" : "text-slate-900"}>{total} reviews</span>
        </div>
      </div>
    </AnalyticsCard>
  );
}