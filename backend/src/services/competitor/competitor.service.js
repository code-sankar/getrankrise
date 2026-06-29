/**
 * competitor.service.js
 * Background-data layer for the Competitor Intelligence Tracker.
 *
 * Provider factory pattern (same philosophy as the SMS/WhatsApp router):
 *   - APIFY      → Apify actor run for Google/Yelp/Facebook scraping
 *   - DATAFORSEO → DataForSEO Business Data API
 *   - MOCK       → deterministic fake metrics so dev works with zero keys
 *
 * The provider is chosen once from env. Every provider implements the same
 * interface:
 *
 *     fetchCompetitorMetrics({ name, platform, externalId, location })
 *       → { rating, totalReviews, responseRate, sentiment }
 *
 * Controllers never call providers directly — they call syncCompetitor(),
 * which fetches metrics, computes deltas vs the last snapshot, writes a new
 * snapshot, and refreshes the denormalized cache on the Competitor row.
 */

import { CompetitorSnapshot } from "../../models/index.js";
import { env } from "../../config/env.js";

// ── Provider: Apify ───────────────────────────────────────────────────────────
const apifyProvider = {
  name: "apify",
  async fetchCompetitorMetrics({ name, platform, externalId, location }) {
    // Map our platform to an Apify actor. Kept minimal here — wire the actual
    // actor IDs/input shapes for your account.
    const ACTORS = {
      Google:   "compass~google-maps-reviews-scraper",
      Yelp:     "tri_angle~yelp-scraper",
      Facebook: "apify~facebook-reviews-scraper",
    };
    const actor = ACTORS[platform];
    if (!actor) throw new Error(`No Apify actor configured for ${platform}`);

    const res = await fetch(
      `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${env.APIFY_TOKEN}`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          // These keys differ per actor — adjust to the actor you pick.
          searchStringsArray: externalId ? undefined : [`${name} ${location || ""}`.trim()],
          placeIds:           externalId ? [externalId] : undefined,
          maxReviews:         0, // we only need aggregate stats, not full text
        }),
        signal: AbortSignal.timeout(60_000), // scrapes are slow
      }
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Apify ${res.status}: ${body.slice(0, 200)}`);
    }

    const items = await res.json();
    return normalizeProviderPayload(items?.[0] || {});
  },
};

// ── Provider: DataForSEO ──────────────────────────────────────────────────────
const dataForSeoProvider = {
  name: "dataforseo",
  async fetchCompetitorMetrics({ name, platform, externalId, location }) {
    const auth = Buffer
      .from(`${env.DATAFORSEO_LOGIN}:${env.DATAFORSEO_PASSWORD}`)
      .toString("base64");

    const res = await fetch(
      "https://api.dataforseo.com/v3/business_data/google/my_business_info/live",
      {
        method:  "POST",
        headers: {
          "Authorization": `Basic ${auth}`,
          "Content-Type":  "application/json",
        },
        body: JSON.stringify([
          {
            keyword:       externalId || `${name} ${location || ""}`.trim(),
            location_name: location || undefined,
          },
        ]),
        signal: AbortSignal.timeout(30_000),
      }
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`DataForSEO ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    const item = data?.tasks?.[0]?.result?.[0]?.items?.[0] || {};
    return normalizeProviderPayload({
      rating:       item.rating?.value,
      totalReviews: item.rating?.votes_count,
    });
  },
};

// ── Provider: Mock (dev / no-key fallback) ────────────────────────────────────
// Deterministic per competitor name so values are stable across calls but
// drift slightly upward over time to simulate organic growth.
const mockProvider = {
  name: "mock",
  async fetchCompetitorMetrics({ name }) {
    const seed = [...String(name)].reduce((a, c) => a + c.charCodeAt(0), 0);
    const drift = Math.floor(Date.now() / (1000 * 60 * 60 * 24)) % 30; // day-based

    const rating       = round1(3.6 + (seed % 13) / 10);          // 3.6–4.8
    const totalReviews = 80 + (seed % 240) + drift * 2;           // grows daily
    const responseRate = 40 + (seed % 55);                        // 40–94
    const sentiment    = 60 + (seed % 38);                        // 60–97

    return normalizeProviderPayload({ rating, totalReviews, responseRate, sentiment });
  },
};

// ── Factory ───────────────────────────────────────────────────────────────────
/**
 * Picks the active provider from env, once. Falls back to mock so the feature
 * is fully functional in development without any third-party credentials.
 */
export const getCompetitorProvider = () => {
  if (env.APIFY_TOKEN) return apifyProvider;
  if (env.DATAFORSEO_LOGIN && env.DATAFORSEO_PASSWORD) return dataForSeoProvider;
  return mockProvider;
};

// ── Normalisation ─────────────────────────────────────────────────────────────
// Guarantees a consistent, clamped shape regardless of provider quirks.
function normalizeProviderPayload(raw = {}) {
  return {
    rating:       clamp(round1(raw.rating ?? 0), 0, 5),
    totalReviews: Math.max(0, parseInt(raw.totalReviews ?? 0, 10) || 0),
    responseRate: clamp(parseInt(raw.responseRate ?? 0, 10) || 0, 0, 100),
    sentiment:    clamp(parseInt(raw.sentiment ?? 0, 10) || 0, 0, 100),
  };
}

const round1 = (n) => Math.round(Number(n) * 10) / 10;
const clamp  = (n, lo, hi) => Math.min(Math.max(n, lo), hi);

// ── Public: sync a single competitor ──────────────────────────────────────────
/**
 * Fetches fresh metrics, computes deltas vs the previous snapshot, persists a
 * new snapshot, and refreshes the competitor's denormalized cache.
 *
 * On provider failure the competitor is marked syncStatus="failed" with the
 * error message, but the call still rejects so callers can surface it.
 *
 * @param {Competitor} competitor - a loaded Competitor model instance
 * @returns {Promise<CompetitorSnapshot>}
 */
export const syncCompetitor = async (competitor) => {
  const provider = getCompetitorProvider();

  let metrics;
  try {
    metrics = await provider.fetchCompetitorMetrics({
      name:       competitor.name,
      platform:   competitor.platform,
      externalId: competitor.externalId,
      location:   competitor.location,
    });
  } catch (err) {
    await competitor.update({
      syncStatus:   "failed",
      syncError:    err.message?.slice(0, 500) || "Sync failed",
      lastSyncedAt: new Date(),
    });
    throw err;
  }

  // Previous snapshot → deltas
  const previous = await CompetitorSnapshot.findOne({
    where: { competitorId: competitor.id },
    order: [["capturedAt", "DESC"]],
  });

  const newReviews  = previous
    ? Math.max(0, metrics.totalReviews - previous.totalReviews)
    : 0;
  const ratingDelta = previous
    ? round1(metrics.rating - previous.rating)
    : 0;

  const snapshot = await CompetitorSnapshot.create({
    competitorId: competitor.id,
    rating:       metrics.rating,
    totalReviews: metrics.totalReviews,
    newReviews,
    ratingDelta,
    responseRate: metrics.responseRate,
    sentiment:    metrics.sentiment,
    capturedAt:   new Date(),
  });

  // Refresh the cache on the competitor row
  await competitor.update({
    latestRating:         metrics.rating,
    latestTotalReviews:   metrics.totalReviews,
    latestResponseRate:   metrics.responseRate,
    latestSentiment:      metrics.sentiment,
    newReviewsThisPeriod: newReviews,
    lastSyncedAt:         new Date(),
    syncStatus:           "ok",
    syncError:            null,
  });

  return snapshot;
};