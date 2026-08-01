// backend/src/controllers/facebook.controller.js
//
// Facebook OAuth handshake, HTTP side. Mirrors oauth.controller.js (Google):
//
//   1. FE: GET  /oauth/facebook/connect        (JWT)  → { consentUrl }
//   2. Browser → Facebook consent → redirects to:
//   3.     GET  /oauth/facebook/callback?code&state   (NO JWT — see below)
//          → exchange code, store long-lived grant, 302 back to the frontend
//   4. FE: GET  /oauth/facebook/pages          (JWT)  → the user's Pages
//   5. FE: POST /oauth/facebook/select-page    (JWT)  → status: connected
//
// WHY THE CALLBACK IS UNAUTHENTICATED — identical rationale to the Google
// callback: it's a top-level browser redirect from facebook.com with no JWT.
// Identity comes only from the signed `state` (HMAC via utils/crypto signState).
// Do not add `protect` to the callback route.
//
// Binds to the EXISTING facebookAuth.service.js exports:
//   buildConsentUrl, exchangeCode (→ grant), storeGrant({clinicId, grant}),
//   listPages, selectPage, revokeFacebook.

import {
  buildConsentUrl,
  exchangeCode,
  storeGrant,
  listPages,
  selectPage,
  revokeFacebook,
} from "../services/facebook/facebookAuth.service.js";
import { signState, verifyState } from "../utils/crypto.js";
import { env } from "../config/env.js";
import {
  successResponse,
  badRequestResponse,
  notFoundResponse,
  serverErrorResponse,
} from "../utils/apiResponse.js";
import { auditFromReq, AUDIT_EVENTS } from "../utils/auditLog.js";

const FE = () => env.CLIENT_URL.split(",")[0].trim();
const isConfigured = () => Boolean(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET);

// ── GET /api/v1/oauth/facebook/connect ───────────────────────────────────────
// Returns the consent URL (FE does window.location.href = consentUrl), same as
// the Google flow — a 302 from an XHR would be followed by axios, not the tab.
export const startFacebookConnect = async (req, res) => {
  try {
    if (!isConfigured()) {
      return res.status(503).json({
        success: false,
        code: "FACEBOOK_NOT_CONFIGURED",
        message: "Facebook isn't configured on the server yet (FACEBOOK_APP_ID / FACEBOOK_APP_SECRET).",
      });
    }
    const returnTo = safeReturnTo(req.query.returnTo);
    const state = signState({ clinicId: req.clinic.id, userId: req.user.id, returnTo });
    return successResponse(res, {
      message: "Consent URL generated",
      data: { consentUrl: buildConsentUrl(state) },
    });
  } catch (err) {
    console.error("startFacebookConnect error:", err);
    return serverErrorResponse(res, "Could not start Facebook connection");
  }
};

// ── GET /api/v1/oauth/facebook/callback ──────────────────────────────────────
// UNAUTHENTICATED. Ends in a redirect, not JSON — the user's browser is here.
export const facebookCallback = async (req, res) => {
  const { code, state, error } = req.query;

  const payload  = state ? verifyState(state) : null;
  const returnTo = safeReturnTo(payload?.returnTo);

  // User clicked "Cancel" / denied on the consent screen.
  if (error) {
    return res.redirect(`${FE()}${returnTo}?facebook=denied`);
  }
  if (!payload?.clinicId) {
    return res.redirect(`${FE()}${returnTo}?facebook=invalid_state`);
  }
  if (!code) {
    return res.redirect(`${FE()}${returnTo}?facebook=missing_code`);
  }

  try {
    const grant = await exchangeCode(code);
    await storeGrant({ clinicId: payload.clinicId, grant });
    return res.redirect(`${FE()}${returnTo}?facebook=connected`);
  } catch (err) {
    console.error("facebookCallback error:", err.message);
    return res.redirect(`${FE()}${returnTo}?facebook=exchange_failed`);
  }
};
// ── GET /api/v1/oauth/facebook/pages ─────────────────────────────────────────
// The Pages the connected user manages, for the picker.
export const getFacebookPages = async (req, res) => {
  try {
    const pages = await listPages(req.clinic.id);
    return successResponse(res, {
      message: "Pages fetched",
      data: { pages },
    });
  } catch (err) {
    if (err.code === "NO_CONNECTION" || err.code === "REVOKED") {
      return badRequestResponse(res, "Facebook is not connected. Start the connect flow first.");
    }
    if (err.code === "FB_PERMISSION") {
      return res.status(503).json({
        success: false,
        code: "FB_PERMISSION",
        message:
          "Facebook hasn't approved this app's Page permissions yet. Page discovery will work " +
          "once App Review is granted (or for Pages you personally administer).",
      });
    }
    console.error("getFacebookPages error:", err);
    return serverErrorResponse(res, "Could not fetch Facebook Pages");
  }
};

// ── POST /api/v1/oauth/facebook/select-page ──────────────────────────────────
export const selectFacebookPage = async (req, res) => {
  try {
    const { pageId, pageName } = req.body;

    const conn = await selectPage({ clinicId: req.clinic.id, pageId, pageName });

    auditFromReq(req, AUDIT_EVENTS.SETTINGS_UPDATED, {
      metadata: { section: "integrations", platform: "facebook", pageId },
    });

    return successResponse(res, {
      message: "Facebook Page connected",
      data: conn.toSafeJSON(),
    });
  } catch (err) {
    if (err.code === "NO_CONNECTION") {
      return badRequestResponse(res, "Facebook is not connected. Start the connect flow first.");
    }
    if (err.code === "FB_PAGE_NOT_FOUND") {
      return badRequestResponse(res, "That Page isn't managed by the connected Facebook account.");
    }
    console.error("selectFacebookPage error:", err);
    return serverErrorResponse(res, "Could not save the Page selection");
  }
};

// ── DELETE /api/v1/oauth/facebook ────────────────────────────────────────────
export const disconnectFacebook = async (req, res) => {
  try {
    const conn = await revokeFacebook(req.clinic.id);

    auditFromReq(req, AUDIT_EVENTS.SETTINGS_UPDATED, {
      metadata: { section: "integrations", platform: "facebook", action: "disconnected" },
    });

    return successResponse(res, {
      message: "Facebook disconnected",
      data: conn.toSafeJSON(),
    });
  } catch (err) {
    if (err.code === "NO_CONNECTION") return notFoundResponse(res, "No Facebook connection found");
    console.error("disconnectFacebook error:", err);
    return serverErrorResponse(res, "Could not disconnect Facebook");
  }
};