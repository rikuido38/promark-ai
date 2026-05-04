import { SupabaseClient } from "@supabase/supabase-js";
import { BrandVisualSettings, IllustrationSettings, PaletteColor } from "@/types/settings";
import {
  BrandIllustrationContext,
  BrandIllustrationContextRaw,
  IllustrationAnalysisResults,
} from "@/types/brand-context";
import { DEFAULT_ORG_ID, SUPABASE_BUCKET_NAME } from "@/utils/constants";
import { TABLES } from "@/utils/supabase/constant";
import { resolveSignedUrl } from "@/lib/storage";

// ── Settings ──────────────────────────────────────────────────────────────────

/** Strip corrupt numeric-index keys that appear when a string was accidentally
 *  spread into an object. Keeps only the three valid PaletteColor fields. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeColor(c: any): PaletteColor {
  const result: PaletteColor = { hex: c.hex ?? "" };
  if (c.opacity !== undefined) result.opacity = c.opacity;
  if (c.description) result.description = c.description;
  return result;
}

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

  // Guard against stale/incomplete rows (e.g. compiled before brand settings existed)
  if (!raw?.brand) return null;

  const [logoUrl, styleSampleUrls, paletteImageUrls, proportionImageUrls, usageSampleUrls, characterData] =
    await Promise.all([
      resolveSignedUrl(supabase, raw.brand.logo_path, SUPABASE_BUCKET_NAME),
      Promise.all(
        (raw.illustration?.style_image_paths ?? []).map((p) =>
          resolveSignedUrl(supabase, p, SUPABASE_BUCKET_NAME),
        ),
      ),
      Promise.all(
        (raw.illustration?.brand_colour_palette?.sample_image_paths ?? []).map((p) =>
          resolveSignedUrl(supabase, p, SUPABASE_BUCKET_NAME),
        ),
      ),
      Promise.all(
        (raw.illustration?.brand_colour_proportion?.sample_image_paths ?? []).map((p) =>
          resolveSignedUrl(supabase, p, SUPABASE_BUCKET_NAME),
        ),
      ),
      Promise.all(
        (raw.illustration?.usages ?? []).map((u) =>
          resolveSignedUrl(supabase, u.sample_image_path, SUPABASE_BUCKET_NAME),
        ),
      ),
      Promise.all(
        (raw.illustration?.characters ?? []).map(async (c) => ({
          reference_image_url: await resolveSignedUrl(
            supabase,
            c.reference_image_path,
            SUPABASE_BUCKET_NAME,
          ),
          guidelines: await Promise.all(
            c.guidelines.map(async (g) => ({
              sample_image_url: await resolveSignedUrl(supabase, g.sample_image_path, SUPABASE_BUCKET_NAME),
            })),
          ),
        })),
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
          style_image_urls: styleSampleUrls.filter((u): u is string => !!u),
          style_analysis: raw.illustration.style_analysis,
          brand_colour_palette: {
            palette_user_description: raw.illustration.brand_colour_palette?.palette_user_description,
            sample_image_urls: paletteImageUrls.filter((u): u is string => !!u),
            palette_style_prompt: raw.illustration.brand_colour_palette?.palette_style_prompt ?? "",
          },
          brand_colour_proportion: raw.illustration.brand_colour_proportion
            ? {
                proportion_user_description: raw.illustration.brand_colour_proportion.proportion_user_description,
                sample_image_urls: proportionImageUrls.filter((u): u is string => !!u),
                proportion_style_prompt: raw.illustration.brand_colour_proportion.proportion_style_prompt,
              }
            : undefined,
          facial_colour_palette: {
            hair_colors: (raw.illustration.facial_colour_palette?.hair_colors ?? []).map(sanitizeColor),
            skin_tone_colors: (raw.illustration.facial_colour_palette?.skin_tone_colors ?? []).map(sanitizeColor),
            shadow_colors: (raw.illustration.facial_colour_palette?.shadow_colors ?? []).map(sanitizeColor),
            facial_feature_colors: (raw.illustration.facial_colour_palette?.facial_feature_colors ?? []).map(sanitizeColor),
          },
          usages: raw.illustration.usages.map((u, i) => ({
            description: u.description,
            sample_image_url: usageSampleUrls[i] ?? null,
            usage_analysis: u.usage_analysis,
          })),
          characters: (raw.illustration.characters ?? []).map((c, i) => ({
            name: c.name,
            reference_image_url: characterData[i]?.reference_image_url ?? null,
            character_prompt: c.character_prompt ?? "",
            characteristics: c.characteristics,
            age_group: c.age_group,
            guidelines: c.guidelines.map((g, gi) => ({
              title: g.title,
              description: g.description,
              sample_image_url: characterData[i]?.guidelines[gi]?.sample_image_url ?? null,
              sample_analysis: g.sample_analysis,
            })),
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
        primary_colors: (brand.primary_colors_hex ?? []).map((c) =>
          typeof c === "string" ? c : (c as { hex?: string }).hex ?? c,
        ),
        primary_color_guidelines: brand.primary_color_guidelines,
        secondary_colors: (brand.secondary_colors_hex ?? []).map((c) =>
          typeof c === "string" ? c : (c as { hex?: string }).hex ?? c,
        ),
          secondary_color_guidelines: brand.secondary_color_guidelines,
          typography_rules: brand.typography_rules,
          composition_rules: brand.composition_rules,
        }
      : { primary_colors: [], composition_rules: "" },
    illustration: illustration
      ? {
          style_description: illustration.general_brand_guideline?.description ?? "",
          style_image_paths: (illustration.general_brand_guideline?.sample_images ?? []).map((m) => m.url),
          style_analysis: "",
          brand_colour_palette: {
            palette_user_description: illustration.colour_palette?.description,
            sample_image_paths: (illustration.colour_palette?.sample_images ?? []).map(
              (m) => m.url,
            ),
            palette_style_prompt: analyses?.paletteAnalysis ?? "",
          },
          brand_colour_proportion: {
            proportion_user_description: illustration.colour_proportion?.description,
            sample_image_paths: (illustration.colour_proportion?.sample_images ?? []).map((m) => m.url),
            proportion_style_prompt: analyses?.proportionAnalysis ?? "",
          },
          facial_colour_palette: {
            hair_colors: (illustration.default_character_facial_colours?.hair_colors ?? []).map(sanitizeColor),
            skin_tone_colors: (illustration.default_character_facial_colours?.skin_tones ?? []).map(sanitizeColor),
            shadow_colors: (illustration.default_character_facial_colours?.shadow ?? []).map(sanitizeColor),
            facial_feature_colors: (illustration.default_character_facial_colours?.facial_features ?? []).map(sanitizeColor),
          },
          usages: (illustration.other_usecases ?? []).map((u, i) => ({
            description: u.description,
            sample_image_path: u.sample?.url ?? null,
            usage_analysis: analyses?.usageAnalyses[i] ?? null,
          })),
          characters: (illustration.characters ?? []).map((c, i) => ({
            name: c.name,
            reference_image_path: c.reference_image?.url ?? null,
            reference_image_analysis: "",
            character_prompt: "",
            characteristics: c.characteristics,
            age_group: c.age_group,
            guidelines: c.guidelines.map((g, gi) => ({
              title: g.title,
              description: g.description,
              sample_image_path: g.sample?.url ?? null,
              sample_analysis: analyses?.characterAnalyses[i]?.guidelineAnalyses[gi] ?? null,
            })),
          })),
        }
      : null,
  };
}
