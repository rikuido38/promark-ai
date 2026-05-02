import type { SupabaseClient } from "@supabase/supabase-js";
import type { Agent, Tool } from "@openai/agents";
import type { RouteMode } from "./intentRouter";
import { createBrandIllustrationAgent } from "./subagents/BrandIllustrationAgent";

// ---------------------------------------------------------------------------
// Agent Registry
//
// Each entry describes a named specialised agent: its routing mode, the tool
// name/description the main agent sees, and a factory that creates the Agent
// instance (pre-bound to any request-level dependencies like Supabase).
//
// The main agent receives these as tools via agent.asTool(), so it can call
// them by toolName during its reasoning loop.
//
// To register a new subagent or pipeline:
//   1. Implement the Agent factory in lib/agents/subagents/ (or pipelines/)
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
  /** Factory — receives per-request dependencies, returns a bound Agent. */
  createAgent: (supabase: SupabaseClient, options?: AgentFactoryOptions) => Agent;
  /** Max turns allowed for this subagent run. Defaults to 10 if omitted. */
  maxTurns?: number;
}

/** Options passed through from the API call into every subagent factory. */
export interface AgentFactoryOptions {
  /** Image generation model override (e.g. "dall-e-3"). Defaults to "gpt-image-1". */
  imageModel?: string;
  /** Pre-loaded sample image URLs from the user's chat attachments. */
  sampleImageUrls?: string[];
  /** The original user message, forwarded verbatim as the illustration scene prompt. */
  userMessage?: string;
}

export const AGENT_REGISTRY: Record<string, AgentRegistryEntry> = {
  generate_illustration: {
    label: "Brand Illustration Creator",
    mode: "direct",
    toolName: "generate_illustration",
    toolDescription:
      "Generate an on-brand illustration or image from a user prompt. " +
      "Use this whenever the user asks to create, generate, or draw an illustration, image, or visual.",
    createAgent: (supabase, options) => createBrandIllustrationAgent(supabase, options),
    maxTurns: 20,
  },
  // ── Add new agents/pipelines here ───────────────────────────────────────
  // compile_brand_context: {
  //   label: "Brand Context Compiler",
  //   mode: "pipeline",
  //   toolName: "compile_brand_context",
  //   toolDescription: "Compile and cache the brand DNA into a structured context object.",
  //   createAgent: createBrandContextCompilerAgent,
  // },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a single agent-as-tool for a given registry target ID, or null
 * if the target isn't registered.
 */
export function resolveAgentTool(
  target: string,
  supabase: SupabaseClient,
  options?: AgentFactoryOptions,
): Tool | null {
  const entry = AGENT_REGISTRY[target];
  if (!entry) return null;
  return entry.createAgent(supabase, options).asTool({
    toolName: entry.toolName,
    toolDescription: entry.toolDescription,
    ...(entry.maxTurns !== undefined && { maxTurns: entry.maxTurns }),
  });
}

/**
 * Returns all registered agents as tools — used in agentic mode where the
 * main agent can freely choose which to call.
 */
export function resolveAllAgentTools(supabase: SupabaseClient, options?: AgentFactoryOptions): Tool[] {
  return Object.values(AGENT_REGISTRY).map((entry) =>
    entry.createAgent(supabase, options).asTool({
      toolName: entry.toolName,
      toolDescription: entry.toolDescription,
      ...(entry.maxTurns !== undefined && { maxTurns: entry.maxTurns }),
    }),
  );
}
