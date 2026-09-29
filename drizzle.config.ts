import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// Load .env.local the same way Next.js does, so migrations use the same DATABASE_URL.
loadEnvConfig(process.cwd());

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  // Only manage the application schema. Neon Auth owns neon_auth.
  schemaFilter: ["public"],
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
