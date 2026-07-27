/**
 * campaignsAPI.js
 * Thin wrapper over the real /api/v1/campaigns endpoints (Pulse Campaigns).
 *
 * Uses axios.helper (baseURL /api/v1, auto JWT + token refresh, and the
 * centralised 403 UPGRADE_REQUIRED → upgrade-modal interceptor). Every backend
 * response is { success, message, data }, so each function unwraps `data.data`.
 *
 * Error handling is done at the call site. Note in particular:
 *   - create() may reject with 403 UPGRADE_REQUIRED (WhatsApp on Starter, or
 *     Free hitting the feature gate). The axios interceptor already opens the
 *     upgrade modal for that code, so callers should NOT toast on 403.
 *   - create() may reject with 400 EMPTY_IMPORT / TOO_MANY_RECIPIENTS; the
 *     response body carries { message, invalidSample }.
 *   - lifecycle calls resolve to the updated campaign, or reject 400 when the
 *     transition is illegal from the campaign's current state.
 */

import axiosInstance from "../utils/axios.helper.js";

// ── Status metadata (presentation lives with the frontend) ───────────────────
// Campaign statuses drive the runner backend-side; these are just labels+colors.
export const CAMPAIGN_STATUS_META = {
  draft:     { label: "Draft",     dot: "bg-slate-400",   text: "text-slate-400",   ring: "border-slate-500/30 bg-slate-500/5" },
  scheduled: { label: "Scheduled", dot: "bg-indigo-400",  text: "text-indigo-400",  ring: "border-indigo-500/30 bg-indigo-500/5" },
  running:   { label: "Running",   dot: "bg-cyan-400",    text: "text-cyan-400",    ring: "border-cyan-500/30 bg-cyan-500/5" },
  paused:    { label: "Paused",    dot: "bg-amber-400",   text: "text-amber-400",   ring: "border-amber-500/30 bg-amber-500/5" },
  completed: { label: "Completed", dot: "bg-emerald-400", text: "text-emerald-400", ring: "border-emerald-500/30 bg-emerald-500/5" },
  canceled:  { label: "Canceled",  dot: "bg-slate-500",   text: "text-slate-500",   ring: "border-slate-600/30 bg-slate-600/5" },
  failed:    { label: "Failed",    dot: "bg-red-400",     text: "text-red-400",     ring: "border-red-500/30 bg-red-500/5" },
};

// Recipient-level statuses shown in the detail breakdown.
export const RECIPIENT_STATUS_META = {
  pending:            { label: "Pending",     text: "text-slate-400",   bar: "bg-slate-500" },
  processing:         { label: "Sending",     text: "text-cyan-400",    bar: "bg-cyan-500" },
  sent:               { label: "Sent",        text: "text-emerald-400", bar: "bg-emerald-500" },
  failed:             { label: "Failed",      text: "text-red-400",     bar: "bg-red-500" },
  skipped_opt_out:    { label: "Opted out",   text: "text-amber-400",   bar: "bg-amber-500" },
  skipped_invalid:    { label: "Invalid",     text: "text-orange-400",  bar: "bg-orange-500" },
  skipped_no_credits: { label: "No credits",  text: "text-red-300",     bar: "bg-red-400" },
};

// Which lifecycle actions are legal from a given campaign status. Mirrors the
// guarded transitions in backend services/campaigns/campaign.service.js — the
// server is still the source of truth (it rejects illegal transitions with a
// 400), this just decides which buttons to render.
export const ALLOWED_ACTIONS = {
  draft:     ["start", "cancel"],
  scheduled: ["start", "cancel"],
  running:   ["pause", "cancel"],
  paused:    ["resume", "cancel"],
  completed: [],
  canceled:  [],
  failed:    ["cancel"],
};

export const campaignsAPI = {
  /** All campaigns for this clinic (newest first, max 50). → Campaign[] */
  list: async () => {
    const { data } = await axiosInstance.get("/campaigns");
    return data.data.campaigns;
  },

  /**
   * One campaign + recipient breakdown + recipient rows.
   * → { campaign, breakdown: [{status, count}], recipients: [...] }
   */
  getOne: async (id) => {
    const { data } = await axiosInstance.get(`/campaigns/${id}`);
    return data.data;
  },

  /**
   * Create a campaign from CSV text.
   * payload: { name, channel: "SMS"|"WhatsApp", messageTemplate, csvText,
   *            scheduledAt?: ISO string|null, throttlePerMinute?: number }
   * → { campaign, imported, suppressedAtImport, invalidCount, invalidSample,
   *     creditsEstimate, creditsRemaining, creditWarning }
   */
  create: async (payload) => {
    const { data } = await axiosInstance.post("/campaigns", payload);
    return data.data;
  },

  // ── Lifecycle — each resolves to the updated campaign ──────────────────────
  start:  async (id) => (await axiosInstance.post(`/campaigns/${id}/start`)).data.data,
  pause:  async (id) => (await axiosInstance.post(`/campaigns/${id}/pause`)).data.data,
  resume: async (id) => (await axiosInstance.post(`/campaigns/${id}/resume`)).data.data,
  cancel: async (id) => (await axiosInstance.post(`/campaigns/${id}/cancel`)).data.data,

  /** Manually suppress a phone number for this clinic. → { phone } */
  addOptOut: async (phone) => {
    const { data } = await axiosInstance.post("/campaigns/opt-outs", { phone });
    return data.data;
  },
};