"use server";

import { getUser } from "@/utils/cognito/auth";
import { getDb } from "@/utils/mongodb/client";
import { createStorageClient } from "@/utils/s3/storage";
import { COLLECTIONS } from "@/utils/supabase/constant";
import { SUPABASE_BUCKET_NAME } from "@/utils/constants";

export type StudioThreadType = "illustration" | "image" | "video";

export interface StudioThread {
  id: string;
  thread_id: string;
  user_id: string;
  type: StudioThreadType;
  prompt: string | null;
  model: string | null;
  is_new_chat: boolean;
  created_at: string;
}

/**
 * Structured record stored in the `medias` array of a chat row.
 * Replaces the old flat `string[]` of storage paths.
 */
export interface MediaRecord {
  /** Storage path within the bucket, e.g. "temp/default/abc.jpg" */
  storagePath: string;
  /**
   * Auto-generated description of the image: scene, style, characters, colors,
   * and reference images used. Passed back to the inner agent on edit requests.
   */
  seed_details?: string;
}

export interface StudioThreadChat {
  id: string;
  thread_id: string;
  role: "user" | "assistant";
  content: string;
  medias: MediaRecord[];
  image_signed_urls: string[]; // resolved at load time, not stored
  created_at: string;
}

// ── Thread upsert ─────────────────────────────────────────────────────────────

export async function upsertStudioThread(
  threadId: string,
  type: StudioThreadType,
  prompt?: string,
  model?: string,
): Promise<{ error?: string }> {
  const user = await getUser();
  if (!user) return { error: "Unauthorized" };

  const db = await getDb();
  await db.collection(COLLECTIONS.STUDIO_THREADS).updateOne(
    { thread_id: threadId },
    {
      $setOnInsert: {
        thread_id: threadId,
        user_id: user.id,
        type,
        prompt: prompt ?? null,
        model: model ?? null,
        is_new_chat: true,
        created_at: new Date().toISOString(),
      },
    },
    { upsert: true },
  );
  return {};
}

// ── Mark first trigger done (call immediately after first AI response) ────────

export async function markNewChatDone(threadId: string): Promise<void> {
  const db = await getDb();
  await db
    .collection(COLLECTIONS.STUDIO_THREADS)
    .updateOne({ thread_id: threadId }, { $set: { is_new_chat: false } });
}

// ── Save a single chat turn ───────────────────────────────────────────────────

export async function saveChatMessage(
  threadId: string,
  role: "user" | "assistant",
  content: string,
  mediaRecords: MediaRecord[] = [],
): Promise<void> {
  const db = await getDb();
  await db.collection(COLLECTIONS.STUDIO_THREAD_CHATS).insertOne({
    thread_id: threadId,
    role,
    content,
    medias: mediaRecords,
    created_at: new Date().toISOString(),
  });
}

// ── Load chat history for a thread ───────────────────────────────────────────

export async function loadChatHistory(threadId: string): Promise<StudioThreadChat[]> {
  const db = await getDb();
  const rows = await db
    .collection(COLLECTIONS.STUDIO_THREAD_CHATS)
    .find({ thread_id: threadId })
    .sort({ created_at: 1 })
    .toArray();

  if (rows.length === 0) return [];

  const allPaths = rows.flatMap((r) =>
    ((r.medias as MediaRecord[] | string[] | undefined) ?? []).map((m) =>
      typeof m === "string" ? m : m.storagePath,
    ),
  );
  const signedUrlMap = new Map<string, string>();

  if (allPaths.length > 0) {
    const storage = createStorageClient();
    const { data: signed } = await storage.storage
      .from(SUPABASE_BUCKET_NAME)
      .createSignedUrls(allPaths, 3600);
    for (const s of signed ?? []) {
      if (s.signedUrl && s.path) signedUrlMap.set(s.path, s.signedUrl);
    }
  }

  return rows.map((r) => {
    // Support legacy rows where medias was stored as string[]
    const rawMedias = (r.medias as MediaRecord[] | string[] | undefined) ?? [];
    const medias: MediaRecord[] = rawMedias.map((m) =>
      typeof m === "string" ? { storagePath: m } : m,
    );
    return {
      id: r._id?.toString() ?? "",
      thread_id: r.thread_id as string,
      role: r.role as "user" | "assistant",
      content: r.content as string,
      medias,
      image_signed_urls: medias
        .map((m) => signedUrlMap.get(m.storagePath) ?? "")
        .filter(Boolean),
      created_at: r.created_at as string,
    };
  });
}

// ── Load signed URLs from the last assistant message ────────────────────────

export async function loadLastAssistantImages(
  threadId: string,
): Promise<Array<{ filename: string; signedUrl: string; storagePath: string; seed_details?: string }>> {
  const db = await getDb();
  // Use find().sort().limit(1) instead of findOne() to reliably apply sort.
  const rows = await db
    .collection(COLLECTIONS.STUDIO_THREAD_CHATS)
    .find({ thread_id: threadId, role: "assistant" })
    .sort({ created_at: -1 })
    .limit(1)
    .project({ medias: 1 })
    .toArray();

  const row = rows[0];
  // Support legacy rows where medias was stored as string[]
  const rawMedias = (row?.medias as MediaRecord[] | string[] | undefined) ?? [];
  const mediaRecords: MediaRecord[] = rawMedias.map((m) =>
    typeof m === "string" ? { storagePath: m } : m,
  );
  const paths = mediaRecords.map((m) => m.storagePath);
  console.log("[loadLastAssistantImages] threadId =", threadId, "| row found =", !!row, "| paths =", paths);

  if (paths.length === 0) return [];

  const storage = createStorageClient();
  const { data: signed, error } = await storage.storage
    .from(SUPABASE_BUCKET_NAME)
    .createSignedUrls(paths, 3600);

  console.log("[loadLastAssistantImages] signed count =", signed?.length ?? 0, "| error =", error);

  return (signed ?? [])
    .filter((s) => s.signedUrl && s.path)
    .map((s) => {
      const record = mediaRecords.find((m) => m.storagePath === s.path);
      return {
        filename: s.path.split("/").pop() ?? s.path,
        signedUrl: s.signedUrl,
        storagePath: s.path,
        seed_details: record?.seed_details,
      };
    });
}

// ── Fetch a single thread ─────────────────────────────────────────────────────

export async function getStudioThread(threadId: string): Promise<StudioThread | null> {
  const db = await getDb();
  const row = await db
    .collection(COLLECTIONS.STUDIO_THREADS)
    .findOne({ thread_id: threadId });
  if (!row) return null;
  return {
    id: row._id?.toString() ?? "",
    thread_id: row.thread_id as string,
    user_id: row.user_id as string,
    type: row.type as StudioThreadType,
    prompt: row.prompt as string | null,
    model: row.model as string | null,
    is_new_chat: row.is_new_chat as boolean,
    created_at: row.created_at as string,
  };
}
