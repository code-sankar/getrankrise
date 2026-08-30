// frontend/src/pages/ForgotPassword.jsx
//
// ── The one rule this screen must not break ─────────────────────────────────
// The confirmation is shown for EVERY submitted address, whether or not an
// account exists. The server already answers identically for that reason
// (account enumeration — see forgotPassword in auth.controller.js), and the UI
// has to hold the same line: an "no account with that email" message here
// would hand back exactly the signal the API withholds.
//
// So there is no error state for "unknown email", because there is no way to
// know. The only failures rendered are ones that are genuinely about the
// server: rate limiting, and email not being configured.

import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import AuthShell, {
  AuthNotice,
  authInputClass,
  authButtonClass,
} from "../components/Auth/AuthShell.jsx";
import { accountAPI, messageFrom } from "../api/accountAPI.js";

export default function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();

  const submit = async ({ email }) => {
    setError("");
    setLoading(true);
    try {
      await accountAPI.forgotPassword(email);
      setSentTo(email);
      setSent(true);
    } catch (err) {
      // Only reachable for a real server-side problem — a 429 from the rate
      // limiter or a 503 when SendGrid isn't configured. An unknown address
      // resolves successfully by design.
      setError(
        messageFrom(err, "Couldn't send that link right now. Please try again."),
      );
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthShell
        title="Check your inbox"
        subtitle="If we found an account, a reset link is on its way."
        footer={
          <>
            Remembered it?{" "}
            <Link to="/login" className="text-cyan-400 font-semibold hover:text-cyan-300">
              Back to sign in
            </Link>
          </>
        }
      >
        <AuthNotice tone="success">
          We've sent a password reset link to <strong>{sentTo}</strong> if an
          account exists for it. The link expires in 60 minutes and can only be
          used once.
        </AuthNotice>
        <p className="text-xs text-slate-500 text-center leading-relaxed">
          Nothing after a few minutes? Check your spam folder, and make sure you
          typed the address you signed up with.
        </p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="w-full mt-6 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-200 font-medium transition-colors"
        >
          Use a different email
        </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We'll email you a link to choose a new one."
      footer={
        <>
          Remembered it?{" "}
          <Link to="/login" className="text-cyan-400 font-semibold hover:text-cyan-300">
            Back to sign in
          </Link>
        </>
      }
    >
      {error && <AuthNotice tone="error">{error}</AuthNotice>}

      <form onSubmit={handleSubmit(submit)} className="space-y-5" noValidate>
        <div className="space-y-1">
          <label htmlFor="fp-email" className="inline-block mb-1 pl-1 text-sm text-slate-300">
            Email address
          </label>
          <input
            id="fp-email"
            type="email"
            autoComplete="email"
            autoFocus
            placeholder="name@example.com"
            className={authInputClass}
            {...register("email", {
              required: "Email is required",
              pattern: {
                value: /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,})+$/,
                message: "Enter a valid email address",
              },
            })}
          />
          {errors.email && (
            <p className="text-red-400 text-xs font-medium pt-1 px-1">
              ⚠️ {errors.email.message}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className={`${authButtonClass} ${
            loading
              ? "bg-cyan-950/60"
              : "bg-gradient-to-r from-cyan-500 to-blue-600"
          }`}
        >
          {loading ? "Sending…" : "Email me a reset link"}
        </button>
      </form>
    </AuthShell>
  );
}
