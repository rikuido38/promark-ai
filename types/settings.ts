export interface BrandVisualSettings {
  logo_url?: string;
  primary_colors_hex: string[];
  secondary_colors_hex?: string[];
  typography_rules?: string;
  composition_rules: string;
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
