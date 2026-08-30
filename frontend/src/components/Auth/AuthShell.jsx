// frontend/src/components/Auth/AuthShell.jsx
//
// The dark glass card that Login and SignUp render inside. Extracted because
// four new full-page auth screens (forgot password, reset password, verify
// email, accept invitation) need exactly the same chrome, and copying ~40 lines
// of ambient-gradient markup five times is how a design drifts apart one
// screen at a time.
//
// Login.jsx and SignUp.jsx are deliberately NOT refactored onto this in the
// same change — they work, they are the highest-traffic routes in the product,
// and rewriting their markup to prove a point about reuse would risk the two
// screens that must never break for a cosmetic win. This is here for the new
// pages; those two can adopt it whenever they are next touched for a real
// reason.

import { Link } from "react-router-dom";
import Logo from "../Logo.jsx";

export default function AuthShell({ title, subtitle, children, footer, wide = false }) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#030712] text-white flex items-center justify-center p-4 sm:p-6 selection:bg-cyan-500/30">
      {/* Ambient light */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-cyan-600/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-cyan-600/10 blur-[120px] pointer-events-none" />

      {/* Background grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

      <div
        className={`relative w-full ${wide ? "max-w-lg" : "max-w-md"} bg-gradient-to-b from-[#0d121f]/80 to-[#06080d]/90 backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 sm:p-10 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)]`}
      >
        <div className="flex justify-center mb-8">
          <Link
            to="/"
            className="group flex items-center transition-transform duration-300 ease-out hover:scale-105"
          >
            <div className="relative p-2 rounded-xl bg-white/[0.02] border border-white/[0.05] shadow-inner group-hover:border-cyan-500/30 transition-colors duration-300">
              <Logo />
            </div>
          </Link>
        </div>

        <div className="space-y-1.5 text-center mb-6">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-slate-400 font-medium">{subtitle}</p>
          )}
        </div>

        {children}

        {footer && (
          <p className="text-center text-sm text-slate-400 mt-6">{footer}</p>
        )}
      </div>
    </div>
  );
}

/** Consistent inline banner for the states these pages spend most of their time in. */
export function AuthNotice({ tone = "error", children }) {
  const tones = {
    error: "bg-red-500/10 border-red-500/20 text-red-400",
    success: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
    info: "bg-cyan-500/10 border-cyan-500/20 text-cyan-300",
  };
  return (
    <div
      className={`flex items-start gap-2 border text-xs sm:text-sm py-3 px-4 rounded-xl mb-6 ${tones[tone] || tones.error}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current mt-1.5 shrink-0" />
      <p className="w-full font-medium">{children}</p>
    </div>
  );
}

/** The field styling Login/SignUp use, so the new screens match without copying. */
export const authInputClass =
  "w-full px-4 py-2.5 bg-[#0a0618]/90 border border-white/[0.08] rounded-xl text-white " +
  "placeholder-slate-600 focus:outline-none focus:border-cyan-500/80 focus:ring-4 " +
  "focus:ring-cyan-500/10 transition-all duration-200";

export const authButtonClass =
  "w-full mt-2 py-2.5 rounded-xl font-semibold text-white shadow-lg shadow-cyan-600/10 " +
  "active:scale-[0.98] transition-all duration-200 flex items-center justify-center " +
  "disabled:opacity-50 disabled:cursor-not-allowed border border-white/10 hover:brightness-110";
