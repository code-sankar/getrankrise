// backend/src/routes/notification.routes.js
import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validate, idParamSchema } from "../middleware/validate.middleware.js";
import {
  listNotifications, markRead, markAllRead, dismissNotification,
} from "../controllers/notification.controller.js";

const router = Router();
router.use(protect);                       // scoped by userId, not clinicId

// :id is validated for the same reason every other router validates it. Without
// it a non-UUID reached Postgres, which rejected the comparison with 22P02, and
// errorHandler turned that into a 500 whose body carried the raw driver text
// ("invalid input syntax for type uuid"). A client typo is a 400, and the
// database's internals are not part of the API contract.
router.get   ("/",             asyncHandler(listNotifications));
router.patch ("/read-all",     asyncHandler(markAllRead));
router.patch ("/:id/read",     validate(idParamSchema, "params"), asyncHandler(markRead));
router.delete("/:id",          validate(idParamSchema, "params"), asyncHandler(dismissNotification));

export default router;