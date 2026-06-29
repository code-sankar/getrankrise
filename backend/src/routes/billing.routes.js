// backend/src/routes/billing.routes.js
import { Router } from "express";
import express from "express";
import { protect }    from "../middleware/auth.middleware.js";
import { loadClinic } from "../middleware/loadClinic.middleware.js";
import { validate }   from "../middleware/validate.middleware.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import Joi from "joi";
import {
  createCheckout,
  handleWebhook,
} from "../controllers/billing.controller.js";

const router = Router();

const checkoutSchema = Joi.object({
  plan: Joi.string().valid("starter", "premium").required(),
});

// ── Webhook (RAW body, no auth) ───────────────────────────────────────────
// MUST appear before any express.json() middleware on this path.
router.post(
  "/webhook",
  express.raw({ type: "application/json", limit: "1mb" }),
  asyncHandler(handleWebhook)
);

// ── Authenticated routes ──────────────────────────────────────────────────
router.use(protect, loadClinic);

router.post(
  "/create-checkout",
  validate(checkoutSchema),
  asyncHandler(createCheckout)
);

export default router;