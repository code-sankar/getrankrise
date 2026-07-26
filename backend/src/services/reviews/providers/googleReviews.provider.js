// backend/src/services/reviews/providers/googleReviews.provider.js
//
// Fetches reviews from — and, since Phase 8, publishes replies to — the
// Google Business Profile v4 API.
//
// v4 is deliberate: review READS and REPLIES never moved to the v1 Business
// Information APIs — Google's own migration table says reviews stay on v4
// (mybusiness.googleapis.com).
//
// Resource names: Phase 1 stored externalAccountId / externalLocationId as
// FULL resource names ("accounts/1234", "locations/5678"), so URLs are
// simple composition. Review externalId is the BARE reviewId (see the
// fetch mapping below) — the reply URL re-composes the full name from all
// three parts. One page = up to 50 reviews; nextPageToken paginates;
// orderBy=updateTime desc lets incremental syncs stop early.

const GBP_V4 = "https://mybusiness.googleapis.com/v4";
const PAGE_SIZE = 50;

// GBP rejects reply comments over 4096 characters. Enforced here (the last
// line of defense) AND in the service (the friendly error).
export const MAX_REPLY_COMMENT = 4096;

const STAR_TO_INT = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};

// ── Shared GBP error mapping ─────────────────────────────────────────────────
// Same diagnosis Phase 1 gives on discovery calls: quota 0 until Google
// approves the GBP API access request → RESOURCE_EXHAUSTED / 429.
async function throwForGbpError(res, what) {
  if (res.ok) return;
  const body = await res.text().catch(() => "");

  if (res.status === 429 || body.includes("RESOURCE_EXHAUSTED")) {
    const err = new Error(
      "Google Business Profile API quota is 0 — the API access request has not been approved yet."
    );
    err.code = "GBP_NOT_APPROVED";
    throw err;
  }
  if (res.status === 401 || res.status === 403) {
    const err = new Error(`Google rejected the token (${res.status}). Reconnect may be required.`);
    err.code = "GBP_AUTH";
    throw err;
  }
  if (res.status === 404) {
    // For replies: the review was deleted on Google (or the location moved).
    const err = new Error(`Google could not find this resource (404) during ${what}.`);
    err.code = "GBP_NOT_FOUND";
    throw err;
  }
  const err = new Error(`GBP ${what} failed (${res.status}): ${body.slice(0, 300)}`);
  err.code = "GBP_FETCH";
  throw err;
}

/**
 * One page of reviews.
 * @returns {{ reviews: NormalizedReview[], nextPageToken: string|null,
 *             totalReviewCount: number|null }}
 *
 * NormalizedReview: { externalId, reviewerName, rating, text, createTime,
 *                     updateTime, replied, replyText }
 */
export async function fetchReviewsPage({ accessToken, accountId, locationId, pageToken }) {
  const url = new URL(`${GBP_V4}/${accountId}/${locationId}/reviews`);
  url.searchParams.set("pageSize", String(PAGE_SIZE));
  url.searchParams.set("orderBy", "updateTime desc");
  if (pageToken) url.searchParams.set("pageToken", pageToken);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  await throwForGbpError(res, "reviews fetch");

  const data = await res.json();

  const reviews = (data.reviews || []).map((r) => ({
    externalId: r.reviewId,
    reviewerName: r.reviewer?.isAnonymous
      ? "Anonymous"
      : r.reviewer?.displayName?.slice(0, 100) || "Anonymous",
    rating: STAR_TO_INT[r.starRating] ?? null,
    text: r.comment || null,
    createTime: r.createTime || null,
    updateTime: r.updateTime || r.createTime || null,
    replied: Boolean(r.reviewReply?.comment),
    replyText: r.reviewReply?.comment || null,
  }));

  return {
    reviews,
    nextPageToken: data.nextPageToken || null,
    totalReviewCount: data.totalReviewCount ?? null,
  };
}

/**
 * Publishes (or overwrites) the business reply on a review.
 *
 * GBP v4 accounts.locations.reviews.updateReply:
 *     PUT {v4}/{accountId}/{locationId}/reviews/{reviewId}/reply
 *     body: { "comment": "..." }
 * The RPC is named updateReply but the URL path suffix is /reply — PUT is
 * create-or-replace, so re-publishing an edited reply is the same call.
 *
 * @param {Object} p
 * @param {string} p.accessToken
 * @param {string} p.accountId   full resource name, "accounts/1234"
 * @param {string} p.locationId  full resource name, "locations/5678"
 * @param {string} p.reviewId    BARE review id (our reviews.external_id)
 * @param {string} p.comment     reply text, ≤ MAX_REPLY_COMMENT chars
 * @returns {Promise<{ comment: string, updateTime: string|null }>}
 * @throws coded errors: GBP_NOT_APPROVED | GBP_AUTH | GBP_NOT_FOUND | GBP_FETCH
 */
export async function publishReply({ accessToken, accountId, locationId, reviewId, comment }) {
  const trimmed = String(comment ?? "").trim();
  if (!trimmed) {
    const err = new Error("Reply comment is empty");
    err.code = "EMPTY_REPLY";
    throw err;
  }

  const res = await fetch(
    `${GBP_V4}/${accountId}/${locationId}/reviews/${encodeURIComponent(reviewId)}/reply`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ comment: trimmed.slice(0, MAX_REPLY_COMMENT) }),
      signal: AbortSignal.timeout(20_000),
    }
  );
  await throwForGbpError(res, "reply publish");

  const data = await res.json().catch(() => ({}));
  return {
    comment: data.comment ?? trimmed,
    updateTime: data.updateTime ?? null,
  };
}