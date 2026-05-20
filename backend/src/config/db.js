import { Sequelize } from "sequelize";
import { env } from "./env.js";

// ── Create Sequelize instance ─────────────────────────────────────────────────
export const sequelize = new Sequelize(
  env.DB_NAME,
  env.DB_USER,
  env.DB_PASSWORD,
  {
    host:    env.DB_HOST,
    port:    env.DB_PORT,
    dialect: "postgres",
    logging: env.NODE_ENV === "development"
      ? (sql) => console.log(`\n🔍 SQL: ${sql}\n`)
      : false,
    pool: {
      max:     10,  // max connections in pool
      min:     2,   // min connections kept open
      acquire: 30000, // ms to wait before throwing error
      idle:    10000, // ms before idle connection is released
    },
    define: {
      // All tables use snake_case columns automatically
      underscored:   true,
      // Add createdAt and updatedAt to every table automatically
      timestamps:    true,
      // Don't pluralise table names (User → users not Users)
      freezeTableName: false,
    },
  }
);

// ── Connect and verify ────────────────────────────────────────────────────────
export const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log("✅ PostgreSQL connected successfully");

    // Sync models with database
    // force: false  → never drop tables (safe for production)
    // alter: true   → update columns if model changes (dev only)
    await sequelize.sync({
      force: false,
      alter: env.NODE_ENV === "development",
    });
    console.log("✅ Database models synced");

  } catch (err) {
    console.error("❌ PostgreSQL connection failed:", err.message);
    throw err; // server.js catches this and exits
  }
};