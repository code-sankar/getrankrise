import { Router } from "express";
import {
  register,
  login,
  logout,
  refreshToken,
  getMe,
  changePassword,
} from "../controllers/auth.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { validate, registerSchema, loginSchema, changePasswordSchema } from "../middleware/validate.middleware.js";
import rateLimit from "express-rate-limit";

const router = Router();

// ── Rate limiter for auth routes ──────────────────────────────────────────────
// Max 10 attempts per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      10,
  message:  { success: false, message: "Too many attempts. Please try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders:   false,
});

// ── Public routes ─────────────────────────────────────────────────────────────
router.post("/register",      authLimiter, validate(registerSchema), register);
router.post("/login",         authLimiter, validate(loginSchema),    login);
router.post("/refresh-token",             refreshToken);

// ── Protected routes ──────────────────────────────────────────────────────────
router.post("/logout",          protect, logout);
router.get ("/me",              protect, getMe);
router.put ("/change-password", protect, validate(changePasswordSchema), changePassword);

export default router;