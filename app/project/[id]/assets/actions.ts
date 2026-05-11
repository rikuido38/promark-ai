"use server";

import { getUser } from "@/utils/cognito/auth";
import { getDb } from "@/repository/mongodb/client";
import { createStorageClient } from "@/utils/s3/storage";
import { SUPABASE_BUCKET_NAME } from "@/utils/constants";
import { COLLECTIONS } from "@/utils/supabase/constant";

const PAGE_SIZE = 12;

export type AssetMediaType = "image" | "video" | "illustration";

export type AssetItem = {
  id: string;
  filename: string;
  storagePath: string;
  mediaType: AssetMediaType;
  createdAt: string;
  signedUrl: string;
  source: "project" | "shared";
};

export type FetchProjectAssetsResult = {
  items: AssetItem[];
  nextCursor: string | null;
};

/**
 * Cursor-paginated fetch of assets that belong to or are shared with a project.
 * Includes:
 *  - Assets with context.type === "project" and context.id === projectId
 *  - Assets referenced by asset_permissions with resource_id === projectId
 */
export async function fetchProjectAssets(
  projectId: string,
  mediaType: AssetMediaType,
  cursor?: string,
): Promise<FetchProjectAssetsResult> {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");

  const db = await getDb();

  // Collect shared asset IDs from asset_permissions
  const permissionDocs = await db
    .collection(COLLECTIONS.ASSET_PERMISSIONS)
    .find({ resource_id: projectId, resource_type: "project" })
    .project({ asset_id: 1 })
    .toArray();

  const sharedIds = permissionDocs.map((p) => p.asset_id).filter(Boolean);

  const matchStage: Record<string, unknown> = {
    type: mediaType,
    $or: [
      { "context.type": "project", "context.ref_id": projectId },
      ...(sharedIds.length > 0 ? [{ _id: { $in: sharedIds } }] : []),
    ],
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
    (signedList ?? []).map((s) => [s.path, s.signedUrl]),
  );

  const items: AssetItem[] = rows.map((r) => {
    const ctx = r.context as { type?: string; ref_id?: string } | undefined;
    const isOwned =
      ctx?.type === "project" && String(ctx?.ref_id) === projectId;
    return {
      id: String(r._id),
      filename: (r.filename as string) ?? "",
      storagePath: (r.version?.storage_path as string) ?? "",
      mediaType: (r.type as AssetMediaType) ?? mediaType,
      createdAt: (r.created_at as string) ?? new Date().toISOString(),
      signedUrl: urlMap.get(r.version?.storage_path as string) ?? "",
      source: isOwned ? "project" : "shared",
    };
  });

  const last = items.at(-1);
  const nextCursor = rows.length === PAGE_SIZE ? (last?.createdAt ?? null) : null;

  return { items, nextCursor };
}
