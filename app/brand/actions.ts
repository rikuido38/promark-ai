"use server";

import { getUser } from "@/utils/cognito/auth";
import { getDb } from "@/repository/mongodb/client";
import { createStorageClient } from "@/utils/s3/storage";
import { BrandVisualSettings, IllustrationSettings } from "@/types/settings";
import { Media, Organization } from "@/types/models";
import { revalidatePath } from "next/cache";
import { DEFAULT_ORG_ID, SUPABASE_BUCKET_NAME } from "@/utils/constants";
import { COLLECTIONS } from "@/utils/supabase/constant";
import { resolveMediaInValue, normaliseBucketPath } from "@/lib/storage";

export async function getOrganization(): Promise<Organization | null> {
  const user = await getUser();
  if (!user) return null;

  const db = await getDb();
  const data = await db
    .collection(COLLECTIONS.ORGANIZATIONS)
    .findOne({ _id: DEFAULT_ORG_ID } as unknown as import("mongodb").Filter<import("mongodb").Document>);

  if (!data) return null;

  const org = { ...data, id: data._id?.toString() ?? "" } as unknown as Organization;

  if (org.avatar_url && !org.avatar_url.startsWith("http")) {
    const storage = createStorageClient();
    const { data: signedUrlData, error: signedUrlError } =
      await storage.storage
        .from(SUPABASE_BUCKET_NAME)
        .createSignedUrl(org.avatar_url, 60 * 60);

    if (!signedUrlError && signedUrlData) {
      org.avatar_url = signedUrlData.signedUrl;
    }
  }

  return org;
}

export async function getBrandVisualSettings(): Promise<BrandVisualSettings | null> {
  const user = await getUser();
  if (!user) return null;

  const db = await getDb();
  const row = await db
    .collection(COLLECTIONS.ORGANIZATION_SETTINGS)
    .findOne({ org_id: DEFAULT_ORG_ID, key: "brand_master" });

  if (!row) return null;

  const settings = row.value as BrandVisualSettings;

  if (settings.logo_url && !settings.logo_url.startsWith("http")) {
    const storage = createStorageClient();
    const { data: signedUrlData, error: signedUrlError } =
      await storage.storage
        .from(SUPABASE_BUCKET_NAME)
        .createSignedUrl(settings.logo_url, 60 * 60);

    if (!signedUrlError && signedUrlData) {
      settings.logo_url = signedUrlData.signedUrl;
    }
  }

  return settings;
}

export async function saveBrandVisualSettings(settings: BrandVisualSettings) {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");

  const newLogoPath = settings.logo_url
    ? normaliseBucketPath(settings.logo_url, SUPABASE_BUCKET_NAME)
    : settings.logo_url;
  const toSave: BrandVisualSettings = { ...settings, logo_url: newLogoPath };

  const db = await getDb();
  const existing = await db
    .collection(COLLECTIONS.ORGANIZATION_SETTINGS)
    .findOne({ org_id: DEFAULT_ORG_ID, key: "brand_master" });
  const oldLogoPath = (existing?.value as BrandVisualSettings | undefined)?.logo_url;

  if (oldLogoPath && oldLogoPath !== newLogoPath && !oldLogoPath.startsWith("http")) {
    const storage = createStorageClient();
    await storage.storage.from(SUPABASE_BUCKET_NAME).remove([oldLogoPath]);
  }

  const result = await db.collection(COLLECTIONS.ORGANIZATION_SETTINGS).updateOne(
    { org_id: DEFAULT_ORG_ID, key: "brand_master" },
    { $set: { value: toSave } },
    { upsert: true },
  );

  if (!result.acknowledged) {
    throw new Error("Failed to save brand visuals");
  }

  revalidatePath(`/brand/brand-dna`);
  await markContextStale();
  return { success: true };
}

export async function uploadLogoToStorage(formData: FormData): Promise<string> {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");

  const file = formData.get("file") as File;
  if (!file) throw new Error("No file provided");

  const uuid = crypto.randomUUID();
  const fileExt = (file.name.split(".").pop() ?? "png").toLowerCase();
  const filePath = `${DEFAULT_ORG_ID}/brands/${uuid}.${fileExt}`;
  const storage = createStorageClient();

  const { error } = await storage.storage
    .from(SUPABASE_BUCKET_NAME)
    .upload(filePath, file, { upsert: false });

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

// ---------------------------------------------------------------------------
// Illustrations
// ---------------------------------------------------------------------------

export async function uploadIllustrationToTemp(
  formData: FormData,
): Promise<string> {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");

  const file = formData.get("file") as File;
  if (!file) throw new Error("No file provided");

  const uuid = crypto.randomUUID();
  const fileExt = (file.name.split(".").pop() ?? "jpg").toLowerCase();
  const filePath = `temp/${DEFAULT_ORG_ID}/${user.id}/${uuid}.${fileExt}`;
  const storage = createStorageClient();

  const { error: uploadError } = await storage.storage
    .from(SUPABASE_BUCKET_NAME)
    .upload(filePath, file, { upsert: false });

  if (uploadError) {
    console.error("Illustration temp upload error", uploadError);
    throw new Error("Failed to upload illustration");
  }

  const { data: signedUrlData, error: signedUrlError } = await storage.storage
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
  const user = await getUser();
  if (!user) return null;

  const db = await getDb();
  const row = await db
    .collection(COLLECTIONS.ORGANIZATION_SETTINGS)
    .findOne({ org_id: DEFAULT_ORG_ID, key: "brand_illustration" });

  if (!row) return null;

  const settings = row.value as IllustrationSettings;
  const storage = createStorageClient();

  const resolveMedia = async (m: Media): Promise<Media> => {
    if (!m.url || m.url.startsWith("http")) return m;
    const { data: sd } = await storage.storage
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
async function getRawIllustrationSettings(): Promise<IllustrationSettings | null> {
  const db = await getDb();
  const row = await db
    .collection(COLLECTIONS.ORGANIZATION_SETTINGS)
    .findOne({ org_id: DEFAULT_ORG_ID, key: "brand_illustration" });
  if (!row) return null;
  return row.value as IllustrationSettings;
}

export async function saveIllustrationSettings(
  settings: IllustrationSettings,
): Promise<void> {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");

  const storage = createStorageClient();

  // Fetch the currently-persisted raw value (paths, not signed URLs) so the
  // reconciler can diff old vs new and remove any orphaned storage files.
  const oldSettings = await getRawIllustrationSettings();

  const toSave = await resolveMediaInValue(
    storage,
    oldSettings,
    settings,
    SUPABASE_BUCKET_NAME,
    `${DEFAULT_ORG_ID}/brands`,
  );

  const db = await getDb();
  const result = await db.collection(COLLECTIONS.ORGANIZATION_SETTINGS).updateOne(
    { org_id: DEFAULT_ORG_ID, key: "brand_illustration" },
    { $set: { value: toSave } },
    { upsert: true },
  );

  if (!result.acknowledged) {
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
  const user = await getUser();
  if (!user) return { isStale: false, status: "not_found" };

  const db = await getDb();
  const row = await db
    .collection(COLLECTIONS.ORG_CACHE_CONTEXT)
    .findOne({ org_id: DEFAULT_ORG_ID, key: "brand_illustration" });

  if (!row) return { isStale: true, status: "not_found" };
  return {
    isStale: row.is_stale as boolean,
    status: ((row.status as string) ?? "completed") as ContextState["status"],
  };
}

/**
 * Marks the brand illustration context as stale.
 * Called automatically after brand or illustration settings are saved.
 */
export async function markContextStale(): Promise<void> {
  const db = await getDb();
  await db.collection(COLLECTIONS.ORG_CACHE_CONTEXT).updateMany(
    { org_id: DEFAULT_ORG_ID, key: "brand_illustration" },
    { $set: { is_stale: true } },
  );
}
