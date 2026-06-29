// backend/src/db/pool.js
import pg from "pg";
import { env } from "../config/env.js";

export const pool = new pg.Pool({
  host:     env.DB_HOST,
  port:     env.DB_PORT,
  user:     env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  max:      10,
  idleTimeoutMillis: 30_000,
});

pool.on("error", (err) => console.error("[pg pool] idle client error:", err));