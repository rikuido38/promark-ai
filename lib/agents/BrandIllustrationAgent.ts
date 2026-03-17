import { Agent, run, tool } from "@openai/agents";
import { z } from "zod";
import OpenAI, { toFile } from "openai";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BrandIllustrationContext } from "@/types/brand-context";
import { SUPABASE_BUCKET_NAME } from "@/utils/constants";

const MODEL = "gpt-5.2";

type AllowedSize = "1024x1024" | "1024x1536" | "1536x1024";

// ── Public types ──────────────────────────────────────────────────────────────

export type CreatorInput = {
  /** Supabase client for storage access. */
  supabase: SupabaseClient;
  /** Resolved brand context from org_cache_context. */
  context: BrandIllustrationContext;
  /** The user's illustration request. */
  userPrompt: string;
  size?: AllowedSize;
};

export type CreatorOutput = {
  /** The brand system prompt crafted by the agent. */
  systemPromptText: string;
  /** Base64-encoded PNG returned by gpt-image-1. */
  imageB64: string;
};

// ── Agent instructions ────────────────────────────────────────────────────────

const CREATOR_INSTRUCTIONS = `You are a brand illustration creator.

You receive a JSON object containing:
- Brand settings: company name, colors (hex), typography, composition rules,
  logo guidelines.
- Illustration style: description and AI vision analysis of style samples.
- Colour palette: hex code arrays for each role (outline, supporting, skin tones,
  hair, background, shadow) plus AI vision analysis.
- Usage contexts: per-context descriptions and AI vision analyses.
- A user illustration request and a target size.

Your task:
1. Decide if the user prompt mentions the logo, brand mark, or wordmark.
   If so, call fetch_logo FIRST to load the logo image before generating.
2. Craft a concise, actionable brand illustration system prompt (under 500 words)
   that incorporates:
   - Exact hex codes for every colour role and their usage rules.
   - Specific illustration style traits found in the style analysis.
   - Colour relationships and harmony rules from the palette analysis.
   - Relevant composition and usage context guidance.
   - Any brand typography or logo rules that apply to illustrations.
   - If logo was fetched, instruct that the provided logo image should be
     incorporated faithfully into the illustration.
3. Call generate_illustration with:
   - system_prompt: the system prompt you crafted in step 2.
   - user_prompt: the user's exact illustration request (unchanged).
   - size: the requested output size.

Output nothing beyond the tool calls. The final tool call is your last action.`;

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Generates an on-brand illustration from the cached brand context.
 *
 * The agent synthesises a brand system prompt from the stored visual analyses
 * then calls the generate_illustration tool (gpt-image-1) and returns the
 * base64 image data alongside the generated system prompt for logging.
 */
export async function runBrandIllustrationCreator(
  input: CreatorInput,
): Promise<CreatorOutput> {
  const { supabase, context, userPrompt, size = "1024x1024" } = input;

  // Capture tool results via closure — we never pass large b64 through the LLM.
  const logoBucketPath = context.brand?.logo_path; // raw storage path, e.g. "default/brands/logo.png"
  let capturedLogoBuffer: Buffer | null = null;
  let capturedSystemPrompt = "";
  let capturedImageB64 = "";

  console.log("Running BrandIllustrationCreator with logoBucketPath:", logoBucketPath);
  // ── fetch_logo tool ───────────────────────────────────────────────────────

  const fetchLogoTool = tool({
    name: "fetch_logo",
    description:
      "Download the brand logo image from storage. Call this when the user prompt mentions the logo, brand mark, or wordmark.",
    parameters: z.object({}),
    async execute() {
      if (!logoBucketPath) return "No logo is configured for this brand.";

      const { data, error } = await supabase.storage
        .from(SUPABASE_BUCKET_NAME)
        .download(logoBucketPath);

      if (error || !data) {
        throw new Error(`Failed to download logo from storage: ${error?.message ?? "No data"}`);
      }

      capturedLogoBuffer = Buffer.from(await data.arrayBuffer());

      // gpt-image-1 accepts PNG, JPEG, WEBP or GIF — convert anything else (e.g. SVG) to PNG.
      const ext = logoBucketPath.split(".").pop()?.toLowerCase();
      if (ext && !["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) {
        capturedLogoBuffer = await sharp(capturedLogoBuffer).png().toBuffer();
      }

      return "Logo fetched successfully.";
    },
  });

  const generateIllustrationTool = tool({
    name: "generate_illustration",
    description:
      "Generate an on-brand illustration image using the crafted system prompt and the user's request.",
    parameters: z.object({
      system_prompt: z
        .string()
        .describe("The brand illustration system prompt crafted from the brand context"),
      user_prompt: z.string().describe("The user's exact illustration request"),
      size: z
        .enum(["1024x1024", "1024x1536", "1536x1024"])
        .default("1024x1024")
        .describe("Desired output image size"),
    }),
    async execute({ system_prompt, user_prompt, size: reqSize }) {
      capturedSystemPrompt = system_prompt;

      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const fullPrompt = `${system_prompt}\n\nUser request: ${user_prompt}`;

      if (capturedLogoBuffer) {
        // Use images.edit so the logo is provided as a reference image.
        const logoFile = await toFile(capturedLogoBuffer, "logo.png", {
          type: "image/png",
        });
        const response = await openai.images.edit({
          model: "gpt-image-1",
          image: logoFile,
          prompt: fullPrompt,
          size: reqSize,
          n: 1,
        });
        capturedImageB64 = response.data?.[0]?.b64_json ?? "";
      } else {
        const response = await openai.images.generate({
          model: "gpt-image-1",
          prompt: fullPrompt,
          size: reqSize,
          n: 1,
        });
        capturedImageB64 = response.data?.[0]?.b64_json ?? "";
      }

      return "Image generated successfully.";
    },
  });

  const agentInput = JSON.stringify(
    { context, userPrompt, size },
    null,
    2,
  );

  const creatorAgent = new Agent({
    name: "Brand Illustration Creator",
    instructions: CREATOR_INSTRUCTIONS,
    model: MODEL,
    tools: [fetchLogoTool, generateIllustrationTool],
  });

  await run(creatorAgent, agentInput);

  if (!capturedImageB64) {
    throw new Error("Illustration generation failed: no image data was produced.");
  }

  return {
    systemPromptText: capturedSystemPrompt,
    imageB64: capturedImageB64,
  };
}
