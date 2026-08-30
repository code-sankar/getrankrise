// frontend/src/components/Admin/Profile/TabSecurity.jsx
//
// This tab used to be a mockup: two uncontrolled <InputField>s and an "Update
// Password" button with no onClick. PUT /auth/change-password has existed on
// the backend the whole time, and hooks/user.hook.js already wraps it as
// changeUserPassword() — nothing called it. This is that call.
//
// The Danger Zone's "Delete Admin Account" button is likewise gone rather than
// left inert: there is no account-deletion endpoint on the backend, and a
// destructive-looking button that silently does nothing is worse than an
// honest pointer at support.
import { useState } from "react";
import { toast } from "react-toastify";
import InputField from "../UI/InputField.jsx";
import { ShieldCheck, Trash2 } from "lucide-react";
import { changeUserPassword } from "../../../hooks/user.hook.js";

// Mirrors the backend's changePasswordSchema minimum so the user gets the
// rejection before spending a round trip on it.
const MIN_PASSWORD_LENGTH = 8;

export default function TabSecurity({ dark }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleUpdatePassword = async () => {
    if (submitting) return;

    if (!currentPassword || !newPassword) {
      toast.error("Please fill in both password fields.");
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      toast.error(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New password and confirmation do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      toast.error("New password must be different from the current one.");
      return;
    }

    setSubmitting(true);
    try {
      await changeUserPassword(currentPassword, newPassword);
      // Success toast is owned by the hook. Clear the fields so the new
      // password isn't left sitting in the DOM.
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      // changeUserPassword already surfaced the error.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div
        className={`p-8 rounded-3xl border ${dark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}
      >
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-500">
            <ShieldCheck size={24} />
          </div>
          <h3
            className={`text-lg font-bold ${dark ? "text-white" : "text-slate-900"}`}
          >
            Security Settings
          </h3>
        </div>

        <div className="space-y-6">
          <InputField
            label="Current Password"
            type="password"
            placeholder="••••••••"
            dark={dark}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            disabled={submitting}
          />
          <InputField
            label="New Password"
            type="password"
            placeholder="At least 8 characters"
            dark={dark}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            disabled={submitting}
          />
          <InputField
            label="Confirm New Password"
            type="password"
            placeholder="••••••••"
            dark={dark}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={submitting}
          />
          <button
            type="button"
            onClick={handleUpdatePassword}
            disabled={submitting}
            className="w-full py-3 rounded-xl bg-indigo-600 text-white font-semibold transition-opacity hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? "Updating…" : "Update Password"}
          </button>
        </div>
      </div>

      <div
        className={`p-6 rounded-3xl border border-red-200 bg-red-50/50 dark:bg-red-950/10 dark:border-red-900/30`}
      >
        <h4 className="text-red-600 font-bold mb-2 flex items-center">
          <Trash2 size={16} className="mr-2" /> Danger Zone
        </h4>
        <p className="text-sm text-red-500/80">
          Deleting your account permanently removes all clinic data, reviews and
          campaign history. To request deletion, contact{" "}
          <a
            href="mailto:support@kirtify.com?subject=Account%20deletion%20request"
            className="font-bold underline"
          >
            support@kirtify.com
          </a>
          .
        </p>
      </div>
    </div>
  );
}
