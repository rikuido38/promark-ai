import type { SupabaseClient } from "@supabase/supabase-js";
import type { Media } from "@/types/models";

// ── Type guard ────────────────────────────────────────────────────────────────

function isMedia(v: unknown): v is Media {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const keys = Object.keys(v);
  return (
    keys.length === 2 &&
    "filename" in v &&
    typeof (v as Record<string, unknown>).filename === "string" &&
    "url" in v &&
    typeof (v as Record<string, unknown>).url === "string"
  );
}

// ── Path collector ─────────────────────────────────────────────────────────────
// Recursively walks any JSON value and returns all non-http Media paths found.

function collectPaths(value: unknown): string[] {
  if (isMedia(value)) {
    return value.url && !value.url.startsWith("http") ? [value.url] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectPaths);
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap(collectPaths);
  }
  return [];
}

// ── Deep resolver ─────────────────────────────────────────────────────────────
// Walks the value tree. When a Media node is found with a temp/ url, moves the
// file to its final path and returns a new Media with the updated url.

async function resolveNode<T>(
  supabase: SupabaseClient,
  value: T,
  bucket: string,
  destDir: string,
): Promise<T> {
  if (isMedia(value)) {
    // External or already-final path — leave as-is
    if (!value.url || value.url.startsWith("http") || !value.url.startsWith("temp/")) {
      return value;
    }

    const filename = value.url.split("/").at(-1) ?? "file";
    const ext = filename.split(".").at(-1) ?? "bin";
    const uuid = filename.split(".")[0];
    const finalPath = `${destDir}/${uuid}.${ext}`;

    const { error } = await supabase.storage.from(bucket).move(value.url, finalPath);
    if (error) {
      throw new Error(`Storage move failed: ${value.url} → ${finalPath}: ${error.message}`);
    }

    return { ...value, url: finalPath } as T;
  }

  if (Array.isArray(value)) {
    return Promise.all(
      value.map((item) => resolveNode(supabase, item, bucket, destDir)),
    ) as Promise<T>;
  }

  if (typeof value === "object" && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = await resolveNode(supabase, v, bucket, destDir);
    }
    return result as T;
  }

  return value;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Transparently reconciles all {@link Media} objects nested anywhere inside a
 * JSON value. Designed to be called as a pre-save hook — the caller just passes
 * the old and new values and receives a resolved copy ready to persist.
 *
 * What it does:
 * 1. **Move** — any Media whose `url` starts with `temp/` is moved to `destDir`
 *    inside the bucket. The returned value contains the final path.
 * 2. **Delete orphans** — any Media path present in `oldValue` but absent from
 *    the resolved `newValue` is removed from storage (no dangling files).
 *
 * @param supabase  Authenticated Supabase client (server-side).
 * @param oldValue  The previously persisted value, or `null` for first save.
 * @param newValue  The incoming value about to be saved.
 * @param bucket    Supabase Storage bucket name.
 * @param destDir   Destination directory for temp-promoted files (no trailing slash).
 *                  e.g. `"default/illustrations"`
 * @returns         A deep copy of `newValue` with all Media urls resolved to
 *                  their final storage paths.
 */
export async function resolveMediaInValue<T>(
  supabase: SupabaseClient,
  oldValue: T | null,
  newValue: T,
  bucket: string,
  destDir: string,
): Promise<T> {
  // Step 1 — promote temp files to final paths
  const resolved = await resolveNode(supabase, newValue, bucket, destDir);

  // Step 2 — collect final paths; diff against old paths to find orphans
  const oldPaths = collectPaths(oldValue);
  const newPathSet = new Set(collectPaths(resolved));

  const orphans = oldPaths.filter(
    (p) => !newPathSet.has(p) && !p.startsWith("temp/"),
  );

  // Step 3 — remove orphans (log failures but don't block the save)
  if (orphans.length > 0) {
    const { error } = await supabase.storage.from(bucket).remove(orphans);
    if (error) {
      console.error("[storage] Failed to remove orphan files", { orphans, error });
    }
  }

  return resolved;
}
