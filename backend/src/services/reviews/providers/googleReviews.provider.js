// backend/src/services/reviews/providers/googleReviews.provider.js
//
// Fetches reviews from the Google Business Profile v4 API.
//
// v4 is deliberate: review READS never moved to the v1 Business Information
// APIs — Google's own migration table says reviews stay on v4
// (mybusiness.googleapis.com). Same API family Phase 1 noted for reply
// publishing later.
//
// Resource names: Phase 1 stored externalAccountId / externalLocationId as
// FULL resource names ("accounts/1234", "locations/5678"), so the URL is
// simple composition. One page = up to 50 reviews; nextPageToken paginates;
// orderBy=updateTime desc lets incremental syncs stop early.

const GBP_V4 = "https://mybusiness.googleapis.com/v4";
const PAGE_SIZE = 50;

const STAR_TO_INT = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};

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

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // Same diagnosis Phase 1 gives on discovery calls: quota 0 until Google
    // approves the GBP API access request → RESOURCE_EXHAUSTED / 429.
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
    const err = new Error(`GBP reviews fetch failed (${res.status}): ${body.slice(0, 300)}`);
    err.code = "GBP_FETCH";
    throw err;
  }

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