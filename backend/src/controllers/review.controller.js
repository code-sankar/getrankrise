// backend/src/controllers/review.controller.js
//
// PHASE 8 CHANGE — replyToReview now PUBLISHES to Google (GBP v4 updateReply
// via replyPublish.service.js) with save-always semantics:
//
//   attempt publish → save the reply locally REGARDLESS of publish outcome
//   → record the outcome in reply_published_at / reply_publish_error
//   → phrase the response for what actually happened
//
// The reply is never lost to a publish failure: quota-0 (approval gate),
// disconnected Google, revoked grants, deleted reviews, provider 500s — in
// every case the reply lands in our DB with replied=true, and the
// sticky-replied merge rule in reviewSync.service.js keeps it there across
// syncs until publishing eventually succeeds. That rule was written waiting
// for this file.
//
// listReviews and generateAiReply are unchanged from the Phase 5 copy.

import {
  reserveUsage,
  refundUsage,
  usageErrorResponse,
} from "../services/usage/usage.service.js";

import { Review } from "../models/index.js";
import {
  successResponse,
  notFoundResponse,
  badRequestResponse,
  serverErrorResponse,
} from "../utils/apiResponse.js";
import { capStoredReviews } from "../middleware/tierCap.middleware.js";
import { getSubscriptionState } from "../services/subscription/subscriptionState.service.js";
import { generateReply } from "../services/ai/ai.service.js";
import { publishReplyForReview } from "../services/reviews/replyPublish.service.js";
import { auditFromReq, AUDIT_EVENTS } from "../utils/auditLog.js";

// ── GET /api/v1/reviews ───────────────────────────────────────────────────────
// Query params:
//   ?platform=Google|Yelp|Facebook
//   ?rating=1..5
//   ?status=replied|unreplied
//   ?limit=20 (max 100; further capped by plan for Free tier)
//   ?offset=0
export const listReviews = async (req, res) => {
  try {
    const { platform, rating, status } = req.query;
    let { limit, offset } = req.query;

    // listReviewsQuerySchema (route-level) has already validated the enum
    // values, coerced these to numbers and applied the defaults. The clamps
    // below are defence in depth for any future caller that reaches this
    // function without passing through that middleware.
    //
    // Note the LOWER bound on limit: the previous `Math.min(x, 100)` bounded
    // only the top, so a negative limit passed straight through into
    // `LIMIT -5` and Postgres rejected the statement as a 500.
    limit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    offset = Math.max(parseInt(offset, 10) || 0, 0);

    const where = { clinicId: req.clinic.id };
    if (platform) where.platform = platform;
    if (rating) where.rating = parseInt(rating, 10);
    if (status === "replied") where.replied = true;
    if (status === "unreplied") where.replied = false;

    // ── Free tier hard cap on stored reviews returned ──────────────────────
    // Plan comes from the subscription (single source of truth), not clinic.plan.
    const sub = await getSubscriptionState(req.clinic.id);
    const planCap = capStoredReviews(sub);
    if (planCap !== null) {
      limit = Math.min(limit, planCap - offset);
      if (limit <= 0) {
        return successResponse(res, {
          message: "Free tier limit reached. Upgrade to view more reviews.",
          data: {
            reviews: [],
            total: planCap,
            limit: 0,
            offset,
            cappedByPlan: true,
          },
        });
      }
    }

    const { count, rows } = await Review.findAndCountAll({
      where,
      order: [
        ["reviewDate", "DESC"],
        ["createdAt", "DESC"],
      ],
      limit,
      offset,
    });

    // ── `total` must mean ONE thing ─────────────────────────────────────────
    // It was `planCap` on the capped early-return above but the raw table
    // `count` here, so a Free clinic with 247 stored reviews saw total:20 or
    // total:247 depending purely on the offset it happened to ask for. The
    // Dashboard renders "N of TOTAL Reviews" from this, so the number visibly
    // changed as the user paged.
    //
    // The consistent meaning is "how many rows this plan will let you see",
    // which for a capped plan is the cap (or fewer, if they genuinely have
    // fewer) and for an uncapped plan is the real count.
    const visibleTotal = planCap === null ? count : Math.min(count, planCap);

    return successResponse(res, {
      message: "Reviews fetched",
      data: {
        reviews: rows,
        total: visibleTotal,
        limit,
        offset,
        cappedByPlan: planCap !== null,
      },
    });
  } catch (err) {
    console.error("listReviews error:", err);
    return serverErrorResponse(res);
  }
};

// ── POST /api/v1/reviews/:id/reply ───────────────────────────────────────────
// Save-always + best-effort publish. See file header.
export const replyToReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { reply } = req.body;

    // Ownership check: scope by clinicId, NOT just id
    const review = await Review.findOne({
      where: { id, clinicId: req.clinic.id },
    });
    if (!review) {
      return notFoundResponse(res, "Review not found");
    }

    if (review.replied) {
      return badRequestResponse(res, "This review has already been replied to");
    }

    // ── 1. Best-effort publish to the source platform ──────────────────────
    // Never throws — returns { published, ... } (see replyPublish.service.js).
    const publish = await publishReplyForReview({
      clinicId: req.clinic.id,
      review,
      replyText: reply,
    });

    // ── 2. Save locally REGARDLESS of publish outcome ──────────────────────
    await review.update({
      replied: true,
      replyText: reply,
      repliedAt: new Date(),
      replyPublishedAt: publish.published ? new Date() : null,
      replyPublishError: publish.published ? null : publish.message,
    });

    auditFromReq(req, AUDIT_EVENTS.REVIEW_REPLIED, {
      metadata: {
        reviewId: review.id,
        platform: review.platform,
        rating: review.rating,
        publishedToPlatform: publish.published,
        publishReason: publish.reason ?? null,
        simulated: publish.simulated ?? false,
      },
    });

    // ── 3. Phrase the truth ────────────────────────────────────────────────
    const message = publish.published
      ? publish.simulated
        ? "Reply posted (mock mode — simulated publish to Google)"
        : "Reply posted to Google"
      : publish.message; // every reason's message already says "saved here"

    return successResponse(res, {
      message,
      data: {
        review,
        publish: {
          published: publish.published,
          reason: publish.reason ?? null,
          simulated: publish.simulated ?? false,
        },
      },
    });
  } catch (err) {
    console.error("replyToReview error:", err);
    return serverErrorResponse(res);
  }
};

// ── POST /api/v1/reviews/:id/ai-reply ────────────────────────────────────────
// Gated by requireFeature("aiRepliesEnabled") in the route definition
export const generateAiReply = async (req, res) => {
  let reserved = false;
  try {
    const { id } = req.params;
    const { reviewText, tone } = req.body;

    // Verify the review actually belongs to this clinic — guards against
    // someone passing an arbitrary review ID
    const review = await Review.findOne({
      where: { id, clinicId: req.clinic.id },
    });
    if (!review) {
      return notFoundResponse(res, "Review not found");
    }

    // ── Reserve BEFORE the OpenAI call ─────────────────────────────────
    const u = await reserveUsage({ clinicId: req.clinic.id, metric: "ai_reply" });
    if (!u.reserved) {
      return usageErrorResponse(res, u);
    }
    reserved = true;

    const { reply, model, fallback, fallbackReason } = await generateReply({
      reviewText: reviewText || review.reviewText,
      rating: review.rating,
      customerName: review.reviewerName,
      clinicName: req.clinic.clinicName,
      tone,
    });

    // ── A canned template is not an AI reply, and must not be billed as one ──
    // ai.service falls back to a static template when OPENAI_API_KEY is absent
    // or the provider call fails. Both paths return a polished, plausible
    // sentence, so the response was indistinguishable from a real generation —
    // the caller discarded `model`, the customer's monthly ai_reply quota was
    // decremented, and a server with no OpenAI key at all looked like a working
    // AI feature.
    //
    // Refunding here keeps the reserve→act→refund shape the rest of the app
    // uses for provider failures, and `usage` below then reports the quota the
    // customer actually has left rather than one unit less.
    let usage = { used: u.used, limit: u.limit, remaining: u.remaining };
    if (fallback) {
      await refundUsage({ clinicId: req.clinic.id, metric: "ai_reply" });
      reserved = false; // already returned; the catch must not refund twice
      usage = {
        used: Math.max(u.used - 1, 0),
        limit: u.limit,
        remaining: u.limit === Infinity ? Infinity : u.remaining + 1,
      };
    }

    return successResponse(res, {
      message: fallback
        ? "Draft written from a template — AI is not available right now, so this didn't use any of your AI credits."
        : "Reply generated",
      data: {
        reply,
        model,
        // Explicit, so the UI can label the draft instead of presenting a
        // template as a model-written reply.
        fallback: Boolean(fallback),
        fallbackReason: fallbackReason ?? null,
        // Let the UI show "187 of 200 AI replies left this month"
        usage,
      },
    });
  } catch (err) {
    // OpenAI failed AFTER we reserved → give the unit back.
    if (reserved) {
      await refundUsage({ clinicId: req.clinic.id, metric: "ai_reply" });
    }
    console.error("generateAiReply error:", err);
    return serverErrorResponse(res);
  }
};