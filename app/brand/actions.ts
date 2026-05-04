"use server";

import { createClient } from "@/utils/supabase/server";
import { BrandVisualSettings, IllustrationSettings } from "@/types/settings";
import { Media, Organization } from "@/types/models";
import { revalidatePath } from "next/cache";
import { DEFAULT_ORG_ID, SUPABASE_BUCKET_NAME } from "@/utils/constants";
import { TABLES } from "@/utils/supabase/constant";
import { resolveMediaInValue, normaliseBucketPath } from "@/lib/storage";

export async function getOrganization(): Promise<Organization | null> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return null;

  const { data, error } = await supabase
    .from(TABLES.ORGANIZATIONS)
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
    .from(TABLES.ORGANIZATION_SETTINGS)
    .select("value")
    .eq("org_id", DEFAULT_ORG_ID)
    .eq("key", "brand_master")
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

  // Always persist the bare storage path — never a signed/public URL
  const newLogoPath = settings.logo_url
    ? normaliseBucketPath(settings.logo_url, SUPABASE_BUCKET_NAME)
    : settings.logo_url;
  const toSave: BrandVisualSettings = { ...settings, logo_url: newLogoPath };

  // Delete the old logo file if it has been replaced
  const { data: existing } = await supabase
    .from(TABLES.ORGANIZATION_SETTINGS)
    .select("value")
    .eq("org_id", DEFAULT_ORG_ID)
    .eq("key", "brand_master")
    .maybeSingle();
  const oldLogoPath = (existing?.value as BrandVisualSettings | undefined)?.logo_url;
  if (oldLogoPath && oldLogoPath !== newLogoPath && !oldLogoPath.startsWith("http")) {
    await supabase.storage.from(SUPABASE_BUCKET_NAME).remove([oldLogoPath]);
  }

  const { error } = await supabase.from(TABLES.ORGANIZATION_SETTINGS).upsert(
    {
      org_id: DEFAULT_ORG_ID,
      key: "brand_master",
      value: toSave,
    },
    { onConflict: "org_id, key" },
  );

  if (error) {
    console.error("Failed to save brand visuals", error);
    throw new Error("Failed to save brand visuals");
  }

  revalidatePath(`/brand/brand-dna`);
  await markContextStale();
  return { success: true };
}

export async function uploadLogoToStorage(formData: FormData): Promise<string> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) throw new Error("Unauthorized");

  const file = formData.get("file") as File;
  if (!file) throw new Error("No file provided");

  const uuid = crypto.randomUUID();
  const fileExt = (file.name.split(".").pop() ?? "png").toLowerCase();
  const filePath = `${DEFAULT_ORG_ID}/brands/${uuid}.${fileExt}`;

  const { error } = await supabase.storage
    .from(SUPABASE_BUCKET_NAME)
    .upload(filePath, file, { upsert: false });

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

// ---------------------------------------------------------------------------
// Illustrations
// ---------------------------------------------------------------------------

export async function uploadIllustrationToTemp(
  formData: FormData,
): Promise<string> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) throw new Error("Unauthorized");

  const file = formData.get("file") as File;
  if (!file) throw new Error("No file provided");

  const uuid = crypto.randomUUID();
  const fileExt = (file.name.split(".").pop() ?? "jpg").toLowerCase();
  const filePath = `temp/${DEFAULT_ORG_ID}/${userData.user.id}/${uuid}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from(SUPABASE_BUCKET_NAME)
    .upload(filePath, file, { upsert: false });

  if (uploadError) {
    console.error("Illustration temp upload error", uploadError);
    throw new Error("Failed to upload illustration");
  }

  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from(SUPABASE_BUCKET_NAME)
    .createSignedUrl(filePath, 60 * 60);

  if (signedUrlError || !signedUrlData) {
    throw new Error("Failed to generate signed url");
  }

  return JSON.stringify({
    signedUrl: signedUrlData.signedUrl,
    path: filePath,
    uuid,
    ext: fileExt,
    filename: file.name,
  });
}

export async function getIllustrationSettings(): Promise<IllustrationSettings | null> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return null;

  const { data, error } = await supabase
    .from(TABLES.ORGANIZATION_SETTINGS)
    .select("value")
    .eq("org_id", DEFAULT_ORG_ID)
    .eq("key", "brand_illustration")
    .maybeSingle();

  if (error || !data) return null;

  const settings = data.value as IllustrationSettings;

  // Resolve signed URLs for every stored media path
  const resolveMedia = async (m: Media): Promise<Media> => {
    if (!m.url || m.url.startsWith("http")) return m;
    const { data: sd } = await supabase.storage
      .from(SUPABASE_BUCKET_NAME)
      .createSignedUrl(m.url, 60 * 60);
    return { ...m, url: sd?.signedUrl ?? m.url };
  };

  settings.general_brand_guideline = {
    description: settings.general_brand_guideline?.description ?? "",
    sample_images: await Promise.all(
      (settings.general_brand_guideline?.sample_images ?? []).map(resolveMedia),
    ),
  };

  settings.colour_palette = {
    ...settings.colour_palette,
    sample_images: await Promise.all(
      (settings.colour_palette?.sample_images ?? []).map(resolveMedia),
    ),
  };

  settings.colour_proportion = {
    ...settings.colour_proportion,
    sample_images: await Promise.all(
      (settings.colour_proportion?.sample_images ?? []).map(resolveMedia),
    ),
  };

  settings.other_usecases = await Promise.all(
    (settings.other_usecases ?? []).map(async (u) => ({
      ...u,
      sample: u.sample ? await resolveMedia(u.sample) : null,
    })),
  );

  settings.characters = await Promise.all(
    (settings.characters ?? []).map(async (c) => ({
      ...c,
      reference_image: c.reference_image ? await resolveMedia(c.reference_image) : null,
      guidelines: await Promise.all(
        (c.guidelines ?? []).map(async (g) => ({
          ...g,
          sample: g.sample ? await resolveMedia(g.sample) : null,
        })),
      ),
    })),
  );

  return settings;
}

// Fetches the raw persisted IllustrationSettings (storage paths, not signed URLs).
// Used by saveIllustrationSettings to diff old vs new and detect orphaned files.
async function getRawIllustrationSettings(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<IllustrationSettings | null> {
  const { data, error } = await supabase
    .from(TABLES.ORGANIZATION_SETTINGS)
    .select("value")
    .eq("org_id", DEFAULT_ORG_ID)
    .eq("key", "brand_illustration")
    .maybeSingle();
  if (error || !data) return null;
  return data.value as IllustrationSettings;
}

export async function saveIllustrationSettings(
  settings: IllustrationSettings,
): Promise<void> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) throw new Error("Unauthorized");

  // Fetch the currently-persisted raw value (paths, not signed URLs) so the
  // reconciler can diff old vs new and remove any orphaned storage files.
  const oldSettings = await getRawIllustrationSettings(supabase);

  const toSave = await resolveMediaInValue(
    supabase,
    oldSettings,
    settings,
    SUPABASE_BUCKET_NAME,
    `${DEFAULT_ORG_ID}/brands`,
  );

  const { error } = await supabase
    .from(TABLES.ORGANIZATION_SETTINGS)
    .upsert(
      { org_id: DEFAULT_ORG_ID, key: "brand_illustration", value: toSave },
      { onConflict: "org_id, key" },
    );

  if (error) {
    console.error("Failed to save illustration settings", error);
    throw new Error("Failed to save illustration settings");
  }

  revalidatePath(`/brand/brand-dna`);
  await markContextStale();
}

/**
 * Returns true when the brand context either doesn't exist yet or has
 * is_stale = true, meaning a recompile is needed.
 */
export type ContextState = {
  isStale: boolean;
  status: "in_progress" | "completed" | "error" | "not_found";
};

export async function getContextStaleness(): Promise<ContextState> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return { isStale: false, status: "not_found" };

  const { data } = await supabase
    .from(TABLES.ORG_CACHE_CONTEXT)
    .select("is_stale, status")
    .eq("org_id", DEFAULT_ORG_ID)
    .eq("key", "brand_illustration")
    .maybeSingle();

  // No record → never compiled → stale
  if (!data) return { isStale: true, status: "not_found" };
  return {
    isStale: data.is_stale as boolean,
    status: (data.status ?? "completed") as ContextState["status"],
  };
}

/**
 * Marks the brand illustration context as stale.
 * Called automatically after brand or illustration settings are saved.
 */
export async function markContextStale(): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from(TABLES.ORG_CACHE_CONTEXT)
    .update({ is_stale: true })
    .eq("org_id", DEFAULT_ORG_ID)
    .eq("key", "brand_illustration");
}
