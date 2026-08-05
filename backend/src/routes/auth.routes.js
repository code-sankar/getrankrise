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

// ── Rate limiters ─────────────────────────────────────────────────────────────
//
// These were ONE limiter shared by register and login, capped at 10 requests
// per 15 minutes per IP, counting SUCCESSES. Two problems, both real:
//
//   1. Counting successful logins punishes exactly the wrong people. Clinics
//      sit behind one office NAT and mobile users behind carrier CGNAT, so a
//      handful of staff signing in normally shares a single counter — ten
//      successful logins in fifteen minutes and everybody is locked out for
//      the rest of the window, having done nothing wrong.
//   2. Sharing the counter with register means a signup burst locks out
//      login, and vice versa. They are different actions with different abuse
//      profiles and belong in different buckets.
//
// skipSuccessfulRequests is what makes this a brute-force control rather than
// a usage cap: only FAILED attempts count, so an attacker guessing passwords
// is throttled after 10 wrong answers while a real user who signs in
// correctly is never counted at all.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      10,               // ten FAILED attempts
  skipSuccessfulRequests: true,
  message:  { success: false, message: "Too many failed sign-in attempts. Please try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders:   false,
});

// Registration is a write that creates real rows, so successes DO count here —
// the abuse being prevented is bulk account creation, not password guessing.
// The cap is per-IP and generous enough for a shared office to onboard a team.
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max:      20,
  message:  { success: false, message: "Too many accounts created from this network. Please try again later." },
  standardHeaders: true,
  legacyHeaders:   false,
});

// ── Public routes ─────────────────────────────────────────────────────────────
router.post("/register",      registerLimiter, validate(registerSchema), register);
router.post("/login",         loginLimiter,    validate(loginSchema),    login);
router.post("/refresh-token",             refreshToken);

// ── Protected routes ──────────────────────────────────────────────────────────
router.post("/logout",          protect, logout);
router.get ("/me",              protect, getMe);
router.put ("/change-password", protect, validate(changePasswordSchema), changePassword);

export default router;