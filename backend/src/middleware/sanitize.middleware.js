/**
 * sanitize.middleware.js
 * Global input hygiene, applied after body-parser and before routes.
 *
 * Scope (deliberately conservative — Joi validation does the heavy lifting):
 *   1. Strips prototype-pollution keys (__proto__, constructor, prototype).
 *   2. Removes null bytes and C0/C1 control characters (keeps \t \n \r).
 *   3. Trims surrounding whitespace on string values.
 *
 * It does NOT strip or escape HTML. Sequelize parameterises every query (so SQL
 * injection isn't the concern here), and React escapes on render, so output-time
 * encoding is the right place for XSS defence — stripping tags on input would
 * corrupt legitimate data (review replies, business names with "&", etc.).
 *
 * Express 5 note: req.query is a read-only getter, so this mutates objects in
 * place rather than reassigning req.query / req.body / req.params.
 */

const MAX_DEPTH = 20; // guard against maliciously deep payloads
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

// Remove null bytes + control chars (preserve tab/newline/carriage return), then trim.
const cleanString = (s) =>
  s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();

const sanitizeInPlace = (node, depth = 0) => {
  if (depth > MAX_DEPTH || node === null || typeof node !== "object") return;

  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const v = node[i];
      if (typeof v === "string") node[i] = cleanString(v);
      else sanitizeInPlace(v, depth + 1);
    }
    return;
  }

  for (const key of Object.keys(node)) {
    if (FORBIDDEN_KEYS.has(key)) {
      delete node[key];
      continue;
    }
    const v = node[key];
    if (typeof v === "string") node[key] = cleanString(v);
    else sanitizeInPlace(v, depth + 1);
  }
};

// ── Middleware ────────────────────────────────────────────────────────────────
export const sanitize = (req, res, next) => {
  for (const src of [req.body, req.params, req.query]) {
    if (src && typeof src === "object") sanitizeInPlace(src);
  }
  next();
};