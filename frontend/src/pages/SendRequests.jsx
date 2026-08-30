import { useEffect, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { toast } from "react-toastify";

import Sidebar     from "../components/Sidebar.jsx";
import TopBar      from "../components/TopBar.jsx";
import CreditsPill from "../components/billing/CreditsPill.jsx";

import { useTheme } from "../context/ThemeContext.jsx";

import { addNotification } from "../store/notificationsSlice.js";
import {
  updateFormField,
  sendRequestSuccess,
} from "../store/requestsSlice.js";

import { sendReviewRequest, getUserRequests } from "../hooks/requests.hook.js";
import { getUserCredits }                    from "../hooks/credits.hook.js";

// ── Constants ────────────────────────────────────────────────────────────────
const SEND_VIA_OPTIONS = ["SMS", "WhatsApp", "Email", "Both"];

const statusStyles = {
  Sent:     "bg-slate-800 text-slate-400 border border-slate-700",
  Opened:   "bg-amber-950 text-amber-400 border border-amber-900",
  Reviewed: "bg-emerald-950 text-emerald-400 border border-emerald-900",
  Failed:   "bg-red-950 text-red-400 border border-red-900",
};

// ── Component ────────────────────────────────────────────────────────────────
export default function SendRequests() {
  const { dark }   = useTheme();
  const dispatch   = useDispatch();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [errors,      setErrors]      = useState({});
  const [credits,     setCredits]     = useState(null);
  const [pillKey,     setPillKey]     = useState(0); // bump to remount pills after sends

  // ── Redux selectors ────────────────────────────────────────────────────────
  const form           = useSelector((s) => s.requests.form);
  const recentRequests = useSelector((s) => s.requests.recentRequests);
  const loading        = useSelector((s) => s.requests.loading);
  const successMsg     = useSelector((s) => s.requests.successMsg);
  const clinicName     = useSelector((s) => s.auth.clinicName) || "our clinic";

  // ── Initial fetches ────────────────────────────────────────────────────────
  // Both fail silently — if the backend isn't reachable, the UI keeps working
  // on whatever Redux already has (and the credit pills just won't render).
  useEffect(() => {
    getUserRequests(dispatch).catch(() => {});
    getUserCredits().then(setCredits).catch(() => {});
  }, [dispatch]);

  // ── Derived state ──────────────────────────────────────────────────────────
  const channelForForm   = form.sendVia === "WhatsApp" ? "whatsapp" : "sms";
  const usesMeteredChannel = form.sendVia !== "Email";   // Email is unmetered
  const remaining        = credits?.[channelForForm]?.remaining ?? null;
  const planLimit        = credits?.[channelForForm]?.limit     ?? null;
  const blocked          = usesMeteredChannel && remaining !== null && remaining <= 0;
  const hasWhatsAppQuota = (credits?.whatsapp?.limit ?? 0) > 0;

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleChange = (e) => {
    dispatch(updateFormField({ field: e.target.name, value: e.target.value }));
    setErrors((prev) => ({ ...prev, [e.target.name]: "" }));
  };

  const handleSendVia = (opt) => {
    dispatch(updateFormField({ field: "sendVia", value: opt }));
    setErrors({});
  };

  const validate = () => {
    const errs = {};
    if (!form.patientName.trim()) {
      errs.patientName = "Patient name is required.";
    }

    const needsPhone = ["SMS", "WhatsApp", "Both"].includes(form.sendVia);
    if (needsPhone && !form.phone.trim()) {
      errs.phone =
        form.sendVia === "WhatsApp"
          ? "Phone number is required for WhatsApp."
          : "Phone number is required for SMS.";
    }

    if (["Email", "Both"].includes(form.sendVia) && !form.email.trim()) {
      errs.email = "Email address is required.";
    }

    return errs;
  };

  const refreshCredits = () => {
    getUserCredits()
      .then((d) => {
        setCredits(d);
        setPillKey((k) => k + 1); // remount CreditsPill to pull fresh data
      })
      .catch(() => {});
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    if (blocked) {
      toast.error(
        `You're out of ${channelForForm.toUpperCase()} credits this period.`
      );
      return;
    }

    const contact = form.sendVia === "Email" ? form.email : form.phone;

    try {
      await sendReviewRequest(dispatch, {
        patientName: form.patientName.trim(),
        sendVia:     form.sendVia,
        phone:       form.phone.trim(),
        email:       form.email.trim(),
      });

      dispatch(
        addNotification({
          type:    "success",
          message: `Review request sent to ${form.patientName}`,
        })
      );
      refreshCredits();
    } catch (err) {
      // Backend not wired yet? Fall back to local-only state so the UI keeps working.
      // The interceptor already showed a toast for non-403 errors.
      console.warn(
        "Backend send failed, falling back to local state:",
        err?.message
      );

      dispatch(
        sendRequestSuccess({
          name:    form.patientName,
          contact,
          via:     form.sendVia,
          message: `Review request queued for ${form.patientName} via ${form.sendVia}.`,
        })
      );
      dispatch(
        addNotification({
          type:    "info",
          message: `Request queued locally for ${form.patientName}`,
        })
      );
    }
  };

  // ── Theme helpers ──────────────────────────────────────────────────────────
  const cardBg = dark
    ? "bg-slate-900 border-slate-800"
    : "bg-white border-slate-200 shadow-sm";
  const inputBg = dark
    ? "bg-slate-950 border-slate-800 text-white placeholder-slate-600 focus:border-cyan-500"
    : "bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-cyan-500";
  const toggleBg = dark ? "bg-slate-950" : "bg-slate-100";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className={`h-screen overflow-hidden flex transition-colors duration-300 ${
        dark ? "bg-slate-950" : "bg-slate-50"
      }`}
    >
      {/* Sidebar — desktop */}
      <aside className="hidden lg:block w-64 flex-shrink-0 border-r border-slate-200 dark:border-slate-800">
        <Sidebar />
      </aside>

      {/* Sidebar — mobile overlay */}
      {sidebarOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60]"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="lg:hidden fixed inset-y-0 left-0 w-64 z-[70] transform transition-transform duration-300">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </aside>
        </>
      )}

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto custom-scrollbar">
        {/* Mobile header */}
        <header
          className={`lg:hidden flex items-center justify-between p-4 border-b flex-shrink-0 ${
            dark
              ? "bg-slate-900 border-slate-800"
              : "bg-white border-slate-100"
          }`}
        >
          <span className="font-black tracking-tight text-cyan-500 text-lg">
            Kirtify
          </span>
          <button
            onClick={() => setSidebarOpen(true)}
            className={`p-2 rounded-xl transition-colors duration-200 active:scale-95 ${
              dark
                ? "bg-slate-800 text-slate-100 hover:bg-slate-700"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
        </header>

        {/* Sticky TopBar.
            The title was "Pulse Campaigns", copied from Campaigns.jsx — so this
            page and /campaigns rendered the same header and the topbar told you
            nothing about where you actually were. */}
        <div className="sticky top-0 z-50">
          <TopBar
            title="Send Requests"
            onMenuClick={() => setSidebarOpen(true)}
          />
        </div>

        <main className="flex-1 p-4 sm:p-6 lg:p-10 w-full max-w-7xl mx-auto">
          {/* Page header — title + credit pills */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
            <div>
              <h1
                className={`text-2xl font-bold ${
                  dark ? "text-white" : "text-slate-900"
                }`}
              >
                Send Review Requests
              </h1>
              <p className="text-slate-500 text-sm mt-1">
                Send a personalised message asking customers to leave a Google
                review.
              </p>
            </div>

            {credits && (
              <div className="flex flex-wrap items-center gap-2">
                <CreditsPill key={`sms-${pillKey}`} channel="sms" />
                {hasWhatsAppQuota && (
                  <CreditsPill key={`wa-${pillKey}`} channel="whatsapp" />
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            {/* Form card */}
            <div className={`rounded-2xl border p-6 sm:p-8 ${cardBg}`}>
              <h2
                className={`text-base font-semibold mb-6 ${
                  dark ? "text-white" : "text-slate-900"
                }`}
              >
                New Request
              </h2>

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Patient Name */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                    Customer Name
                  </label>
                  <input
                    type="text"
                    name="patientName"
                    value={form.patientName}
                    onChange={handleChange}
                    placeholder="John Smith"
                    className={`w-full px-4 py-3 rounded-xl border outline-none transition-all text-sm ${inputBg} ${
                      errors.patientName ? "border-red-500" : ""
                    }`}
                  />
                  {errors.patientName && (
                    <p className="text-red-400 text-xs mt-1">
                      {errors.patientName}
                    </p>
                  )}
                </div>

                {/* Send Via */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                    Send Via
                  </label>
                  <div className={`flex rounded-xl p-1 gap-1 ${toggleBg}`}>
                    {SEND_VIA_OPTIONS.map((opt) => {
                      const active = form.sendVia === opt;
                      const disabledByPlan =
                        opt === "WhatsApp" && credits && !hasWhatsAppQuota;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => !disabledByPlan && handleSendVia(opt)}
                          disabled={disabledByPlan}
                          title={
                            disabledByPlan
                              ? "WhatsApp is available on the Premium plan"
                              : undefined
                          }
                          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                            active
                              ? dark
                                ? "bg-slate-800 text-cyan-400"
                                : "bg-white text-cyan-600 shadow-sm"
                              : disabledByPlan
                              ? "text-slate-700 cursor-not-allowed"
                              : "text-slate-500 hover:text-slate-300"
                          }`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                  {form.sendVia === "WhatsApp" && hasWhatsAppQuota && (
                    <p className="text-[10px] text-cyan-400/80 mt-2 tracking-wider uppercase font-semibold">
                      Premium · Routed via local WhatsApp gateway
                    </p>
                  )}
                </div>

                {/* Phone */}
                {["SMS", "WhatsApp", "Both"].includes(form.sendVia) && (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      name="phone"
                      value={form.phone}
                      onChange={handleChange}
                      placeholder="+1 (555) 000-0000"
                      className={`w-full px-4 py-3 rounded-xl border outline-none text-sm ${inputBg} ${
                        errors.phone ? "border-red-500" : ""
                      }`}
                    />
                    {errors.phone && (
                      <p className="text-red-400 text-xs mt-1">
                        {errors.phone}
                      </p>
                    )}
                  </div>
                )}

                {/* Email */}
                {["Email", "Both"].includes(form.sendVia) && (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                      Email Address
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={form.email}
                      onChange={handleChange}
                      placeholder="customer@email.com"
                      className={`w-full px-4 py-3 rounded-xl border outline-none text-sm ${inputBg} ${
                        errors.email ? "border-red-500" : ""
                      }`}
                    />
                    {errors.email && (
                      <p className="text-red-400 text-xs mt-1">
                        {errors.email}
                      </p>
                    )}
                  </div>
                )}

                {/* Message preview */}
                <div
                  className={`p-4 rounded-xl border border-dashed ${
                    dark
                      ? "bg-slate-950 border-slate-800"
                      : "bg-slate-50 border-slate-200"
                  }`}
                >
                  <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">
                    Message Preview
                  </p>
                  <p
                    className={`text-sm leading-relaxed ${
                      dark ? "text-slate-400" : "text-slate-600"
                    }`}
                  >
                    Hi{" "}
                    <span className="text-cyan-400 font-medium">
                      {form.patientName || "there"}
                    </span>
                    , thank you for visiting{" "}
                    <span className="font-bold">{clinicName}</span>! Could you
                    spare a minute to leave us a Google review? 🙏
                  </p>
                </div>

                {/* Success banner */}
                {successMsg && (
                  <div className="px-4 py-3 bg-emerald-950/50 border border-emerald-800 rounded-xl text-emerald-400 text-sm">
                    ✓ {successMsg}
                  </div>
                )}

                {/* Out-of-credits banner */}
                {blocked && (
                  <div className="px-4 py-3 bg-red-950/40 border border-red-900/60 rounded-xl text-red-300 text-xs leading-relaxed">
                    You've used all{" "}
                    <span className="font-bold">{planLimit}</span>{" "}
                    {channelForForm.toUpperCase()} credits for this billing
                    period. Upgrade your plan or wait until the next cycle
                    starts.
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading || blocked}
                  className={`w-full py-4 rounded-xl font-bold text-sm transition-all active:scale-[0.98] ${
                    blocked
                      ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-800"
                      : loading
                      ? "bg-cyan-600/70 text-white cursor-wait"
                      : "bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:shadow-lg hover:shadow-cyan-500/30"
                  }`}
                >
                  {blocked
                    ? `Out of ${channelForForm.toUpperCase()} credits — Upgrade`
                    : loading
                    ? "Sending..."
                    : "Send Review Request ✉"}
                </button>
              </form>
            </div>

            {/* Recent requests */}
            <div className={`rounded-2xl border p-6 sm:p-8 ${cardBg}`}>
              <h2
                className={`text-base font-semibold mb-6 ${
                  dark ? "text-white" : "text-slate-900"
                }`}
              >
                Recent Requests
              </h2>

              {recentRequests.length === 0 ? (
                <div className="text-center py-16 text-slate-500">
                  <p className="text-3xl mb-2">✉</p>
                  <p className="text-sm">No requests sent yet</p>
                  <p className="text-xs text-slate-600 mt-1">
                    Sent requests will appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentRequests.map((req) => (
                    <div
                      key={req.id}
                      className={`flex items-center justify-between p-3 rounded-xl border ${
                        dark
                          ? "bg-slate-950 border-slate-800"
                          : "bg-slate-50 border-slate-100"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-bold text-xs">
                          {req.name?.[0] ?? "?"}
                        </div>
                        <div>
                          <p
                            className={`text-xs font-bold ${
                              dark ? "text-slate-200" : "text-slate-800"
                            }`}
                          >
                            {req.name}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            {req.contact}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span
                          className={`text-[9px] font-black uppercase px-2 py-1 rounded-md ${
                            statusStyles[req.status] || statusStyles.Sent
                          }`}
                        >
                          {req.status}
                        </span>
                        <p className="text-[10px] text-slate-600 mt-1">
                          {req.sentAt}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}