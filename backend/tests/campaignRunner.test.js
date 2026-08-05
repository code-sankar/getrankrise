// backend/tests/campaignRunner.test.js
//
// The campaign send loop is multi-instance safe only if its work-claiming
// statement really does hand disjoint rows to concurrent workers. That is a
// property of FOR UPDATE SKIP LOCKED under real concurrency, so it is tested
// against a real server with genuinely parallel claims.
//
// A failure here means two workers send the same patient the same message and
// the clinic is billed twice.

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
import { renderMessage } from "../src/services/campaigns/campaignRunner.service.js";

test.before(setupDatabase);
test.after(teardownDatabase);
test.beforeEach(resetData);

async function createCampaignWithRecipients(clinicId, count, { status = "running" } = {}) {
  const [campaign] = await sequelize.query(
    `INSERT INTO campaigns (id, clinic_id, name, channel, message_template, status,
                            throttle_per_minute, total_recipients, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, 'T', 'SMS', 'Hi {{name}}', $2::text, 60, $3::int, NOW(), NOW())
     RETURNING id`,
    { bind: [clinicId, status, count], type: QueryTypes.SELECT }
  );

  // campaign_recipients has created_at but no updated_at — the table is
  // append-then-transition, not an ORM-managed model.
  for (let i = 0; i < count; i++) {
    await sequelize.query(
      `INSERT INTO campaign_recipients (id, campaign_id, clinic_id, name, phone, status, created_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::text, $4::text, 'pending', NOW())`,
      {
        bind: [campaign.id, clinicId, `P${i}`, `+9190000${String(i).padStart(5, "0")}`],
        type: QueryTypes.INSERT,
      }
    );
  }
  return campaign.id;
}

// The exact claim statement from processCampaignBatch. Duplicated here on
// purpose: this test is asserting that THIS SQL has the disjointness property,
// so it must be the statement under test rather than a call that happens to
// wrap it in provider I/O.
const CLAIM_SQL = `
  UPDATE campaign_recipients
     SET status = 'processing', claimed_at = NOW(), attempts = attempts + 1
   WHERE id IN (
     SELECT id FROM campaign_recipients
      WHERE campaign_id = $1::uuid AND status = 'pending'
        AND attempts < $3::int
      ORDER BY created_at
      LIMIT $2::int
      FOR UPDATE SKIP LOCKED)
   RETURNING id`;

test("SKIP LOCKED: concurrent workers claim disjoint recipients", async () => {
  const { clinicId } = await createClinic();
  const campaignId = await createCampaignWithRecipients(clinicId, 40);

  // Eight workers, ten rows each — deliberately over-subscribed so they
  // genuinely contend for the same head of the queue.
  const claims = await Promise.all(
    Array.from({ length: 8 }, () =>
      sequelize.query(CLAIM_SQL, {
        bind: [campaignId, 10, 5],
        type: QueryTypes.SELECT,
      })
    )
  );

  const ids = claims.flat().map((r) => r.id);
  const unique = new Set(ids);

  assert.equal(ids.length, unique.size, "no recipient may be claimed by two workers");
  assert.equal(ids.length, 40, "all 40 rows should be claimed across the workers");

  const [{ n }] = await sequelize.query(
    `SELECT COUNT(*)::int AS n FROM campaign_recipients
      WHERE campaign_id = $1::uuid AND status = 'pending'`,
    { bind: [campaignId], type: QueryTypes.SELECT }
  );
  assert.equal(n, 0, "nothing should be left pending");
});

test("the claim refuses rows that have hit the attempt cap", async () => {
  // failExhausted() can only mark rows terminal if the claim stops returning
  // them. Without this the recovery sweep re-claims forever and the campaign
  // sits at 'running' with a counter that never moves.
  const { clinicId } = await createClinic();
  const campaignId = await createCampaignWithRecipients(clinicId, 3);

  await sequelize.query(
    `UPDATE campaign_recipients SET attempts = 5 WHERE campaign_id = $1::uuid`,
    { bind: [campaignId], type: QueryTypes.UPDATE }
  );

  const claimed = await sequelize.query(CLAIM_SQL, {
    bind: [campaignId, 10, 5],
    type: QueryTypes.SELECT,
  });

  assert.equal(claimed.length, 0, "rows at MAX_ATTEMPTS must not be claimable");
});

test("completion flips only when nothing is pending or in flight", async () => {
  const { clinicId } = await createClinic();
  const campaignId = await createCampaignWithRecipients(clinicId, 2);

  const complete = () =>
    sequelize.query(
      `UPDATE campaigns
          SET status = 'completed', completed_at = NOW()
        WHERE id = $1::uuid AND status = 'running'
          AND NOT EXISTS (
            SELECT 1 FROM campaign_recipients
             WHERE campaign_id = $1::uuid AND status IN ('pending','processing'))
        RETURNING id`,
      { bind: [campaignId], type: QueryTypes.SELECT }
    );

  assert.equal((await complete()).length, 0, "must not complete while work remains");

  await sequelize.query(
    `UPDATE campaign_recipients SET status = 'sent' WHERE campaign_id = $1::uuid`,
    { bind: [campaignId], type: QueryTypes.UPDATE }
  );

  assert.equal((await complete()).length, 1, "completes once the queue drains");
  assert.equal((await complete()).length, 0, "and exactly one worker wins the flip");
});

test("renderMessage substitutes tokens and appends the STOP notice for SMS", () => {
  // TCPA (US) and TRAI (India) both require an opt-out in marketing SMS, and
  // the notice is appended server-side precisely so a user-authored template
  // cannot omit it.
  const body = renderMessage({
    template: "Hi {{name}}, rate {{clinic}}: {{link}}",
    name: "Dana",
    clinicName: "Bright Smile",
    reviewLink: "https://example.com/r",
    channel: "SMS",
  });

  assert.match(body, /Hi Dana, rate Bright Smile: https:\/\/example\.com\/r/);
  assert.match(body, /Reply STOP to opt out\./);
});

test("renderMessage does not double up a STOP notice the template already has", () => {
  const body = renderMessage({
    template: "Hi {{name}} — reply STOP to opt out.",
    name: "Dana",
    channel: "SMS",
  });
  assert.equal(body.match(/STOP/gi).length, 1);
});

test("renderMessage tolerates missing values rather than printing undefined", () => {
  const body = renderMessage({
    template: "Hi {{name}}, visit {{clinic}} {{link}}",
    channel: "WhatsApp",
  });
  assert.match(body, /Hi there, visit our clinic/);
  assert.doesNotMatch(body, /undefined/);
  assert.doesNotMatch(body, /STOP/i, "the STOP notice is SMS-only");
});
