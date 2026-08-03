// backend/src/routes/plans.routes.js
//
// GET /api/v1/plans — the plan catalogue, DERIVED from config/plans.js.
//
// Mount in app.js (public — no protect/loadClinic; the pricing section on the
// marketing page is a legitimate unauthenticated caller):
//     import planRoutes from "./routes/plans.routes.js";
//     app.use("/api/v1/plans", planRoutes);
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
// Plan copy was hardcoded in at least four places, and had already drifted in
// all of them:
//
//   Settings.jsx      "Hourly sync" for Premium — while the marketing site,
//                     the FAQ and the product spec all said "real-time".
//                     Starter's 500 emails/month appeared nowhere at all, and
//                     nothing anywhere said Starter has NO WhatsApp, which is
//                     the single most surprising limit in the product (a
//                     Starter user selects WhatsApp, fills in the form, and
//                     only then hits a 403).
//   UpgradeModal.jsx  its own separate feature list
//   Terms / FAQ       prose descriptions of the same numbers
//   plans.js          the numbers that are actually enforced
//
// Copy drift on a paid tier isn't cosmetic. A customer who upgrades for a
// feature the pricing page listed and the enforcement layer doesn't grant has
// a refund claim, and Paddle as Merchant of Record makes that a chargeback
// against us.
//
// So: the server derives every user-visible string from the same object the
// middleware enforces. Change a number in plans.js and the pricing page,
// upgrade modal and settings card all follow. There is no second list to keep
// in sync — which is the only version of "keep them in sync" that ever works.
//
// ── ONE DECISION THIS FILE FORCES ───────────────────────────────────────────
// syncLabel below reads Premium's syncIntervalHours (1) and prints
// "Updates every hour". That is what the product does. If "real-time" is a
// claim you want to keep making, change plans.js — syncIntervalHours: 0.25
// gives you 15 minutes and the scheduler already handles fractional hours
// (the CASE binds ::numeric). What must not happen is the copy claiming one
// thing while the scheduler does another.

import { Router } from "express";
import { PLANS, PLAN_LIMITS } from "../config/plans.js";
import { successResponse } from "../utils/apiResponse.js";

const router = Router();

// ── Derivations ──────────────────────────────────────────────────────────────
const n = (v) => (v === Infinity ? "Unlimited" : Number(v) || 0);

const syncLabel = (limits) => {
  const h = limits.syncIntervalHours;
  // Free's null used to mean "never syncs, so this plan can never show a
  // review". Since the one-time backfill (migration 0010) it means "imported
  // once, then frozen" — which is a feature you can actually describe.
  if (h == null) return "One-time import of your most recent reviews";
  if (h < 1) return `Updates every ${Math.round(h * 60)} minutes`;
  if (h === 1) return "Updates every hour";
  if (h === 24) return "Updates once a day";
  return `Updates every ${h} hours`;
};

const storageLabel = (limits) =>
  Number.isFinite(limits.storedReviewsLimit)
    ? `${limits.storedReviewsLimit} most recent reviews kept`
    : "Full review history kept";

const messagingLabel = (limits) => {
  const parts = [];
  if (limits.smsPerMonth > 0) parts.push(`${limits.smsPerMonth} SMS`);
  if (limits.whatsAppPerMonth > 0) parts.push(`${limits.whatsAppPerMonth} WhatsApp`);
  if (parts.length === 0) return null;
  return `${parts.join(" + ")} a month`;
};

/**
 * Feature bullets, in the order a buyer evaluates them. Every line is
 * generated — nothing here is a hand-written claim that can go stale.
 *
 * Limits that are ZERO are stated explicitly rather than omitted. "Review
 * requests: not included" is information; a silently missing bullet is a
 * surprise at the moment of use, and Starter-has-no-WhatsApp is exactly the
 * limit users were hitting blind.
 */
const featuresFor = (limits) => {
  const f = [storageLabel(limits), syncLabel(limits)];

  f.push(
    limits.aiRepliesEnabled
      ? `${n(limits.aiRepliesPerMonth)} AI-drafted replies a month`
      : "AI replies: not included"
  );

  f.push(
    limits.competitorTracking
      ? `Track up to ${limits.competitorLimit} competitors`
      : "Competitor tracking: not included"
  );

  if (limits.pulseCampaignsEnabled) {
    const m = messagingLabel(limits);
    f.push(m ? `Review requests — ${m}` : "Review requests by email");
    // Said out loud, because its absence is otherwise invisible until a send
    // fails.
    if (limits.whatsAppPerMonth === 0) f.push("WhatsApp: not included");
  } else {
    f.push("Review request campaigns: not included");
  }

  if (limits.emailPerMonth > 0) {
    f.push(`${n(limits.emailPerMonth)} review request emails a month`);
  }

  f.push("Analytics dashboard"); // every tier, per the Free plan's own pitch

  return f;
};

const TAGLINES = {
  [PLANS.FREE]: "See where you stand, free forever",
  [PLANS.STARTER]: "For a single practice that wants to grow",
  [PLANS.PREMIUM]: "For busy practices and multi-location groups",
};

const buildCatalogue = () =>
  Object.entries(PLAN_LIMITS).map(([id, limits]) => ({
    id,
    name: limits.label,
    price: limits.pricePerMonth,
    priceLabel: limits.pricePerMonth === 0 ? "$0" : `$${limits.pricePerMonth}`,
    tagline: TAGLINES[id] || "",
    recommended: id === PLANS.STARTER,
    features: featuresFor(limits),
    // Raw limits alongside the copy, so a component can render a usage meter
    // or a comparison table without a second request or a second constant.
    limits: {
      storedReviews: Number.isFinite(limits.storedReviewsLimit)
        ? limits.storedReviewsLimit
        : null, // null = unlimited, matching the usage API's convention
      syncIntervalHours: limits.syncIntervalHours,
      aiReplies: limits.aiRepliesEnabled ? n(limits.aiRepliesPerMonth) : 0,
      competitors: limits.competitorLimit,
      sms: limits.smsPerMonth,
      whatsApp: limits.whatsAppPerMonth,
      email: limits.emailPerMonth,
    },
  }));

// Built once at module load — plans.js is frozen and cannot change at runtime.
const CATALOGUE = buildCatalogue();

router.get("/", (_req, res) =>
  successResponse(res, { message: "Plans fetched", data: { plans: CATALOGUE } })
);

export default router;