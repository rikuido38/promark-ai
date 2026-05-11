/**
 * Mongoose model for the `asset_versions` collection.
 * Uses string _id (UUID) to match the project convention.
 */
import mongoose, { Schema, Model } from "mongoose";
import { connectMongoose } from "../mongoose";
import { AssetVersion } from "@/types/db/asset";

const AssetVersionSchema = new Schema<AssetVersion>(
  {
    _id: { type: String, required: true },
    asset_id: { type: String, required: true, index: true },
    version: { type: Number, required: true },
    filename: { type: String, required: true },
    storage_path: { type: String, required: true },
    source_path: { type: String },
    notes: { type: String },
    created_by: { type: String, required: true },
    created_at: { type: String, required: true },
  },
  { versionKey: false }
);

function getAssetVersionModel(): Model<AssetVersion> {
  return (
    (mongoose.models.AssetVersion as Model<AssetVersion>) ??
    mongoose.model<AssetVersion>("AssetVersion", AssetVersionSchema, "asset_versions")
  );
}

export async function findAssetVersionById(id: string): Promise<AssetVersion | null> {
  await connectMongoose();
  return getAssetVersionModel().findById(id).lean();
}

export async function findVersionsByAssetId(assetId: string): Promise<AssetVersion[]> {
  await connectMongoose();
  return getAssetVersionModel().find({ asset_id: assetId }).sort({ version: -1 }).lean();
}

/**
 * Fetches the latest version document for each of the given version IDs in a single query.
 * Returns a Map keyed by version _id.
 */
export async function findVersionsByIds(ids: string[]): Promise<Map<string, AssetVersion>> {
  await connectMongoose();
  const versions = await getAssetVersionModel()
    .find({ _id: { $in: ids } })
    .lean();
  return new Map(versions.map((v) => [v._id, v]));
}

/**
 * For each asset ID, finds the latest version document (highest `version` number).
 * Returns a Map keyed by `asset_id`.
 * Query:
 *   db.asset_versions.aggregate([
 *     { $match: { asset_id: { $in: assetIds } } },
 *     { $sort: { asset_id: 1, version: -1 } },
 *     { $group: { _id: "$asset_id", doc: { $first: "$$ROOT" } } },
 *     { $replaceRoot: { newRoot: "$doc" } }
 *   ])
 */
export async function findLatestVersionsByAssetIds(
  assetIds: string[],
): Promise<Map<string, AssetVersion>> {
  await connectMongoose();
  const rows = await getAssetVersionModel().aggregate<AssetVersion>([
    { $match: { asset_id: { $in: assetIds } } },
    { $sort: { asset_id: 1, version: -1 } },
    { $group: { _id: "$asset_id", doc: { $first: "$$ROOT" } } },
    { $replaceRoot: { newRoot: "$doc" } },
  ]);
  return new Map(rows.map((v) => [v.asset_id, v]));
}

export async function deleteVersionsByAssetId(assetId: string): Promise<void> {
  await connectMongoose();
  await getAssetVersionModel().deleteMany({ asset_id: assetId });
}
