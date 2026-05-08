// ---------------------------------------------------------------------------
// OpenAI Image Generation Provider
//
// Uses the OpenAI Responses API (responses.create) with a built-in
// image_generation tool. Supports multi-image reference inputs for character
// consistency and style guidance.
//
// The orchestration model ("gpt-5.4") drives the reasoning/prompt-building
// step; the image model (passed in the request) does the actual pixel work.
// ---------------------------------------------------------------------------

import OpenAI from "openai";
import type { ImageGenerationProvider, ImageGenerationRequest, ImageGenerationResult } from "../types";
import logger from "@/lib/logger";

const ORCHESTRATION_MODEL = "gpt-5.4";

export class OpenAIImageProvider implements ImageGenerationProvider {
  private readonly openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async generate(req: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const { prompt, model, quality = "high", size, referenceImages = [], descriptionInstructions } = req;

    const fullPrompt = descriptionInstructions ? `${prompt}\n\n${descriptionInstructions}` : prompt;

    logger.debug({ promptLength: fullPrompt.length, prompt: fullPrompt }, "[OpenAIImageProvider] final prompt sent to AI");

    const inputContent: Array<Record<string, unknown>> = [
      { type: "input_text", text: fullPrompt },
      ...referenceImages.map((img) => ({
        type: "input_image",
        image_url: `data:${img.mediaType};base64,${img.base64}`,
      })),
    ];

    logger.debug(
      {
        inputContent: inputContent.map((item, i) =>
          item.type === "input_text"
            ? { index: i, type: "input_text", chars: (item.text as string).length }
            : { index: i, type: "input_image", label: referenceImages[i - 1]?.label, mediaType: referenceImages[i - 1]?.mediaType, base64Bytes: referenceImages[i - 1]?.base64.length },
        ),
      },
      "[OpenAIImageProvider] inputContent order",
    );

    const requestPayload = {
      model: ORCHESTRATION_MODEL,
      input: [{ role: "user", content: inputContent }],
      tools: [
        {
          type: "image_generation",
          model,
          quality,
          ...(size && size !== "auto" ? { size } : {}),
        },
      ],
      // Force the orchestration model's text output to be valid JSON when a
      // description is requested. Without this the model may emit plain prose.
      ...(descriptionInstructions ? { text: { format: { type: "json_object" } } } : {}),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (this.openai as any).responses.create(requestPayload);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const output = response.output as any[];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const imageOutput = output?.find((o: any) => o.type === "image_generation_call");
    const imageB64: string = imageOutput?.result ?? imageOutput?.image ?? "";
    if (!imageB64) throw new Error("OpenAI Responses API returned no image data.");

    // Extract text description output by the orchestration model in the same response
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const textOutput = output?.find((o: any) => o.type === "message");
    const description: string | undefined = textOutput?.content
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ?.filter((c: any) => c.type === "output_text")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((c: any) => c.text as string)
      .join("") || undefined;

    return { buffer: Buffer.from(imageB64, "base64"), description };
  }
}
