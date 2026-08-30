import { useSelector } from "react-redux";
import InputField, { TextAreaField } from "../UI/InputField.jsx";
import StatBar from "../UI/StatBar.jsx";
import {
  selectReviewStats,
  selectReviewsViewState,
} from "../../../store/reviewsSlice.js";

export default function TabOverview({
  profile,
  editMode,
  onProfileChange,
  dark,
}) {
  // ── These two bars used to be literals ─────────────────────────────────────
  // "Monthly Target 85%" and "Patient Satisfaction 4.9/5.0" were hardcoded
  // strings rendered as if they were measurements of this clinic. Every clinic
  // saw the same two numbers regardless of their actual reviews, and nothing on
  // the page said they were placeholders.
  //
  // Monthly Target had no definition anywhere in the product — there is no
  // target to measure against — so it is gone rather than invented. Patient
  // satisfaction is a real thing we can compute: it is the average rating
  // across the loaded reviews, which is what the Dashboard already shows.
  const stats = useSelector(selectReviewStats);
  const viewState = useSelector(selectReviewsViewState);

  const hasReviews = !stats.empty;
  const avgRating = hasReviews ? Number(stats.avg) : null;
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
            className={`text-sm font-bold uppercase tracking-wider mb-6 text-slate-500 dark:text-slate-400`}
          >
            Performance
          </h3>
          {hasReviews ? (
            <div className="space-y-6">
              <StatBar
                label="Patient Satisfaction"
                value={`${avgRating.toFixed(1)}/5.0`}
                percentage={Math.round((avgRating / 5) * 100)}
                dark={dark}
                colorClass="bg-emerald-500"
              />
              <StatBar
                label="Reviews Answered"
                value={`${stats.coverage}%`}
                percentage={stats.coverage}
                dark={dark}
                colorClass="bg-cyan-500"
              />
              <p
                className={`text-xs text-slate-500 dark:text-slate-400`}
              >
                Across {stats.total} loaded review{stats.total === 1 ? "" : "s"}.
              </p>
            </div>
          ) : (
            <p className={`text-sm text-slate-500 dark:text-slate-400`}>
              {viewState === "loading"
                ? "Loading your review data…"
                : "No reviews yet — connect a platform and sync to see your numbers here."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
