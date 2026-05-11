import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local", override: true });

import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/utils/cognito/auth";
import { getDb } from "@/repository/mongodb/client";
import { DEFAULT_ORG_ID } from "@/utils/constants";
import { COLLECTIONS } from "@/utils/supabase/constant";
import { runMainAgent } from "@/lib/agents/MainAgent";
import { DEFAULT_IMAGE_MODEL, IMAGE_MODELS } from "@/types/agent";
import type { AssistantOutput } from "@/types/agent";
import type { GenerationSettings } from "@/types/generation-settings";

const ALLOWED_IMAGE_MODELS = new Set(IMAGE_MODELS.map((m) => m.id));

export async function POST(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    const sampleImageUrls: string[] = Array.isArray(body.sampleImageUrls)
      ? (body.sampleImageUrls as unknown[]).filter(
          (u): u is string => typeof u === "string" && u.startsWith("https://"),
        )
      : [];

    const generationSettings: GenerationSettings | undefined =
      body.settings && typeof body.settings === "object" ? (body.settings as GenerationSettings) : undefined;

    const db = await getDb();
    const org = await db
      .collection(COLLECTIONS.ORGANIZATIONS)
      .findOne({ _id: DEFAULT_ORG_ID } as unknown as import("mongodb").Filter<import("mongodb").Document>, { projection: { assistant_name: 1 } });

    const { output, sessionId } = await runMainAgent({
      userMessage: userPrompt,
      assistantName: (org?.assistant_name as string | null) ?? null,
      imageModel,
      sampleImageUrls,
      generationSettings,
      forceTool: "generate_illustration",
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
