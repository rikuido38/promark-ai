import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Mustache from "mustache";
import Fuse from "fuse.js";
import sharp from "sharp";
import { SUPABASE_BUCKET_NAME, DEFAULT_ORG_ID } from "@/utils/constants";
import { createStorageClient } from "@/utils/s3/storage";
import type { BrandIllustrationContext } from "@/types/brand-context";
import type { PaletteColor } from "@/types/settings";
import type { GenerationSettings } from "@/types/generation-settings";
import { getBrandContext } from "@/services/brand-context";
import { createImageProvider } from "@/lib/image-gen/factory";
import { getImageGenModelConfig } from "@/lib/image-gen/provider-config";
import type { BackgroundOption } from "@/lib/image-gen/provider-config";
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

// The chroma colour hardcoded in the prompt — used to flatten transparent images
// before sending them back to the model so it always sees a solid chroma background.
const CHROMA_COLOR = { r: 159, g: 0, b: 255 }; // #9F00FF

async function flattenOntoChroma(buf: Buffer): Promise<Buffer> {
  return sharp({
    create: {
      width: (await sharp(buf).metadata()).width ?? 1024,
      height: (await sharp(buf).metadata()).height ?? 1024,
      channels: 3,
      background: CHROMA_COLOR,
    },
  })
    .composite([{ input: buf, blend: "over" }])
    .png()
    .toBuffer();
}

// ── Chroma-key background removal ─────────────────────────────────────────────

const CHROMA_THRESHOLD = 15; // tight — only pixels very close to the sampled chroma colour

async function removeChromaKeyBackground(input: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  // Sample top-left corner as the background reference colour
  const bgR = data[0];
  const bgG = data[1];
  const bgB = data[2];

  // Per-pixel scan: remove every pixel within threshold of the chroma colour.
  // Flood-fill was stopping at anti-aliased edges and leaving colour fringe.
  // A tight threshold on a vivid chroma colour is safe for content pixels.
  let removed = 0;
  let maxDrift = 0;
  const total = width * height;
  for (let i = 0; i < total; i++) {
    const o = i * channels;
    const drift = Math.hypot(data[o] - bgR, data[o + 1] - bgG, data[o + 2] - bgB);
    if (drift > CHROMA_THRESHOLD) continue;
    if (drift > maxDrift) maxDrift = drift;
    data[o + 3] = 0;
    removed++;
  }

  logger.debug(
    { width, height, sampledBg: [bgR, bgG, bgB], sampledBgHex: `#${bgR.toString(16).padStart(2, "0")}${bgG.toString(16).padStart(2, "0")}${bgB.toString(16).padStart(2, "0")}`.toUpperCase(), threshold: CHROMA_THRESHOLD, removedPixels: removed, removedPct: ((removed / (width * height)) * 100).toFixed(1), maxDrift: maxDrift.toFixed(2) },
    "[BrandIllustrationAgent] chroma-key background removal",
  );

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
  requestType: "new" | "edit",
  backgroundOption: BackgroundOption,
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
    is_edit: requestType === "edit",
    use_transparent_bg: backgroundOption === "transparent",
    has_image_labels: imageLabels.length > 0,
    image_labels: imageLabels,
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

async function fetchGuidelineImages(
  capturedCharacters: CapturedCharacter[],
  userPrompt: string,
): Promise<Array<{ base64: string; mediaType: string; charName: string; title: string }>> {
  const results: Array<{ base64: string; mediaType: string; charName: string; title: string }> = [];
  for (const char of capturedCharacters) {
    const gl = bestMatchingGuideline(char.guidelines, userPrompt);
    const glLabel = gl ? `"${gl.title}"` : "none matched";
    logger.debug(`[BrandIllustrationAgent] guideline for "${char.name}": ${glLabel}`);
    if (!gl?.sample_image_url) continue;
    const buf = await downloadAsPng(gl.sample_image_url);
    if (buf) {
      results.push({ base64: buf.toString("base64"), mediaType: "image/png", charName: char.name, title: gl.title });
    } else {
      logger.debug(`[BrandIllustrationAgent] failed to download guideline image "${gl.title}" for "${char.name}"`);
    }
  }
  return results;
}

async function fetchSampleImages(urls: string[]): Promise<Array<{ base64: string; mediaType: string }>> {
  const results: Array<{ base64: string; mediaType: string }> = [];
  for (const url of urls) {
    const buf = await downloadAsPng(url);
    if (buf) {
      // Flatten transparency onto the chroma colour so the model always sees a
      // solid chroma background and generates a new one consistently for removal.
      const flattened = await flattenOntoChroma(buf);
      results.push({ base64: flattened.toString("base64"), mediaType: "image/png" });
    }
  }
  return results;
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
    }: {
      request_type: "new" | "edit";
      user_prompt: string;
      character_names: string[];
    }) => {
      const imageModel = options?.imageModel ?? options?.generationSettings?.model ?? "gpt-image-2";
      const genSettings = options?.generationSettings;
      const preloadedSampleUrls: string[] = options?.sampleImageUrls ?? [];
      const imageProvider = createImageProvider(imageModel);
      const modelConfig = getImageGenModelConfig(imageModel);

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
      const charGuidelineImages = await fetchGuidelineImages(capturedCharacters, user_prompt);

      // ── Step 5: Sample / reference images ─────────────────────────────────
      const sampleImages = await fetchSampleImages(preloadedSampleUrls);

      // ── Step 6: Build image prompt & reference image list ─────────────────
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

      const fullPrompt = buildIllustrationPrompt(ill, brand, capturedCharacters, user_prompt, imageLabels, request_type, modelConfig.backgroundOption);

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

      // ── Step 7: Generate ───────────────────────────────────────────────────
      const { buffer: rawBuffer } = await imageProvider.generate({
        prompt: fullPrompt,
        model: imageModel,
        quality: genSettings?.quality ?? "high",
        size: genSettings?.size === "auto" ? undefined : genSettings?.size,
        referenceImages,
      });

      // Remove chroma-key background for all models that don't natively output transparency.
      const imageBuffer = modelConfig.backgroundOption === "transparent"
        ? rawBuffer
        : await removeChromaKeyBackground(rawBuffer);

      // ── Step 8: Upload ─────────────────────────────────────────────────────
      // Provider returns a transparent-background PNG ready to upload.
      const filename = `${crypto.randomUUID()}.png`;
      const storagePath = `temp/${DEFAULT_ORG_ID}/${filename}`;
      const storage = createStorageClient();
      const { error: uploadError } = await storage.storage
        .from(SUPABASE_BUCKET_NAME)
        .upload(storagePath, imageBuffer, { contentType: "image/png", upsert: false });

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
            "For 'edit': use the characters from the previous turn (conversation history). " +
            "Leave empty only if no brand characters are involved.",
          ),
      }),
    },
  );
}


