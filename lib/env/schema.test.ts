import { describe, expect, it } from "vitest";
import { EnvValidationError, parseEnv } from "./schema";

const valid = {
  DATABASE_URL: "postgresql://user:pass@ep-test.neon.tech/neondb?sslmode=require",
  NEON_AUTH_BASE_URL: "https://ep-test.neonauth.eu-central-1.aws.neon.tech/neondb/auth",
  NEON_AUTH_COOKIE_SECRET: "a".repeat(32),
  ADMIN_EMAILS: "Alex@Example.com, joanna@example.com",
};

function problemsFor(source: Record<string, string | undefined>): string[] {
  try {
    parseEnv(source);
  } catch (error) {
    if (error instanceof EnvValidationError) return error.problems;
    throw error;
  }
  throw new Error("expected parseEnv to throw");
}

describe("parseEnv", () => {
  it("accepts a complete configuration and normalises admin emails", () => {
    const env = parseEnv(valid);
    expect(env.DATABASE_URL).toBe(valid.DATABASE_URL);
    expect(env.ADMIN_EMAILS).toEqual(["alex@example.com", "joanna@example.com"]);
  });

  it("reports every missing variable by name", () => {
    expect(problemsFor({})).toEqual([
      "DATABASE_URL is required",
      "NEON_AUTH_BASE_URL is required",
      "NEON_AUTH_COOKIE_SECRET is required",
      "ADMIN_EMAILS is required",
    ]);
  });

  it("rejects a non-Postgres database URL", () => {
    expect(problemsFor({ ...valid, DATABASE_URL: "mysql://localhost/db" })).toEqual([
      "DATABASE_URL must be a postgres:// or postgresql:// connection string",
    ]);
  });

  it("rejects an auth URL that is not http(s)", () => {
    expect(problemsFor({ ...valid, NEON_AUTH_BASE_URL: "not a url" })).toEqual([
      "NEON_AUTH_BASE_URL must be the Auth URL from the Neon Console",
    ]);
  });

  it("rejects a short cookie secret", () => {
    expect(problemsFor({ ...valid, NEON_AUTH_COOKIE_SECRET: "short" })).toEqual([
      "NEON_AUTH_COOKIE_SECRET must be at least 32 characters",
    ]);
  });

  it("rejects an empty or invalid admin list", () => {
    expect(problemsFor({ ...valid, ADMIN_EMAILS: " , " })).toEqual([
      "ADMIN_EMAILS must contain at least one email address",
    ]);
    expect(problemsFor({ ...valid, ADMIN_EMAILS: "alex@example.com,not-an-email" })).toEqual([
      "ADMIN_EMAILS contains 1 invalid email address(es)",
    ]);
  });

  it("never includes secret values in the error message", () => {
    const secret = "postgresql-secret-password-value";
    const message = (() => {
      try {
        parseEnv({ ...valid, DATABASE_URL: `mysql://${secret}`, NEON_AUTH_COOKIE_SECRET: "tiny" });
      } catch (error) {
        return (error as Error).message;
      }
    })();
    expect(message).toBeDefined();
    expect(message).not.toContain(secret);
    expect(message).not.toContain("tiny");
  });
});
