import { Router } from "express";
import rateLimit from "express-rate-limit";
import { protect } from "../middleware/auth.middleware.js";
import { loadClinic } from "../middleware/loadClinic.middleware.js";
import { requireFeature } from "../middleware/tierCap.middleware.js";
import {
  validate,
  addCompetitorSchema,
  updateCompetitorSchema,
  idParamSchema,
} from "../middleware/validate.middleware.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  listCompetitors,
  getOverview,
  getCompetitor,
  addCompetitor,
  updateCompetitor,
  deleteCompetitor,
  refreshCompetitor,
} from "../controllers/competitor.controller.js";

const router = Router();

// ── Manual-refresh rate limit ─────────────────────────────────────────────────
// Scrapes are slow and metered by the provider. Cap manual syncs so one user
// can't hammer the upstream API.  10 / 10 min per IP.
const refreshLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max:      10,
  message:  { success: false, message: "Too many refresh requests. Please wait a few minutes." },
  standardHeaders: true,
  legacyHeaders:   false,
});

// Every route: authenticated → clinic loaded → plan must include competitor
// tracking (blocks Free tier entirely; Starter/Premium pass through).
router.use(protect, loadClinic, requireFeature("competitorTracking"));

router.get("/",          asyncHandler(listCompetitors));
router.get("/overview",  asyncHandler(getOverview));

router.get(
  "/:id",
  validate(idParamSchema, "params"),
  asyncHandler(getCompetitor)
);

router.post(
  "/",
  validate(addCompetitorSchema),
  asyncHandler(addCompetitor)
);

router.patch(
  "/:id",
  validate(idParamSchema, "params"),
  validate(updateCompetitorSchema),
  asyncHandler(updateCompetitor)
);

router.delete(
  "/:id",
  validate(idParamSchema, "params"),
  asyncHandler(deleteCompetitor)
);

router.post(
  "/:id/refresh",
  refreshLimiter,
  validate(idParamSchema, "params"),
  asyncHandler(refreshCompetitor)
);

export default router;