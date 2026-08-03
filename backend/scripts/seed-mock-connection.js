#!/usr/bin/env node
// backend/scripts/seed-mock-connection.js
//
// Seeds a status:"connected" Google platform connection for a clinic, WITHOUT
// going through Google at all. This is the zero-credential path for testing
// the review pipeline end-to-end:
//
//   * The real OAuth handshake needs a Google OAuth client (client id/secret).
//   * GOOGLE_MOCK_DISCOVERY=true mocks only listAccounts/listLocations — the
//     consent screen and code exchange still hit real Google.
//   * The MOCK REVIEW PROVIDER, however, needs no token: reviewSync.service.js
//     only calls getValidAccessToken() when the real Google provider is active.
//
// So with REVIEWS_MOCK=true + a row seeded by this script, the full
// sync → upsert → dashboard → analytics chain runs with zero external
// credentials. The seeded location id matches the mock discovery fixtures
// ("locations/111111") so the deterministic review seeds stay stable.
//
// Usage:
//   cd backend
//   node -r dotenv/config scripts/seed-mock-connection.js you@example.com
//
// Idempotent: re-running overwrites the same (clinic, platform) row via the
// uniq_platform_connection constraint — the same upsert shape storeGrant uses.
//
// DEV ONLY. Refuses to run in production for the same reason the mock review
// provider does: a prod database must never contain a fake "connected" row.

import { initializeDatabase, closeDatabase } from "../src/db/bootstrap.js";
import { User, Clinic, PlatformConnection } from "../src/models/index.js";

const email = process.argv[2];

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("✖ Refusing to seed a mock connection with NODE_ENV=production.");
    process.exit(1);
  }
  if (!email) {
    console.error("Usage: node -r dotenv/config scripts/seed-mock-connection.js <user-email>");
    process.exit(1);
  }

  await initializeDatabase(); // also applies pending migrations (incl. 0008)

  const user = await User.findOne({ where: { email } });
  if (!user) {
    console.error(`✖ No user found with email ${email}. Register through the app first.`);
    process.exit(1);
  }

  const clinic = await Clinic.findOne({ where: { userId: user.id } });
  if (!clinic) {
    console.error(`✖ User ${email} has no clinic row.`);
    process.exit(1);
  }

  const [conn] = await PlatformConnection.upsert(
    {
      clinicId: clinic.id,
      platform: "google",
      status: "connected",
      // No tokens — the mock review provider never asks for them.
      refreshTokenEnc: null,
      accessTokenEnc: null,
      accessTokenExpiresAt: null,
      scopes: null,
      // Matches the GOOGLE_MOCK_DISCOVERY fixtures in googleAuth.service.js,
      // so switching between this script and the mock-discovery picker flow
      // produces the same deterministic review seed.
      externalAccountId: "accounts/000000000000",
      externalAccountName: "Mock Business Group (dev)",
      externalLocationId: "locations/111111",
      externalLocationName: "Mock Clinic — Main Branch",
      connectedEmail: email,
      connectedAt: new Date(),
      lastError: null,
    },
    { conflictFields: ["clinic_id", "platform"] }
  );

  console.log("✅ Seeded mock Google connection:");
  console.log(`   clinic:     ${clinic.clinicName ?? clinic.id}`);
  console.log(`   connection: ${conn.id}`);
  console.log(`   location:   ${conn.externalLocationName} (${conn.externalLocationId})`);
  console.log("\nNext: set REVIEWS_MOCK=true in .env, boot the server, and hit");
  console.log("POST /api/v1/reviews/sync with this user's JWT.");
}

main()
  .catch((err) => {
    console.error("✖ Seed failed:", err.message);
    process.exitCode = 1;
  })
  .finally(() => closeDatabase().catch(() => {}));