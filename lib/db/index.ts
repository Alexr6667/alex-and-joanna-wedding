import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import { count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/env";
import { poolConfig } from "./pool-config";
import * as schema from "./schema";

// node-postgres over TCP, so multi-statement writes (imports, RSVPs, token
// regeneration) can run in real transactions. On Vercel, attachDatabasePool
// lets idle connections close before a function instance is suspended.
const pool = new Pool(poolConfig(env.DATABASE_URL));
// An idle client can fail (for example when Neon drops the connection). Without
// a listener, node-postgres re-throws that as an uncaught error and the process
// exits. The pool discards the broken client itself, so logging is enough.
pool.on("error", (error) => logDatabaseError("Idle database connection failed", error));
attachDatabasePool(pool);

export const db = drizzle({ client: pool, schema });

export type Database = typeof db;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type DatabaseStatus = "ok" | "unavailable";

/** Queries an application table, so it fails if the database is unreachable or migrations have not run. */
export async function checkDatabase(): Promise<DatabaseStatus> {
  try {
    await db.select({ rows: count() }).from(schema.siteSettings);
    return "ok";
  } catch (error) {
    logDatabaseError("Database check failed", error);
    return "unavailable";
  }
}

/** Logs the error class and Postgres error code only: driver messages can echo connection details or row values. */
export function logDatabaseError(context: string, error: unknown) {
  const name = error instanceof Error ? error.name : "unknown error";
  const code = (error as { code?: unknown } | null)?.code;
  console.error(`${context}:`, name, typeof code === "string" ? code : "");
}
