// frontend/src/components/campaigns/CampaignWizard.jsx
//
// Create-campaign wizard (modal). Three steps:
//   1. Details   — name + channel (SMS / WhatsApp)
//   2. Message   — template with insertable {{name}} {{clinic}} {{link}}
//                  placeholders, live preview, 10–1000 char counter
//   3. Recipients — CSV paste or file upload, optional schedule + throttle,
//                  then a review panel with a credit heads-up before submit
//
// On submit the backend returns the precise { imported, invalidCount,
// creditsEstimate, creditsRemaining, creditWarning } — we surface those in the
// result toast. A 403 UPGRADE_REQUIRED (e.g. WhatsApp on Starter) is handled
// centrally by the axios interceptor (it opens the upgrade modal), so we simply
// close without toasting on that code.

import { useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { X, MessageSquare, Zap, Upload, Check } from "lucide-react";
import { campaignsAPI } from "../../api/campaignsAPI.js";

const PLACEHOLDERS = [
  { token: "{{name}}", desc: "Customer's name" },
  { token: "{{clinic}}", desc: "Your business name" },
  { token: "{{link}}", desc: "Your Google review link" },
];

const TABS = ["Details", "Message", "Recipients"];

// Naive client-side row estimate for a heads-up only — the server does the
// authoritative parse (dedupe, opt-out suppression, validation).
function estimateRows(csvText) {
  if (!csvText) return 0;
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return 0;
  const first = lines[0].toLowerCase();
  const looksLikeHeader = /(phone|mobile|name|email)/.test(first) && !/\d{7,}/.test(first);
  return looksLikeHeader ? lines.length - 1 : lines.length;
}

export default function CampaignWizard({ dark, credits, onClose, onCreated }) {
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [invalidSample, setInvalidSample] = useState([]);
  const templateRef = useRef(null);

  const [form, setForm] = useState({
    name: "",
    channel: "SMS",
    messageTemplate:
      "Hi {{name}}, thanks for visiting {{clinic}}! We'd love a quick review: {{link}}",
    csvText: "",
    scheduledAt: "",
    throttlePerMinute: 10,
  });

  // ── Theme tokens ───────────────────────────────────────────────────────────
  const panel = dark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200";
  const title = dark ? "text-white" : "text-slate-900";
  const muted = "text-slate-600 dark:text-slate-400";
  const inputBase = dark
    ? "bg-slate-950 border-slate-800 text-white placeholder-slate-600 focus:border-cyan-500"
    : "bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-cyan-500";

  const set = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
    setFormError(null);
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const channelKey = form.channel === "WhatsApp" ? "whatsapp" : "sms";
  const remaining = credits?.[channelKey]?.remaining ?? null;
  const rowEstimate = useMemo(() => estimateRows(form.csvText), [form.csvText]);
  const overCredits = remaining !== null && rowEstimate > remaining;

  const preview = form.messageTemplate
    .replaceAll("{{name}}", "Alex")
    .replaceAll("{{clinic}}", credits?.clinicName || "our clinic")
    .replaceAll("{{link}}", "g.page/r/review");

  // ── Placeholder insertion at cursor ────────────────────────────────────────
  const insertPlaceholder = (token) => {
    const el = templateRef.current;
    const cur = form.messageTemplate;
    if (!el) {
      set("messageTemplate", `${cur}${token}`);
      return;
    }
    const start = el.selectionStart ?? cur.length;
    const end = el.selectionEnd ?? cur.length;
    const next = cur.slice(0, start) + token + cur.slice(end);
    set("messageTemplate", next);
    // Restore focus + caret after the inserted token
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  // ── File upload → text ─────────────────────────────────────────────────────
  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => set("csvText", String(reader.result || ""));
    reader.onerror = () => toast.error("Couldn't read that file.");
    reader.readAsText(file);
    e.target.value = ""; // allow re-uploading the same file
  };

  // ── Per-step validation gate for the Next button ───────────────────────────
  const stepValid = () => {
    if (step === 0) return form.name.trim().length >= 2;
    if (step === 1) {
      const len = form.messageTemplate.trim().length;
      return len >= 10 && len <= 1000;
    }
    return form.csvText.trim().length >= 3;
  };

  const goNext = () => {
    if (!stepValid()) {
      setFormError(
        step === 0
          ? "Give your campaign a name (at least 2 characters)."
          : step === 1
          ? "Your message must be between 10 and 1000 characters."
          : "Add at least one recipient."
      );
      return;
    }
    setStep((s) => Math.min(s + 1, TABS.length - 1));
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setSubmitting(true);
    setFormError(null);
    setInvalidSample([]);

    const payload = {
      name: form.name.trim(),
      channel: form.channel,
      messageTemplate: form.messageTemplate.trim(),
      csvText: form.csvText,
      throttlePerMinute: Number(form.throttlePerMinute) || 10,
      scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null,
    };

    try {
      const result = await campaignsAPI.create(payload);

      // Compose a truthful result message from the server's numbers.
      let msg = `Campaign created — ${result.imported} recipient${result.imported === 1 ? "" : "s"} imported`;
      if (result.suppressedAtImport > 0) msg += `, ${result.suppressedAtImport} already opted out`;
      if (result.invalidCount > 0) msg += `, ${result.invalidCount} invalid skipped`;
      toast.success(msg);
      if (result.creditWarning) toast.warn(result.creditWarning);

      onCreated?.(result.campaign);
    } catch (err) {
      const status = err.response?.status;
      // 403 UPGRADE_REQUIRED already opened the upgrade modal via the axios
      // interceptor — close the wizard rather than stack a toast.
      if (status === 403) {
        onClose?.();
        return;
      }
      if (status === 400) {
        setFormError(err.response?.data?.message || "Some recipients couldn't be imported.");
        setInvalidSample(err.response?.data?.invalidSample || []);
        setStep(2); // send them back to the recipients step
      } else {
        toast.error("Could not create the campaign. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const charCount = form.messageTemplate.trim().length;

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl border ${panel}`}
      >
        {/* Header + stepper */}
        <div className={`sticky top-0 z-10 px-6 pt-6 pb-4 border-b ${dark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
          <div className="flex items-center justify-between">
            <h2 className={`text-lg font-bold ${title}`}>New Pulse Campaign</h2>
            <button
              onClick={onClose}
              className={`p-2 rounded-lg transition ${dark ? "text-slate-600 dark:text-slate-400 hover:text-slate-100 hover:bg-slate-800" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-100"}`}
            >
              <X size={18} />
            </button>
          </div>
          <div className="flex items-center gap-2 mt-4">
            {TABS.map((t, i) => (
              <div key={t} className="flex items-center gap-2 flex-1">
                <div
                  className={`flex items-center gap-2 text-xs font-bold ${
                    i === step ? "text-cyan-700 dark:text-cyan-400" : i < step ? (dark ? "text-slate-700 dark:text-slate-300" : "text-slate-600 dark:text-slate-400") : muted
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] border ${
                      i < step
                        ? "bg-cyan-700 hover:bg-cyan-600 border-cyan-500 text-white"
                        : i === step
                        ? "border-cyan-500 text-cyan-700 dark:text-cyan-400"
                        : dark
                        ? "border-slate-700 text-slate-600 dark:text-slate-400"
                        : "border-slate-300 text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    {i < step ? <Check size={11} /> : i + 1}
                  </span>
                  {t}
                </div>
                {i < TABS.length - 1 && (
                  <div className={`h-px flex-1 ${i < step ? "bg-cyan-500/50" : dark ? "bg-slate-800" : "bg-slate-200"}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-6 space-y-5">
          {/* ── Step 1: Details ─────────────────────────────────────────── */}
          {step === 0 && (
            <>
              <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${muted}`}>
                  Campaign name
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  maxLength={150}
                  placeholder="e.g. October check-out follow-ups"
                  className={`w-full px-4 py-3 rounded-xl border text-sm outline-none transition ${inputBase}`}
                />
              </div>

              <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${muted}`}>
                  Channel
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: "SMS", icon: MessageSquare, note: "Universal reach" },
                    { id: "WhatsApp", icon: Zap, note: "Premium plan" },
                  ].map(({ id, icon: Icon, note }) => {
                    const active = form.channel === id;
                    return (
                      <button
                        key={id}
                        onClick={() => set("channel", id)}
                        className={`flex flex-col items-start gap-1 p-4 rounded-xl border text-left transition ${
                          active
                            ? "border-cyan-500 bg-cyan-500/10"
                            : dark
                            ? "border-slate-800 hover:border-slate-700"
                            : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <span className={`inline-flex items-center gap-2 text-sm font-bold ${active ? "text-cyan-700 dark:text-cyan-400" : title}`}>
                          <Icon size={15} />
                          {id}
                        </span>
                        <span className={`text-[11px] ${muted}`}>{note}</span>
                      </button>
                    );
                  })}
                </div>
                {form.channel === "WhatsApp" && (credits?.whatsapp?.limit ?? 0) === 0 && (
                  <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-500">
                    Your plan doesn't include WhatsApp — creating this will prompt an upgrade.
                  </p>
                )}
              </div>
            </>
          )}

          {/* ── Step 2: Message ─────────────────────────────────────────── */}
          {step === 1 && (
            <>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className={`text-xs font-bold uppercase tracking-wider ${muted}`}>
                    Message template
                  </label>
                  <span className={`text-[11px] tabular-nums ${charCount > 1000 ? "text-red-600 dark:text-red-400" : muted}`}>
                    {charCount}/1000
                  </span>
                </div>
                <textarea
                  ref={templateRef}
                  value={form.messageTemplate}
                  onChange={(e) => set("messageTemplate", e.target.value)}
                  rows={4}
                  className={`w-full px-4 py-3 rounded-xl border text-sm outline-none transition resize-none ${inputBase}`}
                />
                <div className="flex flex-wrap gap-2 mt-3">
                  {PLACEHOLDERS.map((p) => (
                    <button
                      key={p.token}
                      onClick={() => insertPlaceholder(p.token)}
                      title={p.desc}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold border transition ${
                        dark
                          ? "border-slate-700 text-cyan-700 dark:text-cyan-400 hover:bg-slate-800"
                          : "border-slate-200 text-cyan-700 dark:text-cyan-400 hover:bg-slate-50"
                      }`}
                    >
                      + {p.token}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${muted}`}>
                  Preview
                </label>
                <div
                  className={`p-4 rounded-xl border text-sm leading-relaxed ${
                    dark ? "bg-slate-950 border-slate-800 text-slate-700 dark:text-slate-300" : "bg-slate-50 border-slate-200 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  {preview}
                </div>
              </div>
            </>
          )}

          {/* ── Step 3: Recipients ──────────────────────────────────────── */}
          {step === 2 && (
            <>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className={`text-xs font-bold uppercase tracking-wider ${muted}`}>
                    Recipients (CSV)
                  </label>
                  <label
                    className={`inline-flex items-center gap-1.5 text-[11px] font-bold cursor-pointer transition ${
                      dark ? "text-cyan-700 dark:text-cyan-400 hover:text-cyan-300" : "text-cyan-700 dark:text-cyan-400 hover:text-cyan-700"
                    }`}
                  >
                    <Upload size={12} />
                    Upload .csv
                    <input type="file" accept=".csv,.txt,text/csv" onChange={handleFile} className="hidden" />
                  </label>
                </div>
                <textarea
                  value={form.csvText}
                  onChange={(e) => set("csvText", e.target.value)}
                  rows={5}
                  placeholder={"name,phone\nAlex Doe,+15551234567\nPriya Nair,9876543210"}
                  className={`w-full px-4 py-3 rounded-xl border text-sm font-mono outline-none transition resize-none ${inputBase}`}
                />
                <p className={`mt-2 text-[11px] ${muted}`}>
                  A <code>name,phone</code> header is detected automatically. Bare 10-digit numbers use
                  your clinic's country code. Duplicates and opted-out numbers are removed server-side.
                </p>
                {rowEstimate > 0 && (
                  <p className={`mt-1 text-[11px] font-semibold ${overCredits ? "text-amber-700 dark:text-amber-500" : muted}`}>
                    ≈ {rowEstimate} recipient{rowEstimate === 1 ? "" : "s"} detected
                    {remaining !== null && ` · ${remaining} ${channelKey.toUpperCase()} credits left this period`}
                    {overCredits && " — the campaign will pause when credits run out."}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${muted}`}>
                    Schedule (optional)
                  </label>
                  <input
                    type="datetime-local"
                    value={form.scheduledAt}
                    onChange={(e) => set("scheduledAt", e.target.value)}
                    className={`w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition ${inputBase}`}
                  />
                  <p className={`mt-1 text-[10px] ${muted}`}>Leave empty to start manually.</p>
                </div>
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${muted}`}>
                    Throttle / min
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={form.throttlePerMinute}
                    onChange={(e) => set("throttlePerMinute", e.target.value)}
                    className={`w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition ${inputBase}`}
                  />
                  <p className={`mt-1 text-[10px] ${muted}`}>Messages sent per minute (1–60).</p>
                </div>
              </div>

              {invalidSample.length > 0 && (
                <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/5">
                  <p className="text-[11px] font-bold text-amber-700 dark:text-amber-500 mb-1">Sample of skipped rows:</p>
                  <ul className={`text-[11px] font-mono space-y-0.5 ${muted}`}>
                    {invalidSample.slice(0, 5).map((r, i) => (
                      <li key={i} className="truncate">
                        line {r.line}: {r.raw} — {r.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {formError && <p className="text-xs font-semibold text-red-600 dark:text-red-400">{formError}</p>}
        </div>

        {/* Footer */}
        <div className={`sticky bottom-0 px-6 py-4 border-t flex items-center justify-between ${dark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
          <button
            onClick={step === 0 ? onClose : () => setStep((s) => s - 1)}
            className={`px-4 py-2.5 rounded-xl text-sm font-bold transition ${
              dark ? "text-slate-600 dark:text-slate-400 hover:text-white hover:bg-slate-800" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            {step === 0 ? "Cancel" : "Back"}
          </button>

          {step < TABS.length - 1 ? (
            <button
              onClick={goNext}
              className="px-5 py-2.5 rounded-xl text-sm font-bold bg-cyan-700 hover:bg-cyan-600 text-white transition-colors active:scale-95"
            >
              Continue
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting || form.csvText.trim().length < 3}
              className="px-5 py-2.5 rounded-xl text-sm font-bold bg-cyan-700 hover:bg-cyan-600 disabled:opacity-40 text-white transition-colors active:scale-95"
            >
              {submitting ? "Creating…" : form.scheduledAt ? "Schedule campaign" : "Create campaign"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}