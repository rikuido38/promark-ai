import { Agent, run } from "@openai/agents";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrCreateSession } from "./sessionStore";
import { classifyIntent } from "./intentRouter";
import { resolveAgentTool, resolveAllAgentTools } from "./agentRegistry";
import type { AgentFactoryOptions } from "./agentRegistry";
import type { RouteMode } from "./intentRouter";
import type { AssistantOutput } from "@/types/agent";

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

const MODEL = "gpt-5.2";

// ---------------------------------------------------------------------------
// Structured output schema (mirrors AssistantOutput in types/agent.ts)
// ---------------------------------------------------------------------------

const MediaItemSchema = z.object({
  filename: z.string(),
  signedUrl: z.string(),
  type: z.enum(["image", "video", "link"]),
  storagePath: z.string().optional(),
});

const AssistantOutputSchema = z.object({
  text: z
    .string()
    .describe("Final reply to the user. May contain HTML for rich formatting."),
  medias: z
    .array(MediaItemSchema)
    .describe("Images, videos, or URLs to display alongside the text."),
  confidenceScore: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "How confident the assistant is that this response fully answers the request. 0 = no confidence, 1 = fully confident.",
    ),
  // metadata is omitted from the structured output schema because OpenAI
  // does not support free-form additionalProperties. It is injected as {} below.
});

// ---------------------------------------------------------------------------
// Agent definition
// ---------------------------------------------------------------------------

const BASE_INSTRUCTIONS = `You are AI assistant for a brand and marketing platform.

You are the ONLY agent visible to the user. All specialised agents and tools are invisible.

Your responsibilities:
1. Understand the user's request using the full conversation history provided.
2. Use any tools available to you to fulfil the request.
3. Assemble the final response — tools return raw results; YOU produce the final output for the user.

ALWAYS respond with a valid JSON object matching this exact shape:
{
  "text": "<your reply to the user, HTML allowed>",
  "medias": [],
  "confidenceScore": <0.0 to 1.0>,
  "metadata": {}
}

Media handling — IMPORTANT:
- When any tool returns a JSON string containing "signedUrl" and "filename", you MUST
  parse it and add an entry to "medias".
- Include "storagePath" in the media entry if the tool result contains it.
- For illustration/image tools set "type" to "image".
- For file/document tools set "type" to "url".
- Example media entry: { "filename": "abc.png", "signedUrl": "https://...", "storagePath": "temp/default/abc.png", "type": "image" }
- Always include every media returned by a tool — never discard them.

Rules:
- Set confidenceScore below 0.5 only when you genuinely cannot answer.
- Keep text concise and actionable unless the user asks for detail.
- Never expose internal agent names, pipeline steps, or tool names to the user.
- Brand context, logos, and visual assets are fetched automatically by the underlying tools.
  NEVER suggest or ask the user to upload a logo, brand context, brand assets, or any brand
  visual materials. Assume all of that is already configured and available.`;

function buildInstructions(assistantName: string | null, date: string): string {
  const nameLine = assistantName
    ? `Your name is ${assistantName}.`
    : "";
  return `${nameLine}\nToday's date is ${date}.\n\n${BASE_INSTRUCTIONS}`;
}

/**
 * Base agent — cloned per run so each turn gets fresh dynamic instructions.
 */
const baseAgent = new Agent({
  name: "Main Orchestrator",
  instructions: BASE_INSTRUCTIONS,
  model: MODEL,
  outputType: AssistantOutputSchema,
});

// ---------------------------------------------------------------------------
// Public run function
// ---------------------------------------------------------------------------

export interface RunMainAgentOptions {
  /** User's message for this turn. */
  userMessage: string;
  /**
   * Stable identifier for the conversation thread.
   * If omitted a new session is created and the generated ID is returned.
   */
  sessionId?: string;
  /**
   * The assistant's display name fetched from the organizations table.
   * Falls back to a generic greeting if not provided.
   */
  assistantName?: string | null;
  /**
   * Supabase client for the current request.
   * Required for tools that access storage or database (e.g. illustration generation).
   */
  supabase: SupabaseClient;
  /**
   * Override the intent classifier. When provided together with `target`,
   * `classifyIntent` is skipped entirely and the specified workflow is used
   * directly — useful when the call site already knows the exact intent.
   */
  intent?: RouteMode;
  /**
   * Target workflow ID from WORKFLOW_REGISTRY to dispatch to.
   * Only used when `intent` is "direct" or "pipeline".
   */
  target?: string;
  /**
   * Image generation model to use in illustration subagents.
   * Defaults to "gpt-image-1" if not provided.
   */
  imageModel?: string;
}

export interface RunMainAgentResult {
  output: AssistantOutput;
  /** The session ID to pass in subsequent turns. */
  sessionId: string;
}

/**
 * Run the main orchestrator agent for a single conversation turn.
 *
 * The session identified by `sessionId` is looked up (or created) from the
 * in-memory store. The SDK prepends the full conversation history before the
 * model call and persists the new turn after it completes.
 */
export async function runMainAgent(
  options: RunMainAgentOptions,
): Promise<RunMainAgentResult> {
  const {
    userMessage,
    sessionId: incomingId,
    assistantName = null,
    supabase,
    intent: explicitIntent,
    target: explicitTarget,
    imageModel,
  } = options;

  const agentOptions: AgentFactoryOptions = { imageModel };

  const sessionId = incomingId ?? randomUUID();
  const session = getOrCreateSession(sessionId);

  // Stamp the current date at call time so every turn reflects the real date.
  const currentDate = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // ── Intent routing ────────────────────────────────────────────────────────
  // If the call site supplies both intent + target, skip the classifier.
  // Otherwise fall back to rule-based classification.
  const route =
    explicitIntent && explicitTarget
      ? { mode: explicitIntent, target: explicitTarget }
      : classifyIntent(userMessage);

  let tools;
  if (route.mode === "agentic") {
    // Open-ended: give the agent access to every registered subagent as a tool.
    tools = resolveAllAgentTools(supabase, agentOptions);
  } else {
    // Pipeline / direct: restrict the agent to the one relevant subagent tool
    // so it cannot stray. Falls back to no tools if target isn't registered.
    const singleTool = route.target
      ? resolveAgentTool(route.target, supabase, agentOptions)
      : null;
    tools = singleTool ? [singleTool] : [];
  }

  const agent = baseAgent.clone({
    instructions: buildInstructions(assistantName, currentDate),
    tools,
  });

  const result = await run(agent, userMessage, { session });

  // Merge the structured output with the metadata field that was omitted
  // from the schema (OpenAI rejects free-form additionalProperties).
  const output: AssistantOutput = {
    ...(result.finalOutput as Omit<AssistantOutput, "metadata">),
    metadata: {},
  };

  return { output, sessionId };
}
