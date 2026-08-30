// frontend/src/pages/VerifyEmail.jsx
//
// Lands from the confirmation link: /verify-email?token=…
//
// ── Why the effect guards against running twice ─────────────────────────────
// React StrictMode double-invokes effects in development. The token is
// single-use, so a naive fetch-on-mount would spend it on the first invocation
// and render "already used" from the second — the flow would look broken on
// every developer's machine while working fine in production. The ref below is
// what makes the two behave the same.
//
// (The server also treats an already-consumed verification token as SUCCESS,
// because mail clients prefetch links and people click twice. Both guards
// matter: this one keeps development honest, that one keeps production kind.)

import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AuthShell, { AuthNotice, authButtonClass } from "../components/Auth/AuthShell.jsx";
import { accountAPI, messageFrom } from "../api/accountAPI.js";

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";

  const [state, setState] = useState(token ? "checking" : "missing");
  const [message, setMessage] = useState("");
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;

    accountAPI
      .verifyEmail(token)
      .then((data) => {
        setState("done");
        setMessage(
          data?.alreadyVerified
            ? "This address was already confirmed — nothing more to do."
            : "Your email address is confirmed. You can now send review requests.",
        );
      })
      .catch((err) => {
        setState("failed");
        setMessage(
          messageFrom(err, "That confirmation link isn't valid any more."),
        );
      });
  }, [token]);

  if (state === "missing") {
    return (
      <AuthShell title="Link incomplete" subtitle="This confirmation link is missing its token.">
        <AuthNotice tone="error">
          Open the link straight from the email. If it keeps failing, sign in and
          request a new one from Settings → Account.
        </AuthNotice>
        <Link
          to="/login"
          className={`${authButtonClass} bg-gradient-to-r from-cyan-500 to-blue-600`}
        >
          Go to sign in
        </Link>
      </AuthShell>
    );
  }

  if (state === "checking") {
    return (
      <AuthShell title="Confirming your email" subtitle="One moment…">
        <div className="flex justify-center py-6">
          <div className="w-10 h-10 rounded-full border-2 border-slate-700 border-t-cyan-500 animate-spin" />
        </div>
      </AuthShell>
    );
  }

  const ok = state === "done";

  return (
    <AuthShell
      title={ok ? "Email confirmed" : "Link no longer valid"}
      subtitle={ok ? "Thanks — that's the last of the setup." : undefined}
    >
      <AuthNotice tone={ok ? "success" : "error"}>{message}</AuthNotice>

      {!ok && (
        <p className="text-xs text-slate-500 text-center leading-relaxed mb-6">
          Confirmation links expire after a few days and can only be used once.
          Sign in and request a fresh one from Settings → Account.
        </p>
      )}

      <Link
        to="/login"
        className={`${authButtonClass} bg-gradient-to-r from-cyan-500 to-blue-600`}
      >
        {ok ? "Continue to sign in" : "Go to sign in"}
      </Link>
    </AuthShell>
  );
}
