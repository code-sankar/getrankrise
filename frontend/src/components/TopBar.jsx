import { useTheme } from "../context/ThemeContext.jsx";
import PageTitle from "./Topbar/pageTitle.jsx";
import NotificationBell from "./Topbar/NotificationBell.jsx";
import ClinicProfile from "./Topbar/ClinicProfile.jsx";
import LiveIndicator from "./Topbar/LiveIndicator.jsx";

export default function TopBar({ title }) {
  const { dark, toggle } = useTheme();
  const theme = {
    header: dark
      ? "bg-slate-900/80 border-slate-800"
      : "bg-white/80 border-slate-200",
    text: dark ? "text-slate-100" : "text-slate-900",
    muted: "text-slate-500 dark:text-slate-400",
    btn: dark
      ? "bg-slate-800/40 border-slate-700 hover:bg-slate-700/60"
      : "bg-white border-slate-200 hover:bg-slate-50 hover:shadow-sm",
    popup: dark
      ? "bg-slate-900 border-slate-800 shadow-2xl"
      : "bg-white border-slate-200 shadow-xl",
    notifItem: dark ? "hover:bg-slate-800/60" : "hover:bg-slate-50",
    divider: dark ? "border-slate-800" : "border-slate-100",
  };

  return (
    <header
      className={`flex items-center justify-between px-4 md:px-8 py-3 md:py-4 border-b sticky top-0 z-50 backdrop-blur-md transition-all duration-300 ${theme.header}`}
    >
      {/* ── Who gets the space when there isn't enough ────────────────────────
          At 390px the clinic block ("Northside Dental Care / ADMIN") claimed
          around 200px and left the title with room for one letter, so the bar
          read "U…" — worse than showing nothing. The title wins the fight now:
          it is the only thing on screen that says which page you are on,
          whereas the clinic name is already in the sidebar. `basis-0 grow`
          makes it take the remaining space rather than only its own width. */}
      <div className="flex-1 basis-0 grow min-w-0 mr-2">
        <PageTitle title={title} />
      </div>

      <div className="flex items-center gap-2 md:gap-3 flex-shrink-0 min-w-0">
        {/* Live Indicator - Hidden on extra small screens if it crowds the bar, or kept visible */}
        <div className="hidden xs:block">
          <LiveIndicator />
        </div>

        {/* Theme Toggle */}
        <button
          onClick={toggle}
          className={`p-2 rounded-xl border transition-all duration-200 active:scale-90 ${theme.btn} ${theme.muted}`}
        >
          {dark ? (
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
              />
            </svg>
          ) : (
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
              />
            </svg>
          )}
        </button>

        {/* Notification Bell */}
        <NotificationBell />

        <div
          className={`h-6 w-[1px] mx-0.5 md:mx-1 ${dark ? "bg-slate-800" : "bg-slate-200"}`}
        />

        {/* Clinic & Profile */}
        <ClinicProfile />
      </div>
    </header>
  );
}
