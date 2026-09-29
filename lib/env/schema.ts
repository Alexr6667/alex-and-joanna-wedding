import { z } from "zod";
import { parseAdminEmails } from "../auth/admin-allowlist";

const envSchema = z.object({
  DATABASE_URL: z
    .string({ error: "is required" })
    .refine((value) => /^postgres(ql)?:\/\//.test(value), {
      error: "must be a postgres:// or postgresql:// connection string",
    }),
  NEON_AUTH_BASE_URL: z.url({
    protocol: /^https?$/,
    error: "must be the Auth URL from the Neon Console",
  }),
  NEON_AUTH_COOKIE_SECRET: z
    .string({ error: "is required" })
    .min(32, { error: "must be at least 32 characters" }),
  ADMIN_EMAILS: z
    .string({ error: "is required" })
    .transform((value, ctx) => {
      try {
        return parseAdminEmails(value);
      } catch (error) {
        ctx.addIssue({ code: "custom", message: (error as Error).message });
        return z.NEVER;
      }
    }),
});

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(readonly problems: string[]) {
    super(
      `Invalid environment configuration:\n${problems.map((p) => `  - ${p}`).join("\n")}\n` +
        "See .env.example and README.md for the required variables.",
    );
    this.name = "EnvValidationError";
  }
}

/**
 * Validates the server environment. Error messages name the variable and the
 * rule it broke but never include the value, so secrets cannot leak into logs.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (result.success) return result.data;

  const problems = result.error.issues.map((issue) => {
    const name = issue.path.join(".");
    const message = issue.code === "invalid_type" ? "is required" : issue.message;
    return `${name} ${message}`;
  });
  throw new EnvValidationError(problems);
}
