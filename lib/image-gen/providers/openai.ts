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
import type { ImageGenerationProvider, ImageGenerationRequest } from "../types";

const ORCHESTRATION_MODEL = "gpt-5.4";

export class OpenAIImageProvider implements ImageGenerationProvider {
  private readonly openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async generate(req: ImageGenerationRequest): Promise<Buffer> {
    const { prompt, model, quality = "high", size, referenceImages = [] } = req;

    const inputContent: Array<Record<string, unknown>> = [
      { type: "input_text", text: prompt },
      ...referenceImages.map((img) => ({
        type: "input_image",
        image_url: `data:${img.mediaType};base64,${img.base64}`,
      })),
    ];

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
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (this.openai as any).responses.create(requestPayload);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const imageOutput = (response.output as any[])?.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (o: any) => o.type === "image_generation_call",
    );

    const imageB64: string = imageOutput?.result ?? imageOutput?.image ?? "";
    if (!imageB64) throw new Error("OpenAI Responses API returned no image data.");

    return Buffer.from(imageB64, "base64");
  }
}
