import { Review } from "../models/index.js";
import {
  successResponse,
  notFoundResponse,
  badRequestResponse,
  serverErrorResponse,
} from "../utils/apiResponse.js";
import { capStoredReviews } from "../middleware/tierCap.middleware.js";
import { generateReply } from "../services/ai/ai.service.js";
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

    limit  = Math.min(parseInt(limit, 10)  || 50, 100);
    offset = Math.max(parseInt(offset, 10) || 0, 0);

    const where = { clinicId: req.clinic.id };
    if (platform) where.platform = platform;
    if (rating)   where.rating   = parseInt(rating, 10);
    if (status === "replied")   where.replied = true;
    if (status === "unreplied") where.replied = false;

    // ── Free tier hard cap on stored reviews returned ──────────────────────
    const planCap = capStoredReviews(req.clinic);
    if (planCap !== null) {
      limit = Math.min(limit, planCap - offset);
      if (limit <= 0) {
        return successResponse(res, {
          message: "Free tier limit reached. Upgrade to view more reviews.",
          data:    { reviews: [], total: planCap, cappedByPlan: true },
        });
      }
    }

    const { count, rows } = await Review.findAndCountAll({
      where,
      order:  [["reviewDate", "DESC"], ["createdAt", "DESC"]],
      limit,
      offset,
    });

    return successResponse(res, {
      message: "Reviews fetched",
      data: {
        reviews:      rows,
        total:        count,
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

    await review.update({
      replied:   true,
      replyText: reply,
      repliedAt: new Date(),
    });

    auditFromReq(req, AUDIT_EVENTS.REVIEW_REPLIED, {
      metadata: { reviewId: review.id, platform: review.platform, rating: review.rating },
    });

    return successResponse(res, {
      message: "Reply posted",
      data:    review,
    });
  } catch (err) {
    console.error("replyToReview error:", err);
    return serverErrorResponse(res);
  }
};

// ── POST /api/v1/reviews/:id/ai-reply ────────────────────────────────────────
// Gated by requireFeature("aiRepliesEnabled") in route definition
export const generateAiReply = async (req, res) => {
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

    const { reply, model } = await generateReply({
      reviewText:    reviewText || review.reviewText,
      rating:        review.rating,
      customerName:  review.reviewerName,
      clinicName:    req.clinic.clinicName,
      tone,
    });

    return successResponse(res, {
      message: "Reply generated",
      data:    { reply, model },
    });
  } catch (err) {
    console.error("generateAiReply error:", err);
    return serverErrorResponse(res);
  }
};