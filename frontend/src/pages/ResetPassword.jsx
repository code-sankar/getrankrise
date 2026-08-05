// frontend/src/pages/ResetPassword.jsx
//
// Lands from the emailed link: /reset-password?token=…
//
// ── Why this does not sign the user in ──────────────────────────────────────
// The server deliberately issues no session here (see resetPassword in
// auth.controller.js): the person holding this link proved only that they can
// read an inbox. Making them sign in with the password they just chose is one
// extra step that proves they also hold THAT — and it is the step that makes a
// forwarded or shoulder-surfed link substantially less useful.
//
// So a success here navigates to /login, not to /dashboard.

import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import AuthShell, {
  AuthNotice,
  authInputClass,
  authButtonClass,
} from "../components/Auth/AuthShell.jsx";
import { accountAPI, messageFrom } from "../api/accountAPI.js";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") || "";

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm();
  const newPassword = watch("newPassword");

  // No token in the URL at all — someone typed the path, or a mail client
  // mangled the link. Say which, rather than showing a form that cannot work.
  if (!token) {
    return (
      <AuthShell title="Link incomplete" subtitle="This reset link is missing its token.">
        <AuthNotice tone="error">
          Open the link straight from the email, or request a new one.
        </AuthNotice>
        <Link
          to="/forgot-password"
          className={`${authButtonClass} bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500`}
        >
          Request a new link
        </Link>
      </AuthShell>
    );
  }

  const submit = async ({ newPassword: pwd }) => {
    setError("");
    setLoading(true);
    try {
      const res = await accountAPI.resetPassword({ token, newPassword: pwd });
      const ended = res?.data?.sessionsEnded ?? 0;
      toast.success(
        ended > 0
          ? `Password updated. ${ended} other ${ended === 1 ? "session was" : "sessions were"} signed out.`
          : "Password updated. Please sign in.",
      );
      navigate("/login", { replace: true });
    } catch (err) {
      // The server distinguishes used / expired / invalid and writes a
      // different sentence for each; all three are actionable, so show its
      // words rather than flattening them into "something went wrong".
      setError(messageFrom(err, "That reset link isn't valid. Request a new one."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Then sign in with it."
      footer={
        <>
          Need a new link?{" "}
          <Link to="/forgot-password" className="text-blue-400 font-semibold hover:text-blue-300">
            Start over
          </Link>
        </>
      }
    >
      {error && <AuthNotice tone="error">{error}</AuthNotice>}

      <form onSubmit={handleSubmit(submit)} className="space-y-5" noValidate>
        <div className="space-y-1">
          <label htmlFor="rp-new" className="inline-block mb-1 pl-1 text-sm text-slate-300">
            New password
          </label>
          <input
            id="rp-new"
            type="password"
            autoComplete="new-password"
            autoFocus
            placeholder="At least 8 characters"
            className={authInputClass}
            {...register("newPassword", {
              required: "Choose a password",
              // Matches the server's Joi rule exactly. A client rule that is
              // looser than the server's turns into a confusing round trip; one
              // that is stricter silently rejects passwords the server accepts.
              minLength: { value: 8, message: "Password must be at least 8 characters" },
              maxLength: { value: 128, message: "Password must be under 128 characters" },
            })}
          />
          {errors.newPassword && (
            <p className="text-red-400 text-xs font-medium pt-1 px-1">
              ⚠️ {errors.newPassword.message}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="rp-confirm" className="inline-block mb-1 pl-1 text-sm text-slate-300">
            Confirm new password
          </label>
          <input
            id="rp-confirm"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            className={authInputClass}
            {...register("confirmPassword", {
              required: "Confirm your password",
              validate: (v) => v === newPassword || "Passwords don't match",
            })}
          />
          {errors.confirmPassword && (
            <p className="text-red-400 text-xs font-medium pt-1 px-1">
              ⚠️ {errors.confirmPassword.message}
            </p>
          )}
        </div>

        <p className="text-xs text-slate-500 leading-relaxed">
          Setting a new password signs you out everywhere else, on every device.
        </p>

        <button
          type="submit"
          disabled={loading}
          className={`${authButtonClass} ${
            loading
              ? "bg-blue-950/60"
              : "bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500"
          }`}
        >
          {loading ? "Updating…" : "Update password"}
        </button>
      </form>
    </AuthShell>
  );
}
