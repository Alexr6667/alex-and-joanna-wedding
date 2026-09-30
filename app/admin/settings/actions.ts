"use server";

import { refresh } from "next/cache";
import { runAdminAction } from "@/lib/auth/admin-action";
import { formError, saved, type FormState } from "@/lib/forms";
import { DEFAULT_WHATSAPP_TEMPLATE } from "@/lib/settings/defaults";
import { fieldErrors, generalSettingsSchema } from "@/lib/settings/schema";
import { updateSiteSettings } from "@/lib/settings/service";

export async function saveSettingsAction(_state: FormState, formData: FormData): Promise<FormState> {
  return runAdminAction(async () => {
    const parsed = generalSettingsSchema.safeParse({
      accessMode: formData.get("accessMode"),
      rsvpDeadline: formData.get("rsvpDeadline") ?? "",
      menuEnabled: formData.get("menuEnabled"),
      askDietary: formData.get("askDietary"),
      askSongRequest: formData.get("askSongRequest"),
      askNotes: formData.get("askNotes"),
      whatsappTemplate: formData.get("whatsappTemplate") ?? "",
    });
    if (!parsed.success) return formError("Please check the highlighted settings.", fieldErrors(parsed.error));

    const { whatsappTemplate, ...rest } = parsed.data;
    await updateSiteSettings({
      ...rest,
      // Saving the default text (or clearing the box) keeps following the default.
      whatsappTemplate: whatsappTemplate === "" || whatsappTemplate === DEFAULT_WHATSAPP_TEMPLATE ? null : whatsappTemplate,
    });
    refresh();
    return saved("Settings saved. The site uses them straight away.");
  });
}
