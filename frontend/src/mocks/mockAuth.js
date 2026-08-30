// frontend/src/mocks/mockAuth.js
//
// Shared constants for the demo/mock login. Used by both the login form
// (to recognise the demo credentials) and AppBootstrap (to keep the demo
// session alive across refreshes without calling the backend).
//
// PRODUCTION SAFETY: every consumer guards its demo branch with DEMO_AUTH_ENABLED
// (false in `vite build`). Those branches are statically dead in production, so
// Vite strips them and these constants tree-shake out — the demo credentials
// never reach the production bundle. Do not reference the constants below
// outside an `if (DEMO_AUTH_ENABLED)` / `import.meta.env.DEV` guard, or you'll
// pull them back into the prod build.

// true in `vite dev`, false in `vite build`. Single source of truth for the gate.
export const DEMO_AUTH_ENABLED = import.meta.env.DEV;

// Type these on the sign-in page to log in without a backend:
export const DEMO_EMAIL    = "demo@kirtify.com";
export const DEMO_PASSWORD = "demo1234";

// Sentinel token. AppBootstrap treats this value as "this is a demo session,
// don't bother hitting /auth/me".
export const MOCK_TOKEN = "mock-token";

// The fake user the demo session logs in as. Edit freely.
export const MOCK_USER = {
  id:         "mock-user-id",
  name:       "Demo Owner",
  email:      DEMO_EMAIL,
  role:       "admin",
  clinicName: "Demo Clinic",
};

export const isMockToken = (token) => token === MOCK_TOKEN;