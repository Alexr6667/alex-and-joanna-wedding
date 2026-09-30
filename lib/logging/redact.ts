/**
 * Drizzle's query errors put the SQL parameters in their message, and
 * Postgres errors can echo row values in `detail`. Parameters include guest
 * names, notes and token hashes, so neither may reach the logs. This turns
 * them into a plain error that keeps only the Postgres error code and the
 * Next.js digest (which links the log line to the error page a user saw).
 */
export function redactForLog(value: unknown): unknown {
  if (!(value instanceof Error)) return value;
  const drizzle = typeof (value as { query?: unknown }).query === "string" && "params" in value;
  const postgres = typeof (value as { severity?: unknown }).severity === "string" && "code" in value;
  if (!drizzle && !postgres) return value;

  const source = drizzle ? (value as { cause?: unknown }).cause : value;
  const code = (source as { code?: unknown } | undefined)?.code;
  const redacted = new Error(`Database query failed${typeof code === "string" ? ` (${code})` : ""}`);
  redacted.name = "DatabaseError";
  const digest = (value as { digest?: unknown }).digest;
  if (typeof digest === "string") Object.assign(redacted, { digest });
  redacted.stack = redacted.stack?.split("\n")[0];
  return redacted;
}

let installed = false;

/** Wraps console.error and console.warn so database errors are redacted wherever they are logged. */
export function installLogRedaction() {
  if (installed) return;
  installed = true;
  for (const method of ["error", "warn"] as const) {
    const original = console[method].bind(console);
    console[method] = (...args: unknown[]) => original(...args.map(redactForLog));
  }
}
