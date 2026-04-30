"use server";

import { createClient } from "@/utils/supabase/server";
import { DEFAULT_ORG_ID, SUPABASE_BUCKET_NAME } from "@/utils/constants";
import { TABLES } from "@/utils/supabase/constant";

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
  const supabase = await createClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) throw new Error("Unauthorized");

  let query = supabase
    .from(TABLES.USER_DRAFTS)
    .select("id, filename, storage_path, media_type, created_at")
    .eq("media_type", mediaType)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data: rows, error } = await query;
  if (error) throw new Error(`Failed to fetch drafts: ${error.message}`);
  if (!rows || rows.length === 0) return { items: [], nextCursor: null };

  // Batch-create signed URLs (24h expiry) for all fetched rows.
  const paths = rows.map((r) => r.storage_path as string);
  const { data: signedList, error: signedError } = await supabase.storage
    .from(SUPABASE_BUCKET_NAME)
    .createSignedUrls(paths, 60 * 60 * 24);

  if (signedError) throw new Error(`Failed to sign URLs: ${signedError.message}`);

  const urlMap = new Map(
    (signedList ?? []).map((s) => [s.path, s.signedUrl ?? ""]),
  );

  const items: DraftItem[] = rows.map((r) => ({
    id: r.id as string,
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
  const supabase = await createClient();

  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) throw new Error("Unauthorized");

  const userId = userData.user.id;
  const ext = filename.split(".").pop() ?? "png";
  const newFilename = `${crypto.randomUUID()}.${ext}`;
  const destPath = `${DEFAULT_ORG_ID}/${userId}/drafts/${newFilename}`;

  // Copy file within the same bucket (download + re-upload avoids needing
  // the storage copy API which requires service-role in some configurations).
  const { data: fileData, error: downloadError } = await supabase.storage
    .from(SUPABASE_BUCKET_NAME)
    .download(storagePath);

  if (downloadError || !fileData) {
    throw new Error(`Failed to read source file: ${downloadError?.message}`);
  }

  const fileBuffer = Buffer.from(await fileData.arrayBuffer());
  let contentType = "image/png";
  if (mediaType === "video") contentType = "video/mp4";
  else if (ext === "svg") contentType = "image/svg+xml";

  const { error: uploadError } = await supabase.storage
    .from(SUPABASE_BUCKET_NAME)
    .upload(destPath, fileBuffer, { contentType, upsert: false });

  if (uploadError) throw new Error(`Failed to save draft: ${uploadError.message}`);

  const { data: signedData, error: signedError } = await supabase.storage
    .from(SUPABASE_BUCKET_NAME)
    .createSignedUrl(destPath, 60 * 60 * 24 * 7); // 7-day URL for drafts

  if (signedError || !signedData?.signedUrl) {
    throw new Error(`Failed to create signed URL: ${signedError?.message}`);
  }

  const { data: draft, error: insertError } = await supabase
    .from(TABLES.USER_DRAFTS)
    .insert({
      org_id: DEFAULT_ORG_ID,
      user_id: userId,
      filename: newFilename,
      storage_path: destPath,
      source_path: storagePath,
      media_type: mediaType,
    })
    .select("id")
    .single();

  if (insertError || !draft) {
    throw new Error(`Failed to record draft: ${insertError?.message}`);
  }

  return { draftId: draft.id as string, signedUrl: signedData.signedUrl };
}

export async function deleteDraft(draftId: string): Promise<void> {
  const supabase = await createClient();

  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) throw new Error("Unauthorized");

  // Fetch the row first to get the storage path (and verify ownership).
  const { data: draft, error: fetchError } = await supabase
    .from(TABLES.USER_DRAFTS)
    .select("storage_path")
    .eq("id", draftId)
    .eq("user_id", userData.user.id)
    .single();

  if (fetchError || !draft) throw new Error("Draft not found or access denied");

  // Delete from storage.
  await supabase.storage
    .from(SUPABASE_BUCKET_NAME)
    .remove([draft.storage_path as string]);

  // Delete the DB record.
  const { error: deleteError } = await supabase
    .from(TABLES.USER_DRAFTS)
    .delete()
    .eq("id", draftId)
    .eq("user_id", userData.user.id);

  if (deleteError) throw new Error(`Failed to delete draft: ${deleteError.message}`);
}
