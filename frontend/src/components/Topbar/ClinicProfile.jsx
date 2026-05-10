import React, { useState, useEffect, useRef } from "react";
import { useTheme } from "../../context/ThemeContext";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { selectUnreadCount } from "../../store/notificationsSlice.js";

function ClinicProfile() {
  const { dark } = useTheme();
  const [isHovered, setIsHovered] = useState(false);

  // 1. Create a ref to store the timer ID
  const timeoutRef = useRef(null);

  const clinicName =
    useSelector((state) => state.auth.clinicName) || "My Clinic";
  const userEmail = useSelector((state) => state.auth.userEmail) || "";
  const unreadCount = useSelector(selectUnreadCount);

  const initial = clinicName[0]?.toUpperCase() || "C";

  // 2. Clear timer on enter to prevent accidental closing
  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsHovered(true);
  };

  // 3. Set a 3-second delay on leave
  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setIsHovered(false);
    }, 1500); // 3000ms = 3 seconds
  };

  // Cleanup: clear timer if component unmounts
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const theme = {
    text: dark ? "text-slate-100" : "text-slate-900",
    btn: dark
      ? "bg-slate-800/40 border-slate-700 hover:bg-slate-700/60 shadow-sm"
      : "bg-white border-slate-200 hover:bg-slate-50 hover:shadow-sm",
    popup: dark
      ? "bg-slate-900 border-slate-800 shadow-2xl"
      : "bg-white border-slate-200 shadow-xl",
    divider: dark ? "border-slate-800" : "border-slate-100",
  };

  return (
    <div
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Link
        to="/admin"
        className={`flex items-center gap-3 px-3 py-1.5 rounded-xl border transition-all duration-200 ${theme.btn}`}
      >
        <div className="flex flex-col items-end text-right">
          <span className={`text-xs font-bold leading-tight ${theme.text}`}>
            {clinicName}
          </span>
          <span className="text-[10px] text-indigo-500 font-bold uppercase tracking-wide">
            Admin
          </span>
        </div>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white text-xs font-bold shadow-md">
          {initial}
        </div>
      </Link>

      {/* Hover Popup */}
      {isHovered && (
        <div
          className={`absolute right-0 mt-3 w-64 rounded-2xl border p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-200 ${theme.popup}`}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-500 font-bold">
              {initial}
            </div>
            <div className="overflow-hidden">
              <p className={`text-sm font-bold truncate ${theme.text}`}>
                {clinicName}
              </p>
              <p className="text-[10px] text-slate-500 truncate">{userEmail}</p>
            </div>
          </div>
          <div className={`space-y-3 pt-3 border-t ${theme.divider}`}>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-slate-500 font-medium">
                Unread Alerts
              </span>
              <span
                className={`text-[10px] font-bold ${unreadCount > 0 ? "text-red-400" : "text-emerald-400"}`}
              >
                {unreadCount > 0 ? `${unreadCount} new` : "All clear"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-slate-500 font-medium">
                Plan
              </span>
              <span className="text-[10px] font-bold text-indigo-500 uppercase">
                Premium
              </span>
            </div>
          </div>
          <div className="mt-4">
            <Link
              to="/settings"
              className={`block w-full text-center py-2 rounded-lg text-[11px] font-bold transition-colors ${
                dark
                  ? "bg-slate-800 hover:bg-indigo-600 hover:text-white text-slate-300"
                  : "bg-slate-100 hover:bg-indigo-500 hover:text-white text-slate-700"
              }`}
            >
              Manage Account
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default ClinicProfile;
