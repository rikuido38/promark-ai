"use server";

import { getUser } from "@/utils/cognito/auth";
import { getDb } from "@/repository/mongodb/client";
import { createStorageClient } from "@/utils/s3/storage";
import { SUPABASE_BUCKET_NAME, DEFAULT_ORG_ID } from "@/utils/constants";
import { COLLECTIONS } from "@/utils/supabase/constant";
import { createAsset } from "@/repository/mongodb/assets";
import { randomUUID } from "node:crypto";

const PAGE_SIZE = 18;

export type CollectionAssetItem = {
  id: string;
  filename: string;
  mediaType: "image" | "video" | "illustration";
  createdAt: string;
  signedUrl: string;
};

export type FetchCollectionResult = {
  items: CollectionAssetItem[];
  nextCursor: string | null;
};

/** Paginated fetch of the current user's own assets (all media types). */
export async function fetchUserCollectionAssets(
  cursor?: string,
): Promise<FetchCollectionResult> {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");

  const db = await getDb();
  const match: Record<string, unknown> = {
    created_by: user.id,
    "context.type": "user",
  };
  if (cursor) match.created_at = { $lt: cursor };

  const rows = await db
    .collection(COLLECTIONS.ASSETS)
    .aggregate([
      { $match: match },
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

  if (!rows.length) return { items: [], nextCursor: null };

  const paths = rows
    .map((r) => r.version?.storage_path as string | undefined)
    .filter((p): p is string => Boolean(p));

  const storage = createStorageClient();
  const { data: signedList, error } = await storage.storage
    .from(SUPABASE_BUCKET_NAME)
    .createSignedUrls(paths, 60 * 60 * 24);

  if (error) throw new Error(`Failed to sign URLs: ${error.message}`);

  const urlMap = new Map(
    (signedList ?? []).map((s) => [s.path, s.signedUrl]),
  );

  const items: CollectionAssetItem[] = rows.map((r) => ({
    id: String(r._id),
    filename: (r.filename as string) ?? "",
    mediaType: (r.media_type as CollectionAssetItem["mediaType"]) ?? "image",
    createdAt: (r.created_at as string) ?? new Date().toISOString(),
    signedUrl: urlMap.get(r.version?.storage_path as string) ?? "",
  }));

  const last = items.at(-1);
  const nextCursor = rows.length === PAGE_SIZE ? (last?.createdAt ?? null) : null;

  return { items, nextCursor };
}

/** Share existing user assets to a project by creating asset_permissions records. */
export async function shareAssetsToProject(
  projectId: string,
  assetIds: string[],
): Promise<void> {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");
  if (!assetIds.length) return;

  const db = await getDb();
  const now = new Date().toISOString();

  // Avoid duplicates
  const existing = await db
    .collection(COLLECTIONS.ASSET_PERMISSIONS)
    .find({
      asset_id: { $in: assetIds },
      resource_id: projectId,
      resource_type: "project",
    })
    .project({ asset_id: 1 })
    .toArray();

  const alreadyShared = new Set(existing.map((e) => String(e.asset_id)));

  const docs = assetIds
    .filter((id) => !alreadyShared.has(id))
    .map((assetId) => ({
      _id: randomUUID(),
      asset_id: assetId,
      resource_id: projectId,
      resource_type: "project",
      granted_by: user.id,
      granted_at: now,
    }));

  if (docs.length) {
    await db.collection(COLLECTIONS.ASSET_PERMISSIONS).insertMany(docs);
  }
}

/** Upload files from FormData, create assets + asset_permissions for the project. */
export async function uploadFilesToProject(
  projectId: string,
  formData: FormData,
): Promise<{ imported: number }> {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");

  const files = formData.getAll("files") as File[];
  if (!files.length) return { imported: 0 };

  const storage = createStorageClient();
  const now = new Date().toISOString();
  let imported = 0;

  for (const file of files) {
    const ext = file.name.split(".").at(-1) ?? "bin";
    const storageName = `${randomUUID()}.${ext}`;
    const storagePath = `assets/${DEFAULT_ORG_ID}/${user.id}/${storageName}`;

    const bytes = await file.arrayBuffer();
    const { error: uploadError } = await storage.storage
      .from(SUPABASE_BUCKET_NAME)
      .upload(storagePath, bytes, { contentType: file.type, upsert: false });

    if (uploadError) continue;

    const mediaType = file.type.startsWith("video/") ? "video" : "image";

    const asset = await createAsset({
      name: file.name,
      filename: file.name,
      media_type: mediaType,
      org_id: DEFAULT_ORG_ID,
      created_by: user.id,
      context: { type: "project", ref_id: projectId },
      storage_path: storagePath,
    });

    const db = await getDb();
    await db.collection(COLLECTIONS.ASSET_PERMISSIONS).insertOne({
      _id: randomUUID(),
      asset_id: asset._id,
      resource_id: projectId,
      resource_type: "project",
      granted_by: user.id,
      granted_at: now,
    });

    imported++;
  }

  return { imported };
}
