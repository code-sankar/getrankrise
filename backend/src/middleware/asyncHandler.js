// backend/src/middleware/asyncHandler.js
// Routes async controller rejections into errorHandler instead of leaving them
// as unhandled rejections (which server.js treats as fatal).
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);