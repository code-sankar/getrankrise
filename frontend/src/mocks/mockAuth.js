// frontend/src/mocks/mockAuth.js
//
// Shared constants for the demo/mock login. Used by both the login form
// (to recognise the demo credentials) and AppBootstrap (to keep the demo
// session alive across refreshes without calling the backend).
//
// To disable demo login entirely, remove the short-circuit block in
// components/Auth/Login.jsx and the isMockToken() branch in AppBootstrap.jsx.

// Type these on the sign-in page to log in without a backend:
export const DEMO_EMAIL    = "demo@getrankrise.com";
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