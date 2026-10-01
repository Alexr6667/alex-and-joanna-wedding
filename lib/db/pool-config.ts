import type { PoolConfig } from "pg";

/**
 * Pool settings for a Postgres URL. Neon URLs carry `sslmode=require`, which
 * pg 8 already treats as `verify-full` (and warns about). Saying `verify-full`
 * keeps that behaviour and silences the warning. `channel_binding=require` is
 * a libpq option pg does not read; pg's own flag turns it on instead.
 */
export function poolConfig(databaseUrl: string): PoolConfig {
  const url = new URL(databaseUrl);
  const channelBinding = url.searchParams.get("channel_binding") === "require";
  url.searchParams.delete("channel_binding");
  if (url.searchParams.get("sslmode") === "require") url.searchParams.set("sslmode", "verify-full");

  return {
    connectionString: url.toString(),
    enableChannelBinding: channelBinding,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  };
}
