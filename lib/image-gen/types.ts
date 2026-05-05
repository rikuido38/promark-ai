// ---------------------------------------------------------------------------
// Image Generation — Provider Abstraction
//
// Defines the shared interface all image generation providers must implement.
// The illustration agent calls createImageProvider() and operates against this
// interface, staying agnostic of the underlying SDK or API.
// ---------------------------------------------------------------------------

export interface ReferenceImage {
  base64: string;
  mediaType: string;
  /** Optional human-readable label forwarded to providers that support it. */
  label?: string;
}

export interface ImageGenerationRequest {
  /** The full generation prompt. */
  prompt: string;
  /** Provider-specific model identifier (e.g. "gpt-image-1", "imagen-3.0-generate-002"). */
  model: string;
  /** Generation quality tier. Provider interprets the string. */
  quality?: string;
  /** Output size string (e.g. "1024x1024"). Omit or pass "auto" to use default. */
  size?: string;
  /**
   * Reference images forwarded to the provider for style/character consistency.
   * Providers that do not support reference images may ignore this field.
   */
  referenceImages?: ReferenceImage[];
}

export interface ImageGenerationProvider {
  generate(req: ImageGenerationRequest): Promise<Buffer>;
}
