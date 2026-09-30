import { describe, expect, it } from "vitest";
import { parseGuestFilters } from "./filters";
import { familyGroupNameSchema, guestInputSchema } from "./validation";

describe("guestInputSchema", () => {
  it("trims names, maps a blank group to null and reads the checkbox", () => {
    expect(
      guestInputSchema.parse({ firstName: " James ", lastName: "Smith", familyGroupId: "", plusOneAllowed: "on" }),
    ).toEqual({ firstName: "James", lastName: "Smith", familyGroupId: null, plusOneAllowed: true });
  });

  it("rejects blank names and group ids that aren't UUIDs", () => {
    const result = guestInputSchema.safeParse({ firstName: " ", lastName: "", familyGroupId: "1 or 1=1", plusOneAllowed: null });
    expect(result.success).toBe(false);
    expect(result.error!.issues.map((issue) => issue.path[0])).toEqual(["firstName", "lastName", "familyGroupId"]);
  });

  it("limits family group names", () => {
    expect(familyGroupNameSchema.safeParse("x".repeat(121)).success).toBe(false);
  });
});

describe("parseGuestFilters", () => {
  it("falls back to defaults for unknown values", () => {
    expect(parseGuestFilters({ status: "bogus", archived: "x", family: "not-a-uuid", plusOne: ["yes", "no"] })).toEqual({
      q: "",
      status: "all",
      archived: "active",
      plusOne: "yes",
      family: undefined,
    });
  });
});
