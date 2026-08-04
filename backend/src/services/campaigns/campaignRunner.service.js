// backend/src/services/campaigns/campaignRunner.service.js
//
// The send loop. A setInterval tick that is MULTI-INSTANCE SAFE without Redis
// or any queue infrastructure, because every mutating step is an atomic
// Postgres statement where concurrent workers get disjoint work:
//
//   promotion   UPDATE ... WHERE status='scheduled'          → exactly one wins
//   claiming    FOR UPDATE SKIP LOCKED batch                 → disjoint rows
//   completion  UPDATE ... WHERE status='running' AND
//               NOT EXISTS (pending|processing)              → exactly one wins
//
// All three properties were race-tested against live Postgres 16 before this
// file was written (two overlapping workers: 8+8 claims, 0 overlap; double
// promotion: 1 winner). This is the .agents/skills lock-skip-locked pattern.
//
// PER-RECIPIENT FLOW (inside a claimed batch):
//   opt-out re-check → reserveCredits → stamp send_started_at → sendMessage
//                                     → mark sent
//                                     ↘ provider fail → refundCredits, mark failed
//
// RETRY BOUND: the claim increments campaign_recipients.attempts and skips
// rows at MAX_ATTEMPTS; failExhausted() then marks those terminal. Without it
// a recipient the workers keep abandoning before the send stamp cycles through
// the recovery sweep forever and pins the campaign at 'running'.
//
// DELIVERY SEMANTICS: AT-MOST-ONCE. The send_started_at stamp is written
// before the provider call so crash recovery can tell "never sent" from
// "outcome unknown". Unknown outcomes are failed, never retried — see
// requeueStuck below for why that is the correct trade for paid SMS.
//   reserve fails with QUOTA_EXCEEDED → campaign PAUSES (resumable after
//   upgrade/renewal) and the recipient row returns to pending — running dry
//   mid-campaign must never mark people "failed" who were simply unlucky
//   enough to be recipient #51 on a 50-credit plan.
//
// THROTTLE: throttle_per_minute × (tick/60s) recipients claimed per campaign
// per tick. Default 10/min ≈ 3 per 15s tick. Provider rate limits (Twilio ~1
// msg/s/number) sit far above this.

import { QueryTypes } from "sequelize";
import { sequelize } from "../../config/db.js";
import { sendMessage } from "../sms/index.js";
import { reserveCredits, refundCredits } from "../credits/credits.service.js";
import { optedOutSet } from "./campaign.service.js";

const TICK_MS = 15_000;
const STUCK_MINUTES = 10;

// How many times a single recipient may be CLAIMED before the runner gives up
// on it. See failExhausted() for why an unbounded retry is a real failure mode
// and not a theoretical one. Five claims at a 10-minute recovery interval is
// roughly 40 minutes of trying before a row is declared undeliverable.
const MAX_ATTEMPTS = 5;

let timer = null;
let ticking = false; // re-entrancy guard within one process

// ── Message rendering ────────────────────────────────────────────────────────
// {{name}} {{clinic}} {{link}} substitution + mandatory STOP notice for SMS.
// The notice is appended server-side, not trusted to the template: TCPA (US)
// and TRAI (India) both require an opt-out mechanism in marketing SMS, and
// "the user forgot to include it" cannot be a compliance failure mode.
export function renderMessage({ template, name, clinicName, reviewLink, channel }) {
  let body = String(template)
    .replaceAll("{{name}}", name || "there")
    .replaceAll("{{clinic}}", clinicName || "our clinic")
    .replaceAll("{{link}}", reviewLink || "");

  if (channel === "SMS" && !/\bSTOP\b/i.test(body)) {
    body += "\nReply STOP to opt out.";
  }
  return body;
}

// ── The tick ─────────────────────────────────────────────────────────────────
export async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    await requeueStuck();
    await failExhausted();
    await promoteScheduled();
    const campaigns = await runningCampaigns();
    for (const c of campaigns) {
      await processCampaignBatch(c);
    }
  } catch (err) {
    console.error("[campaigns] tick error:", err.message);
  } finally {
    ticking = false;
  }
}

// ── Crash recovery: AT-MOST-ONCE, not at-least-once ─────────────────────────
// A stuck 'processing' row is one whose worker died mid-batch. Whether it is
// safe to retry depends entirely on whether the provider call had already been
// made, which is exactly what send_started_at (migration 0011) records.
//
// The previous single statement returned EVERY stuck row to 'pending'. For a
// row that had already handed a message to Twilio, that re-reserved a credit
// and sent the patient a SECOND text. The header used to claim the
// idempotencyKey passed to sendMessage was a "provider-level double-send
// guard" — Twilio's Messages API has no such parameter and both providers
// destructure only { to, body }, so nothing downstream deduplicated anything.
//
// SMS is not idempotent and costs real money, so the tie-breaker is: a review
// request that never arrives is recoverable, a duplicate text plus a duplicate
// charge is not. Unknown outcomes therefore fail closed.
async function requeueStuck() {
  // (a) Provider was never called → genuinely safe to retry.
  await sequelize.query(
    `UPDATE campaign_recipients
        SET status = 'pending', claimed_at = NULL
      WHERE status = 'processing'
        AND send_started_at IS NULL
        AND claimed_at < NOW() - INTERVAL '${STUCK_MINUTES} minutes'`,
    { type: QueryTypes.UPDATE }
  );

  // (b) Provider WAS called and we never saw the outcome → do not re-send.
  // The credit is deliberately NOT refunded: the most likely history is that
  // the message was delivered and the worker died before recording it, and
  // refunding would hand back a credit for a message the clinic was billed for
  // by the carrier. The error text is written for the human who will read it
  // in the campaign detail view.
  await sequelize.query(
    `UPDATE campaign_recipients
        SET status = 'failed',
            error  = 'Delivery outcome unknown — the worker stopped after the message was handed to the provider. Not retried automatically to avoid sending this recipient a duplicate.'
      WHERE status = 'processing'
        AND send_started_at IS NOT NULL
        AND claimed_at < NOW() - INTERVAL '${STUCK_MINUTES} minutes'`,
    { type: QueryTypes.UPDATE }
  );
}

// ── The retry bound ─────────────────────────────────────────────────────────
// requeueStuck's branch (a) is correct but was unbounded. A recipient that is
// claimed and then abandoned BEFORE the send_started_at stamp goes back to
// 'pending' — and if whatever killed the worker is deterministic (an OOM on a
// large batch, a deploy SIGKILL landing in the same window every rollout, a
// reserveCredits throw on a malformed row) it will be claimed and abandoned
// again, every STUCK_MINUTES, forever.
//
// The loop is completely silent: nothing logs, and maybeComplete() requires
// zero pending|processing rows, so the campaign never reaches 'completed'
// either. It just sits at 'running' with a counter that never moves — which
// looks identical to a large campaign still working through its queue.
//
// The claim increments attempts and refuses rows at the cap, so this statement
// is what converts "permanently unclaimable" into a terminal state. Without it
// those rows would pin the campaign at 'running' just as effectively.
async function failExhausted() {
  await sequelize.query(
    `UPDATE campaign_recipients
        SET status = 'failed',
            error  = 'Could not be processed after ' || attempts || ' attempts. The worker stopped before this message was handed to the provider each time; no message was sent and no credit was charged.'
      WHERE status = 'pending'
        AND attempts >= $1::int`,
    { bind: [MAX_ATTEMPTS], type: QueryTypes.UPDATE }
  );
}

async function promoteScheduled() {
  await sequelize.query(
    `UPDATE campaigns
        SET status = 'running', started_at = NOW()
      WHERE status = 'scheduled' AND scheduled_at <= NOW()`,
    { type: QueryTypes.UPDATE }
  );
}

async function runningCampaigns() {
  return sequelize.query(
    `SELECT c.id, c.clinic_id, c.channel, c.message_template, c.throttle_per_minute,
            cl.clinic_name, cl.google_review_link, cl.country_code
       FROM campaigns c
       JOIN clinics cl ON cl.id = c.clinic_id
      WHERE c.status = 'running'`,
    { type: QueryTypes.SELECT }
  );
}

async function processCampaignBatch(c) {
  const batchSize = Math.max(1, Math.ceil((c.throttle_per_minute * TICK_MS) / 60_000));

  // THE CLAIM — race-tested SKIP LOCKED batch. Rows leave 'pending'
  // atomically; a second worker's identical query sees none of them.
  //
  // attempts is incremented HERE rather than in the recovery sweep so it
  // counts total work done on a recipient no matter which path returned it to
  // the queue. Rows at the cap are excluded, which is what makes them visible
  // to failExhausted() instead of being retried forever.
  const claimed = await sequelize.query(
    `UPDATE campaign_recipients
        SET status = 'processing', claimed_at = NOW(), attempts = attempts + 1
      WHERE id IN (
        SELECT id FROM campaign_recipients
         WHERE campaign_id = $1::uuid AND status = 'pending'
           AND attempts < $3::int
         ORDER BY created_at
         LIMIT $2::int
         FOR UPDATE SKIP LOCKED)
      RETURNING id, name, phone`,
    { bind: [c.id, batchSize, MAX_ATTEMPTS], type: QueryTypes.SELECT }
  );

  if (claimed.length === 0) {
    await maybeComplete(c.id);
    return;
  }

  // Send-time opt-out re-check (STOP may have arrived since import).
  const suppressed = await optedOutSet(c.clinic_id, claimed.map((r) => r.phone));

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let pausedForCredits = false;

  for (const r of claimed) {
    if (pausedForCredits) {
      await markRecipient(r.id, "pending", { unclaim: true }); // back on the queue
      continue;
    }

    if (suppressed.has(r.phone)) {
      await markRecipient(r.id, "skipped_opt_out");
      skipped++;
      continue;
    }

    const channelKey = c.channel === "WhatsApp" ? "whatsapp" : "sms";
    const reservation = await reserveCredits({ clinicId: c.clinic_id, channel: channelKey });

    if (!reservation.reserved) {
      // Out of credits (or plan/status changed mid-flight): pause the whole
      // campaign, put this recipient back. Resumable.
      pausedForCredits = true;
      await markRecipient(r.id, "pending", { unclaim: true });
      await pauseForCredits(c.id, reservation);
      continue;
    }

    try {
      const body = renderMessage({
        template: c.message_template,
        name: r.name,
        clinicName: c.clinic_name,
        reviewLink: c.google_review_link,
        channel: c.channel,
      });

      // Stamp BEFORE the provider call. This write is the crash-recovery
      // record: if the process dies anywhere after it, requeueStuck sees a
      // started-but-unfinished send and fails it closed instead of texting
      // this recipient twice. It must not be batched or deferred — the whole
      // guarantee is that it lands before the message can possibly go out.
      await sequelize.query(
        `UPDATE campaign_recipients SET send_started_at = NOW() WHERE id = $1::uuid`,
        { bind: [r.id], type: QueryTypes.UPDATE }
      );

      const result = await sendMessage({
        channel: c.channel,
        to: r.phone,
        body,
        countryCode: c.country_code,
        // Carried for provider-side logging and future providers that support
        // it. NOT a delivery guard: Twilio's Messages API accepts no
        // idempotency parameter, and neither provider reads this today. The
        // real double-send protection is send_started_at above.
        idempotencyKey: `campaign:${r.id}`,
      });

      await markRecipient(r.id, "sent", { providerId: result?.id || null });
      sent++;
    } catch (err) {
      await refundCredits({ clinicId: c.clinic_id, channel: channelKey });
      await markRecipient(r.id, "failed", { error: err.message?.slice(0, 500) });
      failed++;
    }
  }

  if (sent || failed || skipped) {
    await sequelize.query(
      `UPDATE campaigns
          SET sent_count = sent_count + $2::int,
              failed_count = failed_count + $3::int,
              skipped_count = skipped_count + $4::int
        WHERE id = $1::uuid`,
      { bind: [c.id, sent, failed, skipped], type: QueryTypes.UPDATE }
    );
  }

  await maybeComplete(c.id);
}

async function markRecipient(id, status, { error = null, providerId = null, unclaim = false } = {}) {
  await sequelize.query(
    `UPDATE campaign_recipients
        SET status = $2::text,
            error = $3::text,
            provider_id = COALESCE($4::text, provider_id),
            sent_at = CASE WHEN $2::text = 'sent' THEN NOW() ELSE sent_at END,
            claimed_at = CASE WHEN $5::bool THEN NULL ELSE claimed_at END,
            -- Unclaiming returns a row to the queue as if it had never been
            -- touched, so the pre-send stamp has to come off with the claim.
            -- Leaving it set would make requeueStuck later mistake a recipient
            -- that was never sent to for one whose outcome is unknown, and
            -- fail it closed forever.
            send_started_at = CASE WHEN $5::bool THEN NULL ELSE send_started_at END,
            -- Same reasoning for the attempt counter: an unclaim is a
            -- deliberate "we chose not to work this row yet" (out of credits,
            -- campaign paused), not a failed attempt. Charging it an attempt
            -- would let a campaign that is paused and resumed MAX_ATTEMPTS
            -- times fail recipients who were never actually tried. GREATEST
            -- floors it so the counter can never go negative.
            attempts = CASE WHEN $5::bool THEN GREATEST(attempts - 1, 0) ELSE attempts END
      WHERE id = $1::uuid`,
    { bind: [id, status, error, providerId, unclaim], type: QueryTypes.UPDATE }
  );
}

async function pauseForCredits(campaignId, reservation) {
  const reasonMap = {
    QUOTA_EXCEEDED: "Paused: out of credits for this billing period. Resume after upgrading or when credits reset.",
    SUBSCRIPTION_INACTIVE: "Paused: subscription is inactive. Update your payment method, then resume.",
    PLAN_DOES_NOT_INCLUDE_CHANNEL: "Paused: your current plan no longer includes this channel.",
    NO_SUBSCRIPTION: "Paused: billing record missing. Contact support.",
  };
  await sequelize.query(
    `UPDATE campaigns SET status = 'paused', last_error = $2::text
      WHERE id = $1::uuid AND status = 'running'`,
    {
      bind: [campaignId, reasonMap[reservation.reason] || "Paused: could not reserve credits."],
      type: QueryTypes.UPDATE,
    }
  );
}

async function maybeComplete(campaignId) {
  // Exactly-one-winner completion: only flips when NOTHING is pending or
  // in flight (including rows claimed by OTHER workers right now).
  await sequelize.query(
    `UPDATE campaigns
        SET status = 'completed', completed_at = NOW()
      WHERE id = $1::uuid AND status = 'running'
        AND NOT EXISTS (
          SELECT 1 FROM campaign_recipients
           WHERE campaign_id = $1::uuid AND status IN ('pending','processing'))`,
    { bind: [campaignId], type: QueryTypes.UPDATE }
  );
}

// ── Lifecycle (wired in server.js) ───────────────────────────────────────────
export function startCampaignRunner() {
  if (timer) return;
  timer = setInterval(tick, TICK_MS);
  timer.unref?.(); // never keep the process alive on its own
  console.log(`📤 Campaign runner started (tick ${TICK_MS / 1000}s)`);
}

export async function stopCampaignRunner() {
  if (timer) clearInterval(timer);
  timer = null;
  // Let an in-flight tick finish so no send is abandoned mid-provider-call.
  while (ticking) await new Promise((r) => setTimeout(r, 100));
  console.log("📪 Campaign runner stopped");
}