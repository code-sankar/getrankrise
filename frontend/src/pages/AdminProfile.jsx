import { useEffect, useState } from "react";
import { useSelector, useDispatch } from "react-redux";

// Layout & Global UI
import Sidebar from "../components/Sidebar.jsx";
import TopBar from "../components/TopBar.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { updateClinicName } from "../store/authSlice.js";
import {
  getUserClinic,
  updateUserClinic,
  getUserSettings,
  updateUserSettings,
} from "../hooks/user.hook.js";
import { getUserReviews } from "../hooks/reviews.hook.js";

// Profile Sub-Components
import ProfileHero from "../components/Admin/Profile/ProfileHero.jsx";
import ProfileTabs from "../components/Admin/Profile/ProfileTabs.jsx";
import TabOverview from "../components/Admin/Profile/TabOverview.jsx";
import TabSecurity from "../components/Admin/Profile/TabSecurity.jsx";
import TabNotifications from "../components/Admin/Profile/TabNotifications.jsx";

// Generate a deterministic avatar from the user's name so each user gets a unique one
const avatarFor = (name) => {
  const seed = encodeURIComponent(name || "Kirtify");
  return `https://api.dicebear.com/7.x/initials/svg?seed=${seed}&backgroundColor=4f46e5,6366f1,818cf8&textColor=ffffff`;
};

export default function AdminProfile() {
  const { dark }    = useTheme();
  const dispatch    = useDispatch();

  // ── Redux state ───────────────────────────────────────────────────────────
  const authUser    = useSelector((s) => s.auth.user);
  const clinicName  = useSelector((s) => s.auth.clinicName);
  const userClinic  = useSelector((s) => s.user.userClinic);
  const userSettings = useSelector((s) => s.user.userSettings);

  // ── Local UI state ────────────────────────────────────────────────────────
  const [activeTab,   setActiveTab]   = useState("overview");
  const [editMode,    setEditMode]    = useState(false);
  const [isSaving,    setIsSaving]    = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Profile data DERIVED from Redux, with the user's unsaved edits layered on
  // top. This used to be a full local copy that two effects pushed Redux into
  // — the cascading render react-hooks/set-state-in-effect flags, and a live
  // hazard besides: any Redux refresh of authUser/userClinic overwrote fields
  // the user was mid-way through editing, because the effect merged server
  // values over the local ones on every store change.
  const [profileEdits, setProfileEdits] = useState({});
  const profile = {
    name:       authUser?.name  || "",
    email:      authUser?.email || "",
    role:       authUser?.role === "admin" ? "Administrator" : (authUser?.role || "Administrator"),
    avatar:     avatarFor(authUser?.name),
    phone:      userClinic?.phone      || "",
    clinicName: userClinic?.clinicName || clinicName || "",
    bio:        userClinic?.location   || "",
    ...profileEdits,
  };

  const [notifEdits, setNotifEdits] = useState({});
  const notifPrefs = {
    // Backend keys → the simpler three the notifications tab renders.
    email:   userSettings?.weeklyReport ?? userSettings?.monthlyReport ?? true,
    browser: userSettings?.urgentAlerts ?? true,
    sms:     userSettings?.newReviewAlert ?? false,
    ...notifEdits,
  };

  // ── Load clinic, settings & reviews on mount ─────────────────────────────
  // Reviews are needed because the Overview tab's performance bars are now
  // derived from real review data rather than the hardcoded "85%" and
  // "4.9/5.0" they used to render.
  useEffect(() => {
    getUserClinic(dispatch).catch(() => {});
    getUserSettings(dispatch).catch(() => {});
    getUserReviews(dispatch, { offset: 0 }).catch(() => {});
  }, [dispatch]);

  // (The two "hydrate the local form whenever Redux updates" effects that used
  // to sit here are gone — that hydration is the derivation above.)

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleProfileChange = (field, value) => {
    setProfileEdits((prev) => ({ ...prev, [field]: value }));
  };

  const handleNotifChange = (field, value) => {
    setNotifEdits((prev) => ({ ...prev, [field]: value }));
    // Persist to backend immediately
    updateUserSettings(dispatch, {
      ...userSettings,
      ...(field === "browser" ? { urgentAlerts:   value } : {}),
      ...(field === "sms"     ? { newReviewAlert: value } : {}),
      ...(field === "email"   ? { weeklyReport:   value, monthlyReport: value } : {}),
    }).catch(() => {});
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateUserClinic(dispatch, {
        clinicName: profile.clinicName,
        phone:      profile.phone,
        location:   profile.bio,
      });
      dispatch(updateClinicName(profile.clinicName));
      // Saved values now live in Redux; drop the overlay so the form reads
      // straight through to them.
      setProfileEdits({});
      setEditMode(false);
    } catch (err) {
      console.error("Profile save failed:", err?.message);
    } finally {
      setIsSaving(false);
    }
  };

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
          <span className="font-black tracking-tight text-cyan-700 dark:text-cyan-400 text-lg">Kirtify</span>
          <button onClick={() => setSidebarOpen(true)} className={`p-2 rounded-xl ${dark ? "bg-slate-800 text-slate-100" : "bg-slate-100 text-slate-700 dark:text-slate-300"}`}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </header>

        <TopBar title="Admin Profile" />

        <main className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 lg:space-y-8">
            <div className="w-full">
              <ProfileHero
                profile={profile}
                editMode={editMode}
                setEditMode={setEditMode}
                onSave={handleSave}
                isSaving={isSaving}
                dark={dark}
              />
            </div>

            <ProfileTabs activeTab={activeTab} setActiveTab={setActiveTab} dark={dark} />

            <div className="pb-12">
              <div className="rounded-2xl transition-all duration-300">
                {activeTab === "overview" && (
                  <TabOverview profile={profile} editMode={editMode} onProfileChange={handleProfileChange} dark={dark} />
                )}
                {activeTab === "security" && <TabSecurity dark={dark} />}
                {activeTab === "notifications" && (
                  <TabNotifications prefs={notifPrefs} onPrefChange={handleNotifChange} dark={dark} />
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}