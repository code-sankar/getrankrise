// backend/tests/tenantIsolation.test.js
//
// Cross-tenant access control, exercised through the REAL route stack.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
// This is a multi-tenant product: one Postgres holds every clinic's reviews,
// patient phone numbers and team emails, and the only thing separating them is
// that every query is scoped by `req.clinic.id`. One controller that takes an
// `:id` from the URL and looks it up WITHOUT that scope is a data breach, not a
// bug — clinic B reads clinic A's patients by guessing or leaking a UUID.
//
// The unit tests around it are good but structurally cannot catch this: they
// exercise services with a clinicId already in hand, which is precisely the
// step an IDOR skips. The check has to run end to end, through `protect` and
// `loadClinic`, with a token that belongs to somebody else.
//
// ── HOW ─────────────────────────────────────────────────────────────────────
// The Express app is booted on an ephemeral port and driven over HTTP, so the
// full middleware chain runs exactly as it does in production. Two clinics are
// created, private rows are seeded under A, and every ID-addressable route is
// probed with B's token.
//
// ── TWO THINGS THIS TEST IS CAREFUL ABOUT ───────────────────────────────────
// 1. BOTH clinics are on the same paid plan. When I first wrote this probe by
//    hand, both were on `free`, so the competitor routes answered 403
//    UPGRADE_REQUIRED — the assertions passed for a reason that had nothing to
//    do with tenancy. Plan gating must not be allowed to stand in for it.
// 2. Each denial is paired with a CONTROL showing clinic A can reach the same
//    object. Without that, a route that is simply broken for everyone would
//    read as "well isolated".
//
// A 404 is an acceptable denial here, and is usually the better answer than
// 403: "not found" does not confirm the id exists.

import test, { before, after, beforeEach, describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { QueryTypes } from "sequelize";
import {
  setupDatabase,
  teardownDatabase,
  resetData,
  createClinic,
  sequelize,
} from "./helpers/db.js";
import app from "../src/app.js";
import { generateAccessToken } from "../src/utils/jwt.js";

let server;
let base;

before(async () => {
  await setupDatabase();
  // Port 0 → the OS picks a free one, so parallel CI jobs cannot collide.
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});

after(async () => {
  // Guarded: if `before` failed (no database, say), `server` was never
  // assigned, and an unguarded close() would replace the real error with a
  // TypeError that says nothing about what actually went wrong.
  if (server) await new Promise((resolve) => server.close(resolve));
  await teardownDatabase();
});

beforeEach(resetData);

/** A tenant: its ids, and a bearer token that actually resolves through protect. */
async function makeTenant(label) {
  const { userId, clinicId, email } = await createClinic({
    plan: "premium",
    status: "active",
    email: `${label}-${randomUUID()}@example.com`,
  });
  const token = generateAccessToken({ id: userId, email, role: "admin" });
  return { userId, clinicId, email, token };
}

const call = (method, path, token, body) =>
  fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

/** 401/403/404 all mean "you did not get it". 200 means you did. */
const DENIED = new Set([401, 403, 404]);

async function seedPrivateRows(clinicId, userId) {
  const [review] = await sequelize.query(
    `INSERT INTO reviews (id, clinic_id, platform, reviewer_name, rating, review_text,
                          replied, external_id, review_date, sentiment, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, 'Google', 'Private Patient', 2,
             'A complaint that belongs to one clinic only', false, $2::text, NOW(), -1, NOW(), NOW())
     RETURNING id`,
    { bind: [clinicId, `iso-${randomUUID()}`], type: QueryTypes.SELECT },
  );

  const [competitor] = await sequelize.query(
    `INSERT INTO competitors (id, clinic_id, name, location, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, 'Private Rival', 'Somewhere', NOW(), NOW())
     RETURNING id`,
    { bind: [clinicId], type: QueryTypes.SELECT },
  );

  // Notifications hang off the USER, not the clinic — a different scoping rule
  // from everything else here, which is exactly why it is worth probing.
  const [notification] = await sequelize.query(
    `INSERT INTO notifications (id, user_id, type, message, read, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, 'urgent', 'private notification', false, NOW(), NOW())
     RETURNING id`,
    { bind: [userId], type: QueryTypes.SELECT },
  );

  return { reviewId: review.id, competitorId: competitor.id, notificationId: notification.id };
}

describe("tenant isolation: one clinic cannot reach another's rows", () => {
  test("every ID-addressable route refuses a foreign tenant", async () => {
    const a = await makeTenant("owner-a");
    const b = await makeTenant("owner-b");
    const { reviewId, competitorId, notificationId } = await seedPrivateRows(a.clinicId, a.userId);

    // ── Controls: A really can reach these, so a denial below means tenancy
    //    and not a route that is broken for everybody.
    assert.equal(
      (await call("GET", `/competitors/${competitorId}`, a.token)).status, 200,
      "control failed: the owner cannot read their own competitor",
    );
    const ownFeed = await (await call("GET", "/reviews", a.token)).json();
    assert.ok(
      JSON.stringify(ownFeed).includes("Private Patient"),
      "control failed: the owner cannot see their own review",
    );

    // ── The probes.
    const probes = [
      ["GET",    `/competitors/${competitorId}`,          undefined],
      ["DELETE", `/competitors/${competitorId}`,          undefined],
      ["POST",   `/competitors/${competitorId}/refresh`,  {}],
      ["POST",   `/reviews/${reviewId}/reply`,            { reply: "a reply from the wrong clinic" }],
      // A VALID ai-reply body on purpose: with an invalid one the request dies
      // in Joi before it ever reaches the ownership check, and the test would
      // pass without testing anything.
      ["POST",   `/reviews/${reviewId}/ai-reply`,         { reviewText: "A complaint", tone: "professional" }],
      ["DELETE", `/notifications/${notificationId}`,      undefined],
      ["PATCH",  `/notifications/${notificationId}/read`, undefined],
    ];

    for (const [method, path, body] of probes) {
      const res = await call(method, path, b.token, body);
      assert.ok(
        DENIED.has(res.status),
        `${method} ${path} answered ${res.status} for a foreign tenant — expected 401/403/404`,
      );
    }

    // ── And nothing was mutated on the way through.
    assert.equal(
      (await call("GET", `/competitors/${competitorId}`, a.token)).status, 200,
      "the foreign tenant's DELETE removed the competitor",
    );
    const [{ replied }] = await sequelize.query(
      `SELECT replied FROM reviews WHERE id = $1::uuid`,
      { bind: [reviewId], type: QueryTypes.SELECT },
    );
    assert.equal(replied, false, "the foreign tenant's reply was written to the review");
  });

  test("list endpoints never leak another clinic's rows", async () => {
    const a = await makeTenant("list-a");
    const b = await makeTenant("list-b");
    await seedPrivateRows(a.clinicId, a.userId);

    for (const path of ["/reviews", "/competitors", "/notifications", "/analytics", "/account/export"]) {
      const res = await call("GET", path, b.token);
      const text = await res.text();
      for (const secret of ["Private Patient", "Private Rival", "private notification"]) {
        assert.ok(
          !text.includes(secret),
          `GET ${path} leaked "${secret}" to a different clinic`,
        );
      }
    }
  });

  test("an unauthenticated caller reaches nothing", async () => {
    const a = await makeTenant("anon-a");
    const { competitorId } = await seedPrivateRows(a.clinicId, a.userId);

    for (const [method, path] of [
      ["GET", "/reviews"],
      ["GET", "/clinic/me"],
      ["GET", "/account/export"],
      ["GET", `/competitors/${competitorId}`],
    ]) {
      assert.ok(
        DENIED.has((await call(method, path, null)).status),
        `${method} ${path} served an unauthenticated caller`,
      );
      assert.ok(
        DENIED.has((await call(method, path, "not-a-real-token")).status),
        `${method} ${path} accepted a garbage token`,
      );
    }
  });
});
