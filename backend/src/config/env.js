// backend/src/config/env.js
//
// The one place environment configuration is read and validated. Import `env`
// from here rather than touching process.env in application code.
//
// ── STEP 5 CHANGES ──────────────────────────────────────────────────────────
//   1. Deleted a self-import. This file used to contain, between the REQUIRED
//      array and the missing-vars check:
//          import { env } from "../config/env.js";
//      which resolves to this very file. It survived only because `env` was
//      never read before its own definition — an ESM temporal-dead-zone hazard
//      one top-level read away from a boot crash.
//   2. The all-or-nothing soft-check is now a reusable function instead of two
//      hand-written blocks, and covers every provider group rather than just
//      Google and Paddle. Facebook, SendGrid, MSG91 and Twilio were previously
//      unchecked: half-configuring any of them booted cleanly and failed deep
//      inside a user-facing flow (a consent screen that 400s, a send that
//      throws after the credit was already reserved).
//   3. Production tripwires for the mock/simulate switches. Every mock in this
//      codebase has its own local guard, but a guard that fires at request
//      time still means a production deploy that looked healthy at boot.
//   4. env.FEATURES — a computed map of which integrations are actually
//      usable, logged once at startup. Reading a boot log is how you should be
//      able to answer "is email configured on staging?".
//
// ── WHAT THIS FILE DELIBERATELY DOES NOT DO ─────────────────────────────────
// It does not re-export every provider secret. Several services read
// process.env directly on purpose and say so in their headers
// (msg91.provider.js, yelpReviews.provider.js, facebookAuth.service.js,
// email.service.js). Duplicating those values here would create two sources of
// truth for the same string. What this file adds is VALIDATION and the
// boolean answer to "is this integration configured?" — the secrets stay
// wherever their owner reads them.

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
    `\n❌ Missing required environment variables:\n   ${missing.join(", ")}\n`
  );
  console.error("   Check your .env file and make sure all variables are set.\n");
  console.error("   Start from backend/.env.example.\n");
  process.exit(1);
}

const isSet = (key) => Boolean(process.env[key]);
const NODE_ENV = process.env.NODE_ENV || "development";
const isProduction = NODE_ENV === "production";

// ── The all-or-nothing group check ───────────────────────────────────────────
/**
 * Every integration here is OPTIONAL at boot — a dev box that isn't touching
 * payments or Facebook must still start. But each is all-or-nothing: the
 * moment ANY variable in a group is set, the whole group must be, because a
 * half-configured integration is strictly worse than an absent one. An absent
 * one fails fast and honestly ("Facebook isn't configured on the server yet");
 * a half-configured one gets far enough to take the user's click, burn their
 * quota, or accept a payment it cannot verify.
 *
 * @param {Object} group
 * @param {string} group.label     human name used in the error
 * @param {string[]} group.vars    variables that must be set together
 * @param {string[]} [group.requires]  additional vars required only when the
 *                                     group is configured (e.g. token
 *                                     encryption for anything storing OAuth
 *                                     grants at rest)
 * @param {string} [group.why]     one line explaining the failure mode, printed
 *                                 with the error — the reason matters more
 *                                 than the rule
 * @returns {boolean} whether the group is fully configured
 */
function checkGroup({ label, vars, requires = [], why }) {
  const set = vars.filter(isSet);

  // Nothing set — the integration is simply off. Legitimate.
  if (set.length === 0) return false;

  if (set.length < vars.length) {
    const absent = vars.filter((k) => !isSet(k));
    console.error(
      `\n❌ Partial ${label} configuration.\n` +
        `   Found:   ${set.join(", ")}\n` +
        `   Missing: ${absent.join(", ")}\n` +
        `   Set all of them or none of them.\n` +
        (why ? `   Why: ${why}\n` : "")
    );
    process.exit(1);
  }

  const missingDeps = requires.filter((k) => !isSet(k));
  if (missingDeps.length > 0) {
    console.error(
      `\n❌ ${label} is configured but ${missingDeps.join(", ")} ${
        missingDeps.length === 1 ? "is" : "are"
      } not set.\n` + (why ? `   Why: ${why}\n` : "")
    );
    if (missingDeps.includes("TOKEN_ENCRYPTION_KEY")) {
      console.error(
        "   Generate one:  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"\n"
      );
    }
    process.exit(1);
  }

  return true;
}

// ── Provider groups ──────────────────────────────────────────────────────────
const FEATURES = {
  // Google Business Profile OAuth. API_PUBLIC_URL is the base Google redirects
  // back to, so it belongs to the group rather than being incidental.
  googleOAuth: checkGroup({
    label: "Google OAuth",
    vars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "API_PUBLIC_URL"],
    requires: ["TOKEN_ENCRYPTION_KEY"],
    why:
      "the OAuth grant is stored in platform_connections; refusing to boot a " +
      "config that would write refresh tokens in plaintext.",
  }),

  // Paddle, Merchant of Record. The webhook secret is in the group because a
  // checkout that works while webhooks fail signature verification leaves
  // paying customers on the free tier with no visible error anywhere except
  // Paddle's delivery log.
  paddle: checkGroup({
    label: "Paddle billing",
    vars: [
      "PADDLE_API_KEY",
      "PADDLE_WEBHOOK_SECRET",
      "PADDLE_PRICE_ID_STARTER",
      "PADDLE_PRICE_ID_PREMIUM",
    ],
    why:
      "a half-configured billing integration accepts payments it cannot " +
      "verify, and the failure is invisible from inside the app.",
  }),

  // Facebook Page reviews. Same shape as Google: OAuth redirect + encrypted
  // long-lived token at rest.
  facebook: checkGroup({
    label: "Facebook",
    vars: ["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET"],
    requires: ["API_PUBLIC_URL", "TOKEN_ENCRYPTION_KEY"],
    why:
      "the consent redirect URI is built from API_PUBLIC_URL, and the " +
      "long-lived user token and Page token are stored encrypted.",
  }),

  // Transactional review-request email. SendGrid rejects mail from an
  // unverified sender, so the FROM address is not optional trimming.
  sendgrid: checkGroup({
    label: "SendGrid email",
    vars: ["SENDGRID_API_KEY", "SENDGRID_FROM_EMAIL"],
    why:
      "SendGrid rejects mail from unverified senders — a key without a " +
      "verified FROM address fails every send AFTER the email quota has " +
      "already been reserved.",
  }),

  // MSG91 — domestic Indian SMS. DLT registration means the sender ID and
  // template ID are as mandatory as the auth key; TRAI rejects sends without
  // a registered header/template.
  msg91: checkGroup({
    label: "MSG91 SMS (India)",
    vars: ["MSG91_AUTH_KEY", "MSG91_SENDER_ID", "MSG91_TEMPLATE_ID"],
    why:
      "TRAI/DLT requires a registered sender header AND template — an auth " +
      "key alone produces sends that are accepted by the API and dropped by " +
      "the carrier.",
  }),

  // Twilio — international SMS and ALL WhatsApp (MSG91 is SMS-only, so
  // WhatsApp routes to Twilio regardless of country).
  twilio: checkGroup({
    label: "Twilio",
    vars: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER"],
    why:
      "Twilio handles international SMS and every WhatsApp message on every " +
      "plan; a partial config silently breaks the WhatsApp channel.",
  }),

  // Competitor intelligence. Either provider works; neither falls back to the
  // deterministic mock (which is why this is a warning, not a failure).
  dataForSeo: checkGroup({
    label: "DataForSEO",
    vars: ["DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD"],
  }),

  // Single-variable integrations — nothing to be partial about.
  yelp: isSet("YELP_API_KEY"),
  apify: isSet("APIFY_TOKEN"),
  openai: isSet("OPENAI_API_KEY"),
};

// ── Production tripwires ─────────────────────────────────────────────────────
// Each mock below has its own runtime guard. Those guards fire at REQUEST
// time, which means a production deploy can look completely healthy at boot
// and start failing (or worse, succeeding with fake data) once traffic
// arrives. These checks move the failure to startup, where a deploy pipeline
// can see it.
if (isProduction) {
  const truthy = (k) => String(process.env[k]).toLowerCase() === "true";

  const FATAL_IN_PROD = [
    ["REVIEWS_MOCK", "REVIEWS_MOCK_ALLOW_PROD", "the sync scheduler would fill real clinic dashboards with fabricated reviews on a timer"],
    ["GOOGLE_MOCK_DISCOVERY", null, "the Google location picker would offer fake locations to real customers"],
    ["FACEBOOK_MOCK_DISCOVERY", null, "the Facebook Page picker would offer fake Pages to real customers"],
    ["EMAIL_SIMULATE", null, "review-request emails would be logged instead of sent, while the email quota is still consumed"],
    ["DB_SYNC_ALTER", null, "Sequelize would infer and issue ALTER statements against a schema owned by migrations"],
  ];

  const violations = FATAL_IN_PROD.filter(
    ([key, override]) => truthy(key) && !(override && truthy(override))
  );

  if (violations.length > 0) {
    console.error("\n❌ Development-only switches are enabled with NODE_ENV=production:\n");
    for (const [key, , why] of violations) {
      console.error(`   ${key}=true — ${why}`);
    }
    console.error("\n   Refusing to start. Unset these before deploying.\n");
    process.exit(1);
  }

  if ((process.env.PADDLE_ENVIRONMENT || "sandbox") !== "production" && FEATURES.paddle) {
    console.warn(
      "⚠️  PADDLE_ENVIRONMENT is not 'production' while NODE_ENV=production — " +
        "checkouts will hit Paddle sandbox and no real money will move."
    );
  }

  // ── Competitor intelligence must have a real provider ──────────────────────
  // Unlike REVIEWS_MOCK this mock has no flag to check: competitor.service.js
  // picks it by the ABSENCE of credentials, so an unfilled block looks exactly
  // like a working feature. It returns deterministic numbers derived from a sum
  // of the competitor's name characters, and syncCompetitor writes them with
  // syncStatus "ok" and no error — so a Starter/Premium clinic paying for
  // benchmarking sees invented ratings and review counts presented as fact,
  // with nothing anywhere to indicate they are fabricated.
  //
  // Same shape as the Twilio requirement below: refuse to boot rather than let
  // it be discovered by a customer. ALLOW_MOCK_COMPETITOR_DATA exists for a
  // prod-like staging box that genuinely wants the fixture data; setting it has
  // to be deliberate, because the default cannot be "quietly invent numbers".
  const allowMockCompetitors =
    String(process.env.ALLOW_MOCK_COMPETITOR_DATA).toLowerCase() === "true";

  if (!FEATURES.apify && !FEATURES.dataForSeo && !allowMockCompetitors) {
    console.error(
      "\n❌ No competitor-data provider configured with NODE_ENV=production.\n" +
        "   Set APIFY_TOKEN, or DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD.\n" +
        "   Without one, the tracker falls back to a deterministic MOCK whose\n" +
        "   fabricated ratings and review counts are stored and rendered as real\n" +
        "   competitor intelligence on a paid feature.\n\n" +
        "   Set ALLOW_MOCK_COMPETITOR_DATA=true if this instance is a staging\n" +
        "   environment that deliberately wants fixture data.\n"
    );
    process.exit(1);
  }

  if (allowMockCompetitors) {
    console.warn(
      "⚠️  ALLOW_MOCK_COMPETITOR_DATA=true in production — competitor metrics " +
        "will be FABRICATED fixture data, not real measurements."
    );
  }

  // ── Twilio is MANDATORY in production ──────────────────────────────────────
  // This used to be a console.warn, and only when BOTH providers were absent.
  // Two things were wrong with that.
  //
  // First, a warning is invisible: it scrolls past in a deploy log and the app
  // serves traffic. The providers respond to missing credentials by returning
  // { status: "simulated" }, which every caller treats as success — campaigns
  // increment sent_count, the UI shows "Sent", the clinic's credit is spent,
  // and no patient receives anything. There is no error anywhere to find.
  //
  // Second, requiring only "one of the two" was wrong on the merits. Twilio
  // carries international SMS AND every WhatsApp message on every plan (MSG91's
  // sendWhatsApp throws "not implemented"), so an MSG91-only production deploy
  // silently simulates the entire Premium WhatsApp channel. MSG91 stays
  // optional — it is a cost optimisation for Indian SMS, and sms/index.js now
  // falls back to Twilio for Indian numbers when it is absent.
  //
  // ALLOW_SIMULATED_SENDS exists for the genuine case of a production instance
  // that never sends (a read-only analytics replica, a web role with
  // CAMPAIGN_RUNNER_DISABLED). It has to be set deliberately, which is the
  // point — the default cannot be "quietly pretend".
  const allowSimulated =
    String(process.env.ALLOW_SIMULATED_SENDS).toLowerCase() === "true";

  if (!FEATURES.twilio && !allowSimulated) {
    console.error(
      "\n❌ No Twilio configuration with NODE_ENV=production.\n" +
        "   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER are\n" +
        "   required: Twilio carries international SMS and EVERY WhatsApp message.\n" +
        "   Without them the providers return status:\"simulated\", which the whole\n" +
        "   codebase treats as a successful send — campaigns would report \"Sent\",\n" +
        "   spend the clinic's credits, and deliver nothing.\n\n" +
        "   Set them, or set ALLOW_SIMULATED_SENDS=true if this instance is\n" +
        "   genuinely not meant to send anything.\n"
    );
    process.exit(1);
  }

  if (FEATURES.twilio && !process.env.TWILIO_WHATSAPP_NUMBER && !allowSimulated) {
    console.warn(
      "⚠️  TWILIO_WHATSAPP_NUMBER is not set — WhatsApp sends will throw rather " +
        "than deliver. Premium's WhatsApp channel is effectively off."
    );
  }

  if (allowSimulated) {
    console.warn(
      "⚠️  ALLOW_SIMULATED_SENDS=true in production — the SMS credential check is " +
        "bypassed. Sends will THROW rather than silently simulate, so campaigns " +
        "will fail visibly if this instance ever tries to send."
    );
  }
}

// ── Startup summary ──────────────────────────────────────────────────────────
// One line, so "is Facebook configured on staging?" is answerable from the log
// rather than by shelling in and grepping the environment.
const summarise = () =>
  Object.entries(FEATURES)
    .map(([name, on]) => `${on ? "✓" : "·"} ${name}`)
    .join("  ");

console.log(`🔌 Integrations: ${summarise()}`);

// ── Export validated env object — use this everywhere instead of process.env ─
export const env = {
  // Server
  PORT: parseInt(process.env.PORT, 10) || 5000,
  NODE_ENV,

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

  // Frontend — the single source for the app's public URL. Used for CORS and
  // as the Paddle checkout success redirect base (see paddle.client.js).
  CLIENT_URL: process.env.CLIENT_URL,

  // ── Google OAuth ───────────────────────────────────────────────────────
  // API_PUBLIC_URL: the base URL Google can reach for the OAuth callback.
  //   local dev  → http://localhost:5000  (register this exact redirect URI
  //                in Cloud Console: http://localhost:5000/api/v1/oauth/google/callback)
  //   production → https://api.getrankrise.com
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || null,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || null,
  API_PUBLIC_URL: (process.env.API_PUBLIC_URL || "").replace(/\/+$/, "") || null,
  // Flip to "true" while waiting on Google's Business Profile API approval —
  // discovery endpoints return deterministic mock accounts/locations so the
  // whole connect flow is testable end to end. Fatal in production (above).
  GOOGLE_MOCK_DISCOVERY: process.env.GOOGLE_MOCK_DISCOVERY || "false",

  // ── Token encryption at rest ───────────────────────────────────────────
  // 64 hex chars = 32 bytes for AES-256-GCM. See src/utils/crypto.js.
  TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY || null,
  TOKEN_ENCRYPTION_KEY_PREVIOUS: process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS || null,

  // ── Paddle billing (Merchant of Record) ────────────────────────────────
  PADDLE_ENVIRONMENT: process.env.PADDLE_ENVIRONMENT || "sandbox",
  PADDLE_API_KEY: process.env.PADDLE_API_KEY || null,
  PADDLE_WEBHOOK_SECRET: process.env.PADDLE_WEBHOOK_SECRET || null,
  PADDLE_PRICE_ID_STARTER: process.env.PADDLE_PRICE_ID_STARTER || null,
  PADDLE_PRICE_ID_PREMIUM: process.env.PADDLE_PRICE_ID_PREMIUM || null,

  // Third party (optional — only validated when features are used)
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || null,
  TWILIO_SID: process.env.TWILIO_ACCOUNT_SID || null,
  TWILIO_TOKEN: process.env.TWILIO_AUTH_TOKEN || null,
  TWILIO_PHONE: process.env.TWILIO_PHONE_NUMBER || null,
  APIFY_TOKEN: process.env.APIFY_TOKEN,
  DATAFORSEO_LOGIN: process.env.DATAFORSEO_LOGIN,
  DATAFORSEO_PASSWORD: process.env.DATAFORSEO_PASSWORD,

  // ── Which integrations are actually usable ─────────────────────────────
  // Booleans only, never secrets. Controllers can gate on these instead of
  // re-deriving "is this configured?" from process.env in five places.
  FEATURES,
};