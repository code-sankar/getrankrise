// backend/tests/helpers/db.js
//
// Shared fixtures for the integration tests.
//
// These tests run against a REAL PostgreSQL, deliberately. Every invariant
// worth testing in this codebase — atomic credit reservation, FOR UPDATE SKIP
// LOCKED work claiming, ON CONFLICT upsert merge rules, partial unique indexes
// — is a property of Postgres executing a specific statement. A mocked client
// would assert that we still send the same string, which is not the thing that
// can break.
//
// Point DB_NAME at a throwaway database. The helpers below truncate tables.

import { randomUUID } from "node:crypto";
import { QueryTypes } from "sequelize";
import { sequelize } from "../../src/config/db.js";
import { initializeDatabase, closeDatabase } from "../../src/db/bootstrap.js";

let initialised = false;

/** Brings the schema up once per test process. */
export async function setupDatabase() {
  if (initialised) return;
  await initializeDatabase();
  initialised = true;
}

export async function teardownDatabase() {
  if (!initialised) return;
  await closeDatabase();
  initialised = false;
}

/**
 * Removes everything the tests create. Ordered child-first so foreign keys
 * resolve without needing CASCADE on tables we did not write.
 */
export async function resetData() {
  await sequelize.query(`
    TRUNCATE TABLE
      campaign_recipients, campaigns, opt_outs,
      refresh_tokens, auth_tokens, webhook_events, usage_counters,
      competitor_snapshots, competitors,
      notifications, requests, reviews,
      clinic_invitations, clinic_members,
      platform_connections, subscriptions, clinics, users
    RESTART IDENTITY CASCADE
  `);
}

/**
 * A user + clinic + subscription, which is the minimum viable tenant. Mirrors
 * what registration creates, so tests exercise the same shape production has.
 */
export async function createClinic({
  plan = "premium",
  status = "active",
  email = `test-${randomUUID()}@example.com`,
  countryCode = null,
  googleReviewLink = "https://example.com/review",
  periodStart = new Date(Date.now() - 3 * 86400e3),
  periodEnd = new Date(Date.now() + 27 * 86400e3),
} = {}) {
  const [user] = await sequelize.query(
    `INSERT INTO users (id, name, email, password, role, is_active, created_at, updated_at)
     VALUES (gen_random_uuid(), 'Test Owner', $1::text, 'x', 'admin', true, NOW(), NOW())
     RETURNING id`,
    { bind: [email], type: QueryTypes.SELECT }
  );

  const [clinic] = await sequelize.query(
    `INSERT INTO clinics (id, user_id, clinic_name, country_code, google_review_link, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, 'Test Clinic', $2::text, $3::text, NOW(), NOW())
     RETURNING id`,
    { bind: [user.id, countryCode, googleReviewLink], type: QueryTypes.SELECT }
  );

  await sequelize.query(
    `INSERT INTO subscriptions
       (clinic_id, plan_type, subscription_status, current_period_start, current_period_end,
        sms_credits_used, whatsapp_credits_used, credits_reset_at)
     VALUES ($1::uuid, $2::plan_type_enum, $3::subscription_status_enum,
             $4::timestamptz, $5::timestamptz, 0, 0, NOW())`,
    { bind: [clinic.id, plan, status, periodStart, periodEnd], type: QueryTypes.INSERT }
  );

  // The owner membership, exactly as registration writes it. loadClinic
  // resolves the tenant through this table, so a fixture without it would
  // produce a clinic no request can reach.
  await sequelize.query(
    `INSERT INTO clinic_members (clinic_id, user_id, role)
     VALUES ($1::uuid, $2::uuid, 'owner'::clinic_role_enum)`,
    { bind: [clinic.id, user.id], type: QueryTypes.INSERT }
  );

  return { userId: user.id, clinicId: clinic.id, email };
}

/** Reads the raw credit counters — tests assert on these, not on API output. */
export async function creditsFor(clinicId) {
  const [row] = await sequelize.query(
    `SELECT sms_credits_used::int AS sms, whatsapp_credits_used::int AS whatsapp
       FROM subscriptions WHERE clinic_id = $1::uuid`,
    { bind: [clinicId], type: QueryTypes.SELECT }
  );
  return row;
}

export { sequelize };
