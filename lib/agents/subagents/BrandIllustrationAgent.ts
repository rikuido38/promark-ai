import { Agent, tool } from "@openai/agents";
import { z } from "zod";
import OpenAI from "openai";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BrandIllustrationContext } from "@/types/brand-context";
import { SUPABASE_BUCKET_NAME, DEFAULT_ORG_ID } from "@/utils/constants";
import { getBrandContext } from "@/services/brand-context";

const MODEL = "gpt-5.2";

// ── Agent factory ─────────────────────────────────────────────────────────────

const AGENT_TOOL_INSTRUCTIONS = `You are a brand illustration creator.

When invoked, you MUST follow these steps in order:
1. Call fetch_brand_context to load the brand settings and illustration context.
   If it fails, stop immediately — do not proceed.
2. Craft a concise, actionable brand illustration system prompt (under 500 words)
   incorporating: exact hex codes for every colour role, illustration style traits,
   colour relationships, composition and usage context guidance.
   CRITICAL: The system_prompt MUST NOT mention any logo, brand mark, wordmark,
   badge, or company symbol. The logo will be composited on top afterwards.
3. Call generate_illustration with:
   - system_prompt: the prompt from step 2 (zero logo references)
   - user_prompt: the user's request with ALL logo/brand mark/wordmark/symbol
     references REMOVED entirely. Do not add any placeholder or reservation note.
4. If the user request asks for or mentions the company logo, you MUST call
   fetch_logo first, then call attach_logo (default position: bottom-right,
   unless the user specifies another position).
5. Call upload_illustration to save the final PNG to storage.
6. Your FINAL text output MUST be the exact JSON string returned by upload_illustration,
   with absolutely no other text, explanation, or formatting around it.`;

/**
 * Creates a Brand Illustration Agent bound to a Supabase client.
 *
 * Pipeline: fetch_brand_context → generate_illustration → [fetch_logo → attach_logo] → upload_illustration
 */
export function createBrandIllustrationAgent(
  supabase: SupabaseClient,
  options?: { imageModel?: string },
): Agent {
  // Per-invocation state shared across tool calls via closure.
  const imageModel = options?.imageModel ?? "gpt-image-1";
  let capturedContext: BrandIllustrationContext | null = null;
  let capturedLogoBuffer: Buffer | null = null;
  let capturedImageBuffer: Buffer | null = null;

  const fetchBrandContextTool = tool({
    name: "fetch_brand_context",
    description: "Load the compiled brand DNA and illustration settings. Must be called first.",
    parameters: z.object({}),
    async execute() {
      capturedContext = await getBrandContext(supabase);
      if (!capturedContext) {
        throw new Error(
          "No compiled brand context found. Please compile the brand context before generating illustrations.",
        );
      }
      return JSON.stringify(capturedContext);
    },
  });

  const generateIllustrationTool = tool({
    name: "generate_illustration",
    description:
      "Generate an on-brand illustration from the brand system prompt and user request. The system_prompt and user_prompt MUST NOT contain any reference to a logo, brand mark, wordmark, or company symbol — those are handled separately by attach_logo.",
    parameters: z.object({
      system_prompt: z
        .string()
        .describe("The brand illustration system prompt crafted from the brand context"),
      user_prompt: z.string().describe("The user's exact illustration request"),
    }),
    async execute({ system_prompt, user_prompt }) {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const fullPrompt = `${system_prompt}\n\nUser request: ${user_prompt}`;

      const response = await openai.images.generate({
        model: imageModel,
        prompt: fullPrompt,
        size: "1024x1024",
        n: 1,
        // gpt-image-1 always returns b64_json; dall-e-* default to URL so we must opt in.
        ...(imageModel !== "gpt-image-1" && { response_format: "b64_json" as const }),
      });

      const imageB64 = response.data?.[0]?.b64_json ?? "";
      if (!imageB64) throw new Error("Image generation produced no data.");

      capturedImageBuffer = Buffer.from(imageB64, "base64");
      return "Illustration generated successfully.";
    },
  });

  const fetchLogoTool = tool({
    name: "fetch_logo",
    description:
      "Download the actual brand logo file from storage. Call this when user is making a request involving the company logo, brand mark, wordmark, or company symbol. This MUST be called before generate_illustration so you can craft the prompt without any logo references.",
    parameters: z.object({}),
    async execute() {
      const logoBucketPath = capturedContext?.brand?.logo_path;
      if (!logoBucketPath) return "No logo is configured for this brand.";

      const { data, error } = await supabase.storage
        .from(SUPABASE_BUCKET_NAME)
        .download(logoBucketPath);

      if (error || !data) {
        throw new Error(`Failed to download logo: ${error?.message ?? "No data"}`);
      }

      capturedLogoBuffer = Buffer.from(await data.arrayBuffer());

      const ext = logoBucketPath.split(".").pop()?.toLowerCase();
      if (ext && !["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) {
        capturedLogoBuffer = await sharp(capturedLogoBuffer).png().toBuffer();
      }

      return "Logo fetched successfully.";
    },
  });

  const attachLogoTool = tool({
    name: "attach_logo",
    description:
      "Composite the downloaded brand logo on top of the generated illustration. Must be called after fetch_logo and generate_illustration.",
    parameters: z.object({
      position: z
        .enum(["top-left", "top-right", "bottom-left", "bottom-right", "center"])
        .default("bottom-right")
        .describe("Where to place the logo on the illustration"),
    }),
    async execute({ position }) {
      if (!capturedImageBuffer) throw new Error("generate_illustration must be called first.");
      if (!capturedLogoBuffer) throw new Error("fetch_logo must be called before attach_logo.");

      const illustration = sharp(capturedImageBuffer);
      const { width = 1024, height = 1024 } = await illustration.metadata();

      // Scale logo to ~20% of illustration width, preserving aspect ratio.
      const logoMaxSize = Math.round(width * 0.2);
      const padding = Math.round(width * 0.04);

      const resizedLogo = await sharp(capturedLogoBuffer)
        .resize(logoMaxSize, logoMaxSize, { fit: "inside" })
        .png()
        .toBuffer();

      const { width: logoW = logoMaxSize, height: logoH = logoMaxSize } =
        await sharp(resizedLogo).metadata();

      let left: number, top: number;
      switch (position) {
        case "top-left":    left = padding;                   top = padding; break;
        case "top-right":   left = width - logoW - padding;   top = padding; break;
        case "bottom-left": left = padding;                   top = height - logoH - padding; break;
        case "center":      left = Math.round((width - logoW) / 2); top = Math.round((height - logoH) / 2); break;
        case "bottom-right":
        default:            left = width - logoW - padding;   top = height - logoH - padding;
      }

      capturedImageBuffer = await illustration
        .composite([{ input: resizedLogo, left, top }])
        .png()
        .toBuffer();

      return "Logo composited onto illustration.";
    },
  });

  const uploadIllustrationTool = tool({
    name: "upload_illustration",
    description:
      "Upload the final illustration to storage and return a signed URL. Always call this as the last step.",
    parameters: z.object({}),
    async execute() {
      let uploadBuffer = capturedImageBuffer;
      if (!uploadBuffer) throw new Error("generate_illustration must be called first.");

      // Compress PNG: maximum effort and adaptive filtering for smaller file size
      uploadBuffer = await sharp(uploadBuffer)
        .png({ effort: 10, adaptiveFiltering: true })
        .toBuffer();

      const ext = "png";
      const contentType = "image/png";
      const filename = `${crypto.randomUUID()}.${ext}`;
      const storagePath = `temp/${DEFAULT_ORG_ID}/${filename}`;

      const { error: uploadError } = await supabase.storage
        .from(SUPABASE_BUCKET_NAME)
        .upload(storagePath, uploadBuffer, { contentType, upsert: false });

      if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

      const { data: signedData, error: signedError } = await supabase.storage
        .from(SUPABASE_BUCKET_NAME)
        .createSignedUrl(storagePath, 60 * 60);

      if (signedError || !signedData?.signedUrl) {
        throw new Error(`Signed URL creation failed: ${signedError?.message}`);
      }

      return JSON.stringify({ filename, signedUrl: signedData.signedUrl, storagePath });
    },
  });

  return new Agent({
    name: "Brand Illustration Creator",
    instructions: AGENT_TOOL_INSTRUCTIONS,
    model: MODEL,
    tools: [fetchBrandContextTool, generateIllustrationTool, fetchLogoTool, attachLogoTool, uploadIllustrationTool],
    modelSettings: {
      reasoning: { effort: "none" },
    },
  });
}
