"use server";

import { getUser } from "@/utils/cognito/auth";
import { getDb } from "@/utils/mongodb/client";
import { createStorageClient } from "@/utils/s3/storage";
import { COLLECTIONS } from "@/utils/supabase/constant";
import { SUPABASE_BUCKET_NAME, DEFAULT_ORG_ID } from "@/utils/constants";
import type {
  StudioThread,
  StudioThreadType,
  StudioMediaRecord,
  StudioThreadChat as StudioThreadChatDoc,
} from "@/types/models";

export type { StudioThreadType, StudioThread } from "@/types/models";

/** Re-export for backward compatibility with callers that use `MediaRecord`. */
export type MediaRecord = StudioMediaRecord;

/**
 * View-layer chat type: base MongoDB shape + resolved `id` and `image_signed_urls`.
 * `image_signed_urls` is generated at query time and is NOT stored in the database.
 */
export type StudioThreadChat = Omit<StudioThreadChatDoc, "_id"> & {
  id: string;
  image_signed_urls: string[];
};

// ── Asset + thread creation ───────────────────────────────────────────────────

/**
 * Creates the asset record (using assetId as the user-facing key) and a linked
 * thread document with a separate internal thread ID (for LangGraph / chat).
 * The URL route uses assetId; chat messages are keyed on internalThreadId.
 */
export async function createAssetAndThread(
  assetId: string,
  type: StudioThreadType,
  prompt?: string,
  model?: string,
): Promise<{ error?: string }> {
  const user = await getUser();
  if (!user) return { error: "Unauthorized" };

  const db = await getDb();
  const now = new Date().toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.collection(COLLECTIONS.ASSETS) as any).insertOne({
    _id: assetId,
    type,
    thread_id: assetId,
    created_by: user.id,
    created_at: now,
    updated_at: now,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.collection(COLLECTIONS.STUDIO_THREADS) as any).insertOne({
    _id: assetId,
    thread_id: assetId,
    asset_id: assetId,
    user_id: user.id,
    type,
    prompt: prompt ?? null,
    model: model ?? null,
    is_new_chat: true,
    created_at: now,
  });

  return {};
}

/**
 * Upserts a studio_thread record for the given asset.
 * Safe to call on every message send — uses $setOnInsert so existing docs are untouched.
 * Handles legacy assets that were created before studio_threads existed.
 */
export async function upsertStudioThread(
  assetId: string,
  type: StudioThreadType,
  prompt?: string,
  model?: string,
): Promise<void> {
  const user = await getUser();
  if (!user) return;

  const db = await getDb();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.collection(COLLECTIONS.STUDIO_THREADS) as any).updateOne(
    { _id: assetId },
    {
      $setOnInsert: {
        _id: assetId,
        thread_id: assetId,
        asset_id: assetId,
        user_id: user.id,
        type,
        prompt: prompt ?? null,
        model: model ?? null,
        is_new_chat: false,
        created_at: new Date().toISOString(),
      },
    },
    { upsert: true },
  );
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

type RawMedias = MediaRecord[] | string[] | undefined;

export async function loadChatHistory(threadId: string): Promise<StudioThreadChat[]> {
  const db = await getDb();
  const rows = await db
    .collection(COLLECTIONS.STUDIO_THREAD_CHATS)
    .find({ thread_id: threadId })
    .sort({ created_at: 1 })
    .toArray();

  if (rows.length === 0) return [];

  const allPaths = rows.flatMap((r) =>
    ((r.medias as RawMedias) ?? []).map((m) =>
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

export async function getStudioThread(assetId: string): Promise<StudioThread | null> {
  const db = await getDb();
  const row = await db
    .collection(COLLECTIONS.STUDIO_THREADS)
    .findOne({ asset_id: assetId });
  if (!row) return null;
  return {
    _id: row._id as string,
    thread_id: row.thread_id as string,
    asset_id: row.asset_id as string,
    user_id: row.user_id as string,
    type: row.type as StudioThreadType,
    prompt: row.prompt as string | null,
    model: row.model as string | null,
    is_new_chat: row.is_new_chat as boolean,
    created_at: row.created_at as string,
  };
}

// ── Asset versioning ──────────────────────────────────────────────────────────

export interface AssetVersion {
  version: number;
  storagePath: string;
  signedUrl: string;
  createdAt: string;
}

/**
 * Loads the single latest published version for an asset (via last_version_id),
 * returning a signed URL ready for the preview panel.
 * Returns null if the asset has no published versions.
 */
export async function loadLatestVersion(
  assetId: string,
): Promise<{ signedUrl: string; storagePath: string; version: number } | null> {
  const db = await getDb();

  const asset = await db
    .collection(COLLECTIONS.ASSETS)
    .findOne({ _id: assetId }, { projection: { last_version_id: 1 } });

  const versionId = asset?.last_version_id as string | undefined;
  if (!versionId) return null;

  const versionDoc = await db
    .collection(COLLECTIONS.ASSET_VERSIONS)
    .findOne({ _id: versionId });

  if (!versionDoc) return null;

  const storagePath = versionDoc.storage_path as string;
  const storage = createStorageClient();
  const { data, error } = await storage.storage
    .from(SUPABASE_BUCKET_NAME)
    .createSignedUrl(storagePath, 3600);

  if (error || !data?.signedUrl) return null;

  return { signedUrl: data.signedUrl, storagePath, version: versionDoc.version as number };
}

/**
 * Copies the image from temp storage to a permanent assets path,
 * then updates the asset record and creates a new asset_version.
 * The asset is created upfront via createAssetAndThread; this only adds a version.
 */
export async function publishNewVersion(
  assetId: string,
  storagePath: string,
): Promise<{ error?: string; version?: number; signedUrl?: string; storagePath?: string }> {
  const user = await getUser();
  if (!user) return { error: "Unauthorized" };

  const db = await getDb();
  const storage = createStorageClient();

  // 1. Copy from temp → permanent assets path
  const newFilename = `${crypto.randomUUID()}.png`;
  const newPath = `${DEFAULT_ORG_ID}/assets/${newFilename}`;
  const { error: copyError } = await storage.storage
    .from(SUPABASE_BUCKET_NAME)
    .copy(storagePath, newPath);
  if (copyError) return { error: `Copy failed: ${copyError.message}` };

  // 2. Determine version number
  const versionCount = await db
    .collection(COLLECTIONS.ASSET_VERSIONS)
    .countDocuments({ asset_id: assetId });
  const version = versionCount + 1;

  // 3. Insert version record
  const versionId = crypto.randomUUID();
  await db.collection(COLLECTIONS.ASSET_VERSIONS).insertOne({
    _id: versionId,
    asset_id: assetId,
    version,
    storage_path: newPath,
    created_at: new Date().toISOString(),
  });

  // 4. Update asset with latest version pointer and updated_at
  await db.collection(COLLECTIONS.ASSETS).updateOne(
    { _id: assetId },
    { $set: { last_version_id: versionId, updated_at: new Date().toISOString() } },
  );

  // 5. Signed URL for the new file
  const { data: signedData, error: signedError } = await storage.storage
    .from(SUPABASE_BUCKET_NAME)
    .createSignedUrl(newPath, 3600);
  if (signedError ?? !signedData?.signedUrl) {
    return { error: `Signed URL failed: ${signedError?.message ?? "unknown"}` };
  }

  return { version, signedUrl: signedData.signedUrl, storagePath: newPath };
}

/**
 * Loads all published versions for a thread's asset, ordered oldest first.
 */
export async function loadAssetVersions(assetId: string): Promise<AssetVersion[]> {
  const db = await getDb();
  const rows = await db
    .collection(COLLECTIONS.ASSET_VERSIONS)
    .find({ asset_id: assetId })
    .sort({ version: 1 })
    .toArray();

  if (rows.length === 0) return [];

  const paths = rows.map((r) => r.storage_path as string);
  const storage = createStorageClient();
  const { data: signed } = await storage.storage
    .from(SUPABASE_BUCKET_NAME)
    .createSignedUrls(paths, 3600);

  const urlMap = new Map<string, string>();
  for (const s of signed ?? []) {
    if (s.signedUrl && s.path) urlMap.set(s.path, s.signedUrl);
  }

  return rows
    .map((r) => ({
      version: r.version as number,
      storagePath: r.storage_path as string,
      signedUrl: urlMap.get(r.storage_path as string) ?? "",
      createdAt: r.created_at as string,
    }))
    .filter((v) => v.signedUrl);
}
