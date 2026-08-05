// backend/src/middleware/requestContext.middleware.js
//
// Gives every request an id and makes it reachable from anywhere in the call
// tree without threading a parameter through forty function signatures.
//
// ── Why this has to be AsyncLocalStorage ────────────────────────────────────
// The errors worth investigating are thrown deep: inside credits.service.js,
// inside a provider client, inside an upsert. Those functions take a clinicId
// and nothing else, and giving them a context argument purely so a log line can
// be correlated would be a large, invasive change that every future service
// would have to remember to participate in. ALS survives await boundaries, so
// reportError() can pick the context up on its own.
//
// ── Where the id comes from ─────────────────────────────────────────────────
// An inbound X-Request-Id is honoured when present, because a load balancer or
// upstream proxy has usually already minted one and a chain that changes ids at
// every hop cannot be followed. It is length-capped and stripped of anything
// non-trivial: the value is echoed back in a response header, so it is
// attacker-controlled input and must not be able to carry a newline into a log
// line or a header.

import crypto from "node:crypto";
import { requestContext } from "../utils/observability.js";

const SAFE_ID = /^[A-Za-z0-9._-]{1,64}$/;

export const withRequestContext = (req, res, next) => {
  const inbound = req.get("x-request-id");
  const requestId = SAFE_ID.test(inbound || "") ? inbound : crypto.randomUUID();

  // Echoed so a user reporting "it broke" can be matched to the exact log line,
  // and so a client can correlate its own telemetry with ours.
  res.setHeader("X-Request-Id", requestId);

  // Mutable store: `protect` and `loadClinic` run AFTER this and fill in who
  // the request turned out to belong to. Errors thrown before those run simply
  // carry nulls, which is accurate rather than missing.
  const store = {
    requestId,
    method: req.method,
    path: req.originalUrl,
    userId: null,
    clinicId: null,
  };

  // req.context is the escape hatch for code that has the request in hand and
  // would rather not reach through ALS.
  req.context = store;

  requestContext.run(store, next);
};

/**
 * Fills in identity once auth middleware has resolved it.
 *
 * Mounted after protect/loadClinic in app.js rather than inside them, so those
 * two keep doing exactly one job each and this stays optional — a route that
 * skips auth simply never calls it.
 */
export const enrichRequestContext = (req, _res, next) => {
  if (req.context) {
    req.context.userId = req.user?.id ?? null;
    req.context.clinicId = req.clinic?.id ?? null;
  }
  next();
};
