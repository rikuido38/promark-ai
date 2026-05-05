/**
 * Migrate all files from Supabase storage bucket "promark-ai"
 * to AWS S3 bucket "promark-ai", preserving the same key paths.
 *
 * Usage:
 *   node scripts/migrate-storage-to-s3.mjs
 *
 * Reads credentials from .env.local automatically.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// ── Load .env.local ──────────────────────────────────────────────────────────
const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dir, "../.env.local");
try {
  const lines = readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  }
} catch {
  // ignore if .env.local doesn't exist — rely on existing env
}

// ── Config ───────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "promark-ai";

const S3_REGION = process.env.S3_REGION ?? "ap-southeast-1";
const AWS_ACCESS_KEY = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_KEY = process.env.AWS_SECRET_ACCESS_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!AWS_ACCESS_KEY || !AWS_SECRET_KEY) {
  console.error("Missing AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY");
  process.exit(1);
}

// ── Clients ──────────────────────────────────────────────────────────────────
const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

const s3 = new S3Client({
  region: S3_REGION,
  credentials: { accessKeyId: AWS_ACCESS_KEY, secretAccessKey: AWS_SECRET_KEY },
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Recursively list every file under `prefix` in the Supabase bucket.
 * Returns an array of storage paths (relative to the bucket root).
 */
async function listAllFiles(prefix = "") {
  const PAGE = 1000;
  let offset = 0;
  const files = [];

  while (true) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(prefix, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });

    if (error) throw new Error(`list("${prefix}") failed: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const item of data) {
      const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) {
        // folder — recurse
        const sub = await listAllFiles(fullPath);
        files.push(...sub);
      } else {
        files.push(fullPath);
      }
    }

    if (data.length < PAGE) break;
    offset += PAGE;
  }

  return files;
}

/**
 * Check whether an object already exists in S3.
 */
async function existsInS3(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Guess a content type from the file extension.
 */
function guessContentType(path) {
  const ext = path.split(".").pop()?.toLowerCase();
  const map = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    json: "application/json",
    mp4: "video/mp4",
    mov: "video/quicktime",
    mp3: "audio/mpeg",
    wav: "audio/wav",
  };
  return map[ext] ?? "application/octet-stream";
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function migrate() {
  console.log(`\nListing files in Supabase bucket "${BUCKET}"…`);
  const files = await listAllFiles();
  console.log(`Found ${files.length} file(s).\n`);

  if (files.length === 0) {
    console.log("Nothing to migrate.");
    return;
  }

  let skipped = 0;
  let uploaded = 0;
  let failed = 0;

  for (let i = 0; i < files.length; i++) {
    const path = files[i];
    const label = `[${i + 1}/${files.length}] ${path}`;

    // Skip if already in S3
    if (await existsInS3(path)) {
      console.log(`  SKIP  ${label}`);
      skipped++;
      continue;
    }

    // Download from Supabase
    const { data: blob, error: dlErr } = await supabase.storage
      .from(BUCKET)
      .download(path);

    if (dlErr || !blob) {
      console.error(`  FAIL  ${label} — download: ${dlErr?.message}`);
      failed++;
      continue;
    }

    // Upload to S3
    const buffer = Buffer.from(await blob.arrayBuffer());
    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: path,
          Body: buffer,
          ContentType: guessContentType(path),
        }),
      );
      console.log(`  OK    ${label}`);
      uploaded++;
    } catch (err) {
      console.error(`  FAIL  ${label} — upload: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n── Summary ──────────────────────────────────`);
  console.log(`  Total   : ${files.length}`);
  console.log(`  Uploaded: ${uploaded}`);
  console.log(`  Skipped : ${skipped}`);
  console.log(`  Failed  : ${failed}`);
  console.log(`─────────────────────────────────────────────\n`);

  if (failed > 0) process.exit(1);
}

migrate().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
