/**
 * msg91.provider.js
 * Cheap domestic Indian SMS via MSG91. Falls back to simulated mode if no
 * credentials are configured so dev environments don't break.
 *
 * Required env (when going live):
 *   MSG91_AUTH_KEY     — API key from msg91.com dashboard
 *   MSG91_SENDER_ID    — registered DLT sender ID, e.g. "GTRRSE"
 *   MSG91_TEMPLATE_ID  — DLT-registered template ID
 *
 * For WhatsApp via MSG91 (or Gupshup), wire sendWhatsApp similarly.
 */

const PROVIDER_NAME = "msg91";

const hasCredentials = () =>
  Boolean(
    process.env.MSG91_AUTH_KEY &&
    process.env.MSG91_SENDER_ID &&
    process.env.MSG91_TEMPLATE_ID
  );

const msg91Request = async ({ to, body }) => {
  // MSG91 expects numbers without "+" — strip if present
  const cleaned = to.replace(/^\+/, "").replace(/[\s()-]/g, "");

  const payload = {
    template_id: process.env.MSG91_TEMPLATE_ID,
    sender:      process.env.MSG91_SENDER_ID,
    short_url:   "1",
    recipients: [
      {
        mobiles: cleaned,
        // DLT-approved variable mapping — use a single var named "msg"
        msg:     body,
      },
    ],
  };

  const response = await fetch("https://control.msg91.com/api/v5/flow/", {
    method:  "POST",
    headers: {
      "Content-Type": "application/json",
      "authkey":      process.env.MSG91_AUTH_KEY,
    },
    body:   JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`MSG91 ${response.status}: ${errText.slice(0, 200)}`);
  }

  return response.json();
};

// ── sendSms ───────────────────────────────────────────────────────────────────
export const sendSms = async ({ to, body }) => {
  if (!hasCredentials()) {
    console.warn(`[sms/msg91] simulated SMS → ${to}: ${body.slice(0, 80)}`);
    return { id: `sim_${Date.now()}`, provider: PROVIDER_NAME, status: "simulated", simulated: true };
  }

  try {
    const result = await msg91Request({ to, body });
    return {
      id:       result.request_id || `msg91_${Date.now()}`,
      provider: PROVIDER_NAME,
      status:   result.type === "success" ? "queued" : "failed",
    };
  } catch (err) {
    console.error("[sms/msg91] send failed:", err.message);
    throw new Error("SMS provider error");
  }
};

// WhatsApp not implemented yet — placeholder that returns a clear error.
// If you want WhatsApp on the Indian side, wire Gupshup here (or use MSG91 WA).
export const sendWhatsApp = async () => {
  throw new Error("WhatsApp via MSG91 not implemented — use Twilio for now");
};