import app from "./src/app.js";
import { initializeDatabase, closeDatabase } from "./src/db/bootstrap.js";
import { env } from "./src/config/env.js";
import {
  startCampaignRunner,
  stopCampaignRunner,
} from "./src/services/campaigns/campaignRunner.service.js";

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
  })
  .catch((err) => {
    console.error("❌ Failed to initialise database:", err.message);
    if (err.original?.detail) console.error("   detail:", err.original.detail);
    process.exit(1);
  });

// ── Graceful shutdown ─────────────────────────────────────────────────────────
// Order matters: stop claiming new campaign work FIRST (and wait for the
// in-flight tick — abandoning a batch mid-provider-call is how double-sends
// happen on the retry), then stop HTTP, then close the pool.
const shutdown = async (signal) => {
  console.log(`\n${signal} received — shutting down gracefully…`);

  const forceExit = setTimeout(() => {
    console.error("⏱  Shutdown timed out after 15s — forcing exit");
    process.exit(1);
  }, 15_000);
  forceExit.unref();

  try {
    await stopCampaignRunner();
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

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err.message);
  process.exit(1);
});