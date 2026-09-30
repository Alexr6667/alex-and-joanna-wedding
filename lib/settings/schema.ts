import { z } from "zod";
import { isValidDeadline } from "@/lib/rsvp/deadline";

export const MAX_TIMING_ROWS = 20;
const LONG_TEXT = 4000;
const SHORT_TEXT = 200;

const trimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `must be ${max} characters or fewer` });

const venueSchema = z.object({
  name: trimmed(SHORT_TEXT),
  time: trimmed(40),
  address: trimmed(1000),
  notes: trimmed(LONG_TEXT),
});

const timingSchema = z.object({
  time: trimmed(40).min(1, { error: "needs a time" }),
  label: trimmed(SHORT_TEXT).min(1, { error: "needs a description" }),
});

export const siteContentSchema = z.object({
  homepageIntro: trimmed(LONG_TEXT),
  ceremony: venueSchema,
  reception: venueSchema,
  timings: z.array(timingSchema).max(MAX_TIMING_ROWS),
  dressCode: trimmed(LONG_TEXT),
  gettingThere: trimmed(LONG_TEXT),
  accommodation: trimmed(LONG_TEXT),
});

export type SiteContent = z.infer<typeof siteContentSchema>;

/**
 * Reads stored content, keeping any valid section and falling back to the
 * default for anything missing or malformed, so a bad row can never take the
 * site down.
 */
export function mergeContent(stored: unknown, defaults: SiteContent): SiteContent {
  const source = (typeof stored === "object" && stored !== null ? stored : {}) as Record<string, unknown>;
  const result = { ...defaults } as Record<string, unknown>;
  for (const [key, schema] of Object.entries(siteContentSchema.shape)) {
    if (!(key in source)) continue;
    const parsed = schema.safeParse(source[key]);
    if (parsed.success) result[key] = parsed.data;
  }
  return result as SiteContent;
}

export const accessModeSchema = z.enum(["private", "public"]);

const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.null(), z.undefined()])
  .transform((value) => value === "on" || value === "true");

export const generalSettingsSchema = z.object({
  accessMode: accessModeSchema,
  rsvpDeadline: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .refine((value) => value === null || isValidDeadline(value), {
      error: "must be a valid date",
    }),
  menuEnabled: checkbox,
  askDietary: checkbox,
  askSongRequest: checkbox,
  askNotes: checkbox,
  whatsappTemplate: z
    .string()
    .trim()
    .max(2000, { error: "must be 2000 characters or fewer" })
    .refine((value) => value === "" || value.includes("{link}"), {
      error: "must include {link} so guests receive their invitation link",
    }),
});

export type GeneralSettingsInput = z.input<typeof generalSettingsSchema>;

export const faqEntrySchema = z.object({
  question: trimmed(300).min(1, { error: "is required" }),
  answer: trimmed(LONG_TEXT).min(1, { error: "is required" }),
});

export const menuOptionSchema = z.object({
  name: trimmed(120).min(1, { error: "is required" }),
  description: trimmed(500).transform((value) => (value === "" ? null : value)),
});

/** Turns a zod error into `{ field: message }`, one message per field. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    errors[key] ??= issue.message;
  }
  return errors;
}
