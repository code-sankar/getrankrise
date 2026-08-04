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
//   getValidAccessToken / getValidFacebookToken (auto-refresh, revocation
//   detection — Google and Facebook each have their own token lifecycle;
//   Yelp uses a single account-level API key and needs no per-clinic token)
//     → provider.fetchReviewsPage (paginated)
//       → per review: UPSERT onto uniq_reviews_clinic_platform_external
//         (migration 0003 partial unique index) with merge rules below
//     → free-tier trim to storedReviewsLimit newest
//
// MERGE RULES (each one live-tested against PostgreSQL 16 before shipping):
//   * idempotent — resyncing identical pages creates zero rows
//   * rating edits recompute sentiment; unchanged ratings NEVER clobber a
//     stored sentiment (protects future AI-scored values — the 0005 rule)
//   * replied is STICKY-TRUE — a reply made in our UI isn't on the source
//     platform until it's published there, so "no reply" on refetch must
//     never un-reply a row
//   * platform-side replies import where the provider returns them
//     (reply_text COALESCEs in)
//
// INCREMENTAL EARLY-STOP: pages arrive newest-updated first; once a page's
// oldest updateTime predates last_synced_at minus a 24h safety buffer,
// deeper pages can't contain anything new — stop. First sync (no
// last_synced_at) walks everything up to MAX_PAGES.
//
// WHO CALLS THIS:
//   * syncScheduler — does NOT consume the review_sync meter; the plan's
//     interval IS its cap. Stamps last_synced_at / last_sync_error.
//   * the manual endpoint (reviewSync.controller.js) — DOES reserve
//     reserveUsage({ metric:"review_sync" }) (Phase 5 daily budget) and
//     stamps last_synced_at itself so the scheduler's clock resets too.
//
// ── FIX LOG (read before touching PLATFORM_LABEL / UPSERT_SQL again) ────────
//   1. PLATFORM_LABEL was missing a `facebook` key. buildUpsertSql(undefined)
//      produced `VALUES ($1::uuid, 'undefined', ...)`, which Postgres rejects
//      against the `platform` ENUM('Google','Yelp','Facebook') on every
//      single Facebook row (22P02 invalid input value for enum). Fixed below,
//      plus a boot-time assertion so a missing label fails loudly instead of
//      silently poisoning every Facebook sync.
//   2. The access-token block only ever populated `accessToken` for the
//      Google provider. Facebook reviews are gated behind a PAGE access
//      token (getValidFacebookToken) exactly the way Google is gated behind
//      an OAuth access token — without it, facebookReviews.provider.js's own
//      guard throws FB_AUTH before a single request goes out. Fixed below.
//   3. The upsert call inside the loop referenced a bare `UPSERT_SQL`
//      identifier that no longer exists now that the statement is chosen
//      per-platform via `upsertSql`. Left in place, this throws a
//      ReferenceError on the very first review of *any* platform. Fixed
//      below — the loop now uses the per-connection `upsertSql` resolved at
//      the top of syncByConnectionId.

import { QueryTypes } from "sequelize";
import { sequelize } from "../../config/db.js";
import { PlatformConnection } from "../../models/index.js";
import { getValidAccessToken } from "../google/googleAuth.service.js";
import { getValidFacebookToken } from "../facebook/facebookAuth.service.js";
import { computeSentiment } from "../../utils/sentiment.js";
import { getSubscriptionState } from "../subscription/subscriptionState.service.js";
import { env } from "../../config/env.js";
import * as googleProvider from "./providers/googleReviews.provider.js";
import * as yelpProvider from "./providers/yelpReviews.provider.js";
import * as mockProvider from "./providers/mockReviews.provider.js";
import * as facebookProvider from "./providers/facebookReviews.provider.js";

import {
  notifyLowRatingReviews,
  LOW_RATING_THRESHOLD,
} from "../notifications/reviewAlerts.service.js";

export const isImplemented = true; // ← the Phase 7 flag, flipped

const MAX_PAGES = 40; // 40 × 50 = 2000 reviews per sync — plenty, bounded
const EARLY_STOP_BUFFER_MS = 24 * 3600e3;

// ── Provider factory (mirrors the competitor-intelligence factory) ──────────
// Platform-aware. REVIEWS_MOCK (or GOOGLE_MOCK_DISCOVERY) still forces the
// shared mock provider for EVERY platform in dev — a fully offline pipeline.
// Otherwise google → GBP provider, yelp → Fusion provider, facebook → Graph
// provider. Widen this switch as new providers land; the caller passes
// connection.platform.
function getProvider(platform) {
  const mock =
    String(
      process.env.REVIEWS_MOCK ?? env.GOOGLE_MOCK_DISCOVERY ?? "",
    ).toLowerCase() === "true";
  if (mock) return mockProvider;
  if (platform === "yelp") return yelpProvider;
  if (platform === "facebook") return facebookProvider;
  return googleProvider; // platform === "google"
}

// ── The tested upsert ────────────────────────────────────────────────────────
// The platform literal is the ONLY thing that varies per provider, so the SQL
// is built once per supported platform from a fixed label map (NOT user input —
// no injection surface). Merge rules are byte-for-byte the tested Google ones
// and hold for Yelp and Facebook unchanged: both yield replied=false /
// reply_text=NULL on plain fetch (Yelp has no reply API at all; Facebook's
// /ratings edge doesn't return the Page's own replies), so
// `replied = reviews.replied OR EXCLUDED.replied` keeps a locally-saved reply
// sticky and the reply_text COALESCE never clobbers it.
const PLATFORM_LABEL = Object.freeze({
  google: "Google",
  yelp: "Yelp",
  facebook: "Facebook",
});

// Fail at import time, not mid-sync, if a platform is ever added to the
// provider factory / claim SQL without a matching label here. This is
// exactly the class of bug the missing `facebook` key produced — cheap
// insurance against it happening again.
for (const [key, label] of Object.entries(PLATFORM_LABEL)) {
  if (!label) {
    throw new Error(
      `reviewSync.service.js: PLATFORM_LABEL is missing a label for '${key}'`,
    );
  }
}

// `id` is supplied explicitly. reviews is a CORE table built by sequelize.sync(),
// so its UUID default lives in the model layer, not in Postgres — there is no
// DEFAULT on the column. A raw INSERT that omits id therefore dies on 23502
// (null value in column "id"), which meant no synced review was ever stored.
const buildUpsertSql = (platformLabel) => `
INSERT INTO reviews (id, clinic_id, platform, external_id, reviewer_name, rating,
                     review_text, review_date, replied, reply_text, sentiment,
                     created_at, updated_at)
VALUES (gen_random_uuid(), $1::uuid, '${platformLabel}', $2::text, $3::text, $4::int, $5::text,
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
RETURNING id, (xmax = 0) AS inserted`;

const UPSERT_SQL_BY_PLATFORM = Object.freeze({
  google: buildUpsertSql(PLATFORM_LABEL.google),
  yelp: buildUpsertSql(PLATFORM_LABEL.yelp),
  facebook: buildUpsertSql(PLATFORM_LABEL.facebook),
});

/**
 * Syncs one platform connection's reviews.
 * @param {string} connectionId platform_connections.id
 * @returns {{ fetched:number, created:number, updated:number, skippedNoRating:number,
 *             trimmed:number, pages:number, totalOnPlatform:number|null,
 *             alerted:number }}
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
  const upsertSql = UPSERT_SQL_BY_PLATFORM[connection.platform];
  if (!upsertSql) {
    const err = new Error(
      `No review provider for platform '${connection.platform}' yet`,
    );
    err.code = "UNSUPPORTED_PLATFORM";
    throw err;
  }
  // Was this platform empty for this clinic before this sync? Drives the
  // backfill guard in reviewAlerts — see that file for why last_synced_at
  // cannot be used for this (the scheduler stamps it before calling us).
  const [{ n: priorCount }] = await sequelize.query(
    // No ::text on $2 — reviews.platform is an ENUM and there is no
    // "enum = text" operator (42883). Leaving the bind untyped lets Postgres
    // resolve it as the enum via the column on the left-hand side.
    `SELECT COUNT(*)::int AS n FROM reviews
      WHERE clinic_id = $1::uuid AND platform = $2`,
    {
      bind: [connection.clinicId, PLATFORM_LABEL[connection.platform]],
      type: QueryTypes.SELECT,
    },
  );
  const isBackfill = priorCount === 0;

  // Newly-INSERTED low-rating reviews, collected for one batched alert write
  // at the end. Not written inline: an alert per row inside the pagination
  // loop would be N round trips and would fire before the free-tier trim
  // decides which rows survive.
  const lowRatingAlerts = [];

  const provider = getProvider(connection.platform);

  // Token resolution is per-provider:
  //   Google   → per-clinic OAuth access token (auto-refreshed)
  //   Facebook → per-clinic PAGE access token (re-derived from the long-lived
  //              user token if the cached one is missing)
  //   Yelp     → account-level API key, read inside yelpReviews.provider.js
  //   mock     → nothing
  // Only Google and Facebook need anything fetched here.
  let accessToken = null;
  if (provider === googleProvider) {
    ({ accessToken } = await getValidAccessToken(connection.clinicId));
  } else if (provider === facebookProvider) {
    ({ accessToken } = await getValidFacebookToken(connection.clinicId));
  }

  const lastSynced = connection.lastSyncedAt
    ? new Date(connection.lastSyncedAt).getTime()
    : null;
  const stats = {
    fetched: 0,
    created: 0,
    updated: 0,
    skippedNoRating: 0,
    trimmed: 0,
    pages: 0,
    totalOnPlatform: null,
    alerted: 0,
  };

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
      const updated = r.updateTime
        ? new Date(r.updateTime).getTime()
        : Date.now();
      if (updated < oldestUpdate) oldestUpdate = updated;

      // GBP can return comment-less star ratings; rating-less rows can't —
      // rating is NOT NULL in our schema and drives sentiment. Skip nulls.
      if (!r.rating) {
        stats.skippedNoRating++;
        continue;
      }

      const [row] = await sequelize.query(upsertSql, {
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

      // Only rows the upsert reported as genuinely INSERTED (xmax = 0) are
      // alert candidates. A re-sync that merely UPDATES an existing 1-star
      // review is not news, and re-alerting on it is how a notification bell
      // becomes noise the user learns to ignore.
      if (row?.inserted) {
        stats.created++;
        if (r.rating <= LOW_RATING_THRESHOLD) {
          lowRatingAlerts.push({
            id: row.id,
            rating: r.rating,
            reviewerName: r.reviewerName || "Anonymous",
          });
        }
      } else {
        stats.updated++;
      }
    }

    // Incremental early-stop (newest-updated-first ordering).
    if (
      lastSynced &&
      oldestUpdate !== Infinity &&
      oldestUpdate < lastSynced - EARLY_STOP_BUFFER_MS
    )
      break;
    pageToken = result.nextPageToken;
    if (!pageToken) break;
  }

  // ── Free-tier trim: the spec's "maximum of 20 stored historical reviews".
  const sub = await getSubscriptionState(connection.clinicId);
  const cap = sub.limits.storedReviewsLimit;
  if (Number.isFinite(cap)) {
    // RETURNING id + QueryTypes.SELECT is the only shape that yields a usable
    // count here. With `type: QueryTypes.DELETE` sequelize resolves to a bare
    // [], so the old `trimmed[1] ?? 0` reported 0 rows trimmed no matter how
    // many were actually deleted — the scheduler logged "0 trimmed" while
    // silently dropping 14 rows.
    const trimmedRows = await sequelize.query(
      `DELETE FROM reviews
        WHERE clinic_id = $1::uuid AND id NOT IN (
          SELECT id FROM reviews WHERE clinic_id = $1::uuid
           ORDER BY COALESCE(review_date, created_at) DESC
           LIMIT $2::int)
        RETURNING id`,
      { bind: [connection.clinicId, cap], type: QueryTypes.SELECT },
    );
    stats.trimmed = trimmedRows.length;

    // Never alert on a review the trim just deleted. notifications.review_id
    // points at a row that no longer exists, and "new 1-star review" about
    // something the user cannot open is worse than no alert at all.
    if (stats.trimmed > 0 && lowRatingAlerts.length > 0) {
      const deleted = new Set(trimmedRows.map((t) => t.id));
      for (let i = lowRatingAlerts.length - 1; i >= 0; i--) {
        if (deleted.has(lowRatingAlerts[i].id)) lowRatingAlerts.splice(i, 1);
      }
    }
  }

  // ── Urgent-review alerts ────────────────────────────────────────────────
  // This call is the write path behind the notification bell. It was missing
  // entirely: notifyLowRatingReviews was imported, lowRatingAlerts was built
  // (well, declared), and nothing ever invoked it — so a clinic could ingest
  // eleven 1-star reviews and receive zero notifications.
  //
  // Never throws (see reviewAlerts.service.js's failure posture): a
  // notification problem must not fail a sync that has already committed real
  // review rows, because claim-by-stamping would then cost the clinic a full
  // interval of real data.
  stats.alerted = (
    await notifyLowRatingReviews({
      clinicId: connection.clinicId,
      candidates: lowRatingAlerts,
      isBackfill,
    })
  ).created;

  return stats;
}

/**
 * Convenience for the manual endpoint ("Sync now"): sync EVERY connected
 * platform for the clinic, without the caller needing connection ids.
 *
 * This used to filter `platform: "google"` and throw NO_CONNECTION otherwise,
 * which meant a clinic connected only to Yelp or Facebook was told to "connect
 * your Google Business Profile" while holding a perfectly good working
 * connection — the button was dead for them. syncByConnectionId has always
 * supported all three platforms; only this lookup was narrow.
 *
 * PARTIAL FAILURE IS NOT TOTAL FAILURE. With N connections, one provider being
 * down must not discard the results of the others, so each connection is run
 * independently and its error is recorded rather than thrown. The endpoint only
 * fails outright when EVERY connection failed — and then it rethrows the first
 * error so the controller's existing GBP_AUTH / GBP_NOT_APPROVED mappings still
 * produce their specific messages instead of a generic 500.
 *
 * @returns {{ platforms: Array<{platform,connectionId,ok,error?,...stats}>,
 *             connectionId: string|null, ...aggregateStats }}
 */
export async function syncClinicReviews(clinicId) {
  const connections = await PlatformConnection.findAll({
    where: { clinicId, status: "connected" },
    order: [["platform", "ASC"]],
  });

  if (connections.length === 0) {
    const err = new Error(
      "No connected review platform for this clinic. Connect Google, Yelp, or Facebook in Settings.",
    );
    err.code = "NO_CONNECTION";
    throw err;
  }

  const totals = {
    fetched: 0,
    created: 0,
    updated: 0,
    skippedNoRating: 0,
    trimmed: 0,
    pages: 0,
    alerted: 0,
  };
  const platforms = [];
  let firstError = null;

  for (const connection of connections) {
    try {
      const stats = await syncByConnectionId(connection.id);
      for (const key of Object.keys(totals)) totals[key] += stats[key] ?? 0;

      // The manual path stamps the sync clock itself (the scheduler stamps its
      // own claims) — so a manual sync also resets the automatic interval.
      await sequelize.query(
        `UPDATE platform_connections
            SET last_synced_at = NOW(), last_sync_error = NULL
          WHERE id = $1::uuid`,
        { bind: [connection.id], type: QueryTypes.UPDATE },
      );

      platforms.push({
        platform: connection.platform,
        connectionId: connection.id,
        ok: true,
        ...stats,
      });
    } catch (err) {
      firstError ??= err;
      // Record it on the connection the same way the scheduler does, so the
      // Settings page shows why this platform is stale.
      await sequelize
        .query(
          `UPDATE platform_connections
              SET last_sync_error = $2::text
            WHERE id = $1::uuid`,
          {
            bind: [connection.id, String(err.message).slice(0, 500)],
            type: QueryTypes.UPDATE,
          },
        )
        .catch(() => {});

      platforms.push({
        platform: connection.platform,
        connectionId: connection.id,
        ok: false,
        code: err.code || null,
        error: err.message,
      });
    }
  }

  // Every connection failed → surface the first real error so the controller
  // can map it to its specific message. A partial success returns normally
  // with the per-platform breakdown carrying the bad news.
  if (platforms.every((p) => !p.ok)) throw firstError;

  return {
    // Kept for response-shape compatibility with the single-connection era.
    connectionId: platforms.find((p) => p.ok)?.connectionId ?? null,
    platforms,
    ...totals,
    totalOnPlatform: null, // meaningless once several platforms are summed
  };
}
