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

const AGENT_TOOL_INSTRUCTIONS = `You are a brand illustration SVG creator.

When invoked, you MUST follow these steps in order:
1. Call fetch_brand_context to load the brand settings and illustration context.
   If it fails, stop immediately — do not proceed.
2. Read the user's request carefully BEFORE doing anything else. Decide:
   a. Does the request mention the logo, brand mark, wordmark, or company symbol/badge?
   b. If YES — note the desired position (e.g. "top right") and call fetch_logo NOW,
      before crafting any prompt or generating the SVG.
3. Craft a concise, actionable brand illustration system prompt (under 500 words)
   incorporating: exact hex codes for every colour role, illustration style traits,
   colour relationships, composition and usage context guidance.
   CRITICAL: The system_prompt MUST NOT mention any logo, brand mark, wordmark,
   badge, or company symbol. The logo will be embedded into the SVG afterwards.
4. Call generate_svg with:
   - system_prompt: the prompt from step 3 (zero logo references)
   - user_prompt: the user's request with ALL logo/brand mark/wordmark/symbol
     references REMOVED. Replace them with a note like
     "leave <position> corner clear for a logo overlay" so the AI does not
     draw any placeholder logo in that area.
   - size: the requested size (default 1024x1024)
5. If fetch_logo was called in step 2 and succeeded, call attach_logo_to_svg now,
   passing the position noted in step 2 (default: bottom-right).
6. Call upload_svg to save the final SVG to storage.
7. Your FINAL text output MUST be the exact JSON string returned by upload_svg,
   with absolutely no other text, explanation, or formatting around it.`;

/**
 * Creates a Brand Illustration SVG Agent bound to a Supabase client.
 *
 * Pipeline: fetch_brand_context → generate_svg → [fetch_logo → attach_logo_to_svg] → upload_svg
 *
 * Uses GPT-5.2 chat completion to produce raw SVG markup. If a logo is
 * requested, the raster logo is normalised to PNG, resized to ~20% of the
 * canvas width, and injected as a base64 <image> element positioned at the
 * requested corner before the SVG is uploaded.
 */
export function createBrandIllustrationSVGAgent(supabase: SupabaseClient): Agent {
  // Per-invocation state shared across tool calls via closure.
  let capturedContext: BrandIllustrationContext | null = null;
  let capturedLogoBuffer: Buffer | null = null;
  let capturedSvgText: string | null = null;

  const fetchBrandContextTool = tool({
    name: "fetch_brand_context",
    description: "Load the compiled brand DNA and illustration settings. Must be called first.",
    parameters: z.object({}),
    async execute() {
      capturedContext = await getBrandContext(supabase);
      if (!capturedContext) {
        throw new Error(
          "No compiled brand context found. Please compile the brand context before generating SVG illustrations.",
        );
      }
      return JSON.stringify(capturedContext);
    },
  });

  const generateSvgTool = tool({
    name: "generate_svg",
    description:
      "Generate an on-brand SVG illustration using GPT. The system_prompt and user_prompt MUST NOT contain any reference to a logo, brand mark, wordmark, or company symbol — those are embedded separately by attach_logo_to_svg.",
    parameters: z.object({
      system_prompt: z
        .string()
        .describe("The brand illustration system prompt crafted from the brand context"),
      user_prompt: z
        .string()
        .describe("The user's illustration request with all logo references removed"),
      size: z
        .enum(["1024x1024", "1024x1536", "1536x1024"])
        .default("1024x1024")
        .describe("Desired SVG canvas size"),
    }),
    async execute({ system_prompt, user_prompt, size }) {
      const [w, h] = size.split("x").map(Number);
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const svgSystemPrompt = `${system_prompt}

You are an expert SVG illustrator. Produce ONLY valid, self-contained SVG markup — no markdown fences, no explanation, no surrounding text.

Requirements:
- Root element must be: <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
- Use only inline SVG features: shapes, paths, gradients, filters, clipPaths, text.
- No external file references, no JavaScript, no <script> or <style> tags with imports.
- Produce a rich, detailed, complete illustration that fills the entire canvas.
- Output ONLY the SVG markup, starting exactly with <svg and ending exactly with </svg>.`;

      const response = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: svgSystemPrompt },
          { role: "user", content: user_prompt },
        ],
        temperature: 1,
      });

      let svgText = response.choices[0]?.message?.content ?? "";

      // Strip markdown code fences the model may add despite instructions.
      svgText = svgText.replace(/^```(?:svg|xml)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

      if (!svgText.startsWith("<svg")) {
        throw new Error("Model did not return valid SVG markup.");
      }

      capturedSvgText = svgText;
      return "SVG generated successfully.";
    },
  });

  const fetchLogoTool = tool({
    name: "fetch_logo",
    description:
      "Download the actual brand logo file from storage. Call this when the user's request involves the company logo, brand mark, wordmark, or company symbol. MUST be called before generate_svg.",
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

      // Normalise to PNG for reliable base64 embedding in SVG <image> elements.
      capturedLogoBuffer = await sharp(Buffer.from(await data.arrayBuffer())).png().toBuffer();

      return "Logo fetched successfully.";
    },
  });

  const attachLogoToSvgTool = tool({
    name: "attach_logo_to_svg",
    description:
      "Embed the brand logo as a base64 <image> element into the generated SVG at the requested position. Must be called after fetch_logo and generate_svg.",
    parameters: z.object({
      position: z
        .enum(["top-left", "top-right", "bottom-left", "bottom-right", "center"])
        .default("bottom-right")
        .describe("Where to place the logo within the SVG canvas"),
    }),
    async execute({ position }) {
      if (!capturedSvgText) throw new Error("generate_svg must be called first.");
      if (!capturedLogoBuffer) throw new Error("fetch_logo must be called before attach_logo_to_svg.");

      // Parse canvas dimensions — prefer viewBox, fall back to width/height attributes.
      const viewBoxMatch = /viewBox=["']\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*["']/.exec(
        capturedSvgText,
      );
      const widthMatch = /<svg[^>]*\swidth=["']([\d.]+)["']/.exec(capturedSvgText);
      const heightMatch = /<svg[^>]*\sheight=["']([\d.]+)["']/.exec(capturedSvgText);

      let canvasW = 1024;
      let canvasH = 1024;
      if (viewBoxMatch) {
        canvasW = Number(viewBoxMatch[1]);
        canvasH = Number(viewBoxMatch[2]);
      } else {
        if (widthMatch) canvasW = Number(widthMatch[1]);
        if (heightMatch) canvasH = Number(heightMatch[1]);
      }

      // Resize logo to ~20% of canvas width, preserving aspect ratio.
      const logoMaxSize = Math.round(canvasW * 0.2);
      const padding = Math.round(canvasW * 0.04);

      const resizedLogo = await sharp(capturedLogoBuffer)
        .resize(logoMaxSize, logoMaxSize, { fit: "inside" })
        .png()
        .toBuffer();

      const { width: logoW = logoMaxSize, height: logoH = logoMaxSize } =
        await sharp(resizedLogo).metadata();

      let x: number, y: number;
      switch (position) {
        case "top-left":
          x = padding;
          y = padding;
          break;
        case "top-right":
          x = canvasW - logoW - padding;
          y = padding;
          break;
        case "bottom-left":
          x = padding;
          y = canvasH - logoH - padding;
          break;
        case "center":
          x = Math.round((canvasW - logoW) / 2);
          y = Math.round((canvasH - logoH) / 2);
          break;
        case "bottom-right":
        default:
          x = canvasW - logoW - padding;
          y = canvasH - logoH - padding;
      }

      const base64Logo = resizedLogo.toString("base64");
      const imageElement = `  <image href="data:image/png;base64,${base64Logo}" x="${x}" y="${y}" width="${logoW}" height="${logoH}" preserveAspectRatio="xMidYMid meet"/>`;

      // Inject the logo <image> element just before the closing </svg> tag.
      capturedSvgText = capturedSvgText.replace(/<\/svg>\s*$/, `\n${imageElement}\n</svg>`);

      return "Logo embedded into SVG.";
    },
  });

  const uploadSvgTool = tool({
    name: "upload_svg",
    description:
      "Upload the final SVG to storage and return a signed URL. Always call this as the last step.",
    parameters: z.object({}),
    async execute() {
      if (!capturedSvgText) throw new Error("generate_svg must be called first.");

      const filename = `${crypto.randomUUID()}.svg`;
      const storagePath = `temp/${DEFAULT_ORG_ID}/${filename}`;
      const svgBuffer = Buffer.from(capturedSvgText, "utf-8");

      const { error: uploadError } = await supabase.storage
        .from(SUPABASE_BUCKET_NAME)
        .upload(storagePath, svgBuffer, { contentType: "image/svg+xml", upsert: false });

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
    name: "Brand Illustration SVG Creator",
    instructions: AGENT_TOOL_INSTRUCTIONS,
    model: MODEL,
    tools: [
      fetchBrandContextTool,
      generateSvgTool,
      fetchLogoTool,
      attachLogoToSvgTool,
      uploadSvgTool,
    ],
  });
}
