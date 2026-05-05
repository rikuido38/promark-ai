import { createDeepAgent } from "deepagents";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getOrCreateSession } from "./sessionStore";
import { getCheckpointer } from "./checkpointer";
import { resolveAllAgentTools } from "./agentRegistry";
import type { AgentFactoryOptions } from "./agentRegistry";
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

function buildInstructions(assistantName: string | null, date: string, forceTool?: string): string {
  const nameLine = assistantName ? `Your name is ${assistantName}.` : "";
  const forceToolLine = forceTool
    ? `\nFor this request you MUST call the '${forceTool}' tool.`
    : "";
  return `${nameLine}\nToday's date is ${date}.${forceToolLine}\n\n${BASE_INSTRUCTIONS}`;
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
   * When set, instructs the main agent to call this specific tool for the
   * current request. Use when the call site already knows the intent
   * (e.g. a UI "Generate Illustration" button). The LLM still runs and
   * uses conversation history — this is a hint, not a bypass.
   */
  forceTool?: string;
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
 * All registered subagent tools are always available. The LLM selects the
 * appropriate tool(s) from their descriptions. Pass `forceTool` to guide the
 * LLM toward a specific tool when the call site already knows the intent.
 *
 * Conversation history is persisted in Supabase Postgres via the LangGraph
 * PostgresSaver checkpointer, keyed by `sessionId` (thread_id).
 */
export async function runMainAgent(
  options: RunMainAgentOptions,
): Promise<RunMainAgentResult> {
  const {
    userMessage,
    sessionId: incomingId,
    assistantName = null,
    forceTool,
    imageModel,
    sampleImageUrls,
    generationSettings,
  } = options;

  console.log("[MainAgent] runMainAgent: request", {
    sessionId: incomingId,
    forceTool,
    imageModel,
    sampleImageUrls,
    userMessage,
  });

  const agentOptions: AgentFactoryOptions = { imageModel, sampleImageUrls, userMessage, generationSettings };

  const sessionId = getOrCreateSession(incomingId ?? randomUUID());

  const currentDate = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const tools = resolveAllAgentTools(agentOptions);

  console.log(
    "[MainAgent] tools =",
    tools.map((t) => t.name),
    "| forceTool =",
    forceTool ?? "none",
  );

  const checkpointer = await getCheckpointer();

  const agent = createDeepAgent({
    model: new ChatOpenAI({ model: MODEL, temperature: 0 }),
    systemPrompt: buildInstructions(assistantName, currentDate, forceTool),
    tools,
    checkpointer,
  });

  const result = await agent.invoke(
    { messages: [new HumanMessage(userMessage)] },
    { configurable: { thread_id: sessionId } },
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (result as any).structuredResponse ?? parseLastAiMessage(result.messages);

  const toolMedias = extractMediasFromToolMessages(result.messages);
  const existingUrls = new Set((raw?.medias ?? []).map((m: { signedUrl: string }) => m.signedUrl));
  const mergedMedias = [
    ...(raw?.medias ?? []),
    ...toolMedias.filter((m) => !existingUrls.has(m.signedUrl)),
  ];

  const output: AssistantOutput = {
    text: raw?.text ?? "",
    medias: mergedMedias,
    confidenceScore: raw?.confidenceScore ?? 0,
    metadata: {},
  };

  return { output, sessionId };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
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

/**
 * Scan all tool messages in the result for JSON payloads that contain a
 * `signedUrl` field. These come from subagent tools (e.g. upload_illustration)
 * and must be surfaced in `medias[]` regardless of whether the LLM included
 * them in its final JSON reply.
 */
function extractMediasFromToolMessages(
  messages: unknown[],
): Array<{ filename: string; signedUrl: string; type: "image" | "video" | "link"; storagePath?: string }> {
  if (!Array.isArray(messages)) return [];
  const medias: Array<{ filename: string; signedUrl: string; type: "image" | "video" | "link"; storagePath?: string }> = [];
  for (const m of messages) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = m as any;
    if (typeof msg?._getType !== "function" || msg._getType() !== "tool") continue;
    const raw = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? "");
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.signedUrl === "string" && typeof parsed?.filename === "string") {
        medias.push({
          filename: parsed.filename,
          signedUrl: parsed.signedUrl,
          type: parsed.type ?? "image",
          ...(parsed.storagePath ? { storagePath: parsed.storagePath } : {}),
        });
      }
    } catch {
      // not JSON — skip
    }
  }
  return medias;
}
