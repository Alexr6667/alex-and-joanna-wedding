import { defineConfig } from "@neon/config/v1";

// Neon services for this project's branches (`development` and `production`).
// Applied with `neon config plan` then `neon deploy` against the linked branch.
export default defineConfig({
  auth: true,
});
