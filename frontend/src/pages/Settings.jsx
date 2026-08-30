import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Sidebar from "../components/Sidebar.jsx";
import TopBar from "../components/TopBar.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { useDispatch, useSelector } from "react-redux";
import { updateClinicName } from "../store/authSlice.js";
import {
  getUserClinic,
  updateUserClinic,
  getUserSettings,
  updateUserSettings,
  changeUserPassword,
  logoutUser,
} from "../hooks/user.hook.js";
import { toast } from "react-toastify";

// ── Platform connect cards (own their card styling + connect/disconnect flow) ─
import GoogleConnect   from "../components/onboarding/GoogleConnect.jsx";
import YelpConnect     from "../components/onboarding/YelpConnect.jsx";
import FacebookConnect from "../components/onboarding/FacebookConnect.jsx";

// ── Real Paddle overlay checkout (already used by the upgrade modal) ──────────
import UpgradeButton from "../components/billing/UpgradeButton.jsx";
// ── Step 2: team management, usage meters, verification nudge ────────────────
import TeamTab from "../components/settings/TeamTab.jsx";
import DangerZone from "../components/settings/DangerZone.jsx";
import UsageMeters from "../components/settings/UsageMeters.jsx";
import VerifyEmailBanner from "../components/account/VerifyEmailBanner.jsx";
// ── Paddle-hosted customer portal (update payment / cancel) ───────────────────
import ManageBillingButton from "../components/billing/ManageBillingButton.jsx";

// ── Defaults — used until /clinic/me hydrates the form ─────────────────────────
const defaultClinic = {
  clinicName:        "",
  ownerName:         "",
  alertEmail:        "",
  phone:             "",
  location:          "",
  googleBusinessUrl: "",
  googleReviewLink:  "",
};

const defaultNotifications = {
  urgentAlerts:   true,
  newReviewAlert: true,
  weeklyReport:   false,
  monthlyReport:  true,
};

// ── Plan catalogue — matches the Kirtify spec (Free / Starter / Premium) ─
const PLANS = [
  { id: "free",     name: "Free",     price: "$0",  features: ["20 stored reviews", "View-only mode", "Basic analytics"] },
  { id: "starter",  name: "Starter",  price: "$49", features: ["Full AI engine", "24h sync", "3 competitors", "50 SMS / mo"] },
  { id: "premium",  name: "Premium",  price: "$99", features: ["Hourly sync", "10 competitors", "500 SMS + 500 WhatsApp / mo"] },
];

// Upgrades only ever go up the ladder. Downgrades/cancellation route through
// the Paddle customer portal (not wired yet), so we never render a checkout
// button for a lower tier.
const PLAN_RANK = { free: 0, starter: 1, premium: 2 };

// A returning OAuth callback lands on /settings?google=connected (etc.). If any
// of these params are present, open the Integrations tab so the child connect
// card can pick the param up and show its picker.
const OAUTH_RETURN_PARAMS = ["google", "facebook", "yelp"];

// ── Reusable UI ──────────────────────────────────────────────────────────────
function SectionHeader({ title, description, dark }) {
  return (
    <div className="mb-6">
      <h2 className={`text-base font-semibold ${dark ? "text-white" : "text-slate-900"}`}>{title}</h2>
      <p className="text-slate-500 text-sm mt-0.5">{description}</p>
    </div>
  );
}

function InputField({ label, name, type = "text", value, onChange, placeholder, hint, dark, disabled }) {
  return (
    <div className="w-full">
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">{label}</label>
      <input
        type={type}
        name={name}
        value={value ?? ""}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full px-4 py-3 border rounded-xl text-sm transition-colors outline-none focus:border-blue-500 disabled:opacity-60 ${
          dark
            ? "bg-slate-950 border-slate-800 text-slate-100 placeholder-slate-600"
            : "bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400"
        }`}
      />
      {hint && <p className="text-slate-500 text-xs mt-1">{hint}</p>}
    </div>
  );
}

function Toggle({ label, description, enabled, onToggle, dark }) {
  return (
    <div className={`flex items-center justify-between gap-4 py-4 border-b last:border-0 ${dark ? "border-slate-800" : "border-slate-100"}`}>
      <div>
        <p className={`text-sm font-medium ${dark ? "text-slate-200" : "text-slate-800"}`}>{label}</p>
        <p className="text-slate-500 text-xs mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 ${enabled ? "bg-blue-600" : dark ? "bg-slate-700" : "bg-slate-300"}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${enabled ? "translate-x-5" : "translate-x-0"}`} />
      </button>
    </div>
  );
}

export default function Settings() {
  const { dark } = useTheme();
  const dispatch = useDispatch();
  const [searchParams] = useSearchParams();

  // ── Redux selectors ──────────────────────────────────────────────────────
  const authUser     = useSelector((s) => s.auth.user);
  const userClinic   = useSelector((s) => s.user.userClinic);
  const userSettings = useSelector((s) => s.user.userSettings);
  const userSub      = useSelector((s) => s.user.userSubscription);

  // ── Local form state ─────────────────────────────────────────────────────
  // Only the user's UNSAVED EDITS live in state; the displayed values are
  // derived at render time from Redux underneath them.
  //
  // The previous shape kept a full copy of the server data in local state and
  // pushed Redux into it from two effects. That is the cascading render
  // react-hooks/set-state-in-effect flags — Redux updates, effect fires,
  // setState, render again — and it had a real symptom beyond the extra pass:
  // every Redux refresh of userClinic silently overwrote whatever the user was
  // part-way through typing, because the effect merged server values ON TOP of
  // the edits. Deriving instead means server data can refresh underneath an
  // in-progress edit without ever clobbering it.
  const [settingsEdits,      setSettingsEdits]      = useState({});
  const [notificationsEdits, setNotificationsEdits] = useState({});
  const settings      = { ...defaultClinic,       ...userClinic,   ...settingsEdits };
  const notifications = { ...defaultNotifications, ...userSettings, ...notificationsEdits };

  const [pwd,           setPwd]           = useState({ current: "", next: "", confirm: "" });
  const [sidebarOpen,   setSidebarOpen]   = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [savingPwd,     setSavingPwd]     = useState(false);
  const [savedMsg,      setSavedMsg]      = useState("");
  const [activeTab,     setActiveTab]     = useState(() =>
    OAUTH_RETURN_PARAMS.some((k) => searchParams.has(k)) ? "integrations" : "clinic"
  );

  // ── Load clinic + notification settings on mount ─────────────────────────
  useEffect(() => {
    getUserClinic(dispatch).catch(() => {});
    getUserSettings(dispatch).catch(() => {});
  }, [dispatch]);

  // (The two "hydrate local form when Redux updates" effects that used to sit
  // here are gone — that hydration is the derivation above.)

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleSettingsChange = (e) => {
    const { name, value } = e.target;
    setSettingsEdits((prev) => ({ ...prev, [name]: value }));
    setSavedMsg("");
  };

  const handleToggle = (key) => {
    // Reads through the derived value, so a toggle the server already knows
    // about flips from its stored state rather than from a stale local copy.
    setNotificationsEdits((prev) => ({ ...prev, [key]: !notifications[key] }));
    setSavedMsg("");
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (activeTab === "clinic" || activeTab === "account") {
        await updateUserClinic(dispatch, settings);
        if (settings.clinicName) {
          dispatch(updateClinicName(settings.clinicName));
        }
        // The edits are now in Redux, so drop the local overlay and let the
        // form read straight through to the saved values. Without this the
        // stale overlay would keep winning over any later server refresh.
        setSettingsEdits({});
      }
      if (activeTab === "notifications") {
        await updateUserSettings(dispatch, notifications);
        setNotificationsEdits({});
      }
      setSavedMsg("Settings saved successfully!");
    } catch (err) {
      // Hook already toasted
      console.error("Save settings failed:", err?.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!pwd.current || !pwd.next) {
      toast.error("Please fill in both password fields.");
      return;
    }
    if (pwd.next !== pwd.confirm) {
      toast.error("New password and confirmation do not match.");
      return;
    }
    setSavingPwd(true);
    try {
      await changeUserPassword(pwd.current, pwd.next);
      setPwd({ current: "", next: "", confirm: "" });
    } catch (err) {
      // Hook already toasted
      console.error("Password change failed:", err?.message);
    } finally {
      setSavingPwd(false);
    }
  };

  const handleLogout = async () => {
    if (!confirm("Are you sure you want to sign out?")) return;
    await logoutUser(dispatch);
    window.location.href = "/login";
  };

  // Each connect card manages its own connected/disconnected state internally,
  // so there is nothing to persist here. Kept as a named hook point so we can
  // later refresh reviews/analytics the moment a new platform is linked.
  const handlePlatformConnected = () => {};

  const TABS = [
    { id: "clinic",        label: "Business Profile" },
    { id: "integrations",  label: "Integrations" },
    { id: "notifications", label: "Notifications" },
    { id: "account",       label: "Account" },
    // Visible to staff as well as owners: the screen itself hides the
    // owner-only controls, and hiding the whole tab would make the app look
    // broken to the receptionist it was built for.
    { id: "team",          label: "Team" },
    { id: "billing",       label: "Plan & Billing" },
  ];

  const cardBg = dark
    ? "bg-slate-900 border-slate-800"
    : "bg-white border-slate-200 shadow-sm";

  // Current plan (defaults to "free" if no subscription loaded)
  const currentPlanId = userSub?.plan || "free";
  const currentPlan   = PLANS.find((p) => p.id === currentPlanId) || PLANS[0];
  const currentRank   = PLAN_RANK[currentPlanId] ?? 0;
  // The single next tier up, used for the "Current Plan" card's primary CTA.
  const nextUpgrade   = currentRank < PLAN_RANK.premium
    ? (currentPlanId === "free" ? "starter" : "premium")
    : null;

  return (
    <div className={`h-screen overflow-hidden flex transition-colors duration-300 ${dark ? "bg-slate-950" : "bg-slate-50"}`}>
      <aside className="hidden lg:block w-64 flex-shrink-0 border-r border-slate-200 dark:border-slate-800">
        <Sidebar />
      </aside>

      {sidebarOpen && (
        <>
          <div className="lg:hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60]" onClick={() => setSidebarOpen(false)} />
          <aside className="lg:hidden fixed inset-y-0 left-0 w-64 z-[70]">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </aside>
        </>
      )}

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto custom-scrollbar">
        <header className={`lg:hidden flex items-center justify-between p-4 border-b flex-shrink-0 ${dark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"}`}>
          <span className="font-black tracking-tight text-indigo-600 text-lg">Kirtify</span>
          <button onClick={() => setSidebarOpen(true)} className={`p-2 rounded-xl ${dark ? "bg-slate-800 text-slate-100" : "bg-slate-100 text-slate-700"}`}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </header>

        <TopBar title="Settings" />

        <main className="flex-1 p-4 sm:p-6 lg:p-10 w-full max-w-5xl mx-auto">
          <div className="mb-8">
            <h1 className={`text-2xl font-bold ${dark ? "text-white" : "text-slate-900"}`}>Settings</h1>
            <p className="text-slate-500 text-sm mt-1">Manage your business profile, billing, and preferences</p>
          </div>

          {/* Sending is blocked server-side until the address is confirmed
              (requireVerifiedEmail), so this is the warning that stops that
              from being a surprise. Renders nothing once verified. */}
          <VerifyEmailBanner dark={dark} />

          {/* Tab Navigation */}
          <div className={`flex overflow-x-auto no-scrollbar gap-1 p-1 mb-8 rounded-xl border ${dark ? "bg-slate-900 border-slate-800" : "bg-slate-200/50 border-slate-200"}`}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => { setActiveTab(tab.id); setSavedMsg(""); }}
                className={`flex-1 min-w-fit py-2.5 px-4 rounded-lg text-sm font-bold transition-all ${
                  activeTab === tab.id
                    ? dark ? "bg-slate-800 text-white shadow-sm" : "bg-white text-blue-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── INTEGRATIONS TAB ─────────────────────────────────────────
              Rendered OUTSIDE the <form> below on purpose: the connect cards
              contain buttons that don't all declare type="button", and inside
              a form a type-less button defaults to submit — which would fire
              handleSave. As a sibling block it stays fully self-contained. */}
          {activeTab === "integrations" && (
            <div className="space-y-6">
              <div>
                <h2 className={`text-base font-semibold ${dark ? "text-white" : "text-slate-900"}`}>Connected Platforms</h2>
                <p className="text-slate-500 text-sm mt-0.5">
                  Link your review sources so Kirtify can sync reviews and publish replies.
                  Connections stay active on your plan's sync schedule.
                </p>
              </div>

              <GoogleConnect
                dark={dark}
                onConnected={handlePlatformConnected}
              />

              <YelpConnect
                dark={dark}
                defaultLocation={settings.location}
                onConnected={handlePlatformConnected}
              />

              <FacebookConnect
                dark={dark}
                onConnected={handlePlatformConnected}
              />

              <p className="text-slate-500 text-xs">
                Reviews sync automatically after a platform is connected. Real-time sync is a Premium feature;
                Starter syncs every 24 hours.
              </p>
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-6">
            {/* ── CLINIC / BUSINESS PROFILE TAB ───────────────────────── */}
            {activeTab === "clinic" && (
              <div className={`border rounded-2xl p-6 sm:p-8 space-y-8 ${cardBg}`}>
                <SectionHeader dark={dark} title="Business Profile" description="Used in review request messages sent to customers" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <InputField dark={dark} label="Business Name"  name="clinicName" value={settings.clinicName} onChange={handleSettingsChange} />
                  <InputField dark={dark} label="Phone"           name="phone"       type="tel" value={settings.phone} onChange={handleSettingsChange} />
                  <InputField dark={dark} label="Owner Name"      name="ownerName"   value={settings.ownerName} onChange={handleSettingsChange} />
                  <InputField dark={dark} label="Alert Email"     name="alertEmail"  type="email" value={settings.alertEmail} onChange={handleSettingsChange} />
                  <InputField dark={dark} label="Location"        name="location"    value={settings.location} onChange={handleSettingsChange} placeholder="City, Country" />
                </div>
                <div className={`pt-8 border-t ${dark ? "border-slate-800" : "border-slate-100"}`}>
                  <SectionHeader dark={dark} title="Google Integration" description="Connect your Google Business Profile" />
                  <div className="space-y-6">
                    <InputField dark={dark} label="Business Profile URL" name="googleBusinessUrl" value={settings.googleBusinessUrl} onChange={handleSettingsChange} placeholder="https://g.page/..." />
                    <InputField dark={dark} label="Review Link"          name="googleReviewLink"  value={settings.googleReviewLink}  onChange={handleSettingsChange} placeholder="https://search.google.com/local/writereview?..." />
                  </div>
                </div>
              </div>
            )}

            {/* ── NOTIFICATIONS TAB ──────────────────────────────────── */}
            {activeTab === "notifications" && (
              <div className={`border rounded-2xl p-6 sm:p-8 ${cardBg}`}>
                <SectionHeader dark={dark} title="Notification Preferences" description="Choose how you want to stay updated" />
                <Toggle dark={dark} label="Urgent Review Alerts" description="Email immediately for 1–3 star reviews"      enabled={notifications.urgentAlerts}   onToggle={() => handleToggle("urgentAlerts")} />
                <Toggle dark={dark} label="New Review Alerts"    description="Get notified the moment a new review arrives"  enabled={notifications.newReviewAlert} onToggle={() => handleToggle("newReviewAlert")} />
                <Toggle dark={dark} label="Weekly Performance Report" description="Snapshot of new reviews, ratings, response rate" enabled={notifications.weeklyReport}  onToggle={() => handleToggle("weeklyReport")} />
                <Toggle dark={dark} label="Monthly Recap"        description="Trend report plus competitor benchmarking"     enabled={notifications.monthlyReport}  onToggle={() => handleToggle("monthlyReport")} />
              </div>
            )}

            {/* ── ACCOUNT TAB ────────────────────────────────────────── */}
            {activeTab === "account" && (
              <div className="space-y-6">
                <div className={`border rounded-2xl p-6 sm:p-8 space-y-6 ${cardBg}`}>
                  <SectionHeader dark={dark} title="Account" description="Your sign-in details" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <InputField dark={dark} label="Name"  value={authUser?.name  || ""} disabled />
                    <InputField dark={dark} label="Email" value={authUser?.email || ""} disabled hint="To change your email, contact support" />
                  </div>
                </div>

                <div className={`border rounded-2xl p-6 sm:p-8 space-y-5 ${cardBg}`}>
                  <SectionHeader dark={dark} title="Security" description="Update your account password" />
                  <div className="max-w-md space-y-4">
                    <InputField
                      dark={dark}
                      label="Current Password"
                      type="password"
                      placeholder="•••••••••"
                      value={pwd.current}
                      onChange={(e) => setPwd({ ...pwd, current: e.target.value })}
                    />
                    <InputField
                      dark={dark}
                      label="New Password"
                      type="password"
                      placeholder="•••••••••"
                      value={pwd.next}
                      onChange={(e) => setPwd({ ...pwd, next: e.target.value })}
                    />
                    <InputField
                      dark={dark}
                      label="Confirm New Password"
                      type="password"
                      placeholder="•••••••••"
                      value={pwd.confirm}
                      onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })}
                    />
                    <button
                      type="button"
                      onClick={handlePasswordChange}
                      disabled={savingPwd}
                      className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-60"
                    >
                      {savingPwd ? "Updating..." : "Update Password"}
                    </button>
                  </div>
                </div>

                <div className={`border border-red-900/20 rounded-2xl p-6 sm:p-8 ${dark ? "bg-red-500/5" : "bg-red-50/50 shadow-sm"}`}>
                  <SectionHeader dark={dark} title="Danger Zone" description="Permanent actions for your account" />
                  {/* The "Delete Account" button that used to sit here toasted
                      "handled by support@kirtify.com" — a support queue
                      standing in for a right the Privacy Policy already
                      promised. It is now a real flow, in its own section below,
                      because deletion and export belong together and neither
                      belongs next to Sign Out. */}
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-bold rounded-lg transition-all"
                    >
                      Sign Out
                    </button>
                  </div>
                </div>

                <div className={`border rounded-2xl p-6 sm:p-8 ${cardBg}`}>
                  <SectionHeader
                    dark={dark}
                    title="Your data"
                    description="Take a copy, or close the account for good"
                  />
                  <DangerZone dark={dark} />
                </div>
              </div>
            )}

            {/* ── BILLING TAB ────────────────────────────────────────── */}
            {activeTab === "team" && (
              <div className={`border rounded-2xl p-6 sm:p-8 ${cardBg}`}>
                <SectionHeader
                  dark={dark}
                  title="Team"
                  description="Who can access this clinic, and what they can do"
                />
                <TeamTab dark={dark} />
              </div>
            )}

            {activeTab === "billing" && (
              <div className="space-y-6">
                <div className={`border rounded-2xl p-6 sm:p-8 ${cardBg}`}>
                  <SectionHeader dark={dark} title="Current Plan" description={`You are currently on the ${currentPlan.name} plan`} />
                  <div className={`p-6 rounded-2xl border ${dark ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-200"}`}>
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                      <div>
                        <p className="text-2xl font-bold text-blue-600">{currentPlan.price}<span className="text-sm font-medium text-slate-500"> / mo</span></p>
                        <ul className="mt-2 space-y-1">
                          {currentPlan.features.map((f) => (
                            <li key={f} className={`text-xs ${dark ? "text-slate-400" : "text-slate-600"}`}>• {f}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="flex flex-col sm:items-end gap-2 shrink-0">
                        {nextUpgrade ? (
                          <UpgradeButton
                            plan={nextUpgrade}
                            className="px-5 py-2.5 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20"
                          >
                            {currentPlanId === "free" ? "Upgrade plan" : `Upgrade to ${PLANS.find((p) => p.id === nextUpgrade)?.name}`}
                          </UpgradeButton>
                        ) : (
                          <span className="text-sm font-semibold text-emerald-500 whitespace-nowrap">You're on our top plan 🎉</span>
                        )}
                        {currentPlanId !== "free" && (
                          <ManageBillingButton
                            className={`px-5 py-2.5 rounded-lg text-sm font-bold border ${
                              dark
                                ? "border-slate-700 text-white hover:bg-slate-800"
                                : "border-slate-300 text-slate-700 hover:bg-slate-100"
                            }`}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── What you've actually used ──────────────────────────────
                    GET /api/v1/usage has been complete and mounted since Phase
                    5 with no caller, so every metered cap (AI drafts, request
                    emails, manual syncs, competitor refreshes) could only be
                    discovered by hitting it mid-task. Directly under the plan
                    card, because "what am I paying for" and "how much of it
                    have I used" are the same question. */}
                <div className={`border rounded-2xl p-6 sm:p-8 ${cardBg}`}>
                  <UsageMeters dark={dark} />
                </div>

                {/* Plan comparison */}
                <div className={`border rounded-2xl p-6 sm:p-8 ${cardBg}`}>
                  <SectionHeader dark={dark} title="All Plans" description="Upgrade anytime — billing is handled securely by Paddle" />
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {PLANS.map((p) => {
                      const isCurrent   = p.id === currentPlanId;
                      const isUpgrade   = (PLAN_RANK[p.id] ?? 0) > currentRank;
                      return (
                        <div
                          key={p.id}
                          className={`p-5 rounded-xl border transition-all flex flex-col ${
                            isCurrent
                              ? "border-blue-500 ring-2 ring-blue-500/20"
                              : dark ? "border-slate-800" : "border-slate-200"
                          }`}
                        >
                          <p className={`text-sm font-bold ${dark ? "text-white" : "text-slate-900"}`}>{p.name}</p>
                          <p className="text-xl font-bold text-blue-600 mt-1">{p.price}<span className="text-xs text-slate-500"> /mo</span></p>
                          <ul className="mt-3 space-y-1.5 flex-1">
                            {p.features.map((f) => (
                              <li key={f} className={`text-[11px] ${dark ? "text-slate-400" : "text-slate-600"}`}>• {f}</li>
                            ))}
                          </ul>
                          {isCurrent ? (
                            <p className="mt-4 text-[10px] font-bold text-blue-500 uppercase tracking-widest">Current Plan</p>
                          ) : isUpgrade ? (
                            <UpgradeButton
                              plan={p.id}
                              className="mt-4 w-full py-2 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white"
                            >
                              Upgrade to {p.name}
                            </UpgradeButton>
                          ) : (
                            <p className="mt-4 text-[10px] font-medium text-slate-500 uppercase tracking-widest">Contact support to change</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className={`border rounded-2xl p-6 sm:p-8 ${cardBg}`}>
                  <SectionHeader dark={dark} title="Billing History" description="Your invoices appear here once you have an active paid plan" />
                  <p className="text-sm text-slate-500">No invoices yet.</p>
                </div>
              </div>
            )}

            {/* Save Button (only for editable tabs) */}
            {(activeTab === "clinic" || activeTab === "notifications") && (
              <div className="flex items-center gap-4 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-600/20 transition-all active:scale-95 disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
                {savedMsg && <span className="text-emerald-500 text-sm font-medium">✓ {savedMsg}</span>}
              </div>
            )}
          </form>
        </main>
      </div>
    </div>
  );
}