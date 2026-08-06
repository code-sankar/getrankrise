// backend/src/controllers/account.controller.js
//
// Data export and account deletion — GDPR Articles 20 and 17.
//
// ── Why this existed as a promise before it existed as code ────────────────
// PrivacyPolicy.jsx has told every visitor since launch that they may "Request
// deletion of your account and all associated data" and export their data. No
// endpoint, no UI, no path to either. A published commitment the product could
// not honour is a worse position than not having offered it.
//
// ── The shape of deletion ──────────────────────────────────────────────────
// One endpoint, two behaviours, chosen by the caller's role in their clinic —
// because "delete my account" means genuinely different things to the two:
//
//   staff  → their user row and their membership. The clinic and everything in
//            it belongs to the owner and is untouched.
//   owner  → the entire clinic: every review, request, campaign, competitor,
//            connection and member account. There is no "orphan the clinic"
//            option, because loadClinic resolves the tenant through membership
//            and a clinic with no owner is one nobody can administer, bill, or
//            ever close.
//
// The UI states which one is about to happen before asking for confirmation.
//
// ── Order of operations is load-bearing ────────────────────────────────────
//   1. verify the password             — proves it is really them
//   2. cancel the Paddle subscription  — MUST be before any deletion
//   3. delete inside one transaction   — all of it, or none of it
//   4. revoke every session            — implicit: refresh_tokens CASCADEs
//
// Step 2 before step 3 is the one that matters. Deleting the subscriptions row
// first would destroy the gateway_subscription_id — the only pointer to the
// thing still charging their card — while the charging carried on against an
// account that no longer exists and cannot be logged into.

import { QueryTypes } from "sequelize";
import { sequelize } from "../config/db.js";
import { User } from "../models/index.js";
import { comparePassword } from "../utils/hash.js";
import { cancelSubscription } from "../services/billing/paddle.client.js";
import {
  buildClinicExport,
  exportFilename,
} from "../services/account/dataExport.service.js";
import { clearRefreshTokenCookie } from "../utils/jwt.js";
import { env } from "../config/env.js";
import {
  successResponse,
  badRequestResponse,
  notFoundResponse,
  serverErrorResponse,
} from "../utils/apiResponse.js";
import { reportError } from "../utils/observability.js";
import { auditFromReq, AUDIT_EVENTS } from "../utils/auditLog.js";

// ── GET /api/v1/account/export ───────────────────────────────────────────────
//
// Owner-only (enforced at the route). The export is the WHOLE clinic —
// including every member's email and every patient's phone number — so it is
// not a staff-level read.
//
// Served as a download rather than a JSON body: this is a file the user is
// meant to keep, and Content-Disposition is what makes a browser save it with a
// sensible name instead of rendering three megabytes of JSON in a tab.
export const exportAccountData = async (req, res) => {
  const doc = await buildClinicExport(req.clinic.id);
  if (!doc) return notFoundResponse(res, "No clinic data found for this account.");

  auditFromReq(req, AUDIT_EVENTS.SETTINGS_UPDATED, {
    metadata: { section: "account", action: "data_exported", counts: doc.export.counts },
  });

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${exportFilename(doc.clinic.clinicName)}"`
  );
  // Pretty-printed on purpose. This is a document a human may open to check
  // what we hold on them; minifying it to save bytes would be optimising the
  // wrong thing.
  return res.status(200).send(JSON.stringify(doc, null, 2));
};

// ── GET /api/v1/account/deletion-preview ─────────────────────────────────────
// What the confirmation dialog needs to state honestly: what is about to be
// destroyed, and whether a live subscription will be cancelled. A destructive
// confirmation that cannot name what it will destroy is a dialog people click
// through without reading.
export const previewDeletion = async (req, res) => {
  const isOwner = req.clinicRole === "owner";

  if (!isOwner) {
    return successResponse(res, {
      message: "Deletion preview",
      data: {
        scope: "member",
        clinicName: req.clinic.clinicName,
        // Their own account only. Nothing of the clinic's goes with them.
        willDelete: { yourAccount: true },
        subscription: null,
      },
    });
  }

  const [counts] = await sequelize.query(
    `SELECT
       (SELECT COUNT(*)::int FROM reviews              WHERE clinic_id = $1::uuid) AS reviews,
       (SELECT COUNT(*)::int FROM requests             WHERE clinic_id = $1::uuid) AS "reviewRequests",
       (SELECT COUNT(*)::int FROM campaigns            WHERE clinic_id = $1::uuid) AS campaigns,
       (SELECT COUNT(*)::int FROM competitors          WHERE clinic_id = $1::uuid) AS competitors,
       (SELECT COUNT(*)::int FROM platform_connections WHERE clinic_id = $1::uuid) AS "connectedPlatforms",
       (SELECT COUNT(*)::int FROM clinic_members       WHERE clinic_id = $1::uuid) AS members`,
    { bind: [req.clinic.id], type: QueryTypes.SELECT }
  );

  const [sub] = await sequelize.query(
    `SELECT plan_type AS "plan", subscription_status AS "status",
            gateway_subscription_id AS "gatewaySubscriptionId",
            current_period_end AS "currentPeriodEnd"
       FROM subscriptions WHERE clinic_id = $1::uuid`,
    { bind: [req.clinic.id], type: QueryTypes.SELECT }
  );

  const willCancelBilling = Boolean(
    sub?.gatewaySubscriptionId && ["active", "trialing", "past_due", "paused"].includes(sub.status)
  );

  return successResponse(res, {
    message: "Deletion preview",
    data: {
      scope: "clinic",
      clinicName: req.clinic.clinicName,
      willDelete: counts,
      subscription: sub
        ? {
            plan: sub.plan,
            status: sub.status,
            willCancelImmediately: willCancelBilling,
            currentPeriodEnd: sub.currentPeriodEnd,
          }
        : null,
    },
  });
};

// ── DELETE /api/v1/account ───────────────────────────────────────────────────
export const deleteAccount = async (req, res) => {
  const { password, confirm } = req.body;
  const isOwner = req.clinicRole === "owner";

  // ── 1. Prove it is them ────────────────────────────────────────────────
  // A valid access token is not enough for something irreversible. An unlocked
  // laptop at a front desk is the exact situation this guards.
  const user = await User.scope("withPassword").findByPk(req.user.id);
  if (!user) return notFoundResponse(res, "Account not found.");

  const passwordOk = await comparePassword(password, user.password);
  if (!passwordOk) {
    return badRequestResponse(res, "That password is incorrect.");
  }

  // ── 2. Prove they mean it ──────────────────────────────────────────────
  // Typing the clinic name is the standard second gate for a destructive
  // action, and it is the one that stops muscle-memory. Case-insensitive and
  // trimmed, because this is a confirmation of intent, not a spelling test.
  const expected = isOwner ? req.clinic.clinicName : "DELETE";
  if (String(confirm || "").trim().toLowerCase() !== String(expected).trim().toLowerCase()) {
    return badRequestResponse(
      res,
      isOwner
        ? `Type the clinic name exactly — "${req.clinic.clinicName}" — to confirm.`
        : 'Type "DELETE" to confirm.'
    );
  }

  // ── A member leaving: their account only ───────────────────────────────
  if (!isOwner) {
    await sequelize.transaction(async (transaction) => {
      // clinic_members, refresh_tokens, auth_tokens and notifications all
      // reference users(id) ON DELETE CASCADE, so this one statement takes
      // the membership and every session with it.
      await sequelize.query(`DELETE FROM users WHERE id = $1::uuid`, {
        bind: [req.user.id],
        type: QueryTypes.DELETE,
        transaction,
      });
    });

    console.warn(
      `[account] member deleted their account — clinic ${req.clinic.id}, user ${req.user.id}`
    );
    clearRefreshTokenCookie(res);
    return successResponse(res, {
      message: "Your account has been deleted.",
      data: { scope: "member" },
    });
  }

  // ── An owner closing the clinic ────────────────────────────────────────

  // 3. Stop the billing FIRST. See the header for why this cannot come after.
  const [sub] = await sequelize.query(
    `SELECT gateway_subscription_id AS "gatewaySubscriptionId",
            subscription_status AS "status"
       FROM subscriptions WHERE clinic_id = $1::uuid`,
    { bind: [req.clinic.id], type: QueryTypes.SELECT }
  );

  const needsCancel =
    sub?.gatewaySubscriptionId &&
    ["active", "trialing", "past_due", "paused"].includes(sub.status) &&
    env.FEATURES.paddle;

  if (needsCancel) {
    try {
      await cancelSubscription(sub.gatewaySubscriptionId);
    } catch (err) {
      // REFUSE to delete. This is the one failure here that must not be
      // swallowed: proceeding would destroy the only record of who is being
      // charged while Paddle carries on charging them. Better a failed
      // deletion the user can retry than a deleted account with a live
      // subscription nobody can find.
      reportError(err, {
        source: "account-deletion",
        extra: { clinicId: req.clinic.id, stage: "cancel_subscription" },
      });
      return res.status(502).json({
        success: false,
        code: "BILLING_CANCEL_FAILED",
        message:
          "We couldn't cancel your subscription with our payment provider, so " +
          "we've stopped before deleting anything. Please try again in a few " +
          "minutes, or contact support — we won't delete your data while a " +
          "payment method is still attached.",
      });
    }
  }

  // 4. Everything, atomically.
  const memberIds = await sequelize.query(
    `SELECT user_id FROM clinic_members WHERE clinic_id = $1::uuid`,
    { bind: [req.clinic.id], type: QueryTypes.SELECT }
  );

  try {
    await sequelize.transaction(async (transaction) => {
      // Deleting the clinic cascades to reviews, requests, campaigns,
      // campaign_recipients, competitors (and their snapshots),
      // platform_connections, subscriptions, usage_counters, opt_outs,
      // clinic_members and clinic_invitations — every one of those FKs is
      // ON DELETE CASCADE. Verified against the live schema, not assumed.
      await sequelize.query(`DELETE FROM clinics WHERE id = $1::uuid`, {
        bind: [req.clinic.id],
        type: QueryTypes.DELETE,
        transaction,
      });

      // The member accounts themselves. These are not cascaded by the clinic
      // delete — users is the PARENT of clinic_members, not its child — so they
      // are removed explicitly. Their sessions, notifications and auth tokens
      // go with them via users' own cascades.
      if (memberIds.length > 0) {
        await sequelize.query(
          `DELETE FROM users WHERE id = ANY($1::uuid[])`,
          {
            bind: [memberIds.map((m) => m.user_id)],
            type: QueryTypes.DELETE,
            transaction,
          }
        );
      }
    });
  } catch (err) {
    reportError(err, {
      source: "account-deletion",
      extra: { clinicId: req.clinic.id, stage: "delete" },
    });
    // The subscription is already cancelled at this point and the data is not
    // deleted. Say so plainly — that is a state support needs to know about.
    return serverErrorResponse(
      res,
      "Your subscription was cancelled but the deletion did not complete. " +
        "Please contact support so we can finish it."
    );
  }

  // Deliberately console.warn rather than the audit log: auditFromReq writes
  // against a request whose clinic no longer exists, and this line is the last
  // trace of an account that is now unrecoverable. It belongs in the log
  // regardless of what any table says.
  console.warn(
    `[account] CLINIC DELETED — id=${req.clinic.id} name="${req.clinic.clinicName}" ` +
      `members=${memberIds.length} billingCancelled=${Boolean(needsCancel)}`
  );

  clearRefreshTokenCookie(res);
  return successResponse(res, {
    message: `${req.clinic.clinicName} and all of its data have been permanently deleted.`,
    data: { scope: "clinic", membersRemoved: memberIds.length, billingCancelled: Boolean(needsCancel) },
  });
};
