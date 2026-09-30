const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * The E2E suite drops and recreates the `public` schema and truncates tables
 * before every test, so it must only ever run against a throwaway database.
 * Accepts a URL only if it points at this machine (loopback) and names a
 * database ending in `_e2e` or `_test`. Anything else throws before a
 * connection is opened. The error never includes the URL, which may hold a
 * password.
 */
export function assertDisposableDatabase(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("E2E_DATABASE_URL is not a valid connection string.");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("E2E_DATABASE_URL must be a postgres:// or postgresql:// connection string.");
  }
  // node-postgres lets query parameters override the host, which would bypass the check below.
  if (parsed.searchParams.has("host") || parsed.searchParams.has("hostaddr")) {
    throw new Error("E2E_DATABASE_URL must not set the host in query parameters.");
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error("E2E_DATABASE_URL must point at localhost. The suite wipes its database and never runs against a remote one.");
  }
  const database = decodeURIComponent(parsed.pathname.slice(1));
  if (!/_(e2e|test)$/.test(database)) {
    throw new Error("The E2E database name must end in _e2e or _test, to mark it as disposable.");
  }
  return url;
}
