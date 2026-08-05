// backend/tests/observability.test.js
//
// The rules that decide whether error reporting is an asset or a liability.
//
// A monitoring layer earns its place by being three things: always present
// (structured logs work with zero configuration), never fatal (a bug in the
// reporter must not become the crash), and never a leak (nothing shipped
// off-box may carry a password or a reset token). Each of those is a property
// this file asserts directly, because each one is invisible until the day it
// matters and by then nobody is watching.
//
// No database and no network: reportError is a pure function over process state
// with a fire-and-forget side effect. SENTRY_DSN is deliberately left unset so
// shipToSentry short-circuits and nothing leaves the box.

import test from "node:test";
import assert from "node:assert/strict";
import {
  reportError,
  runSupervised,
  requestContext,
  currentContext,
  initObservability,
} from "../src/utils/observability.js";

/** Captures the structured line reportError writes, restoring stderr after. */
function captureLog(fn) {
  const original = console.error;
  const lines = [];
  console.error = (...args) => lines.push(args.join(" "));
  try {
    const result = fn();
    return { lines, result };
  } finally {
    console.error = original;
  }
}

const parsed = (lines) =>
  lines.map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  }).filter(Boolean);

// ── The floor: a structured line with no configuration at all ───────────────

test("reports to stderr as one parseable JSON line", () => {
  const { lines, result } = captureLog(() =>
    reportError(new Error("boom"), { source: "test" })
  );

  const events = parsed(lines);
  assert.equal(events.length, 1, "expected exactly one structured line");

  const e = events[0];
  assert.equal(e.name, "Error");
  assert.equal(e.message, "boom");
  assert.equal(e.source, "test");
  assert.equal(e.level, "error");
  assert.ok(e.stack.includes("observability.test.js"), "stack was not captured");
  assert.ok(e.ts, "no timestamp");
  // The id is returned so a 500 response can quote it back to the user, and it
  // must be the SAME id that appears in the log — that correlation is the
  // entire point.
  assert.equal(e.eventId, result);
});

test("a non-Error is reported rather than dropped", () => {
  // `throw "something"` and rejected non-Error values are real; a reporter that
  // only understands Error instances loses exactly the failures nobody
  // anticipated.
  for (const thrown of ["a string", 42, null, undefined, { odd: true }]) {
    const { lines } = captureLog(() => reportError(thrown, { source: "test" }));
    const events = parsed(lines);
    assert.equal(events.length, 1, `dropped: ${JSON.stringify(thrown)}`);
    assert.ok(events[0].message.length > 0);
  }
});

// ── Never fatal ─────────────────────────────────────────────────────────────

test("reporting never throws, whatever it is handed", () => {
  const circular = { name: "Circular" };
  circular.self = circular;

  captureLog(() => {
    assert.doesNotThrow(() =>
      reportError(new Error("x"), { source: "test", extra: circular })
    );
    // An error whose own getters throw — a real shape for proxied or
    // lazily-hydrated objects.
    const hostile = new Error("hostile");
    Object.defineProperty(hostile, "stack", {
      get() {
        throw new Error("stack getter exploded");
      },
    });
    assert.doesNotThrow(() => reportError(hostile, { source: "test" }));
  });
});

test("reportError always returns an id, even when reporting fails internally", () => {
  const circular = {};
  circular.self = circular;
  const { result } = captureLog(() =>
    reportError(new Error("x"), { extra: circular })
  );
  assert.match(result, /^[0-9a-f]{32}$/, "event id is not a bare uuid hex");
});

// ── Never a leak ────────────────────────────────────────────────────────────

test("secrets in extra are redacted", () => {
  const { lines } = captureLog(() =>
    reportError(new Error("auth failed"), {
      source: "test",
      extra: {
        password: "hunter2",
        newPassword: "hunter3",
        token: "eyJhbGciOi…",
        accessToken: "secret",
        authorization: "Bearer abc",
        cookie: "refreshToken=xyz",
        apiKey: "sk-live-1234",
        // Nested, because a body is rarely flat.
        body: { currentPassword: "hunter2", patientName: "Jane Doe" },
        // Not a secret — must survive, or the report is useless.
        clinicId: "c-123",
      },
    })
  );

  const raw = lines[0];
  for (const secret of [
    "hunter2",
    "hunter3",
    "eyJhbGciOi",
    "Bearer abc",
    "refreshToken=xyz",
    "sk-live-1234",
  ]) {
    assert.ok(!raw.includes(secret), `leaked: ${secret}`);
  }

  const e = parsed(lines)[0];
  assert.equal(e.password, "[redacted]");
  assert.equal(e.body.currentPassword, "[redacted]");
  // Redaction is by key name, so ordinary data is untouched.
  assert.equal(e.clinicId, "c-123");
  assert.equal(e.body.patientName, "Jane Doe");
});

test("redaction survives a deeply nested payload without recursing forever", () => {
  let deep = { secret: "leaf" };
  for (let i = 0; i < 50; i++) deep = { nested: deep };

  const { lines } = captureLog(() =>
    reportError(new Error("deep"), { extra: { deep } })
  );
  assert.equal(parsed(lines).length, 1);
});

// ── Request correlation ─────────────────────────────────────────────────────

test("a report inside a request carries that request's identity", async () => {
  const store = {
    requestId: "req-abc-123",
    method: "POST",
    path: "/api/v1/requests",
    userId: "user-1",
    clinicId: "clinic-1",
  };

  const { lines } = captureLog(() =>
    requestContext.run(store, () => {
      // Reported from "deep inside a service" — the whole reason this is
      // AsyncLocalStorage and not a parameter.
      const inner = () => reportError(new Error("deep failure"), { source: "test" });
      return inner();
    })
  );

  const e = parsed(lines)[0];
  assert.equal(e.requestId, "req-abc-123");
  assert.equal(e.userId, "user-1");
  assert.equal(e.clinicId, "clinic-1");
  assert.equal(e.path, "/api/v1/requests");
});

test("context survives an await boundary", async () => {
  const store = { requestId: "req-async", method: "GET", path: "/x" };

  const { lines } = await new Promise((resolve) => {
    requestContext.run(store, async () => {
      const capture = [];
      const original = console.error;
      console.error = (...a) => capture.push(a.join(" "));
      await new Promise((r) => setTimeout(r, 5));
      await Promise.resolve();
      reportError(new Error("after await"), { source: "test" });
      console.error = original;
      resolve({ lines: capture });
    });
  });

  assert.equal(parsed(lines)[0].requestId, "req-async");
});

test("outside a request the context is empty rather than throwing", () => {
  assert.deepEqual(currentContext(), {});
  const { lines } = captureLog(() => reportError(new Error("no request")));
  const e = parsed(lines)[0];
  assert.equal(e.requestId, null);
  assert.equal(e.userId, null);
});

// ── Supervised background work ──────────────────────────────────────────────

test("runSupervised reports a throwing tick and keeps the loop alive", async () => {
  let result;
  const { lines } = captureLog(() => {
    result = runSupervised("campaign-runner", async () => {
      throw new Error("claim query failed");
    });
    return result;
  });
  // The capture closes before the promise settles, so await outside it.
  assert.equal(await result, undefined, "a failed tick must resolve, not reject");
  void lines;
});

test("runSupervised passes a successful result straight through", async () => {
  assert.equal(await runSupervised("test", async () => "ok"), "ok");
});

test("a failing tick is reported with its source", async () => {
  const original = console.error;
  const lines = [];
  console.error = (...a) => lines.push(a.join(" "));
  await runSupervised("sync-scheduler", async () => {
    const err = new Error("42703");
    err.code = "42703";
    throw err;
  });
  console.error = original;

  const e = parsed(lines)[0];
  assert.equal(e.source, "sync-scheduler");
  assert.equal(e.code, "42703");
});

// ── Configuration ───────────────────────────────────────────────────────────

test("a malformed SENTRY_DSN warns and falls back rather than failing boot", () => {
  const previous = process.env.SENTRY_DSN;
  process.env.SENTRY_DSN = "not-a-url";
  try {
    const warnings = [];
    const originalWarn = console.warn;
    const originalLog = console.log;
    console.warn = (...a) => warnings.push(a.join(" "));
    console.log = () => {};

    assert.doesNotThrow(() => initObservability({ nodeEnv: "test" }));

    console.warn = originalWarn;
    console.log = originalLog;
    assert.ok(
      warnings.some((w) => w.includes("SENTRY_DSN")),
      "a bad DSN should say so"
    );

    // …and reporting still works, because structured logs are the floor.
    const { lines } = captureLog(() => reportError(new Error("still works")));
    assert.equal(parsed(lines).length, 1);
  } finally {
    if (previous === undefined) delete process.env.SENTRY_DSN;
    else process.env.SENTRY_DSN = previous;
    const originalLog = console.log;
    console.log = () => {};
    initObservability({ nodeEnv: "test" }); // restore module state
    console.log = originalLog;
  }
});
