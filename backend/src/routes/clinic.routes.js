import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import { loadClinic } from "../middleware/loadClinic.middleware.js";
import { validate, updateClinicSchema } from "../middleware/validate.middleware.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { getMyClinic, updateMyClinic } from "../controllers/clinic.controller.js";

const router = Router();

// All routes here require an authenticated user with a clinic
router.use(protect, loadClinic);

router.get("/me",  asyncHandler(getMyClinic));
router.put("/me",  validate(updateClinicSchema), asyncHandler(updateMyClinic));

export default router;