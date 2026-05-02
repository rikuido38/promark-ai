// ---------------------------------------------------------------------------
// Image generation models
// ---------------------------------------------------------------------------

export const IMAGE_MODELS = [
  { id: "gpt-image-2", label: "GPT Image 2" },
  { id: "gpt-image-1.5",    label: "GPT Image 1.5" },
] as const;

export type ImageModel = (typeof IMAGE_MODELS)[number]["id"];

export const DEFAULT_IMAGE_MODEL: ImageModel = "gpt-image-2";

// ---------------------------------------------------------------------------

export interface AgentResponse {
  type: "text" | "ui" | "input_request";
  content: string;
  metadata?: AgentUIPayload | AgentInputPayload;
}

// ---------------------------------------------------------------------------
// Structured output produced by the Main Orchestrator Agent for every request
// ---------------------------------------------------------------------------

export type MediaType = 'image' | 'video' | 'url'

export interface MediaItem {
  filename: string
  /** Pre-signed or public URL the client uses to download / display the asset */
  signedUrl: string
  type: MediaType
  /** Storage path within the bucket — used for server-side operations like copy-to-drafts */
  storagePath?: string
}

export interface AssistantOutput {
  /** Final message to the end user. May contain HTML. */
  text: string
  /** Visual assets or links to surface alongside the text. */
  medias: MediaItem[]
  /**
   * How confident the assistant is that this response fully answers the request.
   * 0.0 = no confidence, 1.0 = fully confident.
   */
  confidenceScore: number
  /**
   * Arbitrary key-value bag for downstream agents or the UI to attach
   * additional structured data (e.g. agent trace, brand context used, etc.).
   */
  metadata: Record<string, unknown>
}

export interface AgentUIPayload {
  component_id: string;
  props: Record<string, any>;
}

export interface AgentInputPayload {
  action_id: string;
  options?: Array<{
    label: string;
    value: string;
  }>;
  requires_confirmation?: boolean;
}
