"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

export async function updateProfile(formData: FormData) {
  const supabase = await createClient();

  const data = {
    display_name: formData.get("display_name") as string,
  };

  const { error } = await supabase.auth.updateUser({
    data: data,
  });

  if (error) {
    redirect("/user?error=Could not update profile");
  }

  revalidatePath("/", "layout");
  redirect("/user?success=true");
}
