// backend/src/routes/usage.routes.js
//
// GET /api/v1/usage — the current period's metered usage across every metric,
// for the Settings page and any future usage pills (the CreditsPill pattern
// generalises directly: same { used, limit, remaining } triple per metric,
// with limit:null meaning "unlimited on this plan").
//
// Mount in app.js:
//     import usageRoutes from "./routes/usage.routes.js";
//     app.use("/api/v1/usage", usageRoutes);

import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import { loadClinic } from "../middleware/loadClinic.middleware.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { getUsageSummary } from "../services/usage/usage.service.js";
import { successResponse } from "../utils/apiResponse.js";

const router = Router();

router.use(protect, loadClinic);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const summary = await getUsageSummary(req.clinic.id);
    return successResponse(res, {
      message: "Usage fetched",
      data: summary,
    });
  })
);

export default router;