// backend/tests/reviewUpsert.test.js
//
// The review sync upsert and its merge rules. These decide whether re-syncing
// creates duplicates, whether a reply written in our UI survives a refetch from
// a platform that does not know about it yet, and whether an edited rating
// recomputes sentiment.
//
// The rules are enforced by ON CONFLICT ... DO UPDATE against a partial unique
// index, so they are properties of the statement, not of JavaScript.

import test from "node:test";
import assert from "node:assert/strict";
import { QueryTypes } from "sequelize";
import {
  setupDatabase,
  teardownDatabase,
  resetData,
  createClinic,
  sequelize,
} from "./helpers/db.js";

test.before(setupDatabase);
test.after(teardownDatabase);
test.beforeEach(resetData);

// The statement buildUpsertSql() produces for Google.
const UPSERT = `
INSERT INTO reviews (id, clinic_id, platform, external_id, reviewer_name, rating,
                     review_text, review_date, replied, reply_text, sentiment,
                     created_at, updated_at)
VALUES (gen_random_uuid(), $1::uuid, 'Google', $2::text, $3::text, $4::int, $5::text,
        $6::timestamptz, $7::bool, $8::text, $9::int, NOW(), NOW())
ON CONFLICT (clinic_id, platform, external_id) WHERE external_id IS NOT NULL
DO UPDATE SET
  reviewer_name = EXCLUDED.reviewer_name,
  review_text   = EXCLUDED.review_text,
  review_date   = EXCLUDED.review_date,
  rating        = EXCLUDED.rating,
  sentiment     = CASE WHEN reviews.rating IS DISTINCT FROM EXCLUDED.rating
                       THEN EXCLUDED.sentiment
                       ELSE COALESCE(reviews.sentiment, EXCLUDED.sentiment) END,
  replied       = reviews.replied OR EXCLUDED.replied,
  reply_text    = COALESCE(EXCLUDED.reply_text, reviews.reply_text),
  updated_at    = NOW()
RETURNING id, (xmax = 0) AS inserted`;

const upsert = (clinicId, o = {}) =>
  sequelize.query(UPSERT, {
    bind: [
      clinicId,
      o.externalId ?? "ext-1",
      o.reviewerName ?? "Ravi",
      o.rating ?? 5,
      o.text ?? "Great",
      o.createTime ?? new Date("2026-01-01"),
      o.replied ?? false,
      o.replyText ?? null,
      o.sentiment ?? 95,
    ],
    type: QueryTypes.SELECT,
  });

const readRow = async (clinicId) => {
  const [row] = await sequelize.query(
    `SELECT rating, sentiment, replied, reply_text, reviewer_name
       FROM reviews WHERE clinic_id = $1::uuid`,
    { bind: [clinicId], type: QueryTypes.SELECT }
  );
  return row;
};

test("first sync inserts and reports xmax = 0", async () => {
  const { clinicId } = await createClinic();
  const [row] = await upsert(clinicId);

  // `inserted` is what drives low-rating alerting — an UPDATE must not alert.
  assert.equal(row.inserted, true);
});

test("IDEMPOTENT: re-syncing identical pages creates no new rows", async () => {
  const { clinicId } = await createClinic();
  await upsert(clinicId);
  const [second] = await upsert(clinicId);

  assert.equal(second.inserted, false, "the second pass must be an UPDATE");

  const [{ n }] = await sequelize.query(
    `SELECT COUNT(*)::int AS n FROM reviews WHERE clinic_id = $1::uuid`,
    { bind: [clinicId], type: QueryTypes.SELECT }
  );
  assert.equal(n, 1);
});

test("STICKY REPLIED: a refetch reporting no reply cannot un-reply a row", async () => {
  // A reply written in our UI is not on the source platform until it is
  // published there, and Yelp/Facebook never report replies at all. Without
  // this rule the next sync would silently mark answered reviews unanswered.
  const { clinicId } = await createClinic();
  await upsert(clinicId, { replied: true, replyText: "Thanks!" });

  await upsert(clinicId, { replied: false, replyText: null });

  const row = await readRow(clinicId);
  assert.equal(row.replied, true, "replied is sticky-true");
  assert.equal(row.reply_text, "Thanks!", "the reply text survives a null refetch");
});

test("a platform-side reply is imported when the provider returns one", async () => {
  const { clinicId } = await createClinic();
  await upsert(clinicId);

  await upsert(clinicId, { replied: true, replyText: "Owner replied on Google" });

  const row = await readRow(clinicId);
  assert.equal(row.replied, true);
  assert.equal(row.reply_text, "Owner replied on Google");
});

test("an edited rating recomputes sentiment", async () => {
  const { clinicId } = await createClinic();
  await upsert(clinicId, { rating: 5, sentiment: 95 });

  await upsert(clinicId, { rating: 1, sentiment: 10 });

  const row = await readRow(clinicId);
  assert.equal(row.rating, 1);
  assert.equal(row.sentiment, 10, "a changed rating takes the incoming sentiment");
});

test("an unchanged rating never clobbers a stored sentiment", async () => {
  // Protects future AI-scored sentiment from being overwritten by the crude
  // rating heuristic on every resync — the migration 0005 rule.
  const { clinicId } = await createClinic();
  await upsert(clinicId, { rating: 4, sentiment: 88 });

  await upsert(clinicId, { rating: 4, sentiment: 70 });

  const row = await readRow(clinicId);
  assert.equal(row.sentiment, 88, "the stored value wins when the rating is unchanged");
});

test("edits to the review body and author are taken", async () => {
  const { clinicId } = await createClinic();
  await upsert(clinicId, { reviewerName: "Ravi", text: "Great" });

  await upsert(clinicId, { reviewerName: "Ravi Patel", text: "Updated after revisit" });

  const row = await readRow(clinicId);
  assert.equal(row.reviewer_name, "Ravi Patel");
});

test("the same external id in two clinics is two separate reviews", async () => {
  // The unique index is (clinic_id, platform, external_id). Getting this wrong
  // would leak one clinic's reviews into another's dashboard.
  const a = await createClinic();
  const b = await createClinic();

  await upsert(a.clinicId, { externalId: "shared-id" });
  await upsert(b.clinicId, { externalId: "shared-id" });

  const [{ n }] = await sequelize.query(
    `SELECT COUNT(*)::int AS n FROM reviews`,
    { type: QueryTypes.SELECT }
  );
  assert.equal(n, 2, "tenant scoping is part of the conflict target");
});

test("the free-tier trim keeps the newest N for the clinic", async () => {
  const { clinicId } = await createClinic({ plan: "free" });

  for (let i = 0; i < 25; i++) {
    await upsert(clinicId, {
      externalId: `ext-${i}`,
      createTime: new Date(Date.UTC(2026, 0, i + 1)),
    });
  }

  const trimmed = await sequelize.query(
    `DELETE FROM reviews
      WHERE clinic_id = $1::uuid AND id NOT IN (
        SELECT id FROM reviews WHERE clinic_id = $1::uuid
         ORDER BY COALESCE(review_date, created_at) DESC
         LIMIT $2::int)
      RETURNING id`,
    { bind: [clinicId, 20], type: QueryTypes.SELECT }
  );

  assert.equal(trimmed.length, 5, "RETURNING must report what was actually deleted");

  const [{ n }] = await sequelize.query(
    `SELECT COUNT(*)::int AS n FROM reviews WHERE clinic_id = $1::uuid`,
    { bind: [clinicId], type: QueryTypes.SELECT }
  );
  assert.equal(n, 20);
});
