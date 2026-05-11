/**
 * Mongoose model for the `studio_threads` collection.
 * Uses string _id (UUID = assetId) to match the project convention.
 * `_id`, `thread_id`, and `asset_id` are always the same value.
 */
import mongoose, { Schema, Model } from "mongoose";
import { connectMongoose } from "../mongoose";
import { StudioThread, StudioThreadType } from "@/types/models";

const StudioThreadSchema = new Schema<StudioThread>(
  {
    _id: { type: String, required: true },
    thread_id: { type: String, required: true, index: true },
    asset_id: { type: String, required: true, index: true },
    user_id: { type: String, required: true, index: true },
    type: { type: String, required: true },
    prompt: { type: String, default: null },
    model: { type: String, default: null },
    is_new_chat: { type: Boolean, required: true, default: true },
    created_at: { type: String, required: true },
  },
  { versionKey: false },
);

function getModel(): Model<StudioThread> {
  return (
    (mongoose.models.StudioThread as Model<StudioThread>) ??
    mongoose.model<StudioThread>("StudioThread", StudioThreadSchema, "studio_threads")
  );
}

export async function findStudioThreadByAssetId(assetId: string): Promise<StudioThread | null> {
  await connectMongoose();
  return getModel().findOne({ asset_id: assetId }).lean();
}

export async function upsertStudioThreadDoc(
  assetId: string,
  userId: string,
  type: StudioThreadType,
  prompt?: string | null,
  model?: string | null,
  isNew = false,
): Promise<void> {
  await connectMongoose();
  const now = new Date().toISOString();
  await getModel().updateOne(
    { _id: assetId },
    {
      $setOnInsert: {
        _id: assetId,
        thread_id: assetId,
        asset_id: assetId,
        user_id: userId,
        type,
        prompt: prompt ?? null,
        model: model ?? null,
        is_new_chat: isNew,
        created_at: now,
      },
    },
    { upsert: true },
  );
}

export async function markStudioThreadChatDone(threadId: string): Promise<void> {
  await connectMongoose();
  await getModel().updateOne({ thread_id: threadId }, { $set: { is_new_chat: false } });
}
