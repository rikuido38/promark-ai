export interface BrandVisualSettings {
  company_name: string;
  short_name?: string;
  slogan?: string;
  logo_url?: string;
  logo_guidelines?: string;
  primary_colors_hex: PaletteColor[];
  primary_color_guidelines?: string;
  secondary_colors_hex?: PaletteColor[];
  secondary_color_guidelines?: string;
  typography_rules?: string;
  composition_rules: string;
}

export interface PaletteColor {
  hex: string;
  description?: string;
  /** Opacity as a percentage 0–100 */
  opacity?: number;
}

export interface GeneralBrandGuideline {
  /** Free-text style concept and identity description */
  description: string;
  /** Sample images illustrating the style */
  sample_images: import("@/types/models").Media[];
}

export interface IllustrationColourPalette {
  /** Optional context about the colour palette for AI */
  description?: string;
  /** Sample images showing colour usage in context */
  sample_images: import("@/types/models").Media[];
}

export interface DefaultCharacterFacialColours {
  hair_colors: PaletteColor[];
  skin_tones: PaletteColor[];
  shadow: PaletteColor[];
  facial_features: PaletteColor[];
}

export interface ColourProportion {
  /** Optional context about colour proportions for AI */
  description?: string;
  /** Sample images illustrating colour proportions */
  sample_images: import("@/types/models").Media[];
}

export interface IllustrationUsage {
  clientId: string;
  description: string;
  /** single sample image, null if not yet uploaded */
  sample: import("@/types/models").Media | null;
}

export type CharacterAgeGroup = "Young" | "Teenager" | "Adult" | "Senior";

export interface CharacterGuideline {
  clientId: string;
  title: string;
  description: string;
  /** optional sample image for this guideline */
  sample: import("@/types/models").Media | null;
}

export interface IllustrationCharacter {
  clientId: string;
  name: string;
  /** mandatory reference image */
  reference_image: import("@/types/models").Media | null;
  characteristics: string;
  age_group: CharacterAgeGroup;
  guidelines: CharacterGuideline[];
}

export interface IllustrationSettings {
  general_brand_guideline: GeneralBrandGuideline;
  colour_palette: IllustrationColourPalette;
  default_character_facial_colours: DefaultCharacterFacialColours;
  colour_proportion: ColourProportion;
  other_usecases: IllustrationUsage[];
  characters: IllustrationCharacter[];
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
