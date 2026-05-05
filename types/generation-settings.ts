export type GenerationQuality = "low" | "medium" | "high";
export type GenerationSize =
  | "auto"
  | "1024x1024"
  | "1536x1024"
  | "1024x1536"
  | "2048x2048"
  | "2048x1152"
  | "3840x2160"
  | "2160x3840";
export type GenerationTabKey = "image" | "illustration" | "video";

export interface GenerationSettings {
  model: string;
  quality: GenerationQuality;
  size: GenerationSize;
  compression: number; // 0–100
}

export interface GenerationTemplate {
  id: string;
  key: GenerationTabKey;
  name: string;
  value: Partial<GenerationSettings>;
}

/** Default settings per tab key. */
export const DEFAULT_GENERATION_SETTINGS: Record<GenerationTabKey, GenerationSettings> = {
  illustration: {
    model: "gpt-image-2",
    quality: "medium",
    size: "auto",
    compression: 85,
  },
  image: {
    model: "gpt-image-2",
    quality: "medium",
    size: "auto",
    compression: 85,
  },
  video: {
    model: "gpt-image-2",
    quality: "medium",
    size: "auto",
    compression: 85,
  },
};

/**
 * Derives a GenerationTabKey from a page identifier string.
 * The page key format is `{page}-{tabKey}`, e.g. `draft-illustration`.
 * Falls back to undefined if no matching tab key is found.
 */
export function tabKeyFromPageKey(pageKey: string): GenerationTabKey | undefined {
  const last = pageKey.split("-").at(-1);
  if (last === "image" || last === "illustration" || last === "video") return last;
  return undefined;
}
