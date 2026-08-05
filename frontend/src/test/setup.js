// frontend/src/test/setup.js
//
// Runs before every test file. Everything here exists because a real browser
// provides it and jsdom does not — nothing in this file changes application
// behaviour, it only stops the environment from being the reason a test fails.

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

// ── localStorage ────────────────────────────────────────────────────────────
// jsdom ships one, but tests need it EMPTY between files: authSlice reads
// `token` at module scope, so a value left behind by an earlier test would
// silently change the next file's initial state.
beforeEach(() => {
  window.localStorage.clear();
});

// ── Unmount between tests ───────────────────────────────────────────────────
// Without this, effects from a previous test keep running and can resolve a
// fetch into a component that the current test also rendered — which surfaces
// as an impossible failure in whichever test happens to be slowest.
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ── window.location ─────────────────────────────────────────────────────────
// The axios interceptor does `window.location.href = "/login"` on a hard auth
// failure. jsdom implements that as a real navigation and logs
// "Not implemented: navigation" to stderr on every occurrence, which buries
// real output. Replacing it with a plain writable property also makes the
// assignment ASSERTABLE — "did this redirect?" is exactly what the interceptor
// tests need to check.
const locationStub = {
  href: "http://localhost:3000/",
  pathname: "/",
  search: "",
  assign: vi.fn(),
  replace: vi.fn(),
  reload: vi.fn(),
};

Object.defineProperty(window, "location", {
  value: locationStub,
  writable: true,
  configurable: true,
});

/** Resets the stub and points it at a path, for tests that care about route. */
export function setLocation(pathname = "/", search = "") {
  locationStub.href = `http://localhost:3000${pathname}${search}`;
  locationStub.pathname = pathname;
  locationStub.search = search;
}

beforeEach(() => setLocation("/"));

// ── matchMedia ──────────────────────────────────────────────────────────────
// ThemeProvider reads it; jsdom has no implementation at all, so any component
// rendered inside the provider throws without this.
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}

// ── confirm ─────────────────────────────────────────────────────────────────
// TeamTab and Settings guard destructive actions with it. jsdom's version
// returns undefined and warns; default to true so the action under test
// actually runs, and let individual tests override to assert the cancel path.
window.confirm = vi.fn(() => true);
