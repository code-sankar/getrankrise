// backend/src/services/usage/usage.service.js
//
// Reserve → act → refund for non-credit metered usage, mirroring the
// semantics of credits.service.js so controllers treat both identically:
//
//     const u = await reserveUsage({ clinicId, metric: "ai_reply" });
//     if (!u.reserved) return usageError(res, u);
//     try { ...call the provider... }
//     catch (e) { await refundUsage({ clinicId, metric: "ai_reply" }); throw e; }
//
// ONE STATEMENT does check + increment. The INSERT arm's WHERE guards the
// first-use-of-period case; the DO UPDATE arm's WHERE guards every case after.
// Either failing means zero rows returned → not reserved. Verified against
// live Postgres including a 25-way concurrency race (see PHASE-5-APPLY.md).
//
// PERIODS: monthly metrics key on the 1st of the current calendar month,
// daily metrics on today (UTC). Known tradeoff vs Paddle billing periods: a
// mid-month upgrader keeps the usage already burned this month (their LIMIT
// rises immediately, the counter doesn't reset until the 1st). Acceptable —
// the limit jump is what they paid for — and it avoids coupling this table to
// billing-anchor drift. If you ever want billing-aligned resets, change
// periodFor() to read subscriptions.current_period_start; the schema already
// supports it.

import { QueryTypes } from "sequelize";
import { sequelize } from "../../config/db.js";
import { getSubscriptionState } from "../subscription/subscriptionState.service.js";

// ── Metric registry ──────────────────────────────────────────────────────────
// limitKey points into the plan-limits object (config/plans.js).
export const METRICS = Object.freeze({
  ai_reply: { period: "month", limitKey: "aiRepliesPerMonth" },
  email: { period: "month", limitKey: "emailPerMonth" },
  review_sync: { period: "day", limitKey: "reviewSyncsPerDay" },
  competitor_sync: { period: "day", limitKey: "competitorSyncsPerDay" },
});

function periodFor(metric) {
  const now = new Date();
  if (METRICS[metric].period === "day") {
    return now.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  }
  return `${now.toISOString().slice(0, 8)}01`; // YYYY-MM-01
}

/**
 * Atomically reserves `amount` units of `metric` for a clinic.
 *
 * Returns (same contract family as reserveCredits):
 *   { reserved: true,  metric, limit, used, remaining, plan }
 *   { reserved: false, reason, ... } where reason ∈
 *       PLAN_DOES_NOT_INCLUDE_FEATURE | SUBSCRIPTION_INACTIVE | QUOTA_EXCEEDED
 */
export async function reserveUsage({ clinicId, metric, amount = 1 }) {
  if (!METRICS[metric]) throw new Error(`Unknown usage metric: ${metric}`);
  if (!Number.isInteger(amount) || amount < 1) {
    throw new Error("amount must be a positive integer");
  }

  const sub = await getSubscriptionState(clinicId);
  const rawLimit = sub.limits[METRICS[metric].limitKey];

  // Infinity → unlimited on this plan: record usage for observability, but
  // enforce nothing (an effectively-unreachable numeric cap keeps the SQL
  // single-shape instead of branching).
  const unlimited = rawLimit === Infinity;
  const limit = unlimited ? 2_000_000_000 : Number(rawLimit) || 0;

  if (limit === 0) {
    return {
      reserved: false,
      reason: "PLAN_DOES_NOT_INCLUDE_FEATURE",
      metric,
      currentPlan: sub.plan,
      limit: 0,
    };
  }

  if (!sub.isActive) {
    return {
      reserved: false,
      reason: "SUBSCRIPTION_INACTIVE",
      metric,
      currentPlan: sub.plan,
      subscriptionStatus: sub.status,
    };
  }

  const period = periodFor(metric);

  // The atomic gate. Note usage_counters.used in the conflict arm refers to
  // the EXISTING row (EXCLUDED.* would be the incoming values).
  //
  // The ::int / ::uuid / ::text casts are LOAD-BEARING, not style: $4 appears
  // in contexts Postgres type-deduces independently (INSERT target column vs
  // bare comparison), and without explicit casts PG 16 rejects the statement
  // with 42P08 "inconsistent types deduced for parameter $4". Found by running
  // this exact SQL against a live server — do not "clean up" the casts.
  const rows = await sequelize.query(
    `INSERT INTO usage_counters (clinic_id, metric, period_start, used)
     SELECT $1::uuid, $2::text, $3::date, $4::int
      WHERE $4::int <= $5::int
     ON CONFLICT (clinic_id, metric, period_start)
     DO UPDATE SET used = usage_counters.used + $4::int
      WHERE usage_counters.used + $4::int <= $5::int
     RETURNING used`,
    {
      bind: [clinicId, metric, period, amount, limit],
      type: QueryTypes.SELECT,
    }
  );

  if (rows.length === 0) {
    // Rejected by one of the two WHEREs → no headroom this period.
    const used = await currentUsed(clinicId, metric, period);
    return {
      reserved: false,
      reason: "QUOTA_EXCEEDED",
      metric,
      currentPlan: sub.plan,
      limit: unlimited ? Infinity : limit,
      used,
    };
  }

  const used = Number(rows[0].used);
  return {
    reserved: true,
    metric,
    plan: sub.plan,
    limit: unlimited ? Infinity : limit,
    used,
    remaining: unlimited ? Infinity : limit - used,
  };
}

/**
 * Returns units after a downstream failure. Best-effort, floor at 0, never
 * throws to the caller — identical philosophy to refundCredits.
 */
export async function refundUsage({ clinicId, metric, amount = 1 }) {
  try {
    const period = periodFor(metric);
    await sequelize.query(
      `UPDATE usage_counters
          SET used = GREATEST(used - $4, 0)
        WHERE clinic_id = $1 AND metric = $2 AND period_start = $3::date`,
      { bind: [clinicId, metric, period, amount], type: QueryTypes.UPDATE }
    );
  } catch (err) {
    console.error(`[usage] refund failed for ${clinicId}/${metric}:`, err.message);
  }
}

async function currentUsed(clinicId, metric, period) {
  const rows = await sequelize.query(
    `SELECT used FROM usage_counters
      WHERE clinic_id = $1 AND metric = $2 AND period_start = $3::date`,
    { bind: [clinicId, metric, period], type: QueryTypes.SELECT }
  );
  return Number(rows[0]?.used ?? 0);
}

/**
 * Read-only snapshot of every metric for the current period — feeds
 * GET /api/v1/usage (Settings page, future usage pills).
 */
export async function getUsageSummary(clinicId) {
  const sub = await getSubscriptionState(clinicId);
  const out = { plan: sub.plan, status: sub.status, metrics: {} };

  for (const [metric, def] of Object.entries(METRICS)) {
    const rawLimit = sub.limits[def.limitKey];
    const unlimited = rawLimit === Infinity;
    const limit = unlimited ? null : Number(rawLimit) || 0;
    const used = await currentUsed(clinicId, metric, periodFor(metric));

    out.metrics[metric] = {
      period: def.period,
      used,
      limit, // null = unlimited on this plan
      remaining: limit === null ? null : Math.max(limit - used, 0),
    };
  }
  return out;
}

/**
 * Shared 403 shape for controllers — pattern-matched by the frontend axios
 * interceptor exactly like the credits quotaError.
 */
export function usageErrorResponse(res, r) {
  const isPlanGap = r.reason === "PLAN_DOES_NOT_INCLUDE_FEATURE";
  const isInactive = r.reason === "SUBSCRIPTION_INACTIVE";
  const labels = {
    ai_reply: "AI reply generations",
    email: "email sends",
    review_sync: "review syncs",
    competitor_sync: "competitor syncs",
  };
  const label = labels[r.metric] || r.metric;

  return res.status(403).json({
    success: false,
    code: isPlanGap ? "UPGRADE_REQUIRED" : isInactive ? "SUBSCRIPTION_INACTIVE" : "QUOTA_EXCEEDED",
    message: isPlanGap
      ? `Your ${r.currentPlan} plan doesn't include ${label}. Upgrade to unlock them.`
      : isInactive
        ? `Your subscription is ${r.subscriptionStatus}. Please update your payment method to continue.`
        : `You've used all ${r.limit} ${label} for this ${METRICS[r.metric].period === "day" ? "day" : "month"}. Upgrade for a higher limit.`,
    metric: r.metric,
    currentPlan: r.currentPlan,
    requiredPlans: isPlanGap ? ["starter", "premium"] : ["premium"],
    limit: r.limit,
    used: r.used,
  });
}