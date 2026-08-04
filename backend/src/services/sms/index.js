/**
 * sms/index.js
 * Provider factory for outbound messaging (SMS + WhatsApp).
 *
 * Routing strategy:
 *   SMS      → domestic Indian traffic via MSG91 (cheaper local SMS),
 *              everything else via Twilio.
 *   WhatsApp → ALWAYS Twilio, regardless of country (see note below).
 *
 * India detection (SMS only) is done in this order:
 *   1. Explicit country code on the clinic (req.clinic.countryCode)
 *   2. Phone number prefix (+91 → India, otherwise international)
 *
 * ── Why WhatsApp is Twilio-only for now ─────────────────────────────────────
 * MSG91's WhatsApp integration is not wired yet (msg91.provider.sendWhatsApp
 * throws "not implemented"). Previously, a WhatsApp message to an Indian
 * destination resolved to MSG91 and failed for every recipient — which, for a
 * Premium clinic in India, silently broke the whole WhatsApp channel. Until a
 * domestic WhatsApp provider (MSG91 or Gupshup) lands, every WhatsApp message
 * goes through Twilio. Twilio's WhatsApp API delivers to Indian numbers too, so
 * this is correct, just not the cheapest possible route.
 *
 * TO RESTORE DOMESTIC WHATSAPP LATER: implement sendWhatsApp in the domestic
 * provider, then drop the `channel === "WhatsApp"` short-circuit in
 * getProvider() so WhatsApp falls back through the same India routing as SMS.
 *
 * Every provider exposes the same contract:
 *   sendSms({ to, body, idempotencyKey? })      → { id, provider, status }
 *   sendWhatsApp({ to, body, idempotencyKey? }) → { id, provider, status }
 *
 * Providers return a { simulated: true } flag when no credentials are present,
 * so dev environments work without spending money.
 */

import * as twilio from "./twilio.provider.js";
import * as msg91  from "./msg91.provider.js";

const INDIAN_COUNTRY_CODES = new Set(["IN"]);

// MSG91 is a COST OPTIMISATION for Indian SMS, not a capability Twilio lacks —
// Twilio delivers to Indian numbers perfectly well, just at a higher price.
// Routing to MSG91 unconditionally therefore meant that a deployment which had
// configured Twilio but not MSG91 silently SIMULATED every domestic Indian
// message: the send returned status "simulated", the campaign counted it as
// sent, and no patient received anything. For an India-first product that is
// the entire customer base failing invisibly.
//
// All three MSG91 variables are checked because DLT registration makes the
// sender ID and template ID as mandatory as the auth key (env.js enforces the
// same grouping at boot).
const msg91Configured = () =>
  Boolean(
    process.env.MSG91_AUTH_KEY &&
    process.env.MSG91_SENDER_ID &&
    process.env.MSG91_TEMPLATE_ID
  );

const isIndianNumber = (phone, countryCode) => {
  if (countryCode && INDIAN_COUNTRY_CODES.has(countryCode.toUpperCase())) return true;
  if (typeof phone === "string") {
    const trimmed = phone.replace(/[\s()-]/g, "");
    return trimmed.startsWith("+91") || trimmed.startsWith("0091");
  }
  return false;
};

/**
 * Resolves the right provider for a given destination + channel.
 *
 * @param {Object} ctx
 * @param {string} ctx.phone
 * @param {string} [ctx.countryCode] - 2-letter ISO from clinic profile
 * @param {string} [ctx.channel]     - "SMS" | "WhatsApp" (defaults to "SMS")
 * @returns {Object} provider module with sendSms / sendWhatsApp
 */
export const getProvider = ({ phone, countryCode, channel = "SMS" } = {}) => {
  // WhatsApp has no domestic provider yet — route it through Twilio for every
  // destination, including India. See the file header for the rationale and
  // the steps to re-enable domestic routing once MSG91/Gupshup WhatsApp lands.
  if (channel === "WhatsApp") return twilio;

  // SMS: domestic Indian traffic → MSG91 when it is actually configured,
  // everything else → Twilio. The configured check is what stops an
  // MSG91-less deploy from routing every Indian number into a simulated send.
  if (isIndianNumber(phone, countryCode) && msg91Configured()) return msg91;
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
  const provider = getProvider({ phone: to, countryCode, channel });

  if (channel === "WhatsApp") {
    // Defensive: with the channel-aware getProvider above this is always
    // Twilio, which implements sendWhatsApp. The guard stays so a future
    // routing change can't silently call an undefined method.
    if (typeof provider.sendWhatsApp !== "function") {
      throw new Error("WhatsApp not supported by selected provider");
    }
    return provider.sendWhatsApp({ to, body, idempotencyKey });
  }

  return provider.sendSms({ to, body, idempotencyKey });
};