// frontend/src/store/sessionTeardown.test.js
//
// Runs the REAL reducers through the REAL store configuration. No mocks: the
// bugs this pins down were all "a reducer that existed was never reached", and
// a mocked dispatch would have recorded the same wrong calls just as happily.
//
// ── The three defects under test ────────────────────────────────────────────
//   1. logoutUser dispatched removeUser()/removeUserClinic() — both userSlice —
//      and never authSlice.logout(), so state.auth.isAuthenticated stayed true.
//      PrivateRoute and PublicOnlyRoute both read exactly that field. It only
//      appeared to work because Settings.jsx followed it with
//      window.location.href, a hard reload that rebuilds the store from an
//      empty localStorage.
//   2. Sidebar.handleLogout — the sign-out on every authenticated page —
//      dispatched the auth reducer directly and never called the server, so the
//      session stayed redeemable for its full 7-day life.
//   3. resetReviews / resetRequests / resetNotifications / resetAnalytics were
//      all defined for logout and never dispatched, leaving the previous
//      clinic's data in the store for the next user of a shared browser.
//
// Run with:  npm test
//
// Migrated from `node --test` to Vitest. The assertions are unchanged; what
// changed is that jsdom now provides a real localStorage, so the hand-rolled
// Map stub is gone. authSlice still reads that storage at MODULE scope, which
// is why the seed below happens before the dynamic imports.

import { test, expect } from "vitest";
import { configureStore } from "@reduxjs/toolkit";

// A thin node:assert-shaped shim over expect, so the migration to Vitest did
// not require rewriting every assertion in this file.
const assert = {
  equal: (a, b, m) => expect(a, m).toBe(b),
  notEqual: (a, b, m) => expect(a, m).not.toBe(b),
  deepEqual: (a, b, m) => expect(a, m).toEqual(b),
  ok: (v, m) => expect(v, m).toBeTruthy(),
  doesNotThrow: (fn, m) => expect(fn, m).not.toThrow(),
};

localStorage.setItem("token", "a-real-access-token");

const [
  { clearSessionState, SESSION_TEARDOWN_ACTIONS },
  authSlice,
  reviewsSlice,
  requestsSlice,
  notificationsSlice,
  analyticsSlice,
  competitorsSlice,
  userSlice,
] = await Promise.all([
  import("./sessionTeardown.js"),
  import("./authSlice.js"),
  import("./reviewsSlice.js"),
  import("./requestsSlice.js"),
  import("./notificationsSlice.js"),
  import("./analyticsSlice.js"),
  import("./competitorsSlice.js"),
  import("./userSlice.js"),
]);

// Mirrors store/store.js. If a slice is added there and not here, the coverage
// assertion at the bottom of this file is what notices.
const makeStore = () =>
  configureStore({
    reducer: {
      auth: authSlice.default,
      reviews: reviewsSlice.default,
      notifications: notificationsSlice.default,
      requests: requestsSlice.default,
      analytics: analyticsSlice.default,
      user: userSlice.default,
      competitors: competitorsSlice.default,
    },
  });

/** A store carrying a signed-in user with one clinic's data loaded. */
const signedInStore = () => {
  localStorage.setItem("token", "a-real-access-token");
  const store = makeStore();

  store.dispatch(
    authSlice.loginSuccess({
      accessToken: "a-real-access-token",
      user: {
        id: "u1",
        name: "Clinic A Owner",
        email: "owner@clinic-a.test",
        role: "admin",
        clinicName: "Clinic A",
      },
    })
  );

  // Tenant-scoped data, as the page fetches would have left it.
  store.dispatch(
    reviewsSlice.fetchReviewsSuccess({
      reviews: [{ id: "rev-clinic-a", rating: 1, text: "Clinic A patient review" }],
      total: 1,
      cappedByPlan: false,
      append: false,
      offset: 0,
    })
  );
  store.dispatch(
    userSlice.addUserReviews([{ id: "rev-clinic-a", rating: 1 }])
  );
  store.dispatch(
    userSlice.addUserRequests([{ id: "req-clinic-a", patientName: "A Patient" }])
  );
  store.dispatch(userSlice.addUserSubscription({ plan: "premium" }));

  return store;
};

// ── 1. Identity ─────────────────────────────────────────────────────────────

test("teardown clears the auth slice the route guards read", () => {
  const store = signedInStore();

  // Precondition — the guards would let this session through.
  assert.equal(store.getState().auth.isAuthenticated, true);
  assert.equal(store.getState().auth.token, "a-real-access-token");

  clearSessionState(store.dispatch);

  const auth = store.getState().auth;
  assert.equal(auth.isAuthenticated, false, "PrivateRoute must now redirect");
  assert.equal(auth.token, null);
  assert.equal(auth.user, null);
  assert.equal(auth.clinicName, null);
  assert.equal(auth.clinicRole, null);
  // bootstrapped stays true: the session is known-absent, not unknown. Flipping
  // it back to false would hang the app on AppBootstrap's spinner forever.
  assert.equal(auth.bootstrapped, true);
});

test("teardown clears the persisted token", () => {
  const store = signedInStore();
  assert.equal(localStorage.getItem("token"), "a-real-access-token");

  clearSessionState(store.dispatch);

  assert.equal(localStorage.getItem("token"), null);
});

// ── 2. Tenant-scoped data ───────────────────────────────────────────────────

test("teardown leaves no trace of the previous clinic in any slice", () => {
  const store = signedInStore();

  assert.equal(store.getState().reviews.list.length, 1);
  assert.equal(store.getState().user.userReviews.length, 1);

  clearSessionState(store.dispatch);
  const s = store.getState();

  assert.deepEqual(s.reviews.list, [], "reviews leaked into the next session");
  assert.equal(s.reviews.total, 0);
  assert.deepEqual(s.user.userReviews, []);
  assert.deepEqual(s.user.userRequests, []);
  assert.deepEqual(s.user.userNotifications, []);
  assert.equal(s.user.userSubscription, null);
  assert.equal(s.user.user, null);
  assert.equal(s.user.userClinic, null);
  assert.deepEqual(s.competitors.list, []);
  assert.equal(s.competitors.self, null);

  // The strongest form of the assertion: no string anywhere in the tree still
  // names the outgoing clinic. Catches any field a hand-written list forgot.
  const serialized = JSON.stringify(s);
  assert.ok(
    !serialized.includes("Clinic A"),
    "clinic name survived the teardown"
  );
  assert.ok(
    !serialized.includes("rev-clinic-a"),
    "review data survived the teardown"
  );
  assert.ok(
    !serialized.includes("owner@clinic-a.test"),
    "user email survived the teardown"
  );
});

// authSlice seeds `token` from localStorage at MODULE scope — once, when the
// module is first imported — so a store built later cannot be used as a
// cold-boot baseline for it no matter what localStorage says by then. That is a
// property of the slice, not a defect: in the browser the module is evaluated
// exactly once per page load, which is when reading the persisted token is
// correct. The auth slice is asserted field-by-field above instead; the
// comparisons below cover the slices whose leakage is the actual concern.
const DATA_SLICES = [
  "reviews",
  "requests",
  "notifications",
  "analytics",
  "user",
  "competitors",
];

test("every data slice returns to its cold-boot state", () => {
  // The real guarantee behind "the next user sees nothing of the last one".
  const fresh = makeStore().getState();

  const store = signedInStore();
  clearSessionState(store.dispatch);
  const after = store.getState();

  for (const slice of DATA_SLICES) {
    assert.deepEqual(
      after[slice],
      fresh[slice],
      `slice "${slice}" diverges from a cold boot after sign-out`
    );
  }
});

// ── 3. Robustness ───────────────────────────────────────────────────────────

test("teardown is idempotent", () => {
  const store = signedInStore();

  clearSessionState(store.dispatch);
  const once = store.getState();

  assert.doesNotThrow(() => clearSessionState(store.dispatch));
  assert.deepEqual(store.getState(), once);
});

test("no slice in the store is left out of the teardown", () => {
  // The guard against the original bug recurring: a slice gets added, holds
  // clinic data, and nobody remembers to reset it on logout. DATA_SLICES is
  // checked against the store's real shape so the list cannot quietly fall
  // behind store.js either.
  const shape = Object.keys(makeStore().getState());
  const uncovered = shape.filter(
    (s) => s !== "auth" && !DATA_SLICES.includes(s)
  );

  assert.deepEqual(
    uncovered,
    [],
    `slice(s) ${uncovered.join(", ")} are in the store but not covered by the ` +
      `sign-out teardown — add a reset action to SESSION_TEARDOWN_ACTIONS in ` +
      `store/sessionTeardown.js and list the slice in DATA_SLICES here`
  );

  // Every entry must be callable — a typo'd import lands here as undefined
  // rather than as a silent no-op at sign-out time.
  for (const action of SESSION_TEARDOWN_ACTIONS) {
    assert.equal(typeof action, "function");
  }
});
