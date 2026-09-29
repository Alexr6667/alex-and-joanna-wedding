import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Application tables live in the public schema. Neon Auth owns the separate
// neon_auth schema; drizzle.config.ts filters it out so Drizzle never manages it.

/** Small key/value table for app-level settings. Also lets the admin page confirm migrations have run. */
export const appMeta = pgTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
