import type { SupabaseClient } from "@supabase/supabase-js";
import type { StructuredTool } from "@langchain/core/tools";
import type { RouteMode } from "./intentRouter";
import { createBrandIllustrationTool } from "./subagents/brand-illustration-agent";
import type { GenerationSettings } from "@/types/generation-settings";

// ---------------------------------------------------------------------------
// Agent Registry
//
// Each entry describes a named specialised subagent: its routing mode, the
// tool name/description the main agent sees, and a factory that creates the
// LangChain StructuredTool instance (pre-bound to per-request dependencies).
//
// The main (deepagents) orchestrator receives these as LangChain tools so it
// can call them during its reasoning loop.
//
// Routing modes:
//   - "direct"   → single specialist tool (1:1 intent → tool mapping)
//   - "pipeline" → developer-defined multi-step workflow tool
//   - "agentic"  → open-ended; orchestrator picks freely from all tools
//
// To register a new subagent or pipeline:
//   1. Implement the tool factory in lib/agents/subagents/ (or pipelines/)
//   2. Add an entry to AGENT_REGISTRY below
//   3. (Optional) Add a RouteRule in intentRouter.ts for automatic classification
//      — or pass intent + target directly via RunMainAgentOptions
// ---------------------------------------------------------------------------

export interface AgentRegistryEntry {
  /** Human-readable label for logging / debugging. */
  label: string;
  mode: RouteMode;
  /** The tool name the main agent uses to invoke this subagent. */
  toolName: string;
  /** Description shown to the main agent so it knows when to call this tool. */
  toolDescription: string;
  /** Factory — receives per-request dependencies, returns a bound StructuredTool. */
  createTool: (supabase: SupabaseClient, options?: AgentFactoryOptions) => StructuredTool;
  /**
   * Builds the tool's input object from the raw user message.
   * Used in "direct" mode to invoke the tool without an LLM round-trip.
   * Defaults to `{ user_request: userMessage }` if omitted.
   */
  buildDirectInput?: (userMessage: string) => Record<string, unknown>;
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
}

export const AGENT_REGISTRY: Record<string, AgentRegistryEntry> = {
  generate_illustration: {
    label: "Brand Illustration Creator",
    mode: "direct",
    toolName: "generate_illustration",
    toolDescription:
      "Generate an on-brand illustration or image from a user prompt. " +
      "Use this whenever the user asks to create, generate, or draw an illustration, image, or visual.",
    createTool: (supabase, options) => createBrandIllustrationTool(supabase, options),
    buildDirectInput: (userMessage) => ({ user_request: userMessage }),
  },
  // ── Add new agents/pipelines here ───────────────────────────────────────
  // compile_brand_context: {
  //   label: "Brand Context Compiler",
  //   mode: "pipeline",
  //   toolName: "compile_brand_context",
  //   toolDescription: "Compile and cache the brand DNA into a structured context object.",
  //   createTool: (supabase, options) => createBrandContextCompilerTool(supabase, options),
  // },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a single StructuredTool for a given registry target ID, or null
 * if the target isn't registered.
 */
export function resolveAgentTool(
  target: string,
  supabase: SupabaseClient,
  options?: AgentFactoryOptions,
): StructuredTool | null {
  const entry = AGENT_REGISTRY[target];
  if (!entry) return null;
  return entry.createTool(supabase, options);
}

/**
 * Returns all registered agents as StructuredTools — used in agentic mode
 * where the main orchestrator can freely choose which to call.
 */
export function resolveAllAgentTools(
  supabase: SupabaseClient,
  options?: AgentFactoryOptions,
): StructuredTool[] {
  return Object.values(AGENT_REGISTRY).map((entry) => entry.createTool(supabase, options));
}
