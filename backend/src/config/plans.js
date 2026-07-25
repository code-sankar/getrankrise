/**
 * plans.js
 * Single source of truth for plan limits.
 *
 * The frontend may show whatever plan UI it likes, but every limit is enforced
 * server-side from this file. Never trust the client to know its own quota.
 *
 * Adding a new plan? Add it here, then update the Clinic.plan ENUM in
 * models/Clinic.js and run a migration.
 *
 * PHASE 5 ADDITIONS — the four keys consumed by services/usage/usage.service.js:
 *   aiRepliesPerMonth      per-clinic OpenAI spend cap. Previously the ONLY
 *                          limit on AI generation was a per-IP rate limiter
 *                          (20/5min) — a single Starter clinic could burn
 *                          unlimited OpenAI budget. Now a hard monthly cap.
 *   emailPerMonth          existed before but was enforced NOWHERE. Now wired.
 *   reviewSyncsPerDay      manual review-sync budget (consumed by Phase 2's
 *                          sync endpoint; the automatic scheduler in Phase 7
 *                          does NOT draw from this — it's for the button).
 *   competitorSyncsPerDay  per-clinic cap on manual competitor refreshes; the
 *                          old 10/10min limiter was per-IP, which both punished
 *                          shared office networks and was trivially dodged.
 *
 * The Phase 5 numbers are DEFAULTS I chose, not gospel: Starter's 200 AI
 * replies/mo costs well under $1 of gpt-4o-mini while being ~7/day — generous
 * for a clinic. Tune freely; enforcement reads whatever is here.
 */

export const PLANS = Object.freeze({
  FREE: "free",
  STARTER: "starter",
  PREMIUM: "premium",
});

export const PLAN_LIMITS = Object.freeze({
  [PLANS.FREE]: {
    label: "Free",
    pricePerMonth: 0,
    // ── Data access ──────────────────────────────────────────────
    storedReviewsLimit: 20, // hard cap on stored reviews returned
    syncIntervalHours: null, // no automatic sync
    // ── Features ────────────────────────────────────────────────
    aiRepliesEnabled: false,
    competitorTracking: false,
    competitorLimit: 0,
    pulseCampaignsEnabled: false,
    // ── Outreach budgets ────────────────────────────────────────
    smsPerMonth: 0,
    whatsAppPerMonth: 0,
    emailPerMonth: 0,
    // ── Metered usage (Phase 5) ─────────────────────────────────
    aiRepliesPerMonth: 0,
    reviewSyncsPerDay: 0,
    competitorSyncsPerDay: 0,
  },

  [PLANS.STARTER]: {
    label: "Starter",
    pricePerMonth: 49,
    storedReviewsLimit: Infinity,
    syncIntervalHours: 24, // 24h sync
    aiRepliesEnabled: true,
    competitorTracking: true,
    competitorLimit: 3,
    pulseCampaignsEnabled: true,
    smsPerMonth: 50,
    whatsAppPerMonth: 0, // no WhatsApp on Starter
    emailPerMonth: 500,
    // ── Metered usage (Phase 5) ─────────────────────────────────
    aiRepliesPerMonth: 200,
    reviewSyncsPerDay: 6,
    competitorSyncsPerDay: 10,
  },

  [PLANS.PREMIUM]: {
    label: "Premium",
    pricePerMonth: 99,
    storedReviewsLimit: Infinity,
    syncIntervalHours: 1, // near-real-time
    aiRepliesEnabled: true,
    competitorTracking: true,
    competitorLimit: 10,
    pulseCampaignsEnabled: true,
    smsPerMonth: 500,
    whatsAppPerMonth: 500,
    emailPerMonth: 5000,
    // ── Metered usage (Phase 5) ─────────────────────────────────
    aiRepliesPerMonth: 1000,
    reviewSyncsPerDay: 48,
    competitorSyncsPerDay: 50,
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