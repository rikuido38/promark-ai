import { createDeepAgent } from "deepagents";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { memorySaver, getOrCreateSession } from "./sessionStore";
import { classifyIntent } from "./intentRouter";
import { resolveAgentTool, resolveAllAgentTools } from "./agentRegistry";
import type { AgentFactoryOptions } from "./agentRegistry";
import type { RouteMode } from "./intentRouter";
import type { AssistantOutput } from "@/types/agent";
import type { GenerationSettings } from "@/types/generation-settings";

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
  "confidenceScore": <0.0 to 1.0>
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
  /**
   * Signed URLs of user-attached reference images to forward to the
   * illustration subagent as direction/behaviour samples.
   */
  sampleImageUrls?: string[];
  /**
   * Generation settings from the chatbot settings dialog (quality, background,
   * size, output format, compression).
   */
  generationSettings?: GenerationSettings;
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
/**
 * Run the main orchestrator agent for a single conversation turn.
 *
 * The session identified by `sessionId` is used as the LangGraph thread_id so
 * the MemorySaver checkpointer automatically retains conversation history
 * across turns. A new UUID is generated when no sessionId is provided.
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
    sampleImageUrls,
    generationSettings,
  } = options;

  console.log("[MainAgent] runMainAgent: request", {
    sessionId: incomingId,
    imageModel,
    sampleImageUrls,
    userMessage,
  });

  const agentOptions: AgentFactoryOptions = { imageModel, sampleImageUrls, userMessage, generationSettings };

  const sessionId = getOrCreateSession(incomingId ?? randomUUID());

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

  // ── Build agent (per-request to allow dynamic instructions + tools) ───────
  // responseFormat is intentionally omitted — deepagents' SupportedResponseFormat
  // type does not accept Zod schemas from an incompatible langchain version.
  // The system prompt instructs the model to return JSON; parseLastAiMessage()
  // extracts and parses it from the final AI message.
  const agent = createDeepAgent({
    model: new ChatOpenAI({ model: MODEL, temperature: 0 }),
    systemPrompt: buildInstructions(assistantName, currentDate),
    tools,
    checkpointer: memorySaver,
  });

  const result = await agent.invoke(
    { messages: [new HumanMessage(userMessage)] },
    { configurable: { thread_id: sessionId } },
  );

  // Extract structured output — deepagents surfaces it under `structuredResponse`
  // when responseFormat is a Zod schema, falling back to parsing the last AI message.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (result as any).structuredResponse ?? parseLastAiMessage(result.messages);

  const output: AssistantOutput = {
    text: raw?.text ?? "",
    medias: raw?.medias ?? [],
    confidenceScore: raw?.confidenceScore ?? 0,
    metadata: {},
  };

  return { output, sessionId };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fallback: extract and JSON-parse the last AI message from the graph output
 * when structured output was not surfaced by the runtime.
 */
function parseLastAiMessage(messages: unknown[]): Partial<AssistantOutput> {
  if (!Array.isArray(messages)) return {};
  const lastAi = [...messages].reverse().find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (m: any) => typeof m._getType === "function" && m._getType() === "ai",
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content = (lastAi as any)?.content;
  if (typeof content !== "string") return {};
  try {
    return JSON.parse(content) as Partial<AssistantOutput>;
  } catch {
    return { text: content };
  }
}
