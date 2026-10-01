import { describe, expect, it } from "vitest";
import { clientKey, RateLimiter } from "./rate-limit";

describe("RateLimiter", () => {
  it("allows up to the limit per window, then blocks until the window resets", () => {
    let now = 0;
    const limiter = new RateLimiter(2, 1000, () => now);
    expect(limiter.hit("a")).toBe(true);
    expect(limiter.hit("a")).toBe(true);
    expect(limiter.isBlocked("a")).toBe(true);
    expect(limiter.hit("a")).toBe(false);
    expect(limiter.hit("b")).toBe(true);
    now = 1000;
    expect(limiter.isBlocked("a")).toBe(false);
    expect(limiter.hit("a")).toBe(true);
  });
});

describe("clientKey", () => {
  it("uses the first forwarded address", () => {
    expect(clientKey(new Headers({ "x-forwarded-for": "203.0.113.1, 10.0.0.1" }))).toBe("203.0.113.1");
    expect(clientKey(new Headers({ "x-real-ip": "203.0.113.2" }))).toBe("203.0.113.2");
    expect(clientKey(new Headers())).toBe("unknown");
  });
});
