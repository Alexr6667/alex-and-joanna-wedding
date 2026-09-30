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
    // .env.local stores values in double quotes, and copying one out with
    // grep/cut keeps them. node-postgres would read a quoted URL as a
    // different host, so strip a surrounding pair of quotes.
    url: (process.env.DATABASE_URL ?? "").replace(/^(["'])(.*)\1$/, "$2"),
  },
  strict: true,
  verbose: true,
});
