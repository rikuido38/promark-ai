import { Agent, run, tool } from "@openai/agents";
import { z } from "zod";
import OpenAI from "openai";
import type { BrandVisualSettings, IllustrationSettings } from "@/types/settings";
import type { IllustrationAnalysisResults } from "@/types/brand-context";

const MODEL = "gpt-5.2";

// ── Private LLM helper ────────────────────────────────────────────────────────
// Tools call chat.completions directly — no Agent overhead for sub-analyses.

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

async function callVisionLLM(
  systemPrompt: string,
  userText: string,
  imageUrls: string[],
): Promise<string> {
  const openai = getOpenAI();

  const userContent: OpenAI.ChatCompletionContentPart[] =
    imageUrls.length === 0
      ? [{ type: "text", text: userText }]
      : [
          { type: "text", text: userText },
          ...imageUrls.map((url) => ({
            type: "image_url" as const,
            image_url: { url, detail: "auto" as const },
          })),
        ];

  const resp = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
  });

  return resp.choices[0]?.message?.content ?? "";
}

// ── System prompts ────────────────────────────────────────────────────────────

const STYLE_SYSTEM = `You are an expert illustration style analyst.
Examine the provided illustration image(s) and describe the visual style in
precise, actionable terms for an AI image generation prompt.
Focus on: line quality and stroke weight, character proportions, shading
technique (flat / cel / gradient), level of detail, geometric vs organic
shapes, and overall flatness vs depth.
Output ONLY the style analysis text. Be specific and concise. Max 150 words.`;

const PALETTE_SYSTEM = `You are an expert color analyst specialising in illustration.
Examine the provided palette sample image(s) and describe how the colors are
applied in context — not just the hex codes, but the relationships between them.
Note: saturation levels, contrast ratios, how shadow/highlight colors relate
to base colors, and any distinctive color harmony patterns.
Output ONLY the palette analysis text. Be specific and concise. Max 150 words.`;

const USAGE_SYSTEM = `You are an expert illustration analyst.
Examine the provided usage example image and describe its composition, context,
and usage pattern in actionable terms.
Focus on: scene type, character placement, background treatment, mood, and
what makes this usage context distinctive.
Output ONLY the usage analysis text. Be specific and concise. Max 100 words.`;

const COMPILER_INSTRUCTIONS = `You are a brand visual analyst.
You receive a JSON object describing a brand's visual settings.

Steps you MUST follow in order:
1. Call analyze_illustration_style with the style_sample_urls from the input.
2. Call analyze_illustration_palette with the palette_sample_urls from the input.
3. For each item in illustration.usages, call analyze_usage_context with its
   index, description, and image_url.
4. Once ALL tool calls are complete, output ONLY a valid JSON object with no
   markdown fences or explanation:
{
  "styleAnalysis": "<result from analyze_illustration_style>",
  "paletteAnalysis": "<result from analyze_illustration_palette>",
  "usageAnalyses": ["<result for index 0>", "<result for index 1>", ...]
}`;

// ── Public types ──────────────────────────────────────────────────────────────

export type CompilerInput = {
  brand: BrandVisualSettings | null;
  illustration: IllustrationSettings | null;
  /** Map from raw storage path → signed URL, pre-resolved by the caller. */
  signedUrls: Map<string, string>;
};

export type CompilerOutput = {
  analyses: IllustrationAnalysisResults;
};

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Runs the Brand Context Compiler agent.
 *
 * The agent invokes three vision tools (style, palette, usage) — each is a
 * direct OpenAI chat completion, not a sub-agent — then synthesises the
 * results into a brand system prompt.
 *
 * Returns both the compiled system prompt AND the raw analysis strings so the
 * caller can persist them alongside the context document.
 */
export async function runBrandContextCompiler(
  input: CompilerInput,
): Promise<CompilerOutput> {
  const { brand, illustration, signedUrls } = input;

  const resolve = (path: string | undefined | null) =>
    path ? (signedUrls.get(path) ?? "") : "";

  // Per-call captures so tool results are scoped to this invocation
  const captures = {
    style: "",
    palette: "",
    usages: [] as string[],
  };

  // ── Tool definitions ──────────────────────────────────────────────────────

  const analyzeStyleTool = tool({
    name: "analyze_illustration_style",
    description:
      "Analyse illustration style from style sample images. Call once with all style_sample_urls.",
    parameters: z.object({
      image_urls: z.array(z.string()).describe("Signed URLs of style sample images"),
    }),
    async execute({ image_urls }) {
      const analysis = await callVisionLLM(
        STYLE_SYSTEM,
        `Analyse the illustration style shown in ${image_urls.length} image(s).`,
        image_urls,
      );
      captures.style = analysis;
      return analysis;
    },
  });

  const analyzePaletteTool = tool({
    name: "analyze_illustration_palette",
    description:
      "Analyse the illustration colour palette from palette sample images. Call once with all palette_sample_urls.",
    parameters: z.object({
      image_urls: z.array(z.string()).describe("Signed URLs of palette sample images"),
    }),
    async execute({ image_urls }) {
      const analysis = await callVisionLLM(
        PALETTE_SYSTEM,
        `Analyse the colour palette usage shown in ${image_urls.length} image(s).`,
        image_urls,
      );
      captures.palette = analysis;
      return analysis;
    },
  });

  const analyzeUsageContextTool = tool({
    name: "analyze_usage_context",
    description:
      "Analyse a single usage context example. Call once per item in illustration.usages; pass the 0-based index so results remain ordered.",
    parameters: z.object({
      index: z.number().describe("0-based index of this usage in the usages array"),
      description: z.string().describe("The usage description text"),
      image_url: z.string().nullable().describe("Signed URL of the usage sample image, or null"),
    }),
    async execute({ index, description, image_url }) {
      const userText = image_url
        ? `Usage context: "${description}". Analyse the usage sample image provided.`
        : `Usage context: "${description}". No image provided — return an empty string.`;
      const analysis = image_url
        ? await callVisionLLM(USAGE_SYSTEM, userText, [image_url])
        : "";
      captures.usages[index] = analysis;
      return analysis;
    },
  });

  // ── Build agent input JSON ────────────────────────────────────────────────

  const styleSampleUrls = (illustration?.style_samples ?? [])
    .map((m) => resolve(m.url))
    .filter(Boolean);

  const paletteSampleUrls = (illustration?.colour_palette?.sample_images ?? [])
    .map((m) => resolve(m.url))
    .filter(Boolean);

  const usages = (illustration?.usages ?? []).map((u, i) => ({
    index: i,
    description: u.description,
    image_url: u.sample ? resolve(u.sample.url) || null : null,
  }));

  const agentInput = JSON.stringify(
    {
      brand,
      illustration: illustration
        ? {
            style_description: illustration.style_description,
            style_sample_urls: styleSampleUrls,
            palette_sample_urls: paletteSampleUrls,
            palette_colors: {
              outline_colors: illustration.colour_palette?.outline_colors ?? [],
              supporting_colors: illustration.colour_palette?.supporting_colors ?? [],
              skin_tone_colors: illustration.colour_palette?.skin_tone_colors ?? [],
              hair_colors: illustration.colour_palette?.hair_colors ?? [],
              background_colors: illustration.colour_palette?.background_colors ?? [],
              shadow_colors: illustration.colour_palette?.shadow_colors ?? [],
            },
            usages,
          }
        : null,
    },
    null,
    2,
  );

  // ── Run ───────────────────────────────────────────────────────────────────

  const compilerAgent = new Agent({
    name: "Brand Context Compiler",
    instructions: COMPILER_INSTRUCTIONS,
    model: MODEL,
    tools: [analyzeStyleTool, analyzePaletteTool, analyzeUsageContextTool],
  });

  const result = await run(compilerAgent, agentInput);

  // Parse JSON analyses from final output; fall back to captured values
  const raw =
    typeof result.finalOutput === "string"
      ? result.finalOutput
      : JSON.stringify(result.finalOutput ?? "{}");

  let parsed: Partial<IllustrationAnalysisResults> = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    // ignore parse error; captures will be used below
  }

  const usageAnalyses = Array.from(
    { length: usages.length },
    (_, i) =>
      (parsed.usageAnalyses?.[i] ?? captures.usages[i] ?? "") as string,
  );

  return {
    analyses: {
      styleAnalysis: parsed.styleAnalysis ?? captures.style,
      paletteAnalysis: parsed.paletteAnalysis ?? captures.palette,
      usageAnalyses,
    },
  };
}
