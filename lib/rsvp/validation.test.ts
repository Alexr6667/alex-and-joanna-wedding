import { describe, expect, it } from "vitest";
import type { MenuQuestion } from "@/lib/menu/logic";
import { validateRsvp, type RsvpFormContext } from "./validation";

const mainQuestion: MenuQuestion = {
  key: "main",
  label: "Main",
  options: [
    { id: "beef", name: "Beef", description: null },
    { id: "fish", name: "Fish", description: null },
  ],
};

const context = (overrides: Partial<RsvpFormContext> = {}): RsvpFormContext => ({
  plusOneAllowed: false,
  questions: [],
  ask: { dietary: true, songRequest: true, notes: true },
  requireChoices: true,
  ...overrides,
});

const form = (values: Record<string, string>) => (name: string) => values[name] ?? null;

describe("validateRsvp", () => {
  it("requires an attending answer", () => {
    expect(validateRsvp(form({}), context())).toEqual({
      ok: false,
      errors: { attending: "Please let us know whether you can come." },
    });
    expect(validateRsvp(form({ attending: "maybe" }), context()).ok).toBe(false);
  });

  it("keeps earlier choices when declining", () => {
    const result = validateRsvp(form({ attending: "no", notes: " Sorry " }), context({ questions: [mainQuestion] }));
    expect(result).toEqual({ ok: true, value: { attending: false, notes: "Sorry" } });
  });

  it("accepts with dietary requirements and a song", () => {
    const result = validateRsvp(form({ attending: "yes", dietary: "Vegan", songRequest: "Dancing Queen" }), context());
    expect(result).toEqual({
      ok: true,
      value: {
        attending: true,
        notes: null,
        attendingDetails: { songRequest: "Dancing Queen", guest: { dietaryRequirements: "Vegan", selections: {} } },
      },
    });
  });

  it("ignores questions that are switched off", () => {
    const result = validateRsvp(
      form({ attending: "yes", dietary: "ignored", songRequest: "ignored", notes: "ignored" }),
      context({ ask: { dietary: false, songRequest: false, notes: false } }),
    );
    expect(result).toEqual({ ok: true, value: { attending: true, attendingDetails: { guest: { selections: {} } } } });
  });

  it("rejects over-long text", () => {
    const result = validateRsvp(form({ attending: "yes", notes: "x".repeat(1001) }), context());
    expect(result.ok).toBe(false);
  });

  describe("plus-one permission", () => {
    it("rejects a plus-one the invitation doesn't include", () => {
      const result = validateRsvp(form({ attending: "yes", bringingPlusOne: "yes", plusOneName: "Sam" }), context());
      expect(result).toEqual({ ok: false, errors: { bringingPlusOne: "This invitation doesn't include a plus-one." } });
    });

    it("leaves plus-one data alone when not allowed and not requested", () => {
      const result = validateRsvp(form({ attending: "yes" }), context());
      expect(result.ok && result.value.attendingDetails?.plusOne).toBeUndefined();
    });

    it("requires an answer and a name when allowed", () => {
      expect(validateRsvp(form({ attending: "yes" }), context({ plusOneAllowed: true })).ok).toBe(false);
      const noName = validateRsvp(form({ attending: "yes", bringingPlusOne: "yes" }), context({ plusOneAllowed: true }));
      expect(noName).toEqual({ ok: false, errors: { plusOneName: "Please tell us your guest's name." } });
    });

    it("records the plus-one with their own choices and dietary needs", () => {
      const result = validateRsvp(
        form({
          attending: "yes",
          bringingPlusOne: "yes",
          plusOneName: " Sam Lee ",
          plusOneDietary: "Gluten free",
          "choice.main": "beef",
          "plusOneChoice.main": "fish",
        }),
        context({ plusOneAllowed: true, questions: [mainQuestion] }),
      );
      expect(result.ok && result.value.attendingDetails).toEqual({
        songRequest: null,
        guest: { dietaryRequirements: null, selections: { main: "beef" } },
        plusOne: { fullName: "Sam Lee", dietaryRequirements: "Gluten free", selections: { main: "fish" } },
      });
    });

    it("marks the plus-one for removal when the answer is no", () => {
      const result = validateRsvp(
        form({ attending: "yes", bringingPlusOne: "no", plusOneName: "Ignored" }),
        context({ plusOneAllowed: true }),
      );
      expect(result.ok && result.value.attendingDetails?.plusOne).toBeNull();
    });
  });

  describe("menu choices", () => {
    it("requires a choice for guests", () => {
      const result = validateRsvp(form({ attending: "yes" }), context({ questions: [mainQuestion] }));
      expect(result).toEqual({ ok: false, errors: { "choice.main": "Please choose a main." } });
    });

    it("lets admins leave choices blank", () => {
      const result = validateRsvp(form({ attending: "yes" }), context({ questions: [mainQuestion], requireChoices: false }));
      expect(result.ok && result.value.attendingDetails?.guest.selections).toEqual({ main: null });
    });

    it("rejects options that aren't offered", () => {
      const result = validateRsvp(
        form({ attending: "yes", "choice.main": "retired-option" }),
        context({ questions: [mainQuestion] }),
      );
      expect(result.ok).toBe(false);
    });

    it("ignores menu fields when menu choices are off", () => {
      const result = validateRsvp(form({ attending: "yes", "choice.main": "beef" }), context());
      expect(result.ok && result.value.attendingDetails?.guest.selections).toEqual({});
    });
  });
});
