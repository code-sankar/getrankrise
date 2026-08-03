// backend/src/routes/notification.routes.js
import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  listNotifications, markRead, markAllRead, dismissNotification,
} from "../controllers/notification.controller.js";

const router = Router();
router.use(protect);                       // scoped by userId, not clinicId

router.get   ("/",             asyncHandler(listNotifications));
router.patch ("/read-all",     asyncHandler(markAllRead));
router.patch ("/:id/read",     asyncHandler(markRead));
router.delete("/:id",          asyncHandler(dismissNotification));

export default router;