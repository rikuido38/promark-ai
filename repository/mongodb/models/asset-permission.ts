/**
 * Mongoose model for the `asset_permissions` collection.
 * Stores explicit access grants for assets (cross-context sharing).
 * Uses string _id (UUID) to match the project convention.
 */
import mongoose, { Schema, Model } from "mongoose";
import { v4 as uuidv4 } from "uuid";
import { connectMongoose } from "../mongoose";
import { AssetPermission, AssetPermissionLevel, AssetPermissionSubjectType } from "@/types/db/asset";

const AssetPermissionSchema = new Schema<AssetPermission>(
  {
    _id: { type: String, required: true },
    asset_id: { type: String, required: true, index: true },
    subject_type: { type: String, required: true },
    subject_id: { type: String, required: true },
    permission: { type: String, required: true },
    granted_by: { type: String, required: true },
    expires_at: { type: String, default: null },
    created_at: { type: String, required: true },
    updated_at: { type: String },
  },
  { versionKey: false }
);

// Compound unique index: one grant per subject per asset
AssetPermissionSchema.index({ asset_id: 1, subject_type: 1, subject_id: 1 }, { unique: true });

function getModel(): Model<AssetPermission> {
  return (
    (mongoose.models.AssetPermission as Model<AssetPermission>) ??
    mongoose.model<AssetPermission>("AssetPermission", AssetPermissionSchema, "asset_permissions")
  );
}

/** Find a single non-expired direct grant for a user on an asset. */
export async function findUserAssetGrant(
  assetId: string,
  userId: string,
): Promise<AssetPermission | null> {
  await connectMongoose();
  const now = new Date().toISOString();
  return getModel()
    .findOne({
      asset_id: assetId,
      subject_type: "user",
      subject_id: userId,
      $or: [{ expires_at: null }, { expires_at: { $exists: false } }, { expires_at: { $gt: now } }],
    })
    .lean();
}

/** Find all non-expired grants for a list of projects on an asset. */
export async function findProjectAssetGrants(
  assetId: string,
  projectIds: string[],
): Promise<AssetPermission[]> {
  await connectMongoose();
  const now = new Date().toISOString();
  return getModel()
    .find({
      asset_id: assetId,
      subject_type: "project",
      subject_id: { $in: projectIds },
      $or: [{ expires_at: null }, { expires_at: { $exists: false } }, { expires_at: { $gt: now } }],
    })
    .lean();
}

/** Find all permission docs for a given subject_id (e.g. a project). */
export async function findGrantsBySubject(
  subjectType: AssetPermissionSubjectType,
  subjectId: string,
): Promise<AssetPermission[]> {
  await connectMongoose();
  return getModel().find({ subject_type: subjectType, subject_id: subjectId }).lean();
}

/** Upsert a permission grant (insert or update). */
export async function upsertAssetPermission({
  assetId,
  subjectType,
  subjectId,
  permission,
  grantedBy,
  expiresAt,
}: {
  assetId: string;
  subjectType: AssetPermissionSubjectType;
  subjectId: string;
  permission: AssetPermissionLevel;
  grantedBy: string;
  expiresAt?: string | null;
}): Promise<void> {
  await connectMongoose();
  const now = new Date().toISOString();
  await getModel().updateOne(
    { asset_id: assetId, subject_type: subjectType, subject_id: subjectId },
    {
      $set: { permission, granted_by: grantedBy, expires_at: expiresAt ?? null, updated_at: now },
      $setOnInsert: {
        _id: uuidv4(),
        asset_id: assetId,
        subject_type: subjectType,
        subject_id: subjectId,
        created_at: now,
      },
    },
    { upsert: true },
  );
}

/** Remove a single permission grant. */
export async function deleteAssetPermission({
  assetId,
  subjectType,
  subjectId,
}: {
  assetId: string;
  subjectType: AssetPermissionSubjectType;
  subjectId: string;
}): Promise<void> {
  await connectMongoose();
  await getModel().deleteOne({ asset_id: assetId, subject_type: subjectType, subject_id: subjectId });
}

/** Remove all grants for an asset (e.g. when deleting the asset). */
export async function deletePermissionsByAssetId(assetId: string): Promise<void> {
  await connectMongoose();
  await getModel().deleteMany({ asset_id: assetId });
}
