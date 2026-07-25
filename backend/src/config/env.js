import dotenv from "dotenv";
dotenv.config();

// ── Required variables — app crashes immediately if any are missing ───────────
const REQUIRED = [
  "PORT",
  "DB_HOST",
  "DB_PORT",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD",
  "ACCESS_TOKEN_SECRET",
  "REFRESH_TOKEN_SECRET",
  "CLIENT_URL",
];

const missing = REQUIRED.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error(
    `\n❌ Missing required environment variables:\n   ${missing.join(", ")}\n`,
  );
  console.error(
    "   Check your .env file and make sure all variables are set.\n",
  );
  process.exit(1);
}

// ── Google OAuth prerequisites — soft-checked ────────────────────────────────
// Not in REQUIRED because the app must boot without them (dev machines that
// aren't touching OAuth). But if ANY of the trio is set, all three plus the
// encryption key must be, otherwise you get failures deep inside the flow.
const googleVars = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "API_PUBLIC_URL"];
const googleSet = googleVars.filter((k) => process.env[k]);
if (googleSet.length > 0 && googleSet.length < googleVars.length) {
  console.error(
    `\n❌ Partial Google OAuth config. Found ${googleSet.join(", ")} but missing ` +
      `${googleVars.filter((k) => !process.env[k]).join(", ")}. Set all of them or none.\n`
  );
  process.exit(1);
}
if (googleSet.length === googleVars.length && !process.env.TOKEN_ENCRYPTION_KEY) {
  console.error(
    "\n❌ Google OAuth is configured but TOKEN_ENCRYPTION_KEY is not set.\n" +
      "   Refusing to boot a config that would store OAuth tokens in plaintext.\n" +
      '   Generate one:  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n'
  );
  process.exit(1);
}

// ── Export validated env object — use this everywhere instead of process.env ─
export const env = {
  // Server
  PORT: parseInt(process.env.PORT, 10) || 5000,
  NODE_ENV: process.env.NODE_ENV || "development",

  // Database
  DB_HOST: process.env.DB_HOST,
  DB_PORT: parseInt(process.env.DB_PORT, 10) || 5432,
  DB_NAME: process.env.DB_NAME,
  DB_USER: process.env.DB_USER,
  DB_PASSWORD: process.env.DB_PASSWORD,

  // JWT
  ACCESS_TOKEN_SECRET: process.env.ACCESS_TOKEN_SECRET,
  REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET,
  ACCESS_TOKEN_EXPIRY: process.env.ACCESS_TOKEN_EXPIRY || "15m",
  REFRESH_TOKEN_EXPIRY: process.env.REFRESH_TOKEN_EXPIRY || "7d",

  // Frontend
  CLIENT_URL: process.env.CLIENT_URL,

  // ── Google OAuth (Phase 1) ─────────────────────────────────────────────
  // API_PUBLIC_URL: the base URL Google can reach for the OAuth callback.
  //   local dev  → http://localhost:5000  (register this exact redirect URI
  //                in Cloud Console: http://localhost:5000/api/v1/oauth/google/callback)
  //   production → https://api.getrankrise.com
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || null,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || null,
  API_PUBLIC_URL: (process.env.API_PUBLIC_URL || "").replace(/\/+$/, "") || null,
  // Flip to "true" while waiting on Google's Business Profile API approval —
  // discovery endpoints return deterministic mock accounts/locations so the
  // whole connect flow is testable end to end. NEVER true in production.
  GOOGLE_MOCK_DISCOVERY: process.env.GOOGLE_MOCK_DISCOVERY || "false",

  // ── Token encryption at rest (Phase 1) ─────────────────────────────────
  // 64 hex chars = 32 bytes for AES-256-GCM. See src/utils/crypto.js.
  TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY || null,
  TOKEN_ENCRYPTION_KEY_PREVIOUS: process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS || null,

  // Third party (optional — only validated when features are used)
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || null,
  TWILIO_SID: process.env.TWILIO_ACCOUNT_SID || null,
  TWILIO_TOKEN: process.env.TWILIO_AUTH_TOKEN || null,
  TWILIO_PHONE: process.env.TWILIO_PHONE_NUMBER || null,
  SENDGRID_API_KEY: process.env.SENDGRID_API_KEY || null,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || null,
  APIFY_TOKEN: process.env.APIFY_TOKEN,
  DATAFORSEO_LOGIN: process.env.DATAFORSEO_LOGIN,
  DATAFORSEO_PASSWORD: process.env.DATAFORSEO_PASSWORD,
};