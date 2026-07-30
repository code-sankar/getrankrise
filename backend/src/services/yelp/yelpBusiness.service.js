// backend/src/services/yelp/yelpBusiness.service.js
//
// Yelp "connect" support: business discovery + binding a Yelp business to a
// clinic. Yelp has NO OAuth — a clinic connection is just an identity pointer
// (the Yelp business id/alias) stored in platform_connections, which the
// already-built yelpReviews.provider reads back as external_location_id.
//
// Auth: one account-level key (YELP_API_KEY), Bearer, same as the provider.
// Read straight from process.env to stay self-contained (mirrors the provider
// and msg91.provider — no config/env.js edit required).
//
// Dev ergonomics: with no key set, searchBusinesses returns deterministic
// simulated results (NON-PROD ONLY) so the picker works end-to-end without a
// key, matching the provider's keyless-dev posture. connect/disconnect never
// need the key — they only write our own platform_connections row.

import crypto from "crypto";
import { PlatformConnection } from "../../models/index.js";

const YELP_V3 = "https://api.yelp.com/v3";
const hasKey = () => Boolean(process.env.YELP_API_KEY);

// Coded errors so the controller can phrase each failure for a clinic owner.
async function throwForYelpError(res, what) {
  if (res.ok) return;
  const body = await res.text().catch(() => "");
  if (res.status === 401 || res.status === 403) {
    const err = new Error(`Yelp rejected the API key (${res.status}). Check YELP_API_KEY.`);
    err.code = "YELP_AUTH";
    throw err;
  }
  if (res.status === 404) {
    const err = new Error("Yelp business not found (404).");
    err.code = "YELP_NOT_FOUND";
    throw err;
  }
  if (res.status === 429) {
    const err = new Error("Yelp rate limit hit (429). Try again shortly.");
    err.code = "YELP_RATE_LIMIT";
    throw err;
  }
  const err = new Error(`Yelp ${what} failed (${res.status}): ${body.slice(0, 300)}`);
  err.code = "YELP_FETCH";
  throw err;
}

const fmtAddress = (loc) =>
  Array.isArray(loc?.display_address) ? loc.display_address.filter(Boolean).join(", ") : null;

// Fusion business → the shape the picker renders. `id` is the stable Yelp
// business id we store as external_location_id (the reviews endpoint accepts
// either the id or the alias, so alias is display-only sugar).
const normalizeBusiness = (b) => ({
  id: b.id,
  alias: b.alias || null,
  name: b.name,
  address: fmtAddress(b.location),
  rating: b.rating ?? null,
  reviewCount: b.review_count ?? null,
  url: b.url || null,
  imageUrl: b.image_url || null,
});

/**
 * Pull a Yelp business alias/id out of whatever the user pasted:
 *   https://www.yelp.com/biz/smile-dental-thoubal?osq=... → "smile-dental-thoubal"
 *   https://m.yelp.ca/biz/smile-dental-thoubal-2          → "smile-dental-thoubal-2"
 *   smile-dental-thoubal                                  → "smile-dental-thoubal"
 * Returns "" when it's a URL we can't read (so the caller can say so cleanly).
 */
export function parseYelpRef(ref) {
  const s = String(ref || "").trim();
  if (!s) return "";
  const m = s.match(/\/biz\/([^/?#]+)/i); // the segment after /biz/
  if (m) return decodeURIComponent(m[1]);
  if (/^https?:\/\//i.test(s)) return ""; // a URL, but not a /biz/ one → unreadable
  return s; // bare alias or opaque id
}

/**
 * Resolve a pasted URL / alias / id to ONE canonical business via
 * GET /v3/businesses/{id} (accepts alias or id). Validates existence and
 * returns the real name so the connected card isn't a guessed label.
 * @returns {Promise<Object>} normalized business
 */
export async function getBusiness(ref) {
  const idOrAlias = parseYelpRef(ref);
  if (!idOrAlias) {
    const err = new Error(
      "Could not read a Yelp business from that link. Paste a yelp.com/biz/… URL or the business alias."
    );
    err.code = "YELP_BAD_REF";
    throw err;
  }

  if (!hasKey()) {
    if (process.env.NODE_ENV === "production" && process.env.YELP_MOCK_ALLOW_PROD !== "true") {
      const err = new Error("YELP_API_KEY not set — cannot look up Yelp businesses in production.");
      err.code = "YELP_NOT_CONFIGURED";
      throw err;
    }
    return simulateBusiness(idOrAlias);
  }

  const res = await fetch(`${YELP_V3}/businesses/${encodeURIComponent(idOrAlias)}`, {
    headers: { Authorization: `Bearer ${process.env.YELP_API_KEY}` },
    signal: AbortSignal.timeout(15_000),
  });
  await throwForYelpError(res, "business lookup");

  const data = await res.json();
  return normalizeBusiness(data);
}

/**
 * Search Yelp businesses for the picker. `location` is required by Fusion
 * (city or address); the caller defaults `term` to the clinic name.
 * @returns {Promise<Object[]>} normalized businesses
 */
export async function searchBusinesses({ term, location, limit = 8 }) {
  if (!hasKey()) {
    if (process.env.NODE_ENV === "production" && process.env.YELP_MOCK_ALLOW_PROD !== "true") {
      const err = new Error("YELP_API_KEY not set — cannot search Yelp in production.");
      err.code = "YELP_NOT_CONFIGURED";
      throw err;
    }
    return simulateSearch({ term, location, limit });
  }

  const url = new URL(`${YELP_V3}/businesses/search`);
  if (term) url.searchParams.set("term", term);
  url.searchParams.set("location", location);
  url.searchParams.set("limit", String(Math.min(Math.max(limit, 1), 20)));

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.YELP_API_KEY}` },
    signal: AbortSignal.timeout(15_000),
  });
  await throwForYelpError(res, "business search");

  const data = await res.json();
  return (data.businesses || []).map(normalizeBusiness);
}

/**
 * Bind a Yelp business to a clinic. Upsert (one row per clinic+platform, per
 * the uniq_platform_connection constraint), status 'connected' so the sync
 * scheduler starts claiming it on its next tick. No tokens — Yelp uses the
 * shared account key, not a per-clinic grant.
 * @returns {Promise<PlatformConnection>} fresh row (default scope, token-free)
 */
export async function connectYelpBusiness({ clinicId, businessId, businessName }) {
  if (!businessId) {
    const err = new Error("A Yelp business id is required");
    err.code = "YELP_NOT_FOUND";
    throw err;
  }

  await PlatformConnection.upsert(
    {
      clinicId,
      platform: "yelp",
      status: "connected",
      externalLocationId: businessId,
      externalLocationName: businessName || null,
      // Yelp has no OAuth identity or tokens — everything token-shaped is null.
      externalAccountId: null,
      externalAccountName: null,
      connectedEmail: null,
      connectedAt: new Date(),
      lastError: null,
    },
    { conflictFields: ["clinic_id", "platform"] }
  );

  // upsert() doesn't return the row consistently across dialects — re-read via
  // the default (token-excluding) scope so the caller gets a clean toSafeJSON().
  return PlatformConnection.findOne({ where: { clinicId, platform: "yelp" } });
}

/**
 * Disconnect Yelp: flip to 'revoked' and clear the business pointer (keeps the
 * row + any history, matching the Google disconnect posture). The scheduler's
 * claim filters on status = 'connected', so a revoked row simply stops syncing.
 * @returns {Promise<PlatformConnection>}
 */
export async function disconnectYelp(clinicId) {
  const conn = await PlatformConnection.findOne({ where: { clinicId, platform: "yelp" } });
  if (!conn) {
    const err = new Error("No Yelp connection found");
    err.code = "NO_CONNECTION";
    throw err;
  }
  await conn.update({ status: "revoked", externalLocationId: null, lastError: null });
  return conn;
}

// ── Dev simulators (no key, NON-PROD only) ───────────────────────────────────
// Deterministic so results are stable across renders.
const simHash = (s) => crypto.createHash("sha256").update(String(s)).digest().readUInt32BE(0);

const prettifyAlias = (alias) =>
  String(alias)
    .replace(/-\d+$/, "") // drop Yelp's disambiguation suffix ("-2")
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ") || "Yelp Business";

function simulateBusiness(idOrAlias) {
  const seed = simHash(idOrAlias);
  return {
    id: idOrAlias,
    alias: idOrAlias,
    name: prettifyAlias(idOrAlias),
    address: `${100 + (seed % 900)} Main St (dev)`,
    rating: Math.round((3.5 + (seed % 15) / 10) * 10) / 10,
    reviewCount: 20 + (seed % 300),
    url: `https://www.yelp.com/biz/${idOrAlias}`,
    imageUrl: null,
  };
}

function simulateSearch({ term = "Clinic", location = "", limit = 8 }) {
  const base = (term || "Clinic").trim();
  const n = Math.min(3, Math.max(1, limit));
  const out = [];
  for (let i = 0; i < n; i++) {
    const seed = simHash(`${base}:${location}:${i}`);
    out.push({
      id: `yelp-sim-biz-${seed}`,
      alias: `${base.toLowerCase().replace(/\s+/g, "-")}-${i}`,
      name: i === 0 ? base : `${base} ${["North", "Central", "Downtown"][i % 3]}`,
      address: location ? `${100 + (seed % 900)} Main St, ${location}` : "Address unavailable (dev)",
      rating: Math.round((3.5 + (seed % 15) / 10) * 10) / 10,
      reviewCount: 20 + (seed % 300),
      url: "https://www.yelp.com",
      imageUrl: null,
    });
  }
  return out;
}