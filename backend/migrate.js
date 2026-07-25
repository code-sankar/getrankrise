#!/usr/bin/env node
// backend/migrate.js
//
// Migration CLI. Wired into package.json as:
//
//   npm run migrate            → apply all pending migrations
//   npm run migrate:status     → show applied vs pending
//   npm run migrate:baseline   → mark the two pre-existing migrations as applied
//                                WITHOUT running them (existing databases only)
//
// The server also runs pending migrations automatically on boot
// (src/db/bootstrap.js). This CLI exists for the cases where that is not
// enough: inspecting state, baselining a legacy database, or running
// migrations as a separate deploy step ahead of the rolling restart.

import { sequelize } from "./src/config/db.js";
import {
  migrator,
  runMigrations,
  baselineMigrations,
  migrationStatus,
} from "./src/db/migrator.js";

// The two migrations that existed before this runner did. On any database
// created before Phase 0, these have already been applied by hand.
const LEGACY_MIGRATIONS = [
  "0001_subscriptions_and_webhook_events.sql",
  "0002_fix_clinic_plan_enum.sql",
];

const command = process.argv[2] || "up";

async function main() {
  await sequelize.authenticate();

  switch (command) {
    case "up": {
      await runMigrations();
      break;
    }

    case "status": {
      const { executed, pending } = await migrationStatus();
      console.log("\n── Applied ──────────────────────────────────────────");
      console.log(executed.length ? executed.map((n) => `  ✔ ${n}`).join("\n") : "  (none)");
      console.log("\n── Pending ──────────────────────────────────────────");
      console.log(pending.length ? pending.map((n) => `  · ${n}`).join("\n") : "  (none)");
      console.log("");
      break;
    }

    case "baseline": {
      console.log(
        "\nMarking pre-existing migrations as applied (no SQL will be executed).\n" +
          "Only do this on a database where these were already run by hand.\n"
      );
      const recorded = await baselineMigrations(LEGACY_MIGRATIONS);
      console.log(
        recorded.length
          ? `\n✅ Baselined ${recorded.length} migration(s). Run 'npm run migrate' next.\n`
          : "\n✅ Nothing to baseline — all already recorded.\n"
      );
      break;
    }

    case "pending": {
      const pending = await migrator.pending();
      // Exit code 1 when migrations are outstanding, so CI can gate a deploy on
      // `node migrate.js pending`.
      if (pending.length) {
        console.error(`${pending.length} pending migration(s): ${pending.map((m) => m.name).join(", ")}`);
        await sequelize.close();
        process.exit(1);
      }
      console.log("No pending migrations.");
      break;
    }

    default:
      console.error(
        `Unknown command: ${command}\n\nUsage:\n` +
          "  node migrate.js up         apply pending migrations\n" +
          "  node migrate.js status     list applied and pending\n" +
          "  node migrate.js baseline   record legacy migrations as applied\n" +
          "  node migrate.js pending    exit 1 if anything is pending (for CI)\n"
      );
      await sequelize.close();
      process.exit(1);
  }

  await sequelize.close();
}

main().catch(async (err) => {
  console.error("\n❌ Migration failed:", err.message);
  if (err.original?.detail) console.error("   detail:", err.original.detail);
  if (err.original?.hint) console.error("   hint:  ", err.original.hint);
  await sequelize.close().catch(() => {});
  process.exit(1);
});