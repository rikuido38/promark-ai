import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local", override: true });

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { DEFAULT_ORG_ID } from "@/utils/constants";
import { TABLES } from "@/utils/supabase/constant";
import { runMainAgent } from "@/lib/agents/MainAgent";
import { setDefaultOpenAIKey } from "@openai/agents";

type AllowedSize = "1024x1024" | "1024x1536" | "1536x1024";

const ALLOWED_SIZES = new Set<AllowedSize>(["1024x1024", "1024x1536", "1536x1024"]);

// ── POST /api/generation/illustration ────────────────────────────────────────
/**
 * Body: { prompt: string, size?: "1024x1024" | "1024x1536" | "1536x1024" }
 *
 * Delegates to the main agent with intent="direct" and target="generate_illustration".
 * The agent fetches brand context internally and errors if none is found.
 *
 * Returns: { output: AssistantOutput, sessionId: string }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── 1. Parse + validate request body ─────────────────────────────────────
    const body = await req.json().catch(() => null);
    if (!body || typeof body.prompt !== "string" || !body.prompt.trim()) {
      return NextResponse.json(
        { error: "Missing required field: prompt" },
        { status: 400 },
      );
    }

    const userPrompt = body.prompt.trim();
    const size: AllowedSize =
      ALLOWED_SIZES.has(body.size) ? body.size : "1024x1024";

    // ── 2. Delegate to main agent ─────────────────────────────────────────────
    setDefaultOpenAIKey(process.env.OPENAI_API_KEY ?? "");

    const { data: org } = await supabase
      .from(TABLES.ORGANIZATIONS)
      .select("assistant_name")
      .eq("id", DEFAULT_ORG_ID)
      .single();

    const { output, sessionId } = await runMainAgent({
      userMessage: `Generate an illustration (size: ${size}): ${userPrompt}`,
      supabase,
      assistantName: org?.assistant_name ?? null,
      intent: "direct",
      target: "generate_illustration",
    });

    return NextResponse.json({ output, sessionId });
  } catch (error) {
    console.error("[POST /api/generation/illustration]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 },
    );
  }
}
