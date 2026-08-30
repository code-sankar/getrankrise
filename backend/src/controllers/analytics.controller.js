// backend/src/controllers/analytics.controller.js
import {
  getAnalytics,
  exportCsv,
  VALID_RANGES,
} from "../services/analytics/analytics.service.js";
import { successResponse, serverErrorResponse } from "../utils/apiResponse.js";

const cleanRange = (raw) => (VALID_RANGES.includes(raw) ? raw : "last_30_days");

// ── GET /api/v1/analytics?range=last_30_days ─────────────────────────────────
export const getAnalyticsHandler = async (req, res) => {
  try {
    const range = cleanRange(req.query.range);
    const data = await getAnalytics(req.clinic.id, range);
    return successResponse(res, { message: "Analytics fetched", data });
  } catch (err) {
    console.error("getAnalytics error:", err);
    return serverErrorResponse(res, "Could not compute analytics");
  }
};

// ── GET /api/v1/analytics/export?range=last_30_days ──────────────────────────
// Returns text/csv as a download. Not wrapped in the JSON envelope — the
// frontend requests it with responseType:"blob" and hands it to the browser.
export const exportAnalyticsCsv = async (req, res) => {
  try {
    const range = cleanRange(req.query.range);
    const csv = await exportCsv(req.clinic.id, range);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="kirtify_analytics_${range}.csv"`
    );
    return res.status(200).send(csv);
  } catch (err) {
    console.error("exportAnalyticsCsv error:", err);
    return serverErrorResponse(res, "Could not export analytics");
  }
};