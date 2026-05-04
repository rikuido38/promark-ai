import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local", override: true });

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { DEFAULT_ORG_ID } from "@/utils/constants";
import { TABLES } from "@/utils/supabase/constant";
import { runMainAgent } from "@/lib/agents/MainAgent";
import { DEFAULT_IMAGE_MODEL, IMAGE_MODELS } from "@/types/agent";
import type { AssistantOutput } from "@/types/agent";
import type { GenerationSettings } from "@/types/generation-settings";

const ALLOWED_IMAGE_MODELS = new Set(IMAGE_MODELS.map((m) => m.id));

// ── POST /api/generation/illustration ────────────────────────────────────────
/**
 * Body: { prompt: string, model?: string, sampleImageUrls?: string[] }
 *
 * Delegates to the main agent with intent="direct" and target="generate_illustration".
 * The agent fetches brand context internally and errors if none is found.
 * sampleImageUrls are passed as structured direction/reference lines in the user message.
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
    const imageModel =
      typeof body.model === "string" && ALLOWED_IMAGE_MODELS.has(body.model)
        ? body.model
        : DEFAULT_IMAGE_MODEL;

    // sampleImageUrls: optional signed URLs of user-attached reference images.
    const sampleImageUrls: string[] = Array.isArray(body.sampleImageUrls)
      ? (body.sampleImageUrls as unknown[]).filter(
          (u): u is string => typeof u === "string" && u.startsWith("https://"),
        )
      : [];

    // generationSettings: optional settings from the chatbot settings dialog.
    const generationSettings: GenerationSettings | undefined =
      body.settings && typeof body.settings === "object" ? (body.settings as GenerationSettings) : undefined;

    // ── 2. Delegate to main agent ────────────────────────────────────────────────────
    const { data: org } = await supabase
      .from(TABLES.ORGANIZATIONS)
      .select("assistant_name")
      .eq("id", DEFAULT_ORG_ID)
      .single();

    const { output, sessionId } = await runMainAgent({
      userMessage: userPrompt,
      supabase,
      assistantName: org?.assistant_name ?? null,
      imageModel,
      sampleImageUrls,
      generationSettings,
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
