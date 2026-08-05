// backend/tests/quotaError.test.js
//
// quotaError() translates a refused reserveCredits() result into the HTTP
// response the frontend's axios interceptor pattern-matches. Every branch is a
// `reason` that reserveCredits can actually return — and one of them was
// missing, which is why this file exists.
//
// ── The bug this pins down ─────────────────────────────────────────────────
// reserveCredits' SUBSCRIPTION_INACTIVE result carries { currentPlan,
// subscriptionStatus } and NO `channel` — the status check runs after the
// limit check, so it has no channel context to report. quotaError had no
// branch for it, so the QUOTA_EXCEEDED fall-through evaluated
// `r.channel.toUpperCase()` on undefined and threw a TypeError. sendRequest's
// outer catch turned that into a 500.
//
// Who hit it: only PAYING customers. A Free clinic is caught earlier by
// `limit === 0` → PLAN_DOES_NOT_INCLUDE_CHANNEL, so reaching the inactive
// branch requires a paid plan whose subscription went past_due or paused.
// They clicked Send and got "Server error. Please try again later." instead of
// the one sentence that would have let them fix it.
//
// ── Why the fixtures are built by calling reserveCredits ───────────────────
// A hand-written `{ reason: "SUBSCRIPTION_INACTIVE", ... }` literal would test
// this file's idea of the contract rather than the contract. These fixtures are
// the real return values from the real function against real Postgres, so if
// someone later adds a field to one of those branches — or removes `channel`
// from another — this test sees it.

import test from "node:test";
import assert from "node:assert/strict";
import {
  setupDatabase,
  teardownDatabase,
  resetData,
  createClinic,
} from "./helpers/db.js";
import { sequelize } from "../src/config/db.js";
import { reserveCredits } from "../src/services/credits/credits.service.js";
import { quotaError } from "../src/controllers/request.controller.js";

test.before(setupDatabase);
test.after(teardownDatabase);
test.beforeEach(resetData);

// Minimal res double: records what the controller would have sent.
const makeRes = () => {
  const sent = {};
  return {
    sent,
    status(code) {
      sent.status = code;
      return {
        json(body) {
          sent.body = body;
          return sent;
        },
      };
    },
  };
};

// ── The regression ──────────────────────────────────────────────────────────

for (const status of ["past_due", "paused"]) {
  test(`a ${status} paid clinic gets 403 SUBSCRIPTION_INACTIVE, not a 500`, async () => {
    // A PAID plan is required to reach this branch at all: on Free,
    // smsPerMonth is 0 and the limit check short-circuits first.
    const { clinicId } = await createClinic({ plan: "premium", status });

    const r = await reserveCredits({ clinicId, channel: "sms" });

    // Precondition: this is the shape that used to blow up.
    assert.equal(r.reserved, false);
    assert.equal(r.reason, "SUBSCRIPTION_INACTIVE");
    assert.equal(r.channel, undefined, "the inactive branch carries no channel");

    const res = makeRes();
    // Before the fix this line threw:
    //   TypeError: Cannot read properties of undefined (reading 'toUpperCase')
    assert.doesNotThrow(() => quotaError(res, r));

    assert.equal(res.sent.status, 403);
    assert.equal(res.sent.body.code, "SUBSCRIPTION_INACTIVE");
    assert.equal(res.sent.body.subscriptionStatus, status);
    // The message has to name the problem — this is the whole point of the
    // branch. A customer who cannot tell a declined card from an outage will
    // not go and update their card.
    assert.match(res.sent.body.message, new RegExp(status));
    assert.match(res.sent.body.message, /payment method/i);
    assert.ok(!/undefined/.test(res.sent.body.message));
  });
}

// ── The branches that already worked, so the fix cannot regress them ────────

test("a free clinic gets 403 UPGRADE_REQUIRED naming the channel", async () => {
  const { clinicId } = await createClinic({ plan: "free" }); // smsPerMonth 0
  const r = await reserveCredits({ clinicId, channel: "sms" });

  assert.equal(r.reason, "PLAN_DOES_NOT_INCLUDE_CHANNEL");

  const res = makeRes();
  quotaError(res, r);

  assert.equal(res.sent.status, 403);
  assert.equal(res.sent.body.code, "UPGRADE_REQUIRED");
  assert.match(res.sent.body.message, /SMS/);
  assert.deepEqual(res.sent.body.requiredPlans, ["starter", "premium"]);
});

test("an exhausted plan gets 403 QUOTA_EXCEEDED naming the limit", async () => {
  const { clinicId } = await createClinic({ plan: "starter" }); // 50 SMS
  await sequelize.query(
    `UPDATE subscriptions SET sms_credits_used = 50 WHERE clinic_id = $1::uuid`,
    { bind: [clinicId] }
  );

  const r = await reserveCredits({ clinicId, channel: "sms" });
  assert.equal(r.reason, "QUOTA_EXCEEDED");

  const res = makeRes();
  quotaError(res, r);

  assert.equal(res.sent.status, 403);
  assert.equal(res.sent.body.code, "QUOTA_EXCEEDED");
  assert.match(res.sent.body.message, /50 SMS credits/);
});

test("a missing subscriptions row is a 500 that says so, not a crash", async () => {
  const res = makeRes();
  quotaError(res, { reserved: false, reason: "NO_SUBSCRIPTION" });

  assert.equal(res.sent.status, 500);
  assert.match(res.sent.body.message, /billing information/i);
});

test("an unknown reason with no channel still renders a message", async () => {
  // Defence in depth: if a future reserveCredits branch also omits `channel`,
  // the caller gets a wrong-but-readable sentence rather than a 500.
  const res = makeRes();
  assert.doesNotThrow(() =>
    quotaError(res, { reserved: false, reason: "SOMETHING_NEW", limit: 10 })
  );
  assert.equal(res.sent.status, 403);
  assert.ok(!/undefined/.test(res.sent.body.message));
});
