"use server";

import { createClient } from "@/utils/supabase/server";
import { TABLES } from "@/utils/supabase/constant";
import { SUPABASE_BUCKET_NAME } from "@/utils/constants";

export type StudioThreadType = "illustration" | "image" | "video";

export interface StudioThread {
  id: string;
  thread_id: string;
  user_id: string;
  type: StudioThreadType;
  prompt: string | null;
  model: string | null;
  is_first_trigger: boolean;
  created_at: string;
}

export interface StudioThreadChat {
  id: string;
  thread_id: string;
  role: "user" | "assistant";
  content: string;
  image_storage_paths: string[];
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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase.from(TABLES.STUDIO_THREADS).upsert(
    { thread_id: threadId, user_id: user.id, type, prompt: prompt ?? null, model: model ?? null },
    { onConflict: "thread_id", ignoreDuplicates: true },
  );
  if (error) return { error: error.message };
  return {};
}

// ── Mark first trigger done (call immediately after first AI response) ────────

export async function markNewChatDone(threadId: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from(TABLES.STUDIO_THREADS)
    .update({ is_new_chat: false })
    .eq("thread_id", threadId);
}

// ── Save a single chat turn ───────────────────────────────────────────────────

export async function saveChatMessage(
  threadId: string,
  role: "user" | "assistant",
  content: string,
  imageStoragePaths: string[] = [],
): Promise<void> {
  const supabase = await createClient();
  await supabase.from(TABLES.STUDIO_THREAD_CHATS).insert({
    thread_id: threadId,
    role,
    content,
    image_storage_paths: imageStoragePaths,
  });
}

// ── Load chat history for a thread ───────────────────────────────────────────

export async function loadChatHistory(threadId: string): Promise<StudioThreadChat[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from(TABLES.STUDIO_THREAD_CHATS)
    .select("id, thread_id, role, content, image_storage_paths, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  // Resolve signed URLs for all stored image paths
  const rows = data as Array<{
    id: string;
    thread_id: string;
    role: "user" | "assistant";
    content: string;
    image_storage_paths: string[];
    created_at: string;
  }>;

  const allPaths = rows.flatMap((r) => r.image_storage_paths);
  const signedUrlMap = new Map<string, string>();

  if (allPaths.length > 0) {
    const { data: signed } = await supabase.storage
      .from(SUPABASE_BUCKET_NAME)
      .createSignedUrls(allPaths, 3600);
    for (const s of signed ?? []) {
      if (s.signedUrl) signedUrlMap.set(s.path, s.signedUrl);
    }
  }

  return rows.map((r) => ({
    ...r,
    image_signed_urls: r.image_storage_paths.map((p) => signedUrlMap.get(p) ?? "").filter(Boolean),
  }));
}

// ── Fetch a single thread ─────────────────────────────────────────────────────

export async function getStudioThread(threadId: string): Promise<StudioThread | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from(TABLES.STUDIO_THREADS)
    .select("*")
    .eq("thread_id", threadId)
    .single();
  return (data as StudioThread) ?? null;
}
