// ---------------------------------------------------------------------------
// Image Generation — Provider Factory
//
// Returns the correct provider implementation based on the model identifier.
// Add new providers here as they become available; call sites only import
// createImageProvider() and operate against the ImageGenerationProvider
// interface.
//
// Model routing rules (first prefix match wins):
//   imagen*   → Google Imagen (not yet implemented)
//   *         → OpenAI (default)
// ---------------------------------------------------------------------------

import type { ImageGenerationProvider } from "./types";
import { OpenAIImageProvider } from "./providers/openai";

export function createImageProvider(_model: string): ImageGenerationProvider {
  // Default: OpenAI (handles gpt-image-*, dall-e-*, etc.)
  // Add new provider branches here when Google Imagen, Anthropic, etc. are ready.
  return new OpenAIImageProvider();
}
