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

// Statuses that mean "this subscription is over", as opposed to "temporarily
// not in good standing". past_due and paused are recoverable — the customer
// fixes their card and the same plan resumes — so they keep their plan and are
// merely blocked. canceled is terminal.
const TERMINAL_STATUSES = new Set(["canceled"]);

/**
 * Has a terminated subscription's paid-for time actually run out?
 *
 * Paddle keeps service running to the end of the period the customer already
 * paid for, so a cancellation is two events separated by up to a month: the
 * decision, and the expiry. A missing period end means we were never told when
 * it ends, in which case the cancellation is effective now.
 */
function paidPeriodHasExpired(row, now) {
  if (!row?.currentPeriodEnd) return true;
  return new Date(row.currentPeriodEnd).getTime() <= now;
}

/**
 * Builds the normalized state object. Kept separate so callers that already
 * hold a Subscription instance (e.g. inside a transaction) can reuse the shape
 * without a second query.
 *
 * ── Why the plan is computed here rather than read straight off the row ─────
 * A canceled subscription used to keep plan_type "premium" forever. Feature
 * gates still blocked it (requireFeature checks isActive), so this looked
 * handled — but every LIMIT is read from `limits`, which is derived from the
 * plan, not from isActive. So an ex-customer kept Premium's
 * storedReviewsLimit: Infinity: their review feed stayed uncapped and their
 * analytics kept aggregating over all history, months after they stopped
 * paying, while a Free clinic that never subscribed is trimmed to 20.
 *
 * Downgrading in the resolver rather than waiting for a background job means
 * the transition happens the moment the period ends, on the next read, with no
 * sweeper to fall behind or die. markCanceled() persists the same downgrade for
 * admin/reporting reads; this function is what makes enforcement correct
 * regardless of whether that write happened.
 *
 * @param {import("../../models/Subscription.js").default|null} row
 * @param {object} [options]
 * @param {number} [options.now] epoch ms, injectable for tests
 */
export function toSubscriptionState(row, { now = Date.now() } = {}) {
  const status = row?.subscriptionStatus || "active";
  const storedPlan = row?.planType || PLANS.FREE;

  // A terminal subscription drops to Free once the time it paid for is spent.
  const terminal = TERMINAL_STATUSES.has(status);
  const inGrace = terminal && !paidPeriodHasExpired(row, now);
  const plan = terminal && !inGrace ? PLANS.FREE : storedPlan;

  return {
    plan,
    status,
    // Grace counts as active. Normally Paddle keeps status "active" until a
    // scheduled cancellation takes effect, so this branch is rare — but if a
    // "canceled" ever arrives while the customer still has paid time left,
    // locking them out of the plan they have already paid for is the worse of
    // the two available mistakes.
    isActive: ACTIVE_STATUSES.has(status) || inGrace,
    limits: getLimitsFor(plan),
    currentPeriodEnd: row?.currentPeriodEnd || null,
    exists: Boolean(row),
    // True between `subscription.canceled` and the period end: the customer has
    // cancelled but is still entitled to the plan they paid for.
    inCancellationGrace: inGrace,
    // What the row literally says, for admin/debug surfaces that need to tell
    // "downgraded by expiry" from "was always Free".
    storedPlan,
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