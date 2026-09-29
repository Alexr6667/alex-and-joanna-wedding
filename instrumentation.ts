import { parseEnv } from "./lib/env/schema";

// Runs once when the server starts, so a missing or invalid variable stops
// `next dev` / `next start` with a readable message instead of failing on the
// first request.
export function register() {
  parseEnv(process.env);
}
