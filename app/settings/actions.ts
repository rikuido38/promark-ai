"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { DEFAULT_ORG_ID, SUPABASE_BUCKET_NAME } from "@/utils/constants";
import { TABLES } from "@/utils/supabase/constant";

export async function getRawOrgAvatarPath(): Promise<string | null> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return null;

  const { data } = await supabase
    .from(TABLES.ORGANIZATIONS)
    .select("avatar_url")
    .eq("id", DEFAULT_ORG_ID)
    .single();

  return (data?.avatar_url as string | null) ?? null;
}

export async function saveAssistantName(name: string, avatar_url: string | null) {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from(TABLES.ORGANIZATIONS)
    .update({ assistant_name: name, avatar_url })
    .eq("id", DEFAULT_ORG_ID);

  if (error) {
    console.error("Failed to save assistant settings", error);
    throw new Error("Failed to save assistant settings");
  }

  revalidatePath("/settings/ai-assistant");
  return { success: true };
}

export async function uploadAvatarToStorage(formData: FormData): Promise<string> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) throw new Error("Unauthorized");

  const file = formData.get("file") as File;
  if (!file) throw new Error("No file provided");

  const fileExt = file.name.split(".").pop();
  const filePath = `${DEFAULT_ORG_ID}/images/${crypto.randomUUID()}.${fileExt}`;

  // Clean up any existing avatar files
  const { data: existingFiles } = await supabase.storage
    .from(SUPABASE_BUCKET_NAME)
    .list(`${DEFAULT_ORG_ID}/images`, { search: "assistant_avatar." });

  // Also clean up any previously uploaded UUID-named avatars stored in the org
  const { data: orgData } = await supabase
    .from(TABLES.ORGANIZATIONS)
    .select("avatar_url")
    .eq("id", DEFAULT_ORG_ID)
    .single();

  const filesToRemove: string[] = [];
  if (existingFiles && existingFiles.length > 0) {
    filesToRemove.push(...existingFiles.map((f) => `${DEFAULT_ORG_ID}/images/${f.name}`));
  }
  if (orgData?.avatar_url && !(orgData.avatar_url as string).startsWith("http")) {
    filesToRemove.push(orgData.avatar_url as string);
  }
  const uniqueToRemove = [...new Set(filesToRemove)];
  if (uniqueToRemove.length > 0) {
    await supabase.storage.from(SUPABASE_BUCKET_NAME).remove(uniqueToRemove);
  }

  const { error } = await supabase.storage
    .from(SUPABASE_BUCKET_NAME)
    .upload(filePath, file, { upsert: true });

  if (error) {
    console.error("Upload error", error);
    throw new Error("Failed to upload image");
  }

  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from(SUPABASE_BUCKET_NAME)
    .createSignedUrl(filePath, 60 * 60);

  if (signedUrlError || !signedUrlData) {
    console.error("Failed to generate signed url", signedUrlError);
    throw new Error("Failed to generate signed url");
  }

  return JSON.stringify({
    signedUrl: signedUrlData.signedUrl,
    path: filePath,
  });
}
