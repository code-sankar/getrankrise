// backend/tests/subscriptionState.test.js
//
// toSubscriptionState is the single place that decides what plan a clinic is
// on, and every limit in the product is read from the `limits` object it
// returns. It is a pure function, so this suite needs no database.
//
// The cancellation cases are the ones that matter: a canceled subscription
// used to keep plan_type "premium" forever, which left an ex-customer with
// Premium's storedReviewsLimit of Infinity long after they stopped paying.

import test from "node:test";
import assert from "node:assert/strict";
import { toSubscriptionState } from "../src/services/subscription/subscriptionState.service.js";

const future = () => new Date(Date.now() + 86400e3);
const past = () => new Date(Date.now() - 86400e3);

test("no subscription row means Free and in good standing", () => {
  const s = toSubscriptionState(null);
  assert.equal(s.plan, "free");
  assert.equal(s.isActive, true);
  assert.equal(s.exists, false);
  assert.equal(s.limits.storedReviewsLimit, 20);
});

test("an active paid subscription keeps its plan and limits", () => {
  const s = toSubscriptionState({
    planType: "premium",
    subscriptionStatus: "active",
    currentPeriodEnd: future(),
  });
  assert.equal(s.plan, "premium");
  assert.equal(s.isActive, true);
  assert.equal(s.limits.storedReviewsLimit, Infinity);
});

test("past_due keeps the plan but loses good standing", () => {
  // Recoverable: the customer fixes their card and the same plan resumes.
  // Downgrading here would delete their data access over a failed charge.
  const s = toSubscriptionState({
    planType: "premium",
    subscriptionStatus: "past_due",
    currentPeriodEnd: future(),
  });
  assert.equal(s.plan, "premium");
  assert.equal(s.isActive, false);
});

test("paused behaves like past_due — recoverable, not terminal", () => {
  const s = toSubscriptionState({
    planType: "starter",
    subscriptionStatus: "paused",
    currentPeriodEnd: future(),
  });
  assert.equal(s.plan, "starter");
  assert.equal(s.isActive, false);
});

test("canceled but still inside the paid period keeps the plan AND access", () => {
  // They paid through the end of the period; taking it away early is the
  // worse of the two available mistakes.
  const s = toSubscriptionState({
    planType: "premium",
    subscriptionStatus: "canceled",
    currentPeriodEnd: future(),
  });
  assert.equal(s.plan, "premium");
  assert.equal(s.isActive, true);
  assert.equal(s.inCancellationGrace, true);
});

test("canceled with the paid period spent drops to Free", () => {
  const s = toSubscriptionState({
    planType: "premium",
    subscriptionStatus: "canceled",
    currentPeriodEnd: past(),
  });
  assert.equal(s.plan, "free");
  assert.equal(s.isActive, false);
  assert.equal(s.inCancellationGrace, false);
  assert.equal(s.limits.storedReviewsLimit, 20, "must lose unlimited stored reviews");
  assert.equal(s.storedPlan, "premium", "the raw row value stays visible for admin reads");
});

test("canceled with no known period end is effective immediately", () => {
  const s = toSubscriptionState({
    planType: "premium",
    subscriptionStatus: "canceled",
    currentPeriodEnd: null,
  });
  assert.equal(s.plan, "free");
  assert.equal(s.isActive, false);
});

test("the expiry boundary is evaluated against the injected clock", () => {
  const end = new Date("2026-06-01T00:00:00Z");
  const row = { planType: "premium", subscriptionStatus: "canceled", currentPeriodEnd: end };

  const before = toSubscriptionState(row, { now: end.getTime() - 1000 });
  assert.equal(before.plan, "premium", "one second before expiry they still have it");

  const after = toSubscriptionState(row, { now: end.getTime() + 1000 });
  assert.equal(after.plan, "free", "one second after expiry they do not");
});
