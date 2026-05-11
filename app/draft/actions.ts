"use server";

import { getUser } from "@/utils/cognito/auth";
import { getDb } from "@/repository/mongodb/client";
import { createStorageClient } from "@/utils/s3/storage";
import { DEFAULT_ORG_ID, SUPABASE_BUCKET_NAME } from "@/utils/constants";
import { COLLECTIONS } from "@/utils/supabase/constant";
import { createAsset, deleteAsset, type AssetMediaType } from "@/repository/mongodb/assets";

const PAGE_SIZE = 10;

export type DraftMediaType = "image" | "video" | "illustration";

export type DraftItem = {
  id: string;
  filename: string;
  storagePath: string;
  mediaType: DraftMediaType;
  createdAt: string;
  signedUrl: string;
};

export type FetchDraftsResult = {
  items: DraftItem[];
  /** ISO timestamp of the oldest item — pass as `cursor` to fetch the next page. Null when no more pages. */
  nextCursor: string | null;
};

/**
 * Cursor-paginated fetch of user-owned assets filtered by media type.
 * Joins assets with their latest asset_version to get storage_path for signing.
 */
export async function fetchDrafts(
  mediaType: DraftMediaType,
  cursor?: string,
): Promise<FetchDraftsResult> {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");

  const db = await getDb();
  const matchStage: Record<string, unknown> = {
    created_by: user.id,
    type: mediaType,
  };
  if (cursor) {
    matchStage.created_at = { $lt: cursor };
  }

  // Join latest version to get storage_path
  const rows = await db
    .collection(COLLECTIONS.ASSETS)
    .aggregate([
      { $match: matchStage },
      { $sort: { created_at: -1 } },
      { $limit: PAGE_SIZE },
      {
        $lookup: {
          from: COLLECTIONS.ASSET_VERSIONS,
          localField: "last_version_id",
          foreignField: "_id",
          as: "version",
        },
      },
      { $unwind: { path: "$version", preserveNullAndEmptyArrays: true } },
    ])
    .toArray();

  if (rows.length === 0) return { items: [], nextCursor: null };

  const paths = rows
    .map((r) => r.version?.storage_path as string | undefined)
    .filter((p): p is string => Boolean(p));

  const storage = createStorageClient();
  const { data: signedList, error: signedError } = await storage.storage
    .from(SUPABASE_BUCKET_NAME)
    .createSignedUrls(paths, 60 * 60 * 24);

  if (signedError) throw new Error(`Failed to sign URLs: ${signedError.message}`);

  const urlMap = new Map((signedList ?? []).map((s) => [s.path, s.signedUrl ?? ""]));

  const items: DraftItem[] = rows.map((r) => {
    const storagePath = (r.version?.storage_path as string) ?? "";
    return {
      id: r._id?.toString() ?? "",
      filename: (r.version?.filename as string) ?? "",
      storagePath,
      mediaType: r.type as DraftMediaType,
      createdAt: r.created_at as string,
      signedUrl: urlMap.get(storagePath) ?? "",
    };
  });

  const nextCursor = rows.length === PAGE_SIZE ? (rows.at(-1)?.created_at as string ?? null) : null;

  return { items, nextCursor };
}

export async function saveDraft(
  storagePath: string,
  filename: string,
  mediaType: DraftMediaType = "image",
): Promise<{ draftId: string; signedUrl: string }> {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");

  const userId = user.id;
  const ext = filename.split(".").pop() ?? "png";
  const newFilename = `${crypto.randomUUID()}.${ext}`;
  const destPath = `${DEFAULT_ORG_ID}/${userId}/drafts/${newFilename}`;
  const storage = createStorageClient();

  const { data: fileData, error: downloadError } = await storage.storage
    .from(SUPABASE_BUCKET_NAME)
    .download(storagePath);

  if (downloadError || !fileData) {
    throw new Error(`Failed to read source file: ${downloadError?.message}`);
  }

  const fileBuffer = Buffer.from(await fileData.arrayBuffer());
  let contentType = "image/png";
  if (mediaType === "video") contentType = "video/mp4";
  else if (ext === "svg") contentType = "image/svg+xml";

  const { error: uploadError } = await storage.storage
    .from(SUPABASE_BUCKET_NAME)
    .upload(destPath, fileBuffer, { contentType, upsert: false });

  if (uploadError) throw new Error(`Failed to save draft: ${uploadError.message}`);

  const { data: signedData, error: signedError } = await storage.storage
    .from(SUPABASE_BUCKET_NAME)
    .createSignedUrl(destPath, 60 * 60 * 24 * 7);

  if (signedError || !signedData?.signedUrl) {
    throw new Error(`Failed to create signed URL: ${signedError?.message}`);
  }

  const asset = await createAsset({
    name: newFilename,
    filename: newFilename,
    type: mediaType as AssetMediaType,
    created_by: userId,
    storage_path: destPath,
    source_path: storagePath,
  });

  return { draftId: asset._id, signedUrl: signedData.signedUrl };
}

export async function deleteDraft(draftId: string): Promise<void> {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");

  const db = await getDb();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const asset = await (db.collection(COLLECTIONS.ASSETS) as any)
    .findOne({ _id: draftId, created_by: user.id });

  if (!asset) throw new Error("Draft not found or access denied");

  // Remove all version files from storage
  const versions = await db
    .collection(COLLECTIONS.ASSET_VERSIONS)
    .find({ asset_id: draftId })
    .toArray();

  const paths = versions
    .map((v) => v.storage_path as string | undefined)
    .filter((p): p is string => Boolean(p));

  if (paths.length > 0) {
    const storage = createStorageClient();
    await storage.storage.from(SUPABASE_BUCKET_NAME).remove(paths);
  }

  await deleteAsset(draftId);
}


