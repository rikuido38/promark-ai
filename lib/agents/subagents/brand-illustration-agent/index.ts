import { Agent, tool } from "@openai/agents";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Mustache from "mustache";
import OpenAI from "openai";
import Fuse from "fuse.js";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BrandIllustrationContext } from "@/types/brand-context";
import type { PaletteColor } from "@/types/settings";
import { SUPABASE_BUCKET_NAME, DEFAULT_ORG_ID } from "@/utils/constants";
import { getBrandContext } from "@/services/brand-context";

const MODEL = "gpt-5.4";

// ── Prompt templates ─────────────────────────────────────────────────────────

const PROMPTS_DIR = join(process.cwd(), "lib", "agents", "subagents", "brand-illustration-agent", "prompts");

function loadTemplate(filename: string): string {
  return readFileSync(join(PROMPTS_DIR, filename), "utf-8");
}

const AGENT_INSTRUCTIONS = Mustache.render(loadTemplate("agent-instructions.mustache"), {});

// ── Types ─────────────────────────────────────────────────────────────────────

type CapturedCharacter = {
  name: string;
  base64: string;
  mediaType: string;
  guidelines: Array<{
    title: string;
    description: string;
    sample_analysis: string | null;
    sample_image_url: string | null;
  }>;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatColors(colors: PaletteColor[]): string {
  return colors.map((c) => (c.description ? `${c.hex} (${c.description})` : c.hex)).join(", ");
}

// Splits a prompt into unique meaningful words to use as individual Fuse.js queries.
function extractSearchTokens(prompt: string): string[] {
  const stopWords = new Set([
    "the", "a", "an", "and", "or", "in", "on", "of", "to", "with",
    "for", "is", "are", "was", "were", "be", "been", "have", "has",
    "had", "do", "does", "did", "not", "but", "at", "by", "from",
    "this", "that", "it", "its", "keep", "rest", "same", "just",
  ]);
  return [
    ...new Set(
      prompt
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 3 && !stopWords.has(w)),
    ),
  ];
}

async function downloadAsPng(url: string): Promise<Buffer | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    return await sharp(Buffer.from(await resp.arrayBuffer())).png().toBuffer();
  } catch {
    return null;
  }
}

type ScoredGuideline = { gl: CapturedCharacter["guidelines"][number]; score: number };

function scoreGuidelinesForChar(
  char: CapturedCharacter,
  tokens: string[],
): ScoredGuideline[] {
  const fuse = new Fuse(char.guidelines, {
    keys: ["title", "description", "sample_analysis"],
    threshold: 1,
    includeScore: true,
  });

  const bestScores = new Map<number, number>();
  for (const token of tokens) {
    for (const match of fuse.search(token)) {
      const idx = char.guidelines.indexOf(match.item);
      const prev = bestScores.get(idx) ?? 1;
      if ((match.score ?? 1) < prev) bestScores.set(idx, match.score ?? 1);
    }
  }

  return char.guidelines
    .map((gl, idx) => ({ gl, score: bestScores.get(idx) ?? 1 }))
    .sort((a, b) => a.score - b.score);
}

async function downloadMatchedGuidelines(
  charName: string,
  matches: ScoredGuideline[],
): Promise<Array<{ base64: string; mediaType: string; label: string }>> {
  const results: Array<{ base64: string; mediaType: string; label: string }> = [];
  for (const { gl } of matches) {
    if (!gl.sample_image_url) continue;
    const buf = await downloadAsPng(gl.sample_image_url);
    if (!buf) {
      console.log(`[BrandIllustrationAgent] fuzzySearch: failed to download guideline image for "${gl.title}"`);
      continue;
    }
    results.push({
      base64: buf.toString("base64"),
      mediaType: "image/png",
      label: `Guideline "${gl.title}" for character "${charName}"`,
    });
  }
  return results;
}

async function fuzzyMatchGuidelineImages(
  chars: CapturedCharacter[],
  userPrompt: string,
): Promise<Array<{ base64: string; mediaType: string; label: string }>> {
  const results: Array<{ base64: string; mediaType: string; label: string }> = [];
  const tokens = extractSearchTokens(userPrompt);

  console.log("[BrandIllustrationAgent] fuzzySearch: query =", JSON.stringify(userPrompt));
  console.log("[BrandIllustrationAgent] fuzzySearch: tokens =", tokens);
  console.log(
    "[BrandIllustrationAgent] fuzzySearch: characters with guidelines =",
    chars.map((c) => ({
      name: c.name,
      guidelines: c.guidelines.map((g) => ({ title: g.title, hasSampleImage: !!g.sample_image_url })),
    })),
  );

  for (const char of chars) {
    if (char.guidelines.length === 0) continue;

    const scored = scoreGuidelinesForChar(char, tokens);
    console.log(
      `[BrandIllustrationAgent] fuzzySearch: "${char.name}" best scores:`,
      scored.map((s) => ({ title: s.gl.title, score: s.score, hasSampleImage: !!s.gl.sample_image_url })),
    );

    const matches = scored.filter(({ score }) => score <= 0.4);
    console.log(`[BrandIllustrationAgent] fuzzySearch: "${char.name}" matched ${matches.length} guideline(s) at threshold 0.4`);

    const downloaded = await downloadMatchedGuidelines(char.name, matches);
    results.push(...downloaded);
  }

  console.log(`[BrandIllustrationAgent] fuzzySearch: ${results.length} guideline image(s) matched and downloaded.`);
  return results;
}

function buildIllustrationPrompt(
  ill: NonNullable<BrandIllustrationContext["illustration"]>,
  brand: BrandIllustrationContext["brand"],
  relevantChars: CapturedCharacter[],
  userPrompt: string,
  imageLabels: string[],
): string {
  const fp = ill.facial_colour_palette;

  const view = {
    style_description: ill.style_description || "Clean vector illustration style.",
    palette_user_description: ill.brand_colour_palette.palette_user_description || "",
    palette_style_prompt: ill.brand_colour_palette.palette_style_prompt || "",
    primary_colors: (brand.primary_colors ?? []).join(", "),
    secondary_colors: (brand.secondary_colors ?? []).join(", "),
    primary_color_guidelines: brand.primary_color_guidelines || "",
    hair_colors: fp.hair_colors.length ? formatColors(fp.hair_colors) : "",
    skin_tone_colors: fp.skin_tone_colors.length ? formatColors(fp.skin_tone_colors) : "",
    shadow_colors: fp.shadow_colors.length ? formatColors(fp.shadow_colors) : "",
    facial_feature_colors: fp.facial_feature_colors.length ? formatColors(fp.facial_feature_colors) : "",
    user_prompt: userPrompt,
    has_image_labels: imageLabels.length > 0,
    image_labels: imageLabels,
  };

  // suppress unused param lint — relevantChars may be used in future extensions
  void relevantChars;

  return Mustache.render(loadTemplate("illustration-prompt.mustache"), view).trim();
}

/**
 * Creates the Brand Illustration Agent bound to a Supabase client.
 *
 * Pipeline:
 *   fetch_brand_context
 *   → [fetch_character_references]   (if characters are mentioned)
 *   → generate_illustration           (builds prompt inline from brand context;
 *                                      uses fuse.js to find matching guideline images;
 *                                      image order: char ref → guideline → user sample)
 *   → upload_illustration
 */
export function createBrandIllustrationAgent(
  supabase: SupabaseClient,
  options?: { imageModel?: string; sampleImageUrls?: string[]; userMessage?: string },
): Agent {
  const imageModel = options?.imageModel ?? "gpt-image-2";
  // The original user message is used verbatim as the scene prompt, bypassing
  // any LLM rewriting of the user_prompt parameter.
  const originalUserMessage = options?.userMessage ?? "";
  // Pre-loaded sample URLs from the API call (chat attachments). These are
  // merged with any sample_image_urls the LLM passes to generate_illustration.
  const preloadedSampleUrls: string[] = options?.sampleImageUrls ?? [];
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Per-invocation state shared across tool calls via closure.
  let capturedContext: BrandIllustrationContext | null = null;
  const capturedCharacters: CapturedCharacter[] = [];
  let capturedImageBuffer: Buffer | null = null;

  // ── Tool: fetch_brand_context ─────────────────────────────────────────────

  const fetchBrandContextTool = tool({
    name: "fetch_brand_context",
    description:
      "Load the compiled brand illustration context. Must be called first before any other tool.",
    parameters: z.object({}),
    async execute() {
      capturedContext = await getBrandContext(supabase);
      if (!capturedContext) {
        throw new Error(
          "No compiled brand context found. Please compile brand context before generating illustrations.",
        );
      }
      // Return only decision-making fields; heavy data stays in the closure.
      return JSON.stringify({
        characters: (capturedContext.illustration?.characters ?? []).map((c) => ({
          name: c.name,
          ageGroup: c.age_group,
          hasReferenceImage: !!c.reference_image_url,
          guidelineCount: c.guidelines.length,
        })),
        brand: {
          primaryColors: capturedContext.brand.primary_colors,
          secondaryColors: capturedContext.brand.secondary_colors,
        },
      });
    },
  });

  // ── Tool: fetch_character_references ─────────────────────────────────────

  const fetchCharacterReferencesTool = tool({
    name: "fetch_character_references",
    description:
      "Download reference images for named brand characters. Call when the user's request mentions specific brand characters. Reference images fix facial features, colours, and proportions for the illustration.",
    parameters: z.object({
      character_names: z
        .array(z.string())
        .describe("Exact names of brand characters to fetch reference images for"),
    }),
    async execute({ character_names }) {
      if (!capturedContext) throw new Error("fetch_brand_context must be called first.");

      const allChars = capturedContext.illustration?.characters ?? [];
      const results: string[] = [];

      for (const name of character_names) {
        const char = allChars.find(
          (c) => c.name.toLowerCase() === name.toLowerCase(),
        );

        if (!char) {
          results.push(`"${name}": not found in brand context — skipped.`);
          continue;
        }

        if (capturedCharacters.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
          results.push(`"${name}": already loaded.`);
          continue;
        }

        const guidelinesData = char.guidelines.map((g) => ({
          title: g.title,
          description: g.description,
          sample_analysis: g.sample_analysis ?? null,
          sample_image_url: g.sample_image_url,
        }));

        if (!char.reference_image_url) {
          capturedCharacters.push({ name: char.name, base64: "", mediaType: "", guidelines: guidelinesData });
          results.push(`"${name}": no reference image — character data loaded.`);
          continue;
        }

        const resp = await fetch(char.reference_image_url);
        if (!resp.ok) {
          capturedCharacters.push({ name: char.name, base64: "", mediaType: "", guidelines: guidelinesData });
          results.push(
            `"${name}": failed to download reference image (HTTP ${resp.status}) — character data loaded without image.`,
          );
          continue;
        }

        const imgBuffer = await sharp(Buffer.from(await resp.arrayBuffer()))
          .png()
          .toBuffer();

        capturedCharacters.push({
          name: char.name,
          base64: imgBuffer.toString("base64"),
          mediaType: "image/png",
          guidelines: guidelinesData,
        });

        results.push(`"${name}": reference image loaded.`);
      }

      return results.join("\n");
    },
  });

  // ── Tool: generate_illustration ───────────────────────────────────────────

  const generateIllustrationTool = tool({
    name: "generate_illustration",
    description:
      "Generate the on-brand vector illustration. Must be called after fetch_brand_context (and fetch_character_references if characters are requested).",
    parameters: z.object({
      user_prompt: z
        .string()
        .describe(
          "The user's message copied verbatim (typo fixes only). Do NOT rewrite, expand, or add any character descriptions, roles, style instructions, or composition details.",
        ),
      character_names: z
        .array(z.string())
        .default([])
        .describe(
          "Brand character names to include. Must match those loaded with fetch_character_references.",
        ),
      sample_image_urls: z
        .array(z.string())
        .default([])
        .describe(
          "URLs of images the user attached as direction or behaviour samples. These come after character reference images.",
        ),
    }),
    async execute({ user_prompt, character_names, sample_image_urls }) {
      if (!capturedContext?.illustration) {
        throw new Error("fetch_brand_context must be called first.");
      }

      // Always use the original user message verbatim; ignore LLM-provided value.
      const scenePrompt = originalUserMessage || user_prompt;
      const ill = capturedContext.illustration;
      const brand = capturedContext.brand;

      const relevantChars = capturedCharacters.filter((c) =>
        character_names.some((n) => n.toLowerCase() === c.name.toLowerCase()),
      );

      const charsWithImages = relevantChars.filter((c) => !!c.base64);

      // Fuzzy-match character guidelines against the original user message.
      const guidelineImages = await fuzzyMatchGuidelineImages(relevantChars, scenePrompt);

      // Merge pre-loaded attachments with any LLM-provided URLs, deduplicating.
      const allSampleUrls = [
        ...preloadedSampleUrls,
        ...sample_image_urls.filter((u) => !preloadedSampleUrls.includes(u)),
      ];

      const sampleImages: Array<{ base64: string; mediaType: string }> = [];
      for (const url of allSampleUrls) {
        const buf = await downloadAsPng(url);
        if (buf) sampleImages.push({ base64: buf.toString("base64"), mediaType: "image/png" });
      }

      console.log("[BrandIllustrationAgent] generate_illustration: image summary", {
        originalUserMessage,
        scenePrompt,
        character_names,
        preloadedSampleUrls,
        llmSampleImageUrls: sample_image_urls,
        allSampleUrls,
        charsWithImages: charsWithImages.map((c) => c.name),
        guidelineImagesCount: guidelineImages.length,
        sampleImagesDownloaded: sampleImages.length,
      });
      let imageIdx = 1;
      const imageLabels: string[] = [
        ...charsWithImages.map(
          (c) => `Image ${imageIdx++}: Character reference for "${c.name}" — match appearance, colours, and proportions exactly.`,
        ),
        ...guidelineImages.map(
          (g) => `Image ${imageIdx++}: ${g.label} — follow this style guideline.`,
        ),
        ...sampleImages.map(
          () => `Image ${imageIdx++}: User direction sample — use for pose, scene, or composition inspiration only.`,
        ),
      ];

      const fullPrompt = buildIllustrationPrompt(ill, brand, relevantChars, scenePrompt, imageLabels);

      // Image order: 1) character refs, 2) guideline images, 3) user samples
      const inputContent: Array<Record<string, unknown>> = [
        { type: "input_text", text: fullPrompt },
        ...charsWithImages.map((c) => ({
          type: "input_image",
          image_url: `data:${c.mediaType};base64,${c.base64}`,
        })),
        ...guidelineImages.map((g) => ({
          type: "input_image",
          image_url: `data:${g.mediaType};base64,${g.base64}`,
        })),
        ...sampleImages.map((s) => ({
          type: "input_image",
          image_url: `data:${s.mediaType};base64,${s.base64}`,
        })),
      ];

      const requestPayload = {
        model: "gpt-5.4",
        input: [{ role: "user", content: inputContent }],
        tools: [{ type: "image_generation", model: imageModel, quality: "high" }],
      };
      console.log("[BrandIllustrationAgent] responses.create payload:", JSON.stringify(
        requestPayload,
        (key, value) => key === "image_url" && typeof value === "string" && value.startsWith("data:")
          ? `${value.slice(0, 60)}…[truncated]`
          : value,
        2,
      ));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (openai as any).responses.create(requestPayload);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const imageOutput = (response.output as any[])?.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (o: any) => o.type === "image_generation_call",
      );

      const imageB64: string = imageOutput?.result ?? imageOutput?.image ?? "";
      if (!imageB64) throw new Error("Responses API returned no image data.");

      capturedImageBuffer = Buffer.from(imageB64, "base64");

      return "Illustration generated successfully.";
    },
  });

  // ── Tool: upload_illustration ─────────────────────────────────────────────

  const uploadIllustrationTool = tool({
    name: "upload_illustration",
    description:
      "Compress and upload the final illustration to storage, then return a signed URL. Always call this as the last step.",
    parameters: z.object({}),
    async execute() {
      if (!capturedImageBuffer) throw new Error("generate_illustration must be called first.");

      const compressed = await sharp(capturedImageBuffer)
        .png({ effort: 10, adaptiveFiltering: true })
        .toBuffer();

      const filename = `${crypto.randomUUID()}.png`;
      const storagePath = `temp/${DEFAULT_ORG_ID}/${filename}`;

      const { error: uploadError } = await supabase.storage
        .from(SUPABASE_BUCKET_NAME)
        .upload(storagePath, compressed, { contentType: "image/png", upsert: false });

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

  // ── Build agent ───────────────────────────────────────────────────────────

  return new Agent({
    name: "Brand Illustration Creator",
    instructions: AGENT_INSTRUCTIONS,
    model: MODEL,
    tools: [
      fetchBrandContextTool,
      fetchCharacterReferencesTool,
      generateIllustrationTool,
      uploadIllustrationTool,
    ],
    modelSettings: {
      reasoning: { effort: "none" },
    },
  });
}
