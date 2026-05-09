import type { Media } from "@/types/models";

// Minimal duck-typed interface satisfied by both Supabase and S3 storage clients
export interface StorageClientLike {
  storage: {
    from(bucket: string): {
      createSignedUrl(
        path: string,
        expiresIn: number,
      ): Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
      createSignedUrls(
        paths: string[],
        expiresIn: number,
      ): Promise<{ data: { path: string; signedUrl: string }[] | null; error: { message: string } | null }>;
      copy(
        from: string,
        to: string,
      ): Promise<{ data: { path: string } | null; error: { message: string } | null }>;
      move(
        from: string,
        to: string,
      ): Promise<{ error: { message: string } | null }>;
      remove(paths: string[]): Promise<{ error: { message: string } | null }>;
    };
  };
}

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

// ── Path normaliser ───────────────────────────────────────────────────────────
// Strips a Supabase signed/public storage URL back to its bare path so we
// never persist a time-limited token or full URL in the database.

/**
 * Given a Supabase storage URL (signed, public, or authenticated) and the
 * bucket name, returns the bare storage path (e.g. `default/images/logo.png`).
 * Returns the original value unchanged if it is already a plain path or an
 * unrecognised URL, making it safe to call unconditionally before any DB write.
 */
export function normaliseBucketPath(url: string, bucket: string): string {
  const path = extractStoragePath(url, bucket);
  return path ?? url;
}

function extractStoragePath(url: string, bucket: string): string | null {
  try {
    const u = new URL(url);
    // Supabase storage URL patterns
    for (const prefix of [
      `/storage/v1/object/sign/${bucket}/`,
      `/storage/v1/object/public/${bucket}/`,
      `/storage/v1/object/authenticated/${bucket}/`,
    ]) {
      if (u.pathname.startsWith(prefix)) {
        return u.pathname.slice(prefix.length);
      }
    }
    // S3 virtual-hosted-style: https://{bucket}.s3[.region].amazonaws.com/{key}
    if (
      u.hostname === `${bucket}.s3.amazonaws.com` ||
      u.hostname.match(new RegExp(`^${bucket}\.s3\.[^.]+\.amazonaws\.com$`))
    ) {
      return decodeURIComponent(u.pathname.slice(1));
    }
    // S3 path-style: https://s3[.region].amazonaws.com/{bucket}/{key}
    const s3PathPrefix = `/${bucket}/`;
    if (
      /^s3(\.[^.]+)?\.amazonaws\.com$/.test(u.hostname) &&
      u.pathname.startsWith(s3PathPrefix)
    ) {
      return decodeURIComponent(u.pathname.slice(s3PathPrefix.length));
    }
  } catch {
    // not a valid URL – ignore
  }
  return null;
}

// ── Deep resolver ─────────────────────────────────────────────────────────────
// Walks the value tree. When a Media node is found with a temp/ url, moves the
// file to its final path and returns a new Media with the updated url.

async function resolveMediaNode(
  supabase: StorageClientLike,
  value: Media,
  bucket: string,
  destDir: string,
): Promise<Media> {
  if (!value.url) return value;

  // Signed / public Supabase URL — strip back to the bare storage path
  if (value.url.startsWith("http")) {
    const path = extractStoragePath(value.url, bucket);
    return path ? { ...value, url: path } : value;
  }

  // Already a final storage path (not temp) — leave as-is
  if (!value.url.startsWith("temp/")) {
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

  return { ...value, url: finalPath };
}

async function resolveNode<T>(
  supabase: StorageClientLike,
  value: T,
  bucket: string,
  destDir: string,
): Promise<T> {
  if (isMedia(value)) {
    return resolveMediaNode(supabase, value, bucket, destDir) as Promise<T>;
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
  supabase: StorageClientLike,
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

// ── Signed URL utilities ──────────────────────────────────────────────────────

/**
 * Resolves a single raw storage path to a signed URL (1-hour expiry).
 * Passes through paths that are already full http URLs.
 */
export async function resolveSignedUrl(
  supabase: StorageClientLike,
  path: string | undefined | null,
  bucket: string,
): Promise<string | undefined> {
  if (!path || path.startsWith("http")) return path ?? undefined;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
  return data?.signedUrl;
}

/**
 * Batch-resolves an array of raw storage paths to signed URLs in a single
 * Supabase API call. Returns a Map<storagePath, signedUrl>.
 * Paths that are already http URLs are passed through as-is.
 */
export async function batchResolveSignedUrls(
  supabase: StorageClientLike,
  paths: (string | undefined | null)[],
  bucket: string,
): Promise<Map<string, string>> {
  const toSign = [
    ...new Set(paths.filter((p): p is string => !!p && !p.startsWith("http"))),
  ];

  const map = new Map<string, string>();
  paths
    .filter((p): p is string => !!p && p.startsWith("http"))
    .forEach((p) => map.set(p, p));

  if (toSign.length === 0) return map;

  const { data } = await supabase.storage.from(bucket).createSignedUrls(toSign, 60 * 60);
  (data ?? []).forEach(({ path, signedUrl }) => {
    if (path && signedUrl) map.set(path, signedUrl);
  });

  return map;
}
