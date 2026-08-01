// backend/src/services/billing/paddle.client.js
//
// Env hygiene: this file now reads Paddle config from the validated `env`
// object (config/env.js) instead of raw process.env. env.js soft-checks the
// Paddle set at boot, so by the time these run the values are guaranteed
// present-or-all-absent. The checkout success redirect now uses env.CLIENT_URL
// — the old process.env.FRONTEND_URL (a second name for the same concept that
// broke checkouts when only CLIENT_URL was set) is gone.

import crypto from "crypto";
import { env } from "../../config/env.js";

const API_BASE =
  env.PADDLE_ENVIRONMENT === "production"
    ? "https://api.paddle.com"
    : "https://sandbox-api.paddle.com";

const headers = () => ({
  Authorization: `Bearer ${env.PADDLE_API_KEY}`,
  "Content-Type": "application/json",
});

/**
 * Create a one-off Paddle transaction that becomes a subscription on completion.
 * Returns { transactionId, checkoutUrl }.
 */
export async function createTransaction({ priceId, customerId, customerEmail, clinicId, userId }) {
  const body = {
    items: [{ price_id: priceId, quantity: 1 }],
    custom_data: { clinic_id: clinicId, user_id: userId },
    checkout: { url: `${env.CLIENT_URL}/dashboard?upgrade=success` },
  };

  if (customerId)        body.customer_id = customerId;
  else if (customerEmail) body.customer = { email: customerEmail };

  const res = await fetch(`${API_BASE}/transactions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Paddle ${res.status}: ${errText.slice(0, 300)}`);
  }

  const { data } = await res.json();
  return { transactionId: data.id, checkoutUrl: data.checkout?.url };
}

// In sandbox, some Paddle responses hand back the PRODUCTION portal host. This
// rewrites it so sandbox testing lands on the sandbox portal. No-op in
// production, and no-op if the URL is already sandbox-hosted.
function toEnvHost(url) {
  if (!url || env.PADDLE_ENVIRONMENT === "production") return url;
  return url.replace(
    "https://customer-portal.paddle.com",
    "https://sandbox-customer-portal.paddle.com"
  );
}

/**
 * Create an authenticated Paddle customer-portal session.
 *
 * The returned links are SINGLE-USE and temporary — never cache or store them,
 * and never embed the portal in an iframe (open in a new tab). Requires the API
 * key to hold the "Customer portal sessions (Write)" permission, or Paddle
 * returns 403.
 *
 *   POST /customers/{customer_id}/portal-sessions
 *   body: { subscription_ids?: ["sub_..."] }   ← enables per-sub deep links
 *   → data.urls.general.overview
 *     data.urls.subscriptions[].{cancel_subscription, update_subscription_payment_method}
 *
 * @param {Object}   p
 * @param {string}   p.customerId          Paddle customer id (ctm_...)
 * @param {string[]} [p.subscriptionIds]   optional — for cancel/update deep links
 * @returns {Promise<{ overviewUrl: string|null, cancelUrl: string|null, updatePaymentUrl: string|null }>}
 */
export async function createPortalSession({ customerId, subscriptionIds }) {
  const body = {};
  if (Array.isArray(subscriptionIds) && subscriptionIds.length) {
    body.subscription_ids = subscriptionIds;
  }

  const res = await fetch(
    `${API_BASE}/customers/${encodeURIComponent(customerId)}/portal-sessions`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    }
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Paddle portal-session ${res.status}: ${errText.slice(0, 300)}`);
  }

  const { data } = await res.json();
  const sub = data?.urls?.subscriptions?.[0] || null;

  return {
    overviewUrl:      toEnvHost(data?.urls?.general?.overview || null),
    cancelUrl:        toEnvHost(sub?.cancel_subscription || null),
    updatePaymentUrl: toEnvHost(sub?.update_subscription_payment_method || null),
  };
}

/**
 * Paddle Billing webhook signature verification.
 * Header format: "ts=1700000000;h1=<sha256-hex>"
 * Signed payload: `${ts}:${rawBody}`
 * Algorithm: HMAC-SHA256 with the notification destination's secret.
 *
 * @param {string} rawBody     The raw request body as a UTF-8 string
 * @param {string} sigHeader   Contents of the Paddle-Signature header
 * @param {string} secret      env.PADDLE_WEBHOOK_SECRET
 * @returns {boolean}
 */
export function verifyWebhookSignature(rawBody, sigHeader, secret) {
  if (!sigHeader || !secret || !rawBody) return false;

  const parts = Object.fromEntries(
    sigHeader.split(";").map((kv) => kv.split("=").map((s) => s.trim()))
  );
  const { ts, h1 } = parts;
  if (!ts || !h1) return false;

  // Reject signatures older than 5 minutes (replay protection)
  const ageSec = Math.abs(Date.now() / 1000 - Number(ts));
  if (Number.isNaN(ageSec) || ageSec > 300) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${ts}:${rawBody}`)
    .digest("hex");

  if (expected.length !== h1.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(h1));
}

/** Maps a Paddle price ID back to our internal plan_type. */
export function priceIdToPlan(priceId) {
  if (priceId === env.PADDLE_PRICE_ID_STARTER) return "starter";
  if (priceId === env.PADDLE_PRICE_ID_PREMIUM) return "premium";
  return null;
}