// backend/src/controllers/yelp.controller.js
//
// Yelp connect flow, HTTP side. Yelp has NO OAuth, so this is far simpler than
// oauth.controller.js: search businesses → bind one → (later) disconnect.
//
// Mounted under /api/v1/oauth (same prefix as the Google flow and the shared
// GET /oauth/connections) even though Yelp isn't literally OAuth — keeping all
// platform-connection surfaces under one route file and one FE api module is
// worth the mild naming stretch. The scheduler starts syncing the moment a
// business is bound with status 'connected' (see yelpReviews.provider).

import {
  searchBusinesses,
  getBusiness,
  connectYelpBusiness,
  disconnectYelp as disconnectYelpService,
} from "../services/yelp/yelpBusiness.service.js";
import {
  successResponse,
  badRequestResponse,
  notFoundResponse,
  serverErrorResponse,
} from "../utils/apiResponse.js";
import { auditFromReq, AUDIT_EVENTS } from "../utils/auditLog.js";

const yelpNotConfigured = (res) =>
  res.status(503).json({
    success: false,
    code: "YELP_NOT_CONFIGURED",
    message:
      "Yelp search isn't available yet — the server's YELP_API_KEY hasn't been configured.",
  });

// ── GET /api/v1/oauth/yelp/search?term=&location= ────────────────────────────
export const searchYelpBusinesses = async (req, res) => {
  try {
    const location = (req.query.location || "").trim();
    // Term defaults to the clinic's own name — most clinics are searching for
    // themselves. loadClinic guarantees req.clinic is present.
    const term = (req.query.term || req.clinic.clinicName || "").trim();

    if (!location) {
      return badRequestResponse(res, "A location (city or address) is required to search Yelp.");
    }

    const businesses = await searchBusinesses({ term, location, limit: 8 });
    return successResponse(res, {
      message: "Yelp businesses fetched",
      data: { businesses },
    });
  } catch (err) {
    if (err.code === "YELP_NOT_CONFIGURED") return yelpNotConfigured(res);
    if (err.code === "YELP_AUTH") {
      return res.status(502).json({
        success: false,
        code: "YELP_AUTH",
        message: "Yelp rejected our API key. Please contact support.",
      });
    }
    if (err.code === "YELP_RATE_LIMIT") {
      return res.status(429).json({
        success: false,
        code: "YELP_RATE_LIMIT",
        message: "Yelp is rate-limiting requests. Please try again in a moment.",
      });
    }
    console.error("searchYelpBusinesses error:", err);
    return serverErrorResponse(res, "Could not search Yelp businesses");
  }
};

// ── GET /api/v1/oauth/yelp/business?ref=<url-or-alias> ───────────────────────
// The "paste your Yelp URL" shortcut: resolve one business so the frontend can
// confirm the real name before binding. Returns the same shape as a search hit.
export const resolveYelpBusiness = async (req, res) => {
  try {
    const ref = (req.query.ref || "").trim();
    if (!ref) {
      return badRequestResponse(res, "Paste a Yelp business URL or alias.");
    }

    const business = await getBusiness(ref);
    return successResponse(res, {
      message: "Yelp business resolved",
      data: { business },
    });
  } catch (err) {
    if (err.code === "YELP_NOT_CONFIGURED") return yelpNotConfigured(res);
    if (err.code === "YELP_BAD_REF") return badRequestResponse(res, err.message);
    if (err.code === "YELP_NOT_FOUND") {
      return badRequestResponse(res, "No Yelp business matches that link. Double-check the URL.");
    }
    if (err.code === "YELP_AUTH") {
      return res.status(502).json({
        success: false,
        code: "YELP_AUTH",
        message: "Yelp rejected our API key. Please contact support.",
      });
    }
    if (err.code === "YELP_RATE_LIMIT") {
      return res.status(429).json({
        success: false,
        code: "YELP_RATE_LIMIT",
        message: "Yelp is rate-limiting requests. Please try again in a moment.",
      });
    }
    console.error("resolveYelpBusiness error:", err);
    return serverErrorResponse(res, "Could not look up that Yelp business");
  }
};

// ── POST /api/v1/oauth/yelp/connect ──────────────────────────────────────────
export const connectYelpBusinessHandler = async (req, res) => {
  try {
    const { businessId, businessName } = req.body;

    const conn = await connectYelpBusiness({
      clinicId: req.clinic.id,
      businessId,
      businessName,
    });

    auditFromReq(req, AUDIT_EVENTS.SETTINGS_UPDATED, {
      metadata: { section: "integrations", platform: "yelp", businessId },
    });

    return successResponse(res, {
      message: "Yelp business connected",
      data: conn.toSafeJSON(),
    });
  } catch (err) {
    if (err.code === "YELP_NOT_FOUND") {
      return badRequestResponse(
        res,
        "That Yelp business could not be found. Please pick one from search."
      );
    }
    console.error("connectYelpBusiness error:", err);
    return serverErrorResponse(res, "Could not connect the Yelp business");
  }
};

// ── DELETE /api/v1/oauth/yelp ────────────────────────────────────────────────
export const disconnectYelp = async (req, res) => {
  try {
    const conn = await disconnectYelpService(req.clinic.id);

    auditFromReq(req, AUDIT_EVENTS.SETTINGS_UPDATED, {
      metadata: { section: "integrations", platform: "yelp", action: "disconnected" },
    });

    return successResponse(res, {
      message: "Yelp disconnected",
      data: conn.toSafeJSON(),
    });
  } catch (err) {
    if (err.code === "NO_CONNECTION") return notFoundResponse(res, "No Yelp connection found");
    console.error("disconnectYelp error:", err);
    return serverErrorResponse(res, "Could not disconnect Yelp");
  }
};