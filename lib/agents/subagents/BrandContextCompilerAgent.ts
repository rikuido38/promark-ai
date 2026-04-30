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

const CHARACTER_SYSTEM = `You are an expert illustration character analyst.
Examine the provided character reference image and extract precise, actionable
traits for AI image generation.
Focus on: distinctive physical features, art style consistency markers, key
design elements, color usage on this character, and any unique stylistic details.
Output ONLY the character analysis text. Be specific and concise. Max 120 words.`;

const GUIDELINE_SYSTEM = `You are an expert illustration style analyst.
Examine the provided guideline sample image and describe what style rule or
constraint it demonstrates in actionable terms.
Output ONLY the guideline analysis text. Be specific and concise. Max 80 words.`;

const ILLUSTRATION_STYLE_PROMPT_SYSTEM = `You are a brand illustration prompt engineer.
You receive analysis data from a full brand illustration audit.
Synthesise everything into a single, actionable AI image generation prompt.
The prompt must be self-contained and ready to paste directly into an image model.
Cover: art style, character proportions, shading technique, line quality,
brand color rules with hex codes, palette harmony, facial color rules,
compositional guidelines, mood and tone.
Do NOT include character-specific descriptions — those are separate.
Output ONLY the generation prompt text. Max 300 words. No headers or explanation.`;

const CHARACTER_PROMPT_SYSTEM = `You are a brand character prompt engineer.
You receive a character's details and visual analysis results.
Write a concise, self-contained character description prompt that can be appended
to the master illustration style prompt to generate a consistent rendering of this character.
Include: character name, age group, key physical features, distinctive visual traits,
color specifics, and any style constraint notes from the guidelines.
Output ONLY the character description prompt. Max 150 words. No headers or explanation.`;

const COMPILER_INSTRUCTIONS = `You are a brand visual analyst.
You receive a JSON object describing a brand's visual settings.

Steps you MUST follow in order:
1. Call analyze_illustration_style with the style_image_urls from the input.
2. Call analyze_illustration_palette with the sample_image_urls from illustration.brand_colour_palette.
3. For each item in illustration.usages, call analyze_usage_context with its
   index, description, and image_url.
4. For each item in illustration.characters, call analyze_character with its
   char_index, name, reference_image_url, and the full guidelines array.
5. Once all analyze_* calls are done, call generate_illustration_style_prompt with:
   - style_description from illustration.style_description
   - style_analysis from the analyze_illustration_style result
   - palette_user_description from illustration.brand_colour_palette.palette_user_description
   - palette_style_prompt from the analyze_illustration_palette result
   - facial_colour_palette as JSON.stringify(illustration.facial_colour_palette)
   - brand_colors as JSON.stringify({ primary_colors: brand.primary_colors, secondary_colors: brand.secondary_colors, primary_color_guidelines: brand.primary_color_guidelines })
   - usage_analyses as the array of analyze_usage_context results in order
6. For each item in illustration.characters (same order as step 4), call generate_character_prompt with:
   - char_index (0-based)
   - name, age_group, characteristics from the character object
   - reference_analysis from the analyze_character result for this character
   - guidelines array: for each guideline pass title, description, and sample_analysis
     from the matching guidelineAnalyses entry (null if not analysed)
7. Once ALL tool calls are complete, output ONLY a valid JSON object with no
   markdown fences or explanation:
{
  "styleAnalysis": "<result from analyze_illustration_style>",
  "paletteAnalysis": "<result from analyze_illustration_palette>",
  "usageAnalyses": ["<result for index 0>", "<result for index 1>", ...],
  "characterAnalyses": [
    { "referenceAnalysis": "...", "guidelineAnalyses": ["...", null, ...] },
    ...
  ],
  "illustrationStylePrompt": "<result from generate_illustration_style_prompt>",
  "characterPrompts": ["<result for char 0>", "<result for char 1>", ...]
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
    characters: [] as Array<{ referenceAnalysis: string; guidelineAnalyses: (string | null)[] }>,
    illustrationStylePrompt: "",
    characterPrompts: [] as string[],
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
    async execute({ char_index, name, reference_image_url, guidelines }) {
      const referenceAnalysis = reference_image_url
        ? await callVisionLLM(
            CHARACTER_SYSTEM,
            `Character "${name}" — analyse the reference image.`,
            [reference_image_url],
          )
        : "";

      const guidelineAnalyses: (string | null)[] = [];
      for (const gl of guidelines) {
        guidelineAnalyses[gl.index] = gl.image_url
          ? await callVisionLLM(
              GUIDELINE_SYSTEM,
              `Guideline "${gl.title}" for "${name}": ${gl.description}. Analyse the sample image.`,
              [gl.image_url],
            )
          : null;
      }

      captures.characters[char_index] = { referenceAnalysis, guidelineAnalyses };
      return JSON.stringify({ referenceAnalysis, guidelineAnalyses });
    },
  });

  const generateIllustrationStylePromptTool = tool({
    name: "generate_illustration_style_prompt",
    description:
      "Synthesise all analysis results into a single master illustration style prompt. Call once after all analyze_* tools have been called.",
    parameters: z.object({
      style_description: z.string().describe("Brand illustration style description from settings"),
      style_analysis: z.string().describe("Result from analyze_illustration_style"),
      palette_user_description: z.string().describe("User description of the brand colour palette"),
      palette_style_prompt: z.string().describe("Result from analyze_illustration_palette"),
      facial_colour_palette: z.string().describe("JSON string of facial colour palette data"),
      brand_colors: z.string().describe("JSON string of brand primary and secondary color data"),
      usage_analyses: z.array(z.string()).describe("Results from analyze_usage_context"),
    }),
    async execute(params) {
      const context = [
        `STYLE DESCRIPTION: ${params.style_description}`,
        `STYLE ANALYSIS: ${params.style_analysis}`,
        `PALETTE USER DESCRIPTION: ${params.palette_user_description}`,
        `PALETTE STYLE ANALYSIS: ${params.palette_style_prompt}`,
        `FACIAL COLOUR PALETTE: ${params.facial_colour_palette}`,
        `BRAND COLORS: ${params.brand_colors}`,
        params.usage_analyses.length
          ? "USAGE EXAMPLES:\n" + params.usage_analyses.map((u, i) => `  ${i + 1}. ${u}`).join("\n")
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");
      const prompt = await callVisionLLM(ILLUSTRATION_STYLE_PROMPT_SYSTEM, context, []);
      captures.illustrationStylePrompt = prompt;
      return prompt;
    },
  });

  const generateCharacterPromptTool = tool({
    name: "generate_character_prompt",
    description:
      "Generate a character-specific illustration prompt. Call once per character after analyze_character.",
    parameters: z.object({
      char_index: z.number().describe("0-based index of this character"),
      name: z.string().describe("Character name"),
      age_group: z.string().describe("Character age group"),
      characteristics: z.string().describe("Character characteristics text"),
      reference_analysis: z.string().describe("Result from analyze_character for this character"),
      guidelines: z
        .array(
          z.object({
            title: z.string(),
            description: z.string(),
            sample_analysis: z.string().nullable(),
          }),
        )
        .describe("Character guidelines with any analysis results"),
    }),
    async execute({ char_index, name, age_group, characteristics, reference_analysis, guidelines }) {
      const context = [
        `CHARACTER: ${name} (${age_group})`,
        characteristics ? `CHARACTERISTICS: ${characteristics}` : "",
        reference_analysis ? `VISUAL ANALYSIS: ${reference_analysis}` : "",
        guidelines.length
          ? `GUIDELINES:\n${guidelines
              .map(
                (g) =>
                  `  - ${g.title}: ${g.description}${
                    g.sample_analysis ? ` [Analysis: ${g.sample_analysis}]` : ""
                  }`,
              )
              .join("\n")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
      const prompt = await callVisionLLM(CHARACTER_PROMPT_SYSTEM, context, []);
      captures.characterPrompts[char_index] = prompt;
      return prompt;
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
            style_image_urls: styleSampleUrls,
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
    tools: [analyzeStyleTool, analyzePaletteTool, analyzeUsageContextTool, analyzeCharacterTool, generateIllustrationStylePromptTool, generateCharacterPromptTool],
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
      referenceAnalysis:
        parsed.characterAnalyses?.[i]?.referenceAnalysis ??
        captures.characters[i]?.referenceAnalysis ??
        "",
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
      styleAnalysis: parsed.styleAnalysis ?? captures.style,
      paletteAnalysis: parsed.paletteAnalysis ?? captures.palette,
      usageAnalyses,
      characterAnalyses,
      illustrationStylePrompt: parsed.illustrationStylePrompt ?? captures.illustrationStylePrompt ?? "",
      characterPrompts: Array.from(
        { length: characters.length },
        (_, i) => parsed.characterPrompts?.[i] ?? captures.characterPrompts[i] ?? "",
      ),
    },
  };
}
