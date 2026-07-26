// backend/src/services/reviews/reviewSync.service.js
//
// ═══════════ PHASE 2: THE SEAM IS NOW REAL — isImplemented = true ═══════════
//
// This file replaces the Phase 7 stub. The moment this deploys, the sync
// scheduler begins claiming connected platform_connections and auto-syncing
// reviews on each plan's syncIntervalHours (Starter 24h / Premium 1h).
// Dashboard (Phase 3), analytics (Phase 4), and competitor self-metrics all
// populate from the rows written here. ⚠ Check REVIEWS_MOCK before deploying
// to production — the mock provider fails loudly in prod, by design.
//
// PIPELINE per connection:
//   getValidAccessToken (Phase 1: auto-refresh, revocation detection)
//     → provider.fetchReviewsPage (GBP v4, orderBy=updateTime desc, paginated)
//       → per review: UPSERT onto uniq_reviews_clinic_platform_external
//         (migration 0003 partial unique index) with merge rules below
//     → free-tier trim to storedReviewsLimit newest
//
// MERGE RULES (each one live-tested against PostgreSQL 16 before shipping):
//   * idempotent — resyncing identical pages creates zero rows
//   * rating edits recompute sentiment; unchanged ratings NEVER clobber a
//     stored sentiment (protects future AI-scored values — the 0005 rule)
//   * replied is STICKY-TRUE — a reply made in our UI isn't on Google until
//     Phase 8 publishes it, so Google's "no reply" must not un-reply a row
//   * Google-side replies import (reply_text COALESCEs in)
//
// INCREMENTAL EARLY-STOP: pages arrive newest-updated first; once a page's
// oldest updateTime predates last_synced_at minus a 24h safety buffer,
// deeper pages can't contain anything new — stop. First sync (no
// last_synced_at) walks everything up to MAX_PAGES.
//
// WHO CALLS THIS:
//   * syncScheduler (Phase 7) — does NOT consume the review_sync meter; the
//     plan's interval IS its cap. Stamps last_synced_at / last_sync_error.
//   * the manual endpoint (reviewSync.controller.js) — DOES reserve
//     reserveUsage({ metric:"review_sync" }) (Phase 5 daily budget) and
//     stamps last_synced_at itself so the scheduler's clock resets too.

import { QueryTypes } from "sequelize";
import { sequelize } from "../../config/db.js";
import { PlatformConnection } from "../../models/index.js";
import { getValidAccessToken } from "../google/googleAuth.service.js";
import { computeSentiment } from "../../utils/sentiment.js";
import { getSubscriptionState } from "../subscription/subscriptionState.service.js";
import { env } from "../../config/env.js";
import * as googleProvider from "./providers/googleReviews.provider.js";
import * as mockProvider from "./providers/mockReviews.provider.js";

export const isImplemented = true; // ← the Phase 7 flag, flipped

const MAX_PAGES = 40; // 40 × 50 = 2000 reviews per sync — plenty, bounded
const EARLY_STOP_BUFFER_MS = 24 * 3600e3;

// ── Provider factory (mirrors the competitor-intelligence factory) ──────────
function getProvider() {
  const mock =
    String(process.env.REVIEWS_MOCK ?? env.GOOGLE_MOCK_DISCOVERY ?? "").toLowerCase() === "true";
  return mock ? mockProvider : googleProvider;
}

// ── The tested upsert ────────────────────────────────────────────────────────
const UPSERT_SQL = `
INSERT INTO reviews (clinic_id, platform, external_id, reviewer_name, rating,
                     review_text, review_date, replied, reply_text, sentiment,
                     created_at, updated_at)
VALUES ($1::uuid, 'Google', $2::text, $3::text, $4::int, $5::text,
        $6::timestamptz, $7::bool, $8::text, $9::int, NOW(), NOW())
ON CONFLICT (clinic_id, platform, external_id) WHERE external_id IS NOT NULL
DO UPDATE SET
  reviewer_name = EXCLUDED.reviewer_name,
  review_text   = EXCLUDED.review_text,
  review_date   = EXCLUDED.review_date,
  rating        = EXCLUDED.rating,
  sentiment     = CASE WHEN reviews.rating IS DISTINCT FROM EXCLUDED.rating
                       THEN EXCLUDED.sentiment
                       ELSE COALESCE(reviews.sentiment, EXCLUDED.sentiment) END,
  replied       = reviews.replied OR EXCLUDED.replied,
  reply_text    = COALESCE(EXCLUDED.reply_text, reviews.reply_text),
  updated_at    = NOW()
RETURNING (xmax = 0) AS inserted`;

/**
 * Syncs one platform connection's reviews.
 * @param {string} connectionId platform_connections.id
 * @returns {{ fetched:number, created:number, updated:number, skippedNoRating:number,
 *             trimmed:number, pages:number, totalOnPlatform:number|null }}
 */
export async function syncByConnectionId(connectionId) {
  const connection = await PlatformConnection.findByPk(connectionId);
  if (!connection) {
    const err = new Error("Platform connection not found");
    err.code = "NO_CONNECTION";
    throw err;
  }
  if (connection.status !== "connected") {
    const err = new Error(`Connection is ${connection.status}, not connected`);
    err.code = "NOT_CONNECTED";
    throw err;
  }
  if (connection.platform !== "google") {
    const err = new Error(`No review provider for platform '${connection.platform}' yet`);
    err.code = "UNSUPPORTED_PLATFORM";
    throw err;
  }

  const provider = getProvider();

  // Mock mode needs no token; real mode goes through Phase 1's refresh logic.
  let accessToken = null;
  if (provider === googleProvider) {
    ({ accessToken } = await getValidAccessToken(connection.clinicId));
  }

  const lastSynced = connection.lastSyncedAt ? new Date(connection.lastSyncedAt).getTime() : null;
  const stats = { fetched: 0, created: 0, updated: 0, skippedNoRating: 0, trimmed: 0, pages: 0, totalOnPlatform: null };

  let pageToken = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await provider.fetchReviewsPage({
      accessToken,
      accountId: connection.externalAccountId,
      locationId: connection.externalLocationId,
      pageToken,
    });

    stats.pages++;
    stats.totalOnPlatform = result.totalReviewCount ?? stats.totalOnPlatform;

    let oldestUpdate = Infinity;
    for (const r of result.reviews) {
      stats.fetched++;
      const updated = r.updateTime ? new Date(r.updateTime).getTime() : Date.now();
      if (updated < oldestUpdate) oldestUpdate = updated;

      // GBP can return comment-less star ratings; rating-less rows can't —
      // rating is NOT NULL in our schema and drives sentiment. Skip nulls.
      if (!r.rating) {
        stats.skippedNoRating++;
        continue;
      }

      const [row] = await sequelize.query(UPSERT_SQL, {
        bind: [
          connection.clinicId,
          r.externalId,
          r.reviewerName || "Anonymous",
          r.rating,
          r.text,
          r.createTime,
          r.replied,
          r.replyText,
          computeSentiment(r.rating),
        ],
        type: QueryTypes.SELECT,
      });
      row?.inserted ? stats.created++ : stats.updated++;
    }

    // Incremental early-stop (newest-updated-first ordering).
    if (lastSynced && oldestUpdate !== Infinity && oldestUpdate < lastSynced - EARLY_STOP_BUFFER_MS) break;
    pageToken = result.nextPageToken;
    if (!pageToken) break;
  }

  // ── Free-tier trim: the spec's "maximum of 20 stored historical reviews".
  const sub = await getSubscriptionState(connection.clinicId);
  const cap = sub.limits.storedReviewsLimit;
  if (Number.isFinite(cap)) {
    const trimmed = await sequelize.query(
      `DELETE FROM reviews
        WHERE clinic_id = $1::uuid AND id NOT IN (
          SELECT id FROM reviews WHERE clinic_id = $1::uuid
           ORDER BY COALESCE(review_date, created_at) DESC
           LIMIT $2::int)`,
      { bind: [connection.clinicId, cap], type: QueryTypes.DELETE }
    );
    // sequelize DELETE returns [results, metadata] variably; count via change
    stats.trimmed = Array.isArray(trimmed) ? (trimmed[1] ?? 0) : 0;
  }

  return stats;
}

/**
 * Convenience for the manual endpoint: sync the clinic's (single) Google
 * connection without the caller needing the connection id.
 */
export async function syncClinicReviews(clinicId) {
  const connection = await PlatformConnection.findOne({
    where: { clinicId, platform: "google", status: "connected" },
  });
  if (!connection) {
    const err = new Error("No connected Google Business Profile for this clinic.");
    err.code = "NO_CONNECTION";
    throw err;
  }
  const stats = await syncByConnectionId(connection.id);

  // The manual path stamps the sync clock itself (the scheduler stamps its
  // own claims) — so a manual sync also resets the automatic interval.
  await sequelize.query(
    `UPDATE platform_connections
        SET last_synced_at = NOW(), last_sync_error = NULL
      WHERE id = $1::uuid`,
    { bind: [connection.id], type: QueryTypes.UPDATE }
  );

  return { connectionId: connection.id, ...stats };
}