"use server";

import { getUser } from "@/utils/cognito/auth";
import { getDb } from "@/repository/mongodb/client";
import { createStorageClient } from "@/utils/s3/storage";
import { COLLECTIONS } from "@/utils/supabase/constant";
import { SUPABASE_BUCKET_NAME, DEFAULT_ORG_ID } from "@/utils/constants";
import type {
  StudioThread,
  StudioThreadType,
  StudioMediaRecord,
  StudioThreadChat as StudioThreadChatDoc,
} from "@/types/models";
import {
  findStudioThreadByAssetId,
  upsertStudioThreadDoc,
  markStudioThreadChatDone,
} from "@/repository/mongodb/models/studio-thread";
import {
  insertStudioChat,
  findChatsByThreadId,
  findLastAssistantChat,
} from "@/repository/mongodb/models/studio-thread-chat";
import {
  findVersionsByAssetId,
} from "@/repository/mongodb/models/asset-version";

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

  await upsertStudioThreadDoc(assetId, user.id, type, prompt, model, true);

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
  await upsertStudioThreadDoc(assetId, user.id, type, prompt, model, false);
}

// ── Mark first trigger done (call immediately after first AI response) ────────

export async function markNewChatDone(threadId: string): Promise<void> {
  await markStudioThreadChatDone(threadId);
}

// ── Save a single chat turn ───────────────────────────────────────────────────

export async function saveChatMessage(
  threadId: string,
  role: "user" | "assistant",
  content: string,
  mediaRecords: MediaRecord[] = [],
): Promise<void> {
  await insertStudioChat(threadId, role, content, mediaRecords);
}

// ── Load chat history for a thread ───────────────────────────────────────────

export async function loadChatHistory(threadId: string): Promise<StudioThreadChat[]> {
  const rows = await findChatsByThreadId(threadId);

  if (rows.length === 0) return [];

  const allPaths = rows.flatMap((r) =>
    (r.medias ?? []).map((m: StudioMediaRecord | string) =>
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
      thread_id: r.thread_id,
      role: r.role,
      content: r.content,
      medias,
      image_signed_urls: medias
        .map((m) => signedUrlMap.get(m.storagePath) ?? "")
        .filter(Boolean),
      created_at: r.created_at,
    };
  });
}

// ── Load signed URLs from the last assistant message ────────────────────────

export async function loadLastAssistantImages(
  threadId: string,
): Promise<Array<{ filename: string; signedUrl: string; storagePath: string; seed_details?: string }>> {
  const row = await findLastAssistantChat(threadId);

  // Support legacy rows where medias was stored as string[]
  const rawMedias = (row?.medias as MediaRecord[] | string[] | undefined) ?? [];
  const mediaRecords: MediaRecord[] = rawMedias.map((m) =>
    typeof m === "string" ? { storagePath: m } : m,
  );
  const paths = mediaRecords.map((m) => m.storagePath);

  if (paths.length === 0) return [];

  const storage = createStorageClient();
  const { data: signed } = await storage.storage
    .from(SUPABASE_BUCKET_NAME)
    .createSignedUrls(paths, 3600);

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
  return findStudioThreadByAssetId(assetId);
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
  // Fetch all versions sorted desc, take the first (latest)
  const versions = await findVersionsByAssetId(assetId);
  const latest = versions[0];
  if (!latest) return null;

  const storage = createStorageClient();
  const { data, error } = await storage.storage
    .from(SUPABASE_BUCKET_NAME)
    .createSignedUrl(latest.storage_path, 3600);

  if (error || !data?.signedUrl) return null;

  return { signedUrl: data.signedUrl, storagePath: latest.storage_path, version: latest.version };
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
  const rows = await findVersionsByAssetId(assetId);
  if (rows.length === 0) return [];

  const paths = rows.map((r) => r.storage_path);
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
      version: r.version,
      storagePath: r.storage_path,
      signedUrl: urlMap.get(r.storage_path) ?? "",
      createdAt: r.created_at,
    }))
    .filter((v) => v.signedUrl);
}
