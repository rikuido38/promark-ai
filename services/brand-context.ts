import { SupabaseClient } from "@supabase/supabase-js";
import { BrandVisualSettings, IllustrationSettings } from "@/types/settings";
import {
  BrandIllustrationContext,
  BrandIllustrationContextRaw,
  IllustrationAnalysisResults,
} from "@/types/brand-context";
import { DEFAULT_ORG_ID, SUPABASE_BUCKET_NAME } from "@/utils/constants";
import { TABLES } from "@/utils/supabase/constant";
import { resolveSignedUrl } from "@/lib/storage";

// ── Settings ──────────────────────────────────────────────────────────────────

/**
 * Fetches the raw (unresolved) brand + illustration settings stored in
 * organization_settings. Used by the compile step.
 */
export async function fetchRawBrandSettings(supabase: SupabaseClient): Promise<{
  brand: BrandVisualSettings | null;
  illustration: IllustrationSettings | null;
}> {
  const [brandResult, illustrationResult] = await Promise.all([
    supabase
      .from(TABLES.ORGANIZATION_SETTINGS)
      .select("value")
      .eq("org_id", DEFAULT_ORG_ID)
      .eq("key", "brand_master")
      .maybeSingle(),
    supabase
      .from(TABLES.ORGANIZATION_SETTINGS)
      .select("value")
      .eq("org_id", DEFAULT_ORG_ID)
      .eq("key", "brand_illustration")
      .maybeSingle(),
  ]);

  return {
    brand: (brandResult.data?.value as BrandVisualSettings) ?? null,
    illustration: (illustrationResult.data?.value as IllustrationSettings) ?? null,
  };
}

// ── Cache status ──────────────────────────────────────────────────────────────

/**
 * Marks the brand context as in_progress or error without touching the value.
 * Call this before starting a long-running compile so the UI can reflect state.
 */
export async function setContextStatus(
  supabase: SupabaseClient,
  status: "in_progress" | "error",
): Promise<void> {
  await supabase
    .from(TABLES.ORG_CACHE_CONTEXT)
    .upsert(
      { org_id: DEFAULT_ORG_ID, key: "brand_illustration", status, is_stale: true },
      { onConflict: "org_id, key" },
    );
}

// ── Persist / read ────────────────────────────────────────────────────────────

/**
 * Persists a compiled context document to org_cache_context.
 * Upserts on (org_id, key) so re-compiling always refreshes the stored value.
 */
export async function saveBrandContext(
  supabase: SupabaseClient,
  context: BrandIllustrationContextRaw,
): Promise<void> {
  const { error } = await supabase
    .from(TABLES.ORG_CACHE_CONTEXT)
    .upsert(
      {
        org_id: DEFAULT_ORG_ID,
        key: "brand_illustration",
        value: context,
        is_stale: false,
        status: "completed",
        compiled_at: context.compiled_at,
      },
      { onConflict: "org_id, key" },
    );

  if (error) throw new Error(`Failed to save brand context: ${error.message}`);
}

/**
 * Reads the stored raw context from org_cache_context and resolves all
 * storage paths to fresh signed URLs (1-hour expiry).
 * Returns null if the context has never been compiled.
 */
export async function getBrandContext(
  supabase: SupabaseClient,
): Promise<BrandIllustrationContext | null> {
  const { data, error } = await supabase
    .from(TABLES.ORG_CACHE_CONTEXT)
    .select("value")
    .eq("org_id", DEFAULT_ORG_ID)
    .eq("key", "brand_illustration")
    .maybeSingle();

  if (error || !data) return null;

  const raw = data.value as BrandIllustrationContextRaw;

  const [logoUrl, styleSampleUrls, paletteImageUrls, usageSampleUrls] =
    await Promise.all([
      resolveSignedUrl(supabase, raw.brand.logo_path, SUPABASE_BUCKET_NAME),
      Promise.all(
        (raw.illustration?.style_sample_paths ?? []).map((p) =>
          resolveSignedUrl(supabase, p, SUPABASE_BUCKET_NAME),
        ),
      ),
      Promise.all(
        (raw.illustration?.colour_palette.sample_image_paths ?? []).map((p) =>
          resolveSignedUrl(supabase, p, SUPABASE_BUCKET_NAME),
        ),
      ),
      Promise.all(
        (raw.illustration?.usages ?? []).map((u) =>
          resolveSignedUrl(supabase, u.sample_path, SUPABASE_BUCKET_NAME),
        ),
      ),
    ]);

  return {
    compiled_at: raw.compiled_at,
    brand: {
      ...raw.brand,
      logo_url: logoUrl,
    },
    illustration: raw.illustration
      ? {
          style_description: raw.illustration.style_description,
          style_sample_urls: styleSampleUrls.filter((u): u is string => !!u),
          style_analysis: raw.illustration.style_analysis,
          colour_palette: {
            outline_colors: raw.illustration.colour_palette.outline_colors,
            supporting_colors: raw.illustration.colour_palette.supporting_colors,
            skin_tone_colors: raw.illustration.colour_palette.skin_tone_colors,
            hair_colors: raw.illustration.colour_palette.hair_colors,
            background_colors: raw.illustration.colour_palette.background_colors,
            shadow_colors: raw.illustration.colour_palette.shadow_colors,
            sample_image_urls: paletteImageUrls.filter((u): u is string => !!u),
            palette_analysis: raw.illustration.colour_palette.palette_analysis,
          },
          usages: raw.illustration.usages.map((u, i) => ({
            description: u.description,
            sample_url: usageSampleUrls[i] ?? null,
            usage_analysis: u.usage_analysis,
          })),
        }
      : null,
  };
}

// ── Document builder ──────────────────────────────────────────────────────────

/**
 * Builds a BrandIllustrationContextRaw from raw settings and AI vision
 * analysis results. Does not persist — call saveBrandContext() after.
 */
export function buildContextDocument(
  brand: BrandVisualSettings | null,
  illustration: IllustrationSettings | null,
  analyses: IllustrationAnalysisResults | null,
): BrandIllustrationContextRaw {
  return {
    compiled_at: new Date().toISOString(),
    brand: brand
      ? {
          company_name: brand.company_name,
          short_name: brand.short_name,
          slogan: brand.slogan,
          logo_path: brand.logo_url,
          logo_guidelines: brand.logo_guidelines,
          primary_colors: brand.primary_colors_hex ?? [],
          primary_color_guidelines: brand.primary_color_guidelines,
          secondary_colors: brand.secondary_colors_hex,
          secondary_color_guidelines: brand.secondary_color_guidelines,
          typography_rules: brand.typography_rules,
          composition_rules: brand.composition_rules,
        }
      : { primary_colors: [], composition_rules: "" },
    illustration: illustration
      ? {
          style_description: illustration.style_description,
          style_sample_paths: (illustration.style_samples ?? []).map((m) => m.url),
          style_analysis: analyses?.styleAnalysis ?? "",
          colour_palette: {
            outline_colors: illustration.colour_palette?.outline_colors ?? [],
            supporting_colors: illustration.colour_palette?.supporting_colors ?? [],
            skin_tone_colors: illustration.colour_palette?.skin_tone_colors ?? [],
            hair_colors: illustration.colour_palette?.hair_colors ?? [],
            background_colors: illustration.colour_palette?.background_colors ?? [],
            shadow_colors: illustration.colour_palette?.shadow_colors ?? [],
            sample_image_paths: (illustration.colour_palette?.sample_images ?? []).map(
              (m) => m.url,
            ),
            palette_analysis: analyses?.paletteAnalysis ?? "",
          },
          usages: (illustration.usages ?? []).map((u, i) => ({
            description: u.description,
            sample_path: u.sample?.url ?? null,
            usage_analysis: analyses?.usageAnalyses[i] ?? null,
          })),
        }
      : null,
  };
}
