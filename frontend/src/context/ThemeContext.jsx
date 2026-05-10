import { createContext, useContext, useState, useEffect, useMemo } from "react";

const ThemeContext = createContext();

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
  const value = useMemo(() => ({
    dark,
    toggle: () => setDark(prev => !prev)
  }), [dark]);

  return (
    <ThemeContext.Provider value={value}>
      {/* We remove the wrapper <div> here because Tailwind's 'dark' class 
         works best on the <html> or <body> level for global styles.
      */}
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}