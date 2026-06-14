import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import { loadClinic } from "../middleware/loadClinic.middleware.js";
import {
  validate,
  updateSettingsSchema,
  toggleSettingSchema,
} from "../middleware/validate.middleware.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  getSettings,
  updateSettings,
  toggleSetting,
} from "../controllers/settings.controller.js";

const router = Router();

router.use(protect, loadClinic);

router.get  ("/",       asyncHandler(getSettings));
router.put  ("/",       validate(updateSettingsSchema), asyncHandler(updateSettings));
router.patch("/toggle", validate(toggleSettingSchema),  asyncHandler(toggleSetting));

export default router;