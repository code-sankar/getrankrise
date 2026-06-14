/**
 * plans.js
 * Single source of truth for plan limits.
 *
 * The frontend may show whatever plan UI it likes, but every limit is enforced
 * server-side from this file. Never trust the client to know its own quota.
 *
 * Adding a new plan? Add it here, then update the Clinic.plan ENUM in
 * models/Clinic.js and run a migration.
 */

export const PLANS = Object.freeze({
  FREE:    "free",
  STARTER: "starter",
  PREMIUM: "premium",
});

export const PLAN_LIMITS = Object.freeze({
  [PLANS.FREE]: {
    label:                "Free",
    pricePerMonth:        0,
    // ── Data access ──────────────────────────────────────────────
    storedReviewsLimit:   20,        // hard cap on stored reviews returned
    syncIntervalHours:    null,      // no automatic sync
    // ── Features ────────────────────────────────────────────────
    aiRepliesEnabled:     false,
    competitorTracking:   false,
    competitorLimit:      0,
    pulseCampaignsEnabled: false,
    // ── Outreach budgets ────────────────────────────────────────
    smsPerMonth:          0,
    whatsAppPerMonth:     0,
    emailPerMonth:        0,
  },

  [PLANS.STARTER]: {
    label:                "Starter",
    pricePerMonth:        49,
    storedReviewsLimit:   Infinity,
    syncIntervalHours:    24,        // 24h sync
    aiRepliesEnabled:     true,
    competitorTracking:   true,
    competitorLimit:      3,
    pulseCampaignsEnabled: true,
    smsPerMonth:          50,
    whatsAppPerMonth:     0,         // no WhatsApp on Starter
    emailPerMonth:        500,
  },

  [PLANS.PREMIUM]: {
    label:                "Premium",
    pricePerMonth:        99,
    storedReviewsLimit:   Infinity,
    syncIntervalHours:    1,         // near-real-time
    aiRepliesEnabled:     true,
    competitorTracking:   true,
    competitorLimit:      10,
    pulseCampaignsEnabled: true,
    smsPerMonth:          500,
    whatsAppPerMonth:     500,
    emailPerMonth:        5000,
  },
});

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Returns the limits object for a clinic. Falls back to FREE if unknown plan. */
export const getLimitsFor = (plan) => PLAN_LIMITS[plan] || PLAN_LIMITS[PLANS.FREE];

/** Returns true if the plan can use a given feature key. */
export const planAllows = (plan, featureKey) => {
  const limits = getLimitsFor(plan);
  return Boolean(limits[featureKey]);
};

/** List of valid plan identifiers — use this when validating input. */
export const VALID_PLANS = Object.values(PLANS);