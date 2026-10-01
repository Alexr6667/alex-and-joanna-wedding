import { describe, expect, it } from "vitest";
import { poolConfig } from "./pool-config";

describe("poolConfig", () => {
  it("keeps Neon's TLS and channel binding requirements", () => {
    const config = poolConfig("postgresql://u:p@ep-x-pooler.neon.tech/db?sslmode=require&channel_binding=require");
    expect(config.connectionString).toBe("postgresql://u:p@ep-x-pooler.neon.tech/db?sslmode=verify-full");
    expect(config.enableChannelBinding).toBe(true);
  });

  it("leaves a local URL alone", () => {
    const config = poolConfig("postgresql://postgres:postgres@127.0.0.1:54329/wedding_e2e");
    expect(config.connectionString).toBe("postgresql://postgres:postgres@127.0.0.1:54329/wedding_e2e");
    expect(config.enableChannelBinding).toBe(false);
  });
});
