/**
 * Mongoose model for the `assets` collection.
 * Uses string _id (UUID) to match the project convention.
 */
import mongoose, { Schema, Model } from "mongoose";
import { connectMongoose } from "../mongoose";
import { Asset } from "@/types/db/asset";

const AssetSchema = new Schema<Asset>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    type: { type: String, required: true },
    thread_id: { type: String },
    created_by: { type: String, required: true, index: true },
    tags: [{ type: String }],
    last_version_id: { type: String },
    created_at: { type: String, required: true },
    updated_at: { type: String, required: true },
  },
  { versionKey: false }
);

AssetSchema.index({ created_by: 1, type: 1, created_at: -1 });

function getAssetModel(): Model<Asset> {
  return (
    (mongoose.models.Asset as Model<Asset>) ??
    mongoose.model<Asset>("Asset", AssetSchema, "assets")
  );
}

export async function findAssetById(id: string): Promise<Asset | null> {
  await connectMongoose();
  return getAssetModel().findById(id).lean();
}

export async function findAssetByIdAndOwner(
  id: string,
  userId: string,
): Promise<Asset | null> {
  await connectMongoose();
  return getAssetModel().findOne({ _id: id, created_by: userId }).lean();
}

export interface FetchAssetsPage {
  items: Asset[];
  nextCursor: string | null;
}

/**
 * Cursor-paginated fetch of assets for a user filtered by type.
 * Cursor is the `created_at` ISO string of the last item on the previous page.
 */
export async function findUserAssetsByType(
  userId: string,
  type: Asset["type"],
  pageSize: number,
  cursor?: string,
): Promise<FetchAssetsPage> {
  await connectMongoose();
  const filter: Record<string, unknown> = { created_by: userId, type };
  if (cursor) filter.created_at = { $lt: cursor };

  const rows = await getAssetModel()
    .find(filter)
    .sort({ created_at: -1 })
    .limit(pageSize)
    .lean();

  const nextCursor =
    rows.length === pageSize ? (rows.at(-1)?.created_at ?? null) : null;

  return { items: rows, nextCursor };
}

export interface AssetWithLatestVersion {
  asset: Asset;
  storagePath: string;
  /** The `_id` of the latest asset_version document. */
  versionId: string;
}

export interface FetchAssetsWithVersionPage {
  items: AssetWithLatestVersion[];
  nextCursor: string | null;
}

/**
 * Cursor-paginated fetch of assets that have at least one version.
 * Uses $lookup + $match to skip assets with no versions at the DB level,
 * so the page size is respected correctly.
 *
 * Query (aggregation):
 *   db.assets.aggregate([
 *     { $match: { created_by, type, [created_at: {$lt: cursor}] } },
 *     { $sort: { created_at: -1 } },
 *     { $lookup: { from: "asset_versions", localField: "_id", foreignField: "asset_id", as: "_versions" } },
 *     { $match: { "_versions.0": { $exists: true } } },   // skip assets with no versions
 *     { $limit: pageSize },
 *     { $addFields: { _latestVersion: { $arrayElemAt: [{ $sortArray: { input: "$_versions", sortBy: { version: -1 } } }, 0] } } }
 *   ])
 */
export async function findUserAssetsWithLatestVersion(
  userId: string,
  type: Asset["type"],
  pageSize: number,
  cursor?: string,
): Promise<FetchAssetsWithVersionPage> {
  await connectMongoose();

  const matchStage: Record<string, unknown> = { created_by: userId, type };
  if (cursor) matchStage.created_at = { $lt: cursor };

  type AggRow = Asset & { _latestVersion: { _id: string; storage_path: string; version: number } };

  const rows = await getAssetModel().aggregate<AggRow>([
    { $match: matchStage },
    { $sort: { created_at: -1 } },
    {
      $lookup: {
        from: "asset_versions",
        localField: "_id",
        foreignField: "asset_id",
        as: "_versions",
      },
    },
    { $match: { "_versions.0": { $exists: true } } },
    { $limit: pageSize },
    {
      $addFields: {
        _latestVersion: {
          $arrayElemAt: [
            { $sortArray: { input: "$_versions", sortBy: { version: -1 } } },
            0,
          ],
        },
      },
    },
  ]);

  const nextCursor =
    rows.length === pageSize ? (rows.at(-1)?.created_at ?? null) : null;

  const items: AssetWithLatestVersion[] = rows.map((r) => ({
    asset: r,
    storagePath: r._latestVersion.storage_path,
    versionId: r._latestVersion._id,
  }));

  return { items, nextCursor };
}

export async function deleteAssetById(id: string): Promise<void> {
  await connectMongoose();
  await getAssetModel().deleteOne({ _id: id });
}
