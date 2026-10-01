import { z } from "zod";
import { isUuid } from "./filters";

const name = (label: string) =>
  z
    .string()
    .trim()
    .min(1, { error: `${label} is required.` })
    .max(100, { error: `${label} must be 100 characters or fewer.` });

export const guestInputSchema = z.object({
  firstName: name("First name"),
  lastName: name("Last name"),
  familyGroupId: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .refine((value) => value === null || isUuid(value), { error: "Choose a family group from the list." }),
  plusOneAllowed: z
    .union([z.literal("on"), z.null(), z.undefined()])
    .transform((value) => value === "on"),
});

export const familyGroupNameSchema = z
  .string()
  .trim()
  .min(1, { error: "Name is required." })
  .max(120, { error: "Name must be 120 characters or fewer." });
