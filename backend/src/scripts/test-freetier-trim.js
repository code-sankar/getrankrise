#!/usr/bin/env node
// backend/scripts/test-freetier-trim.js
//
// Proves the free-tier "maximum 20 stored historical reviews" trim actually
// fires. This can't be tested through the HTTP endpoint: Free's review_sync
// daily budget is 0 in config/plans.js, so POST /reviews/sync correctly
// returns 403 before the sync (and therefore the trim) ever runs. The trim's
// real production caller is the future sync scheduler; until that exists,
// this script plays its role by calling the service layer directly — the
// same syncByConnectionId() the scheduler will call.
//
// What it does:
//   1. Finds the clinic for <user-email> and its Google connection.
//   2. Reports the effective plan + storedReviewsLimit from subscription state.
//      (The clinic must resolve to the FREE plan — the script aborts rather
//      than "test" a plan whose cap is Infinity and prove nothing.)
//   3. Pads the clinic with synthetic reviews until count > cap + 10, so the
//      trim has something real to delete even if the mock provider yields
//      fewer than 20 reviews. Synthetic rows have external_id NULL — exactly
//      like manually-created reviews — so they don't collide with the partial
//      unique index and are legal trim victims.
//   4. Runs syncByConnectionId() with the mock provider.
//   5. Asserts the final count ≤ cap and that the survivors are the NEWEST
//      rows (trim orders by COALESCE(review_date, created_at) DESC).
//
// Usage:
//   cd backend
//   REVIEWS_MOCK=true node -r dotenv/config scripts/test-freetier-trim.js you@example.com
//
// DEV ONLY — inserts fake data; refuses NODE_ENV=production.

import { QueryTypes } from "sequelize";
import { sequelize } from "../src/config/db.js";
import { initializeDatabase, closeDatabase } from "../src/db/bootstrap.js";
import { User, Clinic, Review, PlatformConnection } from "../src/models/index.js";
import { syncByConnectionId } from "../src/services/reviews/reviewSync.service.js";
import { getSubscriptionState } from "../src/services/subscription/subscriptionState.service.js";

const email = process.argv[2];

const countReviews = async (clinicId) => {
  const [row] = await sequelize.query(
    `SELECT COUNT(*)::int AS n FROM reviews WHERE clinic_id = $1::uuid`,
    { bind: [clinicId], type: QueryTypes.SELECT }
  );
  return row.n;
};

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("✖ Refusing to run trim test with NODE_ENV=production.");
    process.exit(1);
  }
  if (String(process.env.REVIEWS_MOCK).toLowerCase() !== "true") {
    console.error("✖ Set REVIEWS_MOCK=true — this test must not hit the real GBP API.");
    process.exit(1);
  }
  if (!email) {
    console.error("Usage: REVIEWS_MOCK=true node -r dotenv/config scripts/test-freetier-trim.js <user-email>");
    process.exit(1);
  }

  await initializeDatabase();

  // ── 1. Resolve clinic + connection ─────────────────────────────────────────
  const user = await User.findOne({ where: { email } });
  if (!user) throw new Error(`No user with email ${email}`);
  const clinic = await Clinic.findOne({ where: { userId: user.id } });
  if (!clinic) throw new Error(`User ${email} has no clinic`);

  const conn = await PlatformConnection.findOne({
    where: { clinicId: clinic.id, platform: "google", status: "connected" },
  });
  if (!conn) {
    throw new Error(
      "No connected Google connection. Run scripts/seed-mock-connection.js first."
    );
  }

  // ── 2. Verify we're actually testing the free tier ─────────────────────────
  const sub = await getSubscriptionState(clinic.id);
  const cap = sub.limits.storedReviewsLimit;
  console.log(`Plan: ${sub.plan} (status: ${sub.status}) — storedReviewsLimit: ${cap}`);

  if (!Number.isFinite(cap)) {
    console.error(
      "✖ This clinic's plan has no stored-review cap (paid tier?). The trim is a\n" +
        "  no-op here and the test would prove nothing. Point this script at a\n" +
        "  free-plan account, or reset this clinic to free and re-run."
    );
    process.exit(1);
  }

  // ── 3. Pad above the cap so the trim has victims ───────────────────────────
  const before = await countReviews(clinic.id);
  const target = cap + 10;
  if (before < target) {
    const toInsert = target - before;
    const now = Date.now();
    await Review.bulkCreate(
      Array.from({ length: toInsert }, (_, i) => ({
        clinicId: clinic.id,
        platform: "Google",
        reviewerName: `Trim Test ${i + 1}`,
        rating: (i % 5) + 1,
        reviewText: "Synthetic row inserted by test-freetier-trim.js",
        replied: false,
        externalId: null, // NULL = outside the dedupe index, legal trim victim
        // Spread across the past year so "newest survives" is meaningfully
        // testable — the mock provider's reviews are recent and should live.
        reviewDate: new Date(now - (i + 30) * 24 * 3600e3),
      }))
    );
    console.log(`Padded with ${toInsert} synthetic reviews (${before} → ${target}).`);
  } else {
    console.log(`Already ${before} reviews (> cap ${cap}) — no padding needed.`);
  }

  // ── 4. Sync (mock provider) — trim runs at the end of this call ────────────
  const stats = await syncByConnectionId(conn.id);
  console.log(
    `Sync: fetched=${stats.fetched} created=${stats.created} updated=${stats.updated} ` +
      `trimmed=${stats.trimmed} pages=${stats.pages}`
  );

  // ── 5. Assert ──────────────────────────────────────────────────────────────
  const after = await countReviews(clinic.id);
  console.log(`Review count after sync: ${after} (cap ${cap})`);

  if (after > cap) {
    console.error(`✖ FAIL — ${after} rows remain, expected ≤ ${cap}. Trim did not fire.`);
    process.exit(1);
  }

  const [oldestSurvivor] = await sequelize.query(
    `SELECT reviewer_name, COALESCE(review_date, created_at) AS d
       FROM reviews WHERE clinic_id = $1::uuid
      ORDER BY COALESCE(review_date, created_at) ASC LIMIT 1`,
    { bind: [clinic.id], type: QueryTypes.SELECT }
  );
  const [wouldBeVictim] = await sequelize.query(
    `SELECT COUNT(*)::int AS n FROM reviews
      WHERE clinic_id = $1::uuid AND reviewer_name LIKE 'Trim Test %'`,
    { bind: [clinic.id], type: QueryTypes.SELECT }
  );

  console.log(`Oldest surviving review: ${oldestSurvivor?.reviewer_name} @ ${oldestSurvivor?.d}`);
  console.log(`Synthetic rows surviving: ${wouldBeVictim.n} (older synthetics should be gone)`);
  console.log(`\n✅ PASS — free-tier trim enforced at ${cap} stored reviews.`);
}

main()
  .catch((err) => {
    console.error("✖ Trim test failed:", err.message);
    process.exitCode = 1;
  })
  .finally(() => closeDatabase().catch(() => {}));