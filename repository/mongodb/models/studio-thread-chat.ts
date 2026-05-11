/**
 * Mongoose model for the `studio_thread_chats` collection.
 * `_id` is a MongoDB ObjectId (default) — this collection was not created
 * with UUID string keys unlike other collections in this project.
 */
import mongoose, { Schema, Model, Types } from "mongoose";
import { connectMongoose } from "../mongoose";
import { StudioMediaRecord } from "@/types/models";

export interface StudioThreadChatDoc {
  _id: Types.ObjectId;
  thread_id: string;
  role: "user" | "assistant";
  content: string;
  medias: StudioMediaRecord[];
  created_at: string;
}

const StudioThreadChatSchema = new Schema<StudioThreadChatDoc>(
  {
    thread_id: { type: String, required: true, index: true },
    role: { type: String, required: true },
    content: { type: String, required: true, default: "" },
    medias: [
      {
        _id: false,
        storagePath: { type: String, required: true },
        seed_details: { type: String },
      },
    ],
    created_at: { type: String, required: true },
  },
  { versionKey: false },
);

StudioThreadChatSchema.index({ thread_id: 1, created_at: 1 });

function getModel(): Model<StudioThreadChatDoc> {
  return (
    (mongoose.models.StudioThreadChat as Model<StudioThreadChatDoc>) ??
    mongoose.model<StudioThreadChatDoc>(
      "StudioThreadChat",
      StudioThreadChatSchema,
      "studio_thread_chats",
    )
  );
}

export async function insertStudioChat(
  threadId: string,
  role: "user" | "assistant",
  content: string,
  medias: StudioMediaRecord[] = [],
): Promise<void> {
  await connectMongoose();
  await getModel().create({
    thread_id: threadId,
    role,
    content,
    medias,
    created_at: new Date().toISOString(),
  });
}

export async function findChatsByThreadId(threadId: string): Promise<StudioThreadChatDoc[]> {
  await connectMongoose();
  return getModel().find({ thread_id: threadId }).sort({ created_at: 1 }).lean();
}

/** Returns the most recent assistant message, or null if none exists. */
export async function findLastAssistantChat(
  threadId: string,
): Promise<StudioThreadChatDoc | null> {
  await connectMongoose();
  return getModel()
    .findOne({ thread_id: threadId, role: "assistant" })
    .sort({ created_at: -1 })
    .lean();
}
