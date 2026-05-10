// ---------------------------------------------------------------------------
// Image Generation — Provider Capability Config
//
// Reads lib/agents/providers.conf.json and exposes a typed accessor for
// model-level capabilities. Call sites (both the agent for prompt building
// and providers for API parameter selection) import from here.
//
// Resolution order: model override → provider-level default → safe fallback
// ---------------------------------------------------------------------------

import providerConf from "@/lib/agents/providers.conf.json";

export type BackgroundOption = "transparent" | "opaque" | "auto";

export interface ImageGenModelConfig {
  /** Background mode for the image generation API call. */
  backgroundOption: BackgroundOption;
}

// Internal shape of providers.conf.json
type CapabilityConf = {
  backgroundOption: BackgroundOption;
  models?: Record<string, { backgroundOption: BackgroundOption }>;
};
type ProviderConf = Record<string, Record<string, CapabilityConf>>;

/** Maps model identifier prefix → provider key in providers.conf.json. */
function providerForModel(model: string): string {
  if (model.startsWith("imagen")) return "google";
  return "openai";
}

/**
 * Returns the resolved capability config for the given model.
 *
 * Example:
 *   getImageGenModelConfig("gpt-image-1")  → { backgroundOption: "transparent" }
 *   getImageGenModelConfig("gpt-image-2")  → { backgroundOption: "opaque" }
 */
export function getImageGenModelConfig(model: string): ImageGenModelConfig {
  const provider = providerForModel(model);
  const conf = (providerConf as ProviderConf)[provider]?.["image-generation"];
  if (!conf) return { backgroundOption: "auto" };

  const modelOverride = conf.models?.[model];
  return {
    backgroundOption: modelOverride?.backgroundOption ?? conf.backgroundOption,
  };
}
