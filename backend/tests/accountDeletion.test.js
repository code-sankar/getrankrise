// backend/tests/accountDeletion.test.js
//
// Deletion is irreversible and touches every table in the schema, so the things
// worth proving are the ones nobody can check by looking:
//
//   * an owner's deletion really removes EVERY row, in every table, for that
//     clinic — the cascades are asserted, not assumed
//   * it removes nothing belonging to any OTHER clinic
//   * a staff member's deletion takes their account and NOTHING of the clinic's
//   * billing is cancelled BEFORE any data is destroyed, and a cancel failure
//     aborts the whole thing
//   * neither gate (password, typed confirmation) can be skipped
//
// The billing test is the one that matters most. Deleting the subscriptions row
// before Paddle has actually cancelled would destroy the only pointer to the
// thing still charging the customer's card.

process.env.EMAIL_SIMULATE = "true";

import test from "node:test";
import assert from "node:assert/strict";
import { QueryTypes } from "sequelize";
import { setupDatabase, teardownDatabase, resetData, createClinic } from "./helpers/db.js";
import { sequelize } from "../src/config/db.js";
import { hashPassword } from "../src/utils/hash.js";

test.before(setupDatabase);
test.after(teardownDatabase);
test.beforeEach(resetData);

const PASSWORD = "correct-horse-battery";

const makeRes = () => {
  const sent = { status: 200 };
  const capture = (body) => {
    sent.body = body;
    return sent;
  };
  return {
    sent,
    status(code) {
      sent.status = code;
      return { json: capture, send: capture };
    },
    json: capture,
    send: capture,
    setHeader(k, v) {
      (sent.headers ||= {})[k] = v;
    },
    clearCookie() {},
    cookie() {},
  };
};

const makeReq = ({ user, clinic, clinicRole = "owner", body = {} }) => ({
  user,
  clinic,
  clinicRole,
  body,
  params: {},
  query: {},
  ip: "127.0.0.1",
  get: () => "node-test",
});

// refresh_tokens.token_hash and clinic_invitations.token_hash are both UNIQUE,
// so a fixture that hardcodes repeat('a', 64) can only ever be used once per
// test. Seeding two clinics in one test is exactly what the cross-tenant
// assertion needs, hence the counter.
let seedCounter = 0;
const uniqueHash = (label) =>
  `${label}${String(++seedCounter).padStart(4, "0")}`.padEnd(64, "0").slice(0, 64);

/** A clinic with a real password, plus one row in every child table. */
async function seedFullClinic({ plan = "premium", email } = {}) {
  const { clinicId, userId } = await createClinic({ plan, email });

  await sequelize.query(`UPDATE users SET password = $2 WHERE id = $1::uuid`, {
    bind: [userId, await hashPassword(PASSWORD)],
  });

  const [clinic] = await sequelize.query(
    `SELECT id, clinic_name AS "clinicName" FROM clinics WHERE id = $1::uuid`,
    { bind: [clinicId], type: QueryTypes.SELECT }
  );
  const [user] = await sequelize.query(
    `SELECT id, name, email FROM users WHERE id = $1::uuid`,
    { bind: [userId], type: QueryTypes.SELECT }
  );

  // One row in every table that hangs off a clinic, so the cascade assertions
  // are testing something rather than counting zeros.
  await sequelize.query(
    `INSERT INTO reviews (id, clinic_id, platform, external_id, reviewer_name, rating,
                          review_text, review_date, replied, sentiment, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, 'Google', 'ext-1', 'A Patient', 2,
             'not great', NOW(), false, -1, NOW(), NOW())`,
    { bind: [clinicId], type: QueryTypes.INSERT }
  );
  await sequelize.query(
    `INSERT INTO requests (id, clinic_id, patient_name, phone, send_via, status,
                           message_body, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, 'A Patient', '+15551234567', 'SMS', 'Sent', 'hi', NOW(), NOW())`,
    { bind: [clinicId], type: QueryTypes.INSERT }
  );
  const [campaign] = await sequelize.query(
    `INSERT INTO campaigns (clinic_id, name, channel, status, message_template)
     VALUES ($1::uuid, 'Spring', 'SMS', 'draft', 'hello {{name}}') RETURNING id`,
    { bind: [clinicId], type: QueryTypes.SELECT }
  );
  await sequelize.query(
    `INSERT INTO campaign_recipients (campaign_id, clinic_id, name, phone, status)
     VALUES ($1::uuid, $2::uuid, 'A Patient', '+15551234567', 'pending')`,
    { bind: [campaign.id, clinicId], type: QueryTypes.INSERT }
  );
  const [competitor] = await sequelize.query(
    `INSERT INTO competitors (id, clinic_id, name, platform, is_active, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, 'Rival Dental', 'Google', true, NOW(), NOW())
     RETURNING id`,
    { bind: [clinicId], type: QueryTypes.SELECT }
  );
  await sequelize.query(
    `INSERT INTO competitor_snapshots (id, competitor_id, rating, total_reviews,
                                       new_reviews, rating_delta, response_rate, sentiment,
                                       captured_at, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, 4.2, 100, 3, 0.1, 50, 70, NOW(), NOW(), NOW())`,
    { bind: [competitor.id], type: QueryTypes.INSERT }
  );
  await sequelize.query(
    `INSERT INTO platform_connections (clinic_id, platform, status)
     VALUES ($1::uuid, 'google', 'connected')`,
    { bind: [clinicId], type: QueryTypes.INSERT }
  );
  await sequelize.query(
    `INSERT INTO usage_counters (clinic_id, metric, period_start, used)
     VALUES ($1::uuid, 'ai_reply', CURRENT_DATE, 3)`,
    { bind: [clinicId], type: QueryTypes.INSERT }
  );
  await sequelize.query(
    `INSERT INTO opt_outs (clinic_id, phone, source) VALUES ($1::uuid, '+15559999999', 'manual')`,
    { bind: [clinicId], type: QueryTypes.INSERT }
  );
  await sequelize.query(
    `INSERT INTO clinic_invitations (clinic_id, email, role, token_hash, expires_at)
     VALUES ($1::uuid, $2, 'staff', $3::char(64), NOW() + INTERVAL '7 days')`,
    { bind: [clinicId, `invitee-${seedCounter}@example.com`, uniqueHash("inv")], type: QueryTypes.INSERT }
  );
  await sequelize.query(
    `INSERT INTO notifications (id, user_id, type, message, read, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, 'urgent', 'New 2-star review', false, NOW(), NOW())`,
    { bind: [userId], type: QueryTypes.INSERT }
  );
  await sequelize.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1::uuid, $2::char(64), NOW() + INTERVAL '7 days')`,
    { bind: [userId, uniqueHash("ref")], type: QueryTypes.INSERT }
  );

  return { clinicId, userId, clinic, user };
}

/** Adds a staff member with a known password. */
async function addStaff(clinicId, email = "staff@example.com") {
  const [u] = await sequelize.query(
    `INSERT INTO users (id, name, email, password, role, is_active, created_at, updated_at)
     VALUES (gen_random_uuid(), 'Staffer', $1, $2, 'admin', true, NOW(), NOW())
     RETURNING id, name, email`,
    { bind: [email, await hashPassword(PASSWORD)], type: QueryTypes.SELECT }
  );
  await sequelize.query(
    `INSERT INTO clinic_members (clinic_id, user_id, role)
     VALUES ($1::uuid, $2::uuid, 'staff'::clinic_role_enum)`,
    { bind: [clinicId, u.id], type: QueryTypes.INSERT }
  );
  await sequelize.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1::uuid, $2::char(64), NOW() + INTERVAL '7 days')`,
    { bind: [u.id, uniqueHash("stf")], type: QueryTypes.INSERT }
  );
  return u;
}

const countFor = async (table, clinicId) => {
  const [r] = await sequelize.query(
    `SELECT COUNT(*)::int AS n FROM ${table} WHERE clinic_id = $1::uuid`,
    { bind: [clinicId], type: QueryTypes.SELECT }
  );
  return r.n;
};

const CLINIC_TABLES = [
  "reviews",
  "requests",
  "campaigns",
  "campaign_recipients",
  "competitors",
  "platform_connections",
  "usage_counters",
  "opt_outs",
  "clinic_invitations",
  "clinic_members",
  "subscriptions",
];

// ── The gates ───────────────────────────────────────────────────────────────

test("a wrong password deletes nothing", async () => {
  const { clinicId, clinic, user } = await seedFullClinic();
  const { deleteAccount } = await import("../src/controllers/account.controller.js");

  const res = makeRes();
  await deleteAccount(
    makeReq({ user, clinic, body: { password: "wrong", confirm: clinic.clinicName } }),
    res
  );

  assert.equal(res.sent.status, 400);
  assert.match(res.sent.body.message, /password is incorrect/i);
  assert.equal(await countFor("reviews", clinicId), 1, "data was touched");
});

test("a wrong confirmation string deletes nothing", async () => {
  const { clinicId, clinic, user } = await seedFullClinic();
  const { deleteAccount } = await import("../src/controllers/account.controller.js");

  const res = makeRes();
  await deleteAccount(
    makeReq({ user, clinic, body: { password: PASSWORD, confirm: "yes delete it" } }),
    res
  );

  assert.equal(res.sent.status, 400);
  assert.match(res.sent.body.message, /type the clinic name/i);
  assert.equal(await countFor("reviews", clinicId), 1);
});

test("the confirmation is case- and whitespace-forgiving", async () => {
  // A confirmation of INTENT, not a spelling test.
  const { clinicId, clinic, user } = await seedFullClinic();
  const { deleteAccount } = await import("../src/controllers/account.controller.js");

  const res = makeRes();
  await deleteAccount(
    makeReq({
      user, clinic,
      body: { password: PASSWORD, confirm: `  ${clinic.clinicName.toUpperCase()}  ` },
    }),
    res
  );

  assert.equal(res.sent.status, 200);
  assert.equal(await countFor("reviews", clinicId), 0);
});

// ── An owner closing the clinic ─────────────────────────────────────────────

test("an owner's deletion removes every row in every table", async () => {
  const { clinicId, userId, clinic, user } = await seedFullClinic();
  await addStaff(clinicId);
  const { deleteAccount } = await import("../src/controllers/account.controller.js");

  // Precondition: there IS something in each of these.
  for (const t of CLINIC_TABLES) {
    assert.ok(await countFor(t, clinicId) > 0, `fixture left ${t} empty`);
  }

  const res = makeRes();
  await deleteAccount(
    makeReq({ user, clinic, body: { password: PASSWORD, confirm: clinic.clinicName } }),
    res
  );

  assert.equal(res.sent.status, 200, JSON.stringify(res.sent.body));
  assert.equal(res.sent.body.data.scope, "clinic");

  for (const t of CLINIC_TABLES) {
    assert.equal(await countFor(t, clinicId), 0, `${t} still has rows`);
  }

  // Transitive: snapshots hang off competitors, not off the clinic.
  const [snaps] = await sequelize.query(
    `SELECT COUNT(*)::int AS n FROM competitor_snapshots`,
    { type: QueryTypes.SELECT }
  );
  assert.equal(snaps.n, 0, "competitor snapshots survived");

  // The clinic itself, and both member accounts.
  const [clinics] = await sequelize.query(
    `SELECT COUNT(*)::int AS n FROM clinics WHERE id = $1::uuid`,
    { bind: [clinicId], type: QueryTypes.SELECT }
  );
  assert.equal(clinics.n, 0);

  const [users] = await sequelize.query(`SELECT COUNT(*)::int AS n FROM users`, {
    type: QueryTypes.SELECT,
  });
  assert.equal(users.n, 0, "member accounts survived the clinic deletion");

  // Sessions and notifications go with the users.
  for (const t of ["refresh_tokens", "notifications", "auth_tokens"]) {
    const [r] = await sequelize.query(`SELECT COUNT(*)::int AS n FROM ${t}`, {
      type: QueryTypes.SELECT,
    });
    assert.equal(r.n, 0, `${t} survived`);
  }
  void userId;
});

test("deleting one clinic leaves another clinic completely untouched", async () => {
  const a = await seedFullClinic({ email: "owner-a@example.com" });
  const b = await seedFullClinic({ email: "owner-b@example.com" });
  const { deleteAccount } = await import("../src/controllers/account.controller.js");

  const res = makeRes();
  await deleteAccount(
    makeReq({ user: a.user, clinic: a.clinic, body: { password: PASSWORD, confirm: a.clinic.clinicName } }),
    res
  );
  assert.equal(res.sent.status, 200);

  for (const t of CLINIC_TABLES) {
    assert.equal(await countFor(t, a.clinicId), 0, `${t} not cleared for A`);
    assert.ok(await countFor(t, b.clinicId) > 0, `${t} was cleared for B too`);
  }

  const [users] = await sequelize.query(
    `SELECT COUNT(*)::int AS n FROM users WHERE id = $1::uuid`,
    { bind: [b.userId], type: QueryTypes.SELECT }
  );
  assert.equal(users.n, 1, "clinic B's owner was deleted");
});

// ── A member leaving ────────────────────────────────────────────────────────

test("a staff member's deletion removes only them", async () => {
  const { clinicId, clinic } = await seedFullClinic();
  const staff = await addStaff(clinicId);
  const { deleteAccount } = await import("../src/controllers/account.controller.js");

  const res = makeRes();
  await deleteAccount(
    makeReq({
      user: staff,
      clinic,
      clinicRole: "staff",
      body: { password: PASSWORD, confirm: "delete" },
    }),
    res
  );

  assert.equal(res.sent.status, 200, JSON.stringify(res.sent.body));
  assert.equal(res.sent.body.data.scope, "member");

  // Their account and membership are gone…
  const [gone] = await sequelize.query(
    `SELECT COUNT(*)::int AS n FROM users WHERE id = $1::uuid`,
    { bind: [staff.id], type: QueryTypes.SELECT }
  );
  assert.equal(gone.n, 0);
  const [sessions] = await sequelize.query(
    `SELECT COUNT(*)::int AS n FROM refresh_tokens WHERE user_id = $1::uuid`,
    { bind: [staff.id], type: QueryTypes.SELECT }
  );
  assert.equal(sessions.n, 0, "their sessions survived");

  // …and the clinic is entirely intact.
  assert.equal(await countFor("reviews", clinicId), 1);
  assert.equal(await countFor("campaigns", clinicId), 1);
  assert.equal(await countFor("clinic_members", clinicId), 1, "owner membership was harmed");
  const [clinics] = await sequelize.query(
    `SELECT COUNT(*)::int AS n FROM clinics WHERE id = $1::uuid`,
    { bind: [clinicId], type: QueryTypes.SELECT }
  );
  assert.equal(clinics.n, 1, "the clinic was deleted by a staff departure");
});

test("a staff member confirms with DELETE, not the clinic name", async () => {
  const { clinicId, clinic } = await seedFullClinic();
  const staff = await addStaff(clinicId);
  const { deleteAccount } = await import("../src/controllers/account.controller.js");

  const res = makeRes();
  await deleteAccount(
    makeReq({
      user: staff, clinic, clinicRole: "staff",
      body: { password: PASSWORD, confirm: clinic.clinicName },
    }),
    res
  );
  assert.equal(res.sent.status, 400);
  assert.match(res.sent.body.message, /type "DELETE"/i);
});

// ── Billing ─────────────────────────────────────────────────────────────────

test("a failed subscription cancel ABORTS the deletion", async () => {
  // The most important test here. Proceeding would destroy the only record of
  // who is being charged while Paddle carried on charging them.
  const { clinicId, clinic, user } = await seedFullClinic();
  await sequelize.query(
    `UPDATE subscriptions SET gateway_subscription_id = 'sub_live_123',
            subscription_status = 'active'::subscription_status_enum
      WHERE clinic_id = $1::uuid`,
    { bind: [clinicId] }
  );

  const envMod = await import("../src/config/env.js");
  const originalPaddleFlag = envMod.env.FEATURES.paddle;
  const originalFetch = globalThis.fetch;

  // The controller only attempts a cancel when Paddle is configured.
  envMod.env.FEATURES.paddle = true;
  const { deleteAccount } = await import("../src/controllers/account.controller.js");

  // ── Stubbed at the FETCH layer, not the module ─────────────────────────
  // An ES module namespace object is frozen, so the export cannot be
  // redefined. Intercepting fetch is not a workaround for that — it is the
  // better test: it exercises cancelSubscription's own status handling and
  // error shaping on the way through, rather than replacing them.
  globalThis.fetch = async (url) => {
    if (String(url).includes("/subscriptions/")) {
      return new Response("upstream unavailable", { status: 500 });
    }
    return originalFetch(url);
  };

  try {
    const res = makeRes();
    await deleteAccount(
      makeReq({ user, clinic, body: { password: PASSWORD, confirm: clinic.clinicName } }),
      res
    );

    assert.equal(res.sent.status, 502, JSON.stringify(res.sent.body));
    assert.equal(res.sent.body.code, "BILLING_CANCEL_FAILED");
    // Nothing destroyed.
    assert.equal(await countFor("reviews", clinicId), 1, "data was deleted despite the abort");
    assert.equal(await countFor("subscriptions", clinicId), 1);
  } finally {
    globalThis.fetch = originalFetch;
    envMod.env.FEATURES.paddle = originalPaddleFlag;
  }
});

test("a free clinic with no gateway subscription deletes without calling Paddle", async () => {
  const { clinicId, clinic, user } = await seedFullClinic({ plan: "free" });
  const { deleteAccount } = await import("../src/controllers/account.controller.js");

  const res = makeRes();
  await deleteAccount(
    makeReq({ user, clinic, body: { password: PASSWORD, confirm: clinic.clinicName } }),
    res
  );

  assert.equal(res.sent.status, 200, JSON.stringify(res.sent.body));
  assert.equal(res.sent.body.data.billingCancelled, false);
  assert.equal(await countFor("reviews", clinicId), 0);
});

// ── The preview the confirmation dialog is built on ─────────────────────────

test("the owner preview names what will be destroyed", async () => {
  const { clinicId, clinic, user } = await seedFullClinic();
  await addStaff(clinicId);
  const { previewDeletion } = await import("../src/controllers/account.controller.js");

  const res = makeRes();
  await previewDeletion(makeReq({ user, clinic }), res);

  assert.equal(res.sent.body.data.scope, "clinic");
  assert.equal(res.sent.body.data.clinicName, clinic.clinicName);
  assert.equal(res.sent.body.data.willDelete.reviews, 1);
  assert.equal(res.sent.body.data.willDelete.members, 2);
  assert.equal(res.sent.body.data.willDelete.competitors, 1);
});

test("the staff preview is scoped to their own account", async () => {
  const { clinicId, clinic } = await seedFullClinic();
  const staff = await addStaff(clinicId);
  const { previewDeletion } = await import("../src/controllers/account.controller.js");

  const res = makeRes();
  await previewDeletion(makeReq({ user: staff, clinic, clinicRole: "staff" }), res);

  assert.equal(res.sent.body.data.scope, "member");
  // Must NOT enumerate the clinic's data to someone who is only leaving.
  assert.deepEqual(res.sent.body.data.willDelete, { yourAccount: true });
});

// ── Export ──────────────────────────────────────────────────────────────────

test("the export contains the clinic's data and no credentials", async () => {
  const { clinicId, clinic, user } = await seedFullClinic();
  const { exportAccountData } = await import("../src/controllers/account.controller.js");

  const res = makeRes();
  await exportAccountData(makeReq({ user, clinic }), res);

  assert.equal(res.sent.status, 200);
  assert.match(res.sent.headers["Content-Disposition"], /attachment; filename=".*\.json"/);

  const doc = JSON.parse(res.sent.body);
  assert.equal(doc.clinic.clinicName, clinic.clinicName);
  assert.equal(doc.reviews.length, 1);
  assert.equal(doc.reviewRequests.length, 1);
  assert.equal(doc.campaigns.length, 1);
  assert.equal(doc.competitors.length, 1);
  assert.equal(doc.competitorSnapshots.length, 1);
  assert.equal(doc.notifications.length, 1);
  assert.equal(doc.export.counts.reviews, 1);

  // No credential material anywhere in the payload.
  const dataOnly = JSON.stringify({ ...doc, export: undefined });
  assert.ok(!/\$2[aby]\$\d\d\$/.test(dataOnly), "a bcrypt hash is in the export");
  assert.ok(!/\b[0-9a-f]{64}\b/.test(dataOnly), "a 64-hex token hash is in the export");
  assert.ok(
    !/"(password|token_hash|access_token_enc|refresh_token_enc)"/i.test(dataOnly),
    "a credential column name is in the export"
  );
  void clinicId;
});
