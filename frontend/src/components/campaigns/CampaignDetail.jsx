// frontend/src/components/campaigns/CampaignDetail.jsx
//
// Right-side slide-over for a single campaign:
//   - header (name, channel, status pill)
//   - lastError banner (paused-for-credits / failure reasons)
//   - segmented progress + per-status breakdown chips
//   - lifecycle actions (start / pause / resume / cancel) gated by status
//   - recipients table (name, phone, status, error/sentAt)
//
// It polls getOne() every 4s while the campaign is running or scheduled so the
// counters advance live as the backend runner sends. Polling stops on terminal
// states and on unmount.

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { X, Play, Pause, RotateCcw, Ban, MessageSquare, Zap, AlertTriangle } from "lucide-react";
import CampaignProgress from "./CampaignProgress.jsx";
import {
  campaignsAPI,
  CAMPAIGN_STATUS_META,
  RECIPIENT_STATUS_META,
  ALLOWED_ACTIONS,
} from "../../api/campaignsAPI.js";

const POLL_MS = 4000;
const LIVE_STATES = new Set(["running", "scheduled"]);

const ACTION_META = {
  start:  { label: "Start",  icon: Play,      cls: "bg-cyan-500 hover:bg-cyan-400 text-white" },
  resume: { label: "Resume", icon: RotateCcw, cls: "bg-cyan-500 hover:bg-cyan-400 text-white" },
  pause:  { label: "Pause",  icon: Pause,     cls: "bg-amber-500 hover:bg-amber-400 text-white" },
  cancel: { label: "Cancel", icon: Ban,       cls: "bg-transparent border border-red-500/40 text-red-400 hover:bg-red-500/10" },
};

export default function CampaignDetail({ campaignId, dark, onClose, onChanged }) {
  const [data, setData] = useState(null); // { campaign, breakdown, recipients }
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null); // which action is in flight
  const pollRef = useRef(null);

  const panel = dark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200";
  const title = dark ? "text-white" : "text-slate-900";
  const muted = dark ? "text-slate-400" : "text-slate-500";

  // ── Load / refresh ─────────────────────────────────────────────────────────
  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const d = await campaignsAPI.getOne(campaignId);
        setData(d);
      } catch {
        if (!silent) toast.error("Couldn't load this campaign.");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [campaignId]
  );

  useEffect(() => {
    load();
  }, [load]);

  // ── Poll while live ────────────────────────────────────────────────────────
  useEffect(() => {
    const status = data?.campaign?.status;
    if (status && LIVE_STATES.has(status)) {
      pollRef.current = setInterval(() => load(true), POLL_MS);
      return () => clearInterval(pollRef.current);
    }
    if (pollRef.current) clearInterval(pollRef.current);
  }, [data?.campaign?.status, load]);

  // ── Lifecycle actions ──────────────────────────────────────────────────────
  const runAction = async (action) => {
    if (action === "cancel" && !window.confirm("Cancel this campaign? Unsent recipients will not be messaged.")) {
      return;
    }
    setActing(action);
    try {
      await campaignsAPI[action](campaignId);
      toast.success(`Campaign ${action === "cancel" ? "canceled" : action + "ed"}`);
      await load(true);
      onChanged?.(); // let the list refresh its counters/status
    } catch (err) {
      // Illegal transition (race with the runner) → 400 with a clear message.
      const msg = err.response?.data?.message;
      toast.error(msg || `Couldn't ${action} the campaign.`);
      await load(true);
    } finally {
      setActing(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const campaign = data?.campaign;
  const meta = campaign ? CAMPAIGN_STATUS_META[campaign.status] || CAMPAIGN_STATUS_META.draft : null;
  const ChannelIcon = campaign?.channel === "WhatsApp" ? Zap : MessageSquare;
  const actions = campaign ? ALLOWED_ACTIONS[campaign.status] || [] : [];

  return (
    <div className="fixed inset-0 z-[140] flex justify-end bg-slate-950/70 backdrop-blur-sm" onClick={onClose}>
      <aside
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-lg h-full overflow-y-auto border-l ${panel} animate-in slide-in-from-right duration-200`}
      >
        {/* Header */}
        <div className={`sticky top-0 z-10 px-6 py-5 border-b flex items-start justify-between gap-4 ${dark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
          <div className="min-w-0">
            {loading ? (
              <div className={`h-6 w-40 rounded animate-pulse ${dark ? "bg-slate-800" : "bg-slate-200"}`} />
            ) : (
              <>
                <h2 className={`text-lg font-bold truncate ${title}`}>{campaign?.name}</h2>
                <div className={`flex items-center gap-3 mt-1 text-xs ${muted}`}>
                  <span className="inline-flex items-center gap-1.5">
                    <ChannelIcon size={13} />
                    {campaign?.channel}
                  </span>
                  {meta && (
                    <span className={`inline-flex items-center gap-1.5 font-bold ${meta.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                      {meta.label}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg flex-shrink-0 transition ${dark ? "text-slate-500 hover:text-slate-100 hover:bg-slate-800" : "text-slate-400 hover:text-slate-900 hover:bg-slate-100"}`}
          >
            <X size={18} />
          </button>
        </div>

        {loading || !campaign ? (
          <div className="p-6 space-y-4">
            <div className={`h-24 rounded-2xl animate-pulse ${dark ? "bg-slate-800" : "bg-slate-200"}`} />
            <div className={`h-40 rounded-2xl animate-pulse ${dark ? "bg-slate-800" : "bg-slate-200"}`} />
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* lastError banner */}
            {campaign.lastError && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl border border-amber-500/30 bg-amber-500/5">
                <AlertTriangle size={15} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-300 leading-relaxed">{campaign.lastError}</p>
              </div>
            )}

            {/* Progress */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className={`text-xs font-bold uppercase tracking-wider ${muted}`}>Progress</h3>
                <span className={`text-xs tabular-nums ${muted}`}>
                  {campaign.sentCount + campaign.failedCount + campaign.skippedCount} / {campaign.totalRecipients}
                </span>
              </div>
              <CampaignProgress
                total={campaign.totalRecipients}
                sent={campaign.sentCount}
                failed={campaign.failedCount}
                skipped={campaign.skippedCount}
                dark={dark}
              />
            </div>

            {/* Breakdown chips (per recipient status) */}
            {data.breakdown?.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {data.breakdown.map((b) => {
                  const m = RECIPIENT_STATUS_META[b.status] || { label: b.status, text: muted };
                  return (
                    <div
                      key={b.status}
                      className={`flex items-center justify-between px-3 py-2 rounded-xl border ${dark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50"}`}
                    >
                      <span className={`text-xs font-semibold ${m.text}`}>{m.label}</span>
                      <span className={`text-sm font-bold tabular-nums ${title}`}>{b.count}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Actions */}
            {actions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {actions.map((a) => {
                  const am = ACTION_META[a];
                  const Icon = am.icon;
                  return (
                    <button
                      key={a}
                      onClick={() => runAction(a)}
                      disabled={acting !== null}
                      className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-40 active:scale-95 ${am.cls}`}
                    >
                      <Icon size={15} />
                      {acting === a ? "…" : am.label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Recipients */}
            <div>
              <h3 className={`text-xs font-bold uppercase tracking-wider mb-3 ${muted}`}>
                Recipients {data.recipients?.length ? `(${data.recipients.length})` : ""}
              </h3>
              <div className={`rounded-xl border overflow-hidden ${dark ? "border-slate-800" : "border-slate-200"}`}>
                {data.recipients?.length ? (
                  data.recipients.map((r, i) => {
                    const m = RECIPIENT_STATUS_META[r.status] || { label: r.status, text: muted };
                    return (
                      <div
                        key={r.id}
                        className={`flex items-center justify-between gap-3 px-4 py-2.5 text-sm ${
                          i > 0 ? (dark ? "border-t border-slate-800" : "border-t border-slate-100") : ""
                        }`}
                      >
                        <div className="min-w-0">
                          <p className={`font-semibold truncate ${title}`}>{r.name || "—"}</p>
                          <p className={`text-xs tabular-nums ${muted}`}>{r.phone}</p>
                          {r.error && <p className="text-[11px] text-red-400 truncate">{r.error}</p>}
                        </div>
                        <span className={`text-xs font-bold flex-shrink-0 ${m.text}`}>{m.label}</span>
                      </div>
                    );
                  })
                ) : (
                  <p className={`px-4 py-6 text-center text-xs ${muted}`}>No recipient rows.</p>
                )}
              </div>
              {data.recipients?.length === 200 && (
                <p className={`mt-2 text-[11px] ${muted}`}>Showing the first 200 recipients.</p>
              )}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}