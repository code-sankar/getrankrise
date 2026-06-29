// frontend/src/components/billing/CreditsPill.jsx
import { useEffect, useState } from "react";
import { MessageSquare, Zap } from "lucide-react";
import { useDispatch } from "react-redux";
import { getUserCredits } from "../../hooks/credits.hook.js";
import { showUpgradeModal } from "../../store/upgradeModalSlice.js";

export default function CreditsPill({ channel = "sms" }) {
  const dispatch = useDispatch();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    getUserCredits().then((d) => {
      if (mounted) { setData(d); setLoading(false); }
    });
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/60 border border-slate-800">
        <div className="w-3 h-3 rounded-full border border-slate-700 border-t-cyan-400 animate-spin" />
        <span className="text-[10px] text-slate-500 tracking-widest uppercase">Loading</span>
      </div>
    );
  }
  if (!data) return null;

  const c       = data[channel];
  const pct     = c.limit > 0 ? (c.used / c.limit) * 100 : 100;
  const isLow   = pct >= 80 && pct < 100;
  const isOut   = pct >= 100 || c.limit === 0;

  const promptUpgrade = () => dispatch(showUpgradeModal({
    currentPlan:   data.plan,
    requiredPlans: c.limit === 0 ? ["starter", "premium"] : ["premium"],
    message: c.limit === 0
      ? `Your ${data.plan} plan doesn't include ${channel.toUpperCase()} sends.`
      : `You've used all ${c.limit} ${channel.toUpperCase()} credits this period.`,
  }));

  // ── Visual states ─────────────────────────────────────────────────────
  const ring = isOut
    ? "border-red-500/40 bg-red-500/5"
    : isLow
    ? "border-amber-500/40 bg-amber-500/5"
    : "border-cyan-500/30 bg-cyan-500/5";

  const dotColor = isOut ? "bg-red-400" : isLow ? "bg-amber-400" : "bg-cyan-400";
  const Icon     = channel === "whatsapp" ? Zap : MessageSquare;

  return (
    <button
      onClick={isOut ? promptUpgrade : undefined}
      className={`group inline-flex items-center gap-3 pl-3 pr-4 py-2 rounded-full border transition ${ring} ${
        isOut ? "cursor-pointer hover:scale-[1.02]" : "cursor-default"
      }`}
    >
      {/* status dot */}
      <span className="relative flex items-center justify-center">
        <span className={`absolute w-2 h-2 rounded-full ${dotColor} animate-ping opacity-60`} />
        <span className={`relative w-2 h-2 rounded-full ${dotColor}`} />
      </span>

      <Icon size={13} className="text-slate-300" />

      <div className="flex items-baseline gap-1.5">
        <span className="text-xs font-bold text-white tabular-nums">{c.remaining}</span>
        <span className="text-[10px] text-slate-500 tabular-nums">/ {c.limit}</span>
        <span className="text-[10px] text-slate-500 ml-1 tracking-wider uppercase font-semibold">
          {channel === "whatsapp" ? "WA" : "SMS"}
        </span>
      </div>

      {/* mini progress bar */}
      <div className="w-16 h-1 rounded-full bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            isOut ? "bg-red-400" : isLow ? "bg-amber-400" : "bg-cyan-400"
          }`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>

      {isOut && (
        <span className="text-[10px] font-bold text-red-300 tracking-wider uppercase">Upgrade →</span>
      )}
    </button>
  );
}