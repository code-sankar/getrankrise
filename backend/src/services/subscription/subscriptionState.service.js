// backend/src/services/subscription/subscriptionState.service.js
//
// Single source of truth for a clinic's plan + billing status.
//
// Every plan/feature enforcement read in the app must go through this helper so
// there is exactly ONE place that decides what plan a clinic is on. The billing
// webhook writes the `subscriptions` table; this reads it. We deliberately do
// NOT read clinics.plan for enforcement — that column drifted out of sync with
// billing and caused paid customers to stay locked out of features.
//
// A clinic with no subscriptions row has never been through checkout, which by
// definition means it is on the Free tier and in good standing. Since Phase 0
// every new clinic gets its row transactionally at registration
// (provisionSubscription.service.js), so the fallback below is now genuinely a
// defensive path rather than the common case it used to be.
//
// PHASE 0 CHANGE: reads go through the Subscription model on the shared
// Sequelize connection instead of a second pg.Pool.

import { Subscription } from "../../models/index.js";
import { getLimitsFor, PLANS } from "../../config/plans.js";

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

/**
 * Builds the normalized state object. Kept separate so callers that already
 * hold a Subscription instance (e.g. inside a transaction) can reuse the shape
 * without a second query.
 *
 * @param {import("../../models/Subscription.js").default|null} row
 */
export function toSubscriptionState(row) {
  const plan = row?.planType || PLANS.FREE;
  const status = row?.subscriptionStatus || "active";

  return {
    plan,
    status,
    isActive: ACTIVE_STATUSES.has(status),
    limits: getLimitsFor(plan),
    currentPeriodEnd: row?.currentPeriodEnd || null,
    exists: Boolean(row),
  };
}

/**
 * @param {string} clinicId
 * @param {object} [options]
 * @param {import("sequelize").Transaction} [options.transaction]
 * @returns {Promise<{
 *   plan: string,
 *   status: string,
 *   isActive: boolean,
 *   limits: object,
 *   currentPeriodEnd: (Date|null),
 *   exists: boolean
 * }>}
 */
export async function getSubscriptionState(clinicId, { transaction } = {}) {
  if (!clinicId) {
    // Defensive: no clinic → treat as Free so callers can still render limits.
    return toSubscriptionState(null);
  }

  const row = await Subscription.findOne({
    where: { clinicId },
    attributes: ["planType", "subscriptionStatus", "currentPeriodEnd"],
    transaction,
  });

  return toSubscriptionState(row);
}