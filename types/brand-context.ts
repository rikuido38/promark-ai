/**
 * AI vision analysis results from the 3 parallel image analysis agents.
 * Passed into buildContextDocument() and stored in the compiled doc so
 * images never need to be re-sent to AI on subsequent chat turns.
 */
export interface IllustrationAnalysisResults {
  /** GPT-4o description of style sample images */
  styleAnalysis: string;
  /** GPT-4o description of palette sample images */
  paletteAnalysis: string;
  /** GPT-4o description per usage sample image, null where no image existed */
  usageAnalyses: (string | null)[];
}

/**
 * Stored in org_cache_context.value with key 'brand_illustration'.
 * All image fields are raw Supabase storage paths (never signed URLs) so the
 * document remains valid past URL expiry.
 */
export interface BrandIllustrationContextRaw {
  compiled_at: string;
  brand: {
    company_name?: string;
    short_name?: string;
    slogan?: string;
    /** Raw Supabase storage path, e.g. "default/brands/logo.png" */
    logo_path?: string;
    logo_guidelines?: string;
    primary_colors: string[];
    primary_color_guidelines?: string;
    secondary_colors?: string[];
    secondary_color_guidelines?: string;
    typography_rules?: string;
    composition_rules?: string;
  };
  illustration: {
    style_description: string;
    /** Raw storage paths for style reference images */
    style_sample_paths: string[];
    /** AI vision analysis of style sample images */
    style_analysis: string;
    colour_palette: {
      outline_colors: string[];
      supporting_colors: string[];
      skin_tone_colors: string[];
      hair_colors: string[];
      background_colors: string[];
      shadow_colors: string[];
      /** Raw storage paths for palette sample images */
      sample_image_paths: string[];
      /** AI vision analysis of palette sample images */
      palette_analysis: string;
    };
    usages: Array<{
      description: string;
      /** Raw storage path, null if none */
      sample_path?: string | null;
      /** AI vision analysis of usage sample image, null if no image */
      usage_analysis: string | null;
    }>;
  } | null;
}

/**
 * Returned by GET /api/brand/context.
 * Storage paths have been resolved to fresh signed URLs (1-hour expiry).
 */
export interface BrandIllustrationContext {
  compiled_at: string;
  brand: {
    company_name?: string;
    short_name?: string;
    slogan?: string;
    /** Raw Supabase storage path — used for direct storage downloads */
    logo_path?: string;
    /** Signed URL resolved at read time — used for display */
    logo_url?: string;
    logo_guidelines?: string;
    primary_colors: string[];
    primary_color_guidelines?: string;
    secondary_colors?: string[];
    secondary_color_guidelines?: string;
    typography_rules?: string;
    composition_rules?: string;
  };
  illustration: {
    style_description: string;
    style_sample_urls: string[];
    /** AI vision analysis of style sample images */
    style_analysis: string;
    colour_palette: {
      outline_colors: string[];
      supporting_colors: string[];
      skin_tone_colors: string[];
      hair_colors: string[];
      background_colors: string[];
      shadow_colors: string[];
      sample_image_urls: string[];
      /** AI vision analysis of palette sample images */
      palette_analysis: string;
    };
    usages: Array<{
      description: string;
      sample_url?: string | null;
      /** AI vision analysis of usage sample image */
      usage_analysis: string | null;
    }>;
  } | null;
}
