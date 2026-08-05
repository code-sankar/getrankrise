// backend/server.js
//
// STEP 3 CHANGE: starts/stops the sync scheduler alongside the campaign
// runner. Both loops are multi-instance safe (all claiming is atomic SQL with
// SKIP LOCKED semantics), and each has its own disable flag so web/worker
// roles can be split later without code changes:
//
//   CAMPAIGN_RUNNER_DISABLED=true   → this instance never sends campaigns
//   SYNC_SCHEDULER_DISABLED=true    → this instance never auto-syncs reviews
//
// Shutdown order (the comments below say why): background loops first — and
// campaigns before syncs, because an interrupted campaign batch risks a
// DOUBLE-SEND on retry while an interrupted review sync merely re-runs an
// idempotent upsert — then HTTP, then the pool.

import app from "./src/app.js";
import { initializeDatabase, closeDatabase } from "./src/db/bootstrap.js";
import { env } from "./src/config/env.js";
import { initObservability, reportError } from "./src/utils/observability.js";
import {
  startCampaignRunner,
  stopCampaignRunner,
} from "./src/services/campaigns/campaignRunner.service.js";
import {
  startSyncScheduler,
  stopSyncScheduler,
} from "./src/services/reviews/syncScheduler.service.js";

// Before anything can fail. initObservability only reads config and logs what
// it decided — it never throws, so it is safe this early.
initObservability({ nodeEnv: env.NODE_ENV });

const PORT = env.PORT;

let server;

// Connect → sync core models → run pending migrations → start serving.
initializeDatabase()
  .then(() => {
    server = app.listen(PORT, () => {
      console.log(`\n✅ Server running on http://localhost:${PORT}`);
      console.log(`📦 Environment : ${env.NODE_ENV}`);
      console.log(
        `🗄️  Database    : ${env.DB_NAME} @ ${env.DB_HOST}:${env.DB_PORT}\n`
      );
    });

    // Phase 6: the campaign send loop. Safe on multi-instance deploys — all
    // work-claiming is FOR UPDATE SKIP LOCKED, so N instances process
    // disjoint batches. Set CAMPAIGN_RUNNER_DISABLED=true on instances that
    // should serve HTTP only (e.g. if you later split web/worker roles).
    if (process.env.CAMPAIGN_RUNNER_DISABLED !== "true") {
      startCampaignRunner();
    }

    // Step 3: the automatic review-sync loop. Claims due connections
    // (per-plan syncIntervalHours vs last_synced_at) with the same SKIP
    // LOCKED discipline, so N instances sync disjoint connections. Set
    // SYNC_SCHEDULER_DISABLED=true on HTTP-only instances.
    if (process.env.SYNC_SCHEDULER_DISABLED !== "true") {
      startSyncScheduler();
    }
  })
  .catch((err) => {
    console.error("❌ Failed to initialise database:", err.message);
    if (err.original?.detail) console.error("   detail:", err.original.detail);
    // A boot failure is the single most important error to have a record of:
    // the process is about to exit, so nothing else will ever report it.
    reportError(err, { source: "boot", level: "fatal" });
    process.exit(1);
  });

// ── Graceful shutdown ─────────────────────────────────────────────────────────
// Order matters: stop claiming new background work FIRST and wait for
// in-flight ticks. Campaigns drain before syncs — abandoning a send batch
// mid-provider-call is how double-sends happen on the retry, whereas an
// abandoned review sync just re-runs its idempotent upsert next interval.
// Then stop HTTP, then close the pool (both loops and all handlers share the
// ONE pool, so it closes last).
const shutdown = async (signal) => {
  console.log(`\n${signal} received — shutting down gracefully…`);

  const forceExit = setTimeout(() => {
    console.error("⏱  Shutdown timed out after 15s — forcing exit");
    process.exit(1);
  }, 15_000);
  forceExit.unref();

  try {
    await stopCampaignRunner();
    await stopSyncScheduler();
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      console.log("🚪 HTTP server closed");
    }
    await closeDatabase();
    clearTimeout(forceExit);
    process.exit(0);
  } catch (err) {
    console.error("Error during shutdown:", err.message);
    process.exit(1);
  }
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ── Last-resort handlers ─────────────────────────────────────────────────────
// Both still exit — a process in an unknown state should be replaced, not
// nursed — but they now leave a record first. Previously the only trace of a
// crash-loop was a one-line console.error in a log nobody was reading, which
// makes "it keeps restarting" almost impossible to diagnose after the fact.
//
// The exit is DEFERRED by a beat so the fire-and-forget report has a chance to
// leave the box. 250ms is not a guarantee — nothing can guarantee delivery from
// a dying process — but it converts "never sends" into "usually sends", and the
// structured log line is written synchronously either way.
const exitAfterReporting = () => setTimeout(() => process.exit(1), 250).unref?.();

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
  reportError(reason, { source: "unhandledRejection", level: "fatal" });
  exitAfterReporting();
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err.message);
  reportError(err, { source: "uncaughtException", level: "fatal" });
  exitAfterReporting();
});