import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { updateClinicName } from "../store/authSlice.js";
import axiosInstance from "../utils/axios.helper.js";
import { toast } from "react-toastify";
import { useTheme } from "../context/ThemeContext.jsx";
import logo from "../assets/logo.png";

const STEPS = [
  { id: "clinic",  label: "Clinic Details",     icon: "🏥" },
  { id: "google",  label: "Google Integration", icon: "🔗" },
  { id: "done",    label: "You're all set!",     icon: "🚀" },
];

export default function Onboarding() {
  const { dark } = useTheme();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const clinicName = useSelector((s) => s.auth.clinicName);

  const [step, setStep]     = useState(0);
  const [saving, setSaving] = useState(false);
  const [form, setForm]     = useState({
    clinicName:        clinicName || "",
    phone:             "",
    location:          "",
    googleBusinessUrl: "",
    googleReviewLink:  "",
  });

  const card = dark
    ? "bg-slate-900 border-slate-800"
    : "bg-white border-slate-200 shadow-sm";

  const input = dark
    ? "bg-slate-950 border-slate-800 text-white placeholder-slate-600 focus:border-indigo-500"
    : "bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-indigo-500";

  const handleChange = (e) =>
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  // ── Why a save failure must NOT advance the wizard ──────────────────────────
  // Both handlers below used to `catch {}` and call setStep() anyway, with the
  // comment "if clinic route isn't built yet, still let them proceed". That
  // route has been built for a long time, and the catch had become a way to
  // show "You're all set! 🚀" over a clinic row where nothing was written.
  //
  // It mattered most for googleReviewLink, because this wizard is the only
  // place a new clinic sets it and EVERY outbound message interpolates it:
  // request.controller.js renders `feedback: —` and campaignRunner.js
  // substitutes {{link}} with "". So a silently-dropped save meant every SMS
  // and email that clinic ever sent went out with no review link, and a credit
  // was spent on each one.
  //
  // The 400 was easy to trigger by following this page's own instructions:
  // it tells you to copy the "Get more reviews" short link, Google hands you
  // g.page/r/xyz, and Joi.string().uri() rejects it for having no scheme.
  // Hence normaliseUrl below — fix the input rather than punish the paste.

  /** Adds https:// when the user pasted a bare host (g.page/r/xyz). */
  const normaliseUrl = (value) => {
    const url = String(value || "").trim();
    if (!url) return "";
    return /^https?:\/\//i.test(url) ? url : `https://${url}`;
  };

  /** Turns the API's field-level validation errors into one readable line. */
  const describeFailure = (err, fallback) => {
    const fields = err?.response?.data?.errors;
    if (Array.isArray(fields) && fields.length > 0) {
      return fields.map((f) => f.message).join(" · ");
    }
    return err?.response?.data?.message || fallback;
  };

  const saveClinic = async () => {
    setSaving(true);
    try {
      await axiosInstance.put("/clinic/me", {
        clinicName: form.clinicName,
        phone:      form.phone,
        location:   form.location,
      });
      // Only after the write has actually landed — updating this on failure is
      // what made the sidebar show a clinic name that was never persisted.
      dispatch(updateClinicName(form.clinicName));
      toast.success("Clinic profile saved!");
      setStep(1);
    } catch (err) {
      toast.error(
        describeFailure(err, "Could not save your clinic details. Please try again.")
      );
      // Deliberately stay on this step. See the block comment above.
    } finally {
      setSaving(false);
    }
  };

  const saveGoogle = async () => {
    const googleBusinessUrl = normaliseUrl(form.googleBusinessUrl);
    const googleReviewLink  = normaliseUrl(form.googleReviewLink);

    setSaving(true);
    try {
      await axiosInstance.put("/clinic/me", {
        googleBusinessUrl,
        googleReviewLink,
      });
      // Reflect what the server accepted, so a corrected value is what the
      // field shows if the user steps back.
      setForm((p) => ({ ...p, googleBusinessUrl, googleReviewLink }));
      toast.success("Google links saved!");
      setStep(2);
    } catch (err) {
      toast.error(
        describeFailure(
          err,
          "Could not save your Google links. Check them and try again."
        )
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center p-4 transition-colors ${dark ? "bg-slate-950" : "bg-slate-50"}`}>

      {/* Logo */}
      <div className="flex items-center gap-3 mb-10">
        <img src={logo} alt="GetRankRise" className="w-9 h-9" />
        <span className={`text-xl font-black tracking-tight ${dark ? "text-white" : "text-slate-900"}`}>
          GetRankRise
        </span>
      </div>

      {/* Step progress */}
      <div className="flex items-center gap-3 mb-10">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all ${
              i === step
                ? "bg-indigo-600 text-white"
                : i < step
                  ? "bg-emerald-500/20 text-emerald-500"
                  : dark ? "bg-slate-800 text-slate-500" : "bg-slate-100 text-slate-400"
            }`}>
              <span>{s.icon}</span>
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-8 h-0.5 ${i < step ? "bg-emerald-500" : dark ? "bg-slate-800" : "bg-slate-200"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step 0 — Clinic Details */}
      {step === 0 && (
        <div className={`w-full max-w-lg border rounded-3xl p-8 ${card}`}>
          <h1 className={`text-2xl font-black mb-2 ${dark ? "text-white" : "text-slate-900"}`}>
            Tell us about your clinic
          </h1>
          <p className={`text-sm mb-8 ${dark ? "text-slate-400" : "text-slate-500"}`}>
            This info appears in your review request messages.
          </p>

          <div className="space-y-5">
            <Field label="Clinic Name" name="clinicName" value={form.clinicName} onChange={handleChange} placeholder="Bright Smile Dental" input={input} dark={dark} />
            <Field label="Phone Number" name="phone" value={form.phone} onChange={handleChange} placeholder="+1 (555) 000-0000" input={input} dark={dark} />
            <Field label="Location / City" name="location" value={form.location} onChange={handleChange} placeholder="Chicago, IL" input={input} dark={dark} />
          </div>

          <button
            onClick={saveClinic}
            disabled={!form.clinicName || saving}
            className="w-full mt-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded-2xl transition-all active:scale-95"
          >
            {saving ? "Saving…" : "Continue →"}
          </button>
        </div>
      )}

      {/* Step 1 — Google Integration */}
      {step === 1 && (
        <div className={`w-full max-w-lg border rounded-3xl p-8 ${card}`}>
          <h1 className={`text-2xl font-black mb-2 ${dark ? "text-white" : "text-slate-900"}`}>
            Connect Google Business
          </h1>
          <p className={`text-sm mb-2 ${dark ? "text-slate-400" : "text-slate-500"}`}>
            Paste your Google Business links so we can sync and track your reviews.
          </p>

          {/* How-to tip */}
          <div className={`p-4 rounded-2xl mb-8 text-xs leading-relaxed ${dark ? "bg-indigo-950/40 border border-indigo-900/50 text-indigo-300" : "bg-indigo-50 border border-indigo-100 text-indigo-800"}`}>
            <p className="font-bold mb-1">📍 How to find your links:</p>
            <p>1. Go to <strong>Google Business Profile</strong> → Info → View on Maps → copy URL</p>
            <p>2. For review link: Business Profile → Get more reviews → copy the short link</p>
          </div>

          <div className="space-y-5">
            <Field label="Google Business Profile URL" name="googleBusinessUrl" value={form.googleBusinessUrl} onChange={handleChange} placeholder="https://g.page/your-clinic" input={input} dark={dark} />
            <Field label="Direct Review Link" name="googleReviewLink" value={form.googleReviewLink} onChange={handleChange} placeholder="https://search.google.com/local/reviews?..." input={input} dark={dark} />
          </div>

          {/* Skipping is a legitimate choice, but it is not a free one: the
              review link is the payload of every request we send, so without
              it those messages go out with nowhere to click. Say so here
              rather than letting the user discover it from a patient. */}
          <p className={`mt-5 text-xs leading-relaxed ${dark ? "text-amber-400/80" : "text-amber-700"}`}>
            The review link is what we put in every review request. Skip it for
            now if you like — you can add it any time in Settings — but requests
            you send before then won&apos;t have a link for customers to follow.
          </p>

          <div className="flex gap-3 mt-8">
            <button
              onClick={() => setStep(2)}
              className={`flex-1 py-3.5 rounded-2xl font-bold text-sm border transition-all ${dark ? "border-slate-700 text-slate-400 hover:bg-slate-800" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}
            >
              Skip for now
            </button>
            <button
              onClick={saveGoogle}
              disabled={saving}
              className="flex-1 py-3.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded-2xl transition-all active:scale-95"
            >
              {saving ? "Saving…" : "Save & Continue →"}
            </button>
          </div>
        </div>
      )}

      {/* Step 2 — Done */}
      {step === 2 && (
        <div className={`w-full max-w-lg border rounded-3xl p-8 text-center ${card}`}>
          <div className="w-20 h-20 rounded-3xl bg-emerald-500/10 flex items-center justify-center text-4xl mx-auto mb-6">
            🚀
          </div>
          <h1 className={`text-2xl font-black mb-3 ${dark ? "text-white" : "text-slate-900"}`}>
            You're all set!
          </h1>
          <p className={`text-sm mb-8 leading-relaxed max-w-sm mx-auto ${dark ? "text-slate-400" : "text-slate-500"}`}>
            Your clinic is ready. Head to your dashboard to start collecting reviews and outranking competitors.
          </p>

          {/* Feature highlights */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            {[
              { icon: "⭐", label: "Collect Reviews" },
              { icon: "🤖", label: "AI Replies"      },
              { icon: "📊", label: "Analytics"       },
            ].map((f) => (
              <div key={f.label} className={`p-4 rounded-2xl ${dark ? "bg-slate-800" : "bg-slate-50"}`}>
                <div className="text-2xl mb-2">{f.icon}</div>
                <p className={`text-xs font-bold ${dark ? "text-slate-300" : "text-slate-700"}`}>{f.label}</p>
              </div>
            ))}
          </div>

          <button
            onClick={() => navigate("/dashboard")}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl transition-all active:scale-95 text-lg"
          >
            Go to Dashboard →
          </button>
        </div>
      )}
    </div>
  );
}

function Field({ label, name, value, onChange, placeholder, input, dark }) {
  return (
    <div>
      <label className={`block text-[10px] font-bold uppercase tracking-widest mb-2 ${dark ? "text-slate-500" : "text-slate-400"}`}>
        {label}
      </label>
      <input
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`w-full px-4 py-3 rounded-xl border text-sm outline-none transition-all ${input}`}
      />
    </div>
  );
}