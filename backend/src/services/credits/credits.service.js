// backend/src/services/credits/credits.service.js
//
// PHASE 0 CHANGE — execution path only, semantics identical.
//
// Every query moved from `pool.query(sql, params)` to
// `sequelize.query(sql, { bind })`. Sequelize's `bind` option uses the same
// $1/$2 placeholder syntax as node-postgres and passes them as real bound
// parameters, so the SQL below is UNCHANGED from the pg version — including the
// conditional UPDATE that provides the atomicity guarantee.
//
// This is deliberately raw SQL rather than Sequelize model methods. The
// reserve-before-send guarantee depends on the check and the write happening in
// a single statement; expressing it as findOne() + update() would reintroduce
// exactly the race this was built to prevent. Using the ORM here would be worse
// code, not better.

import { QueryTypes } from "sequelize";
import { sequelize } from "../../config/db.js";
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
  const rows = await sequelize.query(
    `SELECT plan_type, subscription_status,
            sms_credits_used, whatsapp_credits_used,
            credits_reset_at, current_period_start
       FROM subscriptions
      WHERE clinic_id = $1`,
    { bind: [clinicId], type: QueryTypes.SELECT }
  );

  if (rows.length === 0) {
    // Since Phase 0 every clinic is provisioned a row at registration, so this
    // now means genuine data corruption (or a clinic created by a script that
    // bypassed provisionFreeSubscription). Callers must still handle it —
    // request.controller.js quotaError() renders undefined fields otherwise.
    return { reserved: false, reason: "NO_SUBSCRIPTION" };
  }

  const sub = rows[0];
  const limits = getLimitsFor(sub.plan_type);
  const limit = channel === "sms" ? limits.smsPerMonth : limits.whatsAppPerMonth;

  // Free tier (or any plan with 0 quota) → no need to even attempt UPDATE
  if (!limit || limit === 0) {
    return {
      reserved: false,
      reason: "PLAN_DOES_NOT_INCLUDE_CHANNEL",
      currentPlan: sub.plan_type,
      channel,
      limit: 0,
    };
  }

  if (!["active", "trialing"].includes(sub.subscription_status)) {
    return {
      reserved: false,
      reason: "SUBSCRIPTION_INACTIVE",
      currentPlan: sub.plan_type,
      subscriptionStatus: sub.subscription_status,
    };
  }

  // 2. Atomic reserve. Two column names depending on channel.
  //
  // `usedCol` is interpolated rather than bound because Postgres cannot bind an
  // identifier — only values. It is safe here because it is selected from a
  // two-element literal whitelist above and never touches user input.
  const usedCol = channel === "sms" ? "sms_credits_used" : "whatsapp_credits_used";

  // The WHERE clause is the gate:
  //   - if reset is due, treat current usage as 0
  //   - otherwise, must have headroom: used + amount <= limit
  //
  // Note: when current_period_start IS NULL (a clinic that has never been
  // through checkout) every comparison against it is NULL, so the reset branch
  // never fires. That is correct — such a clinic is on Free, whose limit is 0,
  // and the early return above means we never reach this statement.
  // Each column is assigned EXACTLY ONCE. An earlier version wrote
  // `SET ${usedCol} = …, sms_credits_used = …, whatsapp_credits_used = …`,
  // which names the active channel's column twice — Postgres rejects that with
  // 42701 (multiple assignments to same column), so every reserve threw and no
  // SMS or WhatsApp message was ever sent. Both channels are therefore folded
  // into the two per-column CASE blocks below and $4 selects between them.
  //
  // The casts are load-bearing too: `$3 <= $2` gives Postgres two untyped binds
  // with no column to anchor on, so both resolve as text and `${usedCol} + $3`
  // then fails with 42883 (operator does not exist: integer + text).
  const sql = `
    UPDATE subscriptions
       SET sms_credits_used = CASE
             WHEN credits_reset_at < current_period_start AND $4::text = 'sms'      THEN $3::int
             WHEN credits_reset_at < current_period_start                           THEN 0
             WHEN $4::text = 'sms'                                                  THEN sms_credits_used + $3::int
             ELSE sms_credits_used
           END,
           whatsapp_credits_used = CASE
             WHEN credits_reset_at < current_period_start AND $4::text = 'whatsapp' THEN $3::int
             WHEN credits_reset_at < current_period_start                           THEN 0
             WHEN $4::text = 'whatsapp'                                             THEN whatsapp_credits_used + $3::int
             ELSE whatsapp_credits_used
           END,
           credits_reset_at = CASE
             WHEN credits_reset_at < current_period_start THEN NOW()
             ELSE credits_reset_at
           END
     WHERE clinic_id = $1::uuid
       AND (
            -- post-reset case: amount alone must fit
            (credits_reset_at < current_period_start AND $3::int <= $2::int)
            OR
            -- normal case: current usage + amount must fit
            (credits_reset_at >= current_period_start AND ${usedCol} + $3::int <= $2::int)
       )
    RETURNING ${usedCol} AS used
  `;

  // QueryTypes.SELECT returns the RETURNING rows as a plain array. An empty
  // array means the WHERE predicate rejected the reservation — i.e. no headroom.
  const result = await sequelize.query(sql, {
    bind: [clinicId, limit, amount, channel],
    type: QueryTypes.SELECT,
  });

  if (result.length === 0) {
    return {
      reserved: false,
      reason: "QUOTA_EXCEEDED",
      currentPlan: sub.plan_type,
      channel,
      limit,
      used: channel === "sms" ? sub.sms_credits_used : sub.whatsapp_credits_used,
    };
  }

  const used = Number(result[0].used);
  return {
    reserved: true,
    plan: sub.plan_type,
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
    await sequelize.query(
      `UPDATE subscriptions
          SET ${col} = GREATEST(${col} - $2, 0)
        WHERE clinic_id = $1`,
      { bind: [clinicId, amount], type: QueryTypes.UPDATE }
    );
  } catch (err) {
    console.error(`[credits] refund failed for clinic ${clinicId}:`, err.message);
  }
}

/**
 * Read-only snapshot for the frontend (settings, dashboard pill, etc.).
 */
export async function getCreditSummary(clinicId) {
  const rows = await sequelize.query(
    `SELECT plan_type, subscription_status,
            sms_credits_used, whatsapp_credits_used,
            current_period_start, current_period_end, credits_reset_at
       FROM subscriptions
      WHERE clinic_id = $1`,
    { bind: [clinicId], type: QueryTypes.SELECT }
  );

  if (rows.length === 0) return null;

  const sub = rows[0];
  const limits = getLimitsFor(sub.plan_type);

  // If period has rolled over but the lazy-reset hasn't fired yet, report 0.
  const periodHasRolled =
    sub.credits_reset_at &&
    sub.current_period_start &&
    new Date(sub.credits_reset_at) < new Date(sub.current_period_start);

  const smsUsed = periodHasRolled ? 0 : Number(sub.sms_credits_used);
  const waUsed = periodHasRolled ? 0 : Number(sub.whatsapp_credits_used);

  return {
    plan: sub.plan_type,
    status: sub.subscription_status,
    currentPeriodEnd: sub.current_period_end,
    sms: {
      used: smsUsed,
      limit: limits.smsPerMonth,
      remaining: Math.max(limits.smsPerMonth - smsUsed, 0),
    },
    whatsapp: {
      used: waUsed,
      limit: limits.whatsAppPerMonth,
      remaining: Math.max(limits.whatsAppPerMonth - waUsed, 0),
    },
  };
}