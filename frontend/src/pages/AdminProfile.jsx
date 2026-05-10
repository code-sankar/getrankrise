import React, { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux"; // Added useDispatch as it was missing but used in handleSave

// Layout & Global UI
import Sidebar from "../components/Sidebar.jsx";
import TopBar from "../components/TopBar.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { updateClinicName } from "../store/authSlice.js";

// Profile Sub-Components
import ProfileHero from "../components/Admin/Profile/ProfileHero.jsx";
import ProfileTabs from "../components/Admin/Profile/ProfileTabs.jsx";
import TabOverview from "../components/Admin/Profile/TabOverview.jsx";
import TabSecurity from "../components/Admin/Profile/TabSecurity.jsx";
import TabNotifications from "../components/Admin/Profile/TabNotifications.jsx";

export default function AdminProfile() {
  const { dark } = useTheme();
  const dispatch = useDispatch();

  // --- State Management ---
  const [activeTab, setActiveTab] = useState("overview");
  const [editMode, setEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false); // Mobile sidebar state

  // Profile Data State
  const [profile, setProfile] = useState({
    name: "Dr. Sarah Jenkins",
    email: "s.jenkins@clinique.com",
    phone: "+1 (555) 0123-4567",
    role: "Senior Clinic Administrator",
    clinicName: "Wellness Central Clinic",
    avatar:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=150",
    bio: "Managing clinical operations and patient care standards since 2018. Specialized in healthcare workflow optimization.",
  });

  // Notifications State
  const [notifPrefs, setNotifPrefs] = useState({
    email: true,
    browser: true,
    sms: false,
  });

  // --- Handlers ---
  const handleProfileChange = (field, value) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  const handleNotifChange = (field, value) => {
    setNotifPrefs((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // await adminAPI.updateProfile(profile);
      dispatch(updateClinicName(profile.clinicName));
      setEditMode(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    const loadProfile = async () => {
      try {
        // const data = await adminAPI.getProfile();
        // setProfile(data);
      } catch (err) {
        console.error("Failed to load profile:", err.message);
      }
    };
    loadProfile();
  }, []);

  return (
    <div
      className={`h-screen overflow-hidden flex transition-colors duration-300 ${
        dark ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-900"
      }`}
    >
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Responsive Positioning */}
      <aside
        className={`fixed inset-y-0 left-0 z-[70] w-64 transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } lg:static lg:block`}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </aside>

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Mobile Branding/Toggle Header */}
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
            className={`p-2 rounded-xl ${
              dark
                ? "bg-slate-800 text-slate-100"
                : "bg-slate-100 text-slate-700"
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

        <TopBar title="Admin Profile" />

        <main className="flex-1 overflow-y-auto custom-scrollbar">
          {/* Added responsive padding and centered container */}
          <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 lg:space-y-8">
            {/* Header Section */}
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

            {/* Navigation Tabs - ProfileTabs should handle its own internal overflow-x */}
            <ProfileTabs
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              dark={dark}
            />

            {/* Dynamic Tab Content */}
            <div className="pb-12">
              <div className={`rounded-2xl transition-all duration-300`}>
                {activeTab === "overview" && (
                  <TabOverview
                    profile={profile}
                    editMode={editMode}
                    onProfileChange={handleProfileChange}
                    dark={dark}
                  />
                )}

                {activeTab === "security" && <TabSecurity dark={dark} />}

                {activeTab === "notifications" && (
                  <TabNotifications
                    prefs={notifPrefs}
                    onPrefChange={handleNotifChange}
                    dark={dark}
                  />
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
