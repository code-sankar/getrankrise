// backend/src/services/reviews/syncScheduler.service.js
//
// The automatic review-sync loop. Mirrors campaignRunner.service.js: a
// setInterval tick that is MULTI-INSTANCE SAFE without Redis or any queue
// infrastructure, because the one mutating step is an atomic Postgres
// statement where concurrent workers get disjoint work:
//
//   claiming   UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)
//              → disjoint connections, exactly one worker per connection
//
// ── STEP 4: TWO KINDS OF DUE ────────────────────────────────────────────────
// CLAIM_SQL now has two independent due-branches:
//
//   (a) RECURRING — paid plans only. last_synced_at older than the plan's
//       syncIntervalHours (Starter 24h / Premium 1h).
//
//   (b) INITIAL — EVERY plan, including Free, exactly once per connection.
//       Fires while initial_sync_at IS NULL (migration 0010), bounded by
//       initial_sync_attempts.
//
// ── CLAIM-BY-STAMPING (read this before "improving" it) ─────────────────────
// The claim UPDATE sets last_synced_at = NOW() *before* the sync runs. That
// stamp IS the claim: the moment it lands, every other instance's due-query
// stops seeing the connection for a full plan interval.
//
// ── COLUMN NAMES ────────────────────────────────────────────────────────────
// subscriptions.plan_type / subscriptions.subscription_status. This file once
// read s.plan / s.status — neither exists — and every tick died on 42703
// inside a swallowing catch, so the scheduler had never claimed anything.

import { QueryTypes } from "sequelize";
import { sequelize } from "../../config/db.js";
import { env } from "../../config/env.js";
import { PLAN_LIMITS, PLANS } from "../../config/plans.js";
import {
  syncByConnectionId,
  isImplemented as reviewSyncImplemented,
} from "./reviewSync.service.js";

const TICK_MS = Number(process.env.SYNC_SCHEDULER_TICK_MS) || 60_000;
const BATCH_PER_TICK = Number(process.env.SYNC_SCHEDULER_BATCH) || 5;
const PREMIUM_HOURS = Number(PLAN_LIMITS[PLANS.PREMIUM]?.syncIntervalHours) || 1;
const STARTER_HOURS = Number(PLAN_LIMITS[PLANS.STARTER]?.syncIntervalHours) || 24;
const MAX_INITIAL_SYNC_ATTEMPTS =
  Number(process.env.INITIAL_SYNC_MAX_ATTEMPTS) || 5;
const INITIAL_SYNC_RETRY_HOURS =
  Number(process.env.INITIAL_SYNC_RETRY_HOURS) || 6;

const SYNCABLE_PLATFORMS = ["google", "yelp", "facebook"];

let timer = null;
let ticking = false;

// ── THE CLAIM ────────────────────────────────────────────────────────────────
// platform_connections.platform is the ENUM platform_enum. Comparing it
// against $4::text[] needs an "enum = text" operator that does not exist
// (42883) — the claim threw on EVERY tick and automatic review sync never
// claimed a single connection. Cast the column to text instead.
const CLAIM_SQL = `
UPDATE platform_connections p
   SET last_synced_at = NOW(),
       initial_sync_attempts = CASE
         WHEN p.initial_sync_at IS NULL THEN p.initial_sync_attempts + 1
         ELSE p.initial_sync_attempts
       END
 WHERE p.id IN (
   SELECT pc.id
     FROM platform_connections pc
     JOIN clinics c            ON c.id = pc.clinic_id
     LEFT JOIN subscriptions s ON s.clinic_id = pc.clinic_id
     CROSS JOIN LATERAL (
       SELECT CASE
                WHEN s.subscription_status IN ('active','trialing')
                     AND s.plan_type::text = 'premium' THEN $1::numeric
                WHEN s.subscription_status IN ('active','trialing')
                     AND s.plan_type::text = 'starter' THEN $2::numeric
                WHEN s.id IS NULL AND c.plan::text = 'premium' THEN $1::numeric
                WHEN s.id IS NULL AND c.plan::text = 'starter' THEN $2::numeric
                ELSE NULL
              END AS interval_hours
     ) plan_interval
    WHERE pc.status = 'connected'
      AND pc.platform::text = ANY($4::text[])
      AND (
            (plan_interval.interval_hours IS NOT NULL
             AND (pc.last_synced_at IS NULL
                  OR pc.last_synced_at < NOW() - (plan_interval.interval_hours * INTERVAL '1 hour')))
         OR
            (pc.initial_sync_at IS NULL
             AND pc.initial_sync_attempts < $5::int
             AND (pc.last_synced_at IS NULL
                  OR pc.last_synced_at < NOW() - ($6::numeric * INTERVAL '1 hour')))
          )
    ORDER BY (pc.initial_sync_at IS NULL) DESC, pc.last_synced_at ASC NULLS FIRST
    LIMIT $3::int
    FOR UPDATE OF pc SKIP LOCKED)
RETURNING p.id, p.clinic_id, (p.initial_sync_at IS NULL) AS is_initial`;

export async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const claimed = await sequelize.query(CLAIM_SQL, {
      bind: [
        PREMIUM_HOURS,
        STARTER_HOURS,
        BATCH_PER_TICK,
        SYNCABLE_PLATFORMS,
        MAX_INITIAL_SYNC_ATTEMPTS,
        INITIAL_SYNC_RETRY_HOURS,
      ],
      type: QueryTypes.SELECT,
    });

    for (const conn of claimed) {
      await syncOne(conn);
    }
  } catch (err) {
    console.error(
      "[syncScheduler] CLAIM FAILED — no connection was synced this tick:",
      err.message,
      err.original?.code ? `[${err.original.code}]` : "",
      err.original?.detail || err.original?.hint || ""
    );
  } finally {
    ticking = false;
  }
}

async function syncOne({ id, clinic_id: clinicId, is_initial: isInitial }) {
  const tag = `${id.slice(0, 8)}…${isInitial ? " (initial)" : ""}`;

  try {
    const stats = await syncByConnectionId(id);

    await sequelize.query(
      `UPDATE platform_connections
          SET last_synced_at  = NOW(),
              last_sync_error = NULL,
              initial_sync_at = COALESCE(initial_sync_at, NOW())
        WHERE id = $1::uuid`,
      { bind: [id], type: QueryTypes.UPDATE }
    );

    if (isInitial || stats.created > 0 || stats.trimmed > 0) {
      console.log(
        `[syncScheduler] ${tag} clinic ${clinicId.slice(0, 8)}…: ` +
          `+${stats.created} new, ${stats.updated} updated, ${stats.trimmed} trimmed ` +
          `(${stats.pages} page${stats.pages === 1 ? "" : "s"})` +
          (stats.trimmed > 0 ? " — free-tier cap applied" : "")
      );
    }
  } catch (err) {
    const messages = {
      GBP_NOT_APPROVED: "Google Business Profile API access not yet approved (quota 0). Will retry next interval.",
      REVOKED: "Access revoked — the user must reconnect this platform.",
      NO_CONNECTION: "Connection disappeared mid-sync.",
      NOT_CONNECTED: "Connection is no longer in 'connected' status.",
      UNSUPPORTED_PLATFORM: "No review provider for this platform yet.",
      YELP_NOT_CONFIGURED: "YELP_API_KEY is not set — cannot sync Yelp reviews.",
      YELP_AUTH: "Yelp rejected the API key. Check YELP_API_KEY.",
      YELP_NOT_FOUND: "Yelp business not found — check the saved business id.",
      YELP_RATE_LIMIT: "Yelp rate limit hit. Will retry next interval.",
      FB_PERMISSION: "Facebook page-read permissions not approved yet (or token can't read this Page).",
      FB_AUTH: "Facebook page token invalid — reconnect required.",
      FB_API_ERROR: "Facebook API error during sync. Will retry next interval.",
      FB_RATE_LIMIT: "Facebook rate limit hit. Will retry next interval.",
      FB_FETCH: "Facebook fetch failed. Will retry next interval.",
    };
    let msg = messages[err.code] || String(err.message || err).slice(0, 500);

    if (isInitial) {
      const [row] = await sequelize
        .query(
          `SELECT initial_sync_attempts AS n FROM platform_connections WHERE id = $1::uuid`,
          { bind: [id], type: QueryTypes.SELECT }
        )
        .catch(() => [{ n: 0 }]);
      const attempts = row?.n ?? 0;
      msg =
        attempts >= MAX_INITIAL_SYNC_ATTEMPTS
          ? `First sync failed after ${attempts} attempts and will not be retried automatically. Reconnect this platform in Settings to try again. Last error: ${msg}`
          : `First sync failed (attempt ${attempts} of ${MAX_INITIAL_SYNC_ATTEMPTS}, retrying in ~${INITIAL_SYNC_RETRY_HOURS}h). ${msg}`;
    }

    await sequelize
      .query(
        `UPDATE platform_connections SET last_sync_error = $2::text WHERE id = $1::uuid`,
        { bind: [id, msg.slice(0, 1000)], type: QueryTypes.UPDATE }
      )
      .catch(() => {});

    const AMBIENT = new Set(["GBP_NOT_APPROVED", "YELP_RATE_LIMIT", "FB_PERMISSION", "FB_RATE_LIMIT"]);
    const logFn = AMBIENT.has(err.code) ? console.warn : console.error;
    logFn(`[syncScheduler] sync failed for connection ${tag}: ${msg}`);
  }
}

export function startSyncScheduler() {
  if (timer) return;

  if (!reviewSyncImplemented) {
    console.warn("⏸  Sync scheduler idle: review sync service reports isImplemented=false");
    return;
  }

  timer = setInterval(tick, TICK_MS);
  timer.unref?.();
  console.log(
    `🔄 Sync scheduler started (tick ${TICK_MS / 1000}s, batch ${BATCH_PER_TICK}, ` +
      `platforms: ${SYNCABLE_PLATFORMS.join("/")}, ` +
      `intervals: starter ${STARTER_HOURS}h / premium ${PREMIUM_HOURS}h, ` +
      `initial backfill: all plans, ${MAX_INITIAL_SYNC_ATTEMPTS} attempts / ${INITIAL_SYNC_RETRY_HOURS}h apart${
        String(process.env.REVIEWS_MOCK).toLowerCase() === "true" ? ", MOCK REVIEWS" : ""
      })`
  );

  if (
    env.NODE_ENV === "production" &&
    String(process.env.REVIEWS_MOCK).toLowerCase() === "true" &&
    process.env.REVIEWS_MOCK_ALLOW_PROD !== "true"
  ) {
    console.error(
      "⚠️  REVIEWS_MOCK=true in production — every scheduled sync will fail loudly " +
        "(mock provider prod guard). Set REVIEWS_MOCK=false before real launch."
    );
  }
}

export async function stopSyncScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
  while (ticking) await new Promise((r) => setTimeout(r, 100));
  console.log("🛑 Sync scheduler stopped");
}
