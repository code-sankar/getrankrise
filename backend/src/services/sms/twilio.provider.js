/**
 * twilio.provider.js
 * International SMS + WhatsApp via Twilio REST API.
 *
 * No SDK dependency — we call the API directly with fetch + Basic auth so the
 * backend doesn't pull in the Twilio SDK's transitive dependencies.
 *
 * Required env:
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
 * Optional for WhatsApp:
 *   TWILIO_WHATSAPP_NUMBER (e.g. "whatsapp:+14155238886")
 */

import { env } from "../../config/env.js";

const PROVIDER_NAME = "twilio";

const hasCredentials = () =>
  Boolean(env.TWILIO_SID && env.TWILIO_TOKEN && env.TWILIO_PHONE);

// ── Simulation is a DEV affordance, never a production outcome ───────────────
// Returning { status: "simulated" } is exactly as successful as a real send
// from every caller's point of view: request.controller.js records the request,
// campaignRunner marks the recipient 'sent' and increments sent_count, and the
// clinic sees "Sent" on a message no patient ever received. The credit is spent
// either way.
//
// env.js now refuses to boot production without Twilio configured, so this
// should be unreachable there. It exists anyway because the boot check reads
// the environment ONCE — a rotated secret, a redeploy that drops a variable, or
// a platform that injects config after start all produce a live process with no
// credentials, and the failure mode must be a loud error the runner can refund
// and record, not a silent fake success.
const simulateOrThrow = (channelLabel, to, body) => {
  if (process.env.NODE_ENV === "production") {
    console.error(
      `[sms/twilio] REFUSING to simulate ${channelLabel} to ${to} in production — ` +
        "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER" +
        (channelLabel === "WhatsApp" ? " / TWILIO_WHATSAPP_NUMBER" : "") +
        " is missing."
    );
    throw new Error(
      `${channelLabel} is not configured on this server — no message was sent.`
    );
  }
  console.warn(`[sms/twilio] simulated ${channelLabel} → ${to}: ${body.slice(0, 80)}`);
  return {
    id: `sim_${Date.now()}`,
    provider: PROVIDER_NAME,
    status: "simulated",
    simulated: true,
  };
};

const twilioRequest = async ({ from, to, body }) => {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_SID}/Messages.json`;
  const credentials = Buffer.from(`${env.TWILIO_SID}:${env.TWILIO_TOKEN}`).toString("base64");

  const params = new URLSearchParams();
  params.append("From", from);
  params.append("To",   to);
  params.append("Body", body);

  const response = await fetch(url, {
    method:  "POST",
    headers: {
      Authorization:  `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body:   params.toString(),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Twilio ${response.status}: ${errText.slice(0, 200)}`);
  }

  return response.json();
};

// ── sendSms ───────────────────────────────────────────────────────────────────
export const sendSms = async ({ to, body }) => {
  if (!hasCredentials()) return simulateOrThrow("SMS", to, body);

  try {
    const result = await twilioRequest({ from: env.TWILIO_PHONE, to, body });
    return {
      id:       result.sid,
      provider: PROVIDER_NAME,
      status:   result.status || "queued",
    };
  } catch (err) {
    console.error("[sms/twilio] send failed:", err.message);
    throw new Error("SMS provider error");
  }
};

// ── sendWhatsApp ──────────────────────────────────────────────────────────────
export const sendWhatsApp = async ({ to, body }) => {
  const whatsappFrom = process.env.TWILIO_WHATSAPP_NUMBER;
  if (!hasCredentials() || !whatsappFrom) {
    return simulateOrThrow("WhatsApp", to, body);
  }

  try {
    const result = await twilioRequest({
      from: whatsappFrom.startsWith("whatsapp:") ? whatsappFrom : `whatsapp:${whatsappFrom}`,
      to:   to.startsWith("whatsapp:") ? to : `whatsapp:${to}`,
      body,
    });
    return {
      id:       result.sid,
      provider: `${PROVIDER_NAME}-whatsapp`,
      status:   result.status || "queued",
    };
  } catch (err) {
    console.error("[sms/twilio] WhatsApp send failed:", err.message);
    throw new Error("WhatsApp provider error");
  }
};