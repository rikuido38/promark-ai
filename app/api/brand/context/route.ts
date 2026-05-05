import { config as dotenvConfig } from "dotenv";
// Override any env vars already in process.env so .env.local values always win
dotenvConfig({ path: ".env.local", override: true });

import { NextResponse } from "next/server";
import { setDefaultOpenAIKey } from "@openai/agents";
import { getUser } from "@/utils/cognito/auth";
import { getDb } from "@/utils/mongodb/client";
import { createStorageClient } from "@/utils/s3/storage";
import { DEFAULT_ORG_ID, SUPABASE_BUCKET_NAME } from "@/utils/constants";
import { COLLECTIONS } from "@/utils/supabase/constant";
import { batchResolveSignedUrls } from "@/lib/storage";
import {
  buildContextDocument,
  fetchRawBrandSettings,
  getBrandContext,
  saveBrandContext,
  setContextStatus,
} from "@/services/brand-context";
import { runBrandContextCompiler } from "@/lib/agents/subagents/BrandContextCompilerAgent";
import type { IllustrationSettings } from "@/types/settings";

// Explicitly set the key so the SDK never falls back to a stale cached default.
setDefaultOpenAIKey(process.env.OPENAI_API_KEY ?? "");

// ── GET /api/brand/context ────────────────────────────────────────────────────

export async function GET() {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = await getDb();
    const row = await db
      .collection(COLLECTIONS.ORG_CACHE_CONTEXT)
      .findOne({ org_id: DEFAULT_ORG_ID, key: "brand_illustration" });

    const status = (row?.status ?? "not_found") as string;
    const is_stale = row ? (row.is_stale as boolean) : true;

    const context = await getBrandContext();
    return NextResponse.json({ status, is_stale, context: context ?? null });
  } catch (error) {
    console.error("[GET /api/brand/context]", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

// ── POST /api/brand/context ───────────────────────────────────────────────────

export async function POST() {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await setContextStatus("in_progress");

    const { brand, illustration } = await fetchRawBrandSettings();
    const storage = createStorageClient();
    const signedUrls = await batchResolveSignedUrls(
      storage,
      collectImagePaths(illustration),
      SUPABASE_BUCKET_NAME,
    );

    const { analyses } = await runBrandContextCompiler({
      brand,
      illustration,
      signedUrls,
    });

    const contextDoc = buildContextDocument(
      brand,
      illustration,
      analyses,
    );
    await saveBrandContext(contextDoc);

    const resolved = await getBrandContext();
    return NextResponse.json({ success: true, context: resolved });
  } catch (error) {
    console.error("[POST /api/brand/context]", error);
    await setContextStatus("error").catch(() => {});
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}


// ── Helpers ───────────────────────────────────────────────────────────────────

function collectImagePaths(illustration: IllustrationSettings | null): string[] {
  if (!illustration) return [];
  return [
    ...(illustration.general_brand_guideline?.sample_images ?? []).map((m) => m.url),
    ...(illustration.colour_palette?.sample_images ?? []).map((m) => m.url),
    ...(illustration.other_usecases ?? [])
      .map((u) => u.sample?.url)
      .filter((p): p is string => !!p),
    ...(illustration.characters ?? [])
      .map((c) => c.reference_image?.url)
      .filter((p): p is string => !!p),
    ...(illustration.characters ?? []).flatMap((c) =>
      (c.guidelines ?? [])
        .map((g) => g.sample?.url)
        .filter((p): p is string => !!p),
    ),
  ];
}

