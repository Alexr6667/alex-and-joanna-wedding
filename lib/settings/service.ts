import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { faqEntries, siteSettings } from "@/lib/db/schema";
import type { SiteAccessMode } from "@/lib/site/access";
import { DEFAULT_CONTENT, DEFAULT_WHATSAPP_TEMPLATE } from "./defaults";
import { mergeContent, type SiteContent } from "./schema";

export type SiteSettings = {
  accessMode: SiteAccessMode;
  rsvpDeadline: string | null;
  menuEnabled: boolean;
  askDietary: boolean;
  askSongRequest: boolean;
  askNotes: boolean;
  /** The template in use (the default when none is saved). */
  whatsappTemplate: string;
  whatsappTemplateIsDefault: boolean;
  content: SiteContent;
};

export type FaqEntry = { id: string; question: string; answer: string; displayOrder: number };

const SETTINGS_ID = 1;

/**
 * Reads the settings row. If it is missing (migrations not seeded) the site
 * falls back to the safe defaults, which include private access.
 */
export async function getSiteSettings(): Promise<SiteSettings> {
  const [row] = await db.select().from(siteSettings).where(eq(siteSettings.id, SETTINGS_ID));
  return {
    accessMode: row?.accessMode ?? "private",
    rsvpDeadline: row?.rsvpDeadline ?? null,
    menuEnabled: row?.menuEnabled ?? false,
    askDietary: row?.askDietary ?? true,
    askSongRequest: row?.askSongRequest ?? true,
    askNotes: row?.askNotes ?? true,
    whatsappTemplate: row?.whatsappTemplate || DEFAULT_WHATSAPP_TEMPLATE,
    whatsappTemplateIsDefault: !row?.whatsappTemplate,
    content: mergeContent(row?.content, DEFAULT_CONTENT),
  };
}

type SettingsUpdate = Partial<Omit<typeof siteSettings.$inferInsert, "id" | "updatedAt">>;

export async function updateSiteSettings(values: SettingsUpdate) {
  await db
    .insert(siteSettings)
    .values({ id: SETTINGS_ID, ...values })
    .onConflictDoUpdate({ target: siteSettings.id, set: { ...values, updatedAt: new Date() } });
}

export async function listFaqEntries(): Promise<FaqEntry[]> {
  return db
    .select({
      id: faqEntries.id,
      question: faqEntries.question,
      answer: faqEntries.answer,
      displayOrder: faqEntries.displayOrder,
    })
    .from(faqEntries)
    .orderBy(asc(faqEntries.displayOrder), asc(faqEntries.createdAt));
}
