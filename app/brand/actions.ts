"use server";

import { createClient } from "@/utils/supabase/server";
import { BrandVisualSettings } from "@/types/settings";
import { Organization } from "@/types/models";
import { revalidatePath } from "next/cache";
import { DEFAULT_ORG_ID, SUPABASE_BUCKET_NAME } from "@/utils/constants";

export async function getOrganization(): Promise<Organization | null> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return null;

  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", DEFAULT_ORG_ID)
    .single();

  if (error || !data) return null;

  const org = data as Organization;

  if (org.avatar_url && !org.avatar_url.startsWith("http")) {
    const { data: signedUrlData, error: signedUrlError } =
      await supabase.storage
        .from(SUPABASE_BUCKET_NAME)
        .createSignedUrl(org.avatar_url, 60 * 60);

    if (!signedUrlError && signedUrlData) {
      org.avatar_url = signedUrlData.signedUrl;
    }
  }

  return org;
}

export async function getBrandVisualSettings(): Promise<BrandVisualSettings | null> {
  const supabase = await createClient();

  // Validate user has access
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return null;

  const { data, error } = await supabase
    .from("org_settings")
    .select("value")
    .eq("org_id", DEFAULT_ORG_ID)
    .eq("key", "brand_visual")
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const settings = data.value as BrandVisualSettings;

  // If there's a logo, it's stored as just the path like "default/brand/images/logo.png".
  // We need to generate a short-lived signed URL for the UI to display it securely.
  if (settings.logo_url && !settings.logo_url.startsWith("http")) {
    const { data: signedUrlData, error: signedUrlError } =
      await supabase.storage
        .from(SUPABASE_BUCKET_NAME)
        .createSignedUrl(settings.logo_url, 60 * 60); // 1 hour expiry

    if (!signedUrlError && signedUrlData) {
      settings.logo_url = signedUrlData.signedUrl;
    }
  }

  return settings;
}

export async function saveBrandVisualSettings(settings: BrandVisualSettings) {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) throw new Error("Unauthorized");

  const { error } = await supabase.from("org_settings").upsert(
    {
      org_id: DEFAULT_ORG_ID,
      key: "brand_visual",
      value: settings,
    },
    { onConflict: "org_id, key" },
  );

  if (error) {
    console.error("Failed to save brand visuals", error);
    throw new Error("Failed to save brand visuals");
  }

  revalidatePath(`/brand/brand-visual`);
  return { success: true };
}

export async function uploadLogoToStorage(formData: FormData): Promise<string> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) throw new Error("Unauthorized");

  const file = formData.get("file") as File;
  if (!file) throw new Error("No file provided");

  const fileExt = file.name.split(".").pop();
  const filePath = `${DEFAULT_ORG_ID}/brand/images/logo.${fileExt}`;

  // Clean up any existing logo files with different extensions
  const { data: existingFiles } = await supabase.storage
    .from(SUPABASE_BUCKET_NAME)
    .list(`${DEFAULT_ORG_ID}/brand/images`, {
      search: "logo.",
    });

  if (existingFiles && existingFiles.length > 0) {
    const filesToRemove = existingFiles.map(
      (f) => `${DEFAULT_ORG_ID}/brand/images/${f.name}`,
    );
    await supabase.storage.from(SUPABASE_BUCKET_NAME).remove(filesToRemove);
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

  // We return both the signed URL (for immediate preview) and the raw path (for saving to the DB)
  return JSON.stringify({
    signedUrl: signedUrlData.signedUrl,
    path: filePath,
  });
}
