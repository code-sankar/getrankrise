import { Sequelize } from "sequelize";
import { env } from "./env.js";

// ── Create Sequelize instance ─────────────────────────────────────────────────
//
// PHASE 0: this is now the ONE AND ONLY connection pool in the application.
// src/db/pool.js (a second, independent pg.Pool) has been deleted. Two pools
// against the same database meant double the connections against Postgres's
// max_connections, and — the reason it actually mattered — made it impossible
// to wrap a Sequelize write and a billing write in the same transaction.
//
// If you find yourself reaching for `new pg.Pool` again, use
// sequelize.query(sql, { bind }) instead. It takes the same $1/$2 placeholders
// and gives you raw SQL when you need it (see credits.service.js) without
// forking the connection pool.
export const sequelize = new Sequelize(
  env.DB_NAME,
  env.DB_USER,
  env.DB_PASSWORD,
  {
    host: env.DB_HOST,
    port: env.DB_PORT,
    dialect: "postgres",
    logging:
      env.NODE_ENV === "development"
        ? (sql) => console.log(`\n🔍 SQL: ${sql}\n`)
        : false,
    pool: {
      // Raised from 10 to 15: this pool now absorbs the traffic that previously
      // went to the separate billing pool. Keep the total across all app
      // instances comfortably under your Postgres max_connections.
      max: 15,
      min: 2,
      acquire: 30000, // ms to wait before throwing error
      idle: 10000, // ms before idle connection is released
    },
    define: {
      // All tables use snake_case columns automatically
      underscored: true,
      // Add createdAt and updatedAt to every table automatically
      timestamps: true,
      // Don't pluralise table names (User → users not Users)
      freezeTableName: false,
    },
  }
);

/**
 * @deprecated Use `initializeDatabase()` from src/db/bootstrap.js instead.
 *
 * The old connectDB() called sequelize.sync({ alter: NODE_ENV === "development" }),
 * which is now unsafe for two reasons:
 *
 *   1. `alter: true` fights the migration runner. It diffs models against the
 *      live schema and issues inferred ALTERs, which will happily undo or
 *      duplicate what a migration just did — and it mangles Postgres ENUM
 *      columns outright (see migrations/0002 for what that costs to unpick).
 *   2. A blanket sync() would try to create `subscriptions` from the
 *      Subscription model, racing the migration that owns that table.
 *
 * Kept as a thin alias so any importer not yet updated still boots. Remove once
 * you have grepped for `connectDB` and found nothing.
 */
export const connectDB = async () => {
  const { initializeDatabase } = await import("../db/bootstrap.js");
  console.warn(
    "⚠️  connectDB() is deprecated — import initializeDatabase() from src/db/bootstrap.js"
  );
  return initializeDatabase();
};