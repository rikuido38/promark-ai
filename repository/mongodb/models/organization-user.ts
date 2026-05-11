/**
 * Mongoose model for the `organization_users` collection.
 * Maps users to organizations with a role.
 * Uses string _id (UUID) to match the project convention.
 */
import mongoose, { Schema, Model } from "mongoose";
import { v4 as uuidv4 } from "uuid";
import { connectMongoose } from "../mongoose";
import { OrganizationUser } from "@/types/db/organization";

const OrganizationUserSchema = new Schema<OrganizationUser>(
  {
    _id: { type: String, required: true },
    org_id: { type: String, required: true, index: true },
    user_id: { type: String, required: true, index: true },
    is_owner: { type: Boolean, required: true, default: false },
    is_default: { type: Boolean, default: false },
    created_at: { type: String, required: true },
    updated_at: { type: String, required: true },
  },
  { versionKey: false }
);

// Compound unique index: one role record per user per org
OrganizationUserSchema.index({ org_id: 1, user_id: 1 }, { unique: true });

function getOrganizationUserModel(): Model<OrganizationUser> {
  return (
    (mongoose.models.OrganizationUser as Model<OrganizationUser>) ??
    mongoose.model<OrganizationUser>(
      "OrganizationUser",
      OrganizationUserSchema,
      "organization_users"
    )
  );
}

export async function getOrganizationUsers(orgId: string): Promise<OrganizationUser[]> {
  await connectMongoose();
  return getOrganizationUserModel().find({ org_id: orgId }).lean();
}

export async function getUserOrganizations(userId: string): Promise<OrganizationUser[]> {
  await connectMongoose();
  return getOrganizationUserModel().find({ user_id: userId }).lean();
}

export async function getOrganizationMembership(
  userId: string,
  orgId: string
): Promise<OrganizationUser | null> {
  await connectMongoose();
  return getOrganizationUserModel().findOne({ user_id: userId, org_id: orgId }).lean();
}

export async function upsertOrganizationUser(
  orgId: string,
  userId: string,
  isOwner: boolean,
  isDefault?: boolean
): Promise<OrganizationUser> {
  await connectMongoose();
  const now = new Date().toISOString();
  const $set: Record<string, unknown> = { is_owner: isOwner, updated_at: now };
  if (isDefault !== undefined) $set.is_default = isDefault;
  const result = await getOrganizationUserModel().findOneAndUpdate(
    { org_id: orgId, user_id: userId },
    {
      $set,
      $setOnInsert: { _id: uuidv4(), org_id: orgId, user_id: userId, created_at: now },
    },
    { upsert: true, new: true, lean: true }
  );
  return result!;
}

/**
 * Sets the given org as the user's default, clearing any previous default.
 * This is atomic per-user: only one org can be default at a time.
 */
export async function setDefaultOrganization(userId: string, orgId: string): Promise<void> {
  await connectMongoose();
  const model = getOrganizationUserModel();
  const now = new Date().toISOString();
  // Clear existing default
  await model.updateMany({ user_id: userId, is_default: true }, { $set: { is_default: false, updated_at: now } });
  // Set new default
  await model.updateOne({ user_id: userId, org_id: orgId }, { $set: { is_default: true, updated_at: now } });
}

/**
 * Returns the org_id the user should land on:
 * the one marked is_default, or the first membership if none is set.
 */
export async function getDefaultOrgIdForUser(userId: string): Promise<string | null> {
  await connectMongoose();
  const memberships = await getOrganizationUserModel()
    .find({ user_id: userId })
    .sort({ is_default: -1, created_at: 1 })
    .lean();
  return memberships[0]?.org_id ?? null;
}

export async function removeOrganizationUser(orgId: string, userId: string): Promise<void> {
  await connectMongoose();
  await getOrganizationUserModel().deleteOne({ org_id: orgId, user_id: userId });
}
