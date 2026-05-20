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

  // Log in development
  if (env.NODE_ENV === "development") {
    console.error(`\n❌ [${statusCode}]: ${message}`);
    if (statusCode === 500) console.error(err.stack);
  }

  return res.status(statusCode).json({
    success: false,
    message,
    ...(env.NODE_ENV === "development" && statusCode === 500 && { stack: err.stack }),
  });
};