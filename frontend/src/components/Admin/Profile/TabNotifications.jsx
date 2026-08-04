import ToggleButton from "../UI/ToggleButton.jsx";

export default function TabNotifications({ prefs, onPrefChange, dark }) {
  return (
    <div
      className={`p-8 rounded-3xl border max-w-2xl ${dark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}
    >
      <h3
        className={`text-lg font-bold mb-6 ${dark ? "text-white" : "text-slate-900"}`}
      >
        Notification Preferences
      </h3>
      <div className="divide-y dark:divide-slate-800 divide-slate-100">
        <ToggleButton
          label="Email Notifications"
          description="Receive daily summaries and system alerts via email."
          enabled={prefs.email}
          onChange={(val) => onPrefChange("email", val)}
          dark={dark}
        />
        <ToggleButton
          label="Browser Alerts"
          description="Show desktop notifications for new patient bookings."
          enabled={prefs.browser}
          onChange={(val) => onPrefChange("browser", val)}
          dark={dark}
        />
        <ToggleButton
          label="SMS Reminders"
          description="Get text alerts for emergency cancellations."
          enabled={prefs.sms}
          onChange={(val) => onPrefChange("sms", val)}
          dark={dark}
        />
      </div>
    </div>
  );
}
