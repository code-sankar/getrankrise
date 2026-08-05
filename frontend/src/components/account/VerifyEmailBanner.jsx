// frontend/src/components/account/VerifyEmailBanner.jsx
//
// The nudge for an account that hasn't confirmed its email.
//
// ── Why it renders nothing rather than something reassuring ─────────────────
// A "your email is confirmed ✓" state would put a permanent, meaningless badge
// on every page for the overwhelming majority of users. This component's whole
// job is to be absent — it appears only while there is something to do, and
// disappears the moment there isn't.
//
// ── Why it does not block anything ──────────────────────────────────────────
// Verification gates SENDING, server-side (requireVerifiedEmail). It does not
// gate the app, and this banner deliberately has no dismiss-forever: a user who
// never confirms will hit a hard 403 the first time they try to send, and the
// banner is the thing that stops that from being a surprise.

import { useState } from "react";
import { useSelector } from "react-redux";
import { toast } from "react-toastify";
import { accountAPI, messageFrom } from "../../api/accountAPI.js";

export default function VerifyEmailBanner({ dark = true }) {
  const user = useSelector((s) => s.auth.user);
  const [sending, setSending] = useState(false);
  // Local dismissal only — it comes back on the next page load, on purpose.
  // Sending is blocked until this is done, so letting someone silence it
  // permanently would just move the confusion to the moment it costs them.
  const [hidden, setHidden] = useState(false);
  const [sent, setSent] = useState(false);

  // Three states, not two, and conflating them is what a test caught here:
  //
  //   undefined → NOT KNOWN YET. /auth/me hasn't answered, or a payload omitted
  //               the field. Render nothing — flashing "confirm your email" at
  //               an already-verified user on every cold load is worse than
  //               being a beat late to show it.
  //   null      → definitively unverified. This is the banner's whole reason
  //               to exist. Both auth reducers coalesce with `?? null`, so this
  //               is what a real unverified session actually looks like.
  //   a date    → verified.
  //
  // The previous expression collapsed undefined into "unverified", which is the
  // opposite of what the comment above it claimed.
  const known = user?.emailVerifiedAt !== undefined;
  const verified = Boolean(user?.emailVerifiedAt);

  if (!user || !known || verified || hidden) return null;

  const resend = async () => {
    setSending(true);
    try {
      const res = await accountAPI.resendVerification();
      setSent(true);
      toast.success(res?.message || `Confirmation link sent to ${user.email}.`);
    } catch (err) {
      toast.error(messageFrom(err, "Couldn't send that right now. Please try again."));
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      role="status"
      className={`flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 rounded-xl border mb-6 ${
        dark
          ? "bg-amber-500/10 border-amber-500/20 text-amber-200"
          : "bg-amber-50 border-amber-200 text-amber-900"
      }`}
    >
      <span className="text-lg leading-none shrink-0" aria-hidden="true">
        ✉️
      </span>
      <p className="text-sm flex-1 leading-relaxed">
        <strong>Confirm your email to start sending.</strong>{" "}
        {sent ? (
          <>We've sent a fresh link to {user.email}. Check your spam folder if it doesn't arrive.</>
        ) : (
          <>
            We sent a link to {user.email}. Review requests and campaigns stay
            locked until it's confirmed.
          </>
        )}
      </p>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={resend}
          disabled={sending}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 ${
            dark
              ? "bg-amber-400/20 hover:bg-amber-400/30 text-amber-100"
              : "bg-amber-200 hover:bg-amber-300 text-amber-900"
          }`}
        >
          {sending ? "Sending…" : sent ? "Send again" : "Resend link"}
        </button>
        <button
          type="button"
          onClick={() => setHidden(true)}
          aria-label="Hide until next page load"
          className="px-2 py-1.5 rounded-lg text-xs font-bold opacity-60 hover:opacity-100 transition-opacity"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
