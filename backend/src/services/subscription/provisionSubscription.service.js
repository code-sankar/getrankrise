// backend/src/services/subscription/provisionSubscription.service.js
//
// Creates the `subscriptions` row that every clinic must have.
//
// ── The bug this fixes ───────────────────────────────────────────────────────
//
// Registration created a User and a Clinic but never a Subscription. The
// migration backfilled EXISTING clinics only, so every clinic created after
// that migration ran had no billing row at all.
//
// It mostly looked fine, because getSubscriptionState() defaults a missing row
// to free/active. The failure showed up one layer down, in credits.service.js:
//
//     if (rows.length === 0) return { reserved: false, reason: "NO_SUBSCRIPTION" };
//
// NO_SUBSCRIPTION is neither PLAN_DOES_NOT_INCLUDE_CHANNEL nor a real quota
// breach, so quotaError() in request.controller.js fell through to its
// else-branch and rendered the message with undefined fields:
//
//     "You've used all undefined SMS credits this period."
//
// Creating the row up-front removes the entire class of problem: every code
// path downstream can now assume the row exists.
//
// ── Why it takes a transaction ───────────────────────────────────────────────
//
// The three rows (user → clinic → subscription) must land together or not at
// all. Before Phase 0 this was impossible: clinics were written through
// Sequelize and subscriptions through a separate pg.Pool, and a transaction
// cannot span two connection pools. A failure between the two left an orphaned
// User with no clinic and no way to retry (the email was already taken).
// Retiring pool.js is what makes this atomic.

import { Subscription } from "../../models/index.js";
import { PLANS } from "../../config/plans.js";

/**
 * Creates the default Free subscription row for a newly-registered clinic.
 *
 * Idempotent: if a row already exists for this clinic the existing one is
 * returned untouched. That matters because this is also safe to call from a
 * repair/backfill script.
 *
 * Billing fields (gateway ids, period start/end) are intentionally left NULL —
 * a free clinic has never been to checkout. They get populated by the Paddle
 * webhook on first upgrade.
 *
 * @param {object}  params
 * @param {string}  params.clinicId
 * @param {import("sequelize").Transaction} [params.transaction]
 *        Pass the registration transaction so this participates in the same
 *        atomic unit. Omitting it is only correct in backfill scripts.
 * @returns {Promise<Subscription>}
 */
export async function provisionFreeSubscription({ clinicId, transaction }) {
  if (!clinicId) {
    throw new Error("provisionFreeSubscription: clinicId is required");
  }

  const [subscription] = await Subscription.findOrCreate({
    where: { clinicId },
    defaults: {
      clinicId,
      planType: PLANS.FREE,
      subscriptionStatus: "active",
      smsCreditsUsed: 0,
      whatsappCreditsUsed: 0,
      creditsResetAt: new Date(),
    },
    transaction,
  });

  return subscription;
}

/**
 * Repair helper — gives a subscription row to any clinic missing one.
 *
 * Run this once after deploying Phase 0 to catch clinics that registered in the
 * window between the backfill migration and this fix shipping:
 *
 *     node -e "import('./src/services/subscription/provisionSubscription.service.js') \
 *       .then(m => m.backfillMissingSubscriptions()).then(n => { \
 *         console.log('backfilled', n); process.exit(0); })"
 *
 * @returns {Promise<number>} how many rows were created
 */
export async function backfillMissingSubscriptions() {
  const { Clinic } = await import("../../models/index.js");

  const orphans = await Clinic.findAll({
    attributes: ["id"],
    include: [
      {
        association: "subscription",
        required: false,
        attributes: ["id"],
      },
    ],
  });

  const missing = orphans.filter((c) => !c.subscription);

  for (const clinic of missing) {
    await provisionFreeSubscription({ clinicId: clinic.id });
  }

  return missing.length;
}