import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local", override: true });

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/utils/supabase/server";
import { SUPABASE_BUCKET_NAME, DEFAULT_ORG_ID } from "@/utils/constants";
import { getBrandContext } from "@/services/brand-context";
import { runBrandIllustrationCreator } from "@/lib/agents/BrandIllustrationAgent";
import { setDefaultOpenAIKey } from "@openai/agents";

type AllowedSize = "1024x1024" | "1024x1536" | "1536x1024";

const ALLOWED_SIZES = new Set<AllowedSize>(["1024x1024", "1024x1536", "1536x1024"]);

// ── POST /api/generation/illustration ────────────────────────────────────────
/**
 * Body: { prompt: string, size?: "1024x1024" | "1024x1536" | "1536x1024" }
 *
 * Fetches the compiled brand system_prompt_text from org_cache_context,
 * prepends it to the user prompt, generates an image via gpt-image-1, then
 * uploads the result to Supabase storage at temp/<org_id>/<uuid>.png.
 *
 * Returns: { path: string, signedUrl: string }
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

    // ── 2. Fetch compiled brand context + generate image via agent ────────────
    setDefaultOpenAIKey(process.env.OPENAI_API_KEY ?? "");

    const context = await getBrandContext(supabase);

    let imageB64: string;

    if (context) {
      // Brand context exists — let the creator agent craft the system prompt
      // and generate the illustration in one step.
      const result = await runBrandIllustrationCreator({ supabase, context, userPrompt, size });
      imageB64 = result.imageB64;
    } else {
      // No compiled brand context yet — fall back to raw generation.
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const response = await openai.images.generate({
        model: "gpt-image-1",
        prompt: userPrompt,
        size,
        n: 1,
      });
      imageB64 = response.data?.[0]?.b64_json ?? "";
    }

    if (!imageB64) {
      throw new Error("No image data returned from image generation");
    }

    // ── 3. Upload to Supabase storage ─────────────────────────────────────────
    const imageBuffer = Buffer.from(imageB64, "base64");
    const storagePath = `temp/${DEFAULT_ORG_ID}/${crypto.randomUUID()}.png`;

    const { error: uploadError } = await supabase.storage
      .from(SUPABASE_BUCKET_NAME)
      .upload(storagePath, imageBuffer, {
        contentType: "image/png",
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Failed to upload image: ${uploadError.message}`);
    }

    // ── 4. Return signed URL (1 hour) ─────────────────────────────────────────
    const { data: signedData, error: signedError } = await supabase.storage
      .from(SUPABASE_BUCKET_NAME)
      .createSignedUrl(storagePath, 60 * 60);

    if (signedError || !signedData?.signedUrl) {
      throw new Error(`Failed to create signed URL: ${signedError?.message}`);
    }

    return NextResponse.json({
      path: storagePath,
      signedUrl: signedData.signedUrl,
    });
  } catch (error) {
    console.error("[POST /api/generation/illustration]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 },
    );
  }
}
