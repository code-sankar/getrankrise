// backend/src/controllers/reviewSync.controller.js
//
// POST /api/v1/reviews/sync — the manual "Sync now" button.
//
// Metering: draws from the Phase 5 review_sync DAILY budget (Free 0 /
// Starter 6 / Premium 48). The reservation happens AFTER the connection
// check — "you have no Google connection" must not cost a sync — and is
// refunded if the provider blows up, so a failed sync never burns budget.
// (Scheduler-initiated syncs bypass this meter entirely; the plan's
// syncIntervalHours is their cap.)

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

export const syncNow = async (req, res) => {
  const clinicId = req.clinic.id;
  let reserved = false;

  try {
    // 1. Connection check BEFORE reserving — no budget spent on "connect first".
    const connection = await PlatformConnection.findOne({
      where: { clinicId, platform: "google", status: "connected" },
    });
    if (!connection) {
      return res.status(400).json({
        success: false,
        code: "NO_CONNECTION",
        message:
          "Connect your Google Business Profile in Settings before syncing reviews.",
      });
    }

    // 2. Reserve one manual sync from the daily budget.
    const u = await reserveUsage({ clinicId, metric: "review_sync" });
    if (!u.reserved) return usageErrorResponse(res, u);
    reserved = true;

    // 3. Sync.
    const stats = await syncClinicReviews(clinicId);

    return successResponse(res, {
      message:
        stats.created > 0
          ? `Synced ${stats.created} new review${stats.created === 1 ? "" : "s"}.`
          : "Reviews are up to date.",
      data: {
        ...stats,
        usage: { used: u.used, limit: u.limit, remaining: u.remaining },
      },
    });
  } catch (err) {
    if (reserved) await refundUsage({ clinicId, metric: "review_sync" });

    // Friendly mappings for the known failure modes.
    if (err.code === "GBP_NOT_APPROVED") {
      return res.status(503).json({
        success: false,
        code: "GBP_NOT_APPROVED",
        message:
          "Google hasn't approved API access for this project yet. Reviews will sync automatically once approval lands.",
      });
    }
    if (err.code === "GBP_AUTH" || err.code === "NOT_CONNECTED") {
      return res.status(409).json({
        success: false,
        code: err.code,
        message:
          "Your Google connection needs attention — please reconnect it in Settings.",
      });
    }
    if (err.code === "NO_CONNECTION") {
      return badRequestResponse(res, err.message);
    }
    console.error("manual review sync error:", err);
    return serverErrorResponse(res, "Could not sync reviews right now.");
  }
};