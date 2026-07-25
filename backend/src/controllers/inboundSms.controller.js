// backend/src/controllers/inboundSms.controller.js
//
// POST /api/v1/webhooks/sms/inbound — Twilio posts inbound messages here.
// Purpose: the STOP keyword → GLOBAL opt-out (clinic_id NULL; see OptOut model
// for why global is the compliance-safe scope on a shared number).
//
// UNAUTHENTICATED by nature (Twilio has no JWT), authenticated by the
// X-Twilio-Signature HMAC instead — without which anyone could opt out
// arbitrary phones and hollow out every clinic's campaigns.
//
// Twilio expects a 2xx with TwiML (or empty). Non-2xx makes Twilio retry and
// eventually alert — so even on odd input we 200 unless the signature fails.
//
// NOTE Twilio Messaging's "Advanced Opt-Out" already blocks further sends to
// a STOPped number AT THE PROVIDER for that number. We record it ourselves
// anyway: our table is provider-independent (MSG91 has no such feature),
// survives number changes, and lets the UI show suppression counts.

import { validateTwilioSignature } from "../utils/twilioSignature.js";
import { recordOptOut } from "../services/campaigns/campaign.service.js";
import { env } from "../config/env.js";

const STOP_WORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit"]);
const START_WORDS = new Set(["start", "unstop", "yes"]);

export const inboundSms = async (req, res) => {
  const signature = req.headers["x-twilio-signature"];
  // The EXACT URL Twilio was configured with — build from API_PUBLIC_URL, not
  // req.host (behind a proxy req.host is the internal name and the HMAC won't
  // match).
  const url = `${env.API_PUBLIC_URL}/api/v1/webhooks/sms/inbound`;

  if (!validateTwilioSignature(env.TWILIO_TOKEN, signature, url, req.body)) {
    console.warn("[inbound-sms] invalid Twilio signature");
    return res.status(403).send("Invalid signature");
  }

  const from = (req.body.From || "").trim();
  const text = (req.body.Body || "").trim().toLowerCase();

  try {
    if (from && STOP_WORDS.has(text)) {
      await recordOptOut({ clinicId: null, phone: from, source: "inbound_stop" });
      console.log(`[inbound-sms] STOP recorded for ${from.slice(0, 6)}…`);
    } else if (from && START_WORDS.has(text)) {
      // Re-consent: remove the global suppression row.
      const { sequelize } = await import("../config/db.js");
      await sequelize.query(
        `DELETE FROM opt_outs WHERE phone = $1::text AND clinic_id IS NULL`,
        { bind: [from] }
      );
      console.log(`[inbound-sms] START — suppression lifted for ${from.slice(0, 6)}…`);
    }
  } catch (err) {
    // Log but still 200 — Twilio retrying won't fix a DB error, and the
    // provider-side Advanced Opt-Out has already stopped sends to this number.
    console.error("[inbound-sms] processing error:", err.message);
  }

  res.type("text/xml");
  return res.status(200).send("<Response></Response>");
};