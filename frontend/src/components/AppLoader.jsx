import { useTheme } from "../context/ThemeContext.jsx";
import logo from "../assets/logo.png";

export default function AppLoader() {
  const { dark } = useTheme();

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-6 transition-colors duration-300 ${
        dark ? "bg-slate-950" : "bg-slate-50"
      }`}
    >
      {/* Animated logo */}
      <div className="relative">
        <div className="absolute inset-0 rounded-2xl bg-indigo-500/20 animate-ping" />
        <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center shadow-2xl shadow-indigo-500/40">
          <img src={logo} alt="GetRankRise" className="w-9 h-9" />
        </div>
      </div>

      {/* Brand name */}
      <div className="text-center space-y-1">
        <p className={`text-xl font-black tracking-tight ${dark ? "text-white" : "text-slate-900"}`}>
          GetRankRise
        </p>
        <p className={`text-xs font-medium ${dark ? "text-slate-500" : "text-slate-400"}`}>
          Loading your dashboard…
        </p>
      </div>

      {/* Progress bar */}
      <div className={`w-40 h-1 rounded-full overflow-hidden ${dark ? "bg-slate-800" : "bg-slate-200"}`}>
        <div className="h-full w-1/2 bg-indigo-500 rounded-full animate-[loading_1.2s_ease-in-out_infinite]" />
      </div>

      <style>{`
        @keyframes loading {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  );
}