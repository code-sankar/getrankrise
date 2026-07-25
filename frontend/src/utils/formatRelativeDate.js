/**
 * formatRelativeDate.js
 * "3 days ago" strings for review timestamps.
 *
 * Exists because the mock data hardcoded strings like "5 days ago" and every
 * component renders review.date as-is. Real API rows carry ISO timestamps, so
 * something has to produce the human string — this is that something, used by
 * normalizeReview() in reviewsSlice.
 *
 * Deliberately coarse: reviews don't need "42 minutes ago" precision, and
 * coarse buckets avoid a re-render dependency on the current minute.
 */

const UNITS = [
  { limit: 60, div: 1, label: () => "Just now" },
  { limit: 3600, div: 60, label: (n) => `${n} min ago` },
  { limit: 86400, div: 3600, label: (n) => `${n} hour${n === 1 ? "" : "s"} ago` },
  { limit: 604800, div: 86400, label: (n) => `${n} day${n === 1 ? "" : "s"} ago` },
  { limit: 2629800, div: 604800, label: (n) => `${n} week${n === 1 ? "" : "s"} ago` },
  { limit: 31557600, div: 2629800, label: (n) => `${n} month${n === 1 ? "" : "s"} ago` },
  { limit: Infinity, div: 31557600, label: (n) => `${n} year${n === 1 ? "" : "s"} ago` },
];

/**
 * @param {string|Date|null|undefined} input ISO string, Date, or an
 *        already-relative string ("3 days ago"), which passes through as-is.
 * @returns {string}
 */
export function formatRelativeDate(input) {
  if (!input) return "";

  // Already a relative string (legacy/mock data passing back through the
  // normaliser) → leave it alone rather than returning "".
  if (typeof input === "string" && !/^\d{4}-/.test(input) && Number.isNaN(Date.parse(input))) {
    return input;
  }

  const then = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(then.getTime())) return "";

  const seconds = Math.max(0, Math.floor((Date.now() - then.getTime()) / 1000));

  for (const { limit, div, label } of UNITS) {
    if (seconds < limit) return label(Math.floor(seconds / div));
  }
  return ""; // unreachable
}