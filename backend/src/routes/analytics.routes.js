// backend/src/routes/analytics.routes.js
//
// Phase 4: the stub is gone. This was previously a placeholder returning
// { data: null } so app.js could import it and the server would boot (the
// import-graph lesson from the early days). It now serves real SQL-aggregated
// analytics from services/analytics/analytics.service.js.
import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import { loadClinic } from "../middleware/loadClinic.middleware.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  getAnalyticsHandler,
  exportAnalyticsCsv,
} from "../controllers/analytics.controller.js";

const router = Router();

router.use(protect, loadClinic);

// Analytics are available on EVERY tier — the Free plan's pitch includes a
// "basic analytics feed". The tier difference is enforced inside the service:
// Free aggregates over its storedReviewsLimit window (the same 20 rows the
// review feed shows), paid tiers over everything. No requireFeature gate here.
router.get("/", asyncHandler(getAnalyticsHandler));
router.get("/export", asyncHandler(exportAnalyticsCsv));

export default router;