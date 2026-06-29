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
