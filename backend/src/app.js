import express      from "express";
import cors         from "cors";
import helmet       from "helmet";
import morgan       from "morgan";
import cookieParser from "cookie-parser";
import rateLimit    from "express-rate-limit";
import { env }      from "./config/env.js";

// ── Routes ────────────────────────────────────────────────────────────────────
import authRoutes         from "./routes/auth.routes.js";
import clinicRoutes       from "./routes/clinic.routes.js";
import settingsRoutes     from "./routes/settings.routes.js";
import reviewRoutes       from "./routes/review.routes.js";
import requestRoutes      from "./routes/request.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import analyticsRoutes    from "./routes/analytics.routes.js";
import subscriptionRoutes from "./routes/subscription.routes.js";

// ── Middleware ────────────────────────────────────────────────────────────────
import { sanitize }     from "./middleware/sanitize.middleware.js";
import { errorHandler } from "./middleware/error.middleware.js";

const app = express();

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
    // HSTS only meaningful when behind HTTPS — keep helmet default which already includes it in prod
  })
);

// ── CORS ──────────────────────────────────────────────────────────────────────
// Accept a single CLIENT_URL or a comma-separated allow-list.
// Reject anything else. Credentials enabled for httpOnly cookie.
const allowedOrigins = (env.CLIENT_URL || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow same-origin / curl / mobile apps (no Origin header)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods:     ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
  })
);

// ── Global rate limit ─────────────────────────────────────────────────────────
// Catch-all that protects against unauthenticated flooding. Per-route limiters
// (auth, AI, send) sit on top for tighter caps.
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
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));
app.use(cookieParser());

// ── Input sanitization (after body-parser, before routes) ────────────────────
app.use(sanitize);

// ── Request logging ───────────────────────────────────────────────────────────
// In dev: full pretty logs. In production: redacted Apache combined format —
// never logs request bodies (which can contain passwords/tokens).
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
app.get("/health", (req, res) => {
  res.status(200).json({
    success:     true,
    message:     "GetRankRise API is running",
    environment: env.NODE_ENV,
    timestamp:   new Date().toISOString(),
  });
});

// ── API Routes — mounted under /api/v1 ───────────────────────────────────────
app.use("/api/v1/auth",          authRoutes);
app.use("/api/v1/clinic",        clinicRoutes);
app.use("/api/v1/settings",      settingsRoutes);
app.use("/api/v1/reviews",       reviewRoutes);
app.use("/api/v1/requests",      requestRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/analytics",     analyticsRoutes);
app.use("/api/v1/subscription",  subscriptionRoutes);

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