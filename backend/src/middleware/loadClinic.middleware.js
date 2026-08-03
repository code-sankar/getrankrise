// backend/src/middleware/loadClinic.middleware.js
import { Clinic } from "../models/index.js";
import { notFoundResponse, unauthorisedResponse } from "../utils/apiResponse.js";

// Must run AFTER protect — depends on req.user. Sets req.clinic, the tenant
// boundary every controller scopes its queries by.
export const loadClinic = async (req, res, next) => {
  try {
    if (!req.user?.id) return unauthorisedResponse(res, "Not authenticated");

    const clinic = await Clinic.findOne({ where: { userId: req.user.id } });
    if (!clinic) {
      return notFoundResponse(res, "No clinic found for this account");
    }

    req.clinic = clinic;
    return next();
  } catch (err) {
    return next(err);
  }
};