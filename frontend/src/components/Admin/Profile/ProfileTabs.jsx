import React from "react";

export default function ProfileTabs({ activeTab, setActiveTab, dark }) {
  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "security", label: "Security" },

    { id: "notifications", label: "Notifications" },
  ];

  return (
    <div
      className={`flex gap-2 p-1 rounded-2xl w-fit transition-colors duration-300 ${
        dark ? "bg-slate-900/50" : "bg-slate-100"
      }`}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
              isActive
                ? dark
                  ? "bg-slate-800 shadow-lg shadow-black/20 text-indigo-400"
                  : "bg-white shadow-sm text-indigo-600"
                : dark
                  ? "text-slate-500 hover:text-slate-300 hover:bg-slate-800/50"
                  : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
