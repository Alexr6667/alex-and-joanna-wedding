"use server";

import { asc, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { runAdminAction } from "@/lib/auth/admin-action";
import { db } from "@/lib/db";
import { faqEntries } from "@/lib/db/schema";
import { field, formError, saved, type FormState } from "@/lib/forms";
import { isUuid } from "@/lib/guests/filters";
import { moveItem, nextDisplayOrder } from "@/lib/ordering";
import { faqEntrySchema, fieldErrors, MAX_TIMING_ROWS, siteContentSchema } from "@/lib/settings/schema";
import { updateSiteSettings } from "@/lib/settings/service";

/** Reads the timings rows. Rows left completely empty are dropped. */
function readTimings(formData: FormData) {
  const rows: { time: string; label: string }[] = [];
  for (let index = 0; index < MAX_TIMING_ROWS; index++) {
    const time = field(formData, `timings.${index}.time`).trim();
    const label = field(formData, `timings.${index}.label`).trim();
    if (time || label) rows.push({ time, label });
  }
  return rows;
}

export async function saveContentAction(_state: FormState, formData: FormData): Promise<FormState> {
  return runAdminAction(async () => {
    const venue = (prefix: string) => ({
      name: field(formData, `${prefix}.name`),
      time: field(formData, `${prefix}.time`),
      address: field(formData, `${prefix}.address`),
      notes: field(formData, `${prefix}.notes`),
    });
    const parsed = siteContentSchema.safeParse({
      homepageIntro: field(formData, "homepageIntro"),
      ceremony: venue("ceremony"),
      reception: venue("reception"),
      timings: readTimings(formData),
      dressCode: field(formData, "dressCode"),
      gettingThere: field(formData, "gettingThere"),
      accommodation: field(formData, "accommodation"),
    });
    if (!parsed.success) {
      const errors = fieldErrors(parsed.error);
      const timingError = Object.keys(errors).find((key) => key.startsWith("timings"));
      return formError(
        timingError ? "Each timing needs both a time and a description." : "Please check the highlighted fields.",
        errors,
      );
    }
    await updateSiteSettings({ content: parsed.data });
    refresh();
    return saved("Content saved. The site shows it straight away.");
  });
}

export async function addFaqAction(_state: FormState, formData: FormData): Promise<FormState> {
  return runAdminAction(async () => {
    const parsed = faqEntrySchema.safeParse({ question: field(formData, "question"), answer: field(formData, "answer") });
    if (!parsed.success) return formError("Please fill in the question and answer.", fieldErrors(parsed.error));
    const existing = await db.select({ displayOrder: faqEntries.displayOrder }).from(faqEntries);
    await db.insert(faqEntries).values({ ...parsed.data, displayOrder: nextDisplayOrder(existing) });
    refresh();
    return saved("Question added.");
  });
}

export async function updateFaqAction(id: string, _state: FormState, formData: FormData): Promise<FormState> {
  return runAdminAction(async () => {
    if (!isUuid(id)) return formError("Question not found.");
    const parsed = faqEntrySchema.safeParse({ question: field(formData, "question"), answer: field(formData, "answer") });
    if (!parsed.success) return formError("Please fill in the question and answer.", fieldErrors(parsed.error));
    await db.update(faqEntries).set({ ...parsed.data, updatedAt: new Date() }).where(eq(faqEntries.id, id));
    refresh();
    return saved("Question saved.");
  });
}

export async function deleteFaqAction(id: string): Promise<FormState> {
  return runAdminAction(async () => {
    if (!isUuid(id)) return formError("Question not found.");
    await db.delete(faqEntries).where(eq(faqEntries.id, id));
    refresh();
    return saved("Question deleted.");
  });
}

export async function moveFaqAction(id: string, direction: "up" | "down"): Promise<FormState> {
  return runAdminAction(async () => {
    if (!isUuid(id)) return formError("Question not found.");
    await db.transaction(async (tx) => {
      const items = await tx
        .select({ id: faqEntries.id, displayOrder: faqEntries.displayOrder })
        .from(faqEntries)
        .orderBy(asc(faqEntries.displayOrder), asc(faqEntries.createdAt));
      // Ties sort by creation time; renumber from that order before moving.
      const numbered = items.map((item, index) => ({ id: item.id, displayOrder: index + 1 }));
      const changes = moveItem(numbered, id, direction);
      const final = new Map(numbered.map((item) => [item.id, item.displayOrder]));
      for (const change of changes) final.set(change.id, change.displayOrder);
      for (const item of items) {
        const order = final.get(item.id)!;
        if (order !== item.displayOrder) {
          await tx.update(faqEntries).set({ displayOrder: order }).where(eq(faqEntries.id, item.id));
        }
      }
    });
    refresh();
    return saved("Order updated.");
  });
}
