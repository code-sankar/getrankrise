import { useState, useEffect, useRef } from "react";
import { useTheme } from "../../context/ThemeContext";
import { useSelector, useDispatch } from "react-redux";
import { selectUnreadCount } from "../../store/notificationsSlice.js";
import {
  getUserNotifications,
  markAllNotificationsRead,
  dismissNotification,
} from "../../hooks/notifications.hook.js";

function NotificationBell() {
  const { dark } = useTheme();
  const dispatch = useDispatch();
  const unreadCount = useSelector(selectUnreadCount);
  const [showNotifs, setShowNotifs] = useState(false);
  const notifications = useSelector((state) => state.notifications.items);
  const isAuthenticated = useSelector((state) => state.auth.isAuthenticated);
  const notifRef = useRef(null);

  // Fetch once on mount. Previously nothing ever populated this slice, so the
  // bell rendered "All caught up!" no matter what the server held.
  //
  // Gated on isAuthenticated because TopBar also renders on the public
  // information pages (/help, /faq, /contact). A logged-out visitor reading the
  // help centre was firing an authenticated GET /notifications that 401s, which
  // put a red console error on a marketing page and — via the axios
  // interceptor's non-expiry 401 branch — could bounce them to /login for
  // simply reading the docs.
  useEffect(() => {
    if (!isAuthenticated) return;
    getUserNotifications(dispatch);
  }, [dispatch, isAuthenticated]);

  const theme = {
    text: dark ? "text-slate-100" : "text-slate-900",
    muted: dark ? "text-slate-400" : "text-slate-500",
    btn: dark
      ? "bg-slate-800/40 border-slate-700 hover:bg-slate-700/60"
      : "bg-white border-slate-200 hover:bg-slate-50 hover:shadow-sm",
    popup: dark
      ? "bg-slate-900 border-slate-800 shadow-2xl"
      : "bg-white border-slate-200 shadow-xl",
    notifItem: dark ? "hover:bg-slate-800/60" : "hover:bg-slate-50",
    divider: dark ? "border-slate-800" : "border-slate-100",
    overlay: "bg-slate-900/60 backdrop-blur-sm",
  };

  useEffect(() => {
    const handleClick = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifs(false);
      }
    };
    if (showNotifs) {
      document.addEventListener("mousedown", handleClick);
      // Only lock scroll on mobile
      if (window.innerWidth < 1024) {
        document.body.style.overflow = "hidden";
      }
    }
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.body.style.overflow = "unset";
    };
  }, [showNotifs]);

  const notifTypeColor = {
    urgent: "bg-red-500",
    info: "bg-blue-500",
    success: "bg-emerald-500",
  };

  return (
    <div className="relative" ref={notifRef}>
      <button
        onClick={() => setShowNotifs((v) => !v)}
        className={`relative p-2 rounded-xl border transition-all duration-200 active:scale-90 ${theme.btn} ${theme.muted}`}
      >
        <svg
          className="w-5 h-5 lg:w-4 lg:h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.8}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white text-[9px] font-black flex items-center justify-center ring-2 ring-white dark:ring-slate-950">
            {unreadCount}
          </span>
        )}
      </button>

      {showNotifs && (
        <>
          {/* Mobile Overlay: Hidden on Desktop */}
          <div 
            className={`fixed inset-0 z-40 lg:hidden ${theme.overlay}`} 
            onClick={() => setShowNotifs(false)}
          />

          <div
            className={`
              /* Base Styles */
              z-50 overflow-hidden border transition-all duration-300 rounded-2xl ${theme.popup}

              /* Mobile: Center Modal */
              fixed inset-x-4 top-20 mx-auto w-auto max-w-[calc(100%-2rem)] 

              /* Desktop: Absolute Dropdown */
              lg:absolute lg:top-full lg:mt-2 lg:right-0 lg:left-auto lg:inset-x-auto lg:w-80 lg:max-w-none
            `}
          >
            {/* Header */}
            <div className={`flex items-center justify-between px-4 py-4 lg:py-3 border-b ${theme.divider}`}>
              <span className={`text-sm font-bold ${theme.text}`}>Notifications</span>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => markAllNotificationsRead(dispatch)}
                  className="text-xs text-indigo-500 font-semibold hover:text-indigo-400"
                >
                  Mark all read
                </button>
                <button
                  onClick={() => setShowNotifs(false)}
                  className={`lg:hidden ${theme.muted} text-xl`}
                >
                  ×
                </button>
              </div>
            </div>

            {/* List */}
            <div className="max-h-[60vh] lg:max-h-72 overflow-y-auto custom-scrollbar">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center py-12 px-4 text-center">
                  <p className={`text-sm font-medium ${theme.muted}`}>All caught up!</p>
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`flex items-start gap-3 px-4 py-4 lg:py-3 border-b last:border-0 ${theme.divider} transition-colors ${theme.notifItem} ${
                      !n.read ? (dark ? "bg-slate-800/30" : "bg-indigo-50/40") : ""
                    }`}
                  >
                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${notifTypeColor[n.type] || "bg-slate-400"}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium leading-relaxed ${theme.text}`}>{n.message}</p>
                      <p className={`text-[10px] mt-1 ${theme.muted}`}>{n.time}</p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        dismissNotification(dispatch, n.id);
                      }}
                      className={`p-1 rounded-lg ${theme.muted} hover:text-red-400 hover:bg-red-400/10 transition-all flex-shrink-0`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Footer: Hidden on Desktop */}
            <div className={`lg:hidden p-3 border-t text-center ${theme.divider}`}>
              <button 
                onClick={() => setShowNotifs(false)}
                className="text-xs font-bold text-indigo-500 uppercase tracking-wider"
              >
                Close Panel
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default NotificationBell;