// backend/src/controllers/request.controller.js
//
// PHASE 5 + EMAIL WIRE. Two things to know about sendRequest; the credits flow
// is untouched.
//
// 1. EMAIL IS METERED. emailPerMonth (0/500/5000) draws from usage_counters via
//    reserveUsage, the same reserve→send→refund shape as SMS credits.
//
// 2. EMAIL IS WIRED (SendGrid). Email/Both sends go through
//    services/email/email.service.js. When SendGrid isn't configured,
//    isEmailConfigured() is false and Email/Both requests return an explicit
//    503 EMAIL_NOT_CONFIGURED instead of a fake "Sent" — so this is safe to
//    ship before SendGrid is set up. Set SENDGRID_API_KEY + SENDGRID_FROM_EMAIL
//    (or EMAIL_SIMULATE=true in dev) to turn it on; the metering around it does
//    not change.

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
import {
  successResponse,
  serverErrorResponse,
  notFoundResponse,
} from "../utils/apiResponse.js";

import {
  isEmailConfigured,
  sendReviewRequestEmail,
} from "../services/email/email.service.js";
// Email availability delegates to the SendGrid service (honors a real key +
// verified sender, or EMAIL_SIMULATE in dev). The 503 gate below is unchanged.
const emailConfigured = isEmailConfigured;

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
  // is configured, don't burn an SMS credit on a "Both" send that can only
  // half-work.
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

  // ── 0. CLAIM the idempotency key before any money is spent ─────────────
  // Deliberately an INSERT rather than a SELECT-then-INSERT. A lookup would
  // leave a TOCTOU window in which two concurrent retries both see "no prior
  // row", both reserve a credit, and both text the patient — which is the
  // exact failure this key exists to prevent. Letting the partial unique index
  // (clinic_id, idempotency_key) arbitrate means Postgres picks the winner and
  // the loser replays, with no window at all.
  //
  // The message body is rendered up here because the row is written before the
  // send, so it must already know what it is about to say.
  const body = renderMessage({
    patientName,
    clinicName: req.clinic.clinicName,
    reviewLink: req.clinic.googleReviewLink,
  });

  let requestRow;
  try {
    requestRow = await ReviewRequest.create({
      clinicId,
      patientName,
      phone: phone || null,
      email: email || null,
      sendVia,
      status: "Sent",
      messageBody: body,
      idempotencyKey: idempotencyKey || null,
    });
  } catch (err) {
    if (err.name === "SequelizeUniqueConstraintError" && idempotencyKey) {
      const prior = await ReviewRequest.findOne({
        where: { clinicId, idempotencyKey },
      });
      if (prior) {
        return successResponse(res, {
          message: "Review request already sent (idempotent replay)",
          data: { request: prior, replayed: true },
        });
      }
    }
    console.error("sendRequest claim error:", err);
    return serverErrorResponse(res, "Could not send review request");
  }

  // Releasing the claim is what keeps a FAILED send retryable with the same
  // key. Without it the first failure would poison the key forever and every
  // retry would replay a request that never actually went out.
  const releaseClaim = async () => {
    try {
      await requestRow.destroy();
    } catch (e) {
      console.error("sendRequest claim release failed:", e.message);
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
        await releaseClaim();
        return quotaError(res, r);
      }
      creditReservations.push({ channel: "sms", amount: 1 });
    }
    if (needsWhatsApp) {
      const r = await reserveCredits({ clinicId, channel: "whatsapp" });
      if (!r.reserved) {
        await refundAll();
        await releaseClaim();
        return quotaError(res, r);
      }
      creditReservations.push({ channel: "whatsapp", amount: 1 });
    }
    if (needsEmail) {
      const r = await reserveUsage({ clinicId, metric: "email" });
      if (!r.reserved) {
        await refundAll();
        await releaseClaim();
        return usageErrorResponse(res, r);
      }
      usageReservations.push({ metric: "email", amount: 1 });
    }

    // ── 2. Send ──────────────────────────────────────────────────────────
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
      const emailResult = await sendReviewRequestEmail({
        to: email,
        patientName,
        clinicName: req.clinic.clinicName,
        reviewLink: req.clinic.googleReviewLink,
        body,
      });
      // For an email-only send, surface its provider/simulated in the response
      // (a "Both" send already reported the SMS provider above).
      if (!providerResult) providerResult = emailResult;
    }

    // ── 3. The row already exists — it was written in step 0 to claim the
    //      idempotency key before the send. Nothing left to persist.
    return successResponse(res, {
      message: "Review request sent",
      data: {
        request: requestRow,
        provider: providerResult?.provider,
        simulated: providerResult?.simulated || false,
      },
    });
  } catch (err) {
    // ── 4. Provider blew up → refund every reservation of both kinds, and
    //      release the idempotency claim so the caller can genuinely retry.
    await refundAll();
    await releaseClaim();
    console.error("sendRequest error:", err);
    return serverErrorResponse(res, "Could not send review request");
  }
};

// GET /api/v1/requests — send history, newest first.
// Returns a BARE ARRAY in `data`: the frontend hook does
// dispatch(addUserRequests(response.data.data)) and the reducer spreads it.
export const listRequests = async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

  const rows = await ReviewRequest.findAll({
    where: { clinicId: req.clinic.id }, // tenant scope
    order: [["createdAt", "DESC"]],
    limit,
    offset,
  });

  return successResponse(res, { message: "Requests fetched", data: rows });
};

// PATCH /api/v1/requests/:id/status — advance Sent → Opened → Reviewed.
// The clinicId in the WHERE clause is the tenant boundary: without it, any
// authenticated user could advance another clinic's request by guessing a UUID.
export const updateRequestStatus = async (req, res) => {
  const { status } = req.body; // Joi already validated the enum
  const { id } = req.params;

  const [updated] = await ReviewRequest.update(
    { status },
    { where: { id, clinicId: req.clinic.id } }
  );

  if (!updated) return notFoundResponse(res, "Request not found");

  return successResponse(res, {
    message: "Status updated",
    data: { id, status },
  });
};

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