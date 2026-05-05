"use server";

import { revalidatePath } from "next/cache";
import { updateUserAttributes } from "@/utils/cognito/auth";
import { redirect } from "next/navigation";

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
