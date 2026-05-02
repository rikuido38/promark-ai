/**
 * AI vision analysis results from the image analysis tools.
 * Passed into buildContextDocument() and stored in the compiled doc so
 * images never need to be re-sent to AI on subsequent chat turns.
 */
export interface IllustrationAnalysisResults {
  paletteAnalysis: string;
  usageAnalyses: (string | null)[];
  characterAnalyses: Array<{
    guidelineAnalyses: (string | null)[];
  }>;
  /** @deprecated No longer generated — kept for backwards compatibility with stored rows */
  illustrationStylePrompt?: string;
  /** @deprecated No longer generated — kept for backwards compatibility with stored rows */
  styleAnalysis?: string;
  /** @deprecated No longer generated — kept for backwards compatibility with stored rows */
  characterPrompts?: string[];
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
    style_image_paths: string[];
    /** AI vision analysis of style sample images */
    style_analysis: string;
    brand_colour_palette: {
      /** User description of the overall brand colour palette */
      palette_user_description?: string;
      /** Raw storage paths for palette sample images */
      sample_image_paths: string[];
      /** AI vision analysis of palette sample images */
      palette_style_prompt: string;
    };
    facial_colour_palette: {
      hair_colors: import("@/types/settings").PaletteColor[];
      skin_tone_colors: import("@/types/settings").PaletteColor[];
      shadow_colors: import("@/types/settings").PaletteColor[];
      facial_feature_colors: import("@/types/settings").PaletteColor[];
    };
    usages: Array<{
      description: string;
      /** Raw storage path, null if none */
      sample_image_path?: string | null;
      /** AI vision analysis of usage sample image, null if no image */
      usage_analysis: string | null;
    }>;
    characters: Array<{
      name: string;
      /** Raw storage path for reference image */
      reference_image_path: string | null;
      /** Synthesised AI prompt for generating this character */
      character_prompt: string;
      characteristics: string;
      age_group: string;
      guidelines: Array<{
        title: string;
        description: string;
        sample_image_path: string | null;
        /** AI vision analysis of the guideline sample image, null if no image */
        sample_analysis: string | null;
      }>;
    }>;
  } | null;
}

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
    style_image_urls: string[];
    /** AI vision analysis of style sample images */
    style_analysis: string;
    brand_colour_palette: {
      /** User description of the overall brand colour palette */
      palette_user_description?: string;
      sample_image_urls: string[];
      /** AI vision analysis of palette sample images */
      palette_style_prompt: string;
    };
    facial_colour_palette: {
      hair_colors: import("@/types/settings").PaletteColor[];
      skin_tone_colors: import("@/types/settings").PaletteColor[];
      shadow_colors: import("@/types/settings").PaletteColor[];
      facial_feature_colors: import("@/types/settings").PaletteColor[];
    };
    usages: Array<{
      description: string;
      sample_image_url?: string | null;
      /** AI vision analysis of usage sample image */
      usage_analysis: string | null;
    }>;
    characters: Array<{
      name: string;
      reference_image_url: string | null;
      /** Synthesised AI prompt for generating this character */
      character_prompt: string;
      characteristics: string;
      age_group: string;
      guidelines: Array<{
        title: string;
        description: string;
        sample_image_url: string | null;
        /** AI vision analysis of the guideline sample image, null if no image */
        sample_analysis: string | null;
      }>;
    }>;
  } | null;
}
