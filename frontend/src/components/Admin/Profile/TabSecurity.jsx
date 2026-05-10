import React from "react";
import InputField from "../UI/InputField.jsx";
import { ShieldCheck, Trash2 } from "lucide-react";

export default function TabSecurity({ dark }) {
  return (
    <div className="space-y-6 max-w-2xl">
      <div
        className={`p-8 rounded-3xl border ${dark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}
      >
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-500">
            <ShieldCheck size={24} />
          </div>
          <h3
            className={`text-lg font-bold ${dark ? "text-white" : "text-slate-900"}`}
          >
            Security Settings
          </h3>
        </div>

        <div className="space-y-6">
          <InputField
            label="Current Password"
            type="password"
            placeholder="••••••••"
            dark={dark}
          />
          <InputField label="New Password" type="password" dark={dark} />
          <button className="w-full py-3 rounded-xl bg-indigo-600 text-white font-semibold">
            Update Password
          </button>
        </div>
      </div>

      <div
        className={`p-6 rounded-3xl border border-red-200 bg-red-50/50 dark:bg-red-950/10 dark:border-red-900/30`}
      >
        <h4 className="text-red-600 font-bold mb-2 flex items-center">
          <Trash2 size={16} className="mr-2" /> Danger Zone
        </h4>
        <p className="text-sm text-red-500/80 mb-4">
          Deleting your account will permanently remove all clinic data.
        </p>
        <button className="text-sm font-bold text-red-600 hover:underline">
          Delete Admin Account
        </button>
      </div>
    </div>
  );
}
