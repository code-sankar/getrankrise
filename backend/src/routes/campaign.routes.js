// backend/src/routes/campaign.routes.js
import { Router } from "express";
import Joi from "joi";
import { protect } from "../middleware/auth.middleware.js";
import { loadClinic } from "../middleware/loadClinic.middleware.js";
import { requireFeature } from "../middleware/tierCap.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  create,
  list,
  getOne,
  start,
  pause,
  resume,
  cancel,
  addOptOut,
} from "../controllers/campaign.controller.js";

const router = Router();

const createSchema = Joi.object({
  name: Joi.string().min(2).max(150).required(),
  channel: Joi.string().valid("SMS", "WhatsApp").required(),
  messageTemplate: Joi.string().min(10).max(1000).required(),
  csvText: Joi.string().min(3).max(300_000).required(), // ~2000 rows fits
  scheduledAt: Joi.date().iso().greater("now").allow(null),
  throttlePerMinute: Joi.number().integer().min(1).max(60).default(10),
});

const idSchema = Joi.object({ id: Joi.string().uuid().required() });
const optOutSchema = Joi.object({ phone: Joi.string().min(7).max(20).required() });

// Every route: auth → clinic → plan must include Pulse Campaigns.
// requireFeature blocks Free entirely AND blocks paid-but-past-due, and
// stashes req.subscription for the WhatsApp-on-Starter check in the service.
router.use(protect, loadClinic, requireFeature("pulseCampaignsEnabled"));

router.get("/", asyncHandler(list));
router.post("/", validate(createSchema), asyncHandler(create));
router.post("/opt-outs", validate(optOutSchema), asyncHandler(addOptOut));

router.get("/:id", validate(idSchema, "params"), asyncHandler(getOne));
router.post("/:id/start", validate(idSchema, "params"), asyncHandler(start));
router.post("/:id/pause", validate(idSchema, "params"), asyncHandler(pause));
router.post("/:id/resume", validate(idSchema, "params"), asyncHandler(resume));
router.post("/:id/cancel", validate(idSchema, "params"), asyncHandler(cancel));

export default router;