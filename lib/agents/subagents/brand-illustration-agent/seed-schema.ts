import { z } from "zod";

// ── Helpers ───────────────────────────────────────────────────────────────────

const maxFive = <V extends z.ZodTypeAny>(valueSchema: V) =>
  z.record(z.string(), valueSchema).refine(
    (v) => Object.keys(v).length <= 5,
    { message: "Max 5 properties allowed" },
  );

// ── Schema ────────────────────────────────────────────────────────────────────

export const SeedDetailsSchema = z.object({
  scene: z.object({
    description: z.string(),
    style: z.object({
      global_style: z.array(z.string()),
      rendering: maxFive(z.string()).optional(),
    }),
    camera: z.object({
      angle: z.string(),
      framing: z.string(),
      perspective: z.string(),
    }),
  }),
  objects: z.array(
    z.object({
      type: z.enum(["human", "animal", "object", "environment"]),
      name: z.string(),
      role: z.enum(["primary subject", "supporting", "background"]),
      subtype: z.string().optional(),
      attributes: maxFive(z.string()).optional(),
      visual_style: maxFive(z.union([z.string(), z.array(z.string())])).optional(),
    }),
  ),
});

export type SeedDetails = z.infer<typeof SeedDetailsSchema>;

// ── Example JSON included in the AI prompt ────────────────────────────────────

export const SEED_DETAILS_SCHEMA_EXAMPLE = `{
  "scene": {
    "description": "One-sentence summary of the scene",
    "style": {
      "global_style": ["flat vector", "geometric", "bold"],
      "rendering": { "lighting": "soft", "mood": "warm" }
    },
    "camera": {
      "angle": "eye_level",
      "framing": "medium_shot",
      "perspective": "2D_flat"
    }
  },
  "objects": [
    {
      "type": "human",
      "name": "Character Name",
      "role": "primary subject",
      "attributes": { "pose": "standing", "expression": "happy", "orientation": "right_facing" },
      "visual_style": { "hair_color": "#000000", "skin_tone": "#FFBD8D", "clothing_color": "#212492" }
    },
    {
      "type": "object",
      "name": "prop name",
      "role": "supporting",
      "visual_style": { "primary_color": "#D52B1E", "material": "fabric" }
    },
    {
      "type": "environment",
      "subtype": "background",
      "name": "background",
      "role": "background",
      "visual_style": { "primary_color": "transparent" }
    }
  ]
}`;
