import { Camera, Edit2, Check, X } from "lucide-react";

export default function ProfileHero({
  profile,
  editMode,
  setEditMode,
  onSave,
  isSaving,
  dark,
}) {
  return (
    <div
      className={`relative rounded-3xl overflow-hidden border ${
        dark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
      }`}
    >
      {/* Banner */}
      <div className="h-32 bg-gradient-to-r from-cyan-500 to-blue-600" />

      <div className="px-8 pb-8">
        <div className="relative flex justify-between items-end -mt-12">
          {/* Avatar */}
          <div className="relative">
            <div
              className={`h-24 w-24 rounded-2xl border-4 ${
                dark
                  ? "bg-slate-800 border-slate-900"
                  : "bg-slate-100 border-white"
              } overflow-hidden shadow-xl`}
            >
              <img
                src={profile.avatar}
                alt="Admin"
                className="w-full h-full object-cover"
              />
              {editMode && (
                <button className="absolute inset-0 bg-black/40 flex items-center justify-center text-white transition-opacity">
                  <Camera size={20} />
                </button>
              )}
            </div>
            <div className="absolute -bottom-1 -right-1 h-5 w-5 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full" />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            {editMode ? (
              <>
                <button
                  onClick={() => setEditMode(false)}
                  className={`px-4 py-2 rounded-xl border text-sm font-medium transition-all ${
                    dark
                      ? "border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-800"
                      : "border-slate-200 text-slate-600 dark:text-slate-400 hover:bg-slate-50"
                  }`}
                >
                  <X size={16} className="inline mr-2" /> Cancel
                </button>
                <button
                  onClick={onSave}
                  disabled={isSaving}
                  className="px-6 py-2 rounded-xl bg-cyan-700 hover:bg-cyan-600 text-white text-sm font-medium shadow-lg shadow-cyan-500/20 transition-all disabled:opacity-50"
                >
                  {isSaving ? (
                    "Saving..."
                  ) : (
                    <>
                      <Check size={16} className="inline mr-2" /> Save Changes
                    </>
                  )}
                </button>
              </>
            ) : (
              <button
                onClick={() => setEditMode(true)}
                className="px-6 py-2 rounded-xl bg-slate-900 dark:bg-white dark:text-slate-900 text-white text-sm font-medium shadow-lg transition-all flex items-center"
              >
                <Edit2 size={16} className="mr-2" /> Edit Profile
              </button>
            )}
          </div>
        </div>

        <div className="mt-4">
          <h1
            className={`text-2xl font-bold ${dark ? "text-white" : "text-slate-900"}`}
          >
            {profile.name}
          </h1>
          <p
            className={`text-sm text-slate-600 dark:text-slate-400`}
          >
            {profile.role} • {profile.clinicName}
          </p>
        </div>
      </div>
    </div>
  );
}
