import { createContext, useContext } from "react";

/**
 * The theme context and its consumer hook — NO components in this file.
 *
 * ThemeProvider used to live here too. react-refresh/only-export-components
 * flagged that, and the rule was right: Fast Refresh can only hot-swap a module
 * whose exports are all components, so mixing the provider with this hook meant
 * every edit to theme code triggered a full page reload and blew away app state.
 * The provider now lives in ThemeProvider.jsx and imports from here.
 *
 * Kept at this path (and this filename) on purpose: 21 modules import useTheme
 * from it, and none of them needed to change.
 */
export const ThemeContext = createContext();

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
