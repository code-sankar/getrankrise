// backend/src/services/reviews/providers/yelpReviews.provider.js
//
// Fetches reviews from the Yelp Fusion API (v3). READ-ONLY: Yelp has no OAuth
// for third parties and no public reply API, so this provider implements
// fetchReviewsPage ONLY. Reply publishing for Yelp reviews is already handled
// by replyPublish.service.js returning UNSUPPORTED_PLATFORM (the reply is
// saved locally and phrased "saved in GetRankRise").
//
// ── AUTH ────────────────────────────────────────────────────────────────────
// A single account-level API key (YELP_API_KEY), sent as a Bearer token. There
// is NO per-clinic credential — unlike Google, nothing is stored in
// platform_connections except the business identity. The clinic's Yelp
// business id (or alias) lives in platform_connections.external_location_id,
// exactly where Google stores its location id, so the sync loop passes it
// through as `locationId` with zero special-casing.
//
// Reading the key straight from process.env (like msg91.provider.js) keeps
// this file self-contained — no edit to config/env.js required. If you later
// centralise env access there, add YELP_API_KEY and swap the reads.
//
// ── THE YELP REVIEWS LIMITATION (read before expecting hundreds of reviews) ─
// The standard Fusion "Business Reviews" endpoint returns AT MOST 3 reviews
// per business, and each review's `text` is TRUNCATED (~160 chars, ending in
// "..."). `total` reflects the true count on Yelp, but the body only ever
// carries up to 3. Full-text / full-volume review access is a separate, gated
// Yelp partnership. This provider therefore fetches a SINGLE page by default
// and returns nextPageToken:null — paginating would only re-request the same
// capped set. If your account has expanded review access, raise YELP_PAGE_LIMIT
// (and YELP_MAX_PAGES) and the offset loop below activates on its own.
//
// This is the Yelp analogue of the GBP "quota 0 until approved" gate: the
// pipeline is correct and honest; the ceiling is the third party's, not ours.
//
// ── CONTRACT (identical to googleReviews.provider) ──────────────────────────
//   fetchReviewsPage({ accessToken, accountId, locationId, pageToken })
//     → { reviews: NormalizedReview[], nextPageToken, totalReviewCount }
//   NormalizedReview: { externalId, reviewerName, rating, text, createTime,
//                       updateTime, replied, replyText }
// accessToken/accountId are accepted but ignored, so the service's provider
// call site stays uniform across every provider.

import crypto from "crypto";

const YELP_V3 = "https://api.yelp.com/v3";

// Standard access caps the body at 3 regardless of `limit`. Kept as a knob so
// accounts with expanded review access can raise it (env override), at which
// point the offset pagination below starts doing real work.
const YELP_PAGE_LIMIT = Number(process.env.YELP_PAGE_LIMIT) || 3;

// Hard ceiling on pages walked per sync — belt-and-braces against the offset
// loop if expanded access is enabled. 1 = single page (default, matches
// standard access reality).
const YELP_MAX_PAGES = Number(process.env.YELP_MAX_PAGES) || 1;

const hasCredentials = () => Boolean(process.env.YELP_API_KEY);

// ── Error mapping (mirrors googleReviews' throwForGbpError posture) ─────────
// Coded errors so syncScheduler logs a compact, greppable reason and the
// claim-by-stamping backoff applies: one attempt per interval, never a hot
// loop. None of these are retried before the next interval.
async function throwForYelpError(res, what) {
  if (res.ok) return;
  const body = await res.text().catch(() => "");

  if (res.status === 401 || res.status === 403) {
    const err = new Error(
      `Yelp rejected the API key (${res.status}) during ${what}. Check YELP_API_KEY.`
    );
    err.code = "YELP_AUTH";
    throw err;
  }
  if (res.status === 404) {
    const err = new Error(
      `Yelp business not found (404) during ${what} — check external_location_id.`
    );
    err.code = "YELP_NOT_FOUND";
    throw err;
  }
  if (res.status === 429) {
    const err = new Error("Yelp rate limit hit (429). Will retry next interval.");
    err.code = "YELP_RATE_LIMIT";
    throw err;
  }
  const err = new Error(`Yelp ${what} failed (${res.status}): ${body.slice(0, 300)}`);
  err.code = "YELP_FETCH";
  throw err;
}

// Yelp `time_created` is "YYYY-MM-DD HH:MM:SS" with no zone. Treat as UTC and
// return ISO so `new Date()` in the service parses it unambiguously. Yelp
// exposes no per-review updated timestamp, so updateTime === createTime; the
// service's incremental early-stop still works because we request newest-first.
function toIso(yelpTime) {
  if (!yelpTime) return null;
  const s = String(yelpTime).trim().replace(" ", "T");
  const hasZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s);
  const d = new Date(hasZone ? s : `${s}Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function normalize(r) {
  return {
    externalId: r.id,
    reviewerName: r.user?.name?.slice(0, 100) || "Anonymous",
    rating: Number(r.rating) || null, // 1–5; null → service skips it (rating is NOT NULL)
    text: r.text || null,             // Yelp-truncated on standard access
    createTime: toIso(r.time_created),
    updateTime: toIso(r.time_created), // no separate update ts on Yelp
    replied: false,                    // Fusion exposes no owner responses
    replyText: null,
  };
}

async function fetchYelpPage({ businessId, offset }) {
  const url = new URL(
    `${YELP_V3}/businesses/${encodeURIComponent(businessId)}/reviews`
  );
  url.searchParams.set("limit", String(YELP_PAGE_LIMIT));
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("sort_by", "newest"); // newest-first → early-stop friendly

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.YELP_API_KEY}` },
    signal: AbortSignal.timeout(15_000),
  });
  await throwForYelpError(res, "reviews fetch");
  return res.json();
}

/**
 * One page of reviews. See the file header for the standard-access 3-review
 * cap; with default env this returns a single page (nextPageToken:null).
 *
 * @param {Object} p
 * @param {string} p.locationId  Yelp business id/alias (external_location_id)
 * @param {string} [p.pageToken] offset as a string (only used with expanded access)
 * @returns {Promise<{ reviews:Object[], nextPageToken:string|null, totalReviewCount:number|null }>}
 */
export async function fetchReviewsPage({ locationId, pageToken }) {
  const businessId = locationId; // the Yelp business id/alias
  if (!businessId) {
    const err = new Error(
      "Yelp connection has no business id (external_location_id)"
    );
    err.code = "YELP_NOT_FOUND";
    throw err;
  }

  // Keyless behaviour mirrors the mock-provider prod guard: simulate in dev so
  // the pipeline is exercisable without a key, but NEVER write fabricated
  // reviews into a production dashboard on a silently-missing key.
  if (!hasCredentials()) {
    if (
      process.env.NODE_ENV === "production" &&
      process.env.YELP_MOCK_ALLOW_PROD !== "true"
    ) {
      const err = new Error(
        "YELP_API_KEY not set — refusing to simulate Yelp reviews in production."
      );
      err.code = "YELP_NOT_CONFIGURED";
      throw err;
    }
    return simulatePage({ businessId });
  }

  const offset = Number(pageToken || 0);
  const data = await fetchYelpPage({ businessId, offset });

  const reviews = (data.reviews || []).map(normalize);
  const total = Number.isFinite(data.total) ? data.total : null;

  // Pagination only advances when expanded access is configured AND more
  // remain. With defaults (limit 3 / max 1 page) this is always null.
  const nextOffset = offset + reviews.length;
  const morePages =
    YELP_MAX_PAGES > 1 &&
    reviews.length === YELP_PAGE_LIMIT &&
    total != null &&
    nextOffset < total &&
    nextOffset < YELP_PAGE_LIMIT * YELP_MAX_PAGES;

  return {
    reviews,
    nextPageToken: morePages ? String(nextOffset) : null,
    totalReviewCount: total,
  };
}

// ── Dev simulator (no key, non-prod only) ───────────────────────────────────
// Deterministic per business id so values are stable across syncs — the same
// posture as competitor.service's mock provider. externalId prefix
// "yelp-sim-" guarantees these never collide with real Yelp review ids, and
// their platform is tagged 'Yelp' by the service's upsert.
const SIM_TEXTS = [
  ["Friendly staff and a spotless waiting room. Would recommend.", 5],
  ["Good service overall, though the wait was a little long.", 4],
  ["Average experience — nothing wrong, nothing special.", 3],
];
const SIM_NAMES = ["Jordan P.", "Casey L.", "Riley M."];
const simHash = (s) =>
  crypto.createHash("sha256").update(String(s)).digest().readUInt32BE(0);

function simulatePage({ businessId }) {
  const seed = simHash(businessId);
  const n = 1 + (seed % 3); // 1–3 reviews, like real standard access
  const reviews = [];
  for (let i = 0; i < n; i++) {
    const h = simHash(`${seed}:${i}`);
    const [text, rating] = SIM_TEXTS[h % SIM_TEXTS.length];
    const daysAgo = 3 + (h % 300);
    const created = new Date(Date.now() - daysAgo * 86400e3).toISOString();
    reviews.push({
      externalId: `yelp-sim-${seed}-${i}`,
      reviewerName: SIM_NAMES[h % SIM_NAMES.length],
      rating,
      text,
      createTime: created,
      updateTime: created,
      replied: false,
      replyText: null,
    });
  }
  return { reviews, nextPageToken: null, totalReviewCount: n };
}