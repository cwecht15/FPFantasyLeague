/**
 * Drizzle client over a node-postgres Pool. Cached on globalThis so Next.js
 * hot-reload (and multiple imports) reuse one pool instead of exhausting Neon
 * connections. Used by both the web app and the worker.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const globalForDb = globalThis as unknown as { __fpflPool?: Pool };

export const pool =
  globalForDb.__fpflPool ??
  new Pool({
    connectionString,
    // Neon pooler handles connection multiplexing; keep the client pool modest.
    max: 10,
  });

if (process.env.NODE_ENV !== "production") globalForDb.__fpflPool = pool;

export const db = drizzle(pool, { schema });

export { schema };
export type Db = typeof db;
