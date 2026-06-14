/**
 * sms/index.js
 * Provider factory for outbound messaging (SMS + WhatsApp).
 *
 * Strategy: route domestic Indian traffic via MSG91 (cheaper local SMS),
 * everything else via Twilio. Detection is done in this order:
 *   1. Explicit country code on the clinic (req.clinic.countryCode)
 *   2. Phone number prefix (+91 → India, otherwise international)
 *
 * Every provider exposes the same contract:
 *   sendSms({ to, body, idempotencyKey? }) → { id, provider, status }
 *   sendWhatsApp({ to, body, idempotencyKey? }) → { id, provider, status }
 *
 * Providers return a { simulated: true } flag when no credentials are present,
 * so dev environments work without spending money.
 */

import * as twilio from "./twilio.provider.js";
import * as msg91  from "./msg91.provider.js";

const INDIAN_COUNTRY_CODES = new Set(["IN"]);

const isIndianNumber = (phone, countryCode) => {
  if (countryCode && INDIAN_COUNTRY_CODES.has(countryCode.toUpperCase())) return true;
  if (typeof phone === "string") {
    const trimmed = phone.replace(/[\s()-]/g, "");
    return trimmed.startsWith("+91") || trimmed.startsWith("0091");
  }
  return false;
};

/**
 * Resolves the right provider for a given destination.
 * @param {Object} ctx
 * @param {string} ctx.phone
 * @param {string} [ctx.countryCode] - 2-letter ISO from clinic profile
 * @returns {Object} provider module with sendSms / sendWhatsApp
 */
export const getProvider = ({ phone, countryCode }) => {
  if (isIndianNumber(phone, countryCode)) {
    return msg91;
  }
  return twilio;
};

/**
 * High-level send helper — picks provider and calls the right method.
 *
 * @param {Object} params
 * @param {string} params.channel      - "SMS" | "WhatsApp"
 * @param {string} params.to           - destination phone in E.164 ideally
 * @param {string} params.body         - message body
 * @param {string} [params.countryCode]
 * @param {string} [params.idempotencyKey]
 * @returns {Promise<{ id, provider, status, simulated? }>}
 */
export const sendMessage = async ({
  channel,
  to,
  body,
  countryCode,
  idempotencyKey,
}) => {
  const provider = getProvider({ phone: to, countryCode });

  if (channel === "WhatsApp") {
    if (typeof provider.sendWhatsApp !== "function") {
      throw new Error("WhatsApp not supported by selected provider");
    }
    return provider.sendWhatsApp({ to, body, idempotencyKey });
  }

  return provider.sendSms({ to, body, idempotencyKey });
};