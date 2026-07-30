// backend/src/services/reviews/syncScheduler.service.js
//
// The automatic review-sync loop — the module every comment in
// reviewSync.service.js has been promising. Mirrors
// campaignRunner.service.js: a setInterval tick that is MULTI-INSTANCE SAFE
// without Redis or any queue infrastructure, because the one mutating step is
// an atomic Postgres statement where concurrent workers get disjoint work:
//
//   claiming   UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)
//              → disjoint connections, exactly one worker per connection
//
// ── CLAIM-BY-STAMPING (read this before "improving" it) ─────────────────────
// The claim UPDATE sets last_synced_at = NOW() *before* the sync runs. That
// stamp IS the claim: the moment it lands, every other instance's due-query
// stops seeing the connection for a full plan interval. No 'processing'
// status, no claimed_at column, no requeue-stuck sweep — the interval itself
// is the lease.
//
// Consequences, all deliberate:
//   * A sync that FAILS is not retried until the next interval. last_sync_error
//     records why; the stamp stays. This is the backoff: a connection whose
//     sync throws every time (revoked grant, GBP quota, provider 500s) costs
//     one attempt per interval, never a hot loop. Auth-class failures don't
//     even wait for that — getValidAccessToken flips status to 'revoked' on
//     invalid_grant, which removes the row from the due-query entirely until
//     the user reconnects.
//   * A worker that CRASHES mid-sync loses at most one interval for the
//     connections it had claimed that tick. The upsert is idempotent, so the
//     next interval's sync repairs everything. For a 1h/24h cadence that is
//     an acceptable worst case and buys the removal of an entire
//     stuck-requeue subsystem.
//   * On SUCCESS we stamp again (a long sync shouldn't eat into the next
//     interval) and clear last_sync_error.
//
// ── DUE-NESS: plan resolution lives in the SQL ──────────────────────────────
// "Due" = connected + paid plan + last_synced_at older than the plan's
// syncIntervalHours (or never synced). Plan resolution mirrors
// getSubscriptionState's precedence, expressed as a CASE:
//
//     subscription row in good standing (active/trialing) → its plan
//     no subscription row at all                          → clinics.plan
//                                                           (dev / legacy)
//     subscription row NOT in good standing               → 'free'
//
// past_due/canceled/paused clinics therefore stop auto-syncing until billing
// recovers — same posture as requireFeature. Free never syncs automatically
// (syncIntervalHours: null in config/plans.js); the interval hours are read
// from PLAN_LIMITS at module load and passed as bind params, so plans.js
// stays the single source of truth. ORDER BY last_synced_at NULLS FIRST
// rides the idx_platform_conn_sync_due index from migration 0008 and puts
// never-synced connections at the front of the queue.
//
// METERING: scheduler syncs do NOT touch the review_sync usage meter. That
// budget exists for the manual button; for the scheduler, the plan's interval
// IS its cap (Free 0×, Starter 1×/24h, Premium 1×/1h). Documented in
// config/plans.js and reviewSync.controller.js — keep all three in agreement.

import { QueryTypes } from "sequelize";
import { sequelize } from "../../config/db.js";
import { env } from "../../config/env.js";
import { PLAN_LIMITS, PLANS } from "../../config/plans.js";
import {
  syncByConnectionId,
  isImplemented as reviewSyncImplemented,
} from "./reviewSync.service.js";

// ── Tuning ───────────────────────────────────────────────────────────────────
// 60s tick against 1h/24h intervals: a connection becomes due at most 60s
// late, which is noise at this cadence. Overridable for tests.
const TICK_MS = Number(process.env.SYNC_SCHEDULER_TICK_MS) || 60_000;

// Connections claimed per tick PER INSTANCE. Syncs run sequentially within a
// tick (bounds concurrent GBP API pressure and pool usage); 5/tick × 60
// ticks/h = 300 syncs/hour/instance of headroom. Raise when clinic count
// demands it — claiming stays disjoint across instances regardless.
const BATCH_PER_TICK = Number(process.env.SYNC_SCHEDULER_BATCH) || 5;

// Interval hours from the single source of truth. Fallbacks only guard
// against the keys being renamed out from under us — plans.js wins when set.
const PREMIUM_HOURS =
  Number(PLAN_LIMITS[PLANS.PREMIUM]?.syncIntervalHours) || 1;
const STARTER_HOURS =
  Number(PLAN_LIMITS[PLANS.STARTER]?.syncIntervalHours) || 24;

let timer = null;
let ticking = false; // re-entrancy guard within one process

// ── THE CLAIM ────────────────────────────────────────────────────────────────
// One statement: find due connections, lock them (SKIP LOCKED → disjoint
// across workers), stamp them (→ invisible to every due-query for a full
// interval), return them. FOR UPDATE OF pc locks only the connection rows —
// legal despite the LEFT JOIN because pc is not the nullable side.
//
// platform = 'google' because Google is the only implemented provider;
// syncByConnectionId would throw UNSUPPORTED_PLATFORM for anything else, and
// a claim that can only fail should never be made. Widen this list as
// providers land.
const CLAIM_SQL = `
UPDATE platform_connections p
   SET last_synced_at = NOW()
 WHERE p.id IN (
   SELECT pc.id
     FROM platform_connections pc
     JOIN clinics c            ON c.id = pc.clinic_id
     LEFT JOIN subscriptions s ON s.clinic_id = pc.clinic_id
     CROSS JOIN LATERAL (
       SELECT CASE
                WHEN s.status IN ('active','trialing') AND s.plan::text = 'premium' THEN $1::numeric
                WHEN s.status IN ('active','trialing') AND s.plan::text = 'starter' THEN $2::numeric
                WHEN s.id IS NULL              AND c.plan::text = 'premium' THEN $1::numeric
                WHEN s.id IS NULL              AND c.plan::text = 'starter' THEN $2::numeric
                ELSE NULL
              END AS interval_hours
     ) plan_interval
    WHERE pc.status = 'connected'
      AND pc.platform IN ('google', 'yelp', 'facebook')
      AND plan_interval.interval_hours IS NOT NULL
      AND (pc.last_synced_at IS NULL
           OR pc.last_synced_at < NOW() - (plan_interval.interval_hours * INTERVAL '1 hour'))
    ORDER BY pc.last_synced_at ASC NULLS FIRST
    LIMIT $3::int
    FOR UPDATE OF pc SKIP LOCKED)
RETURNING p.id, p.clinic_id`;

// ── The tick ─────────────────────────────────────────────────────────────────
export async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const claimed = await sequelize.query(CLAIM_SQL, {
      bind: [PREMIUM_HOURS, STARTER_HOURS, BATCH_PER_TICK],
      type: QueryTypes.SELECT, // UPDATE ... RETURNING comes back as rows
    });

    for (const conn of claimed) {
      await syncOne(conn);
    }
  } catch (err) {
    console.error("[syncScheduler] tick error:", err.message);
  } finally {
    ticking = false;
  }
}

async function syncOne({ id, clinic_id: clinicId }) {
  try {
    const stats = await syncByConnectionId(id);

    // Success: re-stamp (long syncs shouldn't borrow from the next interval)
    // and clear any previous failure.
    await sequelize.query(
      `UPDATE platform_connections
          SET last_synced_at = NOW(), last_sync_error = NULL
        WHERE id = $1::uuid`,
      { bind: [id], type: QueryTypes.UPDATE },
    );

    if (stats.created > 0 || stats.trimmed > 0) {
      console.log(
        `[syncScheduler] ${id.slice(0, 8)}… clinic ${clinicId.slice(0, 8)}…: ` +
          `+${stats.created} new, ${stats.updated} updated, ${stats.trimmed} trimmed ` +
          `(${stats.pages} page${stats.pages === 1 ? "" : "s"})`,
      );
    }
  } catch (err) {
    // Failure: record why, KEEP the claim stamp — see claim-by-stamping notes.
    // The known codes get compact, greppable messages; everything else keeps
    // its raw text (truncated — TEXT column, but logs shouldn't be novels).
    const messages = {
      GBP_NOT_APPROVED:
        "Google Business Profile API access not yet approved (quota 0). Will retry next interval.",
      REVOKED: "Access revoked — the user must reconnect this platform.",
      NO_CONNECTION: "Connection disappeared mid-sync.",
      NOT_CONNECTED: "Connection is no longer in 'connected' status.",
      UNSUPPORTED_PLATFORM: "No review provider for this platform yet.",
      YELP_NOT_CONFIGURED:
        "YELP_API_KEY is not set — cannot sync Yelp reviews.",
      YELP_AUTH: "Yelp rejected the API key. Check YELP_API_KEY.",
      YELP_NOT_FOUND: "Yelp business not found — check the saved business id.",
      YELP_RATE_LIMIT: "Yelp rate limit hit. Will retry next interval.",
      FB_PERMISSION:
        "Facebook page-read permissions not approved yet (or token can't read this Page).",
      FB_AUTH: "Facebook page token invalid — reconnect required.",
      FB_API_ERROR: "Facebook API error during sync. Will retry next interval.",
      FB_RATE_LIMIT: "Facebook rate limit hit. Will retry next interval.",
      FB_FETCH: "Facebook fetch failed. Will retry next interval.",
    };
    const msg = messages[err.code] || String(err.message || err).slice(0, 500);

    await sequelize
      .query(
        `UPDATE platform_connections
            SET last_sync_error = $2::text
          WHERE id = $1::uuid`,
        { bind: [id, msg], type: QueryTypes.UPDATE },
      )
      .catch(() => {}); // the error write must never mask the original failure

    // Approval-gate and rate-limit failures are ambient — warn rather than
    // error-spam. Every other failure is a genuine error worth alerting on.
    const AMBIENT = new Set([
      "GBP_NOT_APPROVED",
      "YELP_RATE_LIMIT",
      "FB_PERMISSION",
      "FB_RATE_LIMIT",
    ]);
    const logFn = AMBIENT.has(err.code) ? console.warn : console.error;
    logFn(
      `[syncScheduler] sync failed for connection ${id.slice(0, 8)}…: ${msg}`,
    );
  }
}

// ── Lifecycle (wired in server.js) ───────────────────────────────────────────
export function startSyncScheduler() {
  if (timer) return;

  // The seam guard the Phase 7 stub era left behind: if reviewSync is ever
  // rolled back to a stub (isImplemented = false), the scheduler must idle
  // rather than claim connections it cannot sync — a claim consumes a full
  // interval of the clinic's cadence.
  if (!reviewSyncImplemented) {
    console.warn(
      "⏸  Sync scheduler idle: review sync service reports isImplemented=false",
    );
    return;
  }

  timer = setInterval(tick, TICK_MS);
  timer.unref?.(); // never keep the process alive on its own
  console.log(
    `🔄 Sync scheduler started (tick ${TICK_MS / 1000}s, batch ${BATCH_PER_TICK}, ` +
      `intervals: starter ${STARTER_HOURS}h / premium ${PREMIUM_HOURS}h${
        String(process.env.REVIEWS_MOCK).toLowerCase() === "true"
          ? ", MOCK REVIEWS"
          : ""
      })`,
  );

  // Belt-and-braces prod tripwire, same posture as the mock provider's own
  // guard: a scheduler auto-running mock syncs in production would silently
  // fill real dashboards with fake patients on a timer.
  if (
    env.NODE_ENV === "production" &&
    String(process.env.REVIEWS_MOCK).toLowerCase() === "true" &&
    process.env.REVIEWS_MOCK_ALLOW_PROD !== "true"
  ) {
    console.error(
      "⚠️  REVIEWS_MOCK=true in production — every scheduled sync will fail loudly " +
        "(mock provider prod guard). Set REVIEWS_MOCK=false before real launch.",
    );
  }
}

export async function stopSyncScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
  // Let an in-flight tick finish: interrupting a sync mid-pagination wastes
  // the interval the claim already spent. The upsert is idempotent so a hard
  // kill isn't fatal — this drain just makes graceful shutdowns actually
  // graceful.
  while (ticking) await new Promise((r) => setTimeout(r, 100));
  console.log("🛑 Sync scheduler stopped");
}
