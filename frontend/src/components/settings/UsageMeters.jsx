// frontend/src/components/settings/UsageMeters.jsx
//
// Surfaces GET /api/v1/usage.
//
// That endpoint has been complete, tested and mounted since Phase 5 and no
// screen has ever called it — so AI replies, review-request emails, manual
// review syncs and competitor refreshes all have hard caps that a user could
// only discover by hitting one mid-task. The numbers were always there; nothing
// asked for them.
//
// ── Local state, no slice ───────────────────────────────────────────────────
// Deliberate. Usage is read in exactly one place, is never mutated from the
// client, and is stale the moment anything is spent. Putting it in Redux would
// add a slice that must be remembered in the sign-out teardown for no benefit —
// and forgetting exactly that is what leaked the previous clinic's data before.
// A component that fetches on mount and unmounts on navigation cannot leak.

import { useEffect, useState } from "react";
import axiosInstance from "../../utils/axios.helper.js";

// The server's metric keys, in the order they matter to a clinic owner.
const METRIC_LABELS = {
  ai_reply: { label: "AI reply drafts", hint: "per month" },
  email: { label: "Review request emails", hint: "per month" },
  review_sync: { label: "Manual review syncs", hint: "per day" },
  competitor_sync: { label: "Competitor refreshes", hint: "per day" },
};
const METRIC_ORDER = ["ai_reply", "email", "review_sync", "competitor_sync"];

/** Bar colour by pressure, so "nearly out" reads without counting. */
function barTone(used, limit) {
  if (limit === null) return "bg-emerald-500";
  if (limit === 0) return "bg-slate-500";
  const pct = used / limit;
  if (pct >= 1) return "bg-red-500";
  if (pct >= 0.8) return "bg-amber-500";
  return "bg-indigo-500";
}

function Meter({ metric, data, dark }) {
  const meta = METRIC_LABELS[metric] || { label: metric, hint: "" };
  const { used, limit } = data;

  // limit === null means unlimited on this plan (the usage API's convention);
  // limit === 0 means the plan doesn't include the feature at all. Those are
  // different sentences, and collapsing them into "0 / 0" would tell a Premium
  // customer their unlimited feature was exhausted.
  const unlimited = limit === null;
  const notIncluded = limit === 0;
  const pct = unlimited || notIncluded ? 0 : Math.min((used / limit) * 100, 100);

  return (
    <div className="py-3">
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <span className={`text-sm font-semibold ${dark ? "text-slate-200" : "text-slate-800"}`}>
          {meta.label}
        </span>
        <span className={`text-xs font-medium tabular-nums ${dark ? "text-slate-400" : "text-slate-500"}`}>
          {unlimited
            ? `${used.toLocaleString()} used · unlimited`
            : notIncluded
              ? "Not included on your plan"
              : `${used.toLocaleString()} / ${limit.toLocaleString()} ${meta.hint}`}
        </span>
      </div>

      <div className={`h-1.5 w-full rounded-full overflow-hidden ${dark ? "bg-slate-800" : "bg-slate-200"}`}>
        <div
          className={`h-full rounded-full transition-all duration-500 ${barTone(used, limit)}`}
          style={{ width: `${unlimited ? 100 : pct}%` }}
        />
      </div>

      {!unlimited && !notIncluded && used >= limit && (
        <p className="text-xs text-red-400 font-medium mt-1.5">
          Limit reached — resets {meta.hint === "per day" ? "tomorrow" : "next month"}.
        </p>
      )}
    </div>
  );
}

export default function UsageMeters({ dark }) {
  const [state, setState] = useState({ status: "loading", data: null, error: "" });

  useEffect(() => {
    let cancelled = false;

    axiosInstance
      .get("/usage")
      .then(({ data }) => {
        if (cancelled) return;
        setState({ status: "ready", data: data?.data ?? null, error: "" });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          status: "error",
          data: null,
          error: err?.response?.data?.message || "Couldn't load your usage right now.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const heading = (
    <div className="mb-1">
      <h3 className={`text-sm font-bold ${dark ? "text-white" : "text-slate-900"}`}>
        This period's usage
      </h3>
      <p className="text-xs text-slate-500 mt-0.5">
        Monthly meters reset on the 1st; daily meters reset at midnight UTC.
      </p>
    </div>
  );

  if (state.status === "loading") {
    return (
      <div>
        {heading}
        <div className="space-y-4 mt-4" aria-busy="true">
          {METRIC_ORDER.map((m) => (
            <div key={m} className="animate-pulse">
              <div className={`h-3 w-40 rounded mb-2 ${dark ? "bg-slate-800" : "bg-slate-200"}`} />
              <div className={`h-1.5 w-full rounded-full ${dark ? "bg-slate-800" : "bg-slate-200"}`} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div>
        {heading}
        <p className="text-sm text-red-400 mt-3">{state.error}</p>
      </div>
    );
  }

  const metrics = state.data?.metrics ?? {};
  // Render from a fixed order, not Object.keys, so the list doesn't reshuffle
  // if the server ever changes its own ordering.
  const present = METRIC_ORDER.filter((m) => metrics[m]);

  if (present.length === 0) {
    return (
      <div>
        {heading}
        <p className="text-sm text-slate-500 mt-3">No metered features on your plan yet.</p>
      </div>
    );
  }

  return (
    <div>
      {heading}
      <div className={`mt-2 divide-y ${dark ? "divide-slate-800" : "divide-slate-100"}`}>
        {present.map((m) => (
          <Meter key={m} metric={m} data={metrics[m]} dark={dark} />
        ))}
      </div>
    </div>
  );
}
