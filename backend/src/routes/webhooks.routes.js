// backend/src/routes/webhooks.routes.js
//
// Inbound provider webhooks. NO auth middleware — these arrive from Twilio,
// not a browser; authentication is the X-Twilio-Signature HMAC verified in
// the controller. (Same pattern as the Paddle webhook and OAuth callback:
// signed, not sessioned.)
//
// Mount in app.js AFTER express.urlencoded (Twilio posts form-encoded, and
// unlike Paddle the signature covers the PARAMS, not raw bytes — so the
// normal parser is fine here):
//     import webhookRoutes from "./routes/webhooks.routes.js";
//     app.use("/api/v1/webhooks", webhookRoutes);

import { Router } from "express";
import rateLimit from "express-rate-limit";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { inboundSms } from "../controllers/inboundSms.controller.js";

const router = Router();

const inboundLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120, // Twilio bursts on shortcode traffic; generous but bounded
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/sms/inbound", inboundLimiter, asyncHandler(inboundSms));

export default router;