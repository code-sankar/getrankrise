// backend/tests/refreshTokens.test.js
//
// Session invariants. Each of these corresponds to something that was broken
// while sessions were a single users.refresh_token column:
//
//   * two devices could not be signed in at once
//   * a password change left stolen tokens working for their full 7 days
//   * there was no way to end one device without ending all of them

import test from "node:test";
import assert from "node:assert/strict";
import { setupDatabase, teardownDatabase, resetData, createClinic } from "./helpers/db.js";
import {
  issueRefreshToken,
  consumeRefreshToken,
  revokeRefreshToken,
  revokeAllForUser,
  countLiveSessions,
  pruneExpiredTokens,
  hashToken,
} from "../src/services/auth/refreshToken.service.js";
import { generateTokenPair, getTokenExpiry } from "../src/utils/jwt.js";

test.before(setupDatabase);
test.after(teardownDatabase);
test.beforeEach(resetData);

/** Issues a token the way the auth controller does. */
async function openSession(userId) {
  const { refreshToken } = generateTokenPair({ id: userId, email: "t@example.com", role: "admin" });
  await issueRefreshToken({
    userId,
    token: refreshToken,
    expiresAt: getTokenExpiry(refreshToken),
  });
  return refreshToken;
}

test("the raw token is never stored — only its hash", async () => {
  const { userId } = await createClinic();
  const token = await openSession(userId);

  const { sequelize } = await import("./helpers/db.js");
  const [row] = await sequelize.query(
    `SELECT token_hash FROM refresh_tokens WHERE user_id = $1::uuid`,
    { bind: [userId], type: "SELECT" }
  );

  assert.equal(row.token_hash, hashToken(token));
  assert.notEqual(row.token_hash, token);
  assert.equal(row.token_hash.length, 64, "sha256 hex");
});

test("two devices hold independent sessions", async () => {
  const { userId } = await createClinic();

  const deviceA = await openSession(userId);
  const deviceB = await openSession(userId);

  assert.notEqual(deviceA, deviceB, "each login must mint a distinct token");
  assert.equal(await countLiveSessions(userId), 2);

  // Both must still work — this is the exact case the single-column design
  // could not express.
  assert.equal((await consumeRefreshToken(deviceA)).ok, true);
  assert.equal((await consumeRefreshToken(deviceB)).ok, true);
});

test("tokens minted in the same millisecond are still distinct", async () => {
  // Without a jti the refresh payload is { id, email, role } and iat has
  // one-second resolution, so two logins in the same second produced a
  // BYTE-IDENTICAL token — two devices sharing one session.
  const { userId } = await createClinic();
  const pairs = Array.from({ length: 5 }, () =>
    generateTokenPair({ id: userId, email: "t@example.com", role: "admin" }).refreshToken
  );
  assert.equal(new Set(pairs).size, 5, "every refresh token must be unique");
});

test("a consumed token cannot be used twice, and reuse revokes the family", async () => {
  const { userId } = await createClinic();
  const stale = await openSession(userId);
  await openSession(userId); // a second, innocent device
  assert.equal(await countLiveSessions(userId), 2);

  assert.equal((await consumeRefreshToken(stale)).ok, true);

  const replay = await consumeRefreshToken(stale);
  assert.equal(replay.ok, false);
  assert.equal(replay.reason, "REUSED");
  assert.equal(
    await countLiveSessions(userId),
    0,
    "a replayed rotated token ends every session for the account"
  );
});

test("a token we revoked ourselves is NOT treated as theft", async () => {
  // A device signed out by a logout elsewhere or a password change will
  // present its dead token once. Escalating that to reuse-detection revoked
  // the family — including the brand-new session of the person who had just
  // changed their password, locking out the user for doing the secure thing.
  const { userId } = await createClinic();
  const victim = await openSession(userId);
  await revokeAllForUser(userId, "password_change");
  const fresh = await openSession(userId);

  const result = await consumeRefreshToken(victim);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "REVOKED");
  assert.equal(result.revokedReason, "password_change");

  assert.equal(
    (await consumeRefreshToken(fresh)).ok,
    true,
    "the surviving session must be untouched"
  );
});

test("logout ends one device only", async () => {
  const { userId } = await createClinic();
  const deviceA = await openSession(userId);
  const deviceB = await openSession(userId);

  await revokeRefreshToken(deviceB, "logout");

  assert.equal(await countLiveSessions(userId), 1);
  assert.equal((await consumeRefreshToken(deviceA)).ok, true, "device A survives");
  assert.equal((await consumeRefreshToken(deviceB)).ok, false, "device B is out");
});

test("revokeAllForUser ends every live session and reports the count", async () => {
  const { userId } = await createClinic();
  await openSession(userId);
  await openSession(userId);
  await openSession(userId);

  assert.equal(await revokeAllForUser(userId, "password_change"), 3);
  assert.equal(await countLiveSessions(userId), 0);
});

test("an expired token is refused without being read as theft", async () => {
  const { userId } = await createClinic();
  const { refreshToken } = generateTokenPair({ id: userId, email: "t@example.com", role: "admin" });
  await issueRefreshToken({
    userId,
    token: refreshToken,
    expiresAt: new Date(Date.now() - 1000), // already expired
  });

  const result = await consumeRefreshToken(refreshToken);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "EXPIRED");
});

test("an unknown token is refused", async () => {
  const result = await consumeRefreshToken("not-a-real-token");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "UNKNOWN");
});

test("pruning keeps recent revocations so reuse stays detectable", async () => {
  const { userId } = await createClinic();
  const token = await openSession(userId);
  await consumeRefreshToken(token); // now revoked as 'rotated'

  await pruneExpiredTokens({ retentionDays: 30 });

  // Still present, so a replay is still recognised as reuse rather than as an
  // unknown (possibly forged) token.
  const replay = await consumeRefreshToken(token);
  assert.equal(replay.reason, "REUSED");
});
