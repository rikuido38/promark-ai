import { tool } from "@langchain/core/tools";
import { createDeepAgent } from "deepagents";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
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

function buildIllustrationPrompt(
  ill: NonNullable<BrandIllustrationContext["illustration"]>,
  brand: BrandIllustrationContext["brand"],
  _relevantChars: CapturedCharacter[],
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

  // _relevantChars reserved for future use (character-specific prompt injection)
  return Mustache.render(loadTemplate("illustration-prompt.mustache"), view).trim();
}

/**
 * Creates the Brand Illustration Tool bound to a Supabase client.
 *
 * Returns a LangChain StructuredTool that the main agent calls directly.
 * Internally, each invocation spins up a fresh per-request ReAct agent with
 * its own closure state so concurrent calls never interfere.
 *
 * Inner pipeline (LLM-orchestrated):
 *   fetch_brand_context
 *   → [fetch_character_references]   (if characters are mentioned)
 *   → generate_illustration           (char ref images + user input images)
 *   → upload_illustration
 */
export function createBrandIllustrationTool(
  options?: { imageModel?: string; sampleImageUrls?: string[]; generationSettings?: GenerationSettings; previousImageSeedDetails?: string },
) {
  const toolDescription =
    "Generate an on-brand illustration or image from a user prompt. " +
    "Use this whenever the user asks to create, generate, or draw an illustration, image, or visual.";

  return tool(
    async ({ user_request }: { user_request: string }) => {
      console.log("[BrandIllustrationTool] invoked | user_request =", user_request);
      console.log("[BrandIllustrationTool] options =", JSON.stringify({
        imageModel: options?.imageModel,
        sampleImageUrls: options?.sampleImageUrls,
        generationSettings: options?.generationSettings,
      }));

      // Build a fresh inner agent with per-invocation closure state
      const innerAgent = buildIllustrationAgent(options);
      console.log("[BrandIllustrationTool] inner agent created, invoking pipeline...");

      // When editing a previous image, prepend its seed details so the inner
      // LLM understands what was in the image before deciding tool calls.
      let previousContextBody: string | undefined;
      if (options?.previousImageSeedDetails) {
        try {
          previousContextBody = JSON.stringify(JSON.parse(options.previousImageSeedDetails), null, 2);
        } catch {
          previousContextBody = options.previousImageSeedDetails;
        }
      }
      const previousContext = previousContextBody
        ? `[Previous image context]\n${previousContextBody}\n\n[Edit request]\n`
        : "";
      const result = await innerAgent.invoke({
        messages: [new HumanMessage(`${previousContext}${user_request}`)],
      });
      console.log("[BrandIllustrationTool] inner agent finished | message count =", result.messages?.length ?? 0);

      // Find the upload_illustration tool result which contains the signedUrl JSON.
      // The outer main agent needs this JSON to populate medias[].
      const messages: Array<{ content: unknown }> = result.messages ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const uploadResult = [...messages].reverse().find((m: any) => {
        if (typeof m._getType !== "function" || m._getType() !== "tool") return false;
        const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? "");
        try { return !!JSON.parse(content)?.signedUrl; } catch { return false; }
      });
      if (uploadResult) {
        const content = typeof uploadResult.content === "string"
          ? uploadResult.content
          : JSON.stringify(uploadResult.content);
        // Re-serialize to ensure the outer agent receives clean JSON with type hint
        try {
          const parsed = JSON.parse(content);
          console.log("[BrandIllustrationTool] upload result found | filename =", parsed.filename, "| storagePath =", parsed.storagePath);
          return JSON.stringify({ ...parsed, type: "image" });
        } catch {
          return content;
        }
      }
      // Fallback: return the last AI message if no upload result found
      console.warn("[BrandIllustrationTool] no upload result found in messages — returning last AI message");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lastAiMsg = [...messages].reverse().find((m: any) => {
        return typeof m._getType === "function" && m._getType() === "ai";
      });
      return typeof lastAiMsg?.content === "string"
        ? lastAiMsg.content
        : JSON.stringify(lastAiMsg?.content ?? "Illustration pipeline complete.");
    },
    {
      name: "generate_illustration",
      description: toolDescription,
      schema: z.object({
        user_request: z
          .string()
          .describe("The user's illustration request, copied verbatim."),
      }),
    },
  );
}

// ---------------------------------------------------------------------------
// Inner agent builder — called fresh for every outer tool invocation so each
// request gets isolated closure state (capturedContext, capturedCharacters,
// capturedImageBuffer). Do NOT hoist this to module scope.
// ---------------------------------------------------------------------------
function buildIllustrationAgent(
  options?: { imageModel?: string; sampleImageUrls?: string[]; generationSettings?: GenerationSettings; previousImageSeedDetails?: string },
) {
  const imageModel = options?.imageModel ?? options?.generationSettings?.model ?? "gpt-image-2";
  const genSettings = options?.generationSettings;
  // Pre-loaded sample URLs from the API call (chat attachments and the current preview image).
  const preloadedSampleUrls: string[] = options?.sampleImageUrls ?? [];
  const imageProvider = createImageProvider(imageModel);

  // Per-invocation state shared across tool calls via closure.
  let capturedContext: BrandIllustrationContext | null = null;
  const capturedCharacters: CapturedCharacter[] = [];
  let capturedImageBuffer: Buffer | null = null;
  // Auto-generated description of the image — populated in generateIllustrationTool,
  // read in uploadIllustrationTool, and stored alongside the storagePath in MongoDB.
  let capturedSeedDetails = "";

  // ── Tool: fetch_brand_context ─────────────────────────────────────────────

  const fetchBrandContextTool = tool(
    async () => {
      capturedContext = await getBrandContext();
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
    {
      name: "fetch_brand_context",
      description:
        "Load the compiled brand illustration context. Must be called first before any other tool.",
      schema: z.object({}),
    },
  );

  // ── Tool: fetch_character_references ─────────────────────────────────────

  const fetchCharacterReferencesTool = tool(
    async ({ character_names }: { character_names: string[] }) => {
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

        const guidelines = char.guidelines.map((g) => ({
          title: g.title,
          description: g.description,
          sample_image_url: g.sample_image_url,
        }));

        if (!char.reference_image_url) {
          capturedCharacters.push({ name: char.name, base64: "", mediaType: "", guidelines });
          results.push(`"${name}": no reference image — character data loaded.`);
          continue;
        }

        const resp = await fetch(char.reference_image_url);
        if (!resp.ok) {
          capturedCharacters.push({ name: char.name, base64: "", mediaType: "", guidelines });
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
          guidelines,
        });

        results.push(`"${name}": reference image loaded.`);
      }

      return results.join("\n");
    },
    {
      name: "fetch_character_references",
      description:
        "Download reference images for named brand characters. Call when the user's request mentions specific brand characters. Reference images fix facial features, colours, and proportions for the illustration.",
      schema: z.object({
        character_names: z
          .array(z.string())
          .describe("Exact names of brand characters to fetch reference images for"),
      }),
    },
  );

  // ── Tool: generate_illustration ───────────────────────────────────────────

  const generateIllustrationTool = tool(
    async ({
      user_prompt,
      character_names,
    }: {
      user_prompt: string;
      character_names: string[];
    }) => {
      if (!capturedContext?.illustration) {
        throw new Error("fetch_brand_context must be called first.");
      }

      const ill = capturedContext.illustration;
      const brand = capturedContext.brand;

      const relevantChars = capturedCharacters.filter((c) =>
        character_names.some((n) => n.toLowerCase() === c.name.toLowerCase()),
      );

      const charsWithImages = relevantChars.filter((c) => !!c.base64);

      // Download the single closest-matching guideline image per character
      const charGuidelineImages: Array<{ base64: string; mediaType: string; charName: string; title: string }> = [];
      for (const char of relevantChars) {
        const gl = bestMatchingGuideline(char.guidelines, user_prompt);
        const glLabel = gl ? `"${gl.title}"` : "none matched";
        console.log(`[BrandIllustrationAgent] guideline for "${char.name}": ${glLabel}`);
        if (!gl?.sample_image_url) continue;
        const buf = await downloadAsPng(gl.sample_image_url);
        if (buf) {
          charGuidelineImages.push({ base64: buf.toString("base64"), mediaType: "image/png", charName: char.name, title: gl.title });
        } else {
          console.log(`[BrandIllustrationAgent] failed to download guideline image "${gl.title}" for "${char.name}"`);
        }
      }

      const sampleImages: Array<{ base64: string; mediaType: string }> = [];
      for (const url of preloadedSampleUrls) {
        const buf = await downloadAsPng(url);
        if (buf) sampleImages.push({ base64: buf.toString("base64"), mediaType: "image/png" });
      }

      console.log("[BrandIllustrationAgent] generate_illustration: image summary", {
        user_prompt,
        character_names,
        sampleImageUrls: preloadedSampleUrls,
        charsWithImages: charsWithImages.map((c) => c.name),
        charGuidelineImagesCount: charGuidelineImages.length,
        sampleImagesDownloaded: sampleImages.length,
      });
      let imageIdx = 1;
      const imageLabels: string[] = [
        ...charsWithImages.map(
          (c) => `Image ${imageIdx++}: Character reference for "${c.name}" — match appearance, colours, and proportions exactly.`,
        ),
        ...charGuidelineImages.map(
          (g) => `Image ${imageIdx++}: Style guideline "${g.title}" for "${g.charName}" — follow this visual guideline.`,
        ),
        ...sampleImages.map(
          () => `Image ${imageIdx++}: User input image — use for pose, scene, or edit reference.`,
        ),
      ];

      const fullPrompt = buildIllustrationPrompt(ill, brand, relevantChars, user_prompt, imageLabels);

      // Reference images: char refs → char guideline images → user input images
      const referenceImages = [
        ...charsWithImages.map((c) => ({
          base64: c.base64,
          mediaType: c.mediaType,
          label: `Character reference for "${c.name}" — match appearance, colours, and proportions exactly.`,
        })),
        ...charGuidelineImages.map((g) => ({
          base64: g.base64,
          mediaType: g.mediaType,
          label: `Style guideline "${g.title}" for "${g.charName}" — follow this visual guideline.`,
        })),
        ...sampleImages.map((s) => ({
          base64: s.base64,
          mediaType: s.mediaType,
          label: "User input image — use for pose, scene, or edit reference.",
        })),
      ];

      console.log("[BrandIllustrationAgent] generate_illustration: calling provider", {
        model: imageModel,
        quality: genSettings?.quality ?? "high",
        size: genSettings?.size === "auto" ? undefined : genSettings?.size,
        referenceImageCount: referenceImages.length,
      });

      // ── DEBUG: full prompt and images sent to image generation AI ──────────
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("[BrandIllustrationAgent] DEBUG — inner agent system prompt:");
      console.log(AGENT_INSTRUCTIONS);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("[BrandIllustrationAgent] DEBUG — image generation prompt:");
      console.log(fullPrompt);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("[BrandIllustrationAgent] DEBUG — reference images passed to provider:");
      referenceImages.forEach((img, i) => {
        console.log(`  [${i + 1}/${referenceImages.length}] label="${img.label}" mediaType=${img.mediaType} base64Bytes=${img.base64.length}`);
      });
      if (referenceImages.length === 0) console.log("  (none)");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      // ── END DEBUG ──────────────────────────────────────────────────────────

      const charContext = relevantChars.length > 0
        ? `\nCharacter names in this image: ${relevantChars.map((c) => c.name).join(", ")}. Use these exact names for the corresponding objects.`
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
      capturedImageBuffer = imageBuffer;
      if (imageDescription) {
        try {
          const parsed = JSON.parse(imageDescription);
          const validated = SeedDetailsSchema.safeParse(parsed);
          capturedSeedDetails = validated.success
            ? JSON.stringify(validated.data)
            : imageDescription;
        } catch {
          capturedSeedDetails = imageDescription;
        }
      }

      return "Illustration generated successfully.";
    },
    {
      name: "generate_illustration",
      description:
        "Generate the on-brand vector illustration. Must be called after fetch_brand_context (and fetch_character_references if characters are requested).",
      schema: z.object({
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
      }),
    },
  );

  // ── Tool: upload_illustration ─────────────────────────────────────────────

  const uploadIllustrationTool = tool(
    async () => {
      if (!capturedImageBuffer) throw new Error("generate_illustration must be called first.");

      const compression = genSettings?.compression ?? 85;
      const compressed = await sharp(capturedImageBuffer).jpeg({ quality: compression }).toBuffer();
      const contentType = "image/jpeg";
      const ext = "jpg";

      const filename = `${crypto.randomUUID()}.${ext}`;
      const storagePath = `temp/${DEFAULT_ORG_ID}/${filename}`;

      const storage = createStorageClient();
      const { error: uploadError } = await storage.storage
        .from(SUPABASE_BUCKET_NAME)
        .upload(storagePath, compressed, { contentType, upsert: false });

      if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

      const { data: signedData, error: signedError } = await storage.storage
        .from(SUPABASE_BUCKET_NAME)
        .createSignedUrl(storagePath, 60 * 60);

      if (signedError || !signedData?.signedUrl) {
        throw new Error(`Signed URL creation failed: ${signedError?.message}`);
      }

      return JSON.stringify({ filename, signedUrl: signedData.signedUrl, storagePath, seed_details: capturedSeedDetails });
    },
    {
      name: "upload_illustration",
      description:
        "Compress and upload the final illustration to storage, then return a signed URL. Always call this as the last step.",
      schema: z.object({}),
    },
  );

  // ── Build inner deep agent ────────────────────────────────────────────────

  return createDeepAgent({
    model: new ChatOpenAI({ model: MODEL, temperature: 0 }),
    tools: [
      fetchBrandContextTool,
      fetchCharacterReferencesTool,
      generateIllustrationTool,
      uploadIllustrationTool,
    ],
    systemPrompt: AGENT_INSTRUCTIONS,
  });
}
