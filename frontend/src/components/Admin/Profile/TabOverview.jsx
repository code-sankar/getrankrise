import React from "react";
import InputField, { TextAreaField } from "../UI/InputField.jsx";
import StatBar from "../UI/StatBar.jsx";

export default function TabOverview({
  profile,
  editMode,
  onProfileChange,
  dark,
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div
        className={`lg:col-span-2 p-8 rounded-3xl border ${
          dark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
        }`}
      >
        <h3
          className={`text-lg font-bold mb-6 ${dark ? "text-white" : "text-slate-900"}`}
        >
          Personal Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <InputField
            label="Full Name"
            value={profile.name}
            onChange={(e) => onProfileChange("name", e.target.value)}
            disabled={!editMode}
            dark={dark}
          />
          <InputField
            label="Email Address"
            value={profile.email}
            onChange={(e) => onProfileChange("email", e.target.value)}
            disabled={!editMode}
            dark={dark}
          />
          <InputField
            label="Phone"
            value={profile.phone}
            onChange={(e) => onProfileChange("phone", e.target.value)}
            disabled={!editMode}
            dark={dark}
          />
          <InputField
            label="Clinic Name"
            value={profile.clinicName}
            onChange={(e) => onProfileChange("clinicName", e.target.value)}
            disabled={!editMode}
            dark={dark}
          />
          <div className="md:col-span-2">
            <TextAreaField
              label="Clinic Bio"
              value={profile.bio}
              onChange={(e) => onProfileChange("bio", e.target.value)}
              disabled={!editMode}
              dark={dark}
            />
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div
          className={`p-6 rounded-3xl border ${dark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}
        >
          <h3
            className={`text-sm font-bold uppercase tracking-wider mb-6 ${dark ? "text-slate-500" : "text-slate-400"}`}
          >
            Performance
          </h3>
          <div className="space-y-6">
            <StatBar
              label="Monthly Target"
              value="85%"
              percentage={85}
              dark={dark}
              colorClass="bg-indigo-500"
            />
            <StatBar
              label="Patient Satisfaction"
              value="4.9/5.0"
              percentage={98}
              dark={dark}
              colorClass="bg-emerald-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
