// backend/src/controllers/request.controller.js  — sendRequest only
import { Request as ReviewRequest } from "../models/index.js";
import { sendMessage } from "../services/sms/index.js";
import {
  reserveCredits,
  refundCredits,
} from "../services/credits/credits.service.js";
import {
  successResponse,
  badRequestResponse,
  serverErrorResponse,
} from "../utils/apiResponse.js";

// POST /api/v1/requests
export const sendRequest = async (req, res) => {
  const clinicId = req.clinic.id;
  const { patientName, sendVia, phone, email, idempotencyKey } = req.body;

  // ── Figure out which counters this send hits ───────────────────────────
  // "Both" = SMS + Email. Email is unmetered (it's cheap). WhatsApp = WA only.
  const needsSms      = sendVia === "SMS"      || sendVia === "Both";
  const needsWhatsApp = sendVia === "WhatsApp";

  const reservations = [];

  try {
    // ── 1. Reserve credits BEFORE calling the provider ───────────────────
    if (needsSms) {
      const r = await reserveCredits({ clinicId, channel: "sms" });
      if (!r.reserved) return quotaError(res, r);
      reservations.push({ channel: "sms", amount: 1 });
    }
    if (needsWhatsApp) {
      const r = await reserveCredits({ clinicId, channel: "whatsapp" });
      if (!r.reserved) return quotaError(res, r);
      reservations.push({ channel: "whatsapp", amount: 1 });
    }

    // ── 2. Build the message and send ────────────────────────────────────
    const body = renderMessage({ patientName, clinicName: req.clinic.clinicName,
                                  reviewLink: req.clinic.googleReviewLink });

    let providerResult = null;
    if (needsSms) {
      providerResult = await sendMessage({
        channel:     "SMS",
        to:          phone,
        body,
        countryCode: req.clinic.countryCode,
        idempotencyKey,
      });
    } else if (needsWhatsApp) {
      providerResult = await sendMessage({
        channel:     "WhatsApp",
        to:          phone,
        body,
        countryCode: req.clinic.countryCode,
        idempotencyKey,
      });
    }
    // Email-only ("Email") is unmetered — handle via your email service here.

    // ── 3. Persist the request row ───────────────────────────────────────
    const saved = await ReviewRequest.create({
      clinicId,
      patientName,
      phone:       phone || null,
      email:       email || null,
      sendVia,
      status:      "Sent",
      messageBody: body,
    });

    return successResponse(res, {
      message: "Review request sent",
      data:    {
        request:  saved,
        provider: providerResult?.provider,
        simulated: providerResult?.simulated || false,
      },
    });
  } catch (err) {
    // ── 4. Provider blew up → refund every reservation ───────────────────
    for (const r of reservations) {
      await refundCredits({ clinicId, channel: r.channel, amount: r.amount });
    }
    console.error("sendRequest error:", err);
    return serverErrorResponse(res, "Could not send review request");
  }
};

// ── Helpers ──────────────────────────────────────────────────────────────
const renderMessage = ({ patientName, clinicName, reviewLink }) =>
  `Hi ${patientName}, thanks for visiting ${clinicName}! ` +
  `If you have a moment, we'd love your feedback: ${reviewLink || "—"}`;

const quotaError = (res, r) => {
  // Re-use the same response shape the Upgrade modal already knows
  const isPlanGap = r.reason === "PLAN_DOES_NOT_INCLUDE_CHANNEL";
  return res.status(403).json({
    success: false,
    code:    isPlanGap ? "UPGRADE_REQUIRED" : "QUOTA_EXCEEDED",
    message: isPlanGap
      ? `Your ${r.currentPlan} plan doesn't include ${r.channel.toUpperCase()} sends. Upgrade to keep going.`
      : `You've used all ${r.limit} ${r.channel.toUpperCase()} credits this period. Upgrade or wait until your next billing cycle.`,
    currentPlan:   r.currentPlan,
    requiredPlans: isPlanGap ? ["starter", "premium"] : ["premium"],
    channel:       r.channel,
    limit:         r.limit,
    used:          r.used,
  });
};