"use server";

import { getUser } from "@/utils/cognito/auth";
import { getDb } from "@/repository/mongodb/client";
import { createStorageClient } from "@/utils/s3/storage";
import { SUPABASE_BUCKET_NAME } from "@/utils/constants";
import { COLLECTIONS } from "@/utils/supabase/constant";

const PAGE_SIZE = 12;

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
 * Joins each asset with its latest asset_version via `last_version_id`.
 */
export async function fetchStudioIllustrations(
  cursor?: string,
): Promise<FetchIllustrationsResult> {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");

  const db = await getDb();

  const matchStage: Record<string, unknown> = {
    created_by: user.id,
    type: "illustration",
  };
  if (cursor) {
    matchStage.created_at = { $lt: cursor };
  }

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

  const urlMap = new Map<string, string>(
    (signedList ?? []).map((s) => [s.path, s.signedUrl ?? ""]),
  );

  const items: IllustrationItem[] = rows
    .map((r) => ({
      assetId: String(r._id),
      signedUrl: urlMap.get(r.version?.storage_path as string) ?? "",
      createdAt: r.created_at as string,
    }))
    .filter((item) => item.signedUrl);

  const nextCursor =
    rows.length === PAGE_SIZE ? ((rows.at(-1)?.created_at as string) ?? null) : null;

  return { items, nextCursor };
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
    db.collection(COLLECTIONS.ASSETS).deleteOne({ _id: assetId }),
    db.collection(COLLECTIONS.ASSET_VERSIONS).deleteMany({ asset_id: assetId }),
    db.collection(COLLECTIONS.STUDIO_THREADS).deleteMany({ asset_id: assetId }),
  ]);
}
