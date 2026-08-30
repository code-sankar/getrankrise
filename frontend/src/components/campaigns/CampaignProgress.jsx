// frontend/src/components/campaigns/CampaignProgress.jsx
//
// A segmented progress bar built straight from a campaign's denormalised
// counters (sent_count / failed_count / skipped_count / total_recipients).
// Those columns exist precisely so this renders without a per-row GROUP BY.
//
// Segments, left → right: sent (emerald), failed (red), skipped (amber),
// then the remaining track is "pending" (neutral).

export default function CampaignProgress({
  total = 0,
  sent = 0,
  failed = 0,
  skipped = 0,
  dark = true,
  showLegend = true,
}) {
  const safeTotal = Math.max(total, 0);
  const pending = Math.max(safeTotal - sent - failed - skipped, 0);

  const pct = (n) => (safeTotal > 0 ? (n / safeTotal) * 100 : 0);

  const track = dark ? "bg-slate-800" : "bg-slate-200";
  const muted = "text-slate-500 dark:text-slate-400";

  const segments = [
    { key: "sent", value: sent, color: "bg-emerald-500" },
    { key: "failed", value: failed, color: "bg-red-500" },
    { key: "skipped", value: skipped, color: "bg-amber-500" },
  ];

  const legend = [
    { label: "Sent", value: sent, dot: "bg-emerald-500" },
    { label: "Failed", value: failed, dot: "bg-red-500" },
    { label: "Skipped", value: skipped, dot: "bg-amber-500" },
    { label: "Pending", value: pending, dot: dark ? "bg-slate-600" : "bg-slate-400" },
  ];

  return (
    <div className="w-full">
      <div className={`w-full h-2.5 rounded-full overflow-hidden flex ${track}`}>
        {segments.map((s) =>
          s.value > 0 ? (
            <div
              key={s.key}
              className={`${s.color} h-full transition-all duration-500`}
              style={{ width: `${pct(s.value)}%` }}
            />
          ) : null
        )}
      </div>

      {showLegend && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          {legend.map((l) => (
            <span key={l.label} className={`inline-flex items-center gap-1.5 text-[11px] ${muted}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${l.dot}`} />
              <span className="font-semibold tabular-nums">{l.value}</span>
              {l.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}