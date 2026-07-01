// backend/src/controllers/billing.controller.js
import { pool } from "../db/pool.js";
import {
  createTransaction,
  verifyWebhookSignature,
  priceIdToPlan,
} from "../services/billing/paddle.client.js";
import {
  successResponse,
  badRequestResponse,
  serverErrorResponse,
} from "../utils/apiResponse.js";

const PRICE_MAP = () => ({
  starter: process.env.PADDLE_PRICE_ID_STARTER,
  premium: process.env.PADDLE_PRICE_ID_PREMIUM,
});

// ── POST /api/v1/billing/create-checkout ──────────────────────────────────
export const createCheckout = async (req, res) => {
  try {
    const { plan } = req.body;                  // 'starter' | 'premium'
    const priceId  = PRICE_MAP()[plan];
    if (!priceId) return badRequestResponse(res, "Invalid plan");

    const clinicId = req.clinic.id;
    const userId   = req.user.id;

    // Reuse existing Paddle customer if we already have one
    const { rows } = await pool.query(
      "SELECT gateway_customer_id FROM subscriptions WHERE clinic_id = $1",
      [clinicId]
    );
    const customerId = rows[0]?.gateway_customer_id || null;

    const { transactionId, checkoutUrl } = await createTransaction({
      priceId,
      customerId,
      customerEmail: customerId ? null : req.user.email,
      clinicId,
      userId,
    });

    return successResponse(res, {
      message: "Checkout created",
      data:    { transactionId, checkoutUrl, plan },
    });
  } catch (err) {
    console.error("createCheckout error:", err);
    return serverErrorResponse(res, "Could not create checkout");
  }
};

// ── POST /api/v1/billing/webhook ──────────────────────────────────────────
// IMPORTANT: this route must receive the RAW body (Buffer), not parsed JSON,
// because the signature is computed over the exact bytes Paddle sent.
export const handleWebhook = async (req, res) => {
  const sigHeader = req.headers["paddle-signature"];
  const rawBody   = req.body instanceof Buffer
    ? req.body.toString("utf8")
    : typeof req.body === "string" ? req.body : "";

  if (!verifyWebhookSignature(rawBody, sigHeader, process.env.PADDLE_WEBHOOK_SECRET)) {
    console.warn("[paddle webhook] invalid signature");
    return res.status(401).send("Invalid signature");
  }

  let event;
  try { event = JSON.parse(rawBody); }
  catch { return res.status(400).send("Invalid JSON"); }

  // Idempotency guard — Paddle retries until 2xx, so the same event_id
  // can arrive multiple times. We record + reject duplicates.
  const eventId   = event.event_id;
  const eventType = event.event_type;
  if (!eventId || !eventType) return res.status(400).send("Malformed event");

  try {
    const ins = await pool.query(
      `INSERT INTO webhook_events (provider, event_id, event_type, payload)
       VALUES ('paddle', $1, $2, $3)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING id`,
      [eventId, eventType, event]
    );
    if (ins.rowCount === 0) {
      // Already processed — return 200 so Paddle stops retrying
      return res.status(200).send("Duplicate, ignored");
    }

    await processEvent(event);

    await pool.query(
      "UPDATE webhook_events SET processed_at = NOW() WHERE event_id = $1",
      [eventId]
    );
    return res.status(200).send("OK");
  } catch (err) {
    console.error("[paddle webhook] processing error:", err);
    // 5xx → Paddle will retry with exponential backoff
    return res.status(500).send("Processing failed");
  }
};

// ── Event dispatcher ──────────────────────────────────────────────────────
async function processEvent(event) {
  const { event_type, data } = event;

  switch (event_type) {
    case "subscription.created":
    case "subscription.activated":
    case "subscription.updated":
    case "subscription.resumed":
      return upsertSubscription(data);

    case "subscription.canceled":
      return markCanceled(data);

    case "subscription.past_due":
      return updateStatus(data, "past_due");

    case "subscription.paused":
      return updateStatus(data, "paused");

    case "transaction.completed":
      // Renewal payment succeeded → reset usage credits for new period
      return resetCreditsIfRenewal(data);

    case "transaction.payment_failed":
      // The subscription.past_due event handles status; here we could
      // dispatch an email. No-op for now.
      return;

    default:
      console.log(`[paddle webhook] unhandled event: ${event_type}`);
  }
}

// ── Subscription writers ──────────────────────────────────────────────────
async function upsertSubscription(sub) {
  const clinicId = sub.custom_data?.clinic_id;
  if (!clinicId) { console.error("[paddle] missing clinic_id in custom_data"); return; }

  const priceId    = sub.items?.[0]?.price?.id;
  const planType   = priceIdToPlan(priceId);
  if (!planType) { console.error(`[paddle] unknown price ID: ${priceId}`); return; }

  const periodStart = sub.current_billing_period?.starts_at || null;
  const periodEnd   = sub.current_billing_period?.ends_at   || null;
  const status      = sub.status;          // 'active' | 'trialing' | etc.

  await pool.query(
    `INSERT INTO subscriptions (
       clinic_id, plan_type, subscription_status,
       gateway_customer_id, gateway_subscription_id, gateway_price_id,
       current_period_start, current_period_end
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (clinic_id) DO UPDATE SET
       plan_type               = EXCLUDED.plan_type,
       subscription_status     = EXCLUDED.subscription_status,
       gateway_customer_id     = EXCLUDED.gateway_customer_id,
       gateway_subscription_id = EXCLUDED.gateway_subscription_id,
       gateway_price_id        = EXCLUDED.gateway_price_id,
       current_period_start    = EXCLUDED.current_period_start,
       current_period_end      = EXCLUDED.current_period_end,
       canceled_at             = NULL`,
    [clinicId, planType, status, sub.customer_id, sub.id, priceId, periodStart, periodEnd]
  );

  // Keep clinics.plan in sync for admin/analytics reads. Enforcement no longer
  // depends on this column, so a failure here must never fail the webhook.
  try {
    await pool.query(`UPDATE clinics SET plan = $2 WHERE id = $1`, [clinicId, planType]);
  } catch (e) {
    console.warn("[paddle] clinic.plan mirror failed:", e.message);
  }
}

async function markCanceled(sub) {
  // Paddle keeps service running until current_period_end. Status stays
  // 'active' until then; we just record the cancellation timestamp.
  await pool.query(
    `UPDATE subscriptions
       SET subscription_status = $2,
           canceled_at         = NOW()
     WHERE gateway_subscription_id = $1`,
    [sub.id, sub.status]
  );
}

async function updateStatus(sub, status) {
  await pool.query(
    `UPDATE subscriptions SET subscription_status = $2
     WHERE gateway_subscription_id = $1`,
    [sub.id, status]
  );
}

async function resetCreditsIfRenewal(txn) {
  // Only reset for subscription renewals, not first-time purchases or one-offs
  if (!txn.subscription_id || txn.origin !== "subscription_recurring") return;
  await pool.query(
    `UPDATE subscriptions
       SET sms_credits_used      = 0,
           whatsapp_credits_used = 0,
           credits_reset_at      = NOW()
     WHERE gateway_subscription_id = $1`,
    [txn.subscription_id]
  );
}