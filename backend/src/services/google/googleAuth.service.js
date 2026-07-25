// backend/src/services/google/googleAuth.service.js
//
// Everything Google-OAuth in one place: consent URL, code exchange, token
// refresh, and account/location discovery.
//
// ── API landscape (verified July 2026 — this WILL rot, check the change log) ─
//
// Google split the old My Business API into several. We touch three surfaces:
//
//   OAuth 2.0            accounts.google.com/o/oauth2/v2/auth   (consent)
//                        oauth2.googleapis.com/token            (exchange/refresh)
//   Account discovery    mybusinessaccountmanagement.googleapis.com/v1/accounts
//   Location discovery   mybusinessbusinessinformation.googleapis.com/v1/
//                          {account}/locations?readMask=...
//   Reviews (Phase 2)    mybusiness.googleapis.com/v4/{account}/{location}/reviews
//                        — still on legacy v4; Google has not migrated it.
//
// Scope: https://www.googleapis.com/auth/business.manage — the only scope that
// covers listing locations, reading reviews, and (later) posting replies.
//
// ── THE APPROVAL GATE — read this before debugging a 429 ────────────────────
//
// Enabling these APIs in Cloud Console is NOT access. Every new project has
// quota 0 on the Business Profile APIs until Google manually approves an
// access request (form linked from the "Prerequisites" page of the GBP API
// docs). Until then every discovery call returns 429 RESOURCE_EXHAUSTED with
// quota_limit_value: "0".
//
// The OAuth flow itself (consent, code exchange, refresh) works WITHOUT
// approval — it's plain Google Identity, not the gated API. So the full
// connect flow is buildable and testable today; only listAccounts/
// listLocations are gated, and those fall back to the mock provider when
// GOOGLE_MOCK_DISCOVERY=true. Flip it off the day your quota goes non-zero.
//
// ── Token model ──────────────────────────────────────────────────────────────
//
// access_token   ~1h life. Cached encrypted with its expiry; re-minted from
//                the refresh token when <60s of life remain.
// refresh_token  long-lived, ONLY issued when the consent screen actually
//                shows — hence prompt=consent + access_type=offline on every
//                auth URL. Without those, a returning user gets no refresh
//                token and the connection dies in an hour.
// invalid_grant  on refresh means the user revoked us (or changed password
//                with certain settings). Not retryable: mark the connection
//                revoked, null the tokens, surface "reconnect Google" in UI.

import { PlatformConnection } from "../../models/index.js";
import { encryptToken, decryptToken } from "../../utils/crypto.js";
import { env } from "../../config/env.js";

const OAUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const ACCOUNTS_URL = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts";
const LOCATIONS_BASE = "https://mybusinessbusinessinformation.googleapis.com/v1";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/business.manage",
  "openid",
  "email",
].join(" ");

const redirectUri = () => `${env.API_PUBLIC_URL}/api/v1/oauth/google/callback`;

// ── 1. Consent URL ───────────────────────────────────────────────────────────

/**
 * @param {string} state signed state blob from utils/crypto.js signState()
 */
export function buildConsentUrl(state) {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline", // ← without this, no refresh_token, ever
    prompt: "consent", //       ← without this, no refresh_token on RE-connect
    include_granted_scopes: "true",
    state,
  });
  return `${OAUTH_BASE}?${params}`;
}

// ── 2. Code exchange ─────────────────────────────────────────────────────────

/**
 * Exchanges the authorization code for tokens and identifies the granting
 * Google account.
 *
 * @returns {Promise<{accessToken, refreshToken, expiresAt, scopes, email}>}
 */
export async function exchangeCode(code) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google token exchange failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const data = await res.json();

  if (!data.refresh_token) {
    // Should be impossible with prompt=consent, but if Google ever returns an
    // access token without a refresh token we must NOT store it — the
    // connection would silently die within the hour and the failure would
    // surface days later as "sync stopped working".
    throw new Error(
      "Google returned no refresh_token. The consent screen was likely skipped; " +
        "verify prompt=consent and access_type=offline on the auth URL."
    );
  }

  // Identify the granting account (for the "Connected as x@gmail.com" UI).
  // Best-effort — a failure here shouldn't sink the whole connect.
  let email = null;
  try {
    const uiRes = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${data.access_token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (uiRes.ok) email = (await uiRes.json()).email || null;
  } catch {
    /* non-fatal */
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
    scopes: data.scope || GOOGLE_SCOPES,
    email,
  };
}

// ── 3. Persist a fresh grant ─────────────────────────────────────────────────

/**
 * Upserts the clinic's Google connection with newly-granted tokens.
 * Reconnecting overwrites in place (uniq_platform_connection).
 */
export async function storeGrant({ clinicId, grant }) {
  const [conn] = await PlatformConnection.upsert(
    {
      clinicId,
      platform: "google",
      status: "pending_location",
      refreshTokenEnc: encryptToken(grant.refreshToken),
      accessTokenEnc: encryptToken(grant.accessToken),
      accessTokenExpiresAt: grant.expiresAt,
      scopes: grant.scopes,
      connectedEmail: grant.email,
      connectedAt: new Date(),
      lastError: null,
      // A reconnect resets location choice — the new Google account may not
      // even manage the previously-selected location.
      externalAccountId: null,
      externalAccountName: null,
      externalLocationId: null,
      externalLocationName: null,
    },
    { conflictFields: ["clinic_id", "platform"] }
  );
  return conn;
}

// ── 4. Access-token lifecycle ────────────────────────────────────────────────

/**
 * Returns a currently-valid access token for the clinic's Google connection,
 * refreshing transparently when needed. THE single entry point for every
 * downstream Google call (discovery here, review sync in Phase 2).
 *
 * @throws {Error} err.code === "NO_CONNECTION" | "REVOKED" — both mean the UI
 *         should show "connect / reconnect Google", not retry.
 */
export async function getValidAccessToken(clinicId) {
  const conn = await PlatformConnection.scope("withTokens").findOne({
    where: { clinicId, platform: "google" },
  });

  if (!conn || !conn.refreshTokenEnc || conn.status === "revoked") {
    const err = new Error("No active Google connection for this clinic");
    err.code = conn?.status === "revoked" ? "REVOKED" : "NO_CONNECTION";
    throw err;
  }

  // Cached token still has ≥60s of life → use it.
  if (
    conn.accessTokenEnc &&
    conn.accessTokenExpiresAt &&
    conn.accessTokenExpiresAt.getTime() - Date.now() > 60_000
  ) {
    return { accessToken: decryptToken(conn.accessTokenEnc), connection: conn };
  }

  // Refresh.
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: decryptToken(conn.refreshTokenEnc),
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");

    if (res.status === 400 && body.includes("invalid_grant")) {
      // User revoked access. Terminal — null the dead tokens, flag for re-auth.
      await conn.update({
        status: "revoked",
        refreshTokenEnc: null,
        accessTokenEnc: null,
        accessTokenExpiresAt: null,
        lastError: "Google access was revoked. Please reconnect.",
      });
      const err = new Error("Google access revoked — reconnect required");
      err.code = "REVOKED";
      throw err;
    }

    // Transient (5xx, network). Record but leave status/connection intact.
    await conn.update({ lastError: `Token refresh failed: ${res.status}` });
    throw new Error(`Google token refresh failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const accessToken = data.access_token;
  const expiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000);

  await conn.update({
    accessTokenEnc: encryptToken(accessToken),
    accessTokenExpiresAt: expiresAt,
    lastRefreshedAt: new Date(),
    lastError: null,
    // Google MAY rotate the refresh token; store the new one when it does.
    ...(data.refresh_token ? { refreshTokenEnc: encryptToken(data.refresh_token) } : {}),
  });

  return { accessToken, connection: conn };
}

// ── 5. Discovery (gated by the approval — mock available) ────────────────────

const useMockDiscovery = () => env.GOOGLE_MOCK_DISCOVERY === "true";

/**
 * Lists GBP accounts the connected Google user can manage.
 * @returns {Promise<Array<{id, name}>>} id like "accounts/1234567890"
 */
export async function listAccounts(clinicId) {
  if (useMockDiscovery()) {
    return [{ id: "accounts/000000000000", name: "Mock Business Group (dev)" }];
  }

  const { accessToken } = await getValidAccessToken(clinicId);
  const accounts = [];
  let pageToken;

  do {
    const url = new URL(ACCOUNTS_URL);
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(20_000),
    });
    await throwForGbpError(res, "accounts.list");

    const data = await res.json();
    for (const a of data.accounts ?? []) {
      accounts.push({ id: a.name, name: a.accountName || a.name });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return accounts;
}

/**
 * Lists locations under a GBP account.
 * @param {string} accountId "accounts/1234567890"
 * @returns {Promise<Array<{id, name, address}>>} id like "locations/987654"
 */
export async function listLocations(clinicId, accountId) {
  if (useMockDiscovery()) {
    return [
      { id: "locations/111111", name: "Mock Clinic — Main Branch", address: "MG Road, Imphal" },
      { id: "locations/222222", name: "Mock Clinic — Thoubal", address: "Wangjing Rd, Thoubal" },
    ];
  }

  const { accessToken } = await getValidAccessToken(clinicId);
  const locations = [];
  let pageToken;

  do {
    // readMask is REQUIRED on this endpoint; omitting it is a 400.
    const url = new URL(`${LOCATIONS_BASE}/${accountId}/locations`);
    url.searchParams.set("readMask", "name,title,storefrontAddress");
    url.searchParams.set("pageSize", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(20_000),
    });
    await throwForGbpError(res, "locations.list");

    const data = await res.json();
    for (const l of data.locations ?? []) {
      locations.push({
        id: l.name, // "locations/{id}"
        name: l.title || l.name,
        address: formatAddress(l.storefrontAddress),
      });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return locations;
}

/**
 * Finalises the connection: the user picked which GBP location IS this clinic.
 */
export async function selectLocation({ clinicId, accountId, accountName, locationId, locationName }) {
  const conn = await PlatformConnection.findOne({ where: { clinicId, platform: "google" } });
  if (!conn || conn.status === "revoked") {
    const err = new Error("No active Google connection to attach a location to");
    err.code = "NO_CONNECTION";
    throw err;
  }

  await conn.update({
    externalAccountId: accountId,
    externalAccountName: accountName || null,
    externalLocationId: locationId,
    externalLocationName: locationName || null,
    status: "connected",
    lastError: null,
  });

  return conn;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function throwForGbpError(res, label) {
  if (res.ok) return;
  const body = await res.text().catch(() => "");

  if (res.status === 429 && body.includes("RESOURCE_EXHAUSTED")) {
    // The approval gate, not a real rate limit. Give the developer the actual
    // diagnosis instead of an hour of quota-dashboard confusion.
    const err = new Error(
      `GBP ${label} returned 429 RESOURCE_EXHAUSTED. If this is a new Google Cloud ` +
        `project this is almost certainly quota_limit_value:"0" — the Business Profile ` +
        `APIs require a manual access request from Google before ANY call succeeds. ` +
        `Submit the GBP API access form, or set GOOGLE_MOCK_DISCOVERY=true to keep ` +
        `building against mock data meanwhile.`
    );
    err.code = "GBP_NOT_APPROVED";
    throw err;
  }

  const err = new Error(`GBP ${label} failed (${res.status}): ${body.slice(0, 300)}`);
  err.code = "GBP_API_ERROR";
  throw err;
}

function formatAddress(addr) {
  if (!addr) return null;
  return [...(addr.addressLines ?? []), addr.locality, addr.administrativeArea]
    .filter(Boolean)
    .join(", ");
}