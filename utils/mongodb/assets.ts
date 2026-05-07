/**
 * Assets collection — typed CRUD helpers.
 *
 * Replaces `user_drafts` as the single unified store for all generated assets
 * (user-owned, project-owned, campaign-owned).
 *
 * Versioning: every mutation that changes file content creates a new record in
 * `asset_versions`. The `assets` document points to the latest version via
 * `latest_version_id`. File paths and version numbers live exclusively in `asset_versions`.
 */
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/utils/mongodb/client";

export type AssetMediaType = "image" | "video" | "illustration";
export type AssetContextType = "user" | "project" | "campaign";

export interface AssetVersion {
  _id: string;
  asset_id: string;
  version: number;
  filename: string;
  storage_path: string;
  source_path?: string;
  notes?: string;
  created_by: string;
  created_at: string;
}

export interface Asset {
  _id: string;
  name: string;
  filename: string;
  media_type: AssetMediaType;
  org_id: string;
  created_by: string;
  context: {
    type: AssetContextType;
    ref_id: string | null;
  };
  visibility: "private" | "org" | "public";
  tags: string[];
  /** ID of the current AssetVersion document */
  latest_version_id?: string;
  created_at: string;
  updated_at: string;
}

const COLLECTION = "assets";
const VERSIONS_COLLECTION = "asset_versions";

export async function createAsset(
  input: Omit<Asset, "_id" | "created_at" | "updated_at" | "tags" | "visibility" | "latest_version_id"> &
    Partial<Pick<Asset, "tags" | "visibility">> & {
      storage_path: string;
      source_path?: string;
    }
): Promise<Asset> {
  const db = await getDb();
  const now = new Date().toISOString();
  const assetId = uuidv4();
  const versionId = uuidv4();

  const { storage_path, source_path, ...assetInput } = input;

  const version: AssetVersion = {
    _id: versionId,
    asset_id: assetId,
    version: 1,
    filename: assetInput.filename,
    storage_path,
    source_path,
    created_by: assetInput.created_by,
    created_at: now,
  };

  const asset: Asset = {
    _id: assetId,
    tags: [],
    visibility: "private",
    ...assetInput,
    latest_version_id: versionId,
    created_at: now,
    updated_at: now,
  };

  await db.collection<AssetVersion>(VERSIONS_COLLECTION).insertOne(version);
  await db.collection<Asset>(COLLECTION).insertOne(asset);
  return asset;
}

/**
 * Create a new version of an existing asset (e.g. after re-generation or edit).
 * Updates the parent asset to point at the latest version.
 */
export async function createAssetVersion(
  assetId: string,
  input: {
    filename: string;
    storage_path: string;
    source_path?: string;
    notes?: string;
    created_by: string;
  }
): Promise<AssetVersion> {
  const db = await getDb();
  const now = new Date().toISOString();

  // Determine next version number from the versions collection
  const asset = await db.collection<Asset>(COLLECTION).findOne({ _id: assetId });
  if (!asset) throw new Error(`Asset ${assetId} not found`);
  const latestVersion = await db
    .collection<AssetVersion>(VERSIONS_COLLECTION)
    .findOne({ asset_id: assetId }, { sort: { version: -1 } });
  const nextVersion = (latestVersion?.version ?? 0) + 1;
  const versionId = uuidv4();

  const version: AssetVersion = {
    _id: versionId,
    asset_id: assetId,
    version: nextVersion,
    ...input,
    created_at: now,
  };

  await db.collection<AssetVersion>(VERSIONS_COLLECTION).insertOne(version);
  await db.collection<Asset>(COLLECTION).updateOne(
    { _id: assetId },
    {
      $set: {
        filename: input.filename,
        latest_version_id: versionId,
        updated_at: now,
      },
    }
  );

  return version;
}

/** List all versions for an asset, newest first. */
export async function listAssetVersions(assetId: string): Promise<AssetVersion[]> {
  const db = await getDb();
  return db
    .collection<AssetVersion>(VERSIONS_COLLECTION)
    .find({ asset_id: assetId })
    .sort({ version: -1 })
    .toArray();
}

export async function getAssetById(assetId: string): Promise<Asset | null> {
  const db = await getDb();
  return db.collection<Asset>(COLLECTION).findOne({ _id: assetId });
}

/** Cursor-paginated asset list scoped to a context (user / project / campaign). */
export async function listAssets({
  orgId,
  contextType,
  refId,
  createdBy,
  mediaType,
  cursor,
  limit = 10,
}: {
  orgId: string;
  contextType: AssetContextType;
  refId?: string | null;
  createdBy?: string;
  mediaType?: AssetMediaType;
  cursor?: string;
  limit?: number;
}): Promise<{ items: Asset[]; nextCursor: string | null }> {
  const db = await getDb();
  const filter: Record<string, unknown> = {
    org_id: orgId,
    "context.type": contextType,
  };
  if (refId !== undefined) filter["context.ref_id"] = refId ?? null;
  if (createdBy) filter.created_by = createdBy;
  if (mediaType) filter.media_type = mediaType;
  if (cursor) filter.created_at = { $lt: cursor };

  const rows = await db
    .collection<Asset>(COLLECTION)
    .find(filter)
    .sort({ created_at: -1 })
    .limit(limit)
    .toArray();

  const nextCursor =
    rows.length === limit ? (rows.at(-1)?.created_at ?? null) : null;

  return { items: rows, nextCursor };
}

export async function deleteAsset(assetId: string): Promise<void> {
  const db = await getDb();
  await Promise.all([
    db.collection<Asset>(COLLECTION).deleteOne({ _id: assetId }),
    db.collection<AssetVersion>(VERSIONS_COLLECTION).deleteMany({ asset_id: assetId }),
  ]);
}
