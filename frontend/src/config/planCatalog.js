// frontend/src/config/planCatalog.js
//
// One plan list for the whole frontend: Settings → Plan & Billing, the upgrade
// modal, and the landing page's pricing section.
//
// ── HOW IT WORKS ────────────────────────────────────────────────────────────
// The real catalogue is derived server-side from config/plans.js — the same
// object the enforcement middleware reads — and served from GET /api/v1/plans.
// fetchPlans() gets it. FALLBACK_PLANS below exists so a network failure
// renders a pricing page rather than an empty div, and so first paint has
// something before the request lands.
//
// ── THE FALLBACK IS A MIRROR, NOT A SOURCE ──────────────────────────────────
// If you find yourself editing FALLBACK_PLANS to change what a plan offers,
// stop: edit backend/src/config/plans.js instead. That file is what the server
// enforces. Copy that disagrees with enforcement is how a customer ends up
// paying for a feature they don't receive — and with Paddle as Merchant of
// Record, that's a chargeback, not a support ticket.
//
// This mirror exists only so the page degrades gracefully. Keeping it honest
// is a one-line diff whenever plans.js changes; the guard in the dev-only
// check at the bottom of this file will tell you when it drifts.

import axiosInstance from "../utils/axios.helper.js";

// Ordered cheapest → dearest; components render in array order.
export const FALLBACK_PLANS = [
  {
    id: "free",
    name: "Free",
    price: 0,
    priceLabel: "$0",
    tagline: "See where you stand, free forever",
    recommended: false,
    features: [
      "20 most recent reviews kept",
      "One-time import of your most recent reviews",
      "AI replies: not included",
      "Competitor tracking: not included",
      "Review request campaigns: not included",
      "Analytics dashboard",
    ],
    limits: {
      storedReviews: 20,
      syncIntervalHours: null,
      aiReplies: 0,
      competitors: 0,
      sms: 0,
      whatsApp: 0,
      email: 0,
    },
  },
  {
    id: "starter",
    name: "Starter",
    price: 49,
    priceLabel: "$49",
    tagline: "For a single practice that wants to grow",
    recommended: true,
    features: [
      "Full review history kept",
      "Updates once a day",
      "200 AI-drafted replies a month",
      "Track up to 3 competitors",
      "Review requests — 50 SMS a month",
      "WhatsApp: not included",
      "500 review request emails a month",
      "Analytics dashboard",
    ],
    limits: {
      storedReviews: null,
      syncIntervalHours: 24,
      aiReplies: 200,
      competitors: 3,
      sms: 50,
      whatsApp: 0,
      email: 500,
    },
  },
  {
    id: "premium",
    name: "Premium",
    price: 99,
    priceLabel: "$99",
    tagline: "For busy practices and multi-location groups",
    recommended: false,
    features: [
      "Full review history kept",
      "Updates every hour",
      "1000 AI-drafted replies a month",
      "Track up to 10 competitors",
      "Review requests — 500 SMS + 500 WhatsApp a month",
      "5000 review request emails a month",
      "Analytics dashboard",
    ],
    limits: {
      storedReviews: null,
      syncIntervalHours: 1,
      aiReplies: 1000,
      competitors: 10,
      sms: 500,
      whatsApp: 500,
      email: 5000,
    },
  },
];

/** Upgrades only go up the ladder; downgrades route through the Paddle portal. */
export const PLAN_RANK = { free: 0, starter: 1, premium: 2 };

/** The next tier up from `planId`, or null at the top. */
export const nextPlanUp = (planId) => {
  const rank = PLAN_RANK[planId] ?? 0;
  const next = Object.entries(PLAN_RANK).find(([, r]) => r === rank + 1);
  return next ? next[0] : null;
};

let cache = null;

/**
 * The plan catalogue. Cached for the session — plans.js is frozen server-side
 * and cannot change between two requests in one page view.
 *
 * Never rejects: a failure returns FALLBACK_PLANS, because a pricing page that
 * throws is worse than one that is briefly a version behind.
 */
export const fetchPlans = async () => {
  if (cache) return cache;
  try {
    const { data } = await axiosInstance.get("/plans");
    const plans = data?.data?.plans;
    if (Array.isArray(plans) && plans.length > 0) {
      cache = plans;
      return plans;
    }
    return FALLBACK_PLANS;
  } catch {
    return FALLBACK_PLANS;
  }
};

/** Single plan by id, from whichever list is available. */
export const planById = (plans, id) =>
  (plans || FALLBACK_PLANS).find((p) => p.id === id) || FALLBACK_PLANS[0];

// ── Dev-only drift check ─────────────────────────────────────────────────────
// Compares the fallback against what the server actually returns and warns in
// the console when they disagree. Cheap early warning that someone changed
// plans.js without updating the mirror — the exact failure this whole file is
// meant to end.
if (import.meta.env.DEV) {
  fetchPlans().then((live) => {
    if (live === FALLBACK_PLANS) return;
    const drift = live.filter((p) => {
      const local = FALLBACK_PLANS.find((f) => f.id === p.id);
      return !local || JSON.stringify(local.limits) !== JSON.stringify(p.limits);
    });
    if (drift.length > 0) {
      console.warn(
        "[planCatalog] FALLBACK_PLANS is out of date with the server for: " +
          drift.map((p) => p.id).join(", ") +
          ". Update the mirror in frontend/src/config/planCatalog.js."
      );
    }
  });
}