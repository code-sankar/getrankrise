// frontend/src/pages/AcceptInvite.jsx
//
// Lands from the invitation email: /accept-invite?token=…
//
// ── Two audiences, one page ─────────────────────────────────────────────────
// The invited address may already have a Kirtify account or may have none
// at all, and the page cannot know which until it asks. So it previews the
// invitation first (a public endpoint that returns the clinic name, the role,
// and `hasAccount`), then renders one of two forms:
//
//   hasAccount: false → name + password. Accepting IS the signup.
//   hasAccount: true  → a single confirm button. Asking an existing user to
//                       invent a password for the account they already have
//                       would be nonsense, and the server rejects it anyway.
//
// Either way acceptance ends with a session, so this page finishes by pushing
// the user straight into the dashboard rather than bouncing them to /login —
// they have just proved they hold the invited inbox.

import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useDispatch } from "react-redux";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import { loginSuccess } from "../store/authSlice.js";
import AuthShell, {
  AuthNotice,
  authInputClass,
  authButtonClass,
} from "../components/Auth/AuthShell.jsx";
import { accountAPI, messageFrom } from "../api/accountAPI.js";

export default function AcceptInvite() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const token = params.get("token") || "";

  const [invite, setInvite] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [loading, setLoading] = useState(Boolean(token));
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm();
  const password = watch("password");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    accountAPI
      .previewInvitation(token)
      .then((data) => {
        if (cancelled) return;
        setInvite(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(
          messageFrom(err, "This invitation is no longer valid."),
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const accept = async (form) => {
    setSubmitError("");
    setSubmitting(true);
    try {
      const data = await accountAPI.acceptInvitation({
        token,
        // Only sent on the create path — see the header.
        name: invite?.hasAccount ? undefined : form?.name,
        password: invite?.hasAccount ? undefined : form?.password,
      });

      // The response is the same shape login returns, so the existing reducer
      // handles it unchanged.
      dispatch(
        loginSuccess({ accessToken: data.accessToken, user: data.user }),
      );
      toast.success(`Welcome to ${data.user.clinicName}!`);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setSubmitError(
        messageFrom(err, "Couldn't accept that invitation. Please try again."),
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ── No token ───────────────────────────────────────────────────────────────
  if (!token) {
    return (
      <AuthShell title="Link incomplete" subtitle="This invitation link is missing its token.">
        <AuthNotice tone="error">
          Open the link straight from the invitation email, or ask whoever
          invited you to send a new one.
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

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <AuthShell title="Checking your invitation" subtitle="One moment…">
        <div className="flex justify-center py-6">
          <div className="w-10 h-10 rounded-full border-2 border-slate-700 border-t-cyan-500 animate-spin" />
        </div>
      </AuthShell>
    );
  }

  // ── Dead invitation ────────────────────────────────────────────────────────
  if (loadError || !invite) {
    return (
      <AuthShell title="Invitation not valid" subtitle="It may have been used, revoked, or expired.">
        <AuthNotice tone="error">{loadError || "This invitation is no longer valid."}</AuthNotice>
        <p className="text-xs text-slate-500 text-center leading-relaxed mb-6">
          Ask the clinic owner to send you a new invitation.
        </p>
        <Link
          to="/login"
          className={`${authButtonClass} bg-gradient-to-r from-cyan-500 to-blue-600`}
        >
          Go to sign in
        </Link>
      </AuthShell>
    );
  }

  const roleLabel = invite.role === "owner" ? "an owner" : "a team member";

  return (
    <AuthShell
      title={`Join ${invite.clinicName}`}
      subtitle={
        invite.invitedByName
          ? `${invite.invitedByName} invited you as ${roleLabel}.`
          : `You've been invited as ${roleLabel}.`
      }
    >
      {submitError && <AuthNotice tone="error">{submitError}</AuthNotice>}

      <AuthNotice tone="info">
        Accepting as <strong>{invite.email}</strong>.
        {invite.role === "owner"
          ? " You'll have full access, including billing."
          : " You'll be able to manage reviews, replies and campaigns — everything except billing."}
      </AuthNotice>

      <form onSubmit={handleSubmit(accept)} className="space-y-5" noValidate>
        {!invite.hasAccount && (
          <>
            <div className="space-y-1">
              <label htmlFor="ai-name" className="inline-block mb-1 pl-1 text-sm text-slate-300">
                Your name
              </label>
              <input
                id="ai-name"
                type="text"
                autoComplete="name"
                autoFocus
                placeholder="Jane Doe"
                className={authInputClass}
                {...register("name", {
                  required: "Your name is required",
                  minLength: { value: 2, message: "Name must be at least 2 characters" },
                  maxLength: { value: 100, message: "Name must be under 100 characters" },
                })}
              />
              {errors.name && (
                <p className="text-red-400 text-xs font-medium pt-1 px-1">⚠️ {errors.name.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <label htmlFor="ai-password" className="inline-block mb-1 pl-1 text-sm text-slate-300">
                Choose a password
              </label>
              <input
                id="ai-password"
                type="password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                className={authInputClass}
                {...register("password", {
                  required: "Choose a password",
                  minLength: { value: 8, message: "Password must be at least 8 characters" },
                  maxLength: { value: 128, message: "Password must be under 128 characters" },
                })}
              />
              {errors.password && (
                <p className="text-red-400 text-xs font-medium pt-1 px-1">⚠️ {errors.password.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <label htmlFor="ai-confirm" className="inline-block mb-1 pl-1 text-sm text-slate-300">
                Confirm password
              </label>
              <input
                id="ai-confirm"
                type="password"
                autoComplete="new-password"
                placeholder="Your password"
                className={authInputClass}
                {...register("confirmPassword", {
                  required: "Confirm your password",
                  validate: (v) => v === password || "Passwords don't match",
                })}
              />
              {errors.confirmPassword && (
                <p className="text-red-400 text-xs font-medium pt-1 px-1">
                  ⚠️ {errors.confirmPassword.message}
                </p>
              )}
            </div>
          </>
        )}

        {invite.hasAccount && (
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            You already have a Kirtify account for this address. Accepting
            adds {invite.clinicName} to it — you'll keep your existing password.
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className={`${authButtonClass} ${
            submitting
              ? "bg-cyan-950/60"
              : "bg-gradient-to-r from-cyan-500 to-blue-600"
          }`}
        >
          {submitting ? "Joining…" : `Join ${invite.clinicName}`}
        </button>
      </form>
    </AuthShell>
  );
}
