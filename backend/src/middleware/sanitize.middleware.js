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
 * Express 5 note: req.query is a getter with no setter AND no memoisation — it
 * re-parses the query string and returns a FRESH object on every access. So
 * `req.query = clean` throws, and mutating `req.query` in place is silently
 * discarded (the previous version of this file did the latter, which meant
 * query strings were never sanitised at all — no control-char stripping, no
 * trim, no prototype-pollution key removal). The fix is to shadow the
 * prototype getter with a own data property holding the sanitised snapshot.
 * req.body and req.params are ordinary writable properties and are mutated
 * in place as before.
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
  for (const src of [req.body, req.params]) {
    if (src && typeof src === "object") sanitizeInPlace(src);
  }

  // See the Express 5 note in the header: req.query must be snapshotted and
  // pinned, not mutated. Reading it once here also means the query string is
  // parsed once per request instead of once per access downstream.
  const query = req.query;
  if (query && typeof query === "object") {
    sanitizeInPlace(query);
    Object.defineProperty(req, "query", {
      value: query,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }

  next();
};