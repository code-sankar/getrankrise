// backend/src/app.js
//
// STEP 1 WIRING FIX — changes vs the previous version:
//   1. Mounts four routers that existed on disk but were never reachable:
//        /api/v1/oauth      (NEW oauth.routes.js — Google connect flow)
//        /api/v1/campaigns  (campaign.routes.js — Pulse Campaigns)
//        /api/v1/usage      (usage.routes.js — metered usage summary)
//        /api/v1/webhooks   (webhooks.routes.js — inbound Twilio STOP)
//   2. Deletes the stray app.use(express.json(...)) that sat between the 404
//      handler and the error handler — dead code that could never execute.
//
// INVARIANTS THAT MUST SURVIVE ANY FUTURE EDIT:
//   * The Paddle webhook is registered FIRST, before express.json(). Its
//     HMAC-SHA256 signature is computed over the exact raw bytes of the body;
//     any parser that runs first destroys verification. One webhook route,
//     here, before the body parser. Never a second one in billing.routes.js.
//   * /api/v1/webhooks (Twilio inbound) mounts AFTER express.urlencoded —
//     Twilio posts form-encoded and signs the PARAMS, not raw bytes, so the
//     normal parser is required, not harmful.
//   * The 404 handler comes after every route mount; errorHandler is last.

import express      from "express";
import cors         from "cors";
import helmet       from "helmet";
import morgan       from "morgan";
import cookieParser from "cookie-parser";
import rateLimit    from "express-rate-limit";
import { env }      from "./config/env.js";
import { handleWebhook } from "./controllers/billing.controller.js";

// ── Routes ────────────────────────────────────────────────────────────────────
import authRoutes         from "./routes/auth.routes.js";
import clinicRoutes       from "./routes/clinic.routes.js";
import memberRoutes       from "./routes/member.routes.js";   // team invites
import accountRoutes      from "./routes/account.routes.js";  // export + deletion
import settingsRoutes     from "./routes/settings.routes.js";
import reviewRoutes       from "./routes/review.routes.js";
import requestRoutes      from "./routes/request.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import analyticsRoutes    from "./routes/analytics.routes.js";
import subscriptionRoutes from "./routes/subscription.routes.js";
import billingRoutes      from "./routes/billing.routes.js";
import competitorRoutes   from "./routes/competitor.routes.js";
import oauthRoutes        from "./routes/oauth.routes.js";      // Step 1: new
import campaignRoutes     from "./routes/campaign.routes.js";   // Step 1: now mounted
import usageRoutes        from "./routes/usage.routes.js";      // Step 1: now mounted
import webhookRoutes      from "./routes/webhooks.routes.js";   // Step 1: now mounted
import planRoutes         from "./routes/plans.routes.js";      // public plan catalogue

// ── Middleware ────────────────────────────────────────────────────────────────
import { sanitize }     from "./middleware/sanitize.middleware.js";
import {
  withRequestContext,
  enrichRequestContext,
} from "./middleware/requestContext.middleware.js";
import { errorHandler } from "./middleware/error.middleware.js";

const app = express();

// ── Request correlation — FIRST, before anything that can fail ───────────────
// Every error reported from here on carries a request id, and the response
// echoes it in X-Request-Id. Mounted above the webhook route on purpose: a
// signature-verification failure is exactly the kind of thing you later need to
// correlate with Paddle's delivery log.
app.use(withRequestContext);

// ── Paddle webhook — raw body, BEFORE any parser ─────────────────────────────
// See invariant block at the top of this file.
app.post(
  "/api/v1/billing/webhook",
  express.raw({ type: "application/json", limit: "1mb" }),
  handleWebhook
);

// ── Trust proxy ───────────────────────────────────────────────────────────────
// Required for correct req.ip behind load balancers / reverse proxies.
// Keep this strict (number of proxies) in production, not just `true`.
app.set("trust proxy", env.NODE_ENV === "production" ? 1 : false);

// ── Security headers ──────────────────────────────────────────────────────────
// Helmet defaults are good but we tighten CSP for API responses (we serve JSON,
// not HTML — there's no reason to allow inline scripts).
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'none'"],          // no resources should ever load from API responses
        frameAncestors: ["'none'"],      // never embed our API in an iframe
        baseUri:        ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: "cross-origin" },
    referrerPolicy:            { policy: "no-referrer" },
    // HSTS only meaningful when behind HTTPS — helmet default includes it in prod
  })
);

// ── CORS ──────────────────────────────────────────────────────────────────────
// Accept a single CLIENT_URL or a comma-separated allow-list.
// Reject anything else. Credentials enabled for httpOnly cookie.
const allowedOrigins = (env.CLIENT_URL || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// A disallowed origin is a REJECTION, not a server fault.
//
// This used to `callback(new Error("Not allowed by CORS"))`, which propagates
// to errorHandler and came back as a 500 carrying the message and (in dev) a
// stack trace naming this file and line. Two things wrong with that: a
// misconfigured CLIENT_URL looked identical to a crash in error monitoring, and
// the response disclosed internal paths to precisely the caller we are refusing
// to talk to.
//
// Signalling "not allowed" as `callback(null, false)` makes the cors middleware
// simply omit the Access-Control-Allow-Origin header. The browser then blocks
// the request — which is the actual enforcement, and always was; the thrown
// error never added any protection. The explicit 403 below is for humans
// debugging with curl, where a silent 200 with no CORS headers is baffling.
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow same-origin / curl / mobile apps (no Origin header).
      // Note: the Google OAuth callback and provider webhooks arrive with no
      // Origin header, so they pass through here untouched — by design.
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
    methods:     ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
  })
);

// Runs after cors(), so a cross-origin request that was NOT allow-listed still
// has no Access-Control-Allow-Origin header on the response. Answer it plainly
// instead of letting it reach a route handler.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || allowedOrigins.includes(origin)) return next();

  return res.status(403).json({
    success: false,
    code: "ORIGIN_NOT_ALLOWED",
    message: "This origin is not permitted to call the API.",
  });
});

// ── Global rate limit ─────────────────────────────────────────────────────────
// Catch-all that protects against unauthenticated flooding. Per-route limiters
// (auth, AI, send, oauth callback, inbound SMS) sit on top for tighter caps.
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max:      env.NODE_ENV === "production" ? 200 : 1000,
  message:  { success: false, message: "Too many requests. Please try again shortly." },
  standardHeaders: true,
  legacyHeaders:   false,
});
app.use(globalLimiter);

// ── Body parsers ──────────────────────────────────────────────────────────────
// Keep limits modest — we never accept file uploads on this API.
// (Campaign CSV imports travel as a JSON string field and fit comfortably:
// campaign.routes.js caps csvText at 300KB via Joi, so the JSON limit below
// must stay ≥ that. 400kb gives the rest of the body headroom.)
app.use(express.json({ limit: "400kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));
app.use(cookieParser());

// ── Input sanitization (after body-parser, before routes) ────────────────────
app.use(sanitize);

// Copies req.user / req.clinic into the async context once the routers' own
// protect + loadClinic have set them. It runs BEFORE those, so it reads nulls
// on the first pass — the errorHandler re-reads at report time, by which point
// the router has filled them in on the same mutable store object.
app.use(enrichRequestContext);

// ── Request logging ───────────────────────────────────────────────────────────
// In dev: full pretty logs. In production: redacted format — never logs
// request bodies (which can contain passwords/tokens).
if (env.NODE_ENV === "development") {
  app.use(morgan("dev"));
} else {
  // Strip Authorization header from log output
  morgan.token("safe-header", (req) =>
    req.get("user-agent")?.replace(/[\r\n]/g, " ").slice(0, 120) || "-"
  );
  app.use(
    morgan(
      ':remote-addr - :method :url :status :res[content-length] - :response-time ms ":safe-header"'
    )
  );
}

// ── Health check ──────────────────────────────────────────────────────────────
// Mounted at BOTH paths on purpose:
//   /health         — root, where load balancers and platform probes expect it
//   /api/v1/health  — reachable by the frontend axios client, whose baseURL is
//                     already /api/v1 (hooks/healthCheck.js calls this one)
const health = (req, res) => {
  res.status(200).json({
    success:     true,
    message:     "Kirtify API is running",
    environment: env.NODE_ENV,
    timestamp:   new Date().toISOString(),
  });
};

app.get("/health", health);
app.get("/api/v1/health", health);

// ── API Routes — mounted under /api/v1 ───────────────────────────────────────
app.use("/api/v1/auth",          authRoutes);
// Mounted BEFORE /clinic so "members" resolves here rather than falling
// through to the clinic router. Express matches mounts in registration order,
// and a future /clinic/:something route would otherwise shadow it.
app.use("/api/v1/account",       accountRoutes);  // GDPR export + erasure
app.use("/api/v1/clinic/members", memberRoutes);
app.use("/api/v1/clinic",        clinicRoutes);
app.use("/api/v1/settings",      settingsRoutes);
app.use("/api/v1/reviews",       reviewRoutes);
app.use("/api/v1/requests",      requestRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/analytics",     analyticsRoutes);
app.use("/api/v1/subscription",  subscriptionRoutes);
app.use("/api/v1/billing",       billingRoutes);
app.use("/api/v1/competitors",   competitorRoutes);
app.use("/api/v1/oauth",         oauthRoutes);     // Google connect flow
app.use("/api/v1/campaigns",     campaignRoutes);  // Pulse Campaigns
app.use("/api/v1/usage",         usageRoutes);     // metered usage summary
app.use("/api/v1/webhooks",      webhookRoutes);   // inbound Twilio (STOP)
// Public on purpose — the marketing page's pricing section is an unauthenticated
// caller. Serving the catalogue from config/plans.js is what stops the frontend's
// FALLBACK_PLANS mirror from drifting.
app.use("/api/v1/plans",         planRoutes);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

// ── Global error handler — must be last ──────────────────────────────────────
app.use(errorHandler);

export default app;