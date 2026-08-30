// backend/src/services/reviews/replyPublish.service.js
//
// Phase 8: pushes a business reply to the source platform. Google today
// (GBP v4 updateReply); Yelp has no reply API for third parties and Facebook
// arrives with its own connection type later.
//
// ── CONTRACT: THIS SERVICE NEVER THROWS ─────────────────────────────────────
// It returns a result object, always:
//
//   { published: true,  simulated?: true, updateTime }
//   { published: false, reason, message }
//
// Reasons: UNSUPPORTED_PLATFORM | LOCAL_ONLY | NO_CONNECTION | REVOKED |
//          GBP_NOT_APPROVED | GBP_AUTH | GBP_NOT_FOUND | EMPTY_REPLY |
//          PUBLISH_FAILED
//
// Why never-throw: the product decision (matching the roadmap's "graceful
// degradation while quota is 0") is that a reply is ALWAYS saved locally —
// publishing is best-effort on top. A throwing publish would tempt the
// controller into failing the whole save, and the sticky-replied merge rule
// in reviewSync.service.js exists precisely so a locally-saved, not-yet-
// published reply survives every sync until publishing succeeds. The
// controller records the outcome in reply_published_at / reply_publish_error
// (migration 0009) and phrases the response accordingly.
//
// Provider selection mirrors reviewSync.service.js exactly (REVIEWS_MOCK,
// falling back to GOOGLE_MOCK_DISCOVERY) — a mock-synced review must be
// mock-published; crossing modes would PUT fabricated review ids at the real
// Google API.

import { PlatformConnection } from "../../models/index.js";
import { getValidAccessToken } from "../google/googleAuth.service.js";
import { env } from "../../config/env.js";
import * as googleProvider from "./providers/googleReviews.provider.js";
import * as mockProvider from "./providers/mockReviews.provider.js";

function getProvider() {
  const mock =
    String(process.env.REVIEWS_MOCK ?? env.GOOGLE_MOCK_DISCOVERY ?? "").toLowerCase() === "true";
  return mock ? mockProvider : googleProvider;
}

// User-facing messages for every known failure mode. The controller stores
// these verbatim in reply_publish_error and returns them in the response —
// write them for a clinic owner, not a stack trace reader.
const MESSAGES = {
  UNSUPPORTED_PLATFORM: (p) =>
    `Publishing replies to ${p} isn't supported yet — your reply is saved in Kirtify.`,
  LOCAL_ONLY:
    "This review has no Google review ID (it was added manually), so there's nothing on Google to attach the reply to.",
  NO_CONNECTION:
    "Google Business Profile isn't connected. Your reply is saved here — connect Google in Settings to publish it.",
  REVOKED:
    "Your Google connection was revoked. Your reply is saved here — reconnect Google in Settings to publish it.",
  GBP_NOT_APPROVED:
    "Reply saved. It will be publishable on Google once Google approves API access for this app.",
  GBP_AUTH:
    "Google rejected our access while publishing. Your reply is saved — please reconnect Google in Settings.",
  GBP_NOT_FOUND:
    "Google reports this review no longer exists (it may have been removed). Your reply is saved here.",
  EMPTY_REPLY: "Reply text is empty.",
};

const fail = (reason, message) => ({
  published: false,
  reason,
  message: message || MESSAGES[reason] || "Could not publish the reply to Google.",
});

/**
 * Attempts to publish a reply to the review's source platform.
 *
 * @param {Object} p
 * @param {string} p.clinicId
 * @param {import("../../models/Review.js").default} p.review  the Review row
 * @param {string} p.replyText
 * @returns {Promise<{published:boolean, simulated?:boolean, updateTime?:string|null,
 *                    reason?:string, message?:string}>}
 */
export async function publishReplyForReview({ clinicId, review, replyText }) {
  try {
    // ── Platform + addressability gates (cheap, no I/O) ─────────────────────
    if (review.platform !== "Google") {
      return fail("UNSUPPORTED_PLATFORM", MESSAGES.UNSUPPORTED_PLATFORM(review.platform));
    }
    if (!review.externalId) {
      return fail("LOCAL_ONLY");
    }
    if (!String(replyText ?? "").trim()) {
      return fail("EMPTY_REPLY");
    }

    // ── Connection gate ─────────────────────────────────────────────────────
    const connection = await PlatformConnection.findOne({
      where: { clinicId, platform: "google", status: "connected" },
    });
    if (!connection || !connection.externalLocationId) {
      return fail("NO_CONNECTION");
    }

    const provider = getProvider();

    // Mock mode needs no token; real mode goes through Phase 1's refresh
    // logic (which flips the connection to 'revoked' on invalid_grant).
    let accessToken = null;
    if (provider === googleProvider) {
      ({ accessToken } = await getValidAccessToken(clinicId));
    }

    const result = await provider.publishReply({
      accessToken,
      accountId: connection.externalAccountId,
      locationId: connection.externalLocationId,
      reviewId: review.externalId,
      comment: replyText,
    });

    return {
      published: true,
      simulated: Boolean(result.simulated),
      updateTime: result.updateTime ?? null,
    };
  } catch (err) {
    // Known coded failures → their friendly message. Unknown → generic, with
    // the raw text preserved (truncated) for the error column.
    if (MESSAGES[err.code]) return fail(err.code);
    if (err.code === "MOCK_IN_PROD") return fail("PUBLISH_FAILED", err.message);
    console.error("publishReplyForReview unexpected error:", err);
    return fail(
      "PUBLISH_FAILED",
      `Publishing to Google failed: ${String(err.message || err).slice(0, 300)}. Your reply is saved here.`
    );
  }
}