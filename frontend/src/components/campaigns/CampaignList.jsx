// frontend/src/components/campaigns/CampaignList.jsx
//
// The list view: one card per campaign, each showing status, channel, the
// segmented progress bar, and a compact recipient count. Clicking a card
// opens the detail drawer (handled by the parent via onSelect).

import { MessageSquare, Zap, Calendar, ChevronRight } from "lucide-react";
import CampaignProgress from "./CampaignProgress.jsx";
import { CAMPAIGN_STATUS_META } from "../../api/campaignsAPI.js";

// ── Skeleton while the first fetch is in flight ──────────────────────────────
function ListSkeleton({ dark }) {
  const b = `rounded-2xl animate-pulse ${dark ? "bg-slate-800" : "bg-slate-200"}`;
  return (
    <div className="space-y-4">
      {Array(3)
        .fill(0)
        .map((_, i) => (
          <div key={i} className={`h-32 ${b}`} />
        ))}
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ dark, onCreate }) {
  return (
    <div
      className={`rounded-2xl border border-dashed p-12 text-center ${
        dark ? "border-slate-800 bg-slate-900/40" : "border-slate-200 bg-white"
      }`}
    >
      <div
        className={`mx-auto w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${
          dark ? "bg-cyan-500/10 text-cyan-400" : "bg-cyan-50 text-cyan-600"
        }`}
      >
        <Zap size={22} />
      </div>
      <h3 className={`text-base font-bold ${dark ? "text-white" : "text-slate-900"}`}>
        No campaigns yet
      </h3>
      <p className={`text-sm mt-1 mb-6 ${dark ? "text-slate-400" : "text-slate-500"}`}>
        Launch a Pulse Campaign to request reviews from a batch of customers over SMS or WhatsApp.
      </p>
      <button
        onClick={onCreate}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-cyan-500 hover:bg-cyan-400 text-white transition-colors active:scale-95"
      >
        Create your first campaign
      </button>
    </div>
  );
}

// ── One card ─────────────────────────────────────────────────────────────────
function CampaignCard({ campaign, dark, onSelect }) {
  const meta = CAMPAIGN_STATUS_META[campaign.status] || CAMPAIGN_STATUS_META.draft;
  const ChannelIcon = campaign.channel === "WhatsApp" ? Zap : MessageSquare;

  const card = dark ? "bg-slate-900 border-slate-800 hover:border-slate-700" : "bg-white border-slate-200 hover:border-slate-300 shadow-sm";
  const title = dark ? "text-white" : "text-slate-900";
  const muted = dark ? "text-slate-400" : "text-slate-500";

  const scheduledLabel =
    campaign.status === "scheduled" && campaign.scheduledAt
      ? new Date(campaign.scheduledAt).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;

  return (
    <button
      onClick={() => onSelect(campaign.id)}
      className={`w-full text-left rounded-2xl border p-5 transition-all ${card}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 mb-1">
            <h3 className={`text-base font-bold truncate ${title}`}>{campaign.name}</h3>
          </div>
          <div className={`flex items-center flex-wrap gap-x-3 gap-y-1 text-xs ${muted}`}>
            <span className="inline-flex items-center gap-1.5">
              <ChannelIcon size={13} />
              {campaign.channel}
            </span>
            <span className="tabular-nums">{campaign.totalRecipients} recipients</span>
            {scheduledLabel && (
              <span className="inline-flex items-center gap-1.5">
                <Calendar size={12} />
                {scheduledLabel}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${meta.ring} ${meta.text}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
            {meta.label}
          </span>
          <ChevronRight size={18} className={dark ? "text-slate-600" : "text-slate-400"} />
        </div>
      </div>

      <div className="mt-4">
        <CampaignProgress
          total={campaign.totalRecipients}
          sent={campaign.sentCount}
          failed={campaign.failedCount}
          skipped={campaign.skippedCount}
          dark={dark}
        />
      </div>
    </button>
  );
}

// ── List ─────────────────────────────────────────────────────────────────────
export default function CampaignList({ campaigns, loading, dark, onSelect, onCreate }) {
  if (loading) return <ListSkeleton dark={dark} />;
  if (!campaigns || campaigns.length === 0) return <EmptyState dark={dark} onCreate={onCreate} />;

  return (
    <div className="space-y-4">
      {campaigns.map((c) => (
        <CampaignCard key={c.id} campaign={c} dark={dark} onSelect={onSelect} />
      ))}
    </div>
  );
}