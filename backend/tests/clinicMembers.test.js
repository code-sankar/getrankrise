// backend/tests/clinicMembers.test.js
//
// Membership and roles. Before migration 0015 a clinic was reached through
// clinics.user_id — one owner pointer — so a second person on the same clinic
// was not merely unimplemented, it was unrepresentable, and users.role was an
// enum nothing ever read.
//
// These tests cover the two halves that make the split real: loadClinic
// resolving the tenant through membership, and restrictTo() enforcing a role.

import test from "node:test";
import assert from "node:assert/strict";
import { QueryTypes } from "sequelize";
import {
  setupDatabase,
  teardownDatabase,
  resetData,
  createClinic,
  sequelize,
} from "./helpers/db.js";
import { loadClinic, restrictTo } from "../src/middleware/loadClinic.middleware.js";

test.before(setupDatabase);
test.after(teardownDatabase);
test.beforeEach(resetData);

/**
 * Runs one middleware and reports how it finished.
 *
 * Resolves on whichever happens first: `next()` being called, or the response
 * being written. Both middlewares under test are async and await database
 * queries, so the harness must wait on the returned promise — an earlier
 * version raced them with setImmediate and reported every async pass as a
 * failure.
 */
const run = (mw, req) =>
  new Promise((resolve, reject) => {
    let settled = false;
    const done = (v) => {
      if (!settled) { settled = true; resolve(v); }
    };

    const res = {
      statusCode: null,
      body: null,
      status(c) { this.statusCode = c; return this; },
      json(b) { this.body = b; done({ nexted: false, res: this }); return this; },
    };

    Promise.resolve(mw(req, res, (err) => done({ nexted: true, err, res })))
      .then(() => done({ nexted: false, res }))
      .catch(reject);
  });

async function addMember(clinicId, { role = "staff", email }) {
  const [user] = await sequelize.query(
    `INSERT INTO users (id, name, email, password, role, is_active, created_at, updated_at)
     VALUES (gen_random_uuid(), 'Member', $1::text, 'x', 'admin', true, NOW(), NOW())
     RETURNING id`,
    { bind: [email], type: QueryTypes.SELECT }
  );
  await sequelize.query(
    `INSERT INTO clinic_members (clinic_id, user_id, role)
     VALUES ($1::uuid, $2::uuid, $3::clinic_role_enum)`,
    { bind: [clinicId, user.id, role], type: QueryTypes.INSERT }
  );
  return user.id;
}

test("createClinic's owner resolves through membership", async () => {
  const { clinicId, userId } = await createClinic();

  const req = { user: { id: userId } };
  const { nexted } = await run(loadClinic, req);

  assert.equal(nexted, true);
  assert.equal(req.clinic.id, clinicId);
  assert.equal(req.clinicRole, "owner");
});

test("a staff member resolves the SAME clinic", async () => {
  // The case the old clinics.user_id lookup could not express at all.
  const { clinicId } = await createClinic();
  const staffId = await addMember(clinicId, { role: "staff", email: "staff@example.com" });

  const req = { user: { id: staffId } };
  const { nexted } = await run(loadClinic, req);

  assert.equal(nexted, true);
  assert.equal(req.clinic.id, clinicId, "staff reach the clinic they belong to");
  assert.equal(req.clinicRole, "staff");
});

test("a user with no membership gets 404, not another clinic", async () => {
  await createClinic(); // exists, but this user is not in it
  const [orphan] = await sequelize.query(
    `INSERT INTO users (id, name, email, password, role, is_active, created_at, updated_at)
     VALUES (gen_random_uuid(), 'Orphan', 'orphan@example.com', 'x', 'admin', true, NOW(), NOW())
     RETURNING id`,
    { type: QueryTypes.SELECT }
  );

  const req = { user: { id: orphan.id } };
  const { res } = await run(loadClinic, req);

  assert.equal(res.statusCode, 404);
  assert.equal(req.clinic, undefined, "must not leak someone else's clinic");
});

test("membership does not cross tenants", async () => {
  const a = await createClinic();
  const b = await createClinic();
  const staffOfA = await addMember(a.clinicId, { role: "staff", email: "a-staff@example.com" });

  const req = { user: { id: staffOfA } };
  await run(loadClinic, req);

  assert.equal(req.clinic.id, a.clinicId);
  assert.notEqual(req.clinic.id, b.clinicId);
});

test("restrictTo('owner') lets an owner through", async () => {
  const req = { clinicRole: "owner" };
  const { nexted } = await run(restrictTo("owner"), req);
  assert.equal(nexted, true);
});

test("restrictTo('owner') blocks staff with an actionable 403", async () => {
  const req = { clinicRole: "staff" };
  const { res } = await run(restrictTo("owner"), req);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "INSUFFICIENT_ROLE");
  assert.deepEqual(res.body.requiredRoles, ["owner"]);
  assert.equal(res.body.yourRole, "staff");
  assert.match(res.body.message, /owner/i);
});

test("restrictTo accepts any of several roles", async () => {
  const req = { clinicRole: "staff" };
  const { nexted } = await run(restrictTo("owner", "staff"), req);
  assert.equal(nexted, true);
});

test("restrictTo FAILS CLOSED when loadClinic did not run", async () => {
  // Mounting restrictTo without loadClinic in front of it is a programmer
  // error. Defaulting to "allow" would turn a routing mistake into an
  // authorization hole, so it denies and logs instead.
  const req = {};
  const { res } = await run(restrictTo("owner"), req);
  assert.equal(res.statusCode, 403);
});

test("the unique constraint makes membership idempotent", async () => {
  const { clinicId, userId } = await createClinic();

  // The upsert scripts/add-clinic-member.js uses — re-running promotes rather
  // than throwing.
  await sequelize.query(
    `INSERT INTO clinic_members (clinic_id, user_id, role)
     VALUES ($1::uuid, $2::uuid, 'staff'::clinic_role_enum)
     ON CONFLICT ON CONSTRAINT uniq_clinic_member DO UPDATE SET role = EXCLUDED.role`,
    { bind: [clinicId, userId], type: QueryTypes.INSERT }
  );

  const rows = await sequelize.query(
    `SELECT role FROM clinic_members WHERE clinic_id = $1::uuid AND user_id = $2::uuid`,
    { bind: [clinicId, userId], type: QueryTypes.SELECT }
  );

  assert.equal(rows.length, 1, "still exactly one membership row");
  assert.equal(rows[0].role, "staff", "the role was updated in place");
});

test("a user cannot belong to two clinics", async () => {
  // loadClinic takes the first membership row it finds, so two memberships
  // would make tenant resolution depend on row order — the same person landing
  // in a different clinic run to run. This was not hypothetical: the first
  // manual test of the staff flow added an already-registered user to a second
  // clinic and they kept resolving to their own, as owner.
  const a = await createClinic();
  const b = await createClinic();

  await assert.rejects(
    () =>
      sequelize.query(
        `INSERT INTO clinic_members (clinic_id, user_id, role)
         VALUES ($1::uuid, $2::uuid, 'staff'::clinic_role_enum)`,
        { bind: [b.clinicId, a.userId], type: QueryTypes.INSERT }
      ),
    /uniq_member_user|unique/i,
    "the database must reject a second clinic for the same user"
  );
});

test("moving a member between clinics is an update, not a duplicate", async () => {
  // What scripts/add-clinic-member.js --move relies on.
  const a = await createClinic();
  const b = await createClinic();

  await sequelize.query(
    `INSERT INTO clinic_members (clinic_id, user_id, role)
     VALUES ($1::uuid, $2::uuid, 'staff'::clinic_role_enum)
     ON CONFLICT ON CONSTRAINT uniq_member_user
     DO UPDATE SET clinic_id = EXCLUDED.clinic_id, role = EXCLUDED.role`,
    { bind: [b.clinicId, a.userId], type: QueryTypes.INSERT }
  );

  const rows = await sequelize.query(
    `SELECT clinic_id, role FROM clinic_members WHERE user_id = $1::uuid`,
    { bind: [a.userId], type: QueryTypes.SELECT }
  );

  assert.equal(rows.length, 1, "still exactly one membership");
  assert.equal(rows[0].clinic_id, b.clinicId, "now in the target clinic");
  assert.equal(rows[0].role, "staff");
});

test("deleting a clinic removes its memberships", async () => {
  const { clinicId, userId } = await createClinic();
  await sequelize.query(`DELETE FROM clinics WHERE id = $1::uuid`, {
    bind: [clinicId],
    type: QueryTypes.DELETE,
  });

  const rows = await sequelize.query(
    `SELECT id FROM clinic_members WHERE user_id = $1::uuid`,
    { bind: [userId], type: QueryTypes.SELECT }
  );
  assert.equal(rows.length, 0, "ON DELETE CASCADE leaves no dangling membership");
});
