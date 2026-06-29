import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import { loadClinic } from "../middleware/loadClinic.middleware.js";
import { successResponse } from "../utils/apiResponse.js";
import { getLimitsFor } from "../config/plans.js";

/**
 * subscription.routes.js — stub.
 * Returns the clinic's current plan plus the limits that apply to it (pulled
 * from config/plans.js, the single source of truth). This is enough for the
 * frontend's getUserSubscription() call and the Settings "Plan & Billing" tab.
 * Wire real billing (Stripe etc.) into a controller later.
 */
const router = Router();

router.use(protect, loadClinic);

router.get("/", (req, res) => {
  const plan   = req.clinic.plan;
  const limits = getLimitsFor(plan);
  return successResponse(res, {
    message: "Subscription fetched",
    data:    { plan, limits },
  });
});

export default router;