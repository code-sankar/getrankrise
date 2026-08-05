// backend/src/controllers/oauth.controller.js
//
// The OAuth handshake, HTTP side. Flow:
//
//   1. FE: GET  /oauth/google/connect      (JWT)  → { consentUrl }
//   2. Browser → Google consent screen → Google redirects to:
//   3.     GET  /oauth/google/callback?code&state   (NO JWT — see below)
//          → exchange code, store encrypted grant, 302 back to the frontend
//   4. FE: GET  /oauth/google/locations    (JWT)  → accounts + locations
//   5. FE: POST /oauth/google/select-location (JWT) → status: connected
//
// WHY THE CALLBACK IS UNAUTHENTICATED
// Step 3 is a top-level browser redirect from accounts.google.com. It carries
// no Authorization header and (with SameSite cookies) possibly no cookies
// either. Identity comes exclusively from the signed `state` parameter we
// minted in step 1 — HMAC over {clinicId, userId, exp, nonce} with
// ACCESS_TOKEN_SECRET. Forged, replayed-after-expiry, or cross-clinic states
// all fail verification and bounce. Do not "fix" the missing `protect`
// middleware on the callback route; it is absent by design.

import {
  buildConsentUrl,
  exchangeCode,
  storeGrant,
  listAccounts,
  listLocations,
  selectLocation,
} from "../services/google/googleAuth.service.js";
import { signState, verifyState } from "../utils/crypto.js";
import { PlatformConnection } from "../models/index.js";
import { env } from "../config/env.js";
import {
  successResponse,
  badRequestResponse,
  notFoundResponse,
  serverErrorResponse,
} from "../utils/apiResponse.js";
import { auditFromReq, AUDIT_EVENTS } from "../utils/auditLog.js";

const FE = () => env.CLIENT_URL.split(",")[0].trim();
const ALLOWED_RETURN_PATHS = new Set(["/onboarding", "/settings"]);
function safeReturnTo(raw, fallback = "/onboarding") {
  if (typeof raw !== "string") return fallback;
  const path = raw.split(/[?#]/)[0]; // drop any query/hash
  if (!path.startsWith("/") || path.startsWith("//")) return fallback;
  if (path.includes("\\") || path.includes("://") || path.length > 512)
    return fallback;
  return path;
}
// ── GET /api/v1/oauth/google/connect ─────────────────────────────────────────
// Returns the consent URL for the frontend to redirect to. We return it rather
// than 302ing directly because the request arrives via axios (XHR) — a 302
// from an XHR is followed by axios, not the browser tab, and Google's consent
// page inside a failed CORS fetch helps nobody. The FE does
// `window.location.href = consentUrl`.
export const startGoogleConnect = async (req, res) => {
  try {
    const returnTo = safeReturnTo(req.query.returnTo);
    const state = signState({
      clinicId: req.clinic.id,
      userId: req.user.id,
      returnTo,
    });
    return successResponse(res, {
      message: "Consent URL generated",
      data: { consentUrl: buildConsentUrl(state) },
    });
  } catch (err) {
    console.error("startGoogleConnect error:", err);
    return serverErrorResponse(res, "Could not start Google connection");
  }
};

// ── GET /api/v1/oauth/google/callback ────────────────────────────────────────
// UNAUTHENTICATED (see header comment). Ends in a redirect, not JSON — the
// user's browser is sitting on this URL.
export const googleCallback = async (req, res) => {
  const { code, state, error } = req.query;

  // Recover the signed state up front so we know where to send the browser
  // back to. verifyState returns null for a tampered/expired/absent state,
  // in which case returnTo falls back to /onboarding.
  const payload = state ? verifyState(state) : null;
  const returnTo = safeReturnTo(payload?.returnTo);

  if (error) {
    return res.redirect(`${FE()}${returnTo}?google=denied`);
  }
  if (!payload?.clinicId) {
    // Don't trust returnTo from an unverified state — default to /onboarding.
    return res.redirect(`${FE()}/onboarding?google=invalid_state`);
  }
  if (!code) {
    return res.redirect(`${FE()}${returnTo}?google=missing_code`);
  }

  try {
    const grant = await exchangeCode(code);
    await storeGrant({ clinicId: payload.clinicId, grant });
    return res.redirect(`${FE()}${returnTo}?google=connected`);
  } catch (err) {
    console.error("googleCallback error:", err.message);
    return res.redirect(`${FE()}${returnTo}?google=exchange_failed`);
  }
};

// ── GET /api/v1/oauth/google/locations ───────────────────────────────────────
// Accounts + their locations, flattened for the picker. Behind the approval
// gate this surfaces GBP_NOT_APPROVED so the FE can explain rather than spin.
export const getGoogleLocations = async (req, res) => {
  try {
    const accounts = await listAccounts(req.clinic.id);

    // Fetched in parallel rather than in a serial for-loop. Each listLocations
    // is an independent round trip to Google, so the old loop made the picker
    // take the SUM of every account's latency — an agency with six locations
    // waited six times as long as it needed to, on a screen that is already the
    // slowest step of onboarding.
    //
    // Promise.all rejects on the first failure, which is the behaviour we want:
    // the catch below maps GBP_NOT_APPROVED and the auth codes to specific,
    // actionable messages, and a half-populated picker would be worse than an
    // honest error.
    const result = await Promise.all(
      accounts.map(async (account) => ({
        account,
        locations: await listLocations(req.clinic.id, account.id),
      }))
    );

    return successResponse(res, {
      message: "Locations fetched",
      data: { accounts: result },
    });
  } catch (err) {
    if (err.code === "NO_CONNECTION" || err.code === "REVOKED") {
      return badRequestResponse(
        res,
        "Google is not connected. Start the connect flow first.",
      );
    }
    if (err.code === "GBP_NOT_APPROVED") {
      return res.status(503).json({
        success: false,
        code: "GBP_NOT_APPROVED",
        message:
          "Google hasn't approved this app's Business Profile API access yet. " +
          "Location discovery will work once the access request is granted.",
      });
    }
    console.error("getGoogleLocations error:", err);
    return serverErrorResponse(res, "Could not fetch Google locations");
  }
};

// ── POST /api/v1/oauth/google/select-location ────────────────────────────────
export const selectGoogleLocation = async (req, res) => {
  try {
    const { accountId, accountName, locationId, locationName } = req.body;

    const conn = await selectLocation({
      clinicId: req.clinic.id,
      accountId,
      accountName,
      locationId,
      locationName,
    });

    auditFromReq(req, AUDIT_EVENTS.SETTINGS_UPDATED, {
      metadata: { section: "integrations", platform: "google", locationId },
    });

    return successResponse(res, {
      message: "Google location connected",
      data: conn.toSafeJSON(),
    });
  } catch (err) {
    if (err.code === "NO_CONNECTION") {
      return badRequestResponse(
        res,
        "Google is not connected. Start the connect flow first.",
      );
    }
    console.error("selectGoogleLocation error:", err);
    return serverErrorResponse(res, "Could not save location selection");
  }
};

// ── GET /api/v1/oauth/connections ────────────────────────────────────────────
// All platform connections for the clinic — drives onboarding state and the
// Settings → Integrations tab.
export const listConnections = async (req, res) => {
  try {
    const rows = await PlatformConnection.findAll({
      where: { clinicId: req.clinic.id },
      order: [["platform", "ASC"]],
    });
    return successResponse(res, {
      message: "Connections fetched",
      data: { connections: rows.map((r) => r.toSafeJSON()) },
    });
  } catch (err) {
    console.error("listConnections error:", err);
    return serverErrorResponse(res);
  }
};

// ── DELETE /api/v1/oauth/google ──────────────────────────────────────────────
// Disconnect: best-effort revoke at Google, then null tokens locally. Local
// cleanup happens regardless of whether Google's revoke endpoint cooperates —
// the user asked to disconnect, so we disconnect.
export const disconnectGoogle = async (req, res) => {
  try {
    const conn = await PlatformConnection.scope("withTokens").findOne({
      where: { clinicId: req.clinic.id, platform: "google" },
    });
    if (!conn) return notFoundResponse(res, "No Google connection found");

    if (conn.refreshTokenEnc) {
      try {
        const { decryptToken } = await import("../utils/crypto.js");
        await fetch("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            token: decryptToken(conn.refreshTokenEnc),
          }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch (revokeErr) {
        console.warn(
          "Google revoke endpoint failed (continuing):",
          revokeErr.message,
        );
      }
    }

    await conn.update({
      status: "revoked",
      refreshTokenEnc: null,
      accessTokenEnc: null,
      accessTokenExpiresAt: null,
      lastError: null,
    });

    auditFromReq(req, AUDIT_EVENTS.SETTINGS_UPDATED, {
      metadata: {
        section: "integrations",
        platform: "google",
        action: "disconnected",
      },
    });

    return successResponse(res, {
      message: "Google disconnected",
      data: conn.toSafeJSON(),
    });
  } catch (err) {
    console.error("disconnectGoogle error:", err);
    return serverErrorResponse(res, "Could not disconnect Google");
  }
};
