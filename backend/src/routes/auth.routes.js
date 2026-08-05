import { Router } from "express";
import {
  register,
  login,
  logout,
  refreshToken,
  getMe,
  changePassword,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
} from "../controllers/auth.controller.js";
import { acceptInvitation } from "../controllers/member.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  validate,
  registerSchema,
  loginSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  acceptInviteSchema,
} from "../middleware/validate.middleware.js";
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

// ── Account-recovery limiters ─────────────────────────────────────────────────
//
// forgot-password is the most abusable unauthenticated endpoint in the app: it
// sends an email to an address the caller chooses, so an unbounded one is both
// a spam cannon pointed at third parties and a way to burn our SendGrid
// reputation. Successes COUNT here (unlike login) — the abuse being prevented
// is volume, not guessing.
//
// The cap is per-IP and deliberately low. A real person requests one link,
// maybe two if the first went to spam. Five in fifteen minutes is already
// generous, and the response is identical either way so a blocked attacker
// learns nothing from being blocked.
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: "Too many reset requests. Please try again in 15 minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Redeeming a token is a guessing target — 256 bits makes that hopeless, but
// the limiter costs nothing and bounds the noise. Only FAILED attempts count,
// so a user who clicks their own link twice is never throttled.
const tokenRedemptionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: "Too many attempts. Please try again in 15 minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Public routes ─────────────────────────────────────────────────────────────
router.post("/register",      registerLimiter, validate(registerSchema), register);
router.post("/login",         loginLimiter,    validate(loginSchema),    login);
router.post("/refresh-token",             refreshToken);

// ── Account recovery (public by necessity) ────────────────────────────────────
// All three are reached by someone who cannot sign in, or who is clicking a
// link from an inbox that may not be the browser holding the session. The
// emailed token is the proof — same posture as the OAuth callback and the
// Paddle webhook: signed, not sessioned.
router.post(
  "/forgot-password",
  forgotPasswordLimiter,
  validate(forgotPasswordSchema),
  asyncHandler(forgotPassword)
);
router.post(
  "/reset-password",
  tokenRedemptionLimiter,
  validate(resetPasswordSchema),
  asyncHandler(resetPassword)
);
router.post(
  "/verify-email",
  tokenRedemptionLimiter,
  validate(verifyEmailSchema),
  asyncHandler(verifyEmail)
);

// Accepting a team invitation can CREATE the account, so it cannot require one.
// Lives here rather than in the member router because it is an authentication
// event: it ends with a session being issued.
router.post(
  "/accept-invite",
  tokenRedemptionLimiter,
  validate(acceptInviteSchema),
  asyncHandler(acceptInvitation)
);

// ── Protected routes ──────────────────────────────────────────────────────────
router.post("/logout",          protect, logout);
router.get ("/me",              protect, getMe);
router.put ("/change-password", protect, validate(changePasswordSchema), changePassword);

// Triggered from inside the app by someone already signed in, so there is no
// address to enumerate. Rate-limited anyway: it sends mail.
router.post(
  "/resend-verification",
  protect,
  forgotPasswordLimiter,
  asyncHandler(resendVerification)
);

export default router;