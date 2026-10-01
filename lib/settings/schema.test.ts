import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT } from "./defaults";
import { fieldErrors, generalSettingsSchema, mergeContent, siteContentSchema } from "./schema";

const settings = (overrides: Record<string, unknown> = {}) => ({
  accessMode: "private",
  rsvpDeadline: "",
  menuEnabled: null,
  askDietary: "on",
  askSongRequest: null,
  askNotes: "on",
  whatsappTemplate: "",
  ...overrides,
});

describe("generalSettingsSchema", () => {
  it("parses checkboxes, an empty deadline and the access mode", () => {
    expect(generalSettingsSchema.parse(settings())).toEqual({
      accessMode: "private",
      rsvpDeadline: null,
      menuEnabled: false,
      askDietary: true,
      askSongRequest: false,
      askNotes: true,
      whatsappTemplate: "",
    });
  });

  it("rejects an unknown access mode, a bad date and a template without {link}", () => {
    const result = generalSettingsSchema.safeParse(
      settings({ accessMode: "open", rsvpDeadline: "2027-13-01", whatsappTemplate: "Hi {first_name}" }),
    );
    expect(result.success).toBe(false);
    expect(Object.keys(fieldErrors(result.error!)).sort()).toEqual(["accessMode", "rsvpDeadline", "whatsappTemplate"]);
  });
});

describe("site content", () => {
  it("accepts the defaults", () => {
    expect(siteContentSchema.parse(DEFAULT_CONTENT)).toEqual(DEFAULT_CONTENT);
  });

  it("merges stored sections over defaults and ignores malformed ones", () => {
    const merged = mergeContent({ homepageIntro: "Hello", timings: "not a list", extra: 1 }, DEFAULT_CONTENT);
    expect(merged.homepageIntro).toBe("Hello");
    expect(merged.timings).toEqual(DEFAULT_CONTENT.timings);
    expect(merged).not.toHaveProperty("extra");
    expect(mergeContent(null, DEFAULT_CONTENT)).toEqual(DEFAULT_CONTENT);
  });

  it("keeps the confirmed wedding facts in the defaults", () => {
    expect(DEFAULT_CONTENT.ceremony).toMatchObject({ name: "St Johns Church", time: "2:00 PM" });
    expect(DEFAULT_CONTENT.ceremony.address).toContain("W2 2QD");
    expect(DEFAULT_CONTENT.reception.name).toBe("The Larrik");
    expect(DEFAULT_CONTENT.timings.map((t) => t.time)).toEqual(["2:00 PM", "2:45 PM", "4:00 PM", "5:00 PM", "9:00 PM"]);
  });
});
