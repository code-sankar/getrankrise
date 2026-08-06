// frontend/src/components/settings/DangerZone.jsx
//
// Data export and account deletion — the UI for GDPR Articles 20 and 17.
//
// ── The design rule this screen follows ────────────────────────────────────
// A destructive confirmation must NAME what it destroys. "Are you sure?" is a
// dialog people dismiss by reflex; "this permanently deletes 1,247 reviews, 3
// campaigns and 2 team accounts, and cancels your Premium subscription" is one
// they read. That is why the preview is fetched before the dialog opens rather
// than the copy being written generically.
//
// ── Export is offered FIRST, and deliberately ──────────────────────────────
// It sits above deletion, and the delete dialog links back to it. Someone who
// has decided to leave should not discover afterwards that their two years of
// review history went with them.
//
// ── Two different meanings of "delete my account" ──────────────────────────
// The server scopes deletion by clinic role and returns which scope applies.
// This component renders whichever one is true rather than assuming: an owner
// closing the clinic and a receptionist leaving a job are not the same action
// and must not read as though they are.

import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { accountAPI, messageFrom } from "../../api/accountAPI.js";

/** Plain-language labels for the preview counts, in the order they matter. */
const COUNT_LABELS = [
  ["reviews", "reviews"],
  ["reviewRequests", "review requests sent"],
  ["campaigns", "campaigns"],
  ["competitors", "tracked competitors"],
  ["connectedPlatforms", "connected platforms"],
  ["members", "team accounts (including yours)"],
];

export default function DangerZone({ dark }) {
  const [preview, setPreview] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [exporting, setExporting] = useState(false);

  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    let cancelled = false;
    accountAPI
      .deletionPreview()
      .then((d) => !cancelled && setPreview(d))
      .catch((err) => !cancelled && setLoadError(messageFrom(err, "Couldn't load account details.")));
    return () => {
      cancelled = true;
    };
  }, []);

  const isOwner = preview?.scope === "clinic";
  const expectedConfirm = isOwner ? preview?.clinicName ?? "" : "DELETE";

  const doExport = async () => {
    setExporting(true);
    try {
      const { filename } = await accountAPI.downloadExport();
      toast.success(`Downloaded ${filename}`);
    } catch (err) {
      toast.error(messageFrom(err, "Couldn't prepare your export. Please try again."));
    } finally {
      setExporting(false);
    }
  };

  const doDelete = async (e) => {
    e.preventDefault();
    setDeleteError("");
    setDeleting(true);
    try {
      const res = await accountAPI.deleteAccount({ password, confirm });
      // A hard navigation, not react-router: the account this session belongs
      // to no longer exists, so every slice, every cached response and the
      // token itself must go. A full reload is the only way to guarantee that.
      toast.success(res?.message || "Your account has been deleted.");
      localStorage.clear();
      window.location.href = "/";
    } catch (err) {
      // The server distinguishes a wrong password, a mistyped confirmation and
      // a failed billing cancellation, and writes a different sentence for
      // each. All three are actionable — show its words.
      setDeleteError(messageFrom(err, "Couldn't delete the account. Please try again."));
      setDeleting(false);
    }
  };

  const inputCls = dark
    ? "bg-slate-950 border-slate-800 text-white placeholder-slate-600"
    : "bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400";

  const counts = preview?.willDelete ?? {};
  const hasCounts = isOwner && COUNT_LABELS.some(([k]) => (counts[k] ?? 0) > 0);

  return (
    <div className="space-y-8">
      {/* ── Export ──────────────────────────────────────────────────────── */}
      <div>
        <h3 className={`text-sm font-bold mb-1 ${dark ? "text-white" : "text-slate-900"}`}>
          Export your data
        </h3>
        <p className="text-xs text-slate-500 mb-4 leading-relaxed max-w-prose">
          A complete copy of everything we hold for your clinic — reviews,
          replies, review requests, campaigns, competitors and team — as a
          single JSON file. Passwords and connected-account credentials are
          excluded.
        </p>
        {/* Owner-only server-side; staff simply never see the button rather
            than clicking it into a 403. */}
        {isOwner ? (
          <button
            type="button"
            onClick={doExport}
            disabled={exporting}
            className={`px-5 py-2.5 rounded-xl text-sm font-bold border transition-colors disabled:opacity-50 ${
              dark
                ? "border-slate-700 text-white hover:bg-slate-800"
                : "border-slate-300 text-slate-700 hover:bg-slate-100"
            }`}
          >
            {exporting ? "Preparing…" : "Download my data"}
          </button>
        ) : (
          <p className="text-xs text-slate-500">
            Only the clinic owner can export the clinic's data.
          </p>
        )}
      </div>

      {/* ── Delete ──────────────────────────────────────────────────────── */}
      <div
        className={`rounded-2xl border p-5 sm:p-6 ${
          dark ? "border-red-500/20 bg-red-500/[0.03]" : "border-red-200 bg-red-50/40"
        }`}
      >
        <h3 className="text-sm font-bold mb-1 text-red-500">
          {isOwner ? "Delete this clinic" : "Delete my account"}
        </h3>

        {loadError ? (
          <p className="text-xs text-slate-500">{loadError}</p>
        ) : !preview ? (
          <div className={`h-4 w-64 rounded animate-pulse ${dark ? "bg-slate-800" : "bg-slate-200"}`} />
        ) : (
          <>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed max-w-prose">
              {isOwner ? (
                <>
                  Permanently deletes <strong>{preview.clinicName}</strong> and
                  everything in it, for everyone. This cannot be undone — there
                  is no recovery window and no backup we can restore from.
                </>
              ) : (
                <>
                  Permanently deletes your own account and removes your access
                  to <strong>{preview.clinicName}</strong>. The clinic's data is
                  not affected.
                </>
              )}
            </p>

            {hasCounts && (
              <ul className="text-xs text-slate-500 mb-4 space-y-0.5">
                {COUNT_LABELS.filter(([k]) => (counts[k] ?? 0) > 0).map(([k, label]) => (
                  <li key={k}>
                    • <strong className={dark ? "text-slate-300" : "text-slate-700"}>
                      {counts[k].toLocaleString()}
                    </strong>{" "}
                    {label}
                  </li>
                ))}
              </ul>
            )}

            {/* Money is the part people most need warning about, so it gets its
                own line rather than being buried in the list above. */}
            {preview.subscription?.willCancelImmediately && (
              <p className="text-xs text-amber-500 mb-4 leading-relaxed max-w-prose">
                Your <strong>{preview.subscription.plan}</strong> subscription
                will be cancelled immediately as part of this. You won't be
                charged again, and the remainder of the current period is not
                refunded.
              </p>
            )}

            {!open ? (
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="px-5 py-2.5 rounded-xl text-sm font-bold bg-red-600 hover:bg-red-500 text-white transition-colors"
              >
                {isOwner ? "Delete clinic and all data" : "Delete my account"}
              </button>
            ) : (
              <form onSubmit={doDelete} className="space-y-4 max-w-md">
                {deleteError && (
                  <p className="text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    {deleteError}
                  </p>
                )}

                <div>
                  <label htmlFor="dz-password" className="block text-xs font-semibold mb-1 text-slate-400">
                    Your password
                  </label>
                  <input
                    id="dz-password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className={`w-full rounded-xl border px-4 py-2.5 text-sm outline-none focus:border-red-500 ${inputCls}`}
                  />
                </div>

                <div>
                  <label htmlFor="dz-confirm" className="block text-xs font-semibold mb-1 text-slate-400">
                    Type <span className="font-mono text-slate-300">{expectedConfirm}</span> to confirm
                  </label>
                  <input
                    id="dz-confirm"
                    type="text"
                    required
                    autoComplete="off"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder={expectedConfirm}
                    className={`w-full rounded-xl border px-4 py-2.5 text-sm outline-none focus:border-red-500 ${inputCls}`}
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={deleting || !password || !confirm}
                    className="px-5 py-2.5 rounded-xl text-sm font-bold bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deleting ? "Deleting…" : "Permanently delete"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      setPassword("");
                      setConfirm("");
                      setDeleteError("");
                    }}
                    disabled={deleting}
                    className={`px-5 py-2.5 rounded-xl text-sm font-bold border transition-colors disabled:opacity-50 ${
                      dark
                        ? "border-slate-700 text-slate-300 hover:bg-slate-800"
                        : "border-slate-300 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    Cancel
                  </button>
                </div>

                {isOwner && (
                  <p className="text-xs text-slate-500">
                    Want a copy first? Download your data using the button
                    above — it won't be available afterwards.
                  </p>
                )}
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
