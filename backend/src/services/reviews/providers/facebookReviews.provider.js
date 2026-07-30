// backend/src/services/reviews/providers/facebookReviews.provider.js
//
// Fetches "reviews" from a Facebook Page via the Graph API. IMPORTANT SEMANTIC
// SHIFT: Facebook retired numeric star reviews years ago — a Page now has
// RECOMMENDATIONS, each simply "positive" or "negative" (recommendation_type),
// optionally with review_text. There is no 1–5 star from Facebook anymore.
//
// Our reviews.rating column is NOT NULL 1–5 and drives the sentiment heuristic,
// so we MAP recommendations onto it:
//     positive → 5    negative → 1    (a legacy numeric `rating`, if present, wins)
// This is a deliberate, documented lossy mapping — flip NEGATIVE_RATING to 2 if
// you'd rather negative not land at the absolute floor. Sentiment then falls
// out of the same rating heuristic every other platform uses, so the analytics
// dashboards stay coherent across platforms.
//
// ── AUTH: PAGE ACCESS TOKEN, not a user token ───────────────────────────────
// The service passes `accessToken` = the long-lived PAGE token minted during
// connect (facebookAuth.getValidPageToken); `locationId` = the Page ID. There
// is no per-call refresh — a Page token derived from a long-lived user token
// doesn't expire until the user deauthorizes the app, so a code-190 here means
// "reconnect", not "retry".
//
// ── THE APPROVAL GATE (Facebook's analog of GBP quota 0) ────────────────────
// Reading reviews of Pages the connecting user doesn't personally admin needs
// pages_read_user_content + pages_read_engagement, which require Facebook App
// Review. Before approval, only Pages where the user holds an admin/tester/
// developer role return data; others yield a permissions error → FB_PERMISSION.
// So the connect flow is fully testable pre-approval against your own Page.
//
// ── DEDUP: synthesize a STABLE external_id ──────────────────────────────────
// The /ratings edge items carry no dependable top-level id, and our dedup index
// (uniq_reviews_clinic_platform_external) only covers external_id IS NOT NULL
// rows — a NULL id would re-insert on every sync. So we derive a stable id:
// open_graph_story.id when present, else a hash of (pageId + reviewer +
// created_time + type). Same recommendation → same id → idempotent upsert,
// exactly like Google's reviewId.
//
// CONTRACT (identical to the other providers):
//   fetchReviewsPage({ accessToken, accountId, locationId, pageToken })
//     → { reviews, nextPageToken, totalReviewCount }
//   accountId is accepted but unused (Facebook reads straight off the Page id).

import crypto from "crypto";

const GRAPH = "https://graph.facebook.com/v21.0";
const PAGE_SIZE = 50;

// Recommendation → 1–5 mapping. The ONLY place this lives — tune here.
const POSITIVE_RATING = 5;
const NEGATIVE_RATING = 1;

function ratingFor(item) {
  // Legacy numeric review (rare, pre-recommendations) wins if present & valid.
  if (Number.isInteger(item.rating) && item.rating >= 1 && item.rating <= 5) {
    return item.rating;
  }
  if (item.recommendation_type === "positive") return POSITIVE_RATING;
  if (item.recommendation_type === "negative") return NEGATIVE_RATING;
  return null; // neither → the service skips it (rating is NOT NULL)
}

function stableId(pageId, item) {
  if (item.open_graph_story?.id) return `fb_${item.open_graph_story.id}`;
  const basis = [
    pageId,
    item.reviewer?.id || item.reviewer?.name || "anon",
    item.created_time || "",
    item.recommendation_type || "",
  ].join("|");
  return `fb_${crypto.createHash("sha1").update(basis).digest("hex").slice(0, 24)}`;
}

// Graph can answer 200-with-{error} or 4xx-with-{error}. Map codes to the same
// coded-error posture the other providers use so the scheduler's claim-by-
// stamping backoff applies (one attempt per interval, never a hot loop).
function raiseGraphError(status, body, what) {
  const error = body?.error;
  if (!error && status < 400) return;

  const code = error?.code;
  const message = error?.message || `HTTP ${status}`;

  if (code === 190) {
    const e = new Error(`Facebook token invalid or expired during ${what} (code 190). Reconnect required.`);
    e.code = "FB_AUTH";
    throw e;
  }
  if (code === 10 || code === 200 || code === 3 || code === 299) {
    const e = new Error(
      `Facebook denied ${what} (code ${code}): ${message}. This usually means the app's ` +
        `review permissions aren't approved yet, or the token can't read this Page.`
    );
    e.code = "FB_PERMISSION";
    throw e;
  }
  if (code === 4 || code === 17 || code === 32 || code === 613) {
    const e = new Error(`Facebook rate limit during ${what} (code ${code}). Will retry next interval.`);
    e.code = "FB_RATE_LIMIT";
    throw e;
  }
  const e = new Error(`Facebook ${what} failed (${status}, code ${code}): ${String(message).slice(0, 200)}`);
  e.code = "FB_FETCH";
  throw e;
}

/**
 * One page of recommendations.
 * @param {Object} p
 * @param {string} p.accessToken  PAGE access token (from getValidPageToken)
 * @param {string} p.locationId   Facebook Page id
 * @param {string} [p.pageToken]  Graph `after` cursor
 * @returns {Promise<{ reviews:Object[], nextPageToken:string|null, totalReviewCount:number|null }>}
 */
export async function fetchReviewsPage({ accessToken, locationId, pageToken }) {
  if (!accessToken) {
    const e = new Error("Missing Facebook Page access token");
    e.code = "FB_AUTH";
    throw e;
  }
  if (!locationId) {
    const e = new Error("Facebook connection has no Page id");
    e.code = "FB_NOT_FOUND";
    throw e;
  }

  const url = new URL(`${GRAPH}/${encodeURIComponent(locationId)}/ratings`);
  url.searchParams.set(
    "fields",
    "reviewer,recommendation_type,review_text,rating,created_time,open_graph_story"
  );
  url.searchParams.set("limit", String(PAGE_SIZE));
  if (pageToken) url.searchParams.set("after", pageToken);

  const res = await fetch(url, {
    // Token in the header, not the query string — keeps it out of any URL logs.
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(20_000),
  });

  let body = {};
  try {
    body = await res.json();
  } catch {
    /* non-JSON body → raiseGraphError handles via status */
  }
  raiseGraphError(res.status, body, "ratings fetch");

  const reviews = (body.data || []).map((item) => ({
    externalId: stableId(locationId, item),
    reviewerName: item.reviewer?.name?.slice(0, 100) || "Anonymous",
    rating: ratingFor(item),
    text: item.review_text || null,
    createTime: item.created_time || null,
    updateTime: item.created_time || null, // Graph exposes no reliable update ts
    replied: false, // owner replies aren't returned by /ratings
    replyText: null,
  }));

  // Cursor pagination: only advance when Graph says there IS a next page.
  const nextPageToken = body.paging?.next ? body.paging?.cursors?.after || null : null;

  return {
    reviews,
    nextPageToken,
    totalReviewCount: null, // Facebook doesn't return a total for /ratings
  };
}