// backend/tests/authTokens.test.js
//
// The single-use, single-live guarantees behind password reset and email
// verification. Both are bearer credentials for account takeover, so the
// properties worth testing are the ones an attacker would attack:
//
//   * a token works exactly once, even under concurrent redemption
//   * issuing a new one kills the previous one atomically
//   * an expired token is refused, and refused DIFFERENTLY from a spent one
//   * a token minted for one purpose cannot be spent on the other
//
// Against real Postgres, because every one of those is a property of a specific
// statement — the partial unique index in 0016 and the WHERE clause in
// consumeAuthToken. A mocked client would only assert we still send the string.

import test from "node:test";
import assert from "node:assert/strict";
import { setupDatabase, teardownDatabase, resetData, createClinic } from "./helpers/db.js";
import { sequelize } from "../src/config/db.js";
import { QueryTypes } from "sequelize";
import {
  issueAuthToken,
  consumeAuthToken,
  revokeAuthTokens,
  pruneAuthTokens,
  TOKEN_TTL_MINUTES,
} from "../src/services/auth/authToken.service.js";

test.before(setupDatabase);
test.after(teardownDatabase);
test.beforeEach(resetData);

const expireToken = (userId, purpose) =>
  sequelize.query(
    `UPDATE auth_tokens SET expires_at = NOW() - INTERVAL '1 minute'
      WHERE user_id = $1::uuid AND purpose = $2::auth_token_purpose_enum`,
    { bind: [userId, purpose] }
  );

// ── Single use ──────────────────────────────────────────────────────────────

test("a reset token works once and is refused the second time", async () => {
  const { userId } = await createClinic();
  const { token } = await issueAuthToken({ userId, purpose: "password_reset" });

  const first = await consumeAuthToken({ token, purpose: "password_reset" });
  assert.equal(first.ok, true);
  assert.equal(first.userId, userId);

  const second = await consumeAuthToken({ token, purpose: "password_reset" });
  assert.equal(second.ok, false);
  // USED, not INVALID — the controller shows a different sentence for each,
  // and "already used" is the one that tells the user what actually happened.
  assert.equal(second.reason, "USED");
});

test("CONCURRENCY: ten simultaneous redemptions elect exactly one winner", async () => {
  // The reason consumeAuthToken is one UPDATE rather than SELECT-then-UPDATE.
  // A double-clicked reset link fires two requests; a prefetching mail client
  // can fire more. Only one may win.
  const { userId } = await createClinic();
  const { token } = await issueAuthToken({ userId, purpose: "password_reset" });

  const results = await Promise.all(
    Array.from({ length: 10 }, () =>
      consumeAuthToken({ token, purpose: "password_reset" })
    )
  );

  const winners = results.filter((r) => r.ok);
  assert.equal(winners.length, 1, "more than one redemption succeeded");
  assert.ok(results.filter((r) => !r.ok).every((r) => r.reason === "USED"));
});

// ── One live token per (user, purpose) ──────────────────────────────────────

test("issuing a new reset link invalidates the previous one", async () => {
  // Otherwise "email me a link" five times leaves five working links in five
  // inboxes-worth of mail, each valid for the full window.
  const { userId } = await createClinic();

  const first = await issueAuthToken({ userId, purpose: "password_reset" });
  const second = await issueAuthToken({ userId, purpose: "password_reset" });
  assert.notEqual(first.token, second.token);

  const oldOne = await consumeAuthToken({ token: first.token, purpose: "password_reset" });
  assert.equal(oldOne.ok, false, "the superseded link still worked");
  assert.equal(oldOne.reason, "INVALID"); // its hash is gone — overwritten in place

  const newOne = await consumeAuthToken({ token: second.token, purpose: "password_reset" });
  assert.equal(newOne.ok, true);
});

test("re-issuing leaves exactly one live row, not a pile", async () => {
  const { userId } = await createClinic();
  for (let i = 0; i < 5; i++) {
    await issueAuthToken({ userId, purpose: "password_reset" });
  }

  const [{ n }] = await sequelize.query(
    `SELECT COUNT(*)::int AS n FROM auth_tokens
      WHERE user_id = $1::uuid AND purpose = 'password_reset' AND consumed_at IS NULL`,
    { bind: [userId], type: QueryTypes.SELECT }
  );
  assert.equal(n, 1);
});

// ── Purposes are separate namespaces ────────────────────────────────────────

test("the two purposes do not collide, and cannot be swapped", async () => {
  const { userId } = await createClinic();

  const reset = await issueAuthToken({ userId, purpose: "password_reset" });
  const verify = await issueAuthToken({ userId, purpose: "email_verification" });

  // Issuing one must not invalidate the other — a user who signs up and
  // immediately forgets their password holds both at once.
  assert.equal(
    (await consumeAuthToken({ token: verify.token, purpose: "email_verification" })).ok,
    true
  );

  // A verification token presented to the reset flow must not work. `purpose`
  // is in the WHERE clause precisely so this cannot happen: otherwise the
  // longer-lived, lower-stakes token would be a skeleton key for the
  // higher-stakes one.
  const crossed = await consumeAuthToken({
    token: reset.token,
    purpose: "email_verification",
  });
  assert.equal(crossed.ok, false);
  assert.equal(crossed.reason, "INVALID");

  // …and the reset token is untouched by that attempt.
  assert.equal(
    (await consumeAuthToken({ token: reset.token, purpose: "password_reset" })).ok,
    true
  );
});

// ── Expiry ──────────────────────────────────────────────────────────────────

test("an expired token is refused, and reported as expired", async () => {
  const { userId } = await createClinic();
  const { token } = await issueAuthToken({ userId, purpose: "password_reset" });
  await expireToken(userId, "password_reset");

  const r = await consumeAuthToken({ token, purpose: "password_reset" });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "EXPIRED");
});

test("reset links are short-lived and verification links are not", async () => {
  // A reset link is full account takeover and the user is at their inbox when
  // they ask for it. A verification link grants only "this address is real".
  assert.equal(TOKEN_TTL_MINUTES.password_reset, 60);
  assert.ok(
    TOKEN_TTL_MINUTES.email_verification > TOKEN_TTL_MINUTES.password_reset,
    "verification should outlive a reset link"
  );
});

// ── Bulk revocation ─────────────────────────────────────────────────────────

test("revokeAuthTokens kills a live link without redeeming it", async () => {
  // What changePassword calls: a reset link sitting in an inbox is a working
  // credential, and changing your password is the action you take because you
  // believe someone else has access.
  const { userId } = await createClinic();
  const { token } = await issueAuthToken({ userId, purpose: "password_reset" });

  const killed = await revokeAuthTokens({ userId, purpose: "password_reset" });
  assert.equal(killed, 1);

  const r = await consumeAuthToken({ token, purpose: "password_reset" });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "USED");
});

test("revoking one purpose leaves the other alone", async () => {
  const { userId } = await createClinic();
  await issueAuthToken({ userId, purpose: "password_reset" });
  const verify = await issueAuthToken({ userId, purpose: "email_verification" });

  await revokeAuthTokens({ userId, purpose: "password_reset" });

  assert.equal(
    (await consumeAuthToken({ token: verify.token, purpose: "email_verification" })).ok,
    true
  );
});

// ── Housekeeping ────────────────────────────────────────────────────────────

test("pruning removes long-dead rows and keeps live ones", async () => {
  const { userId } = await createClinic();
  const { token } = await issueAuthToken({ userId, purpose: "password_reset" });

  assert.equal(await pruneAuthTokens({ retentionDays: 7 }), 0, "pruned a live token");

  await sequelize.query(
    `UPDATE auth_tokens SET expires_at = NOW() - INTERVAL '30 days'
      WHERE user_id = $1::uuid`,
    { bind: [userId] }
  );

  assert.equal(await pruneAuthTokens({ retentionDays: 7 }), 1);
  assert.equal((await consumeAuthToken({ token, purpose: "password_reset" })).reason, "INVALID");
});

// ── Input hygiene ───────────────────────────────────────────────────────────

test("a garbage token is INVALID rather than a crash", async () => {
  for (const bad of ["", null, undefined, "not-a-real-token", 12345]) {
    const r = await consumeAuthToken({ token: bad, purpose: "password_reset" });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "INVALID", `unexpected handling of ${JSON.stringify(bad)}`);
  }
});

test("an unknown purpose is a programmer error, not a silent no-op", async () => {
  const { userId } = await createClinic();
  await assert.rejects(
    () => issueAuthToken({ userId, purpose: "not_a_purpose" }),
    /Unknown auth token purpose/
  );
});
