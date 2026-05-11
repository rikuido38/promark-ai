/**
 * Mongoose model for the `organizations` collection.
 * Uses string _id (e.g. "default") to match the existing data convention.
 */
import mongoose, { Schema, Model } from "mongoose";
import { connectMongoose } from "../mongoose";
import { Organization } from "@/types/db/organization";

const OrganizationSchema = new Schema<Organization>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    assistant_name: { type: String },
    avatar_url: { type: String },
    logo_url: { type: String },
    created_at: { type: String, required: true },
    updated_at: { type: String, required: true },
  },
  { versionKey: false }
);

function getOrganizationModel(): Model<Organization> {
  return (
    (mongoose.models.Organization as Model<Organization>) ??
    mongoose.model<Organization>("Organization", OrganizationSchema, "organizations")
  );
}

export async function findOrganizationById(id: string): Promise<Organization | null> {
  await connectMongoose();
  return getOrganizationModel().findById(id).lean();
}

export async function upsertOrganization(
  data: Omit<Organization, "created_at" | "updated_at"> & Partial<Pick<Organization, "created_at" | "updated_at">>
): Promise<Organization> {
  await connectMongoose();
  const now = new Date().toISOString();
  const result = await getOrganizationModel().findByIdAndUpdate(
    data._id,
    { $set: { ...data, updated_at: now }, $setOnInsert: { created_at: now } },
    { upsert: true, new: true, lean: true }
  );
  return result!;
}
