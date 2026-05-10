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
import { getImageGenModelConfig } from "../provider-config";
import logger from "@/lib/logger";

const ORCHESTRATION_MODEL = "gpt-5.4";

export class OpenAIImageProvider implements ImageGenerationProvider {
  private readonly openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async generate(req: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const { prompt, model, quality = "high", size, referenceImages = [] } = req;
    const modelConfig = getImageGenModelConfig(model);

    const fullPrompt = prompt;

    const inputContent: Array<Record<string, unknown>> = [
      { type: "input_text", text: fullPrompt },
      ...referenceImages.map((img) => ({
        type: "input_image",
        image_url: `data:${img.mediaType};base64,${img.base64}`,
      })),
    ];

    logger.debug(
      {
        prompt: fullPrompt,
        referenceImageCount: referenceImages.length,
        referenceImageTypes: referenceImages.map((img) => img.mediaType),
      },
      "[OpenAIImageProvider] inputContent",
    );

    const { backgroundOption } = modelConfig;

    const requestPayload = {
      model: ORCHESTRATION_MODEL,
      input: [{ role: "user", content: inputContent }],
      tools: [
        {
          type: "image_generation",
          model,
          quality,
          output_format: "png",
          ...(backgroundOption === "auto" ? {} : { background: backgroundOption }),
          ...(size && size !== "auto" ? { size } : {}),
        },
      ],
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (this.openai as any).responses.create(requestPayload);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const output = response.output as any[];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const imageOutput = output?.find((o: any) => o.type === "image_generation_call");
    const imageB64: string = imageOutput?.result ?? imageOutput?.image ?? "";
    if (!imageB64) throw new Error("OpenAI Responses API returned no image data.");

    const buffer = Buffer.from(imageB64, "base64");

    return { buffer };
  }
}
