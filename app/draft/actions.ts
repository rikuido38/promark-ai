"use server";

import { getUser } from "@/utils/cognito/auth";
import { getDb } from "@/utils/mongodb/client";
import { createStorageClient } from "@/utils/s3/storage";
import { DEFAULT_ORG_ID, SUPABASE_BUCKET_NAME } from "@/utils/constants";
import { COLLECTIONS } from "@/utils/supabase/constant";

const PAGE_SIZE = 10;

export type DraftMediaType = "image" | "video" | "illustration";

export type DraftItem = {
  id: string;
  filename: string;
  storagePath: string;
  mediaType: DraftMediaType;
  createdAt: string;
  signedUrl: string;
};

export type FetchDraftsResult = {
  items: DraftItem[];
  /** ISO timestamp of the oldest item — pass as `cursor` to fetch the next page. Null when no more pages. */
  nextCursor: string | null;
};

/**
 * Cursor-paginated fetch of user drafts filtered by media type.
 * Pass `cursor` (an ISO created_at string) to fetch the next page.
 */
export async function fetchDrafts(
  mediaType: DraftMediaType,
  cursor?: string,
): Promise<FetchDraftsResult> {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");

  const db = await getDb();
  const filter: Record<string, unknown> = { media_type: mediaType };
  if (cursor) {
    filter.created_at = { $lt: cursor };
  }

  const rows = await db
    .collection(COLLECTIONS.USER_DRAFTS)
    .find(filter)
    .sort({ created_at: -1 })
    .limit(PAGE_SIZE)
    .toArray();

  if (rows.length === 0) return { items: [], nextCursor: null };

  const paths = rows.map((r) => r.storage_path as string);
  const storage = createStorageClient();
  const { data: signedList, error: signedError } = await storage.storage
    .from(SUPABASE_BUCKET_NAME)
    .createSignedUrls(paths, 60 * 60 * 24);

  if (signedError) throw new Error(`Failed to sign URLs: ${signedError.message}`);

  const urlMap = new Map((signedList ?? []).map((s) => [s.path, s.signedUrl ?? ""]));

  const items: DraftItem[] = rows.map((r) => ({
    id: r._id?.toString() ?? "",
    filename: r.filename as string,
    storagePath: r.storage_path as string,
    mediaType: r.media_type as DraftMediaType,
    createdAt: r.created_at as string,
    signedUrl: urlMap.get(r.storage_path as string) ?? "",
  }));

  const nextCursor = rows.length === PAGE_SIZE ? (rows.at(-1)?.created_at as string ?? null) : null;

  return { items, nextCursor };
}

export async function saveDraft(
  storagePath: string,
  filename: string,
  mediaType: DraftMediaType = "image",
): Promise<{ draftId: string; signedUrl: string }> {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");

  const userId = user.id;
  const ext = filename.split(".").pop() ?? "png";
  const newFilename = `${crypto.randomUUID()}.${ext}`;
  const destPath = `${DEFAULT_ORG_ID}/${userId}/drafts/${newFilename}`;
  const storage = createStorageClient();

  const { data: fileData, error: downloadError } = await storage.storage
    .from(SUPABASE_BUCKET_NAME)
    .download(storagePath);

  if (downloadError || !fileData) {
    throw new Error(`Failed to read source file: ${downloadError?.message}`);
  }

  const fileBuffer = Buffer.from(await fileData.arrayBuffer());
  let contentType = "image/png";
  if (mediaType === "video") contentType = "video/mp4";
  else if (ext === "svg") contentType = "image/svg+xml";

  const { error: uploadError } = await storage.storage
    .from(SUPABASE_BUCKET_NAME)
    .upload(destPath, fileBuffer, { contentType, upsert: false });

  if (uploadError) throw new Error(`Failed to save draft: ${uploadError.message}`);

  const { data: signedData, error: signedError } = await storage.storage
    .from(SUPABASE_BUCKET_NAME)
    .createSignedUrl(destPath, 60 * 60 * 24 * 7);

  if (signedError || !signedData?.signedUrl) {
    throw new Error(`Failed to create signed URL: ${signedError?.message}`);
  }

  const db = await getDb();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const draftsCol = db.collection(COLLECTIONS.USER_DRAFTS) as any;
  const draftId = crypto.randomUUID();
  const result = await draftsCol.insertOne({
    _id: draftId,
    org_id: DEFAULT_ORG_ID,
    user_id: userId,
    filename: newFilename,
    storage_path: destPath,
    source_path: storagePath,
    media_type: mediaType,
    created_at: new Date().toISOString(),
  } );

  if (!result.acknowledged) {
    throw new Error("Failed to record draft");
  }

  return { draftId, signedUrl: signedData.signedUrl };
}

export async function deleteDraft(draftId: string): Promise<void> {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");

  const db = await getDb();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const col = db.collection(COLLECTIONS.USER_DRAFTS) as any;
  const row = await col.findOne({ _id: draftId, user_id: user.id });

  if (!row) throw new Error("Draft not found or access denied");

  const storage = createStorageClient();
  await storage.storage.from(SUPABASE_BUCKET_NAME).remove([row.storage_path as string]);

  await col.deleteOne({ _id: draftId, user_id: user.id });
}
