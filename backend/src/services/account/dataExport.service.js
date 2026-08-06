// backend/src/services/account/dataExport.service.js
//
// Everything a clinic owns, in one document. GDPR Article 20 (portability)
// requires a "structured, commonly used and machine-readable format"; this
// produces JSON, which is all three.
//
// ── Why JSON rather than the CSV the old policy text mentioned ─────────────
// The data is not one table. It is eleven related tables — reviews with
// replies, campaigns with per-recipient outcomes, competitors with dated
// snapshots. Flattening that into CSV either loses the relationships or
// produces eleven files that need a container format to travel together. One
// JSON document keeps the shape intact and opens in anything.
//
// (The per-report analytics CSV is a different feature and stays: that one IS
// one table, and it exists to be pasted into a spreadsheet.)
//
// ── What is deliberately NOT in here ───────────────────────────────────────
//   password hashes         — not the user's data in any useful sense, and
//                             exporting them is a credential-leak vector
//   token_hash columns      — same, for refresh tokens, reset tokens, invites
//   access_token_enc /      — the clinic's OAuth grants for Google/Facebook.
//   refresh_token_enc         Encrypted at rest, and handing someone a copy of
//                             a live third-party credential in a downloadable
//                             file is strictly worse than not.
//   webhook_events          — Paddle's raw payloads. Operational plumbing, not
//                             clinic data.
//
// Everything the clinic actually created or received IS here.

import { QueryTypes } from "sequelize";
import { sequelize } from "../../config/db.js";

/** One query, shaped for the export. Keeps the assembly below readable. */
const q = (sql, bind) => sequelize.query(sql, { bind, type: QueryTypes.SELECT });

/**
 * Builds the complete export for a clinic.
 *
 * Deliberately NOT streamed. The largest realistic clinic has a few thousand
 * reviews and a few thousand campaign recipients — comfortably a few megabytes
 * of JSON — and a streamed implementation would add real complexity to a path
 * that runs at most a handful of times per account, ever. If a clinic ever
 * grows past that, this is the place to revisit.
 *
 * @param {string} clinicId
 * @returns {Promise<object>} the export document
 */
export async function buildClinicExport(clinicId) {
  const [clinic] = await q(
    `SELECT id, clinic_name AS "clinicName", owner_name AS "ownerName",
            phone, alert_email AS "alertEmail", location,
            country_code AS "countryCode",
            google_business_url AS "googleBusinessUrl",
            google_review_link  AS "googleReviewLink",
            notification_prefs  AS "notificationPrefs",
            plan, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM clinics WHERE id = $1::uuid`,
    [clinicId]
  );

  if (!clinic) return null;

  const [
    members,
    reviews,
    requests,
    campaigns,
    campaignRecipients,
    competitors,
    competitorSnapshots,
    platformConnections,
    subscription,
    usageCounters,
    optOuts,
    notifications,
  ] = await Promise.all([
    q(
      `SELECT u.name, u.email, m.role, m.created_at AS "joinedAt",
              (u.email_verified_at IS NOT NULL) AS "emailVerified"
         FROM clinic_members m JOIN users u ON u.id = m.user_id
        WHERE m.clinic_id = $1::uuid ORDER BY m.created_at`,
      [clinicId]
    ),
    q(
      `SELECT platform, external_id AS "externalId", reviewer_name AS "reviewerName",
              rating, review_text AS "reviewText", review_date AS "reviewDate",
              replied, reply_text AS "replyText",
              reply_published_at AS "replyPublishedAt", sentiment,
              created_at AS "createdAt"
         FROM reviews WHERE clinic_id = $1::uuid
        ORDER BY COALESCE(review_date, created_at) DESC`,
      [clinicId]
    ),
    q(
      `SELECT patient_name AS "patientName", phone, email, send_via AS "sendVia",
              status, message_body AS "messageBody", send_error AS "sendError",
              created_at AS "createdAt", updated_at AS "updatedAt"
         FROM requests WHERE clinic_id = $1::uuid ORDER BY created_at DESC`,
      [clinicId]
    ),
    q(
      `SELECT id, name, channel, status, message_template AS "messageTemplate",
              throttle_per_minute AS "throttlePerMinute",
              sent_count AS "sentCount", failed_count AS "failedCount",
              skipped_count AS "skippedCount", last_error AS "lastError",
              scheduled_at AS "scheduledAt", started_at AS "startedAt",
              completed_at AS "completedAt", created_at AS "createdAt"
         FROM campaigns WHERE clinic_id = $1::uuid ORDER BY created_at DESC`,
      [clinicId]
    ),
    q(
      `SELECT campaign_id AS "campaignId", name, phone, status, error,
              attempts, sent_at AS "sentAt", created_at AS "createdAt"
         FROM campaign_recipients WHERE clinic_id = $1::uuid
        ORDER BY created_at`,
      [clinicId]
    ),
    q(
      `SELECT id, name, platform, external_id AS "externalId",
              profile_url AS "profileUrl", location, is_active AS "isActive",
              sync_status AS "syncStatus", last_synced_at AS "lastSyncedAt",
              created_at AS "createdAt"
         FROM competitors WHERE clinic_id = $1::uuid ORDER BY created_at`,
      [clinicId]
    ),
    q(
      `SELECT s.competitor_id AS "competitorId", s.rating,
              s.total_reviews  AS "totalReviews",
              s.new_reviews    AS "newReviews",
              s.rating_delta   AS "ratingDelta",
              s.response_rate  AS "responseRate",
              s.sentiment,
              s.captured_at    AS "capturedAt"
         FROM competitor_snapshots s
         JOIN competitors c ON c.id = s.competitor_id
        WHERE c.clinic_id = $1::uuid
        ORDER BY s.captured_at DESC`,
      [clinicId]
    ),
    // Metadata only. The encrypted token columns are deliberately absent —
    // see the header.
    q(
      `SELECT platform, status,
              external_account_id  AS "externalAccountId",
              external_location_id AS "externalLocationId",
              last_synced_at AS "lastSyncedAt",
              last_sync_error AS "lastSyncError",
              created_at AS "createdAt"
         FROM platform_connections WHERE clinic_id = $1::uuid ORDER BY platform`,
      [clinicId]
    ),
    q(
      `SELECT plan_type AS "planType", subscription_status AS "status",
              current_period_start AS "currentPeriodStart",
              current_period_end   AS "currentPeriodEnd",
              sms_credits_used     AS "smsCreditsUsed",
              whatsapp_credits_used AS "whatsappCreditsUsed",
              credits_reset_at AS "creditsResetAt",
              canceled_at AS "canceledAt"
         FROM subscriptions WHERE clinic_id = $1::uuid`,
      [clinicId]
    ),
    q(
      `SELECT metric, period_start AS "periodStart", used
         FROM usage_counters WHERE clinic_id = $1::uuid
        ORDER BY period_start DESC, metric`,
      [clinicId]
    ),
    q(
      `SELECT phone, channel, source, created_at AS "createdAt"
         FROM opt_outs WHERE clinic_id = $1::uuid ORDER BY created_at DESC`,
      [clinicId]
    ),
    // User-scoped, but every member of this clinic is being exported, so their
    // notifications belong in the clinic's export too.
    q(
      `SELECT n.type, n.message, n.read, n.created_at AS "createdAt", u.email AS "forUser"
         FROM notifications n
         JOIN clinic_members m ON m.user_id = n.user_id
         JOIN users u          ON u.id = n.user_id
        WHERE m.clinic_id = $1::uuid
        ORDER BY n.created_at DESC`,
      [clinicId]
    ),
  ]);

  return {
    // A self-describing envelope, so the file is intelligible a year later to
    // someone who has never seen this product.
    export: {
      generatedAt: new Date().toISOString(),
      format: "getrankrise.clinic-export",
      formatVersion: 1,
      about:
        "A complete copy of the data GetRankRise holds for this clinic. " +
        "Password hashes, session tokens and encrypted third-party OAuth " +
        "credentials are deliberately excluded — they are not portable data " +
        "and exporting them would be a security risk.",
      counts: {
        members: members.length,
        reviews: reviews.length,
        reviewRequests: requests.length,
        campaigns: campaigns.length,
        campaignRecipients: campaignRecipients.length,
        competitors: competitors.length,
        competitorSnapshots: competitorSnapshots.length,
        platformConnections: platformConnections.length,
        usageCounters: usageCounters.length,
        optOuts: optOuts.length,
        notifications: notifications.length,
      },
    },
    clinic,
    members,
    subscription: subscription[0] ?? null,
    usageCounters,
    platformConnections,
    reviews,
    reviewRequests: requests,
    campaigns,
    campaignRecipients,
    competitors,
    competitorSnapshots,
    optOuts,
    notifications,
  };
}

/** A filesystem-safe filename for the download. */
export function exportFilename(clinicName) {
  const slug = String(clinicName || "clinic")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "clinic";
  return `getrankrise-${slug}-${new Date().toISOString().slice(0, 10)}.json`;
}
