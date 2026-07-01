import { getSubscriptionState } from "../services/subscription/subscriptionState.service.js";
import { getLimitsFor } from "../config/plans.js";

// Plans a blocked user could upgrade to. Kept generic; the frontend Upgrade
// modal decides exactly what to show from `currentPlan` + `requiredPlans`.
const UPGRADE_TARGETS = ["starter", "premium"];

/**
 * Route guard: block the request unless the clinic's plan includes `featureKey`
 * (a boolean flag from config/plans.js, e.g. "aiRepliesEnabled",
 * "competitorTracking", "pulseCampaignsEnabled") AND the subscription is active.
 *
 * On block, returns the 403 shape the frontend axios interceptor pattern-matches
 * to open the Upgrade modal.
 */
export const requireFeature = (featureKey) => async (req, res, next) => {
  try {
    const clinicId = req.clinic?.id;
    if (!clinicId) {
      return res.status(401).json({ success: false, message: "Unauthenticated" });
    }

    const sub = await getSubscriptionState(clinicId);

    // Make it available to controllers further down this route's chain.
    req.subscription = sub;

    // 1. Does the plan include this feature at all?
    if (!sub.limits[featureKey]) {
      return res.status(403).json({
        success: false,
        code: "UPGRADE_REQUIRED",
        message: "This feature isn't included in your current plan. Upgrade to unlock it.",
        currentPlan: sub.plan,
        requiredPlans: UPGRADE_TARGETS,
        feature: featureKey,
      });
    }

    // 2. Plan includes it, but the subscription must be in good standing.
    //    (past_due / canceled / paused → block until payment is fixed.)
    if (!sub.isActive) {
      return res.status(403).json({
        success: false,
        code: "SUBSCRIPTION_INACTIVE",
        message: `Your subscription is ${sub.status}. Please update your payment method to continue.`,
        currentPlan: sub.plan,
        subscriptionStatus: sub.status,
        requiredPlans: UPGRADE_TARGETS,
      });
    }

    return next();
  } catch (err) {
    console.error("requireFeature error:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/**
 * Returns the hard cap on stored reviews to return for a plan, or null when
 * the plan is unlimited (Starter/Premium use Infinity in config/plans.js).
 *
 * Accepts either a normalized subscription object (from getSubscriptionState)
 * or a plain plan string. Pure/synchronous so controllers can call it inline
 * after they've fetched the subscription state.
 */
export const capStoredReviews = (subOrPlan) => {
  const plan = typeof subOrPlan === "string" ? subOrPlan : subOrPlan?.plan;
  const cap = getLimitsFor(plan).storedReviewsLimit;
  return Number.isFinite(cap) ? cap : null;
};