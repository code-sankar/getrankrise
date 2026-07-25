// backend/src/db/bootstrap.js
//
// Brings the database to a serving-ready state. Called once from server.js
// before app.listen().
//
// ── Why the order below matters ──────────────────────────────────────────────
//
// This codebase has two categories of table, for historical reasons:
//
//   CORE      users, clinics, reviews, requests, notifications, competitors,
//             competitor_snapshots — created by sequelize.sync() from the model
//             definitions.
//   MIGRATED  subscriptions, webhook_events, schema_migrations — created by SQL
//             files in backend/migrations/.
//
// The MIGRATED tables carry foreign keys into CORE tables (subscriptions
// references clinics(id)), so CORE must exist first. Hence:
//
//     authenticate  →  sync CORE  →  run migrations
//
// The models are synced EXPLICITLY, one at a time, rather than via a blanket
// sequelize.sync(). A blanket sync would also try to create `subscriptions`
// from the Subscription model — with Sequelize's own generated enum type names
// instead of the plan_type_enum / subscription_status_enum the migration
// creates — and whichever ran first would win. That race is exactly the class
// of bug Phase 0 exists to remove.
//
// ── The alter:true removal ───────────────────────────────────────────────────
//
// The previous connectDB() ran sync({ alter: true }) in development. That is
// now off by default. `alter` diffs the live schema against the models and
// issues ALTER statements it infers — which fights a migration runner, mangles
// Postgres ENUM columns (see migrations/0002), and quietly drops constraints it
// does not understand. If you want the old behaviour while iterating locally,
// set DB_SYNC_ALTER=true in your .env. Never set it in staging or production.

import { sequelize } from "../config/db.js";
import { runMigrations } from "./migrator.js";

import User from "../models/User.js";
import Clinic from "../models/Clinic.js";
import Review from "../models/Review.js";
import Request from "../models/Request.js";
import Notification from "../models/Notification.js";
import Competitor from "../models/Competitor.js";
import CompetitorSnapshot from "../models/CompetitorSnapshot.js";

// Importing models/index.js for its side effect: it defines the associations.
// Without this the hasOne/belongsTo wiring never runs and
// Clinic.create({ subscription }, { include }) will throw.
import "../models/index.js";

/**
 * Models whose tables sequelize.sync() is allowed to create.
 * ORDER IS SIGNIFICANT — parents before children, so foreign keys resolve.
 *
 * Subscription and WebhookEvent are deliberately absent. Do not add them.
 */
const CORE_MODELS = [
  User,
  Clinic,
  Review,
  Request,
  Notification,
  Competitor,
  CompetitorSnapshot,
];

async function syncCoreModels() {
  const alter = process.env.DB_SYNC_ALTER === "true";

  if (alter) {
    console.warn(
      "⚠️  DB_SYNC_ALTER=true — sequelize will ALTER core tables to match models.\n" +
        "   This is a local-development convenience and is unsafe anywhere else.\n" +
        "   Schema changes destined for staging/production belong in backend/migrations/."
    );
  }

  for (const model of CORE_MODELS) {
    await model.sync({ force: false, alter });
  }

  console.log(`✅ Core models synced (${CORE_MODELS.length} tables)`);
}

/**
 * Full database startup sequence.
 * Throws on any failure — server.js catches and exits non-zero so an
 * orchestrator (Docker, Render, Railway, ECS) will not route traffic to a
 * process running against a broken schema.
 */
export async function initializeDatabase() {
  await sequelize.authenticate();
  console.log("✅ PostgreSQL connected successfully");

  await syncCoreModels();
  await runMigrations();

  return sequelize;
}

/** Graceful shutdown — closes the single connection pool. */
export async function closeDatabase() {
  await sequelize.close();
  console.log("🔌 PostgreSQL connection pool closed");
}