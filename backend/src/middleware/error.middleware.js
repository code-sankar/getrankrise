import { env } from "../config/env.js";
import { reportError } from "../utils/observability.js";

// ── 404 handler ───────────────────────────────────────────────────────────────
export const notFound = (req, res, next) => {
  const err = new Error(`Route not found: ${req.originalUrl}`);
  err.statusCode = 404;
  next(err);
};

// ── Global error handler ──────────────────────────────────────────────────────
export const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || err.status || 500;
  let message    = err.message    || "Internal server error";

  // Sequelize validation error
  if (err.name === "SequelizeValidationError") {
    statusCode = 400;
    message    = err.errors.map((e) => e.message).join(", ");
  }

  // Sequelize unique constraint (e.g. email already exists)
  if (err.name === "SequelizeUniqueConstraintError") {
    statusCode = 409;
    const field = err.errors[0]?.path || "field";
    message    = `${field} already exists`;
  }

  // JWT errors
  if (err.message === "TokenExpiredError") {
    statusCode = 401;
    message    = "TokenExpiredError";
  }
  if (err.message === "JsonWebTokenError") {
    statusCode = 401;
    message    = "Invalid token";
  }

  // ── Never let driver internals reach the client ─────────────────────────────
  // The two Sequelize branches above are deliberate 400/409 translations with
  // messages written for humans. Everything else Sequelize throws —
  // SequelizeDatabaseError above all — carries the raw Postgres text, and that
  // was being returned verbatim: a non-UUID :id produced
  //   500 {"message":"invalid input syntax for type uuid: \"not-a-uuid\""}
  // which discloses column types and PG error codes to any caller. The full
  // error is still logged below (and in dev, still returned) — it just stops
  // being part of the production response body.
  //
  // Deliberately keyed on the error NAME rather than the status: an unhandled
  // DB error is always a 500 here, and a 500 has no message worth showing.
  const isDatabaseError =
    typeof err.name === "string" &&
    err.name.startsWith("Sequelize") &&
    statusCode === 500;

  if (isDatabaseError) {
    message = "Internal server error";
  }

  // Log in development — a readable stack right where you are working beats a
  // JSON blob you have to unescape.
  if (env.NODE_ENV === "development") {
    console.error(`\n❌ [${statusCode}]: ${err.message}`);
    if (statusCode === 500) console.error(err.stack);
  }

  // ── Only 500s are reported ─────────────────────────────────────────────────
  // A 400/401/403/404/409 is the API working correctly: the caller asked for
  // something they cannot have, and we told them so. Reporting those would bury
  // the real defects under a permanent flood of validation failures and expired
  // tokens, which is how an alerting channel gets muted and stops being read.
  //
  // A 500 is different by definition — it means nothing here knew what to do.
  let eventId = null;
  if (statusCode >= 500) {
    eventId = reportError(err, {
      source: "http",
      extra: {
        statusCode,
        // Query and params only. NOT the body: it carries passwords, reset
        // tokens and patient phone numbers, and redact() keys on names we would
        // have to keep guessing right forever. The request id ties this to the
        // access log if more is genuinely needed.
        query: req.query,
        params: req.params,
      },
    });
  }

  return res.status(statusCode).json({
    success: false,
    message,
    // Quoted back on a 500 so "it broke at 14:32" becomes a single log lookup
    // instead of an archaeology session. Safe to expose: it is a random id that
    // grants nothing and describes nothing.
    ...(eventId && { eventId }),
    ...(env.NODE_ENV === "development" && statusCode === 500 && { stack: err.stack }),
  });
};