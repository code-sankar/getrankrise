// backend/src/controllers/subscription.controller.js — add this export
import { getCreditSummary } from "../services/credits/credits.service.js";
import { successResponse, notFoundResponse } from "../utils/apiResponse.js";

export const getCredits = async (req, res) => {
  const summary = await getCreditSummary(req.clinic.id);
  if (!summary) return notFoundResponse(res, "No subscription found");
  return successResponse(res, { message: "Credits fetched", data: summary });
};