// backend/src/routes/billing.routes.js
import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import { loadClinic } from "../middleware/loadClinic.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import Joi from "joi";
import { createCheckout } from "../controllers/billing.controller.js";

const router = Router();

const checkoutSchema = Joi.object({
  plan: Joi.string().valid("starter", "premium").required(),
});

// ── NOTE: the webhook route is NOT here ───────────────────────────────────
//
// POST /api/v1/billing/webhook is registered directly in app.js, above the
// express.json() call, because Paddle's HMAC-SHA256 signature is computed over
// the exact raw bytes of the request body. Anything that parses the body first
// destroys that.
//
// This file previously declared a SECOND webhook route:
//
//     router.post("/webhook", express.raw({ type: "application/json" }), ...)
//
// It was dead code — app.js registers its handler first, and Express matches in
// registration order — but it was a live trap. Anyone deleting the app.js line
// (reasonably assuming the router owned the route) would fall through to this
// one, which sits AFTER the global express.json(). req.body would arrive as a
// parsed object rather than a Buffer, rawBody would resolve to "", and
// verifyWebhookSignature() would reject every single webhook — silently, with
// a 401 that only shows up as failed deliveries in the Paddle dashboard and
// customers stuck on the free tier after paying.
//
// One webhook route. In app.js. Before the body parser. Do not add another.

// ── Authenticated routes ──────────────────────────────────────────────────
router.use(protect, loadClinic);

router.post(
  "/create-checkout",
  validate(checkoutSchema),
  asyncHandler(createCheckout)
);

export default router;