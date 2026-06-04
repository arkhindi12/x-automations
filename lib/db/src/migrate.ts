/**
 * Database Migration Runner
 * Run migrations safely in production
 * Usage: tsx ./src/migrate.ts
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL environment variable is required");
    process.exit(1);
  }

  console.log("🔄 Starting database migrations...");
  console.log(`📍 Database: ${process.env.DATABASE_URL.split("@")[1] || "***"}`);

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    const db = drizzle(pool);
    const migrationsFolder = path.join(__dirname, "..", "drizzle");

    console.log(`📂 Migrations folder: ${migrationsFolder}`);

    await migrate(db, { migrationsFolder });

    console.log("✅ Migrations completed successfully!");
  } catch (error) {
    console.error("❌ Migration failed:");
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
