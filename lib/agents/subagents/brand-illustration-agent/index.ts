import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Mustache from "mustache";
import Fuse from "fuse.js";
import sharp from "sharp";
import { SeedDetailsSchema, SEED_DETAILS_SCHEMA_EXAMPLE } from "./seed-schema";
import { SUPABASE_BUCKET_NAME, DEFAULT_ORG_ID } from "@/utils/constants";
import { createStorageClient } from "@/utils/s3/storage";
import type { BrandIllustrationContext } from "@/types/brand-context";
import type { PaletteColor } from "@/types/settings";
import type { GenerationSettings } from "@/types/generation-settings";
import { getBrandContext } from "@/services/brand-context";
import { createImageProvider } from "@/lib/image-gen/factory";
import logger from "@/lib/logger";

// ── Prompt templates ─────────────────────────────────────────────────────────

const PROMPTS_DIR = join(process.cwd(), "lib", "agents", "subagents", "brand-illustration-agent", "prompts");

function loadTemplate(filename: string): string {
  return readFileSync(join(PROMPTS_DIR, filename), "utf-8");
}

// ── Types ─────────────────────────────────────────────────────────────────────

type CapturedCharacter = {
  name: string;
  age_group: string;
  characteristics: string;
  base64: string;
  mediaType: string;
  guidelines: Array<{
    title: string;
    description: string;
    sample_image_url: string | null;
  }>;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatColors(colors: PaletteColor[]): string {
  return colors.map((c) => (c.description ? `${c.hex} (${c.description})` : c.hex)).join(", ");
}

// Returns the single closest-matching guideline by title/description to the user's prompt.
function bestMatchingGuideline(
  guidelines: CapturedCharacter["guidelines"],
  userPrompt: string,
): CapturedCharacter["guidelines"][number] | null {
  if (guidelines.length === 0) return null;

  const fuse = new Fuse(guidelines, {
    keys: ["title", "description"],
    threshold: 0.4,
    includeScore: true,
  });

  const tokens = [
    ...new Set(userPrompt.toLowerCase().split(/\W+/).filter((w) => w.length > 3)),
  ];

  let best: { item: CapturedCharacter["guidelines"][number]; score: number } | null = null;
  for (const token of tokens) {
    const [top] = fuse.search(token);
    if (top && (top.score ?? 1) < (best?.score ?? 1)) {
      best = { item: top.item, score: top.score ?? 1 };
    }
  }

  return best?.item ?? null;
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

/**
 * Chroma-keys out the pure green (#00FF00) background the AI renders onto,
 * producing a real RGBA-transparent PNG.
 *
 * Threshold: pixel is keyed when green channel dominates with comfortable
 * margin over both red and blue — wide enough to absorb minor AI colour drift
 * near the background while preserving green tones inside subjects.
 */
async function chromaKeyGreen(input: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info; // channels === 4
  for (let i = 0; i < width * height; i++) {
    const o = i * channels;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    if (g > 180 && g > r + 30 && g > b + 30) {
      data[o + 3] = 0;
    }
  }

  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

function charRefLabel(c: CapturedCharacter): string {
  const meta = c.characteristics ? `${c.age_group}, ${c.characteristics}` : c.age_group;
  return (
    `THIS IS THE MANDATORY FACE AND BODY REFERENCE FOR CHARACTER "${c.name}" (${meta}). ` +
    `You MUST reproduce this character's exact face shape, facial features, body proportions, hair, skin tone, and colours faithfully. ` +
    `Do NOT invent or substitute a different face or body — use only what is shown in this image for "${c.name}".`
  );
}

function buildIllustrationPrompt(
  ill: NonNullable<BrandIllustrationContext["illustration"]>,
  brand: BrandIllustrationContext["brand"],
  _relevantChars: CapturedCharacter[],
  userPrompt: string,
  imageLabels: string[],
  editContext?: string,
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
    edit_context: editContext || null,
  };

  // _relevantChars reserved for future use (character-specific prompt injection)
  return Mustache.render(loadTemplate("illustration-prompt.mustache"), view).trim();
}

/**
 * Identifies brand character names mentioned in the user prompt by exact
 * case-insensitive substring match. Reliable for proper nouns like "Ah Gong".
 */
function identifyCharactersInPrompt(
  userPrompt: string,
  characters: Array<{ name: string }>,
): string[] {
  const lower = userPrompt.toLowerCase();
  return characters
    .filter((c) => lower.includes(c.name.toLowerCase()))
    .map((c) => c.name);
}

/**
 * Downloads reference images and loads guidelines for the named characters.
 */
async function fetchCharacterData(
  names: string[],
  brandContext: BrandIllustrationContext,
): Promise<CapturedCharacter[]> {
  const allChars = brandContext.illustration?.characters ?? [];
  const results: CapturedCharacter[] = [];

  for (const name of names) {
    const char = allChars.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (!char) continue;

    const guidelines = char.guidelines.map((g) => ({
      title: g.title,
      description: g.description,
      sample_image_url: g.sample_image_url,
    }));

    if (!char.reference_image_url) {
      results.push({ name: char.name, age_group: char.age_group, characteristics: char.characteristics, base64: "", mediaType: "", guidelines });
      continue;
    }

    const resp = await fetch(char.reference_image_url);
    if (!resp.ok) {
      results.push({ name: char.name, age_group: char.age_group, characteristics: char.characteristics, base64: "", mediaType: "", guidelines });
      continue;
    }

    const imgBuffer = await sharp(Buffer.from(await resp.arrayBuffer())).png().toBuffer();
    results.push({
      name: char.name,
      age_group: char.age_group,
      characteristics: char.characteristics,
      base64: imgBuffer.toString("base64"),
      mediaType: "image/png",
      guidelines,
    });
  }

  return results;
}

/**
 * Creates the Brand Illustration Tool.
 *
 * Returns a LangChain StructuredTool that the main agent calls directly.
 * Runs a fully deterministic pipeline — no inner LLM or ReAct agent.
 *
 * Pipeline:
 *   1. Fetch brand context
 *   2. Resolve character names (scan prompt for "new"; use MainAgent-provided list for "edit")
 *   3. Download character reference images
 *   4. Build illustration prompt + reference image list
 *   5. Call image provider
 *   6. Compress + upload
 */
export function createBrandIllustrationTool(
  options?: { imageModel?: string; sampleImageUrls?: string[]; generationSettings?: GenerationSettings },
) {
  const toolDescription =
    "Generate or edit an on-brand illustration. " +
    "Use this whenever the user asks to create, generate, draw, or modify an illustration or image. " +
    "Use request_type='new' for fresh illustrations and request_type='edit' when the user is " +
    "refining or changing a previously generated image (i.e. there is a [Previous illustration context] " +
    "section in the current message or the conversation shows a prior illustration was produced).";

  return tool(
    async ({
      request_type,
      user_prompt,
      character_names,
      previous_seed_details,
    }: {
      request_type: "new" | "edit";
      user_prompt: string;
      character_names: string[];
      previous_seed_details?: string;
    }) => {
      const imageModel = options?.imageModel ?? options?.generationSettings?.model ?? "gpt-image-2";
      const genSettings = options?.generationSettings;
      const preloadedSampleUrls: string[] = options?.sampleImageUrls ?? [];
      const imageProvider = createImageProvider(imageModel);

      logger.debug({ request_type, user_prompt }, "[BrandIllustrationTool] invoked");
      logger.debug({ imageModel, sampleImageUrls: preloadedSampleUrls, generationSettings: genSettings }, "[BrandIllustrationTool] options");

      // ── Step 1: Brand context ──────────────────────────────────────────────
      const brandContext = await getBrandContext();
      if (!brandContext?.illustration) {
        throw new Error(
          "No compiled brand context found. Please compile brand context before generating illustrations.",
        );
      }

      // ── Step 2: Resolve character names ───────────────────────────────────
      // "new":  scan the user prompt against the brand character list — no LLM needed.
      // "edit": MainAgent already extracted names from the previous seed details.
      const resolvedNames =
        request_type === "edit"
          ? character_names
          : identifyCharactersInPrompt(user_prompt, brandContext.illustration.characters ?? []);
      logger.debug({ resolvedNames }, "[BrandIllustrationTool] resolved characters");

      // ── Step 3: Fetch character references ────────────────────────────────
      const capturedCharacters = await fetchCharacterData(resolvedNames, brandContext);

      // ── Step 4: Guideline images per character ────────────────────────────
      const charGuidelineImages: Array<{
        base64: string;
        mediaType: string;
        charName: string;
        title: string;
      }> = [];
      for (const char of capturedCharacters) {
        const gl = bestMatchingGuideline(char.guidelines, user_prompt);
        const glLabel = gl ? `"${gl.title}"` : "none matched";
        logger.debug(`[BrandIllustrationAgent] guideline for "${char.name}": ${glLabel}`);
        if (!gl?.sample_image_url) continue;
        const buf = await downloadAsPng(gl.sample_image_url);
        if (buf) {
          charGuidelineImages.push({
            base64: buf.toString("base64"),
            mediaType: "image/png",
            charName: char.name,
            title: gl.title,
          });
        } else {
          logger.debug(`[BrandIllustrationAgent] failed to download guideline image "${gl.title}" for "${char.name}"`);
        }
      }

      // ── Step 5: Sample / reference images ─────────────────────────────────
      const sampleImages: Array<{ base64: string; mediaType: string }> = [];
      for (const url of preloadedSampleUrls) {
        const buf = await downloadAsPng(url);
        if (buf) sampleImages.push({ base64: buf.toString("base64"), mediaType: "image/png" });
      }

      // ── Step 6: Extract edit context ──────────────────────────────────────
      // For edits, pull the scene description from the previous seed details so the
      // illustration prompt can explicitly state what's already in the image.
      let editContext: string | undefined;
      if (request_type === "edit" && previous_seed_details) {
        try {
          const parsed = JSON.parse(previous_seed_details) as { scene?: { description?: string } };
          editContext = parsed?.scene?.description ?? undefined;
        } catch {
          // not parseable — leave editContext undefined
        }
      }

      // ── Step 7: Build image prompt & reference image list ─────────────────
      const ill = brandContext.illustration;
      const brand = brandContext.brand;
      const charsWithImages = capturedCharacters.filter((c) => !!c.base64);
      let imageIdx = 1;
      const imageLabels: string[] = [
        ...charsWithImages.map((c) => `Image ${imageIdx++}: ${charRefLabel(c)}`),
        ...charGuidelineImages.map(
          (g) => `Image ${imageIdx++}: MANDATORY COSTUME/ATTIRE REFERENCE for "${g.charName}" — "${g.title}". You MUST dress "${g.charName}" in this exact uniform, outfit, and accessories as shown. Do NOT change or omit any clothing element depicted here.`,
        ),
        ...sampleImages.map(
          () => `Image ${imageIdx++}: User input image — use for pose, scene, or edit reference.`,
        ),
      ];

      const referenceImages = [
        ...charsWithImages.map((c) => ({
          base64: c.base64,
          mediaType: c.mediaType,
          label: charRefLabel(c),
        })),
        ...charGuidelineImages.map((g) => ({
          base64: g.base64,
          mediaType: g.mediaType,
          label: `MANDATORY COSTUME/ATTIRE REFERENCE for "${g.charName}" — "${g.title}". You MUST dress "${g.charName}" in this exact uniform, outfit, and accessories as shown. Do NOT change or omit any clothing element depicted here.`,
        })),
        ...sampleImages.map((s) => ({
          base64: s.base64,
          mediaType: s.mediaType,
          label: "User input image — use for pose, scene, or edit reference.",
        })),
      ];

      const fullPrompt = buildIllustrationPrompt(ill, brand, capturedCharacters, user_prompt, imageLabels, editContext);

      // ── Debug logging ──────────────────────────────────────────────────────
      logger.debug(
        {
          user_prompt,
          request_type,
          resolvedCharacterNames: resolvedNames,
          sampleImageUrls: preloadedSampleUrls,
          charsWithImages: charsWithImages.map((c) => c.name),
          charGuidelineImagesCount: charGuidelineImages.length,
          sampleImagesDownloaded: sampleImages.length,
        },
        "[BrandIllustrationAgent] image summary",
      );
      logger.debug(
        {
          model: imageModel,
          quality: genSettings?.quality ?? "high",
          size: genSettings?.size === "auto" ? undefined : genSettings?.size,
          referenceImageCount: referenceImages.length,
        },
        "[BrandIllustrationAgent] calling provider",
      );
      logger.debug({ prompt: fullPrompt }, "[BrandIllustrationAgent] image generation prompt");
      logger.debug(
        { images: referenceImages.map((img, i) => ({ index: i + 1, label: img.label, mediaType: img.mediaType, base64Bytes: img.base64.length })) },
        "[BrandIllustrationAgent] reference images passed to provider",
      );

      // ── Step 8: Generate ───────────────────────────────────────────────────
      const charContext =
        capturedCharacters.length > 0
          ? `\nCharacter names in this image: ${capturedCharacters.map((c) => c.name).join(", ")}. Use these exact names for the corresponding objects.`
          : "";
      const descriptionInstructions = `After generating the image, output ONLY a valid JSON object (no markdown fences, no explanation) describing exactly what you created. Follow this schema precisely:\n${SEED_DETAILS_SCHEMA_EXAMPLE}\n\nRules:\n- attributes and visual_style may each have at most 5 key/value pairs.\n- visual_style values may be a string or an array of hex colour strings.\n- Include one object entry per distinct character, animal, prop, and environment area.\n- Output ONLY valid JSON — no extra text before or after.${charContext}`;

      const { buffer: imageBuffer, description: imageDescription } = await imageProvider.generate({
        prompt: fullPrompt,
        model: imageModel,
        quality: genSettings?.quality ?? "high",
        size: genSettings?.size === "auto" ? undefined : genSettings?.size,
        referenceImages,
        descriptionInstructions,
      });

      // ── Step 9: Validate and store seed details ────────────────────────────
      let capturedSeedDetails = "";
      if (imageDescription) {
        try {
          const parsed = JSON.parse(imageDescription);
          const validated = SeedDetailsSchema.safeParse(parsed);
          capturedSeedDetails = validated.success ? JSON.stringify(validated.data) : imageDescription;
        } catch {
          capturedSeedDetails = imageDescription;
        }
      }

      // ── Step 10: Chroma-key green background → transparent PNG and upload ─
      const transparentPng = await chromaKeyGreen(imageBuffer);
      const filename = `${crypto.randomUUID()}.png`;
      const storagePath = `temp/${DEFAULT_ORG_ID}/${filename}`;
      const storage = createStorageClient();
      const { error: uploadError } = await storage.storage
        .from(SUPABASE_BUCKET_NAME)
        .upload(storagePath, transparentPng, { contentType: "image/png", upsert: false });

      if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

      const { data: signedData, error: signedError } = await storage.storage
        .from(SUPABASE_BUCKET_NAME)
        .createSignedUrl(storagePath, 60 * 60);
      if (signedError || !signedData?.signedUrl) {
        throw new Error(`Signed URL creation failed: ${signedError?.message}`);
      }

      logger.debug({ filename, storagePath }, "[BrandIllustrationTool] upload complete");
      return JSON.stringify({
        filename,
        signedUrl: signedData.signedUrl,
        storagePath,
        seed_details: capturedSeedDetails,
        type: "image",
      });
    },
    {
      name: "generate_illustration",
      description: toolDescription,
      schema: z.object({
        request_type: z
          .enum(["new", "edit"])
          .describe(
            "'new' = fresh illustration with no prior generated image. " +
            "'edit' = the user is modifying a previously generated image.",
          ),
        user_prompt: z
          .string()
          .describe("The user's illustration or edit instruction, copied verbatim (typo fixes only)."),
        character_names: z
          .array(z.string())
          .default([])
          .describe(
            "Brand character names to include. " +
            "Identify from the current user message and conversation history — which brand characters has the user " +
            "requested, or were shown in the previous illustration? " +
            "For 'new': scan the user prompt for character names. " +
            "For 'edit': use the characters from the previous turn (conversation history or the [Previous illustration context] section). " +
            "Leave empty only if no brand characters are involved.",
          ),
        previous_seed_details: z
          .string()
          .optional()
          .describe(
            "For 'edit' only: the JSON from the [Previous illustration context] section, copied verbatim. Provides scene context for the edit.",
          ),
      }),
    },
  );
}


