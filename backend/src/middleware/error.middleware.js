import { env } from "../config/env.js";

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

  // Log in development
  if (env.NODE_ENV === "development") {
    console.error(`\n❌ [${statusCode}]: ${err.message}`);
    if (statusCode === 500) console.error(err.stack);
  }

  // Production 500s still need to be findable in the logs — without this, the
  // scrub above would make an unhandled DB error invisible everywhere.
  if (env.NODE_ENV !== "development" && statusCode === 500) {
    console.error(`[500] ${req.method} ${req.originalUrl} — ${err.name}: ${err.message}`);
  }

  return res.status(statusCode).json({
    success: false,
    message,
    ...(env.NODE_ENV === "development" && statusCode === 500 && { stack: err.stack }),
  });
};