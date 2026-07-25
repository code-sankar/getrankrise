// backend/src/db/migrator.js
//
// Single schema authority for everything Sequelize's sync() does not own.
//
// Design decisions worth knowing before you touch this:
//
//  * Migrations are plain .sql files in backend/migrations/. No JS wrapper, no
//    ORM abstraction. Postgres DDL is the thing we actually care about being
//    correct, so we write it directly and read it back in code review.
//  * Ordering is lexicographic by filename. Use a zero-padded numeric prefix
//    (0001_, 0002_, …). Do NOT use timestamps — they sort badly across
//    branches and you cannot tell dependency order at a glance.
//  * Each file runs inside ONE transaction opened by this runner. Do not put
//    BEGIN/COMMIT inside a migration file; you will nest transactions and
//    Postgres will warn (or, worse, silently commit early).
//  * Applied migrations are recorded in the `schema_migrations` table. A file
//    that has already run is never run again, so migrations do NOT need to be
//    idempotent — but making them so is cheap insurance against a half-applied
//    deploy, and the ones shipped here are.
//  * There is no `down`. Rolling a schema change backwards in production is
//    almost always more dangerous than rolling forward with a new migration.
//    If you truly need a revert, write 0009_revert_of_0008.sql.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Umzug, SequelizeStorage } from "umzug";
import { sequelize } from "../config/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// backend/src/db/migrator.js → backend/migrations
export const MIGRATIONS_DIR = path.resolve(__dirname, "..", "..", "migrations");

/**
 * Umzug instance. `context` is the Sequelize instance, so migrations run
 * through the SAME connection pool as the rest of the app — which is the whole
 * point of Phase 0. There is no second pg.Pool anywhere in this codebase.
 */
export const migrator = new Umzug({
  migrations: {
    glob: ["*.sql", { cwd: MIGRATIONS_DIR }],

    resolve: ({ name, path: filepath, context: db }) => ({
      name,
      up: async () => {
        const sql = fs.readFileSync(filepath, "utf8");

        // One transaction per file: a migration either fully applies or leaves
        // no trace. Note that some Postgres statements (CREATE INDEX
        // CONCURRENTLY, ALTER TYPE ... ADD VALUE on older versions) cannot run
        // inside a transaction block. If you need one, say so explicitly by
        // starting the file with the marker line:  -- umzug:no-transaction
        const noTransaction = /^\s*--\s*umzug:no-transaction/m.test(sql);

        if (noTransaction) {
          await db.query(sql, { raw: true });
          return;
        }

        await db.transaction(async (transaction) => {
          await db.query(sql, { raw: true, transaction });
        });
      },

      down: async () => {
        throw new Error(
          `Migration "${name}" has no down step. Roll forward with a new migration instead.`
        );
      },
    }),
  },

  context: sequelize,

  storage: new SequelizeStorage({
    sequelize,
    tableName: "schema_migrations",
    columnName: "name",
  }),

  logger: {
    info: (m) => console.log(`   ↳ ${m.event === "migrating" ? "applying" : m.event}: ${m.name ?? ""}`),
    warn: (m) => console.warn("   ⚠", m),
    error: (m) => console.error("   ✖", m),
    debug: () => {},
  },
});

/**
 * Applies every pending migration. Called on boot from src/db/bootstrap.js so a
 * deploy can never start serving traffic against a stale schema.
 *
 * @returns {Promise<string[]>} names of the migrations applied in this run
 */
export async function runMigrations() {
  const pending = await migrator.pending();

  if (pending.length === 0) {
    console.log("✅ Migrations: schema up to date");
    return [];
  }

  console.log(`🔄 Migrations: ${pending.length} pending`);
  const applied = await migrator.up();
  const names = applied.map((m) => m.name);
  console.log(`✅ Migrations: applied ${names.length} (${names.join(", ")})`);
  return names;
}

/**
 * Marks migrations as applied WITHOUT running them.
 *
 * You need this exactly once, on databases where 2026_06_14_subscriptions.sql
 * and/or 20260615_fix_clinic_plan_enum.sql were already applied by hand before
 * this runner existed. Without it, the first boot would try to re-run them and
 * fail on `CREATE TYPE ... already exists`.
 *
 * @param {string[]} names migration filenames to record as already applied
 */
export async function baselineMigrations(names) {
  const storage = migrator.options.storage;
  const executed = await storage.executed({ context: sequelize });
  const recorded = [];

  for (const name of names) {
    if (executed.includes(name)) {
      console.log(`   • ${name} — already recorded, skipping`);
      continue;
    }
    await storage.logMigration({ name, context: sequelize });
    recorded.push(name);
    console.log(`   • ${name} — marked as applied`);
  }

  return recorded;
}

/** Lists applied and pending migrations. Used by `npm run migrate:status`. */
export async function migrationStatus() {
  const [executed, pending] = await Promise.all([
    migrator.executed(),
    migrator.pending(),
  ]);
  return {
    executed: executed.map((m) => m.name),
    pending: pending.map((m) => m.name),
  };
}