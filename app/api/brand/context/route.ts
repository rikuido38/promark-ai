import { config as dotenvConfig } from "dotenv";
// Override any env vars already in process.env so .env.local values always win
// (prevents the SDK from picking up a stale system-level OPENAI_API_KEY).
dotenvConfig({ path: ".env.local", override: true });

import { NextResponse } from "next/server";
import { setDefaultOpenAIKey } from "@openai/agents";
import { createClient } from "@/utils/supabase/server";
import { DEFAULT_ORG_ID, SUPABASE_BUCKET_NAME } from "@/utils/constants";
import { TABLES } from "@/utils/supabase/constant";
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

/**
 * Returns { status, is_stale, context } for the stored brand illustration
 * context. Clients poll this endpoint while generation is in progress.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: row } = await supabase
      .from(TABLES.ORG_CACHE_CONTEXT)
      .select("status, is_stale")
      .eq("org_id", DEFAULT_ORG_ID)
      .eq("key", "brand_illustration")
      .maybeSingle();

    const status = (row?.status ?? "not_found") as string;
    const is_stale = row ? (row.is_stale as boolean) : true;

    const context = await getBrandContext(supabase);
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

/**
 * (Re)compiles the brand illustration context via BrandContextCompilerAgent.
 * Marks status as in_progress immediately, then persists the result on success
 * or marks error on failure.
 */
export async function POST() {
  const supabase = await createClient();
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await setContextStatus(supabase, "in_progress");

    const { brand, illustration } = await fetchRawBrandSettings(supabase);
    const signedUrls = await batchResolveSignedUrls(
      supabase,
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
    await saveBrandContext(supabase, contextDoc);

    const resolved = await getBrandContext(supabase);
    return NextResponse.json({ success: true, context: resolved });
  } catch (error) {
    console.error("[POST /api/brand/context]", error);
    await setContextStatus(supabase, "error").catch(() => {});
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
    ...(illustration.style_samples ?? []).map((m) => m.url),
    ...(illustration.colour_palette?.sample_images ?? []).map((m) => m.url),
    ...(illustration.usages ?? [])
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

