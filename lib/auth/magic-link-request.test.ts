import { describe, expect, it } from "vitest";
import { decideMagicLinkRequest } from "./magic-link-request";

const allowlist = ["alex@example.com"];

describe("decideMagicLinkRequest", () => {
  it("forwards approved emails with server-chosen redirect targets", () => {
    const decision = decideMagicLinkRequest(
      {
        email: " Alex@Example.com ",
        callbackURL: "https://attacker.example/steal",
        errorCallbackURL: "https://attacker.example/error",
        newUserCallbackURL: "https://attacker.example/new",
      },
      allowlist,
    );
    expect(decision).toEqual({
      action: "forward",
      body: {
        email: "alex@example.com",
        callbackURL: "/admin",
        errorCallbackURL: "/admin/login?error=link",
      },
    });
  });

  it("silently ignores unapproved emails", () => {
    expect(decideMagicLinkRequest({ email: "guest@example.com" }, allowlist)).toEqual({
      action: "ignore",
    });
  });

  it("rejects malformed bodies", () => {
    expect(decideMagicLinkRequest(null, allowlist)).toEqual({ action: "reject" });
    expect(decideMagicLinkRequest("alex@example.com", allowlist)).toEqual({ action: "reject" });
    expect(decideMagicLinkRequest({ email: 42 }, allowlist)).toEqual({ action: "reject" });
    expect(decideMagicLinkRequest({ email: "   " }, allowlist)).toEqual({ action: "reject" });
  });
});
