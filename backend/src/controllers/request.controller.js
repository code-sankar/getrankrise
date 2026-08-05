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

  // ── Nothing to point the patient AT ───────────────────────────────────
  // renderMessage interpolates googleReviewLink and falls back to an em-dash,
  // so an unset link produced "…we'd love your feedback: —" — a real SMS, sent
  // to a real patient, charged to the clinic's credits, asking them to leave a
  // review with no way to leave one. The Onboarding wizard is the only place
  // this field gets set and it is skippable, so a brand-new clinic hits this
  // by default.
  //
  // Refused BEFORE any reservation, for the same reason the email check below
  // is: a send that cannot achieve anything must not cost anything.
  if (!req.clinic.googleReviewLink) {
    return res.status(409).json({
      success: false,
      code: "NO_REVIEW_LINK",
      message:
        "Add your Google review link before sending requests — without it, " +
        "patients get a message with nothing to click. You can set it in " +
        "Settings → Business Profile.",
    });
  }

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

  // Refunds everything still outstanding. The `refunded` flag matters because
  // the per-channel send blocks below already hand back the reservation for a
  // channel that failed; without it, a later throw would refund that same
  // channel twice and credit the clinic for a send it never made.
  const refundAll = async () => {
    for (const r of creditReservations) {
      if (r.refunded) continue;
      await refundCredits({ clinicId, channel: r.channel, amount: r.amount });
      r.refunded = true;
    }
    for (const r of usageReservations) {
      if (r.refunded) continue;
      await refundUsage({ clinicId, metric: r.metric, amount: r.amount });
      r.refunded = true;
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

    // ── 2. Send — EACH CHANNEL SETTLES INDEPENDENTLY ─────────────────────
    //
    // A "Both" send is two unrelated providers (Twilio/MSG91, then SendGrid)
    // that fail independently. Wrapping the pair in one try/catch made them
    // look atomic, and the catch below then refunded EVERY reservation and
    // destroyed the request row. When the SMS had already gone out and only
    // the email threw, that produced:
    //
    //   * the patient holding a text the carrier had already charged us for
    //   * the SMS credit handed back, as though nothing was sent
    //   * the row deleted, releasing the idempotency claim
    //   * a 500 to the caller, who would reasonably retry
    //   * the retry finding no prior row and TEXTING THE PATIENT AGAIN
    //
    // An SMS cannot be un-sent, so a delivered channel must never be rolled
    // back. Each block below therefore catches its own failure and records it,
    // and only genuinely-unsent channels are refunded.
    const failures = [];
    let providerResult = null;

    const smsChannel = needsSms ? "SMS" : needsWhatsApp ? "WhatsApp" : null;
    if (smsChannel) {
      try {
        providerResult = await sendMessage({
          channel: smsChannel,
          to: phone,
          body,
          countryCode: req.clinic.countryCode,
          idempotencyKey,
        });
      } catch (err) {
        // Nothing left the building on this channel — give the credit back.
        const reservation = creditReservations.find(
          (r) => r.channel === (needsWhatsApp ? "whatsapp" : "sms")
        );
        if (reservation) {
          await refundCredits({ clinicId, channel: reservation.channel, amount: reservation.amount });
          reservation.refunded = true;
        }
        failures.push({ channel: smsChannel, message: err.message });
      }
    }

    if (needsEmail) {
      try {
        const emailResult = await sendReviewRequestEmail({
          to: email,
          patientName,
          clinicName: req.clinic.clinicName,
          reviewLink: req.clinic.googleReviewLink,
          body,
        });
        // For an email-only send, surface its provider/simulated in the
        // response (a "Both" send already reported the SMS provider above).
        if (!providerResult) providerResult = emailResult;
      } catch (err) {
        const reservation = usageReservations.find((r) => r.metric === "email");
        if (reservation) {
          await refundUsage({ clinicId, metric: "email", amount: reservation.amount });
          reservation.refunded = true;
        }
        failures.push({ channel: "Email", message: err.message });
      }
    }

    const requestedChannels = [smsChannel, needsEmail ? "Email" : null].filter(Boolean);
    const delivered = requestedChannels.filter(
      (c) => !failures.some((f) => f.channel === c)
    );

    // ── 3a. Nothing got through → this is a clean failure. Release the
    //        idempotency claim so an honest retry is possible. (Reservations
    //        were already refunded per-channel above.)
    if (delivered.length === 0) {
      await releaseClaim();
      console.error(
        "sendRequest: all channels failed:",
        failures.map((f) => `${f.channel}: ${f.message}`).join(" | ")
      );
      return serverErrorResponse(res, "Could not send review request");
    }

    // ── 3b. Something got through. The row STAYS — deleting it would release
    //        the idempotency key and let a retry re-send to a patient who has
    //        already been contacted. Record the half that failed so the send
    //        history shows a partial rather than a clean success.
    const sendError = failures.length
      ? failures.map((f) => `${f.channel}: ${f.message}`).join(" | ").slice(0, 1000)
      : null;

    if (sendError) {
      await requestRow.update({ sendError });
    }

    return successResponse(res, {
      message: failures.length
        ? `Review request sent by ${delivered.join(" and ")}, but ${failures
            .map((f) => f.channel)
            .join(" and ")} failed.`
        : "Review request sent",
      data: {
        request: requestRow,
        provider: providerResult?.provider,
        simulated: providerResult?.simulated || false,
        delivered,
        failed: failures.map((f) => f.channel),
        partial: failures.length > 0,
      },
    });
  } catch (err) {
    // ── 4. Something outside the per-channel sends blew up (rendering, a DB
    //       write, a reservation lookup). Nothing is known to have been
    //       delivered here, so refund whatever is still outstanding and
    //       release the claim. refundAll skips channels already refunded above.
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

// Exported for the regression test in tests/quotaError.test.js. Every branch
// below corresponds to one `reason` reserveCredits can return, and the test
// asserts each one against the literal object that function produces — the
// SUBSCRIPTION_INACTIVE branch existed nowhere and threw, which is exactly the
// class of gap a shape test catches and a reading does not.
export const quotaError = (res, r) => {
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

  // ── SUBSCRIPTION_INACTIVE is not a quota problem ────────────────────────
  // reserveCredits returns this branch with { currentPlan, subscriptionStatus }
  // and NO `channel` (see credits.service.js — the status check runs after the
  // limit check, so it has no channel context to report). The QUOTA_EXCEEDED
  // fall-through below therefore evaluated `r.channel.toUpperCase()` on
  // undefined and threw a TypeError, which sendRequest's outer catch converted
  // into a generic 500.
  //
  // The customers who hit it are the ones who have PAID: a Free clinic is
  // caught earlier by `limit === 0` → PLAN_DOES_NOT_INCLUDE_CHANNEL, so only a
  // paid plan whose subscription went past_due or paused reached here. They
  // clicked Send, saw "Server error. Please try again later.", and were never
  // told their card needs attention — the one message that would have let them
  // fix it. The axios interceptor already routes this code to the billing
  // modal; it was never given the chance.
  if (r.reason === "SUBSCRIPTION_INACTIVE") {
    return res.status(403).json({
      success: false,
      code: "SUBSCRIPTION_INACTIVE",
      message: `Your subscription is ${r.subscriptionStatus}. Please update your payment method to continue.`,
      currentPlan: r.currentPlan,
      subscriptionStatus: r.subscriptionStatus,
      requiredPlans: ["starter", "premium"],
    });
  }

  const isPlanGap = r.reason === "PLAN_DOES_NOT_INCLUDE_CHANNEL";
  // Defence in depth for any future reason that also arrives without a channel:
  // a wrong-but-readable word in the message beats a 500.
  const channelLabel = String(r.channel ?? "message").toUpperCase();
  return res.status(403).json({
    success: false,
    code: isPlanGap ? "UPGRADE_REQUIRED" : "QUOTA_EXCEEDED",
    message: isPlanGap
      ? `Your ${r.currentPlan} plan doesn't include ${channelLabel} sends. Upgrade to keep going.`
      : `You've used all ${r.limit} ${channelLabel} credits this period. Upgrade or wait until your next billing cycle.`,
    currentPlan: r.currentPlan,
    requiredPlans: isPlanGap ? ["starter", "premium"] : ["premium"],
    channel: r.channel,
    limit: r.limit,
    used: r.used,
  });
};