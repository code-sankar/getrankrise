// backend/tests/credits.test.js
//
// The reserve-before-send guarantee. This is the invariant that decides whether
// a clinic can be billed for more messages than their plan allows, so it is the
// first thing worth a test.
//
// The header of credits.service.js claims the reservation is race-safe because
// check and write happen in ONE statement. That claim is only worth anything if
// something actually runs concurrent reservations against a real server, which
// is what the concurrency test below does.

import test from "node:test";
import assert from "node:assert/strict";
import {
  setupDatabase,
  teardownDatabase,
  resetData,
  createClinic,
  creditsFor,
} from "./helpers/db.js";
import {
  reserveCredits,
  refundCredits,
  getCreditSummary,
} from "../src/services/credits/credits.service.js";

test.before(setupDatabase);
test.after(teardownDatabase);
test.beforeEach(resetData);

test("reserves a credit and reports the remaining balance", async () => {
  const { clinicId } = await createClinic({ plan: "premium" }); // 500 SMS

  const r = await reserveCredits({ clinicId, channel: "sms" });

  assert.equal(r.reserved, true);
  assert.equal(r.used, 1);
  assert.equal(r.limit, 500);
  assert.equal(r.remaining, 499);
  assert.equal((await creditsFor(clinicId)).sms, 1);
});

test("refuses a channel the plan does not include", async () => {
  // Starter has smsPerMonth 50 but whatsAppPerMonth 0.
  const { clinicId } = await createClinic({ plan: "starter" });

  const r = await reserveCredits({ clinicId, channel: "whatsapp" });

  assert.equal(r.reserved, false);
  assert.equal(r.reason, "PLAN_DOES_NOT_INCLUDE_CHANNEL");
  assert.equal((await creditsFor(clinicId)).whatsapp, 0);
});

test("refuses when the subscription is not in good standing", async () => {
  const { clinicId } = await createClinic({ plan: "premium", status: "past_due" });

  const r = await reserveCredits({ clinicId, channel: "sms" });

  assert.equal(r.reserved, false);
  assert.equal(r.reason, "SUBSCRIPTION_INACTIVE");
  assert.equal((await creditsFor(clinicId)).sms, 0);
});

test("reports NO_SUBSCRIPTION rather than throwing when the row is missing", async () => {
  // request.controller.js's quotaError() has a dedicated branch for this; if
  // the shape changes it renders "You've used all undefined SMS credits".
  const r = await reserveCredits({
    clinicId: "00000000-0000-4000-8000-000000000000",
    channel: "sms",
  });

  assert.equal(r.reserved, false);
  assert.equal(r.reason, "NO_SUBSCRIPTION");
});

test("a NULL current_period_start does not block reservation", async () => {
  // Paddle omits current_billing_period on trialing subscriptions and on
  // several subscription.updated payloads. A NULL there once made the whole
  // WHERE predicate NULL, so a premium clinic with used=0 was told it had
  // spent all 500 credits. The COALESCE in the reserve SQL is what fixes it.
  const { clinicId } = await createClinic({
    plan: "premium",
    periodStart: null,
    periodEnd: null,
  });

  const r = await reserveCredits({ clinicId, channel: "sms" });

  assert.equal(r.reserved, true, "NULL period start must not disqualify the row");
  assert.equal(r.used, 1);
});

test("CONCURRENCY: 60 parallel reservations against a 50-credit plan grant exactly 50", async () => {
  // The whole point of the single-statement UPDATE. If check and write were
  // separate, more than `limit` of these would pass and the clinic would be
  // billed for messages the plan does not cover.
  const { clinicId } = await createClinic({ plan: "starter" }); // 50 SMS

  const results = await Promise.all(
    Array.from({ length: 60 }, () => reserveCredits({ clinicId, channel: "sms" }))
  );

  const granted = results.filter((r) => r.reserved).length;
  const refused = results.filter((r) => !r.reserved);

  assert.equal(granted, 50, "exactly the plan limit may be granted");
  assert.equal(refused.length, 10);
  assert.ok(
    refused.every((r) => r.reason === "QUOTA_EXCEEDED"),
    "over-limit reservations must report QUOTA_EXCEEDED"
  );

  // And the stored counter must agree with what was handed out — an
  // over-count here would mean credits were consumed without being granted.
  assert.equal((await creditsFor(clinicId)).sms, 50);
});

test("refund returns a credit and never drops below zero", async () => {
  const { clinicId } = await createClinic({ plan: "premium" });

  await reserveCredits({ clinicId, channel: "sms" });
  await refundCredits({ clinicId, channel: "sms" });
  assert.equal((await creditsFor(clinicId)).sms, 0);

  // Refunding again must floor at 0, not go negative — a negative counter
  // would hand the clinic free credits for the rest of the period.
  await refundCredits({ clinicId, channel: "sms" });
  assert.equal((await creditsFor(clinicId)).sms, 0);
});

test("summary reports zero once the billing period has rolled forward", async () => {
  const { clinicId } = await createClinic({
    plan: "premium",
    periodStart: new Date(Date.now() + 86400e3), // period starts in the future
  });
  await creditsFor(clinicId);

  const summary = await getCreditSummary(clinicId);
  assert.equal(summary.sms.used, 0);
  assert.equal(summary.sms.remaining, 500);
});
