import { describe, expect, it } from "vitest";
import { redactForLog } from "./redact";

describe("redactForLog", () => {
  it("strips query parameters from Drizzle errors but keeps the code and digest", () => {
    const cause = Object.assign(new Error('duplicate key value (lower(name))=(smith family)'), {
      code: "23505",
      severity: "ERROR",
      detail: "Key (lower(name))=(smith family) already exists.",
    });
    const error = Object.assign(new Error("Failed query: insert ...\nparams: James,Smith"), {
      query: "insert ...",
      params: ["James", "Smith"],
      cause,
      digest: "123",
    });
    const redacted = redactForLog(error) as Error & { digest?: string };
    expect(redacted.message).toBe("Database query failed (23505)");
    expect(redacted.digest).toBe("123");
    expect(JSON.stringify({ ...redacted, stack: redacted.stack })).not.toMatch(/James|Smith|smith family/);
  });

  it("strips detail from raw Postgres errors", () => {
    const error = Object.assign(new Error("Key (x)=(secret) exists"), { code: "23505", severity: "ERROR" });
    expect((redactForLog(error) as Error).message).toBe("Database query failed (23505)");
  });

  it("leaves other values alone", () => {
    const plain = new Error("ordinary");
    expect(redactForLog(plain)).toBe(plain);
    expect(redactForLog("text")).toBe("text");
  });
});
