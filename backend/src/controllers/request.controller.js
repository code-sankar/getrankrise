// backend/src/controllers/request.controller.js
//
// PHASE 5 REWRITE. Two changes to sendRequest; the credits flow is untouched.
//
// 1. EMAIL IS NOW METERED. emailPerMonth (0/500/5000) had existed in plans.js
//    since day one and was enforced nowhere — the Free tier could "send"
//    unlimited email. Email draws from usage_counters via reserveUsage, same
//    reserve→send→refund shape as SMS credits.
//
// 2. EMAIL IS NOW HONEST. The old code had no email provider wired at all —
//    the comment said "handle via your email service here" and then persisted
//    status:"Sent". Users believed messages went out; nothing ever did.
//    Metering that fiction would be worse than not metering: it would burn
//    real quota on fake sends. So until an email provider exists (SendGrid is
//    slated for the campaigns phase), Email/Both requests return an explicit
//    503 EMAIL_NOT_CONFIGURED instead of fake success. When the provider
//    lands, delete the emailConfigured() guard and fill in sendEmail() —
//    the metering around it is already correct.

import { Request as ReviewRequest } from "../models/index.js";
import { sendMessage } from "../services/sms/index.js";
import {
  reserveCredits,
  refundCredits,
} from "../services/credits/credits.service.js";
import {
  reserveUsage,
  refundUsage,
  usageErrorResponse,
} from "../services/usage/usage.service.js";
import { env } from "../config/env.js";
import {
  successResponse,
  serverErrorResponse,
} from "../utils/apiResponse.js";

const emailConfigured = () => Boolean(env.SENDGRID_API_KEY);

// POST /api/v1/requests
export const sendRequest = async (req, res) => {
  const clinicId = req.clinic.id;
  const { patientName, sendVia, phone, email, idempotencyKey } = req.body;

  // ── Which meters does this send hit? ───────────────────────────────────
  // SMS / WhatsApp → subscriptions credit columns (billing-period reset).
  // Email          → usage_counters (calendar-month reset).
  const needsSms = sendVia === "SMS" || sendVia === "Both";
  const needsWhatsApp = sendVia === "WhatsApp";
  const needsEmail = sendVia === "Email" || sendVia === "Both";

  // Fail fast BEFORE reserving anything: if email is requested but no provider
  // exists, don't burn an SMS credit on a "Both" send that can only half-work.
  if (needsEmail && !emailConfigured()) {
    return res.status(503).json({
      success: false,
      code: "EMAIL_NOT_CONFIGURED",
      message:
        "Email sending isn't available yet. Please use SMS" +
        (sendVia === "Both" ? " on its own" : " or WhatsApp") +
        " for now.",
    });
  }

  const creditReservations = []; // refund via refundCredits
  const usageReservations = []; // refund via refundUsage

  const refundAll = async () => {
    for (const r of creditReservations) {
      await refundCredits({ clinicId, channel: r.channel, amount: r.amount });
    }
    for (const r of usageReservations) {
      await refundUsage({ clinicId, metric: r.metric, amount: r.amount });
    }
  };

  try {
    // ── 1. Reserve EVERYTHING before sending ANYTHING ────────────────────
    // A "Both" send must be all-or-nothing at reservation time: if the email
    // quota is exhausted we must not have already sent the SMS. Reserve first,
    // send second, refund on failure.
    if (needsSms) {
      const r = await reserveCredits({ clinicId, channel: "sms" });
      if (!r.reserved) {
        await refundAll();
        return quotaError(res, r);
      }
      creditReservations.push({ channel: "sms", amount: 1 });
    }
    if (needsWhatsApp) {
      const r = await reserveCredits({ clinicId, channel: "whatsapp" });
      if (!r.reserved) {
        await refundAll();
        return quotaError(res, r);
      }
      creditReservations.push({ channel: "whatsapp", amount: 1 });
    }
    if (needsEmail) {
      const r = await reserveUsage({ clinicId, metric: "email" });
      if (!r.reserved) {
        await refundAll();
        return usageErrorResponse(res, r);
      }
      usageReservations.push({ metric: "email", amount: 1 });
    }

    // ── 2. Build the message and send ────────────────────────────────────
    const body = renderMessage({
      patientName,
      clinicName: req.clinic.clinicName,
      reviewLink: req.clinic.googleReviewLink,
    });

    let providerResult = null;
    if (needsSms) {
      providerResult = await sendMessage({
        channel: "SMS",
        to: phone,
        body,
        countryCode: req.clinic.countryCode,
        idempotencyKey,
      });
    } else if (needsWhatsApp) {
      providerResult = await sendMessage({
        channel: "WhatsApp",
        to: phone,
        body,
        countryCode: req.clinic.countryCode,
        idempotencyKey,
      });
    }

    if (needsEmail) {
      // Unreachable today (emailConfigured() gate above), present so the
      // control flow is already correct when the provider lands:
      await sendEmail({ to: email, patientName, body });
    }

    // ── 3. Persist the request row ───────────────────────────────────────
    const saved = await ReviewRequest.create({
      clinicId,
      patientName,
      phone: phone || null,
      email: email || null,
      sendVia,
      status: "Sent",
      messageBody: body,
    });

    return successResponse(res, {
      message: "Review request sent",
      data: {
        request: saved,
        provider: providerResult?.provider,
        simulated: providerResult?.simulated || false,
      },
    });
  } catch (err) {
    // ── 4. Provider blew up → refund every reservation of both kinds ────
    await refundAll();
    console.error("sendRequest error:", err);
    return serverErrorResponse(res, "Could not send review request");
  }
};

// ── Email provider stub ──────────────────────────────────────────────────
// Deliberately throws: with the emailConfigured() gate above this is dead
// code, and if the gate is ever removed without implementing this, the throw
// triggers the refund path instead of a silent fake "Sent".
async function sendEmail() {
  throw new Error("sendEmail() not implemented — wire SendGrid before removing the gate");
}

// ── Helpers ──────────────────────────────────────────────────────────────
const renderMessage = ({ patientName, clinicName, reviewLink }) =>
  `Hi ${patientName}, thanks for visiting ${clinicName}! ` +
  `If you have a moment, we'd love your feedback: ${reviewLink || "—"}`;

const quotaError = (res, r) => {
  // Same 403 shape the Upgrade modal pattern-matches. The NO_SUBSCRIPTION
  // branch is new: pre-Phase-0 registrations could lack a subscriptions row,
  // and the old fall-through rendered "all undefined SMS credits".
  if (r.reason === "NO_SUBSCRIPTION") {
    return res.status(500).json({
      success: false,
      message:
        "Your account is missing billing information. Please contact support.",
    });
  }
  const isPlanGap = r.reason === "PLAN_DOES_NOT_INCLUDE_CHANNEL";
  return res.status(403).json({
    success: false,
    code: isPlanGap ? "UPGRADE_REQUIRED" : "QUOTA_EXCEEDED",
    message: isPlanGap
      ? `Your ${r.currentPlan} plan doesn't include ${r.channel.toUpperCase()} sends. Upgrade to keep going.`
      : `You've used all ${r.limit} ${r.channel.toUpperCase()} credits this period. Upgrade or wait until your next billing cycle.`,
    currentPlan: r.currentPlan,
    requiredPlans: isPlanGap ? ["starter", "premium"] : ["premium"],
    channel: r.channel,
    limit: r.limit,
    used: r.used,
  });
};