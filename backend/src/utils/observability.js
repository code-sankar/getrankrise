// backend/src/utils/observability.js
//
// Where unhandled errors go in production.
//
// ── The gap this closes ─────────────────────────────────────────────────────
// Every failure path in this codebase ended at console.error. That is fine on a
// dev box and close to useless in production: a 500 scrolls past in a log
// stream nobody is watching, with no stack, no request id, no user, and no way
// to tell "this happened once" from "this has happened four hundred times since
// the deploy". The background loops are worse — tick() catches and logs, so a
// scheduler that has been failing for a week looks exactly like one with
// nothing to do. That exact failure mode is why db/assertSchema.js exists.
//
// ── Why there is no SDK ─────────────────────────────────────────────────────
// Same posture as paddle.client.js, email.service.js and the SMS providers:
// plain fetch against a documented HTTP API, no dependency. Sentry's envelope
// endpoint is a stable public interface and the payload we need is small. An
// SDK would pull in a tree of transitive dependencies, patch global handlers
// out from under server.js, and monkey-patch http — for a POST we can write in
// eighty lines.
//
// ── Structured logs are the floor, Sentry is the ceiling ────────────────────
// reportError ALWAYS writes one structured JSON line to stderr. That works with
// no configuration at all and is what a platform log aggregator (CloudWatch,
// Railway, Render, Loki) needs to be searchable. Sentry is layered on top when
// SENTRY_DSN is set. If Sentry is misconfigured or down, the log line is still
// there — the fallback is never "nothing".
//
// ── This must never break the thing it is observing ─────────────────────────
// Every function here swallows its own errors. A monitoring system that can
// turn a handled 500 into an unhandled crash is worse than no monitoring.
// Delivery is fire-and-forget: nothing awaits the network call, so a slow
// Sentry never adds latency to a user's request.

import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";

// ── Request correlation ─────────────────────────────────────────────────────
// So an error thrown four layers deep inside a service can be tied back to the
// request that caused it without every function signature growing a context
// parameter. AsyncLocalStorage is the only thing that survives an await chain.
export const requestContext = new AsyncLocalStorage();

/** The active request's context, or an empty object outside a request. */
export const currentContext = () => requestContext.getStore() ?? {};

// ── Sentry DSN ──────────────────────────────────────────────────────────────
// Format: https://<publicKey>@<host>/<projectId>
function parseDsn(dsn) {
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\/+/, "");
    if (!url.username || !projectId) return null;
    return {
      key: url.username,
      endpoint: `${url.protocol}//${url.host}/api/${projectId}/envelope/`,
    };
  } catch {
    return null;
  }
}

let sentry = null;
let release = null;
let environment = "development";

/**
 * Reads config once at boot and says out loud what it decided.
 *
 * Called from server.js before anything can fail. An invalid DSN is a warning
 * rather than a boot failure: monitoring being misconfigured must not take the
 * product down, and the structured-log floor still applies.
 */
export function initObservability({ nodeEnv } = {}) {
  environment = nodeEnv || process.env.NODE_ENV || "development";
  release =
    process.env.SENTRY_RELEASE ||
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.RENDER_GIT_COMMIT ||
    process.env.GIT_COMMIT ||
    null;

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.log("🩺 Error reporting: structured logs only (SENTRY_DSN unset)");
    return;
  }

  sentry = parseDsn(dsn);
  if (!sentry) {
    console.warn(
      "⚠️  SENTRY_DSN is set but could not be parsed — expected " +
        "https://<key>@<host>/<projectId>. Falling back to structured logs."
    );
    return;
  }

  console.log(
    `🩺 Error reporting: Sentry (${environment}${release ? ` @ ${release.slice(0, 7)}` : ""})`
  );
}

// ── Stack parsing ───────────────────────────────────────────────────────────
// Sentry renders a real stack trace only when given structured frames; a bare
// string lands as one unreadable blob. Ten lines of regex buys a usable issue
// page, and anything it fails to parse still travels in `extra.stack`.
const FRAME = /^\s*at (?:(.+?)\s+\()?(?:(.+?):(\d+):(\d+))\)?$/;

function parseFrames(stack) {
  if (typeof stack !== "string") return [];
  return stack
    .split("\n")
    .slice(1)
    .map((line) => line.match(FRAME))
    .filter(Boolean)
    .map((m) => ({
      function: m[1] || "<anonymous>",
      filename: m[2],
      lineno: Number(m[3]),
      colno: Number(m[4]),
      // Frames from node_modules and node internals are noise in the UI; this
      // is what makes Sentry collapse them and surface OUR frame as the
      // culprit.
      in_app: !m[2].includes("node_modules") && !m[2].startsWith("node:"),
    }))
    // Sentry renders oldest-first.
    .reverse();
}

// ── Redaction ───────────────────────────────────────────────────────────────
// Anything shipped off-box goes through this. The rule is allow-list-ish by
// key name rather than by value inspection: a token that happens to look like
// an ordinary string must still be caught.
const SECRET_KEY = /pass|token|secret|key|authorization|cookie|credential|otp|cvv/i;

function redact(value, depth = 0) {
  if (value == null || depth > 4) return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));

  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = SECRET_KEY.test(k) ? "[redacted]" : redact(v, depth + 1);
  }
  return out;
}

// ── Delivery ────────────────────────────────────────────────────────────────
function shipToSentry(event) {
  if (!sentry) return;

  const header = JSON.stringify({
    event_id: event.event_id,
    sent_at: new Date().toISOString(),
  });
  const body = `${header}\n${JSON.stringify({ type: "event" })}\n${JSON.stringify(event)}\n`;

  // Deliberately not awaited — see the file header. A 5s ceiling so a hung
  // Sentry cannot pin a socket open indefinitely.
  fetch(sentry.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-sentry-envelope",
      "X-Sentry-Auth":
        `Sentry sentry_version=7, sentry_client=getrankrise/1.0, sentry_key=${sentry.key}`,
    },
    body,
    signal: AbortSignal.timeout(5_000),
  }).catch((err) => {
    // One line, no recursion into reportError — a monitoring failure must not
    // generate more monitoring traffic.
    console.error(`[observability] Sentry delivery failed: ${err.message}`);
  });
}

/**
 * Records an error that the application could not handle.
 *
 * @param {Error|unknown} err
 * @param {object} [options]
 * @param {"fatal"|"error"|"warning"} [options.level]
 * @param {string} [options.source]  where it came from: "http", "campaign-runner", …
 * @param {object} [options.extra]   anything else worth having; redacted before shipping
 * @returns {string} the event id, so a 500 response can quote it back to the user
 */
export function reportError(err, { level = "error", source = "app", extra = {} } = {}) {
  const eventId = crypto.randomUUID().replace(/-/g, "");

  try {
    const error = err instanceof Error ? err : new Error(String(err));
    const ctx = currentContext();

    // ── The floor: one structured line, always ──────────────────────────────
    // Single-line JSON so a log aggregator can index it; the stack keeps its
    // newlines inside the JSON string, which every viewer un-escapes.
    console.error(
      JSON.stringify({
        level,
        source,
        eventId,
        requestId: ctx.requestId ?? null,
        method: ctx.method ?? null,
        path: ctx.path ?? null,
        userId: ctx.userId ?? null,
        clinicId: ctx.clinicId ?? null,
        name: error.name,
        message: error.message,
        code: error.code ?? null,
        stack: error.stack,
        ...redact(extra),
        ts: new Date().toISOString(),
      })
    );

    // ── The ceiling: Sentry, when configured ────────────────────────────────
    shipToSentry({
      event_id: eventId,
      timestamp: Date.now() / 1000,
      platform: "node",
      level,
      environment,
      ...(release ? { release } : {}),
      logger: source,
      exception: {
        values: [
          {
            type: error.name,
            value: error.message,
            stacktrace: { frames: parseFrames(error.stack) },
          },
        ],
      },
      // Tags are what Sentry lets you group and filter by, so the things worth
      // asking "how many of these are from one clinic?" about go here.
      tags: {
        source,
        ...(error.code ? { code: String(error.code) } : {}),
        ...(ctx.clinicId ? { clinic_id: ctx.clinicId } : {}),
      },
      ...(ctx.userId ? { user: { id: ctx.userId } } : {}),
      ...(ctx.requestId
        ? {
            request: {
              method: ctx.method,
              url: ctx.path,
              headers: { "x-request-id": ctx.requestId },
            },
          }
        : {}),
      extra: redact(extra),
    });
  } catch (reportingFailure) {
    // The whole point of the try: a bug in THIS file must not become the
    // uncaught exception that takes the process down.
    console.error(
      `[observability] failed to report an error: ${reportingFailure?.message}`
    );
  }

  return eventId;
}

/**
 * Wraps a background tick so a failure is reported rather than swallowed.
 *
 * The campaign runner and sync scheduler both catch-and-log at the top of their
 * loops, which is correct — a failed tick must not kill the interval — but it
 * also means a permanently broken loop is completely silent. This keeps the
 * catch and adds the report.
 */
export async function runSupervised(source, fn) {
  try {
    return await fn();
  } catch (err) {
    reportError(err, { source, level: "error" });
    return undefined;
  }
}
