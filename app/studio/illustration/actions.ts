"use server";

import { getUser } from "@/utils/cognito/auth";
import { getDb } from "@/repository/mongodb/client";
import { createStorageClient } from "@/utils/s3/storage";
import { SUPABASE_BUCKET_NAME } from "@/utils/constants";
import { COLLECTIONS } from "@/utils/supabase/constant";
import { findUserAssetsWithLatestVersion, deleteAssetById } from "@/repository/mongodb/models/asset";
import { deleteVersionsByAssetId } from "@/repository/mongodb/models/asset-version";

const PAGE_SIZE = 10;

export type IllustrationItem = {
  assetId: string;
  signedUrl: string;
  createdAt: string;
};

export type FetchIllustrationsResult = {
  items: IllustrationItem[];
  nextCursor: string | null;
};

/**
 * Cursor-paginated fetch of the current user's studio illustration assets.
 * Only returns assets that have at least one version — assets without any
 * version record are skipped at the DB level so page size is always respected.
 */
export async function fetchStudioIllustrations(
  cursor?: string,
): Promise<FetchIllustrationsResult> {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");

  const { items, nextCursor } = await findUserAssetsWithLatestVersion(
    user.id,
    "illustration",
    PAGE_SIZE,
    cursor,
  );

  if (items.length === 0) return { items: [], nextCursor: null };

  const paths = items.map((i) => i.storagePath).filter(Boolean);

  const storage = createStorageClient();
  const { data: signedList, error: signedError } = await storage.storage
    .from(SUPABASE_BUCKET_NAME)
    .createSignedUrls(paths, 60 * 60 * 24);

  if (signedError) throw new Error(`Failed to sign URLs: ${signedError.message}`);

  const urlByPath = new Map<string, string>(
    (signedList ?? []).map((s) => [s.path, s.signedUrl ?? ""]),
  );

  const illustrations: IllustrationItem[] = items.flatMap(({ asset, storagePath }) => {
    const signedUrl = urlByPath.get(storagePath) ?? "";
    if (!signedUrl) return [];
    return [{ assetId: asset._id, signedUrl, createdAt: asset.created_at }];
  });

  return { items: illustrations, nextCursor };
}

/**
 * Deletes a studio illustration asset, its versions, and its linked thread.
 * Verifies ownership before deleting.
 */
export async function deleteStudioIllustration(assetId: string): Promise<void> {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");

  const db = await getDb();
  const asset = await db
    .collection(COLLECTIONS.ASSETS)
    .findOne({ _id: assetId, created_by: user.id, type: "illustration" });
  if (!asset) throw new Error("Asset not found or not authorized");

  await Promise.all([
    deleteAssetById(assetId),
    deleteVersionsByAssetId(assetId),
    db.collection(COLLECTIONS.STUDIO_THREADS).deleteMany({ asset_id: assetId }),
  ]);
}
