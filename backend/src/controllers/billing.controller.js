// backend/src/controllers/billing.controller.js
//
// PHASE 0 CHANGE: this was the last consumer of src/db/pool.js. All queries now
// run through the Subscription / WebhookEvent models on the shared Sequelize
// connection. Behaviour is unchanged; the notable improvement is that
// upsertSubscription() now runs inside a transaction, so the subscriptions
// write and the clinics.plan mirror can no longer half-apply.

import { QueryTypes } from "sequelize";
import { sequelize } from "../config/db.js";
import { Subscription, WebhookEvent, Clinic } from "../models/index.js";
import {
  createTransaction,
  createPortalSession,
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
    const { plan } = req.body; // 'starter' | 'premium'
    const priceId = PRICE_MAP()[plan];
    if (!priceId) return badRequestResponse(res, "Invalid plan");

    const clinicId = req.clinic.id;
    const userId = req.user.id;

    // Reuse existing Paddle customer if we already have one
    const existing = await Subscription.findOne({
      where: { clinicId },
      attributes: ["gatewayCustomerId"],
    });
    const customerId = existing?.gatewayCustomerId || null;

    const { transactionId, checkoutUrl } = await createTransaction({
      priceId,
      customerId,
      customerEmail: customerId ? null : req.user.email,
      clinicId,
      userId,
    });

    return successResponse(res, {
      message: "Checkout created",
      data: { transactionId, checkoutUrl, plan },
    });
  } catch (err) {
    console.error("createCheckout error:", err);
    return serverErrorResponse(res, "Could not create checkout");
  }
};

// ── POST /api/v1/billing/portal-session ────────────────────────────────────
// Authenticated. Returns a short-lived Paddle customer-portal link so the user
// can update their payment method or cancel. Only paid clinics have a Paddle
// customer id — free clinics have never been to checkout, so there's nothing
// to manage.
export const createBillingPortal = async (req, res) => {
  try {
    const sub = await Subscription.findOne({
      where: { clinicId: req.clinic.id },
      attributes: ["gatewayCustomerId", "gatewaySubscriptionId"],
    });

    if (!sub?.gatewayCustomerId) {
      return res.status(409).json({
        success: false,
        code: "NO_BILLING_ACCOUNT",
        message: "You don't have a paid subscription to manage yet. Upgrade to a paid plan first.",
      });
    }

    const { overviewUrl, cancelUrl, updatePaymentUrl } = await createPortalSession({
      customerId: sub.gatewayCustomerId,
      subscriptionIds: sub.gatewaySubscriptionId ? [sub.gatewaySubscriptionId] : undefined,
    });

    if (!overviewUrl) {
      return serverErrorResponse(res, "Could not generate a billing portal link. Please try again.");
    }

    return successResponse(res, {
      message: "Billing portal session created",
      data: { overviewUrl, cancelUrl, updatePaymentUrl },
    });
  } catch (err) {
    console.error("createBillingPortal error:", err);
    return serverErrorResponse(res, "Could not open the billing portal");
  }
};

// ── POST /api/v1/billing/webhook ──────────────────────────────────────────
// IMPORTANT: this route must receive the RAW body (Buffer), not parsed JSON,
// because the signature is computed over the exact bytes Paddle sent.
//
// It is mounted ONCE, in app.js, BEFORE express.json() is applied. As of
// Phase 0 the duplicate registration inside billing.routes.js is gone — that
// copy sat behind the global express.json(), so had it ever become the live
// route, req.body would have arrived as a parsed object instead of a Buffer and
// every signature check would have failed silently.
export const handleWebhook = async (req, res) => {
  const sigHeader = req.headers["paddle-signature"];
  const rawBody =
    req.body instanceof Buffer
      ? req.body.toString("utf8")
      : typeof req.body === "string"
        ? req.body
        : "";

  if (!verifyWebhookSignature(rawBody, sigHeader, process.env.PADDLE_WEBHOOK_SECRET)) {
    console.warn("[paddle webhook] invalid signature");
    return res.status(401).send("Invalid signature");
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).send("Invalid JSON");
  }

  // Idempotency guard — Paddle retries until 2xx, so the same event_id
  // can arrive multiple times. We record + reject duplicates.
  const eventId = event.event_id;
  const eventType = event.event_type;
  if (!eventId || !eventType) return res.status(400).send("Malformed event");

  try {
    // INSERT ... ON CONFLICT DO NOTHING. Sequelize's ignoreDuplicates maps to
    // exactly that; a conflict yields a row with a null primary key, which is
    // how we detect the duplicate without a second round trip.
    const [record] = await WebhookEvent.bulkCreate(
      [
        {
          provider: "paddle",
          eventId,
          eventType,
          payload: event,
        },
      ],
      { ignoreDuplicates: true, returning: true }
    );

    if (!record || record.id === null) {
      // Already processed — return 200 so Paddle stops retrying
      return res.status(200).send("Duplicate, ignored");
    }

    await processEvent(event);

    await WebhookEvent.update(
      { processedAt: new Date() },
      { where: { eventId } }
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
  if (!clinicId) {
    console.error("[paddle] missing clinic_id in custom_data");
    return;
  }

  const priceId = sub.items?.[0]?.price?.id;
  const planType = priceIdToPlan(priceId);
  if (!planType) {
    console.error(`[paddle] unknown price ID: ${priceId}`);
    return;
  }

  const periodStart = sub.current_billing_period?.starts_at || null;
  const periodEnd = sub.current_billing_period?.ends_at || null;
  const status = sub.status; // 'active' | 'trialing' | etc.

  // Raw upsert rather than Subscription.upsert(): we need ON CONFLICT
  // (clinic_id) specifically, and we must NOT overwrite the credit counters —
  // a plan change mid-period must not silently refund a customer's used sends.
  // Sequelize's upsert() would include every model attribute in the update set.
  await sequelize.transaction(async (transaction) => {
    await sequelize.query(
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
         -- COALESCE, not a bare overwrite. Paddle omits current_billing_period
         -- on trialing subscriptions and on several subscription.updated
         -- payload shapes; assigning EXCLUDED unconditionally then NULLed a
         -- period we already knew, and a NULL current_period_start is what
         -- made reserveCredits refuse every SMS/WhatsApp send for that clinic.
         -- Never downgrade known billing state to unknown on an update event.
         current_period_start    = COALESCE(EXCLUDED.current_period_start, subscriptions.current_period_start),
         current_period_end      = COALESCE(EXCLUDED.current_period_end,   subscriptions.current_period_end),
         canceled_at             = NULL`,
      {
        bind: [
          clinicId,
          planType,
          status,
          sub.customer_id,
          sub.id,
          priceId,
          periodStart,
          periodEnd,
        ],
        type: QueryTypes.INSERT,
        transaction,
      }
    );

    // Keep clinics.plan in sync for admin/analytics reads. Enforcement no longer
    // depends on this column, so a failure here must never fail the webhook —
    // hence the inner catch. It stays inside the transaction so a successful
    // mirror commits atomically with the subscription write.
    try {
      await Clinic.update({ plan: planType }, { where: { id: clinicId }, transaction });
    } catch (e) {
      console.warn("[paddle] clinic.plan mirror failed:", e.message);
    }
  });
}

async function markCanceled(sub) {
  // Paddle keeps service running until current_period_end. Status stays
  // 'active' until then; we just record the cancellation timestamp.
  await Subscription.update(
    { subscriptionStatus: sub.status, canceledAt: new Date() },
    { where: { gatewaySubscriptionId: sub.id } }
  );
}

async function updateStatus(sub, status) {
  await Subscription.update(
    { subscriptionStatus: status },
    { where: { gatewaySubscriptionId: sub.id } }
  );
}

async function resetCreditsIfRenewal(txn) {
  // Only reset for subscription renewals, not first-time purchases or one-offs
  if (!txn.subscription_id || txn.origin !== "subscription_recurring") return;

  await Subscription.update(
    {
      smsCreditsUsed: 0,
      whatsappCreditsUsed: 0,
      creditsResetAt: new Date(),
    },
    { where: { gatewaySubscriptionId: txn.subscription_id } }
  );
}