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
  if (!hasCredentials()) {
    console.warn(`[sms/twilio] simulated SMS → ${to}: ${body.slice(0, 80)}`);
    return { id: `sim_${Date.now()}`, provider: PROVIDER_NAME, status: "simulated", simulated: true };
  }

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
    console.warn(`[sms/twilio] simulated WhatsApp → ${to}: ${body.slice(0, 80)}`);
    return { id: `sim_${Date.now()}`, provider: PROVIDER_NAME, status: "simulated", simulated: true };
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