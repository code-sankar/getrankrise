import { useState } from "react";
import { useTheme } from "../../context/ThemeContext.jsx";

/**
 * AddCompetitorModal
 * Controlled modal for adding a tracked competitor. Submits { name, platform,
 * location, profileUrl, externalId } to the parent's onSubmit, which calls the
 * API and closes on success. Validation is intentionally light — the backend
 * Joi schema is the source of truth.
 */
const PLATFORMS = ["Google", "Yelp", "Facebook"];

export default function AddCompetitorModal({ open, onClose, onSubmit, submitting }) {
  const { dark } = useTheme();
  const [form, setForm] = useState({
    name:       "",
    platform:   "Google",
    location:   "",
    profileUrl: "",
    externalId: "",
  });

  if (!open) return null;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = () => {
    if (!form.name.trim() || form.name.trim().length < 2) return;
    onSubmit({
      name:       form.name.trim(),
      platform:   form.platform,
      location:   form.location.trim()   || undefined,
      profileUrl: form.profileUrl.trim() || undefined,
      externalId: form.externalId.trim() || undefined,
    });
  };

  const panel = dark
    ? "bg-slate-900 border-slate-800"
    : "bg-white border-slate-200";
  const label = dark ? "text-slate-700 dark:text-slate-300" : "text-slate-600 dark:text-slate-400";
  const input = dark
    ? "bg-slate-800 border-slate-700 text-white placeholder-slate-500 focus:border-cyan-500"
    : "bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-cyan-500";

  const nameValid = form.name.trim().length >= 2;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
        onClick={submitting ? undefined : onClose}
      />

      {/* Panel */}
      <div className={`relative w-full max-w-md rounded-2xl border shadow-2xl ${panel}`}>
        <div className={`flex items-center justify-between px-6 py-4 border-b ${dark ? "border-slate-800" : "border-slate-100"}`}>
          <h3 className={`font-bold text-base ${dark ? "text-white" : "text-slate-900"}`}>
            Track a competitor
          </h3>
          <button
            onClick={onClose}
            disabled={submitting}
            className={`p-1.5 rounded-lg transition-colors ${dark ? "hover:bg-slate-800 text-slate-600 dark:text-slate-400" : "hover:bg-slate-100 text-slate-600 dark:text-slate-400"} disabled:opacity-40`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Name */}
          <div>
            <label className={`block text-xs font-semibold mb-1.5 ${label}`}>
              Business name <span className="text-cyan-700 dark:text-cyan-400">*</span>
            </label>
            <input
              value={form.name}
              onChange={set("name")}
              placeholder="e.g. ClearView Dental"
              className={`w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition-colors ${input}`}
            />
          </div>

          {/* Platform */}
          <div>
            <label className={`block text-xs font-semibold mb-1.5 ${label}`}>Primary platform</label>
            <div className="grid grid-cols-3 gap-2">
              {PLATFORMS.map((p) => (
                <button
                  key={p}
                  onClick={() => setForm((f) => ({ ...f, platform: p }))}
                  className={`py-2 rounded-xl text-xs font-bold transition-all border ${
                    form.platform === p
                      ? "bg-cyan-700 hover:bg-cyan-600 border-cyan-500 text-white"
                      : dark
                        ? "bg-slate-800 border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-600"
                        : "bg-slate-50 border-slate-200 text-slate-600 dark:text-slate-400 hover:border-slate-300"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Location */}
          <div>
            <label className={`block text-xs font-semibold mb-1.5 ${label}`}>Location <span className="font-normal opacity-60">(optional)</span></label>
            <input
              value={form.location}
              onChange={set("location")}
              placeholder="e.g. Agartala, Tripura"
              className={`w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition-colors ${input}`}
            />
          </div>

          {/* Profile URL */}
          <div>
            <label className={`block text-xs font-semibold mb-1.5 ${label}`}>Profile URL <span className="font-normal opacity-60">(optional)</span></label>
            <input
              value={form.profileUrl}
              onChange={set("profileUrl")}
              placeholder="https://…"
              className={`w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition-colors ${input}`}
            />
          </div>

          <p className={`text-[11px] leading-relaxed text-slate-600 dark:text-slate-400`}>
            We'll pull this competitor's public rating, review volume, response
            rate and sentiment, then refresh on your plan's sync schedule.
          </p>
        </div>

        <div className={`flex gap-3 px-6 py-4 border-t ${dark ? "border-slate-800" : "border-slate-100"}`}>
          <button
            onClick={onClose}
            disabled={submitting}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-40 ${
              dark ? "bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-700" : "bg-slate-100 text-slate-600 dark:text-slate-400 hover:bg-slate-200"
            }`}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !nameValid}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-cyan-700 hover:bg-cyan-600 transition-colors disabled:opacity-40 disabled:hover:bg-cyan-600 flex items-center justify-center gap-2"
          >
            {submitting && (
              <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            )}
            {submitting ? "Adding…" : "Add competitor"}
          </button>
        </div>
      </div>
    </div>
  );
}