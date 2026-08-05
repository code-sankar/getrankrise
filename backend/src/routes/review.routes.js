// backend/src/routes/review.routes.js
//
// RESTORED. This content was written to request.routes.js by mistake, which
// meant it was mounted at /api/v1/requests instead of /api/v1/reviews — so
// POST /api/v1/reviews/sync 404'd and the whole request router was clobbered.
// It now lives where app.js's reviewRoutes import expects it.
//
// STEP 1 CHANGE (preserved from the original): adds POST /sync →
// reviewSync.controller.js syncNow. The controller (with its
// reserve-before-sync metering and refund-on-failure) existed but no route
// pointed at it, so the frontend's "Sync now" button had nothing to call.
//
// Route order note: /sync is registered before the /:id/* routes. With the
// current paths there is no actual capture conflict (/:id/reply is two
// segments, /sync is one), but keeping static paths above parameterized ones
// is the convention that prevents the day someone adds a one-segment /:id
// route and "sync" silently becomes a review ID.

import { Router } from "express";
import rateLimit from "express-rate-limit";
import { protect } from "../middleware/auth.middleware.js";
import { loadClinic } from "../middleware/loadClinic.middleware.js";
import { requireFeature } from "../middleware/tierCap.middleware.js";
import {
  validate,
  listReviewsQuerySchema,
  replyToReviewSchema,
  generateAiReplySchema,
  idParamSchema,
} from "../middleware/validate.middleware.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  listReviews,
  replyToReview,
  generateAiReply,
} from "../controllers/review.controller.js";
import { syncNow } from "../controllers/reviewSync.controller.js";

const router = Router();

// ── AI rate limit ─────────────────────────────────────────────────────────────
// AI calls cost money. 20 generations / 5 min per IP is enough for normal
// usage but slows down anyone trying to drain credits. (The hard monthly cap
// is the ai_reply usage meter inside the controller — this is just a brake.)
const aiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max:      20,
  message:  { success: false, message: "Too many AI requests. Please slow down." },
  standardHeaders: true,
  legacyHeaders:   false,
});

// ── Manual-sync rate limit ────────────────────────────────────────────────────
// The real budget is the review_sync DAILY meter reserved inside syncNow
// (Free 0 / Starter 6 / Premium 48). This per-IP limiter only stops rapid
// hammering of the button before the meter query even runs.
const syncLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max:      10,
  message:  { success: false, message: "Too many sync requests. Please wait a few minutes." },
  standardHeaders: true,
  legacyHeaders:   false,
});

router.use(protect, loadClinic);

// Query params are validated here rather than defensively parsed in the
// controller: an out-of-range platform/rating/limit used to reach Postgres and
// come back as a 500. Joi also coerces limit/offset to numbers and applies the
// defaults, so the controller receives values it can trust.
router.get(
  "/",
  validate(listReviewsQuerySchema, "query"),
  asyncHandler(listReviews)
);

// ── POST /api/v1/reviews/sync — the manual "Sync now" button ─────────────────
// No requireFeature gate here on purpose: the Free tier's review_sync limit
// is 0 in config/plans.js, so reserveUsage() inside the controller returns
// PLAN_DOES_NOT_INCLUDE_FEATURE with the standard 403 shape the frontend's
// upgrade-modal interceptor already understands. One enforcement path, not two.
router.post(
  "/sync",
  syncLimiter,
  asyncHandler(syncNow)
);

router.post(
  "/:id/reply",
  validate(idParamSchema, "params"),
  validate(replyToReviewSchema),
  asyncHandler(replyToReview)
);

router.post(
  "/:id/ai-reply",
  aiLimiter,
  requireFeature("aiRepliesEnabled"),                // Free tier blocked here
  validate(idParamSchema, "params"),
  validate(generateAiReplySchema),
  asyncHandler(generateAiReply)
);

export default router;