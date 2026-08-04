// backend/src/routes/request.routes.js
//
// The review-REQUEST router (outbound SMS/Email asks sent to individual
// patients). Mounted at /api/v1/requests in app.js.
//
// ── WHY THIS FILE WAS REWRITTEN ─────────────────────────────────────────────
// The Step-1 revision of review.routes.js was written to this path by mistake,
// overwriting whatever request router lived here. app.js mounts THIS file at
// /api/v1/requests, so for as long as that stood:
//   * every /api/v1/requests/* endpoint 404'd (the SendRequests page's
//     getUserRequests() swallowed the error and the UI fell back to the four
//     hardcoded mock rows in store/requestsSlice.js — which is why this looked
//     like it worked)
//   * POST /api/v1/reviews/sync 404'd, because the router that declares it was
//     sitting here under the wrong mount point
//   * /api/v1/requests/:id/ai-reply existed, which is meaningless
//
// The Step-1 review router has been restored to review.routes.js. This file is
// the request router, rebuilt against what request.controller.js actually
// exports.
//
// ── PLAN ENFORCEMENT: deliberately no requireFeature here ───────────────────
// Same reasoning as reviews/sync. Sending is gated by the CREDIT reservation
// inside sendRequest(): Free has smsPerMonth 0 / whatsAppPerMonth 0 /
// emailPerMonth 0, so reserveCredits and reserveUsage return
// PLAN_DOES_NOT_INCLUDE_CHANNEL with the same 403 UPGRADE_REQUIRED shape the
// frontend's axios interceptor already pattern-matches into the upgrade modal.
// One enforcement path, not two. Adding a requireFeature gate here would give
// Free users a different error for the same wall.
//
// Reading history (GET /) is NOT gated — a clinic that downgrades must still
// see what it sent.

import { Router } from "express";
import rateLimit from "express-rate-limit";
import { protect } from "../middleware/auth.middleware.js";
import { loadClinic } from "../middleware/loadClinic.middleware.js";
import {
  validate,
  sendRequestSchema,
  idParamSchema,
} from "../middleware/validate.middleware.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import Joi from "joi";
import {
  sendRequest,
  listRequests,
  updateRequestStatus,
} from "../controllers/request.controller.js";

const router = Router();

// ── Send rate limit ──────────────────────────────────────────────────────────
// Real money per send. The hard cap is the monthly credit/usage meter inside
// the controller; this is the brake that stops a script from draining a
// Premium clinic's 500 credits in ten seconds before the meter arithmetic even
// runs. 30 sends / 5 min per IP is far above human pace.
const sendLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  message: {
    success: false,
    message: "Too many requests sent. Please wait a few minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Status transitions the client is allowed to report. "Failed" is absent on
// purpose — only the server marks a send failed, from provider feedback.
const statusSchema = Joi.object({
  status: Joi.string().valid("Sent", "Opened", "Reviewed").required(),
});

router.use(protect, loadClinic);

// GET /api/v1/requests — send history, newest first.
// Returns a bare array in `data` because the frontend hook does
// dispatch(addUserRequests(response.data.data)) and the reducer spreads it.
router.get("/", asyncHandler(listRequests));

// POST /api/v1/requests — send one review request (SMS / Email / Both).
router.post(
  "/",
  sendLimiter,
  validate(sendRequestSchema),
  asyncHandler(sendRequest),
);

// PATCH /api/v1/requests/:id/status — advance Sent → Opened → Reviewed.
router.patch(
  "/:id/status",
  validate(idParamSchema, "params"),
  validate(statusSchema),
  asyncHandler(updateRequestStatus),
);

export default router;
