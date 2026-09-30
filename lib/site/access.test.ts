import { describe, expect, it } from "vitest";
import { canRespond, decideSiteView, type Viewer } from "./access";

const guest = { id: "g1" };
const viewers: Viewer[] = [
  { kind: "anonymous" },
  { kind: "guest", guest },
  { kind: "admin-preview" },
  { kind: "guest-preview", guest },
];

describe("decideSiteView", () => {
  it("shows the invitation-only page to anonymous visitors in private mode", () => {
    expect(decideSiteView("private", { kind: "anonymous" })).toBe("invitation-only");
  });

  it("shows the site to anonymous visitors in public mode", () => {
    expect(decideSiteView("public", { kind: "anonymous" })).toBe("wedding-site");
  });

  it("shows the site to guests and to admin previews in either mode", () => {
    for (const mode of ["private", "public"] as const) {
      for (const viewer of viewers.slice(1)) expect(decideSiteView(mode, viewer)).toBe("wedding-site");
    }
  });
});

describe("canRespond", () => {
  it("lets only a real guest session submit an RSVP", () => {
    expect(viewers.map(canRespond)).toEqual([false, true, false, false]);
  });
});
