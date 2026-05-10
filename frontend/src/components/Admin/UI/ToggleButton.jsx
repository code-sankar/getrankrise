import React from "react";

/**
 * A toggle switch component for settings and preferences.
 */
export default function ToggleButton({
  enabled,
  onChange,
  label,
  description,
  dark,
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex flex-col">
        <span
          className={`text-sm font-semibold ${dark ? "text-slate-200" : "text-slate-800"}`}
        >
          {label}
        </span>
        {description && (
          <span
            className={`text-xs ${dark ? "text-slate-500" : "text-slate-400"}`}
          >
            {description}
          </span>
        )}
      </div>
      <button
        onClick={() => onChange(!enabled)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
          enabled ? "bg-indigo-600" : dark ? "bg-slate-700" : "bg-slate-300"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            enabled ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}
