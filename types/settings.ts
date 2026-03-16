export interface BrandVisualSettings {
  logo_url?: string;
  logo_guidelines?: string;
  primary_colors_hex: string[];
  secondary_colors_hex?: string[];
  typography_rules?: string;
  composition_rules: string;
}

export interface IllustrationColourPalette {
  outline_colors: string[];
  supporting_colors: string[];
  skin_tone_colors: string[];
  hair_colors: string[];
  background_colors: string[];
  shadow_colors: string[];
  /** sample images showing colour usage in context */
  sample_images: import("@/types/models").Media[];
}

export interface IllustrationUsage {
  clientId: string;
  description: string;
  /** single sample image, null if not yet uploaded */
  sample: import("@/types/models").Media | null;
}

export interface IllustrationSettings {
  /** Free-text style concept, identity and colour description */
  style_description: string;
  /** Sample images illustrating the style */
  style_samples: import("@/types/models").Media[];
  colour_palette: IllustrationColourPalette;
  usages: IllustrationUsage[];
}

export interface VoiceAndToneSettings {
  formality_index: number;
  humor_index: number;
  allowed_emojis: string[];
  banned_words: string[];
  mandatory_vocabulary: string[];
  sentence_length_preference: string;
}

export interface ContentGuidelineSettings {
  general_rules: string;
}
