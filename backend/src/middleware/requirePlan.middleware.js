// backend/src/middleware/requirePlan.middleware.js
import { pool } from "../db/pool.js";
import { PLANS } from "../config/plans.js";

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

/**
 * Gates a route behind one or more paid plans.
 *
 * Usage:
 *   router.post("/competitors", requirePlan(["starter", "premium"]), handler);
 *
 * On block, returns 403 with a stable response shape the frontend can
 * pattern-match to trigger the Upgrade modal:
 *   { success:false, code:"UPGRADE_REQUIRED", currentPlan, requiredPlans, message }
 */
export const requirePlan = (allowedPlans = [PLANS.STARTER, PLANS.PREMIUM]) => {
  return async (req, res, next) => {
    const clinicId = req.clinic?.id;
    if (!clinicId) {
      return res.status(401).json({ success: false, message: "Unauthenticated" });
    }

    const { rows } = await pool.query(
      `SELECT plan_type, subscription_status, current_period_end
         FROM subscriptions WHERE clinic_id = $1`,
      [clinicId]
    );

    const sub = rows[0] || { plan_type: "free", subscription_status: "active" };

    // 1. Plan must be in the allowed list
    if (!allowedPlans.includes(sub.plan_type)) {
      return res.status(403).json({
        success:        false,
        code:           "UPGRADE_REQUIRED",
        message:        `This feature requires the ${allowedPlans.join(" or ")} plan.`,
        currentPlan:    sub.plan_type,
        requiredPlans:  allowedPlans,
      });
    }

    // 2. Status must be active/trialing (past_due, canceled, paused → block)
    if (!ACTIVE_STATUSES.has(sub.subscription_status)) {
      return res.status(403).json({
        success:            false,
        code:               "SUBSCRIPTION_INACTIVE",
        message:            `Your subscription is ${sub.subscription_status}. Please update your payment method to continue.`,
        currentPlan:        sub.plan_type,
        subscriptionStatus: sub.subscription_status,
        requiredPlans:      allowedPlans,
      });
    }

    req.subscription = sub;
    next();
  };
};