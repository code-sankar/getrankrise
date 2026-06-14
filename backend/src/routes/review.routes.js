import { Router } from "express";
import rateLimit from "express-rate-limit";
import { protect } from "../middleware/auth.middleware.js";
import { loadClinic } from "../middleware/loadClinic.middleware.js";
import { requireFeature } from "../middleware/tierCap.middleware.js";
import {
  validate,
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

const router = Router();

// ── AI rate limit ─────────────────────────────────────────────────────────────
// AI calls cost money. 20 generations / 5 min per IP is enough for normal
// usage but slows down anyone trying to drain credits.
const aiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max:      20,
  message:  { success: false, message: "Too many AI requests. Please slow down." },
  standardHeaders: true,
  legacyHeaders:   false,
});

router.use(protect, loadClinic);

router.get(
  "/",
  asyncHandler(listReviews)
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