import { Agent, run, tool } from "@openai/agents";
import { z } from "zod";
import OpenAI from "openai";
import type { BrandVisualSettings, IllustrationSettings } from "@/types/settings";
import type { IllustrationAnalysisResults } from "@/types/brand-context";

const MODEL = "gpt-5.4";

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

const GUIDELINE_SYSTEM = `You are an expert illustration style analyst.
Examine the provided guideline sample image and describe what style rule or
constraint it demonstrates in actionable terms.
Output ONLY the guideline analysis text. Be specific and concise. Max 80 words.`;

const COMPILER_INSTRUCTIONS = `You are a brand visual analyst.
You receive a JSON object describing a brand's visual settings.

Steps you MUST follow in order:
1. Call analyze_illustration_palette with the sample_image_urls from illustration.brand_colour_palette.
2. For each item in illustration.usages, call analyze_usage_context with its
   index, description, and image_url.
3. For each item in illustration.characters, call analyze_character with its
   char_index, name, reference_image_url, and the full guidelines array.
4. Once ALL tool calls are complete, output ONLY a valid JSON object with no
   markdown fences or explanation:
{
  "paletteAnalysis": "<result from analyze_illustration_palette>",
  "usageAnalyses": ["<result for index 0>", "<result for index 1>", ...],
  "characterAnalyses": [
    { "guidelineAnalyses": ["...", null, ...] },
    ...
  ]
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
    palette: "",
    usages: [] as string[],
    characters: [] as Array<{ guidelineAnalyses: (string | null)[] }>,
  };

  // ── Tool definitions ──────────────────────────────────────────────────────

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

  const analyzeCharacterTool = tool({
    name: "analyze_character",
    description:
      "Analyse a character's reference image and each of their guideline sample images. Call once per character in illustration.characters.",
    parameters: z.object({
      char_index: z.number().describe("0-based index of this character in the characters array"),
      name: z.string().describe("Character name"),
      reference_image_url: z.string().nullable().describe("Signed URL of the reference image, or null"),
      guidelines: z
        .array(
          z.object({
            index: z.number().describe("0-based index of this guideline within the character"),
            title: z.string().describe("Guideline title"),
            description: z.string().describe("Guideline description"),
            image_url: z.string().nullable().describe("Signed URL of the guideline sample image, or null"),
          }),
        )
        .describe("All guidelines belonging to this character"),
    }),
    async execute({ char_index, guidelines }) {
      const guidelineAnalyses: (string | null)[] = [];
      for (const gl of guidelines) {
        guidelineAnalyses[gl.index] = gl.image_url
          ? await callVisionLLM(
              GUIDELINE_SYSTEM,
              `Guideline "${gl.title}": ${gl.description}. Analyse the sample image.`,
              [gl.image_url],
            )
          : null;
      }

      captures.characters[char_index] = { guidelineAnalyses };
      return JSON.stringify({ guidelineAnalyses });
    },
  });

  // ── Build agent input JSON ────────────────────────────────────────────────

  const paletteSampleUrls = (illustration?.colour_palette?.sample_images ?? [])
    .map((m) => resolve(m.url))
    .filter(Boolean);

  const usages = (illustration?.usages ?? []).map((u, i) => ({
    index: i,
    description: u.description,
    image_url: u.sample ? resolve(u.sample.url) || null : null,
  }));

  const characters = (illustration?.characters ?? []).map((c, i) => ({
    char_index: i,
    name: c.name,
    reference_image_url: c.reference_image ? resolve(c.reference_image.url) || null : null,
    guidelines: c.guidelines.map((g, gi) => ({
      index: gi,
      title: g.title,
      description: g.description,
      image_url: g.sample ? resolve(g.sample.url) || null : null,
    })),
  }));

  const agentInput = JSON.stringify(
    {
      brand,
      illustration: illustration
        ? {
            style_description: illustration.style_description,
            brand_colour_palette: {
              palette_user_description: illustration.palette_description ?? "",
              sample_image_urls: paletteSampleUrls,
            },
            facial_colour_palette: {
              hair_colors: illustration.colour_palette?.hair_colors ?? [],
              skin_tone_colors: illustration.colour_palette?.skin_tone_colors ?? [],
              shadow_colors: illustration.colour_palette?.shadow_colors ?? [],
              facial_feature_colors: illustration.colour_palette?.facial_feature_colors ?? [],
            },
            usages,
            characters,
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
    tools: [analyzePaletteTool, analyzeUsageContextTool, analyzeCharacterTool],
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

  const characterAnalyses = Array.from(
    { length: characters.length },
    (_, i) => ({
      guidelineAnalyses: Array.from(
        { length: characters[i].guidelines.length },
        (_, gi) =>
          parsed.characterAnalyses?.[i]?.guidelineAnalyses?.[gi] ??
          captures.characters[i]?.guidelineAnalyses?.[gi] ??
          null,
      ),
    }),
  );

  return {
    analyses: {
      paletteAnalysis: parsed.paletteAnalysis ?? captures.palette,
      usageAnalyses,
      characterAnalyses,
    },
  };
}
