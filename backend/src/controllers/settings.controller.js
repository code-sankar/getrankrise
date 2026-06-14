import {
  successResponse,
  serverErrorResponse,
  badRequestResponse,
} from "../utils/apiResponse.js";
import { auditFromReq, AUDIT_EVENTS } from "../utils/auditLog.js";

// Notification prefs are stored on Clinic.notificationPrefs (JSONB).
// This controller is the public-facing CRUD surface for those prefs.

// ── GET /api/v1/settings ──────────────────────────────────────────────────────
export const getSettings = async (req, res) => {
  return successResponse(res, {
    message: "Settings fetched",
    data:    req.clinic.notificationPrefs || {},
  });
};

// ── PUT /api/v1/settings ──────────────────────────────────────────────────────
export const updateSettings = async (req, res) => {
  try {
    const next = {
      ...(req.clinic.notificationPrefs || {}),
      ...req.body,
    };
    await req.clinic.update({ notificationPrefs: next });

    auditFromReq(req, AUDIT_EVENTS.SETTINGS_UPDATED, {
      metadata: { section: "notifications", changedFields: Object.keys(req.body) },
    });

    return successResponse(res, {
      message: "Settings updated",
      data:    next,
    });
  } catch (err) {
    console.error("updateSettings error:", err);
    return serverErrorResponse(res);
  }
};

// ── PATCH /api/v1/settings/toggle ─────────────────────────────────────────────
// Toggles a single boolean preference. Body: { key: "urgentAlerts" }
export const toggleSetting = async (req, res) => {
  try {
    const { key } = req.body;
    const current = req.clinic.notificationPrefs || {};

    if (typeof current[key] !== "boolean") {
      return badRequestResponse(res, `Setting '${key}' is not togglable`);
    }

    const next = { ...current, [key]: !current[key] };
    await req.clinic.update({ notificationPrefs: next });

    return successResponse(res, {
      message: `${key} ${next[key] ? "enabled" : "disabled"}`,
      data:    next,
    });
  } catch (err) {
    console.error("toggleSetting error:", err);
    return serverErrorResponse(res);
  }
};