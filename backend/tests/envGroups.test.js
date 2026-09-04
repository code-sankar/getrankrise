// tests/envGroups.test.js
//
// Boot-time configuration validation.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
// env.js deliberately refuses to start on a half-configured integration, and
// that strictness is load-bearing: a Paddle checkout whose webhook secret is
// missing leaves paying customers on the free tier, and a Google grant written
// without TOKEN_ENCRYPTION_KEY puts refresh tokens in the database in plain
// text. Nothing here should soften that.
//
// But strictness has a failure mode of its own. API_PUBLIC_URL used to be a
// MEMBER of the Google OAuth group rather than a prerequisite of it, and that
// variable is shared infrastructure — inboundSms.controller.js rebuilds the
// Twilio signature URL from it, and Twilio is required in production. So a
// deployment that used Twilio inbound STOP handling and no Google OAuth set
// API_PUBLIC_URL, and the process exited with
//
//     ❌ Partial Google OAuth configuration.
//        Missing: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
//
// for an integration it had never asked for. That is a hard deploy blocker
// pointing at the wrong thing, which is the worst kind.
//
// These cases pin both halves: the one configuration that must now boot, and
// every configuration that must still refuse to.
//
// ── HOW ─────────────────────────────────────────────────────────────────────
// env.js calls process.exit(1) on a bad config, so it cannot be asserted on
// in-process. Each case runs a child `node -e` that imports the module and
// prints a sentinel, and the assertion is on the child's exit code.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hex = (n) => randomBytes(n).toString("hex");

/** The minimum that always has to be present, whatever the case is testing. */
const baseEnv = () => ({
  NODE_ENV: "production",
  PORT: "5197",
  DB_HOST: "127.0.0.1",
  DB_PORT: "5432",
  DB_NAME: process.env.DB_NAME || "kirtify_test",
  DB_USER: process.env.DB_USER || "postgres",
  DB_PASSWORD: process.env.DB_PASSWORD || "postgres",
  CLIENT_URL: "https://app.example.com",
  ACCESS_TOKEN_SECRET: hex(48),
  REFRESH_TOKEN_SECRET: hex(48),
  // Required-in-production, and the reason API_PUBLIC_URL gets set at all.
  TWILIO_ACCOUNT_SID: "AC" + "0".repeat(32),
  TWILIO_AUTH_TOKEN: hex(16),
  TWILIO_PHONE_NUMBER: "+15550000000",
  APIFY_TOKEN: "apify_fake_token",
  CAMPAIGN_RUNNER_DISABLED: "true",
  SYNC_SCHEDULER_DISABLED: "true",
});

/** Loads config/env.js in a child process. Returns true when it booted. */
function boots(overrides) {
  // A blank-slate env: inheriting the parent's would leak whatever the shell
  // happened to export and make these cases lie.
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, ...baseEnv(), ...overrides };
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete env[k];
  try {
    execFileSync(
      process.execPath,
      ["-e", 'import("./src/config/env.js").then(() => process.exit(0), () => process.exit(1))'],
      { cwd: backendRoot, env, stdio: "pipe", timeout: 30_000 },
    );
    return true;
  } catch {
    return false;
  }
}

describe("env: Google OAuth group", () => {
  test("API_PUBLIC_URL alone boots — it belongs to Twilio too, not just Google", () => {
    // The regression this whole file is here for.
    assert.equal(boots({ API_PUBLIC_URL: "https://api.example.com" }), true);
  });

  test("one Google credential without the other still refuses to boot", () => {
    assert.equal(boots({ GOOGLE_CLIENT_ID: "gid" }), false);
    assert.equal(boots({ GOOGLE_CLIENT_SECRET: "gsec" }), false);
  });

  test("Google configured without a redirect base still refuses to boot", () => {
    // The redirect URI is built from API_PUBLIC_URL; without it the consent
    // screen would send users to `undefined/api/v1/oauth/google/callback`.
    assert.equal(
      boots({ GOOGLE_CLIENT_ID: "gid", GOOGLE_CLIENT_SECRET: "gsec", TOKEN_ENCRYPTION_KEY: hex(32) }),
      false,
    );
  });

  test("Google configured without an encryption key still refuses to boot", () => {
    // This is the one that would silently write plaintext refresh tokens.
    assert.equal(
      boots({
        GOOGLE_CLIENT_ID: "gid",
        GOOGLE_CLIENT_SECRET: "gsec",
        API_PUBLIC_URL: "https://api.example.com",
      }),
      false,
    );
  });

  test("a complete Google configuration boots", () => {
    assert.equal(
      boots({
        GOOGLE_CLIENT_ID: "gid",
        GOOGLE_CLIENT_SECRET: "gsec",
        API_PUBLIC_URL: "https://api.example.com",
        TOKEN_ENCRYPTION_KEY: hex(32),
      }),
      true,
    );
  });

  test("no optional integration configured at all boots", () => {
    assert.equal(boots({}), true);
  });
});

describe("env: other all-or-nothing groups are unchanged", () => {
  test("a partial Paddle configuration refuses to boot", () => {
    // Half-configured billing is worse than none: checkout succeeds, webhook
    // signature verification fails, and the customer stays on the free tier.
    assert.equal(boots({ PADDLE_API_KEY: "pk_test" }), false);
  });

  test("a partial SendGrid configuration refuses to boot", () => {
    assert.equal(boots({ SENDGRID_API_KEY: "SG.fake" }), false);
  });
});
