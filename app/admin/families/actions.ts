"use server";

import { refresh } from "next/cache";
import { runAdminAction } from "@/lib/auth/admin-action";
import { formError, saved, type FormState } from "@/lib/forms";
import {
  createFamilyGroup,
  deleteFamilyGroup,
  renameFamilyGroup,
  setGuestFamilyGroup,
} from "@/lib/families/service";
import { isUuid } from "@/lib/guests/filters";
import { familyGroupNameSchema } from "@/lib/guests/validation";

export async function createFamilyGroupAction(_state: FormState, formData: FormData): Promise<FormState> {
  return runAdminAction(async () => {
    const name = familyGroupNameSchema.safeParse(formData.get("name") ?? "");
    if (!name.success) return formError("Please check the name.", { name: name.error.issues[0].message });
    const result = await createFamilyGroup(name.data);
    if (!result.ok) return formError(result.error, { name: result.error });
    refresh();
    return saved(`Created "${name.data}".`);
  });
}

export async function renameFamilyGroupAction(groupId: string, _state: FormState, formData: FormData): Promise<FormState> {
  return runAdminAction(async () => {
    if (!isUuid(groupId)) return formError("Family group not found.");
    const name = familyGroupNameSchema.safeParse(formData.get("name") ?? "");
    if (!name.success) return formError("Please check the name.", { name: name.error.issues[0].message });
    const result = await renameFamilyGroup(groupId, name.data);
    if (!result.ok) return formError(result.error, { name: result.error });
    refresh();
    return saved("Renamed.");
  });
}

export async function deleteFamilyGroupAction(groupId: string): Promise<FormState> {
  return runAdminAction(async () => {
    if (!isUuid(groupId)) return formError("Family group not found.");
    const result = await deleteFamilyGroup(groupId);
    if (!result.ok) return formError(result.error);
    refresh();
    return saved("Family group deleted.");
  });
}

/** Removes one guest from their group. The guest stays, ungrouped. */
export async function removeFromFamilyGroupAction(guestId: string): Promise<FormState> {
  return runAdminAction(async () => {
    if (!isUuid(guestId)) return formError("Guest not found.");
    await setGuestFamilyGroup(guestId, null);
    refresh();
    return saved("Removed from the group.");
  });
}
