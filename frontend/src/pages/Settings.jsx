import { useState } from "react";
import Sidebar from "../components/Sidebar.jsx";
import TopBar from "../components/TopBar.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { useDispatch } from "react-redux";
import { updateClinicName } from "../store/authSlice.js";

const initialSettings = {
  clinicName: "Bright Smile Dental",
  ownerName: "Dr. Sarah Johnson",
  alertEmail: "sarah@brightsmile.com",
  phone: "+1 (555) 201-3344",
  googleBusinessUrl: "https://g.page/brightsmile-dental",
  googleReviewLink: "https://search.google.com/local/reviews?placeid=xxx",
};

const initialNotifications = {
  urgentAlerts: true,
  newReviewAlert: true,
  weeklyReport: false,
  monthlyReport: true,
};

// Reusable Components
function SectionHeader({ title, description, dark }) {
  return (
    <div className="mb-6">
      <h2
        className={`text-base font-semibold ${dark ? "text-white" : "text-slate-900"}`}
      >
        {title}
      </h2>
      <p className="text-slate-500 text-sm mt-0.5">{description}</p>
    </div>
  );
}

function InputField({
  label,
  name,
  type = "text",
  value,
  onChange,
  placeholder,
  hint,
  dark,
}) {
  return (
    <div className="w-full">
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">
        {label}
      </label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`w-full px-4 py-3 border rounded-xl text-sm transition-colors outline-none focus:border-blue-500 ${
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
    <div
      className={`flex items-center justify-between gap-4 py-4 border-b last:border-0 ${dark ? "border-slate-800" : "border-slate-100"}`}
    >
      <div>
        <p
          className={`text-sm font-medium ${dark ? "text-slate-200" : "text-slate-800"}`}
        >
          {label}
        </p>
        <p className="text-slate-500 text-xs mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 ${enabled ? "bg-blue-600" : dark ? "bg-slate-700" : "bg-slate-300"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${enabled ? "translate-x-5" : "translate-x-0"}`}
        />
      </button>
    </div>
  );
}

export default function Settings() {
  const { dark } = useTheme();
  const dispatch = useDispatch();
  const [settings, setSettings] = useState(initialSettings);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [activeTab, setActiveTab] = useState("clinic");

  const handleSettingsChange = (e) => {
    setSettings({ ...settings, [e.target.name]: e.target.value });
    setSavedMsg("");
  };

  const handleToggle = (key) => {
    setNotifications((prev) => ({ ...prev, [key]: !prev[key] }));
    setSavedMsg("");
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    await new Promise((r) => setTimeout(r, 1000));
    dispatch(updateClinicName(settings.clinicName));
    setSavedMsg("Settings saved successfully!");
    setSaving(false);
  };

  const TABS = [
    { id: "clinic", label: "Clinic Profile" },
    { id: "notifications", label: "Notifications" },
    { id: "account", label: "Account & Profile" },
    { id: "billing", label: "Billing" },
  ];

  const cardBg = dark
    ? "bg-slate-900 border-slate-800"
    : "bg-white border-slate-200 shadow-sm";

  return (
    <div
          className={`h-screen overflow-hidden flex transition-colors duration-300 ${
            dark ? "bg-slate-950" : "bg-slate-50"
          }`}
        >
          {/* Sidebar - Desktop */}
          <aside className="hidden lg:block w-64 flex-shrink-0 border-r border-slate-200 dark:border-slate-800">
            <Sidebar />
          </aside>
    
          {/* Sidebar - Mobile Overlay & Component */}
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
    
          {/* Main Content Area - Scrollable Container */}
          <div className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto custom-scrollbar">
            
            {/* Mobile Header - Scrolls with content */}
            <header
              className={`lg:hidden flex items-center justify-between p-4 border-b flex-shrink-0 ${
                dark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
              }`}
            >
              <span className="font-black tracking-tight text-indigo-600 text-lg">
                GetRankRise
              </span>
              <button
                onClick={() => setSidebarOpen(true)}
                className={`p-2 rounded-xl transition-colors duration-200 active:scale-95 ${
                  dark
                    ? "bg-slate-800 text-slate-100 hover:bg-slate-700"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </header>
    
            {/* TopBar - Sticky over the content */}
            <div className="sticky top-0 z-50">
              <TopBar title="Settings" onMenuClick={() => setSidebarOpen(true)} />
            </div>

        <main className="flex-1 p-4 sm:p-6 lg:p-10">
          <div className="max-w-4xl mx-auto">
            <div className="mb-8">
              <h1
                className={`text-2xl sm:text-3xl font-bold tracking-tight ${dark ? "text-white" : "text-slate-900"}`}
              >
                Settings
              </h1>
              <p className="text-slate-500 text-sm mt-1">
                Manage your account, billing, and clinic preferences
              </p>
            </div>

            {/* Tab Navigation */}
            <div
              className={`flex overflow-x-auto no-scrollbar gap-1 p-1 mb-8 rounded-xl border ${dark ? "bg-slate-900 border-slate-800" : "bg-slate-200/50 border-slate-200"}`}
            >
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id);
                    setSavedMsg("");
                  }}
                  className={`flex-1 min-w-fit py-2.5 px-4 rounded-lg text-sm font-bold transition-all ${
                    activeTab === tab.id
                      ? dark
                        ? "bg-slate-800 text-white shadow-sm"
                        : "bg-white text-blue-600 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleSave} className="space-y-6">
              {/* --- CLINIC PROFILE TAB --- */}
              {activeTab === "clinic" && (
                <div
                  className={`border rounded-2xl p-6 sm:p-8 space-y-8 ${cardBg}`}
                >
                  <SectionHeader
                    dark={dark}
                    title="Clinic Profile"
                    description="Used in review request messages sent to patients"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <InputField
                      dark={dark}
                      label="Clinic Name"
                      name="clinicName"
                      value={settings.clinicName}
                      onChange={handleSettingsChange}
                    />
                    <InputField
                      dark={dark}
                      label="Clinic Phone"
                      name="phone"
                      type="tel"
                      value={settings.phone}
                      onChange={handleSettingsChange}
                    />
                  </div>
                  <div
                    className={`pt-8 border-t ${dark ? "border-slate-800" : "border-slate-100"}`}
                  >
                    <SectionHeader
                      dark={dark}
                      title="Google Integration"
                      description="Connect your Google Business Profile"
                    />
                    <div className="space-y-6">
                      <InputField
                        dark={dark}
                        label="Business Profile URL"
                        name="googleBusinessUrl"
                        value={settings.googleBusinessUrl}
                        onChange={handleSettingsChange}
                      />
                      <InputField
                        dark={dark}
                        label="Review Link"
                        name="googleReviewLink"
                        value={settings.googleReviewLink}
                        onChange={handleSettingsChange}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* --- NOTIFICATIONS TAB --- */}
              {activeTab === "notifications" && (
                <div className={`border rounded-2xl p-6 sm:p-8 ${cardBg}`}>
                  <SectionHeader
                    dark={dark}
                    title="Notification Preferences"
                    description="Choose how you want to stay updated"
                  />
                  <Toggle
                    dark={dark}
                    label="Urgent Review Alerts"
                    description="Email immediately for 1-3 star reviews"
                    enabled={notifications.urgentAlerts}
                    onToggle={() => handleToggle("urgentAlerts")}
                  />
                  <Toggle
                    dark={dark}
                    label="Weekly Summary"
                    description="Weekly email performance report"
                    enabled={notifications.weeklyReport}
                    onToggle={() => handleToggle("weeklyReport")}
                  />
                </div>
              )}

              {/* --- ACCOUNT & PROFILE TAB --- */}
              {activeTab === "account" && (
                <div className="space-y-6">
                  {/* User Profile Info */}
                  <div className={`border rounded-2xl p-6 sm:p-8 ${cardBg}`}>
                    <SectionHeader
                      dark={dark}
                      title="Personal Profile"
                      description="Manage your personal information and identity"
                    />
                    <div className="flex items-center gap-6 mb-8">
                      <div className="w-20 h-20 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-2xl border-4 border-white shadow-sm">
                        SJ
                      </div>
                      <button
                        type="button"
                        className="text-sm font-bold text-blue-600 hover:underline"
                      >
                        Change Photo
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <InputField
                        dark={dark}
                        label="Full Name"
                        name="ownerName"
                        value={settings.ownerName}
                        onChange={handleSettingsChange}
                      />
                      <InputField
                        dark={dark}
                        label="Account Email"
                        name="alertEmail"
                        type="email"
                        value={settings.alertEmail}
                        onChange={handleSettingsChange}
                      />
                    </div>
                  </div>

                  {/* Security */}
                  <div
                    className={`border rounded-2xl p-6 sm:p-8 space-y-5 ${cardBg}`}
                  >
                    <SectionHeader
                      dark={dark}
                      title="Security"
                      description="Update your account password"
                    />
                    <div className="max-w-md space-y-4">
                      <InputField
                        dark={dark}
                        label="Current Password"
                        type="password"
                        placeholder="••••••••"
                      />
                      <InputField
                        dark={dark}
                        label="New Password"
                        type="password"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold"
                      >
                        Update Password
                      </button>
                    </div>
                  </div>

                  {/* Danger Zone */}
                  <div
                    className={`border border-red-900/20 rounded-2xl p-6 sm:p-8 ${dark ? "bg-red-500/5" : "bg-red-50/50 shadow-sm"}`}
                  >
                    <SectionHeader
                      dark={dark}
                      title="Danger Zone"
                      description="Permanent actions for your account"
                    />
                    <button
                      type="button"
                      className="px-4 py-2 border border-red-200 text-red-600 hover:bg-red-600 hover:text-white text-sm font-bold rounded-lg transition-all"
                    >
                      Delete Account
                    </button>
                  </div>
                </div>
              )}

              {/* --- BILLING TAB --- */}
              {activeTab === "billing" && (
                <div className="space-y-6">
                  <div className={`border rounded-2xl p-6 sm:p-8 ${cardBg}`}>
                    <SectionHeader
                      dark={dark}
                      title="Current Plan"
                      description="You are currently on the Professional Plan"
                    />
                    <div
                      className={`p-6 rounded-2xl border ${dark ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-200"}`}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-xl font-bold text-blue-600">
                            $49/month
                          </p>
                          <p
                            className={`text-sm ${dark ? "text-slate-400" : "text-slate-600"}`}
                          >
                            Next billing date: May 28, 2026
                          </p>
                        </div>
                        <button
                          type="button"
                          className={`px-4 py-2 rounded-lg text-sm font-bold border ${dark ? "border-slate-700 text-white" : "border-slate-300 text-slate-700"}`}
                        >
                          Manage Subscription
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className={`border rounded-2xl p-6 sm:p-8 ${cardBg}`}>
                    <SectionHeader
                      dark={dark}
                      title="Billing History"
                      description="Download your recent invoices"
                    />
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className={`flex justify-between items-center p-4 rounded-xl border ${dark ? "border-slate-800" : "border-slate-100"}`}
                        >
                          <div className="text-sm font-medium">
                            Invoice #GRR-00{i}
                          </div>
                          <div className="text-sm text-slate-500">
                            April 0{i}, 2026
                          </div>
                          <button
                            type="button"
                            className="text-blue-600 text-sm font-bold"
                          >
                            Download
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Save Button */}
              {(activeTab === "clinic" ||
                activeTab === "notifications" ||
                activeTab === "account") && (
                <div className="flex items-center gap-4 pt-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-600/20 transition-all active:scale-95 disabled:opacity-60"
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                  {savedMsg && (
                    <span className="text-emerald-500 text-sm font-bold">
                      ✓ {savedMsg}
                    </span>
                  )}
                </div>
              )}
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
