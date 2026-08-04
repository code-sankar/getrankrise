// backend/src/db/assertSchema.js
//
// Boot-time guard against the ONE failure mode raw SQL has that the ORM
// doesn't: a column this codebase names in a hand-written statement not
// existing in the database.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
// The sync scheduler's CLAIM_SQL read `subscriptions.status` and
// `subscriptions.plan` for an entire phase. The real columns are
// `subscription_status` and `plan_type` (migration 0001). Postgres raised
// 42703 on every single tick; tick()'s try/catch turned it into one line of
// console.error; and a scheduler that claims nothing is indistinguishable
// from a scheduler with nothing due. Automatic review sync — the core product
// loop — had never run once, in any environment, and nothing surfaced it.
//
// Sequelize would have caught this class of bug on a model attribute. It
// cannot catch it in `sequelize.query(...)`, and this project deliberately
// uses raw SQL for every concurrency-critical path (FOR UPDATE SKIP LOCKED
// claiming, atomic credit reservation, analytics aggregation). That trade is
// the right one — but it has to be paid for with a check like this.
//
// ── SCOPE: raw-SQL dependencies only ────────────────────────────────────────
// CORE tables (users, clinics, reviews, …) are created by sequelize.sync()
// from the models, so any column the ORM reads is guaranteed to exist. The
// columns listed below are the subset that HAND-WRITTEN SQL depends on. If
// you add a raw query that names a new column, add it here. If you rename a
// column, this file fails the deploy at boot instead of the feature failing
// silently in production three weeks later.
//
// ── COST ────────────────────────────────────────────────────────────────────
// One information_schema query at startup. Not per-request, not per-tick.
//
// Called from src/db/bootstrap.js AFTER runMigrations() — the migrations are
// what create most of these columns, so asserting before them would fail on
// every fresh database.

import { QueryTypes } from "sequelize";
import { sequelize } from "../config/db.js";

/**
 * table → columns that raw SQL in this codebase names by hand.
 *
 * Each entry carries a pointer to the query that depends on it, so whoever
 * trips this assertion knows what breaks rather than just what's missing.
 */
export const REQUIRED_COLUMNS = Object.freeze({
  // services/reviews/syncScheduler.service.js  → CLAIM_SQL
  // services/subscription/*, services/credits/credits.service.js
  subscriptions: [
    "clinic_id",
    "plan_type", //            CLAIM_SQL plan resolution
    "subscription_status", //  CLAIM_SQL good-standing check
    "current_period_start", // credits lazy period reset
    "current_period_end",
    "sms_credits_used", //     credits reserve/refund
    "whatsapp_credits_used",
    "credits_reset_at",
  ],

  // services/reviews/syncScheduler.service.js  → CLAIM_SQL, syncOne
  // services/reviews/reviewSync.service.js     → upsert + trim
  platform_connections: [
    "clinic_id",
    "platform", //             CLAIM_SQL platform filter
    "status", //               CLAIM_SQL 'connected' filter
    "last_synced_at", //       CLAIM_SQL claim stamp (migration 0008)
    "last_sync_error", //      syncOne failure record (migration 0008)
    "last_error", //           OAuth/token failures — distinct from the above
    "external_location_id",
    "access_token_enc",
    "refresh_token_enc",
  ],

  // services/reviews/reviewSync.service.js     → UPSERT_SQL_BY_PLATFORM, trim
  // services/analytics/analytics.service.js    → every aggregate
  reviews: [
    "clinic_id",
    "platform",
    "rating",
    "replied",
    "sentiment", //            migration 0005 + analytics COALESCE
    "external_id", //          partial unique index / dedupe
    "reviewer_name",
    "review_date", //          COALESCE(review_date, created_at) everywhere
  ],

  // services/reviews/syncScheduler.service.js  → CLAIM_SQL fallback branch
  clinics: ["plan"],

  // services/campaigns/campaignRunner.service.js → promote/claim/complete
  campaigns: [
    "clinic_id",
    "status",
    "scheduled_at",
    "started_at",
    "completed_at",
    "throttle_per_minute",
    "last_error",
  ],
  // services/campaigns/campaignRunner.service.js → requeueStuck (both
  // branches) and the pre-send stamp. send_started_at is what separates
  // "safe to retry" from "may already have been delivered"; if it ever goes
  // missing the sweep silently reverts to at-least-once and starts sending
  // patients duplicate messages, so fail the boot instead.
  campaign_recipients: [
    "campaign_id",
    "status",
    "claimed_at",
    "send_started_at",
  ],

  // controllers/request.controller.js → the idempotency claim. Without this
  // column the claiming INSERT throws on every send.
  requests: ["clinic_id", "idempotency_key"],
});

/**
 * Verifies every column in REQUIRED_COLUMNS exists. One query, no per-table
 * round trips.
 *
 * @throws {Error} listing every missing table.column, not just the first
 */
export async function assertSchema() {
  const tables = Object.keys(REQUIRED_COLUMNS);

  const rows = await sequelize.query(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = ANY($1::text[])`,
    { bind: [tables], type: QueryTypes.SELECT }
  );

  // table → Set(columns)
  const actual = new Map(tables.map((t) => [t, new Set()]));
  for (const r of rows) actual.get(r.table_name)?.add(r.column_name);

  const problems = [];

  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    const present = actual.get(table);

    // Zero rows for a table means the table itself is absent — report that
    // once rather than emitting a line per column.
    if (!present || present.size === 0) {
      problems.push(`  • table "${table}" does not exist (migrations not run?)`);
      continue;
    }

    for (const column of columns) {
      if (!present.has(column)) problems.push(`  • ${table}.${column}`);
    }
  }

  if (problems.length > 0) {
    throw new Error(
      "Schema assertion failed — raw SQL in this codebase names columns that " +
        "do not exist:\n" +
        problems.join("\n") +
        "\n\n  Raw queries fail at RUNTIME with 42703, and several of them are " +
        "inside\n  background loops whose errors are caught and logged rather " +
        "than thrown.\n  Refusing to start rather than serve traffic against a " +
        "schema that will\n  silently break the sync scheduler or campaign " +
        "runner.\n\n  Fix: run `npm run migrate`, or update " +
        "src/db/assertSchema.js if a column\n  was renamed on purpose (and " +
        "update the query that reads it).\n"
    );
  }

  console.log(
    `✅ Schema assertion: ${tables.length} tables, ` +
      `${Object.values(REQUIRED_COLUMNS).flat().length} raw-SQL columns verified`
  );
}