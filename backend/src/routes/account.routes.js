// backend/src/routes/account.routes.js
//
// Data export and account deletion. Mounted at /api/v1/account.
//
// ── Why export is owner-only but deletion is not ───────────────────────────
// They are different rights over different data.
//
// The export is the WHOLE clinic — every member's email, every patient's phone
// number, every message ever sent. That is the clinic's data, and the owner is
// who holds it. A receptionist downloading the complete patient contact list on
// their way out of a job is precisely the thing this must not enable.
//
// Deletion is available to everyone, because the right to erasure is personal.
// A staff member may always delete THEIR OWN account; the controller scopes
// what that means by role, and only an owner's deletion takes the clinic with
// it. Making deletion owner-only would mean a staff member could never leave.

import { Router } from "express";
import rateLimit from "express-rate-limit";
import Joi from "joi";
import { protect } from "../middleware/auth.middleware.js";
import { loadClinic, restrictTo } from "../middleware/loadClinic.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  exportAccountData,
  previewDeletion,
  deleteAccount,
} from "../controllers/account.controller.js";

const router = Router();

// A full export is a large, uncached, multi-table read. Nobody needs it more
// than a few times a day, and an unbounded one is a cheap way to make the
// database work hard on someone else's behalf.
const exportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: "You've requested several exports recently. Please try again in an hour.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Deletion takes a password, so it is a password-guessing surface like login.
// Only FAILED attempts count — someone who confirms correctly on the second try
// after a typo is not an attacker.
const deleteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: "Too many failed confirmation attempts. Please try again in 15 minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Both gates are required. The password proves identity (an access token only
// proves someone had the laptop); the typed confirmation proves intent.
const deleteAccountSchema = Joi.object({
  password: Joi.string().required().messages({
    "any.required": "Enter your password to confirm.",
    "string.empty": "Enter your password to confirm.",
  }),
  confirm: Joi.string().required().messages({
    "any.required": "Type the confirmation text to continue.",
    "string.empty": "Type the confirmation text to continue.",
  }),
});

router.use(protect, loadClinic);

router.get(
  "/export",
  exportLimiter,
  restrictTo("owner"),
  asyncHandler(exportAccountData)
);

// Not owner-gated: a staff member needs to see what deleting THEIR account
// does before they do it. The controller returns a different shape per role.
router.get("/deletion-preview", asyncHandler(previewDeletion));

router.delete(
  "/",
  deleteLimiter,
  validate(deleteAccountSchema),
  asyncHandler(deleteAccount)
);

export default router;
