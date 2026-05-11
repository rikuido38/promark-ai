"use server";

import { revalidatePath } from "next/cache";
import { updateUserAttributes, getUser } from "@/utils/cognito/auth";
import { redirect } from "next/navigation";
import { getDefaultOrgIdForUser } from "@/repository/mongodb/models/organization-user";

/**
 * Returns the org_id the authenticated user should be active on.
 * Priority: is_default org → first membership. Falls back to "default".
 */
export async function resolveActiveOrgId(): Promise<string> {
  const user = await getUser();
  if (!user?.id) return "default";
  const orgId = await getDefaultOrgIdForUser(user.id);
  return orgId ?? "default";
}

export async function updateProfile(formData: FormData) {
  const displayName = formData.get("display_name") as string;

  try {
    await updateUserAttributes([{ Name: "name", Value: displayName }]);
  } catch {
    redirect("/user?error=Could not update profile");
  }

  revalidatePath("/", "layout");
  redirect("/user?success=true");
}
