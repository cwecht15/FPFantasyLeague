/**
 * Side-effect module: load .env.local then .env into process.env when running
 * OUTSIDE Next.js (migrate / seed / worker scripts run via tsx or node, which
 * don't do Next's automatic env loading). Import this FIRST — before any module
 * that reads process.env at import time (e.g. ./index).
 *
 * No-op in production, where env comes from real environment variables
 * (Fly secrets), and a no-op if DATABASE_URL is already present.
 */
import { config } from "dotenv";

if (process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL) {
  config({ path: ".env.local" });
  config({ path: ".env" });
}
