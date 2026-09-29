import "server-only";
import { neon } from "@neondatabase/serverless";
import { count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { env } from "@/lib/env";
import * as schema from "./schema";

export const db = drizzle({ client: neon(env.DATABASE_URL), schema });

export type DatabaseStatus = "ok" | "unavailable";

/** Queries an application table, so it fails if the database is unreachable or migrations have not run. */
export async function checkDatabase(): Promise<DatabaseStatus> {
  try {
    await db.select({ rows: count() }).from(schema.appMeta);
    return "ok";
  } catch (error) {
    // Log the error class only: driver messages can echo connection details.
    console.error("Database check failed:", error instanceof Error ? error.name : "unknown error");
    return "unavailable";
  }
}
