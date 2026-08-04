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
//       syncIntervalHours (Starter 24h / Premium 1h). This is the original
//       behaviour and is unchanged.
//
//   (b) INITIAL — EVERY plan, including Free, exactly once per connection.
//       Fires while initial_sync_at IS NULL (migration 0010), bounded by
//       initial_sync_attempts.
//
// Branch (b) exists because Free had no ingestion path whatsoever: no
// automatic cadence (syncIntervalHours: null) and a manual button that 403s
// (reviewSyncsPerDay: 0). A Free clinic could connect Google and never receive
// one review, which made the advertised "20 stored historical reviews" — and
// the free-tier trim that enforces it — unreachable in production. One
// backfill turns Free into a real, if frozen, product surface: 20 rows, a
// working dashboard, and the cap banner doing the upselling.
//
// Doing this in the scheduler rather than in the three connect controllers
// (Google selectLocation / Yelp connect / Facebook selectPage) is deliberate:
//   * one code path instead of three, and it covers any future platform for
//     free the moment its connect flow sets status='connected'
//   * exactly-once falls out of claim-by-stamping — no "already syncing?"
//     flag, no idempotency key
//   * the HTTP connect response doesn't block on a full paginated backfill
//   * SKIP LOCKED means two app instances can't both backfill one connection
//
// METERING: branch (b) does NOT touch the review_sync meter, same as branch
// (a). The meter governs the manual button only. For Free the CAP is the
// column — one successful sync, ever.
//
// ── CLAIM-BY-STAMPING (read this before "improving" it) ─────────────────────
// The claim UPDATE sets last_synced_at = NOW() *before* the sync runs. That
// stamp IS the claim: the moment it lands, every other instance's due-query
// stops seeing the connection for a full plan interval.
//
// This is exactly why branch (b) needs its own column and cannot test
// last_synced_at IS NULL. One tick after a connection is claimed,
// last_synced_at is set whether the sync succeeded, threw, or the worker died
// mid-pagination. initial_sync_at is written only on SUCCESS, so it answers
// the question Free actually depends on: has this connection ever produced
// data? The retry window (INITIAL_SYNC_RETRY_HOURS) is what lets a failed
// first attempt come back around, and initial_sync_attempts is what stops it
// coming back around forever.
//
// Other consequences of claim-by-stamping, all deliberate:
//   * A recurring sync that FAILS is not retried until the next interval.
//     last_sync_error records why; the stamp stays. That is the backoff.
//   * A worker that CRASHES mid-sync loses at most one interval for the
//     connections it claimed. The upsert is idempotent.
//   * On SUCCESS we stamp again (a long sync shouldn't eat into the next
//     interval) and clear last_sync_error.
//
// ── COLUMN NAMES ────────────────────────────────────────────────────────────
// subscriptions.plan_type / subscriptions.subscription_status. This file once
// read s.plan / s.status — neither exists — and every tick died on 42703
// inside a swallowing catch, so the scheduler had never claimed anything.
// src/db/assertSchema.js now fails the boot if these drift. Update it if you
// rename anything here.
//
// ── DUE-NESS: plan resolution lives in the SQL ──────────────────────────────
//     subscription row in good standing (active/trialing) → its plan_type
//     no subscription row at all                          → clinics.plan
//     subscription row NOT in good standing               → 'free'
//
// past_due/canceled/paused clinics stop auto-syncing until billing recovers —
// same posture as requireFeature. Note they still get their INITIAL sync if
// they never had one: a lapsed subscription drops you to Free, and Free gets
// a backfill.

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
// late, which is noise at that cadence. It is also the worst-case latency
// between "user connects Google" and "their first reviews appear", which is
// the more user-visible number now that branch (b) exists.
const TICK_MS = Number(process.env.SYNC_SCHEDULER_TICK_MS) || 60_000;

// Connections claimed per tick PER INSTANCE. Syncs run sequentially within a
// tick (bounds concurrent provider pressure and pool usage).
const BATCH_PER_TICK = Number(process.env.SYNC_SCHEDULER_BATCH) || 5;

// Interval hours from the single source of truth. Fallbacks only guard
// against the keys being renamed out from under us — plans.js wins when set.
const PREMIUM_HOURS = Number(PLAN_LIMITS[PLANS.PREMIUM]?.syncIntervalHours) || 1;
const STARTER_HOURS = Number(PLAN_LIMITS[PLANS.STARTER]?.syncIntervalHours) || 24;

// ── Initial-sync retry policy ────────────────────────────────────────────────
// 5 attempts, 6h apart ≈ 30 hours of runway. Sized against the real failure
// modes: GBP_NOT_APPROVED persists for days or weeks (no retry count would
// help, and the approval landing is what fixes it — a support-visible
// last_sync_error is the right outcome), whereas transient provider 5xx and
// rate limits clear in minutes to hours. After the cap, the connection stops
// being claimed and last_sync_error carries the diagnosis. A reconnect resets
// the counter (see the connect-flow note in the runbook).
const MAX_INITIAL_SYNC_ATTEMPTS =
  Number(process.env.INITIAL_SYNC_MAX_ATTEMPTS) || 5;
const INITIAL_SYNC_RETRY_HOURS =
  Number(process.env.INITIAL_SYNC_RETRY_HOURS) || 6;

// Platforms with a working provider in reviewSync.service.js's getProvider
// switch. syncByConnectionId throws UNSUPPORTED_PLATFORM for anything else,
// and a claim that can only fail should never be made — on branch (b) it
// would also burn one of the connection's finite initial attempts.
const SYNCABLE_PLATFORMS = ["google", "yelp", "facebook"];

let timer = null;
let ticking = false; // re-entrancy guard within one process

// ── THE CLAIM ────────────────────────────────────────────────────────────────
// One statement: find due connections (either branch), lock them (SKIP LOCKED
// → disjoint across workers), stamp them, return them. FOR UPDATE OF pc locks
// only the connection rows — legal despite the LEFT JOIN because pc is not the
// nullable side.
//
// The attempts counter is incremented in the SAME statement as the claim, so
// a worker that dies before finishing still consumed its attempt. That is the
// point: an attempt is a try, not a success.
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
      -- platform_connections.platform is the ENUM platform_enum. Comparing it
      -- against $4::text[] needs an "enum = text" operator that does not exist
      -- (42883) — the claim threw on EVERY tick, tick()'s catch logged one line,
      -- and automatic review sync never claimed a single connection. Cast the
      -- column to text instead of the parameter: the enum side is what has to
      -- give, and the candidate set here is small enough that losing the index
      -- on platform costs nothing.
      AND pc.platform::text = ANY($4::text[])
      AND (
            -- (a) RECURRING — paid plans on their cadence
            (plan_interval.interval_hours IS NOT NULL
             AND (pc.last_synced_at IS NULL
                  OR pc.last_synced_at < NOW() - (plan_interval.interval_hours * INTERVAL '1 hour')))
         OR
            -- (b) INITIAL — every plan, once, with bounded retries
            (pc.initial_sync_at IS NULL
             AND pc.initial_sync_attempts < $5::int
             AND (pc.last_synced_at IS NULL
                  OR pc.last_synced_at < NOW() - ($6::numeric * INTERVAL '1 hour')))
          )
    -- Never-backfilled connections first: someone who just finished onboarding
    -- should not queue behind a routine refresh. Costs a sort over a small
    -- candidate set; worth it for the first-run experience.
    ORDER BY (pc.initial_sync_at IS NULL) DESC, pc.last_synced_at ASC NULLS FIRST
    LIMIT $3::int
    FOR UPDATE OF pc SKIP LOCKED)
RETURNING p.id, p.clinic_id, (p.initial_sync_at IS NULL) AS is_initial`;

// ── The tick ─────────────────────────────────────────────────────────────────
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
      type: QueryTypes.SELECT, // UPDATE ... RETURNING comes back as rows
    });

    for (const conn of claimed) {
      await syncOne(conn);
    }
  } catch (err) {
    // A throw HERE is a claim-query failure, not a per-connection failure:
    // schema drift, a dead pool, a bad bind. It is never routine. Log the
    // Postgres code and detail too — the version of this catch that printed
    // only err.message is how a 42703 hid for an entire phase.
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

    // Success: re-stamp (long syncs shouldn't borrow from the next interval),
    // clear any previous failure, and — the Step 4 line — record that this
    // connection has now produced data at least once. COALESCE so a later
    // recurring sync never moves the original backfill timestamp.
    await sequelize.query(
      `UPDATE platform_connections
          SET last_synced_at  = NOW(),
              last_sync_error = NULL,
              initial_sync_at = COALESCE(initial_sync_at, NOW())
        WHERE id = $1::uuid`,
      { bind: [id], type: QueryTypes.UPDATE }
    );

    // Initial syncs are always worth a line, even a zero-row one: "connected
    // but the platform has no reviews" is a real state a support person will
    // need to distinguish from "the backfill never ran".
    if (isInitial || stats.created > 0 || stats.trimmed > 0) {
      console.log(
        `[syncScheduler] ${tag} clinic ${clinicId.slice(0, 8)}…: ` +
          `+${stats.created} new, ${stats.updated} updated, ${stats.trimmed} trimmed ` +
          `(${stats.pages} page${stats.pages === 1 ? "" : "s"})` +
          (stats.trimmed > 0 ? " — free-tier cap applied" : "")
      );
    }
  } catch (err) {
    // Failure: record why, KEEP the claim stamp — see claim-by-stamping notes.
    const messages = {
      GBP_NOT_APPROVED:
        "Google Business Profile API access not yet approved (quota 0). Will retry next interval.",
      REVOKED: "Access revoked — the user must reconnect this platform.",
      NO_CONNECTION: "Connection disappeared mid-sync.",
      NOT_CONNECTED: "Connection is no longer in 'connected' status.",
      UNSUPPORTED_PLATFORM: "No review provider for this platform yet.",
      YELP_NOT_CONFIGURED: "YELP_API_KEY is not set — cannot sync Yelp reviews.",
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
    let msg = messages[err.code] || String(err.message || err).slice(0, 500);

    // On the initial branch, say plainly when the retries are spent. Otherwise
    // last_sync_error reads "will retry next interval" on a connection that
    // will never be claimed again — the most misleading possible message on
    // the one sync a Free clinic gets.
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
          ? `First sync failed after ${attempts} attempts and will not be retried automatically. ` +
            `Reconnect this platform in Settings to try again. Last error: ${msg}`
          : `First sync failed (attempt ${attempts} of ${MAX_INITIAL_SYNC_ATTEMPTS}, ` +
            `retrying in ~${INITIAL_SYNC_RETRY_HOURS}h). ${msg}`;
    }

    await sequelize
      .query(
        `UPDATE platform_connections
            SET last_sync_error = $2::text
          WHERE id = $1::uuid`,
        { bind: [id, msg.slice(0, 1000)], type: QueryTypes.UPDATE }
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
    logFn(`[syncScheduler] sync failed for connection ${tag}: ${msg}`);
  }
}

// ── Lifecycle (wired in server.js) ───────────────────────────────────────────
export function startSyncScheduler() {
  if (timer) return;

  // The seam guard the Phase 7 stub era left behind: if reviewSync is ever
  // rolled back to a stub (isImplemented = false), the scheduler must idle
  // rather than claim connections it cannot sync — a claim consumes a full
  // interval of the clinic's cadence, and on the initial branch it would burn
  // one of a finite number of attempts.
  if (!reviewSyncImplemented) {
    console.warn(
      "⏸  Sync scheduler idle: review sync service reports isImplemented=false"
    );
    return;
  }

  timer = setInterval(tick, TICK_MS);
  timer.unref?.(); // never keep the process alive on its own
  console.log(
    `🔄 Sync scheduler started (tick ${TICK_MS / 1000}s, batch ${BATCH_PER_TICK}, ` +
      `platforms: ${SYNCABLE_PLATFORMS.join("/")}, ` +
      `intervals: starter ${STARTER_HOURS}h / premium ${PREMIUM_HOURS}h, ` +
      `initial backfill: all plans, ${MAX_INITIAL_SYNC_ATTEMPTS} attempts / ${INITIAL_SYNC_RETRY_HOURS}h apart${
        String(process.env.REVIEWS_MOCK).toLowerCase() === "true"
          ? ", MOCK REVIEWS"
          : ""
      })`
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
        "(mock provider prod guard). Set REVIEWS_MOCK=false before real launch."
    );
  }
}

export async function stopSyncScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
  // Let an in-flight tick finish: interrupting a sync mid-pagination wastes
  // the interval the claim already spent — and on the initial branch, one of
  // the connection's finite attempts.
  while (ticking) await new Promise((r) => setTimeout(r, 100));
  console.log("🛑 Sync scheduler stopped");
}