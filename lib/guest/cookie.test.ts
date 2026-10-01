import { describe, expect, it } from "vitest";
import { guestCookie } from "./cookie";

describe("guestCookie", () => {
  it("uses a __Host- cookie that is HttpOnly, Secure and SameSite=Lax in production", () => {
    expect(guestCookie(true)).toEqual({
      name: "__Host-wedding_guest",
      options: { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 31_536_000 },
    });
  });

  it("drops the prefix and Secure only for plain-HTTP development", () => {
    const cookie = guestCookie(false);
    expect(cookie.name).toBe("wedding_guest");
    expect(cookie.options.secure).toBe(false);
    expect(cookie.options.httpOnly).toBe(true);
  });
});
