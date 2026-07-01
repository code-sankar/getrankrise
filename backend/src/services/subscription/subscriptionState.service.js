// backend/src/services/subscription/subscriptionState.service.js
//
// Single source of truth for a clinic's plan + billing status.
//
// Every plan/feature enforcement read in the app must go through this helper so
// there is exactly ONE place that decides what plan a clinic is on. The billing
// webhook writes the `subscriptions` table; this reads it. We deliberately do
// NOT read clinics.plan for enforcement anymore — that column drifted out of
// sync with billing and caused paid customers to stay locked out of features.
//
// A clinic with no subscriptions row has never been through checkout, which by
// definition means it is on the Free tier and in good standing.

import { pool } from "../../db/pool.js";
import { getLimitsFor, PLANS } from "../../config/plans.js";

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

/**
 * @param {string} clinicId
 * @returns {Promise<{
 *   plan: string,
 *   status: string,
 *   isActive: boolean,
 *   limits: object,
 *   currentPeriodEnd: (Date|null),
 *   exists: boolean
 * }>}
 */
export async function getSubscriptionState(clinicId) {
  if (!clinicId) {
    // Defensive: no clinic → treat as Free so callers can still render limits.
    const plan = PLANS.FREE;
    return {
      plan,
      status: "active",
      isActive: true,
      limits: getLimitsFor(plan),
      currentPeriodEnd: null,
      exists: false,
    };
  }

  const { rows } = await pool.query(
    `SELECT plan_type, subscription_status, current_period_end
       FROM subscriptions
      WHERE clinic_id = $1`,
    [clinicId]
  );

  const row = rows[0] || null;
  const plan = row?.plan_type || PLANS.FREE;
  const status = row?.subscription_status || "active";

  return {
    plan,
    status,
    isActive: ACTIVE_STATUSES.has(status),
    limits: getLimitsFor(plan),
    currentPeriodEnd: row?.current_period_end || null,
    exists: Boolean(row),
  };
}