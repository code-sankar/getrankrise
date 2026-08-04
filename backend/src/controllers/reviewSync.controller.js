// backend/src/controllers/reviewSync.controller.js
//
// POST /api/v1/reviews/sync — the manual "Sync now" button.
//
// Metering: draws from the Phase 5 review_sync DAILY budget (Free 0 /
// Starter 6 / Premium 48). The reservation happens AFTER the connection
// check — "you have no connection" must not cost a sync — and is
// refunded if the provider blows up, so a failed sync never burns budget.
// (Scheduler-initiated syncs bypass this meter entirely; the plan's
// syncIntervalHours is their cap.)
//
// ONE reservation covers the whole run regardless of how many platforms are
// connected. The meter exists to bound how often a clinic can hammer the
// button, and "sync now" is one user action whether it fans out to one
// provider or three — charging per connection would silently make the button
// three times as expensive for the clinics that integrated the most.

import {
  syncClinicReviews,
} from "../services/reviews/reviewSync.service.js";
import {
  reserveUsage,
  refundUsage,
  usageErrorResponse,
} from "../services/usage/usage.service.js";
import { PlatformConnection } from "../models/index.js";
import {
  successResponse,
  badRequestResponse,
  serverErrorResponse,
} from "../utils/apiResponse.js";

// platform_connections.platform is lowercase; these are the display names the
// user recognises from the Settings page.
const PLATFORM_NAME = Object.freeze({
  google: "Google",
  yelp: "Yelp",
  facebook: "Facebook",
});

export const syncNow = async (req, res) => {
  const clinicId = req.clinic.id;
  let reserved = false;

  try {
    // 1. Connection check BEFORE reserving — no budget spent on "connect first".
    // ANY connected platform qualifies. Filtering this to Google was the bug:
    // a Yelp-only or Facebook-only clinic was told to connect Google while
    // holding a working connection, and the button never did anything for them.
    const connectionCount = await PlatformConnection.count({
      where: { clinicId, status: "connected" },
    });
    if (connectionCount === 0) {
      return res.status(400).json({
        success: false,
        code: "NO_CONNECTION",
        message:
          "Connect a review platform (Google, Yelp, or Facebook) in Settings before syncing reviews.",
      });
    }

    // 2. Reserve one manual sync from the daily budget.
    const u = await reserveUsage({ clinicId, metric: "review_sync" });
    if (!u.reserved) return usageErrorResponse(res, u);
    reserved = true;

    // 3. Sync every connected platform.
    const stats = await syncClinicReviews(clinicId);

    // A partial failure still committed real rows, so it is a 200 with the
    // bad news in the message rather than an error that hides the good half.
    const failedPlatforms = (stats.platforms ?? []).filter((p) => !p.ok);
    const synced =
      stats.created > 0
        ? `Synced ${stats.created} new review${stats.created === 1 ? "" : "s"}.`
        : "Reviews are up to date.";

    return successResponse(res, {
      message: failedPlatforms.length
        ? `${synced} ${failedPlatforms
            .map((p) => PLATFORM_NAME[p.platform] || p.platform)
            .join(" and ")} could not be reached — check the connection in Settings.`
        : synced,
      data: {
        ...stats,
        usage: { used: u.used, limit: u.limit, remaining: u.remaining },
      },
    });
  } catch (err) {
    if (reserved) await refundUsage({ clinicId, metric: "review_sync" });

    // Friendly mappings for the known failure modes. These are only reached
    // when EVERY connected platform failed — syncClinicReviews swallows a
    // partial failure into stats.platforms and returns 200 above.
    if (err.code === "GBP_NOT_APPROVED") {
      return res.status(503).json({
        success: false,
        code: "GBP_NOT_APPROVED",
        message:
          "Google hasn't approved API access for this project yet. Reviews will sync automatically once approval lands.",
      });
    }
    if (err.code === "GBP_AUTH") {
      return res.status(409).json({
        success: false,
        code: err.code,
        message:
          "Your Google connection needs attention — please reconnect it in Settings.",
      });
    }
    if (err.code === "FB_AUTH") {
      return res.status(409).json({
        success: false,
        code: err.code,
        message:
          "Your Facebook connection needs attention — please reconnect it in Settings.",
      });
    }
    // Yelp's key is account-level (ours, not the clinic's), so a bad or absent
    // key is a server configuration problem. Telling the clinic to "reconnect"
    // would send them to fix something they have no control over.
    if (err.code === "YELP_AUTH" || err.code === "YELP_NOT_CONFIGURED") {
      return res.status(503).json({
        success: false,
        code: err.code,
        message:
          "Yelp review sync is temporarily unavailable on our side. We're on it — nothing to fix on your end.",
      });
    }
    // Platform-neutral: reachable when a connection is revoked between the
    // count above and the sync itself.
    if (err.code === "NOT_CONNECTED") {
      return res.status(409).json({
        success: false,
        code: err.code,
        message:
          "That review platform is no longer connected — please reconnect it in Settings.",
      });
    }
    if (err.code === "NO_CONNECTION") {
      return badRequestResponse(res, err.message);
    }
    console.error("manual review sync error:", err);
    return serverErrorResponse(res, "Could not sync reviews right now.");
  }
};