// frontend/src/components/billing/UpgradeModal.jsx
import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { Sparkles, Check, X } from "lucide-react";
import { hideUpgradeModal } from "../../store/upgradeModalSlice.js";
import UpgradeButton from "./UpgradeButton.jsx";

const PLANS = [
  {
    id:       "starter",
    name:     "Starter",
    price:    49,
    tagline:  "For single-location businesses",
    features: [
      "Full context-aware AI engine",
      "24-hour data sync",
      "Track up to 3 competitors",
      "50 SMS review invites / month",
      "Email support",
    ],
  },
  {
    id:       "premium",
    name:     "Premium",
    price:    99,
    tagline:  "For high-volume operators",
    features: [
      "Everything in Starter",
      "Hourly review sync",
      "Track up to 10 competitors",
      "500 SMS + 500 WhatsApp credits / month",
      "Pulse Campaigns automation",
      "Priority support",
    ],
    recommended: true,
  },
];

export default function UpgradeModal() {
  const dispatch = useDispatch();
  const { open, currentPlan, requiredPlans, featureName, message } =
    useSelector((s) => s.upgradeModal);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && dispatch(hideUpgradeModal());
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dispatch]);

  if (!open) return null;

  const visiblePlans = PLANS.filter((p) => requiredPlans.includes(p.id));
  const close = () => dispatch(hideUpgradeModal());

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 shadow-2xl shadow-cyan-500/5"
      >
        {/* glow */}
        <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />

        {/* close */}
        <button
          onClick={close}
          className="absolute top-4 right-4 p-2 rounded-lg text-slate-500 hover:text-slate-100 hover:bg-slate-800/80 transition"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        {/* header */}
        <div className="px-8 pt-10 pb-8 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-bold tracking-[0.2em] uppercase mb-4">
            <Sparkles size={12} />
            Upgrade Required
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-3">
            {featureName ? `Unlock ${featureName}` : "Unlock the full GetRankRise engine"}
          </h2>
          <p className="text-sm text-slate-400 max-w-xl mx-auto leading-relaxed">
            {message || `You're on the ${currentPlan} plan. Pick a plan below to keep moving — most teams break even within their first reclaimed review.`}
          </p>
        </div>

        {/* cards */}
        <div className={`grid gap-4 px-8 pb-8 ${visiblePlans.length > 1 ? "md:grid-cols-2" : "max-w-md mx-auto"}`}>
          {visiblePlans.map((plan) => (
            <div
              key={plan.id}
              className={`relative rounded-xl p-6 flex flex-col border bg-slate-900/40 backdrop-blur ${
                plan.recommended
                  ? "border-cyan-500/40 shadow-lg shadow-cyan-500/10"
                  : "border-slate-800"
              }`}
            >
              {plan.recommended && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-[9px] font-bold tracking-[0.2em] uppercase">
                  Recommended
                </div>
              )}

              <h3 className="text-xl font-bold text-white">{plan.name}</h3>
              <p className="text-xs text-slate-500 mt-1 mb-6">{plan.tagline}</p>

              <div className="mb-6 flex items-baseline gap-1">
                <span className="text-4xl font-bold text-white">${plan.price}</span>
                <span className="text-sm text-slate-500">/ month</span>
              </div>

              <ul className="space-y-3 mb-8 flex-grow">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                    <Check size={16} className="text-cyan-400 flex-shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <UpgradeButton
                plan={plan.id}
                className={`w-full px-4 py-3 rounded-xl font-semibold text-sm ${
                  plan.recommended
                    ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:shadow-lg hover:shadow-cyan-500/30"
                    : "bg-slate-800 text-slate-100 hover:bg-slate-700 border border-slate-700"
                }`}
              >
                Upgrade to {plan.name}
              </UpgradeButton>
            </div>
          ))}
        </div>

        {/* footer */}
        <div className="px-8 pb-8 text-center border-t border-slate-800/50 pt-6">
          <p className="text-[10px] text-slate-600 tracking-[0.2em] uppercase font-semibold">
            14-day money-back guarantee · Cancel anytime · Taxes handled by Paddle
          </p>
        </div>
      </div>
    </div>
  );
}