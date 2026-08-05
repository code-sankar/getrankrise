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

    // Joi (billing.routes.js) has already rejected anything that is not a known
    // plan name, so reaching here with no price id means the SERVER is missing
    // PADDLE_PRICE_ID_STARTER / _PREMIUM — not that the caller asked for
    // something invalid. Returning 400 "Invalid plan" for that blamed the user
    // for a deploy problem and made the upgrade funnel undebuggable: a correct
    // {"plan":"starter"} came back looking like a client bug.
    const priceId = PRICE_MAP()[plan];
    if (!priceId) {
      console.error(
        `[billing] no Paddle price id configured for plan "${plan}" — set PADDLE_PRICE_ID_${plan.toUpperCase()}`
      );
      return res.status(503).json({
        success: false,
        code: "BILLING_NOT_CONFIGURED",
        message:
          "Upgrades aren't available right now. Our team has been notified — please try again shortly.",
        plan,
      });
    }

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
    const claimed = await claimWebhookEvent({ eventId, eventType, event });

    if (!claimed) {
      // Already processed (or another delivery of the same event is in flight
      // right now) — 200 so Paddle stops retrying.
      return res.status(200).send("Duplicate, ignored");
    }

    await processEvent(event);

    // processed_at is what makes the claim above permanent. Until this lands
    // the row reads as "attempted, outcome unknown", which is precisely the
    // state a Paddle retry is allowed to re-claim.
    await WebhookEvent.update(
      { processedAt: new Date() },
      { where: { eventId } }
    );

    return res.status(200).send("OK");
  } catch (err) {
    console.error("[paddle webhook] processing error:", err);
    // 5xx → Paddle will retry with exponential backoff. The row stays with
    // processed_at NULL, so claimWebhookEvent lets that retry through once the
    // stale-claim window has elapsed.
    return res.status(500).send("Processing failed");
  }
};

// How long a claimed-but-unfinished event is treated as still in flight.
// Below this, a redelivery is assumed to be a concurrent duplicate and is
// dropped; above it, the previous attempt is assumed dead and the retry is
// allowed through. Paddle's retry backoff starts in minutes, so this window
// separates "two deliveries racing" from "the first attempt genuinely failed".
const WEBHOOK_CLAIM_STALE_MINUTES = 5;

/**
 * Atomically claims one webhook event for processing.
 *
 * ── Why this is raw SQL and not WebhookEvent.bulkCreate ────────────────────
 * The previous version used bulkCreate({ ignoreDuplicates: true }) and tested
 * `record.id === null` to detect the duplicate. That test can never be true:
 * the model declares `defaultValue: DataTypes.UUIDV4`, so Sequelize generates
 * the id CLIENT-SIDE before the INSERT and hands it back on the instance
 * whether or not Postgres wrote a row. Two identical calls returned two
 * different non-null uuids while the table held exactly one row — so the guard
 * never fired and every Paddle redelivery re-ran processEvent(). For
 * transaction.completed that re-zeroed sms_credits_used / whatsapp_credits_used,
 * silently handing back credits the customer had already spent.
 *
 * Asking Postgres directly is the only reliable answer: RETURNING yields a row
 * only when this statement actually inserted or re-claimed one.
 *
 * ── The three cases, and why a bare DO NOTHING is not enough ───────────────
 *   no row yet                         → INSERT           → claim (1 row)
 *   row exists, processed_at IS NULL,  → DO UPDATE fires  → re-claim (1 row)
 *     received_at older than the window
 *   row exists, processed_at set       → WHERE blocks it  → skip (0 rows)
 *   row exists, claimed just now       → WHERE blocks it  → skip (0 rows)
 *
 * The middle case is load-bearing. The row is committed BEFORE processEvent
 * runs, so with a plain `ON CONFLICT DO NOTHING` guard an event whose handler
 * threw would be recorded forever and its 500-triggered Paddle retry would be
 * rejected as a duplicate — the failure would become permanent and silent.
 * Gating the re-claim on processed_at IS NULL keeps genuine retries working,
 * and the received_at window stops two simultaneous deliveries from both
 * claiming while the first is still mid-flight.
 *
 * @returns {Promise<boolean>} true when the caller owns this event
 */
async function claimWebhookEvent({ eventId, eventType, event }) {
  const rows = await sequelize.query(
    `INSERT INTO webhook_events (id, provider, event_id, event_type, payload, received_at)
     VALUES (gen_random_uuid(), 'paddle', $1::text, $2::text, $3::jsonb, NOW())
     ON CONFLICT (event_id) DO UPDATE
        SET received_at = NOW()
      WHERE webhook_events.processed_at IS NULL
        AND webhook_events.received_at < NOW() - ($4 || ' minutes')::interval
     RETURNING id`,
    {
      bind: [
        eventId,
        eventType,
        JSON.stringify(event),
        String(WEBHOOK_CLAIM_STALE_MINUTES),
      ],
      type: QueryTypes.SELECT,
    }
  );

  return rows.length > 0;
}

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

// ── Cancellation ────────────────────────────────────────────────────────────
// Paddle keeps service running until current_period_end, and for a SCHEDULED
// cancellation it keeps status "active" until the effective date and only then
// sends subscription.canceled. So by the time this fires the paid period has
// normally already ended.
//
// What this used to leave behind: plan_type stayed "premium" forever. Feature
// gates blocked the clinic (requireFeature reads isActive), which made it look
// handled — but every LIMIT comes from the plan, not from isActive, so an
// ex-customer kept Premium's storedReviewsLimit: Infinity. Their review feed
// stayed uncapped and analytics kept aggregating all history indefinitely,
// while a Free clinic that never paid is trimmed to 20 rows.
//
// toSubscriptionState() now resolves an expired cancellation to Free on read,
// so enforcement is correct the moment the period ends whether or not this
// write ran. This persists the same conclusion so admin queries, the
// clinics.plan mirror and the sync scheduler's SQL (which reads plan_type
// directly) agree with it.
//
// The gateway ids are deliberately preserved: they are what lets the customer
// reactivate, and createBillingPortal needs gatewayCustomerId to open the
// portal for someone who has just cancelled.
async function markCanceled(sub) {
  const periodEnd = sub.current_billing_period?.ends_at || null;
  const stillPaidFor = periodEnd && new Date(periodEnd).getTime() > Date.now();

  await sequelize.transaction(async (transaction) => {
    const [row] = await sequelize.query(
      `UPDATE subscriptions
          SET subscription_status = $2::subscription_status_enum,
              canceled_at         = NOW(),
              current_period_end  = COALESCE($3::timestamptz, current_period_end),
              -- Keep the paid-for plan during any remaining grace; drop to free
              -- once that time is spent.
              plan_type           = CASE WHEN $4::bool THEN plan_type
                                         ELSE 'free'::plan_type_enum END
        WHERE gateway_subscription_id = $1::text
        RETURNING clinic_id, plan_type`,
      {
        bind: [sub.id, sub.status, periodEnd, Boolean(stillPaidFor)],
        type: QueryTypes.SELECT,
        transaction,
      }
    );

    if (!row) {
      console.warn(`[paddle] canceled event for unknown subscription ${sub.id}`);
      return;
    }

    // Mirror, same posture as upsertSubscription: never fail the webhook over
    // a denormalized column that nothing enforces against.
    try {
      await Clinic.update(
        { plan: row.plan_type },
        { where: { id: row.clinic_id }, transaction }
      );
    } catch (e) {
      console.warn("[paddle] clinic.plan mirror failed on cancel:", e.message);
    }
  });
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