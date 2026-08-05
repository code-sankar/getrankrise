// backend/src/middleware/requireVerifiedEmail.middleware.js
//
// Blocks outbound sending until the account's email address has been confirmed.
//
// ── Why sending, specifically ───────────────────────────────────────────────
// Verification is not gating the app — a new signup can connect platforms, sync
// reviews, read analytics and reply, all before confirming. It gates the one
// class of action that costs real money and reaches third parties: SMS,
// WhatsApp and review-request email to patients.
//
// That is where an unverified account is actually dangerous. Someone who signs
// up with an address they do not control is either a typo (in which case every
// urgent-review alert and billing notice they will ever get lands nowhere) or
// deliberate (in which case they are using a throwaway identity to send
// messages to strangers on our sending reputation). Confirming an inbox is the
// cheapest available answer to both.
//
// ── Why it passes through when email is not configured ──────────────────────
// The load-bearing detail. If SENDGRID_API_KEY is absent, no verification link
// can ever be delivered — so enforcing this would create an account state with
// no exit: unverified, unable to send, and unable to become verified. Demanding
// that someone complete a step over a channel we do not have is not a security
// control, it is a lockout.
//
// So enforcement is conditional on our ability to ask. isEmailConfigured() is
// the same predicate request.controller.js already uses to decide whether the
// Email channel exists at all, so the two agree by construction.
//
// ── Existing accounts ───────────────────────────────────────────────────────
// Migration 0016 backfills email_verified_at = NOW() for every user that
// existed when it ran. Shipping this against a live database without that
// backfill would have locked every current customer out of the feature they
// are paying for, over a checkbox that did not exist yesterday.

import { isEmailConfigured } from "../services/email/email.service.js";

/**
 * Must run after `protect` — depends on req.user.
 *
 * Responds with the same 403-plus-`code` shape the rest of the API uses, so the
 * frontend interceptor can pattern-match it. The code is deliberately NOT
 * UPGRADE_REQUIRED: this is not a plan gap and must not open the upgrade modal.
 */
export const requireVerifiedEmail = (req, res, next) => {
  if (req.user?.emailVerifiedAt) return next();

  // Nothing to verify with — see the header. Warn once per request rather than
  // failing, so a deploy without SendGrid is loud in the logs but not broken.
  if (!isEmailConfigured()) {
    console.warn(
      "[auth] requireVerifiedEmail skipped — email is not configured, so no " +
        "verification link can be delivered. Set SENDGRID_API_KEY + " +
        "SENDGRID_FROM_EMAIL to turn this check on."
    );
    return next();
  }

  // Written directly rather than through forbiddenResponse() because this
  // response carries `code` and `email`, which that helper's fixed
  // { success, message } shape has no room for.
  return res.status(403).json({
    success: false,
    code: "EMAIL_NOT_VERIFIED",
    message:
      "Please confirm your email address before sending messages. " +
      "Check your inbox for the confirmation link, or request a new one from Settings → Account.",
    email: req.user?.email ?? null,
  });
};
