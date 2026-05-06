import type { StructuredTool } from "@langchain/core/tools";
import { createBrandIllustrationTool } from "./subagents/brand-illustration-agent";
import type { GenerationSettings } from "@/types/generation-settings";

// ---------------------------------------------------------------------------
// Agent Registry
//
// Each entry describes a named specialist subagent exposed to the main agent
// as a LangChain StructuredTool. The main agent's LLM reads the tool
// description to decide when to invoke it — no manual routing rules needed.
//
// To register a new subagent:
//   1. Implement the tool factory in lib/agents/subagents/<name>/
//   2. Add an entry to AGENT_REGISTRY below
// ---------------------------------------------------------------------------

export interface AgentRegistryEntry {
  /** Human-readable label for logging / debugging. */
  label: string;
  /** The tool name the main agent uses to invoke this subagent. */
  toolName: string;
  /** Description shown to the main agent so it knows when to call this tool. */
  toolDescription: string;
  /** Factory — receives per-request dependencies, returns a bound StructuredTool. */
  createTool: (options?: AgentFactoryOptions) => StructuredTool;
}

/** Options passed through from the API call into every subagent factory. */
export interface AgentFactoryOptions {
  /** Image generation model override (e.g. "dall-e-3"). Defaults to "gpt-image-2". */
  imageModel?: string;
  /** Pre-loaded sample image URLs from the user's chat attachments. */
  sampleImageUrls?: string[];
  /** The original user message, forwarded verbatim as the illustration scene prompt. */
  userMessage?: string;
  /** Generation settings from the chatbot settings dialog. */
  generationSettings?: GenerationSettings;
  /**
   * Seed details from the image currently shown in the preview panel.
   * Passed to the inner illustration agent on edit requests so it understands
   * the previous image (characters, colors, style) without needing full history.
   */
  previousImageSeedDetails?: string;
}

export const AGENT_REGISTRY: Record<string, AgentRegistryEntry> = {
  generate_illustration: {
    label: "Brand Illustration Creator",
    toolName: "generate_illustration",
    toolDescription:
      "Generate an on-brand illustration or image from a user prompt. " +
      "Use this whenever the user asks to create, generate, or draw an illustration, image, or visual.",
    createTool: (options) => createBrandIllustrationTool(options),
  },
  // ── Add new subagents here ────────────────────────────────────────────────
  // compile_brand_context: {
  //   label: "Brand Context Compiler",
  //   toolName: "compile_brand_context",
  //   toolDescription: "Compile and cache the brand DNA into a structured context object.",
  //   createTool: (supabase, options) => createBrandContextCompilerTool(supabase, options),
  // },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns all registered agents as StructuredTools for the main orchestrator.
 */
export function resolveAllAgentTools(
  options?: AgentFactoryOptions,
): StructuredTool[] {
  return Object.values(AGENT_REGISTRY).map((entry) => entry.createTool(options));
}
