// backend/src/routes/oauth.routes.js
//
// HTTP surface for the Google OAuth connect flow. NEW FILE — the controller
// (oauth.controller.js) existed for a while with no router in front of it,
// which is why every /api/v1/oauth/* call from the frontend 404'd.
//
// Frontend contract (frontend/src/api/googleAPI.js):
//   GET    /oauth/google/connect          → { consentUrl }
//   GET    /oauth/google/callback         ← Google redirects here (browser)
//   GET    /oauth/google/locations        → accounts + locations for picker
//   POST   /oauth/google/select-location  → bind location, status: connected
//   GET    /oauth/connections             → all platform connections
//   DELETE /oauth/google                  → revoke + disconnect
//
// ── WHY /google/callback HAS NO protect MIDDLEWARE ──────────────────────────
// The callback is a top-level browser redirect from accounts.google.com. It
// carries no Authorization header and (SameSite=strict) no cookies. Identity
// comes exclusively from the HMAC-signed `state` parameter minted in
// startGoogleConnect and verified inside the controller. Forged, expired, or
// cross-clinic states fail verification and bounce to the frontend with an
// error param. Adding `protect` here would break the flow for every user.
// Same pattern as the Paddle webhook: signed, not sessioned. Do not "fix" it.
//
// Because one route must stay public, auth is applied PER ROUTE below rather
// than with a blanket router.use(protect, loadClinic).

import { Router } from "express";
import rateLimit from "express-rate-limit";
import Joi from "joi";
import { protect } from "../middleware/auth.middleware.js";
import { loadClinic } from "../middleware/loadClinic.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  startGoogleConnect,
  googleCallback,
  getGoogleLocations,
  selectGoogleLocation,
  listConnections,
  disconnectGoogle,
} from "../controllers/oauth.controller.js";

const router = Router();

// ── Rate limit on the public callback ────────────────────────────────────────
// It's unauthenticated by necessity, so give it its own modest cap. A real
// user hits it once per connect attempt; 30/15min per IP is generous and
// still starves anyone probing state-verification with brute force.
const callbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { success: false, message: "Too many attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Validation ───────────────────────────────────────────────────────────────
// Defined inline (same convention as campaign.routes.js) rather than in
// validate.middleware.js — these shapes are used nowhere else.
const selectLocationSchema = Joi.object({
  accountId: Joi.string().max(255).required(),      // "accounts/1234567890"
  accountName: Joi.string().max(255).allow("", null),
  locationId: Joi.string().max(255).required(),     // "locations/987654"
  locationName: Joi.string().max(255).allow("", null),
});

// ── Public route (see header comment before touching) ───────────────────────
router.get("/google/callback", callbackLimiter, asyncHandler(googleCallback));

// ── Authenticated routes ─────────────────────────────────────────────────────
router.get(
  "/google/connect",
  protect,
  loadClinic,
  asyncHandler(startGoogleConnect)
);

router.get(
  "/google/locations",
  protect,
  loadClinic,
  asyncHandler(getGoogleLocations)
);

router.post(
  "/google/select-location",
  protect,
  loadClinic,
  validate(selectLocationSchema),
  asyncHandler(selectGoogleLocation)
);

router.get(
  "/connections",
  protect,
  loadClinic,
  asyncHandler(listConnections)
);

router.delete(
  "/google",
  protect,
  loadClinic,
  asyncHandler(disconnectGoogle)
);

export default router;