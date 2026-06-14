import { Clinic } from "../models/index.js";
import {
  successResponse,
  serverErrorResponse,
} from "../utils/apiResponse.js";
import { auditFromReq, AUDIT_EVENTS } from "../utils/auditLog.js";

// ── GET /api/v1/clinic/me ─────────────────────────────────────────────────────
// req.clinic is set by loadClinic middleware
export const getMyClinic = async (req, res) => {
  return successResponse(res, {
    message: "Clinic fetched",
    data:    req.clinic,
  });
};

// ── PUT /api/v1/clinic/me ─────────────────────────────────────────────────────
// IMPORTANT: only whitelisted fields are accepted from the request body.
// Mass assignment of `plan`, `userId`, `isActive`, usage counters etc. would be
// a critical security bug — even though the route is protected, a logged-in
// user must not be able to change their own plan or impersonate another user's clinic.
export const updateMyClinic = async (req, res) => {
  try {
    const allowed = [
      "clinicName",
      "ownerName",
      "phone",
      "alertEmail",
      "location",
      "countryCode",
      "googleBusinessUrl",
      "googleReviewLink",
    ];

    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return successResponse(res, { message: "No changes to apply", data: req.clinic });
    }

    await req.clinic.update(updates);

    auditFromReq(req, AUDIT_EVENTS.SETTINGS_UPDATED, {
      metadata: { changedFields: Object.keys(updates), section: "clinic" },
    });

    return successResponse(res, {
      message: "Clinic updated",
      data:    req.clinic,
    });
  } catch (err) {
    console.error("updateMyClinic error:", err);
    return serverErrorResponse(res);
  }
};