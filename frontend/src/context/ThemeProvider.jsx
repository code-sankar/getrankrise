import { useState, useEffect, useMemo } from "react";
import { ThemeContext } from "./ThemeContext.jsx";

/**
 * ThemeProvider lives in its own file so that ThemeContext.jsx exports NO
 * components. react-refresh/only-export-components was flagging the old
 * arrangement, and the rule is pointing at something real: Vite's Fast Refresh
 * can only hot-swap a module whose exports are all components. A file mixing
 * `ThemeProvider` with the `useTheme` hook forces a full page reload on every
 * edit — and because this provider sits at the app root, that reload wiped the
 * whole tree's state on any theme-file save.
 *
 * The split is one-directional: the provider imports the context, never the
 * reverse, so the 21 modules importing useTheme keep their existing paths.
 */
export function ThemeProvider({ children }) {
  // 1. Initialize state from localStorage or system preference
  const [dark, setDark] = useState(() => {
    // Check if we are in a browser environment
    if (typeof window !== "undefined") {
      const savedTheme = localStorage.getItem("theme");
      if (savedTheme) return savedTheme === "dark";

      // If no saved theme, check system preference
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return true; // Default fallback
  });

  // 2. Sync theme changes with LocalStorage and the HTML class
  useEffect(() => {
    const root = window.document.documentElement;
    if (dark) {
      root.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      root.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [dark]);

  // 3. Memoize the context value to prevent unnecessary re-renders
  const value = useMemo(
    () => ({
      dark,
      toggle: () => setDark((prev) => !prev),
    }),
    [dark],
  );

  return (
    <ThemeContext.Provider value={value}>
      {/* No wrapper <div>: Tailwind's 'dark' class is applied to <html>
          (see the effect above), which is where it has to be for global styles. */}
      {children}
    </ThemeContext.Provider>
  );
}
