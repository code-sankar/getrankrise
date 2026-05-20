/**
 * apiResponse.js
 * Standard response format for every API endpoint.
 *
 * Every response from our API looks like this:
 * {
 *   success: true | false,
 *   message: "Human readable message",
 *   data:    { ... }  or null
 * }
 *
 * This makes our frontend hooks predictable —
 * they always check response.data.success and read response.data.data
 */

// ── Success response ──────────────────────────────────────────────────────────
export const successResponse = (res, { message = "Success", data = null, statusCode = 200 } = {}) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

// ── Error response ────────────────────────────────────────────────────────────
export const errorResponse = (res, { message = "Something went wrong", statusCode = 500, errors = null } = {}) => {
  const body = {
    success: false,
    message,
  };
  // Only include errors field if there are validation errors
  if (errors) body.errors = errors;

  return res.status(statusCode).json(body);
};

// ── Common status shortcuts ───────────────────────────────────────────────────

// 201 Created
export const createdResponse = (res, data, message = "Created successfully") =>
  successResponse(res, { message, data, statusCode: 201 });

// 400 Bad Request
export const badRequestResponse = (res, message = "Bad request", errors = null) =>
  errorResponse(res, { message, statusCode: 400, errors });

// 401 Unauthorised
export const unauthorisedResponse = (res, message = "Unauthorised") =>
  errorResponse(res, { message, statusCode: 401 });

// 403 Forbidden
export const forbiddenResponse = (res, message = "Forbidden") =>
  errorResponse(res, { message, statusCode: 403 });

// 404 Not Found
export const notFoundResponse = (res, message = "Not found") =>
  errorResponse(res, { message, statusCode: 404 });

// 409 Conflict (e.g. email already exists)
export const conflictResponse = (res, message = "Conflict") =>
  errorResponse(res, { message, statusCode: 409 });

// 500 Server Error
export const serverErrorResponse = (res, message = "Internal server error") =>
  errorResponse(res, { message, statusCode: 500 });