// backend/tests/webhookIdempotency.test.js
//
// Paddle retries a webhook until it gets a 2xx and can redeliver besides, so
// the same event_id arrives more than once as a matter of course. The claim
// below is what stops a redelivery from re-running processEvent — which, for
// transaction.completed, re-zeroes the clinic's credit counters and hands back
// sends they already paid for.
//
// The previous guard tested `record.id === null` on a Sequelize bulkCreate
// result. That can never be true, because the model mints a client-side UUID
// before the INSERT — so the guard never fired even once.

import test from "node:test";
import assert from "node:assert/strict";
import { QueryTypes } from "sequelize";
import { setupDatabase, teardownDatabase, resetData, sequelize } from "./helpers/db.js";

test.before(setupDatabase);
test.after(teardownDatabase);
test.beforeEach(resetData);

const STALE_MINUTES = 5;

// The statement from claimWebhookEvent().
const claim = async (eventId, eventType = "transaction.completed") => {
  const rows = await sequelize.query(
    `INSERT INTO webhook_events (id, provider, event_id, event_type, payload, received_at)
     VALUES (gen_random_uuid(), 'paddle', $1::text, $2::text, $3::jsonb, NOW())
     ON CONFLICT (event_id) DO UPDATE
        SET received_at = NOW()
      WHERE webhook_events.processed_at IS NULL
        AND webhook_events.received_at < NOW() - ($4 || ' minutes')::interval
     RETURNING id`,
    {
      bind: [eventId, eventType, JSON.stringify({ event_id: eventId }), String(STALE_MINUTES)],
      type: QueryTypes.SELECT,
    }
  );
  return rows.length > 0;
};

const markProcessed = (eventId) =>
  sequelize.query(
    `UPDATE webhook_events SET processed_at = NOW() WHERE event_id = $1::text`,
    { bind: [eventId], type: QueryTypes.UPDATE }
  );

const ageClaim = (eventId, minutes) =>
  sequelize.query(
    `UPDATE webhook_events SET received_at = NOW() - ($2 || ' minutes')::interval
      WHERE event_id = $1::text`,
    { bind: [eventId, String(minutes)], type: QueryTypes.UPDATE }
  );

const rowCount = async (eventId) => {
  const [{ n }] = await sequelize.query(
    `SELECT COUNT(*)::int AS n FROM webhook_events WHERE event_id = $1::text`,
    { bind: [eventId], type: QueryTypes.SELECT }
  );
  return n;
};

test("a first delivery is claimed", async () => {
  assert.equal(await claim("evt_1"), true);
  assert.equal(await rowCount("evt_1"), 1);
});

test("an immediate redelivery is refused while the first is in flight", async () => {
  await claim("evt_2");
  assert.equal(await claim("evt_2"), false, "concurrent duplicate must not be processed");
  assert.equal(await rowCount("evt_2"), 1, "and must not insert a second row");
});

test("a redelivery after successful processing is refused forever", async () => {
  await claim("evt_3");
  await markProcessed("evt_3");

  assert.equal(await claim("evt_3"), false);
  await ageClaim("evt_3", 60); // even long afterwards
  assert.equal(await claim("evt_3"), false, "processed events are permanently done");
});

test("a retry after a FAILED handler is allowed once the claim goes stale", async () => {
  // The row is committed before processEvent runs, so a plain
  // ON CONFLICT DO NOTHING guard would make any handler failure permanent:
  // Paddle's 500-triggered retry would be rejected as a duplicate and the
  // event would never be processed at all.
  await claim("evt_4");            // claimed; handler then threw
  await ageClaim("evt_4", 10);     // Paddle backs off and retries

  assert.equal(await claim("evt_4"), true, "a failed event must remain retryable");
  assert.equal(await rowCount("evt_4"), 1);
});

test("CONCURRENCY: ten simultaneous deliveries elect exactly one processor", async () => {
  const results = await Promise.all(Array.from({ length: 10 }, () => claim("evt_5")));

  assert.equal(
    results.filter(Boolean).length,
    1,
    "exactly one delivery may process the event"
  );
  assert.equal(await rowCount("evt_5"), 1);
});

test("distinct events are independent", async () => {
  assert.equal(await claim("evt_a"), true);
  assert.equal(await claim("evt_b"), true);
  assert.equal(await rowCount("evt_a"), 1);
  assert.equal(await rowCount("evt_b"), 1);
});
