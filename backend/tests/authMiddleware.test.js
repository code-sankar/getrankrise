// backend/tests/authMiddleware.test.js
//
// `protect` classifies failures, and getting that classification wrong is
// unusually expensive because the FRONTEND acts on the status code:
// axios.helper.js clears the token and redirects to /login on a non-expiry 401.
//
// ── The bug this pins down ──────────────────────────────────────────────────
// The catch was written for verifyAccessToken, but the try block also contained
// `await User.findByPk(...)`. So every database failure was answered as
//
//     401 {"success":false,"message":"connect ECONNREFUSED 127.0.0.1:5432"}
//
// Found by stopping Postgres under a live request. Three consequences:
//   * the database host and port were disclosed to any caller
//   * it never reached errorHandler, so a database outage — the thing you most
//     want to be paged about — was never reported
//   * a 401 tells the client the SESSION is bad, so a brief blip signed out
//     every active user instead of showing a retryable error
//
// The tests below cover both sides of the line: a token problem must stay a
// 401 with the exact message the interceptor matches on, and anything else must
// travel to errorHandler as a 500.

import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { setupDatabase, teardownDatabase, resetData, createClinic } from "./helpers/db.js";
import { sequelize } from "../src/config/db.js";
import { protect } from "../src/middleware/auth.middleware.js";

test.before(setupDatabase);
test.after(teardownDatabase);
test.beforeEach(resetData);

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
  };
};

const makeReq = (token) => ({
  headers: token ? { authorization: `Bearer ${token}` } : {},
});

/** Runs protect and reports which of the three outcomes happened. */
async function run(token) {
  const req = makeReq(token);
  const res = makeRes();
  let nextErr;
  let nexted = false;

  await protect(req, res, (err) => {
    nexted = true;
    nextErr = err;
  });

  return { req, res: res.sent, nexted, nextErr };
}

const sign = (payload, opts = {}) =>
  jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "15m", ...opts });

// ── The happy path ──────────────────────────────────────────────────────────

test("a valid token attaches the user and continues", async () => {
  const { userId } = await createClinic();
  const { req, nexted, nextErr } = await run(sign({ id: userId }));

  assert.equal(nexted, true);
  assert.equal(nextErr, undefined, "continued with an error");
  assert.equal(req.user.id, userId);
});

// ── Token problems stay 401, with the EXACT message the client matches ──────

test("no header is a 401", async () => {
  const { res, nexted } = await run(null);
  assert.equal(res.status, 401);
  assert.equal(nexted, false);
  assert.match(res.body.message, /no token/i);
});

test("a malformed token is a 401 saying JsonWebTokenError", async () => {
  const { res } = await run("not-a-jwt");
  assert.equal(res.status, 401);
  // The frontend interceptor pattern-matches this exact string to decide
  // whether to attempt a silent refresh. Changing it is a breaking change.
  assert.equal(res.body.message, "JsonWebTokenError");
});

test("an expired token is a 401 saying TokenExpiredError", async () => {
  const { userId } = await createClinic();
  const expired = sign({ id: userId }, { expiresIn: "-1s" });

  const { res } = await run(expired);
  assert.equal(res.status, 401);
  // This is THE string that triggers the refresh-and-retry path. If it ever
  // stops being exactly this, every user is hard-logged-out at the 15-minute
  // mark instead of being silently refreshed.
  assert.equal(res.body.message, "TokenExpiredError");
});

test("a token signed with the wrong secret is a 401, not a 500", async () => {
  const forged = jwt.sign({ id: "whoever" }, "a-different-secret", { expiresIn: "15m" });
  const { res, nexted } = await run(forged);
  assert.equal(res.status, 401);
  assert.equal(nexted, false, "a forged token must not reach errorHandler");
});

test("a valid token for a deleted user is a 401", async () => {
  const { userId } = await createClinic();
  const token = sign({ id: userId });
  await sequelize.query(`DELETE FROM users WHERE id = $1::uuid`, { bind: [userId] });

  const { res } = await run(token);
  assert.equal(res.status, 401);
  assert.match(res.body.message, /no longer exists/i);
});

test("a deactivated account is a 401", async () => {
  const { userId } = await createClinic();
  await sequelize.query(`UPDATE users SET is_active = false WHERE id = $1::uuid`, {
    bind: [userId],
  });

  const { res } = await run(sign({ id: userId }));
  assert.equal(res.status, 401);
  assert.match(res.body.message, /deactivated/i);
});

// ── Everything else is infrastructure, and must NOT be a 401 ────────────────

test("a database failure travels to errorHandler instead of becoming a 401", async () => {
  const { userId } = await createClinic();
  const token = sign({ id: userId });

  // Simulate the outage without stopping Postgres: make the lookup itself
  // throw the error a dead pool produces. Same code path, no global side
  // effect on the rest of the suite.
  const { User } = await import("../src/models/index.js");
  const original = User.findByPk;
  const dbError = new Error("connect ECONNREFUSED 127.0.0.1:5432");
  dbError.name = "SequelizeConnectionRefusedError";
  User.findByPk = async () => {
    throw dbError;
  };

  try {
    const { res, nexted, nextErr } = await run(token);

    assert.equal(nexted, true, "a database failure must reach errorHandler");
    assert.equal(nextErr, dbError);
    // Nothing was written to the response here — errorHandler owns that, and
    // it is what scrubs the message and attaches an eventId.
    assert.equal(res.status, 200, "protect answered the request itself");
    assert.equal(res.body, undefined);
  } finally {
    User.findByPk = original;
  }
});

test("the database host is never disclosed by this middleware", async () => {
  const { userId } = await createClinic();
  const token = sign({ id: userId });

  const { User } = await import("../src/models/index.js");
  const original = User.findByPk;
  User.findByPk = async () => {
    const e = new Error("connect ECONNREFUSED 10.0.4.17:5432");
    e.name = "SequelizeConnectionRefusedError";
    throw e;
  };

  try {
    const { res } = await run(token);
    const serialized = JSON.stringify(res.body ?? {});
    assert.ok(!serialized.includes("10.0.4.17"), "leaked the database host");
    assert.ok(!serialized.includes("5432"), "leaked the database port");
  } finally {
    User.findByPk = original;
  }
});

test("an unrecognised error is treated as infrastructure, not as auth", async () => {
  // Fail closed in the SAFE direction: an unknown failure must not be able to
  // masquerade as a bad session and sign the user out.
  const { userId } = await createClinic();
  const token = sign({ id: userId });

  const { User } = await import("../src/models/index.js");
  const original = User.findByPk;
  User.findByPk = async () => {
    throw new TypeError("something entirely unexpected");
  };

  try {
    const { nexted, res } = await run(token);
    assert.equal(nexted, true);
    assert.equal(res.status, 200, "must not have answered with a 401");
  } finally {
    User.findByPk = original;
  }
});
