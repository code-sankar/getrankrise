import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import { loadClinic } from "../middleware/loadClinic.middleware.js";
import { successResponse } from "../utils/apiResponse.js";

/**
 * analytics.routes.js — stub.
 * The analytics dashboard is currently computed client-side from mock data
 * (see frontend/src/api/analyticsAPI.js), so this endpoint isn't wired up yet.
 * This stub exists so app.js can import it and the server boots. Replace the
 * handler with a real controller when you build server-side analytics.
 */
const router = Router();

router.use(protect, loadClinic);

router.get("/", (req, res) =>
  successResponse(res, {
    message: "Analytics endpoint not implemented yet",
    data:    null,
  })
);

export default router;