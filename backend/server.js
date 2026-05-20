import app from "./src/app.js";
import { connectDB } from "./src/config/db.js";
import { env } from "./src/config/env.js";

const PORT = env.PORT;

// Connect to PostgreSQL then start server
connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n✅ Server running on http://localhost:${PORT}`);
      console.log(`📦 Environment : ${env.NODE_ENV}`);
      console.log(`🗄️  Database    : ${env.DB_NAME} @ ${env.DB_HOST}:${env.DB_PORT}\n`);
    });
  })
  .catch((err) => {
    console.error("❌ Failed to connect to database:", err.message);
    process.exit(1);
  });

// Handle uncaught errors gracefully
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err.message);
  process.exit(1);
});