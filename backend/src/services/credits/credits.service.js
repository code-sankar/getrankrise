// backend/src/services/credits/credits.service.js
import { pool } from "../../db/pool.js";
import { getLimitsFor } from "../../config/plans.js";

/**
 * Atomically reserves N credits of the given channel for a clinic.
 *
 * Returns:
 *   { reserved: true,  remaining, plan, limit }       on success
 *   { reserved: false, reason, currentPlan, ... }     when over limit / inactive
 *
 * Race-safety: the UPDATE ... WHERE used + amount <= limit guarantees that two
 * concurrent sends can't both pass the check — Postgres serializes the row
 * update and only one will satisfy the predicate.
 *
 * Period-reset: if credits_reset_at is older than current_period_start, the
 * SAME update zeros the counters and applies the new charge in one shot.
 */
export async function reserveCredits({ clinicId, channel, amount = 1 }) {
  if (!["sms", "whatsapp"].includes(channel)) {
    throw new Error(`Unknown channel: ${channel}`);
  }
  if (!Number.isInteger(amount) || amount < 1) {
    throw new Error("amount must be a positive integer");
  }

  // 1. Pull plan + status. Single query, no transaction needed yet.
  const { rows } = await pool.query(
    `SELECT plan_type, subscription_status,
            sms_credits_used, whatsapp_credits_used,
            credits_reset_at, current_period_start
       FROM subscriptions
      WHERE clinic_id = $1`,
    [clinicId]
  );
  if (rows.length === 0) {
    return { reserved: false, reason: "NO_SUBSCRIPTION" };
  }

  const sub = rows[0];
  const limits = getLimitsFor(sub.plan_type);
  const limit  = channel === "sms" ? limits.smsPerMonth : limits.whatsAppPerMonth;

  // Free tier (or any plan with 0 quota) → no need to even attempt UPDATE
  if (!limit || limit === 0) {
    return {
      reserved:     false,
      reason:       "PLAN_DOES_NOT_INCLUDE_CHANNEL",
      currentPlan:  sub.plan_type,
      channel,
      limit:        0,
    };
  }

  if (!["active", "trialing"].includes(sub.subscription_status)) {
    return {
      reserved: false,
      reason:   "SUBSCRIPTION_INACTIVE",
      currentPlan:        sub.plan_type,
      subscriptionStatus: sub.subscription_status,
    };
  }

  // 2. Atomic reserve. Two column names depending on channel.
  const usedCol = channel === "sms" ? "sms_credits_used" : "whatsapp_credits_used";

  // The WHERE clause is the gate:
  //   - if reset is due, treat current usage as 0
  //   - otherwise, must have headroom: used + amount <= limit
  const sql = `
    UPDATE subscriptions
       SET ${usedCol} = CASE
             WHEN credits_reset_at < current_period_start THEN $3
             ELSE ${usedCol} + $3
           END,
           sms_credits_used = CASE
             WHEN credits_reset_at < current_period_start AND $4 = 'sms'      THEN $3
             WHEN credits_reset_at < current_period_start                     THEN 0
             ELSE sms_credits_used
           END,
           whatsapp_credits_used = CASE
             WHEN credits_reset_at < current_period_start AND $4 = 'whatsapp' THEN $3
             WHEN credits_reset_at < current_period_start                     THEN 0
             ELSE whatsapp_credits_used
           END,
           credits_reset_at = CASE
             WHEN credits_reset_at < current_period_start THEN NOW()
             ELSE credits_reset_at
           END
     WHERE clinic_id = $1
       AND (
            -- post-reset case: amount alone must fit
            (credits_reset_at < current_period_start AND $3 <= $2)
            OR
            -- normal case: current usage + amount must fit
            (credits_reset_at >= current_period_start AND ${usedCol} + $3 <= $2)
       )
    RETURNING ${usedCol} AS used
  `;

  const result = await pool.query(sql, [clinicId, limit, amount, channel]);

  if (result.rowCount === 0) {
    return {
      reserved:    false,
      reason:      "QUOTA_EXCEEDED",
      currentPlan: sub.plan_type,
      channel,
      limit,
      used:        channel === "sms" ? sub.sms_credits_used : sub.whatsapp_credits_used,
    };
  }

  const used = result.rows[0].used;
  return {
    reserved:  true,
    plan:      sub.plan_type,
    channel,
    limit,
    used,
    remaining: limit - used,
  };
}

/**
 * Refunds reserved credits if the downstream send fails.
 * Best-effort — we never let a refund failure surface to the caller.
 */
export async function refundCredits({ clinicId, channel, amount = 1 }) {
  const col = channel === "sms" ? "sms_credits_used" : "whatsapp_credits_used";
  try {
    await pool.query(
      `UPDATE subscriptions
          SET ${col} = GREATEST(${col} - $2, 0)
        WHERE clinic_id = $1`,
      [clinicId, amount]
    );
  } catch (err) {
    console.error(`[credits] refund failed for clinic ${clinicId}:`, err.message);
  }
}

/**
 * Read-only snapshot for the frontend (settings, dashboard pill, etc.).
 */
export async function getCreditSummary(clinicId) {
  const { rows } = await pool.query(
    `SELECT plan_type, subscription_status,
            sms_credits_used, whatsapp_credits_used,
            current_period_start, current_period_end, credits_reset_at
       FROM subscriptions
      WHERE clinic_id = $1`,
    [clinicId]
  );
  if (rows.length === 0) return null;

  const sub    = rows[0];
  const limits = getLimitsFor(sub.plan_type);

  // If period has rolled over but the lazy-reset hasn't fired yet, report 0.
  const periodHasRolled =
    sub.credits_reset_at && sub.current_period_start &&
    new Date(sub.credits_reset_at) < new Date(sub.current_period_start);

  return {
    plan:               sub.plan_type,
    status:             sub.subscription_status,
    currentPeriodEnd:   sub.current_period_end,
    sms: {
      used:      periodHasRolled ? 0 : sub.sms_credits_used,
      limit:     limits.smsPerMonth,
      remaining: Math.max(limits.smsPerMonth - (periodHasRolled ? 0 : sub.sms_credits_used), 0),
    },
    whatsapp: {
      used:      periodHasRolled ? 0 : sub.whatsapp_credits_used,
      limit:     limits.whatsAppPerMonth,
      remaining: Math.max(limits.whatsAppPerMonth - (periodHasRolled ? 0 : sub.whatsapp_credits_used), 0),
    },
  };
}