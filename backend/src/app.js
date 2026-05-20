import express      from "express";
import cors         from "cors";
import helmet       from "helmet";
import morgan       from "morgan";
import cookieParser from "cookie-parser";
import { env }      from "./config/env.js";

// ── Routes (we will import these as we build them) ────────────────────────────
// import authRoutes         from "./routes/auth.routes.js";
// import clinicRoutes       from "./routes/clinic.routes.js";
// import reviewRoutes       from "./routes/review.routes.js";
// import requestRoutes      from "./routes/request.routes.js";
// import notificationRoutes from "./routes/notification.routes.js";
// import analyticsRoutes    from "./routes/analytics.routes.js";

// ── Error middleware ──────────────────────────────────────────────────────────
import { errorHandler } from "./middleware/error.middleware.js";

const app = express();

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS — allow frontend to talk to backend ──────────────────────────────────
app.use(
  cors({
    origin:      env.CLIENT_URL,
    credentials: true, // allow httpOnly cookies
    methods:     ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ── Body parsers ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ── Cookie parser — needed for httpOnly refresh token ─────────────────────────
app.use(cookieParser());

// ── Request logging (only in development) ─────────────────────────────────────
if (env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// ── Health check — quick way to verify server is alive ───────────────────────
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "GetRankRise API is running",
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ── API Routes — mounted under /api/v1 ───────────────────────────────────────
// app.use("/api/v1/auth",          authRoutes);
// app.use("/api/v1/clinic",        clinicRoutes);
// app.use("/api/v1/reviews",       reviewRoutes);
// app.use("/api/v1/requests",      requestRoutes);
// app.use("/api/v1/notifications", notificationRoutes);
// app.use("/api/v1/analytics",     analyticsRoutes);

// ── 404 handler — catches any unmatched route ─────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

// ── Global error handler — must be last ──────────────────────────────────────
app.use(errorHandler);

export default app;