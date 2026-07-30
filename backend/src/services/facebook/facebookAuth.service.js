// backend/src/services/facebook/facebookAuth.service.js
//
// Everything Facebook-OAuth in one place: consent URL, code exchange
// (short → long-lived user token), Page discovery, page-token derivation, and
// the connect/disconnect lifecycle. Mirrors googleAuth.service.js so the
// oauth-style controller and the review-sync token guard treat both platforms
// the same way.
//
// ── Token model (Facebook has NO refresh token) ─────────────────────────────
// FB issues long-lived tokens instead of refresh tokens:
//   short-lived user token  (~1h)  ← code exchange
//     → long-lived user token (~60d) ← fb_exchange_token   [stored: refreshTokenEnc]
//       → PAGE access token  (lives with the user token)   [stored: accessTokenEnc]
//                                    ← /me/accounts
// The PAGE token reads ratings. It doesn't expire on its own but dies with the
// user token (~60d) or if the user removes the app → a 190 OAuthException
// surfaces, we mark the connection 'revoked', and the UI asks the user to
// reconnect. There is no silent refresh; re-auth every ~60 days is inherent to
// the platform.
//
// ── What review sync needs ──────────────────────────────────────────────────
//   externalLocationId = the Facebook PAGE id (provider reads its /ratings)
//   accessTokenEnc     = that page's access token
//   refreshTokenEnc    = the long-lived USER token (to re-derive the page token)
//
// ── Ratings gate (the FB analogue of Google's approval gate) ────────────────
// Reading a Page's ratings needs pages_read_engagement (+ pages_show_list to
// enumerate pages), and the app must pass Facebook App Review for those scopes
// before it works for Pages the developer doesn't own. The OAuth handshake
// itself works pre-review; only real ratings reads need the approved scope.
// FACEBOOK_MOCK_DISCOVERY=true returns mock pages so the connect flow is
// testable meanwhile (set REVIEWS_MOCK=true to also mock the review reads,
// exactly like Google's GOOGLE_MOCK_DISCOVERY / REVIEWS_MOCK split).
//
// App credentials are read from process.env directly (like msg91.provider) so
// this file is self-contained — no config/env.js edit required. API_PUBLIC_URL
// and CLIENT_URL still come from the validated env object.

import crypto from "crypto";
import { PlatformConnection } from "../../models/index.js";
import { encryptToken, decryptToken } from "../../utils/crypto.js";
import { env } from "../../config/env.js";

const GRAPH_VERSION = process.env.FACEBOOK_GRAPH_VERSION || "v21.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
const DIALOG = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;

const FB_APP_ID = () => process.env.FACEBOOK_APP_ID;
const FB_APP_SECRET = () => process.env.FACEBOOK_APP_SECRET;

// pages_show_list → enumerate Pages; pages_read_engagement → read ratings;
// email → best-effort "Connected as …" label.
export const FACEBOOK_SCOPES = ["pages_show_list", "pages_read_engagement", "email"].join(",");

const redirectUri = () => `${env.API_PUBLIC_URL}/api/v1/oauth/facebook/callback`;
const useMockDiscovery = () => process.env.FACEBOOK_MOCK_DISCOVERY === "true";

// appsecret_proof hardens server-side Graph calls (required when the app has
// "Require App Secret Proof" enabled; harmless otherwise). Only added when the
// app secret is configured.
function appSecretProof(token) {
  const secret = FB_APP_SECRET();
  if (!secret || !token) return null;
  return crypto.createHmac("sha256", secret).update(token).digest("hex");
}

// Authenticated Graph GET with access_token (+ proof). Token exchanges below
// use plain fetch since they authenticate with client_secret, not a token.
async function graphGet(path, { token, params = {} } = {}) {
  const url = new URL(`${GRAPH}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") url.searchParams.set(k, String(v));
  }
  if (token) {
    url.searchParams.set("access_token", token);
    const proof = appSecretProof(token);
    if (proof) url.searchParams.set("appsecret_proof", proof);
  }
  return fetch(url, { signal: AbortSignal.timeout(20_000) });
}

// Parse an FB error body and either mark the connection revoked (190 / auth) or
// throw a coded error the controller/scheduler can phrase.
async function throwForFbError(res, conn, what) {
  const body = await res.text().catch(() => "");
  let fbErr = {};
  try {
    fbErr = JSON.parse(body).error || {};
  } catch {
    /* non-JSON */
  }
  const code = fbErr.code;

  if (code === 190 || res.status === 401) {
    if (conn) {
      await conn.update({
        status: "revoked",
        refreshTokenEnc: null,
        accessTokenEnc: null,
        accessTokenExpiresAt: null,
        lastError: "Facebook access expired or was revoked. Please reconnect.",
      });
    }
    const err = new Error("Facebook access revoked — reconnect required");
    err.code = "REVOKED";
    throw err;
  }
  if (code === 10 || code === 200 || code === 803) {
    const err = new Error(
      `Facebook permission error during ${what} (code ${code}). The app may still need pages_read_engagement review.`
    );
    err.code = "FB_PERMISSION";
    throw err;
  }
  const err = new Error(`Facebook ${what} failed (${res.status}): ${(fbErr.message || body).slice(0, 300)}`);
  err.code = "FB_API_ERROR";
  throw err;
}

// Walk /me/accounts fully (paginated) → [{ id, name, category, access_token }].
// Page tokens live here; callers that expose pages to the client strip them.
async function fetchManagedPages(userToken) {
  const pages = [];
  let after = null;
  do {
    const res = await graphGet("/me/accounts", {
      token: userToken,
      params: { limit: 100, after, fields: "id,name,category,access_token" },
    });
    if (!res.ok) await throwForFbError(res, null, "pages list");
    const data = await res.json();
    for (const p of data.data ?? []) {
      pages.push({ id: p.id, name: p.name, category: p.category || null, access_token: p.access_token });
    }
    after = data.paging?.next ? data.paging?.cursors?.after ?? null : null;
  } while (after);
  return pages;
}

// ── 1. Consent URL ───────────────────────────────────────────────────────────
/** @param {string} state signed state blob from utils/crypto.js signState() */
export function buildConsentUrl(state) {
  const params = new URLSearchParams({
    client_id: FB_APP_ID(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: FACEBOOK_SCOPES,
    state,
  });
  return `${DIALOG}?${params}`;
}

// ── 2. Code exchange → long-lived user token ─────────────────────────────────
/**
 * @returns {Promise<{userToken, expiresAt, scopes, name, email, userId}>}
 */
export async function exchangeCode(code) {
  // 2a. code → short-lived user token
  const shortUrl = new URL(`${GRAPH}/oauth/access_token`);
  shortUrl.searchParams.set("client_id", FB_APP_ID());
  shortUrl.searchParams.set("client_secret", FB_APP_SECRET());
  shortUrl.searchParams.set("redirect_uri", redirectUri());
  shortUrl.searchParams.set("code", code);

  const shortRes = await fetch(shortUrl, { signal: AbortSignal.timeout(15_000) });
  if (!shortRes.ok) {
    const body = await shortRes.text().catch(() => "");
    throw new Error(`Facebook code exchange failed (${shortRes.status}): ${body.slice(0, 300)}`);
  }
  const shortToken = (await shortRes.json()).access_token;

  // 2b. short → long-lived user token (~60d)
  const longUrl = new URL(`${GRAPH}/oauth/access_token`);
  longUrl.searchParams.set("grant_type", "fb_exchange_token");
  longUrl.searchParams.set("client_id", FB_APP_ID());
  longUrl.searchParams.set("client_secret", FB_APP_SECRET());
  longUrl.searchParams.set("fb_exchange_token", shortToken);

  const longRes = await fetch(longUrl, { signal: AbortSignal.timeout(15_000) });
  if (!longRes.ok) {
    const body = await longRes.text().catch(() => "");
    throw new Error(`Facebook long-lived exchange failed (${longRes.status}): ${body.slice(0, 300)}`);
  }
  const longData = await longRes.json();
  const userToken = longData.access_token;
  const expiresAt = new Date(Date.now() + (longData.expires_in ?? 60 * 24 * 3600) * 1000);

  // 2c. best-effort identity for the "Connected as …" UI
  let name = null,
    email = null,
    userId = null;
  try {
    const meRes = await graphGet("/me", { token: userToken, params: { fields: "id,name,email" } });
    if (meRes.ok) {
      const me = await meRes.json();
      name = me.name || null;
      email = me.email || null;
      userId = me.id || null;
    }
  } catch {
    /* non-fatal */
  }

  return { userToken, expiresAt, scopes: FACEBOOK_SCOPES, name, email, userId };
}

// ── 3. Persist a fresh grant (status: pending_location) ──────────────────────
export async function storeGrant({ clinicId, grant }) {
  const [conn] = await PlatformConnection.upsert(
    {
      clinicId,
      platform: "facebook",
      status: "pending_location",
      refreshTokenEnc: encryptToken(grant.userToken), // long-lived USER token
      accessTokenEnc: null, //                            page token set at select-page
      accessTokenExpiresAt: grant.expiresAt,
      scopes: grant.scopes,
      externalAccountId: grant.userId || null,
      externalAccountName: grant.name || null,
      connectedEmail: grant.email || null,
      connectedAt: new Date(),
      lastError: null,
      // A reconnect resets page choice — the new grant may manage other Pages.
      externalLocationId: null,
      externalLocationName: null,
    },
    { conflictFields: ["clinic_id", "platform"] }
  );
  return conn;
}

// ── 4. Page discovery ────────────────────────────────────────────────────────
/**
 * Pages the connected user manages, WITHOUT their tokens.
 * @returns {Promise<Array<{id, name, category}>>}
 */
export async function listPages(clinicId) {
  if (useMockDiscovery()) {
    return [
      { id: "100000000000001", name: "Mock Clinic (FB) — Main Branch", category: "Medical Center" },
      { id: "100000000000002", name: "Mock Clinic (FB) — Thoubal", category: "Doctor" },
    ];
  }

  const conn = await PlatformConnection.scope("withTokens").findOne({
    where: { clinicId, platform: "facebook" },
  });
  if (!conn || !conn.refreshTokenEnc || conn.status === "revoked") {
    const err = new Error("No active Facebook connection for this clinic");
    err.code = conn?.status === "revoked" ? "REVOKED" : "NO_CONNECTION";
    throw err;
  }

  const pages = await fetchManagedPages(decryptToken(conn.refreshTokenEnc));
  return pages.map(({ id, name, category }) => ({ id, name, category }));
}

// ── 5. Bind a chosen Page (status: connected) ────────────────────────────────
/**
 * Fetches the chosen Page's access token fresh from /me/accounts and stores it.
 * The page token never travels to the client — only its id/name do.
 */
export async function selectPage({ clinicId, pageId, pageName }) {
  const conn = await PlatformConnection.scope("withTokens").findOne({
    where: { clinicId, platform: "facebook" },
  });
  if (!conn || conn.status === "revoked" || !conn.refreshTokenEnc) {
    const err = new Error("No active Facebook connection to attach a page to");
    err.code = "NO_CONNECTION";
    throw err;
  }

  let pageToken;
  let resolvedName = pageName || null;

  if (useMockDiscovery()) {
    pageToken = `mock-page-token-${pageId}`;
  } else {
    const pages = await fetchManagedPages(decryptToken(conn.refreshTokenEnc));
    const match = pages.find((p) => String(p.id) === String(pageId));
    if (!match) {
      const err = new Error("That Page isn't managed by the connected Facebook account.");
      err.code = "FB_PAGE_NOT_FOUND";
      throw err;
    }
    pageToken = match.access_token;
    resolvedName = pageName || match.name || null;
  }

  await conn.update({
    accessTokenEnc: encryptToken(pageToken),
    externalLocationId: pageId,
    externalLocationName: resolvedName,
    status: "connected",
    lastError: null,
  });
  return conn;
}

// ── 6. Access-token lifecycle (the getValidAccessToken analogue) ─────────────
/**
 * Returns a valid PAGE access token for the clinic's Facebook connection,
 * re-deriving it from the long-lived user token if the cached page token is
 * missing. THE single entry point for the review-sync token guard.
 *
 * @throws err.code === "NO_CONNECTION" | "REVOKED" — UI shows connect/reconnect.
 */
export async function getValidFacebookToken(clinicId) {
  const conn = await PlatformConnection.scope("withTokens").findOne({
    where: { clinicId, platform: "facebook" },
  });
  if (!conn || conn.status === "revoked" || (!conn.accessTokenEnc && !conn.refreshTokenEnc)) {
    const err = new Error("No active Facebook connection for this clinic");
    err.code = conn?.status === "revoked" ? "REVOKED" : "NO_CONNECTION";
    throw err;
  }

  // Cached page token → use it. FB page tokens don't self-expire; a stale one
  // surfaces as a 190 on the actual ratings call, which flips status→revoked.
  if (conn.accessTokenEnc) {
    return { accessToken: decryptToken(conn.accessTokenEnc), connection: conn };
  }

  // No cached page token (e.g. right after a reconnect) → re-derive it.
  if (!conn.externalLocationId || !conn.refreshTokenEnc) {
    const err = new Error("Facebook connection is missing its page or user token");
    err.code = "NO_CONNECTION";
    throw err;
  }
  const pages = await fetchManagedPages(decryptToken(conn.refreshTokenEnc));
  const match = pages.find((p) => String(p.id) === String(conn.externalLocationId));
  if (!match) {
    await conn.update({
      status: "revoked",
      lastError: "The connected Facebook account no longer manages this Page.",
    });
    const err = new Error("Facebook page no longer managed — reconnect required");
    err.code = "REVOKED";
    throw err;
  }
  await conn.update({
    accessTokenEnc: encryptToken(match.access_token),
    lastRefreshedAt: new Date(),
    lastError: null,
  });
  return { accessToken: match.access_token, connection: conn };
}

// ── 7. Disconnect (best-effort app de-authorization + local cleanup) ─────────
export async function revokeFacebook(clinicId) {
  const conn = await PlatformConnection.scope("withTokens").findOne({
    where: { clinicId, platform: "facebook" },
  });
  if (!conn) {
    const err = new Error("No Facebook connection found");
    err.code = "NO_CONNECTION";
    throw err;
  }

  if (conn.refreshTokenEnc && !useMockDiscovery()) {
    try {
      const userToken = decryptToken(conn.refreshTokenEnc);
      const url = new URL(`${GRAPH}/me/permissions`);
      url.searchParams.set("access_token", userToken);
      const proof = appSecretProof(userToken);
      if (proof) url.searchParams.set("appsecret_proof", proof);
      await fetch(url, { method: "DELETE", signal: AbortSignal.timeout(10_000) });
    } catch (e) {
      console.warn("Facebook permission revoke failed (continuing):", e.message);
    }
  }

  await conn.update({
    status: "revoked",
    refreshTokenEnc: null,
    accessTokenEnc: null,
    accessTokenExpiresAt: null,
    externalLocationId: null,
    lastError: null,
  });
  return conn;
}