"use server";

import { getUser } from "@/utils/cognito/auth";
import { getDb } from "@/repository/mongodb/client";
import { createStorageClient } from "@/utils/s3/storage";
import { revalidatePath } from "next/cache";
import { DEFAULT_ORG_ID, SUPABASE_BUCKET_NAME } from "@/utils/constants";
import { COLLECTIONS } from "@/utils/supabase/constant";

export async function getRawOrgAvatarPath(): Promise<string | null> {
  const user = await getUser();
  if (!user) return null;

  const db = await getDb();
  const org = await db
    .collection(COLLECTIONS.ORGANIZATIONS)
    .findOne({ _id: DEFAULT_ORG_ID } as unknown as import("mongodb").Filter<import("mongodb").Document>, { projection: { avatar_url: 1 } });

  return (org?.avatar_url as string | null) ?? null;
}

export async function saveAssistantName(name: string, avatar_url: string | null) {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");

  const db = await getDb();
  const result = await db
    .collection(COLLECTIONS.ORGANIZATIONS)
    .updateOne({ _id: DEFAULT_ORG_ID } as unknown as import("mongodb").Filter<import("mongodb").Document>, { $set: { assistant_name: name, avatar_url } });

  if (!result.acknowledged) {
    throw new Error("Failed to save assistant settings");
  }

  revalidatePath("/orgs/settings/ai-assistant");
  return { success: true };
}

export async function uploadAvatarToStorage(formData: FormData): Promise<string> {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");

  const file = formData.get("file") as File;
  if (!file) throw new Error("No file provided");

  const fileExt = file.name.split(".").pop();
  const filePath = `${DEFAULT_ORG_ID}/images/${crypto.randomUUID()}.${fileExt}`;
  const storage = createStorageClient();

  // Clean up any existing avatar files
  const { data: existingFiles } = await storage.storage
    .from(SUPABASE_BUCKET_NAME)
    .list(`${DEFAULT_ORG_ID}/images`, { search: "assistant_avatar." });

  // Also clean up any previously uploaded UUID-named avatars stored in the org
  const db = await getDb();
  const orgData = await db
    .collection(COLLECTIONS.ORGANIZATIONS)
    .findOne({ _id: DEFAULT_ORG_ID } as unknown as import("mongodb").Filter<import("mongodb").Document>, { projection: { avatar_url: 1 } });

  const filesToRemove: string[] = [];
  if (existingFiles && existingFiles.length > 0) {
    filesToRemove.push(...existingFiles.map((f) => `${DEFAULT_ORG_ID}/images/${f.name}`));
  }
  if (orgData?.avatar_url && !(orgData.avatar_url as string).startsWith("http")) {
    filesToRemove.push(orgData.avatar_url as string);
  }
  const uniqueToRemove = [...new Set(filesToRemove)];
  if (uniqueToRemove.length > 0) {
    await storage.storage.from(SUPABASE_BUCKET_NAME).remove(uniqueToRemove);
  }

  const { error } = await storage.storage
    .from(SUPABASE_BUCKET_NAME)
    .upload(filePath, file, { contentType: file.type || "application/octet-stream", upsert: true });

  if (error) {
    console.error("Upload error", error);
    throw new Error("Failed to upload image");
  }

  const { data: signedUrlData, error: signedUrlError } = await storage.storage
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
