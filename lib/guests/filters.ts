import { z } from "zod";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

const one = (value: unknown) => (Array.isArray(value) ? value[0] : value);

const filtersSchema = z.object({
  q: z.preprocess(one, z.string().trim().max(100).catch("")).default(""),
  status: z.preprocess(one, z.enum(["all", "attending", "declined", "awaiting"]).catch("all")).default("all"),
  family: z.preprocess(one, z.string().refine((v) => v === "none" || isUuid(v)).optional().catch(undefined)),
  archived: z.preprocess(one, z.enum(["active", "archived", "all"]).catch("active")).default("active"),
  plusOne: z.preprocess(one, z.enum(["any", "yes", "no"]).catch("any")).default("any"),
});

export type GuestFilters = z.infer<typeof filtersSchema>;

/** Reads the guest list filters from the query string. Unknown or malformed values fall back to defaults. */
export function parseGuestFilters(params: Record<string, string | string[] | undefined>): GuestFilters {
  return filtersSchema.parse(params);
}
