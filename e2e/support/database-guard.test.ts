import { describe, expect, it } from "vitest";
import { assertDisposableDatabase } from "./database-guard";

describe("assertDisposableDatabase", () => {
  it("accepts local throwaway databases", () => {
    for (const url of [
      "postgresql://postgres:postgres@127.0.0.1:54329/wedding_e2e",
      "postgres://postgres@localhost/wedding_test",
      "postgresql://postgres@[::1]:5432/other_e2e",
    ]) {
      expect(assertDisposableDatabase(url)).toBe(url);
    }
  });

  it("rejects remote hosts, including Neon", () => {
    expect(() =>
      assertDisposableDatabase("postgresql://neondb_owner:secret@ep-example-pooler.eu-west-2.aws.neon.tech/wedding_e2e"),
    ).toThrow("must point at localhost");
    expect(() => assertDisposableDatabase("postgresql://postgres@10.0.0.5/wedding_e2e")).toThrow("must point at localhost");
    expect(() => assertDisposableDatabase("postgresql:///wedding_e2e")).toThrow("must point at localhost");
  });

  it("rejects a host override in query parameters", () => {
    expect(() =>
      assertDisposableDatabase("postgresql://postgres@127.0.0.1/wedding_e2e?host=ep-example.neon.tech"),
    ).toThrow("query parameters");
  });

  it("rejects databases not named as disposable", () => {
    expect(() => assertDisposableDatabase("postgresql://postgres@127.0.0.1/neondb")).toThrow("_e2e or _test");
    expect(() => assertDisposableDatabase("postgresql://postgres@127.0.0.1/e2e_production")).toThrow("_e2e or _test");
  });

  it("rejects non-Postgres and malformed URLs", () => {
    expect(() => assertDisposableDatabase("mysql://root@127.0.0.1/wedding_e2e")).toThrow("postgres://");
    expect(() => assertDisposableDatabase("not a url")).toThrow("not a valid connection string");
  });

  it("never includes the password in the error", () => {
    try {
      assertDisposableDatabase("postgresql://user:hunter2-secret@db.example.com/neondb");
    } catch (error) {
      expect((error as Error).message).not.toContain("hunter2-secret");
      return;
    }
    throw new Error("expected a rejection");
  });
});
