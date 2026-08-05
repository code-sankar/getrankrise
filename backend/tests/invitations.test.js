// backend/tests/invitations.test.js
//
// The team-invitation lifecycle, exercised through the controllers with a
// minimal req/res double rather than through HTTP. The rules worth pinning are
// all authorization and data-integrity rules, and they live in the controller:
//
//   * an invitation is accepted exactly once, even concurrently
//   * accepting can CREATE the account (the invitee may have none)
//   * one clinic per person (uniq_member_user) is explained, never a raw 500
//   * a clinic can never be left with no owner
//   * removing someone ends their sessions, not just their membership
//   * every mutation is tenant-scoped: clinic A cannot touch clinic B's team
//
// EMAIL_SIMULATE is set before the controller module loads so isEmailConfigured()
// is true without a SendGrid key — the sends log instead of calling out.

process.env.EMAIL_SIMULATE = "true";

import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { QueryTypes } from "sequelize";
import { setupDatabase, teardownDatabase, resetData, createClinic } from "./helpers/db.js";
import { sequelize } from "../src/config/db.js";
import { User } from "../src/models/index.js";
import {
  listMembers,
  inviteMember,
  revokeInvitation,
  removeMember,
  updateMemberRole,
  previewInvitation,
  acceptInvitation,
} from "../src/controllers/member.controller.js";

test.before(setupDatabase);
test.after(teardownDatabase);
test.beforeEach(resetData);

// ── Doubles ─────────────────────────────────────────────────────────────────

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
      return { json: capture };
    },
    json: capture,
    cookie() {},          // setRefreshTokenCookie on the accept path
    clearCookie() {},
  };
};

/** A request as loadClinic + protect would have left it. */
const makeReq = ({ clinic, user, clinicRole = "owner", body = {}, params = {} }) => ({
  clinic,
  user,
  clinicRole,
  body,
  params,
  ip: "127.0.0.1",
  get: () => "node-test",
});

/** The clinic's owner row, as createClinic wrote it. */
async function ownerOf(clinicId) {
  const [row] = await sequelize.query(
    `SELECT u.id, u.name, u.email FROM clinic_members m
       JOIN users u ON u.id = m.user_id
      WHERE m.clinic_id = $1::uuid AND m.role = 'owner' LIMIT 1`,
    { bind: [clinicId], type: QueryTypes.SELECT }
  );
  return row;
}

async function clinicRow(clinicId) {
  const [row] = await sequelize.query(
    `SELECT id, clinic_name AS "clinicName" FROM clinics WHERE id = $1::uuid`,
    { bind: [clinicId], type: QueryTypes.SELECT }
  );
  return row;
}

/**
 * Invites someone through the real controller and returns a RAW token that
 * will open that invitation.
 *
 * The controller deliberately never returns the secret — only the mailbox gets
 * it — and the stored value is a one-way hash, so a test cannot recover it. It
 * mints the invitation for real, then substitutes a token it knows, which
 * exercises the genuine acceptance path against a genuine row.
 *
 * The counter is load-bearing. Re-inviting the same address takes the
 * ON CONFLICT DO UPDATE arm, which keeps the SAME row id — so deriving the
 * token from that id handed both calls an identical string, and a test meant
 * to prove the superseded link is dead was quietly re-using the live one.
 */
let tokenCounter = 0;
async function inviteAndCaptureToken({ clinic, owner, email, role = "staff" }) {
  const res = makeRes();
  await inviteMember(
    makeReq({ clinic, user: owner, body: { email, role } }),
    res
  );
  assert.equal(res.sent.status, 201, `invite failed: ${res.sent.body?.message}`);

  const { hashToken } = await import("../src/services/auth/refreshToken.service.js");
  const token = `test-invite-token-${++tokenCounter}-${randomUUID()}`;
  await sequelize.query(
    `UPDATE clinic_invitations SET token_hash = $2::char(64) WHERE id = $1::uuid`,
    { bind: [res.sent.body.data.invitation.id, hashToken(token)] }
  );

  return { token, invitationId: res.sent.body.data.invitation.id };
}

// ── Inviting ────────────────────────────────────────────────────────────────

test("an owner can invite someone, and it shows up as pending", async () => {
  const { clinicId } = await createClinic();
  const clinic = await clinicRow(clinicId);
  const owner = await ownerOf(clinicId);

  const res = makeRes();
  await inviteMember(
    makeReq({ clinic, user: owner, body: { email: "nurse@clinic.test", role: "staff" } }),
    res
  );

  assert.equal(res.sent.status, 201);
  assert.equal(res.sent.body.data.invitation.email, "nurse@clinic.test");

  const listRes = makeRes();
  await listMembers(makeReq({ clinic, user: owner }), listRes);
  assert.equal(listRes.sent.body.data.invitations.length, 1);
  assert.equal(listRes.sent.body.data.members.length, 1); // just the owner so far
});

test("re-inviting replaces the pending invitation rather than adding a second", async () => {
  const { clinicId } = await createClinic();
  const clinic = await clinicRow(clinicId);
  const owner = await ownerOf(clinicId);

  const first = await inviteAndCaptureToken({ clinic, owner, email: "nurse@clinic.test" });
  const second = await inviteAndCaptureToken({ clinic, owner, email: "nurse@clinic.test" });

  const [{ n }] = await sequelize.query(
    `SELECT COUNT(*)::int AS n FROM clinic_invitations
      WHERE clinic_id = $1::uuid AND accepted_at IS NULL AND revoked_at IS NULL`,
    { bind: [clinicId], type: QueryTypes.SELECT }
  );
  assert.equal(n, 1, "a second live invitation was created");

  // The superseded link must be dead — two working links in two emails is one
  // more chance for the wrong person to use one.
  const res = makeRes();
  await acceptInvitation(
    makeReq({ clinic, user: null, body: { token: first.token, name: "Superseded", password: "password123" } }),
    res
  );
  assert.equal(res.sent.status, 400);
  assert.notEqual(second.token, first.token);
});

test("inviting an existing member is refused with their name", async () => {
  const { clinicId } = await createClinic();
  const clinic = await clinicRow(clinicId);
  const owner = await ownerOf(clinicId);

  const res = makeRes();
  await inviteMember(makeReq({ clinic, user: owner, body: { email: owner.email, role: "staff" } }), res);

  assert.equal(res.sent.status, 409);
  assert.match(res.sent.body.message, /already a member/i);
});

test("inviting someone who belongs to another clinic explains why not", async () => {
  // uniq_member_user would reject the acceptance later; refusing at invite time
  // is the honest moment, before the person has been told they can join.
  const a = await createClinic({ email: "a@clinic.test" });
  const b = await createClinic({ email: "b@clinic.test" });
  const clinicA = await clinicRow(a.clinicId);
  const ownerA = await ownerOf(a.clinicId);
  const ownerB = await ownerOf(b.clinicId);

  const res = makeRes();
  await inviteMember(
    makeReq({ clinic: clinicA, user: ownerA, body: { email: ownerB.email, role: "staff" } }),
    res
  );

  assert.equal(res.sent.status, 409);
  assert.match(res.sent.body.message, /only belong to one clinic/i);
});

// ── Accepting ───────────────────────────────────────────────────────────────

test("accepting creates the account, the membership, and a session", async () => {
  const { clinicId } = await createClinic();
  const clinic = await clinicRow(clinicId);
  const owner = await ownerOf(clinicId);

  const { token } = await inviteAndCaptureToken({
    clinic, owner, email: "newnurse@clinic.test", role: "staff",
  });

  const res = makeRes();
  await acceptInvitation(
    makeReq({
      clinic: null, user: null,
      body: { token, name: "New Nurse", password: "password123" },
    }),
    res
  );

  assert.equal(res.sent.status, 200);
  assert.equal(res.sent.body.data.createdAccount, true);
  assert.equal(res.sent.body.data.clinicRole, "staff");
  assert.ok(res.sent.body.data.accessToken, "no session issued");

  const created = await User.findOne({ where: { email: "newnurse@clinic.test" } });
  assert.ok(created, "no user row");
  // Accepting an emailed invitation IS proof the address receives mail, so
  // asking them to confirm a second time would be theatre.
  assert.ok(created.emailVerifiedAt, "invited user was left unverified");

  const [membership] = await sequelize.query(
    `SELECT role FROM clinic_members WHERE user_id = $1::uuid`,
    { bind: [created.id], type: QueryTypes.SELECT }
  );
  assert.equal(membership.role, "staff");
});

test("an invitation is accepted exactly once, even concurrently", async () => {
  const { clinicId } = await createClinic();
  const clinic = await clinicRow(clinicId);
  const owner = await ownerOf(clinicId);
  const { token } = await inviteAndCaptureToken({ clinic, owner, email: "race@clinic.test" });

  const attempts = await Promise.all(
    Array.from({ length: 5 }, () => {
      const res = makeRes();
      return acceptInvitation(
        makeReq({ body: { token, name: "Racer", password: "password123" } }),
        res
      ).then(() => res.sent);
    })
  );

  const winners = attempts.filter((r) => r.status === 200);
  assert.equal(winners.length, 1, "an invitation was accepted more than once");

  const [{ n }] = await sequelize.query(
    `SELECT COUNT(*)::int AS n FROM users WHERE email = 'race@clinic.test'`,
    { type: QueryTypes.SELECT }
  );
  assert.equal(n, 1, "duplicate user rows created");
});

test("a revoked invitation cannot be accepted", async () => {
  const { clinicId } = await createClinic();
  const clinic = await clinicRow(clinicId);
  const owner = await ownerOf(clinicId);
  const { token, invitationId } = await inviteAndCaptureToken({
    clinic, owner, email: "revoked@clinic.test",
  });

  const revokeRes = makeRes();
  await revokeInvitation(
    makeReq({ clinic, user: owner, params: { id: invitationId } }),
    revokeRes
  );
  assert.equal(revokeRes.sent.status, 200);

  const res = makeRes();
  await acceptInvitation(
    makeReq({ body: { token, name: "Nope", password: "password123" } }),
    res
  );
  assert.equal(res.sent.status, 400);
  assert.equal(res.sent.body.code, "INVALID");
});

test("an expired invitation cannot be accepted", async () => {
  const { clinicId } = await createClinic();
  const clinic = await clinicRow(clinicId);
  const owner = await ownerOf(clinicId);
  const { token, invitationId } = await inviteAndCaptureToken({
    clinic, owner, email: "stale@clinic.test",
  });

  await sequelize.query(
    `UPDATE clinic_invitations SET expires_at = NOW() - INTERVAL '1 day' WHERE id = $1::uuid`,
    { bind: [invitationId] }
  );

  const res = makeRes();
  await acceptInvitation(
    makeReq({ body: { token, name: "Stale", password: "password123" } }),
    res
  );
  assert.equal(res.sent.status, 400);
});

test("the preview route describes the invitation without a session", async () => {
  const { clinicId } = await createClinic();
  const clinic = await clinicRow(clinicId);
  const owner = await ownerOf(clinicId);
  const { token } = await inviteAndCaptureToken({
    clinic, owner, email: "preview@clinic.test", role: "staff",
  });

  const res = makeRes();
  await previewInvitation(makeReq({ params: { token } }), res);

  assert.equal(res.sent.status, 200);
  assert.equal(res.sent.body.data.clinicName, clinic.clinicName);
  assert.equal(res.sent.body.data.role, "staff");
  assert.equal(res.sent.body.data.hasAccount, false);
});

// ── Tenancy ─────────────────────────────────────────────────────────────────

test("one clinic cannot revoke another clinic's invitation", async () => {
  const a = await createClinic({ email: "a2@clinic.test" });
  const b = await createClinic({ email: "b2@clinic.test" });
  const clinicA = await clinicRow(a.clinicId);
  const clinicB = await clinicRow(b.clinicId);
  const ownerA = await ownerOf(a.clinicId);
  const ownerB = await ownerOf(b.clinicId);

  const { invitationId } = await inviteAndCaptureToken({
    clinic: clinicA, owner: ownerA, email: "target@clinic.test",
  });

  // Clinic B's owner, holding A's invitation id.
  const res = makeRes();
  await revokeInvitation(
    makeReq({ clinic: clinicB, user: ownerB, params: { id: invitationId } }),
    res
  );

  assert.equal(res.sent.status, 404, "cross-tenant revoke succeeded");
});

test("one clinic cannot remove another clinic's member", async () => {
  const a = await createClinic({ email: "a3@clinic.test" });
  const b = await createClinic({ email: "b3@clinic.test" });
  const clinicB = await clinicRow(b.clinicId);
  const ownerA = await ownerOf(a.clinicId);
  const ownerB = await ownerOf(b.clinicId);

  const res = makeRes();
  await removeMember(
    makeReq({ clinic: clinicB, user: ownerB, params: { userId: ownerA.id } }),
    res
  );

  assert.equal(res.sent.status, 404);
  // A's membership is untouched.
  const [{ n }] = await sequelize.query(
    `SELECT COUNT(*)::int AS n FROM clinic_members WHERE user_id = $1::uuid`,
    { bind: [ownerA.id], type: QueryTypes.SELECT }
  );
  assert.equal(n, 1);
});

// ── Never leave a clinic ownerless ──────────────────────────────────────────

test("the last owner cannot be removed or demoted", async () => {
  const { clinicId } = await createClinic();
  const clinic = await clinicRow(clinicId);
  const owner = await ownerOf(clinicId);

  // Add a staff member so the clinic isn't a single row.
  const { token } = await inviteAndCaptureToken({ clinic, owner, email: "staff@clinic.test" });
  const acceptRes = makeRes();
  await acceptInvitation(
    makeReq({ body: { token, name: "Staffer", password: "password123" } }),
    acceptRes
  );
  const staffId = acceptRes.sent.body.data.user.id;

  // A second owner tries to demote the only owner — here the "second owner" is
  // the staffer acting as if they were one, which restrictTo blocks at the
  // route. The controller-level guard is what this asserts.
  const demote = makeRes();
  await updateMemberRole(
    makeReq({ clinic, user: { id: staffId, name: "Staffer" }, params: { userId: owner.id }, body: { role: "staff" } }),
    demote
  );
  assert.equal(demote.sent.status, 403);
  assert.match(demote.sent.body.message, /only owner/i);

  const remove = makeRes();
  await removeMember(
    makeReq({ clinic, user: { id: staffId, name: "Staffer" }, params: { userId: owner.id } }),
    remove
  );
  assert.equal(remove.sent.status, 403);
});

test("you cannot remove yourself", async () => {
  const { clinicId } = await createClinic();
  const clinic = await clinicRow(clinicId);
  const owner = await ownerOf(clinicId);

  const res = makeRes();
  await removeMember(
    makeReq({ clinic, user: owner, params: { userId: owner.id } }),
    res
  );

  assert.equal(res.sent.status, 400);
  assert.match(res.sent.body.message, /can't remove yourself/i);
});

// ── Removal ends access, not just membership ────────────────────────────────

test("removing a member revokes their live sessions", async () => {
  const { clinicId } = await createClinic();
  const clinic = await clinicRow(clinicId);
  const owner = await ownerOf(clinicId);

  const { token } = await inviteAndCaptureToken({ clinic, owner, email: "leaver@clinic.test" });
  const acceptRes = makeRes();
  await acceptInvitation(
    makeReq({ body: { token, name: "Leaver", password: "password123" } }),
    acceptRes
  );
  const staffId = acceptRes.sent.body.data.user.id;

  // Accepting issued a session.
  const [before] = await sequelize.query(
    `SELECT COUNT(*)::int AS n FROM refresh_tokens
      WHERE user_id = $1::uuid AND revoked_at IS NULL`,
    { bind: [staffId], type: QueryTypes.SELECT }
  );
  assert.equal(before.n, 1);

  const res = makeRes();
  await removeMember(makeReq({ clinic, user: owner, params: { userId: staffId } }), res);
  assert.equal(res.sent.status, 200);

  // Without this, a removed staff member keeps a refresh token for 7 days.
  const [after] = await sequelize.query(
    `SELECT COUNT(*)::int AS n FROM refresh_tokens
      WHERE user_id = $1::uuid AND revoked_at IS NULL`,
    { bind: [staffId], type: QueryTypes.SELECT }
  );
  assert.equal(after.n, 0, "removed member kept a live session");
});

test("promoting a member to owner works and is reflected in the list", async () => {
  const { clinicId } = await createClinic();
  const clinic = await clinicRow(clinicId);
  const owner = await ownerOf(clinicId);

  const { token } = await inviteAndCaptureToken({ clinic, owner, email: "promote@clinic.test" });
  const acceptRes = makeRes();
  await acceptInvitation(
    makeReq({ body: { token, name: "Promoted", password: "password123" } }),
    acceptRes
  );
  const staffId = acceptRes.sent.body.data.user.id;

  const res = makeRes();
  await updateMemberRole(
    makeReq({ clinic, user: owner, params: { userId: staffId }, body: { role: "owner" } }),
    res
  );
  assert.equal(res.sent.status, 200);

  const listRes = makeRes();
  await listMembers(makeReq({ clinic, user: owner }), listRes);
  const promoted = listRes.sent.body.data.members.find((m) => m.userId === staffId);
  assert.equal(promoted.role, "owner");
});
