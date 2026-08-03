// backend/src/services/notifications/reviewAlerts.service.js
//
// Creates the "New 1-star review from Linda Park" alert — for real, this time.
//
// ── WHAT THIS REPLACES ──────────────────────────────────────────────────────
// That exact sentence has been sitting in frontend/src/store/notificationsSlice
// as hardcoded seed data since the first UI pass. It was the product's headline
// promise ("know the moment an angry review lands") rendered as a static
// string, next to three other invented notifications, on every account, for
// every user, forever. Nothing in the backend had ever written a notifications
// row. This module is the write path that copy was always describing.
//
// ── WHY IT LIVES OUTSIDE reviewSync.service.js ──────────────────────────────
// The sync service's job is ingestion correctness: pagination, the upsert merge
// rules, the free-tier trim. Alerting is a policy decision layered on top of
// ingestion (who gets told, about what, how often, and when NOT to), and it
// will grow — email alerts, weekly digests, the newReviewAlert pref. Keeping it
// here means the next alert type doesn't push more branching into the hot loop.
//
// ── FAILURE POSTURE: NEVER THROW ────────────────────────────────────────────
// This is called at the end of a sync that has already committed real review
// rows. A notification failure must not turn a successful ingestion into a
// failed one — the scheduler would record last_sync_error and (claim-by-
// stamping) not retry for a full plan interval, meaning a bad notification
// insert would cost the clinic an entire sync cycle of real data. Everything
// below is wrapped and logged; the caller gets a count and moves on.
//
// ── THE FOUR GUARDS, AND WHY EACH EXISTS ────────────────────────────────────
//   1. BACKFILL SUPPRESSION. The first sync of a platform ingests the clinic's
//      entire review history at once. A clinic with eleven historical 1-star
//      reviews would receive eleven "new review" alerts on connect — all of
//      them years old, none of them news, and the bell would open onto a wall
//      of noise on the single most important first-run screen in the product.
//      Detected by counting existing rows for THAT platform, not by reading
//      last_synced_at: the scheduler stamps last_synced_at BEFORE it calls the
//      sync (claim-by-stamping — see syncScheduler.service.js), so on a
//      scheduler-driven first sync the timestamp is already set and would say
//      "not a first sync" for the very backfill this guard exists to catch.
//   2. PREFERENCE. clinics.notification_prefs.urgentAlerts, default true. An
//      absent key means true (the Clinic model's default), so only an explicit
//      false silences alerts.
//   3. DEDUPE on review_id. Belt-and-braces: we only pass rows the upsert
//      reported as genuinely INSERTED (xmax = 0), so a re-sync can't re-alert.
//      This catches the other paths — a manual row delete + re-sync, a restored
//      database snapshot.
//   4. PER-SYNC CAP. Ten alerts, then one summary line. A clinic that gets
//      forty bad reviews between two syncs has a crisis, not a notification
//      list, and forty rows would bury every other alert they have.

import { Op } from "sequelize";
import { Clinic, Notification } from "../../models/index.js";

/** Ratings at or below this are "urgent". 1★ and 2★. */
export const LOW_RATING_THRESHOLD = 2;

/** Individual alerts per sync before collapsing the rest into a summary. */
const MAX_ALERTS_PER_SYNC = 10;

/** Notification.message is STRING(300); reviewer names get their own budget. */
const MAX_NAME_LENGTH = 80;

/**
 * @param {Object}  p
 * @param {string}  p.clinicId
 * @param {Array<{id: string, rating: number, reviewerName: string}>} p.candidates
 *        Reviews the upsert reported as newly INSERTED with rating <= threshold.
 * @param {boolean} p.isBackfill  true when this platform had zero stored reviews
 *                                before this sync (guard 1).
 * @returns {Promise<{created: number, skipped?: string}>} never rejects
 */
export async function notifyLowRatingReviews({
  clinicId,
  candidates = [],
  isBackfill = false,
}) {
  try {
    if (candidates.length === 0) return { created: 0, skipped: "no_candidates" };

    // Guard 1 — backfill.
    if (isBackfill) {
      console.log(
        `[reviewAlerts] clinic ${clinicId.slice(0, 8)}…: suppressed ${candidates.length} ` +
          `alert(s) — first sync for this platform is a history backfill, not news.`
      );
      return { created: 0, skipped: "backfill" };
    }

    // Notifications belong to a USER, reviews belong to a CLINIC. One hop.
    const clinic = await Clinic.findByPk(clinicId, {
      attributes: ["id", "userId", "notificationPrefs"],
    });
    if (!clinic) return { created: 0, skipped: "clinic_not_found" };

    // Guard 2 — preference. Only an explicit false silences.
    const prefs = clinic.notificationPrefs || {};
    if (prefs.urgentAlerts === false) return { created: 0, skipped: "prefs_off" };

    // Guard 3 — dedupe on review_id.
    const ids = candidates.map((c) => c.id).filter(Boolean);
    if (ids.length === 0) return { created: 0, skipped: "no_review_ids" };

    const already = await Notification.findAll({
      where: { userId: clinic.userId, reviewId: { [Op.in]: ids } },
      attributes: ["reviewId"],
    });
    const seen = new Set(already.map((n) => n.reviewId));
    const fresh = candidates.filter((c) => c.id && !seen.has(c.id));
    if (fresh.length === 0) return { created: 0, skipped: "already_notified" };

    // Worst first — if the cap truncates, the 1-stars survive into the list
    // and the 2-stars roll into the summary, not the other way round.
    fresh.sort((a, b) => a.rating - b.rating);

    // Guard 4 — cap.
    const head = fresh.slice(0, MAX_ALERTS_PER_SYNC);
    const overflow = fresh.length - head.length;

    const rows = head.map((c) => ({
      userId: clinic.userId,
      type: "urgent",
      reviewId: c.id,
      message: `New ${c.rating}-star review from ${String(
        c.reviewerName || "Anonymous"
      ).slice(0, MAX_NAME_LENGTH)}`,
    }));

    if (overflow > 0) {
      rows.push({
        userId: clinic.userId,
        type: "urgent",
        reviewId: null, // a summary points at no single review
        message: `And ${overflow} more review${overflow === 1 ? "" : "s"} at ${LOW_RATING_THRESHOLD} stars or below arrived in this sync.`,
      });
    }

    await Notification.bulkCreate(rows);

    console.log(
      `[reviewAlerts] clinic ${clinicId.slice(0, 8)}…: created ${rows.length} urgent alert(s)` +
        (overflow > 0 ? ` (${overflow} collapsed into a summary)` : "")
    );
    return { created: rows.length };
  } catch (err) {
    // See the failure-posture note at the top: a broken alert must never cost
    // the clinic a sync interval of real review data.
    console.error(
      `[reviewAlerts] failed for clinic ${clinicId}: ${err.message} ` +
        "(reviews were ingested successfully; only alerting failed)"
    );
    return { created: 0, skipped: "error" };
  }
}