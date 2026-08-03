import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import { loadClinic } from "../middleware/loadClinic.middleware.js";
import { successResponse } from "../utils/apiResponse.js";
import { getSubscriptionState } from "../services/subscription/subscriptionState.service.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { getCredits } from "../controllers/subscription.controller.js";

/**
 * subscription.routes.js
 * Returns the clinic's ACTUAL plan + status from the subscriptions table (the
 * single source of truth written by the billing webhook) plus the limits that
 * apply. Previously this read clinics.plan, which showed "free" even after a
 * successful upgrade. Feeds the frontend getUserSubscription() call and the
 * Settings "Plan & Billing" tab.
 */
const router = Router();

router.use(protect, loadClinic);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const sub = await getSubscriptionState(req.clinic.id);
    return successResponse(res, {
      message: "Subscription fetched",
      data: {
        plan:             sub.plan,
        status:           sub.status,
        isActive:         sub.isActive,
        currentPeriodEnd: sub.currentPeriodEnd,
        limits:           sub.limits,
      },
    });
  })
);

// GET /api/v1/subscription/credits — the remaining SMS/WhatsApp balance the
// CreditsPill renders. The controller existed from the start but was never
// attached to a router, so the pill silently 404'd on every page load.
router.get("/credits", asyncHandler(getCredits));

export default router;