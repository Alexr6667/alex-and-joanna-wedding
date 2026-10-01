/**
 * Fixed-window counter kept in memory. Each server instance counts on its own,
 * so this is a speed bump against scripted guessing, not a global quota. It is
 * deliberately in memory: the app stores no IP addresses.
 */
export class RateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records one hit for `key`. Returns false once the key is over the limit for the current window. */
  hit(key: string): boolean {
    const now = this.now();
    this.prune(now);
    const current = this.windows.get(key);
    if (!current || now - current.start >= this.windowMs) {
      this.windows.set(key, { start: now, count: 1 });
      return true;
    }
    current.count += 1;
    return current.count <= this.limit;
  }

  /** True if `key` has already used up the current window, without recording a hit. */
  isBlocked(key: string): boolean {
    const current = this.windows.get(key);
    if (!current || this.now() - current.start >= this.windowMs) return false;
    return current.count >= this.limit;
  }

  private prune(now: number) {
    if (this.windows.size < 10_000) return;
    for (const [key, entry] of this.windows) {
      if (now - entry.start >= this.windowMs) this.windows.delete(key);
    }
  }
}

/** Best-effort client key from the proxy headers Vercel sets. Never stored or logged. */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "unknown";
}
