"use client";

import { useState, useRef, useEffect } from "react";
import {
  IllustrationSettings,
  DefaultCharacterFacialColours,
  CharacterAgeGroup,
  PaletteColor,
} from "@/types/settings";
import { saveIllustrationSettings, uploadIllustrationToTemp } from "../actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ColorPaletteGroup } from "@/components/ui/color-palette-group";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Plus, X, UserRoundPlus, ChevronDown, ChevronUp } from "lucide-react";
import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";
import {
  ImageGrid,
  IllustrationItem,
  makeItem,
  makePlaceholder,
} from "./image-grid";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_STYLE_IMAGES = 5;
const MAX_PALETTE_IMAGES = 5;
const MAX_PROPORTION_IMAGES = 5;

const AGE_GROUPS: CharacterAgeGroup[] = ["Young", "Teenager", "Adult", "Senior"];

const COLOUR_PALETTE_GROUPS: Array<{
  key: keyof DefaultCharacterFacialColours;
  label: string;
}> = [
  { key: "hair_colors", label: "Hair" },
  { key: "skin_tones", label: "Skin Tones" },
  { key: "shadow", label: "Shadow" },
  { key: "facial_features", label: "Facial Features" },
];

const DEFAULT_ILLU_SETTINGS: IllustrationSettings = {
  general_brand_guideline: { description: "", sample_images: [] },
  colour_palette: { description: "", sample_images: [] },
  colour_proportion: { description: "", sample_images: [] },
  default_character_facial_colours: {
    hair_colors: [],
    skin_tones: [],
    shadow: [],
    facial_features: [],
  },
  other_usecases: [],
  characters: [],
};

// ─── Client-side character image state ───────────────────────────────────────

interface GuidelineState {
  clientId: string;
  title: string;
  description: string;
  sample: IllustrationItem | null;
}

interface CharacterState {
  clientId: string;
  name: string;
  reference_image: IllustrationItem | null;
  characteristics: string;
  age_group: CharacterAgeGroup;
  guidelines: GuidelineState[];
}

// ─── Character state pure helpers (module-level to avoid deep nesting) ────────

function withCharGuidelines(
  prev: CharacterState[],
  charClientId: string,
  updater: (gls: GuidelineState[]) => GuidelineState[],
): CharacterState[] {
  return prev.map((c) =>
    c.clientId === charClientId ? { ...c, guidelines: updater(c.guidelines) } : c,
  );
}

function withUpdatedChar(
  prev: CharacterState[],
  charClientId: string,
  update: Partial<Omit<CharacterState, "clientId">>,
): CharacterState[] {
  return prev.map((c) => (c.clientId === charClientId ? { ...c, ...update } : c));
}

function withoutChar(prev: CharacterState[], charClientId: string): CharacterState[] {
  return prev.filter((c) => c.clientId !== charClientId);
}

function withAddedGuideline(prev: CharacterState[], charClientId: string): CharacterState[] {
  return withCharGuidelines(prev, charClientId, (gls) => [
    ...gls,
    { clientId: crypto.randomUUID(), title: "", description: "", sample: null },
  ]);
}

function withoutGuideline(
  prev: CharacterState[],
  charClientId: string,
  guidelineClientId: string,
): CharacterState[] {
  return withCharGuidelines(prev, charClientId, (gls) =>
    gls.filter((g) => g.clientId !== guidelineClientId),
  );
}

function withGuidelineDesc(
  prev: CharacterState[],
  charClientId: string,
  guidelineClientId: string,
  value: string,
): CharacterState[] {
  return withCharGuidelines(prev, charClientId, (gls) =>
    gls.map((g) => (g.clientId === guidelineClientId ? { ...g, description: value } : g)),
  );
}

function withGuidelineTitle(
  prev: CharacterState[],
  charClientId: string,
  guidelineClientId: string,
  value: string,
): CharacterState[] {
  return withCharGuidelines(prev, charClientId, (gls) =>
    gls.map((g) => (g.clientId === guidelineClientId ? { ...g, title: value } : g)),
  );
}

function withGuidelineSample(
  prev: CharacterState[],
  charClientId: string,
  guidelineClientId: string,
  sample: IllustrationItem | null,
): CharacterState[] {
  return withCharGuidelines(prev, charClientId, (gls) =>
    gls.map((g) => (g.clientId === guidelineClientId ? { ...g, sample } : g)),
  );
}

// ─── Upload helper ────────────────────────────────────────────────────────────

async function uploadToTemp(file: File): Promise<{ signedUrl: string; path: string; filename: string }> {
  const fd = new FormData();
  fd.append("file", file);
  return JSON.parse(await uploadIllustrationToTemp(fd));
}

// ─── IllustrationsTab ─────────────────────────────────────────────────────────

export function IllustrationsTab({
  initialIllustrationSettings,
}: {
  initialIllustrationSettings: IllustrationSettings | null;
}) {
  const router = useRouter();

  const src = initialIllustrationSettings;
  const initIllu: IllustrationSettings = {
    ...DEFAULT_ILLU_SETTINGS,
    ...src,
    general_brand_guideline: {
      description: src?.general_brand_guideline?.description ?? "",
      sample_images: src?.general_brand_guideline?.sample_images ?? [],
    },
    colour_palette: {
      description: src?.colour_palette?.description ?? "",
      sample_images: src?.colour_palette?.sample_images ?? [],
    },
    colour_proportion: {
      description: src?.colour_proportion?.description ?? "",
      sample_images: src?.colour_proportion?.sample_images ?? [],
    },
    default_character_facial_colours: {
      ...DEFAULT_ILLU_SETTINGS.default_character_facial_colours,
      ...src?.default_character_facial_colours,
    },
    other_usecases: src?.other_usecases ?? [],
    characters: src?.characters ?? [],
  };

  const [illuData, setIlluData] = useState<IllustrationSettings>(initIllu);

  const [styleSamples, setStyleSamples] = useState<IllustrationItem[]>(() =>
    initIllu.general_brand_guideline.sample_images.map((m) => makeItem(m, m.url)),
  );

  const [paletteSamples, setPaletteSamples] = useState<IllustrationItem[]>(() =>
    initIllu.colour_palette.sample_images.map((m) => makeItem(m, m.url)),
  );

  const [proportionSamples, setProportionSamples] = useState<IllustrationItem[]>(() =>
    initIllu.colour_proportion.sample_images.map((m) => makeItem(m, m.url)),
  );

  const [usageSamples, setUsageSamples] = useState<(IllustrationItem | null)[]>(
    () =>
      initIllu.other_usecases.map((u) =>
        u.sample ? makeItem(u.sample, u.sample.url) : null,
      ),
  );

  const [characters, setCharacters] = useState<CharacterState[]>(() =>
    initIllu.characters.map((c) => ({
      clientId: c.clientId,
      name: c.name,
      characteristics: c.characteristics,
      age_group: c.age_group,
      reference_image: c.reference_image
        ? makeItem(c.reference_image, c.reference_image.url)
        : null,
      guidelines: c.guidelines.map((g) => ({
        clientId: g.clientId,
        title: g.title ?? "",
        description: g.description,
        sample: g.sample ? makeItem(g.sample, g.sample.url) : null,
      })),
    })),
  );

  const [charactersDirty, setCharactersDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lightbox, setLightbox] = useState<{ src: string; filename: string } | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (lightbox) {
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [lightbox]);

  const isAnyUploading =
    styleSamples.some((i) => i.uploading) ||
    paletteSamples.some((i) => i.uploading) ||
    proportionSamples.some((i) => i.uploading) ||
    usageSamples.some((i) => i?.uploading) ||
    characters.some(
      (c) =>
        c.reference_image?.uploading ||
        c.guidelines.some((g) => g.sample?.uploading),
    );

  const isDirty =
    charactersDirty ||
    JSON.stringify(illuData) !== JSON.stringify(initIllu) ||
    styleSamples.some((i) => i.media.url.startsWith("temp/")) ||
    paletteSamples.some((i) => i.media.url.startsWith("temp/")) ||
    proportionSamples.some((i) => i.media.url.startsWith("temp/")) ||
    usageSamples.some((i) => i?.media.url.startsWith("temp/")) ||
    styleSamples.length !== initIllu.general_brand_guideline.sample_images.length ||
    paletteSamples.length !== initIllu.colour_palette.sample_images.length ||
    proportionSamples.length !== initIllu.colour_proportion.sample_images.length ||
    usageSamples.length !== initIllu.other_usecases.length ||
    characters.length !== initIllu.characters.length;

  // ── Style/palette upload helpers ────────────────────────────────────────────

  async function uploadSingle(
    file: File,
    clientId: string,
    setter: React.Dispatch<React.SetStateAction<IllustrationItem[]>>,
  ) {
    try {
      const result = await uploadToTemp(file);
      setter((prev) =>
        prev.map((item) =>
          item.clientId === clientId
            ? {
                ...item,
                media: { filename: result.filename, url: result.path },
                previewUrl: result.signedUrl,
                uploading: false,
              }
            : item,
        ),
      );
    } catch {
      toast.error(`Failed to upload ${file.name}`);
      setter((prev) => prev.filter((item) => item.clientId !== clientId));
    }
  }

  function addSamplesToSetter(
    files: FileList,
    current: IllustrationItem[],
    max: number,
    setter: React.Dispatch<React.SetStateAction<IllustrationItem[]>>,
  ) {
    const remaining = max - current.length;
    const toUpload = Array.from(files).slice(0, remaining);
    if (toUpload.length === 0) return;
    const placeholders = toUpload.map((f) => makePlaceholder(f));
    setter((prev) => [...prev, ...placeholders]);
    placeholders.forEach((p, idx) => {
      uploadSingle(toUpload[idx], p.clientId, setter);
    });
  }

  async function uploadSingleForUsage(file: File, usageIndex: number) {
    const placeholder = makePlaceholder(file);
    setUsageSamples((prev) => {
      const next = [...prev];
      next[usageIndex] = placeholder;
      return next;
    });
    try {
      const result = await uploadToTemp(file);
      setUsageSamples((prev) => {
        const next = [...prev];
        next[usageIndex] = {
          clientId: placeholder.clientId,
          media: { filename: result.filename, url: result.path },
          previewUrl: result.signedUrl,
          uploading: false,
        };
        return next;
      });
    } catch {
      toast.error(`Failed to upload ${file.name}`);
      setUsageSamples((prev) => {
        const next = [...prev];
        next[usageIndex] = null;
        return next;
      });
    }
  }

  // ── Usage handlers ──────────────────────────────────────────────────────────

  const addUsage = () => {
    setIlluData((prev) => ({
      ...prev,
      other_usecases: [
        ...prev.other_usecases,
        { clientId: crypto.randomUUID(), description: "", sample: null },
      ],
    }));
    setUsageSamples((prev) => [...prev, null]);
  };

  const removeUsage = (index: number) => {
    setIlluData((prev) => {
      const other_usecases = [...prev.other_usecases];
      other_usecases.splice(index, 1);
      return { ...prev, other_usecases };
    });
    setUsageSamples((prev) => {
      const next = [...prev];
      next.splice(index, 1);
      return next;
    });
  };

  const updateUsageDescription = (index: number, value: string) => {
    setIlluData((prev) => {
      const other_usecases = [...prev.other_usecases];
      other_usecases[index] = { ...other_usecases[index], description: value };
      return { ...prev, other_usecases };
    });
  };

  // ── Character handlers ──────────────────────────────────────────────────────

  const addCharacter = () => {
    const newClientId = crypto.randomUUID();
    setCharacters((prev) => [
      ...prev,
      {
        clientId: newClientId,
        name: "",
        reference_image: null,
        characteristics: "",
        age_group: "Adult" as CharacterAgeGroup,
        guidelines: [],
      },
    ]);
    setCharactersDirty(true);
  };

  const removeCharacter = (charClientId: string) => {
    setCharacters((prev) => withoutChar(prev, charClientId));
    setCharactersDirty(true);
  };

  const updateCharacter = (
    charClientId: string,
    updates: Partial<Omit<CharacterState, "clientId">>,
  ) => {
    setCharacters((prev) => withUpdatedChar(prev, charClientId, updates));
    setCharactersDirty(true);
  };

  async function uploadCharacterRef(file: File, charClientId: string) {
    const placeholder = makePlaceholder(file);
    setCharacters((prev) =>
      withUpdatedChar(prev, charClientId, { reference_image: placeholder }),
    );
    setCharactersDirty(true);
    try {
      const result = await uploadToTemp(file);
      setCharacters((prev) =>
        withUpdatedChar(prev, charClientId, {
          reference_image: {
            ...placeholder,
            media: { filename: result.filename, url: result.path },
            previewUrl: result.signedUrl,
            uploading: false,
          },
        }),
      );
    } catch {
      toast.error(`Failed to upload ${file.name}`);
      setCharacters((prev) =>
        withUpdatedChar(prev, charClientId, { reference_image: null }),
      );
    }
  }

  const addGuideline = (charClientId: string) => {
    setCharacters((prev) => withAddedGuideline(prev, charClientId));
    setCharactersDirty(true);
  };

  const removeGuideline = (charClientId: string, guidelineClientId: string) => {
    setCharacters((prev) => withoutGuideline(prev, charClientId, guidelineClientId));
    setCharactersDirty(true);
  };

  const updateGuidelineTitle = (
    charClientId: string,
    guidelineClientId: string,
    value: string,
  ) => {
    setCharacters((prev) =>
      withGuidelineTitle(prev, charClientId, guidelineClientId, value),
    );
    setCharactersDirty(true);
  };

  const updateGuidelineDescription = (
    charClientId: string,
    guidelineClientId: string,
    value: string,
  ) => {
    setCharacters((prev) =>
      withGuidelineDesc(prev, charClientId, guidelineClientId, value),
    );
    setCharactersDirty(true);
  };

  const clearGuidelineSample = (charClientId: string, guidelineClientId: string) => {
    setCharacters((prev) =>
      withGuidelineSample(prev, charClientId, guidelineClientId, null),
    );
    setCharactersDirty(true);
  };

  async function uploadGuidelineSample(
    file: File,
    charClientId: string,
    guidelineClientId: string,
  ) {
    const placeholder = makePlaceholder(file);
    setCharacters((prev) =>
      withGuidelineSample(prev, charClientId, guidelineClientId, placeholder),
    );
    setCharactersDirty(true);
    try {
      const result = await uploadToTemp(file);
      setCharacters((prev) =>
        withGuidelineSample(prev, charClientId, guidelineClientId, {
          ...placeholder,
          media: { filename: result.filename, url: result.path },
          previewUrl: result.signedUrl,
          uploading: false,
        }),
      );
    } catch {
      toast.error(`Failed to upload ${file.name}`);
      setCharacters((prev) =>
        withGuidelineSample(prev, charClientId, guidelineClientId, null),
      );
    }
  }

  // ── Save ────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setLoading(true);
    // Strip any legacy numeric-index keys from PaletteColor objects (artefact of
    // an old string-spread bug) so they are never persisted back to the DB.
    const cleanColor = (c: PaletteColor): PaletteColor => ({
      hex: c.hex,
      ...(c.opacity !== undefined && { opacity: c.opacity }),
      ...(c.description !== undefined && { description: c.description }),
    });
    try {
      const settingsToSave: IllustrationSettings = {
        ...illuData,
        general_brand_guideline: {
          description: illuData.general_brand_guideline.description,
          sample_images: styleSamples.map((i) => i.media),
        },
        colour_palette: {
          description: illuData.colour_palette.description,
          sample_images: paletteSamples.map((i) => i.media),
        },
        colour_proportion: {
          description: illuData.colour_proportion.description,
          sample_images: proportionSamples.map((i) => i.media),
        },
        default_character_facial_colours: {
          hair_colors: (illuData.default_character_facial_colours.hair_colors ?? []).map(cleanColor),
          skin_tones: (illuData.default_character_facial_colours.skin_tones ?? []).map(cleanColor),
          shadow: (illuData.default_character_facial_colours.shadow ?? []).map(cleanColor),
          facial_features: (illuData.default_character_facial_colours.facial_features ?? []).map(cleanColor),
        },
        other_usecases: illuData.other_usecases.map((u, idx) => ({
          ...u,
          sample: usageSamples[idx]?.media ?? null,
        })),
        characters: characters.map((c) => ({
          clientId: c.clientId,
          name: c.name,
          reference_image: c.reference_image?.media ?? null,
          characteristics: c.characteristics,
          age_group: c.age_group,
          guidelines: c.guidelines.map((g) => ({
            clientId: g.clientId,
            title: g.title,
            description: g.description,
            sample: g.sample?.media ?? null,
          })),
        })),
      };
      await saveIllustrationSettings(settingsToSave);
      setCharactersDirty(false);
      toast.success("Illustrations saved successfully");
      router.refresh();
    } catch {
      toast.error("Failed to save illustrations");
    } finally {
      setLoading(false);
    }
  };

  // ── Inline image widget (for single-image slots) ────────────────────────────

  function SingleImageSlot({
    item,
    onUpload,
    onRemove,
    onPreview,
  }: {
    item: IllustrationItem | null;
    onUpload: (file: File) => void;
    onRemove: () => void;
    onPreview: (src: string, filename: string) => void;
  }) {
    if (item) {
      return (
        <div className="relative group w-24 h-24 rounded-lg border bg-slate-100 overflow-hidden flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.previewUrl}
            alt={item.media.filename}
            className="w-full h-full object-cover"
          />
          {item.uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg">
              <Loader2 className="w-5 h-5 text-white animate-spin" />
            </div>
          )}
          {!item.uploading && (
            <>
              <button
                type="button"
                onClick={() => onPreview(item.previewUrl, item.media.filename)}
                className="absolute inset-0 w-full h-full cursor-zoom-in focus:outline-none"
                aria-label={`Preview ${item.media.filename}`}
              />
              <button
                type="button"
                onClick={onRemove}
                className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Remove image"
              >
                <X className="w-3 h-3" />
              </button>
            </>
          )}
        </div>
      );
    }
    return (
      <label className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 hover:border-gray-400 bg-gray-50/50 flex flex-col items-center justify-center gap-1.5 text-muted-foreground transition-colors cursor-pointer">
        <ImagePlus className="w-5 h-5" />
        <span className="text-xs font-medium">Add</span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUpload(file);
            (e.target as HTMLInputElement).value = "";
          }}
        />
      </label>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="bg-white p-8 rounded-lg border shadow-sm space-y-6">
      {/* Save */}
      <div className="flex justify-end">
        <Button
          type="button"
          size="lg"
          className="w-40"
          disabled={!isDirty || loading || isAnyUploading}
          onClick={handleSave}
        >
          {loading ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      <Accordion multiple className="space-y-2">
        {/* Section 1 — Brand illustration style */}
        <AccordionItem value="style" className="border rounded-lg overflow-hidden">
          <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-slate-50 transition-colors">
            <div>
              <p className="text-sm font-semibold text-left">Brand illustration style</p>
              <p className="text-xs text-muted-foreground font-normal mt-0.5 text-left">
                Describe the general style of your illustrations and upload sample references.
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="style_description" className="text-sm font-medium">
                  Style description
                </Label>
                <Textarea
                  id="style_description"
                  placeholder="Flat design with bold outlines, vibrant colours, minimal gradients..."
                  value={illuData.general_brand_guideline.description}
                  onChange={(e) =>
                    setIlluData((prev) => ({
                      ...prev,
                      general_brand_guideline: { ...prev.general_brand_guideline, description: e.target.value },
                    }))
                  }
                  className="min-h-[100px]"
                />
              </div>

              <div className="space-y-2">
                <div>
                  <Label className="text-sm font-medium">
                    Sample Images{" "}
                    <span className="ml-1.5 text-xs text-muted-foreground font-normal">
                      (up to {MAX_STYLE_IMAGES})
                    </span>
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    AI will analyze these images to understand the style
                  </p>
                </div>
                <ImageGrid
                  items={styleSamples}
                  max={MAX_STYLE_IMAGES}
                  onAdd={(files) =>
                    addSamplesToSetter(files, styleSamples, MAX_STYLE_IMAGES, setStyleSamples)
                  }
                  onRemove={(id) =>
                    setStyleSamples((prev) => prev.filter((i) => i.clientId !== id))
                  }
                />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Section 2 — Colour palette */}
        <AccordionItem value="palette" className="border rounded-lg overflow-hidden">
          <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-slate-50 transition-colors">
            <div>
              <p className="text-sm font-semibold text-left">Colour palette</p>
              <p className="text-xs text-muted-foreground font-normal mt-0.5 text-left">
                Upload sample images that represent your illustration colour palette.
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="palette_description" className="text-sm font-medium">
                  Description{" "}
                  <span className="ml-1 text-xs text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Textarea
                  id="palette_description"
                  placeholder="Optional context to AI..."
                  value={illuData.colour_palette.description ?? ""}
                  onChange={(e) =>
                    setIlluData((prev) => ({
                      ...prev,
                      colour_palette: { ...prev.colour_palette, description: e.target.value },
                    }))
                  }
                  className="min-h-[80px]"
                />
              </div>
              <ImageGrid
                items={paletteSamples}
                max={MAX_PALETTE_IMAGES}
                onAdd={(files) =>
                  addSamplesToSetter(
                    files,
                    paletteSamples,
                    MAX_PALETTE_IMAGES,
                    setPaletteSamples,
                  )
                }
                onRemove={(id) =>
                  setPaletteSamples((prev) => prev.filter((i) => i.clientId !== id))
                }
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Section 3 — Colour proportion */}
        <AccordionItem value="proportion" className="border rounded-lg overflow-hidden">
          <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-slate-50 transition-colors">
            <div>
              <p className="text-sm font-semibold text-left">Colour proportion</p>
              <p className="text-xs text-muted-foreground font-normal mt-0.5 text-left">
                Describe how your brand colours should be proportionally distributed in illustrations.
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="colour_proportion_description" className="text-sm font-medium">
                  Description{" "}
                  <span className="ml-1 text-xs text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Textarea
                  id="colour_proportion_description"
                  placeholder="e.g. Red is dominant at 60%, white at 30%, dark accents at 10%..."
                  value={illuData.colour_proportion.description ?? ""}
                  onChange={(e) =>
                    setIlluData((prev) => ({
                      ...prev,
                      colour_proportion: { ...prev.colour_proportion, description: e.target.value },
                    }))
                  }
                  className="min-h-[80px]"
                />
              </div>
              <ImageGrid
                items={proportionSamples}
                max={MAX_PROPORTION_IMAGES}
                onAdd={(files) =>
                  addSamplesToSetter(
                    files,
                    proportionSamples,
                    MAX_PROPORTION_IMAGES,
                    setProportionSamples,
                  )
                }
                onRemove={(id) =>
                  setProportionSamples((prev) => prev.filter((i) => i.clientId !== id))
                }
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Section 4 — Characters */}
        <AccordionItem value="characters" className="border rounded-lg overflow-hidden">
          <AccordionPrimitive.Header className="flex items-center hover:bg-slate-50 transition-colors">
            <AccordionPrimitive.Trigger className="group/accordion-trigger flex-1 flex items-center justify-between px-4 py-3 text-left text-sm font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
              <div>
                <p className="text-sm font-semibold text-left">Characters</p>
                <p className="text-xs text-muted-foreground font-normal mt-0.5 text-left">
                  Define named characters with reference images, characteristics, and style guidelines.
                </p>
              </div>
              <ChevronDown className="pointer-events-none shrink-0 size-4 text-muted-foreground mr-2 group-aria-expanded/accordion-trigger:hidden" />
              <ChevronUp className="pointer-events-none hidden shrink-0 size-4 text-muted-foreground mr-2 group-aria-expanded/accordion-trigger:inline" />
            </AccordionPrimitive.Trigger>
            <div className="pr-4 flex-shrink-0">
              <Button type="button" variant="outline" size="sm" onClick={addCharacter}>
                <UserRoundPlus className="h-3.5 w-3.5 mr-1" /> Add Character
              </Button>
            </div>
          </AccordionPrimitive.Header>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-4 pt-2">
              {characters.length === 0 && (
                <p className="text-sm text-muted-foreground italic">
                  No characters defined yet. Click &ldquo;Add Character&rdquo; to get started.
                </p>
              )}

              {characters.length > 0 && (
                <Accordion multiple className="space-y-2">
                  {characters.map((char, idx) => (
                    <AccordionItem
                      key={char.clientId}
                      value={char.clientId}
                      className="border rounded-lg overflow-hidden"
                    >
                      <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          {char.reference_image && !char.reference_image.uploading ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={char.reference_image.previewUrl}
                              alt={char.name || "Character"}
                              className="w-8 h-8 rounded-full object-cover border flex-shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0 text-muted-foreground text-xs font-semibold">
                              {char.name ? char.name[0].toUpperCase() : (idx + 1)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-md font-medium truncate">
                              {char.name || `Character ${idx + 1}`} {char.age_group && <span className="text-sm font-normal">({char.age_group})</span>}
                            </p>
                          </div>
                        </div>
                      </AccordionTrigger>

                      <AccordionContent className="px-4 pb-4">
                        <div className="space-y-4 pt-2">
                          <div className="flex gap-4 items-start">
                            <div className="flex-shrink-0 space-y-1">
                              <Label className="text-xs font-medium text-muted-foreground">
                                Reference <span className="text-destructive">*</span>
                              </Label>
                              <SingleImageSlot
                                item={char.reference_image}
                                onUpload={(file) => uploadCharacterRef(file, char.clientId)}
                                onRemove={() =>
                                  updateCharacter(char.clientId, { reference_image: null })
                                }
                                onPreview={(src, filename) => setLightbox({ src, filename })}
                              />
                            </div>

                            <div className="flex-1 space-y-3 min-w-0">
                              <div className="space-y-1">
                                <Label className="text-xs font-medium">Name</Label>
                                <Input
                                  placeholder="e.g. Maya"
                                  value={char.name}
                                  onChange={(e) =>
                                    updateCharacter(char.clientId, { name: e.target.value })
                                  }
                                />
                              </div>

                              <div className="space-y-1">
                                <Label className="text-xs font-medium">Age Group</Label>
                                <Select
                                  value={char.age_group}
                                  onValueChange={(val) =>
                                    updateCharacter(char.clientId, {
                                      age_group: val as CharacterAgeGroup,
                                    })
                                  }
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select age group" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {AGE_GROUPS.map((ag) => (
                                      <SelectItem key={ag} value={ag}>
                                        {ag}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => removeCharacter(char.clientId)}
                              className="h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors flex-shrink-0 mt-5"
                              aria-label="Remove character"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="space-y-1">
                            <Label className="text-xs font-medium">Characteristics</Label>
                            <Textarea
                              placeholder="e.g. Cheerful young professional, always smiling, wears casual business attire..."
                              value={char.characteristics}
                              onChange={(e) =>
                                updateCharacter(char.clientId, {
                                  characteristics: e.target.value,
                                })
                              }
                              className="min-h-[80px] text-sm"
                            />
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs font-medium">
                                Guidelines{" "}
                                <span className="text-muted-foreground font-normal">
                                  (optional)
                                </span>
                              </Label>
                              <button
                                type="button"
                                onClick={() => addGuideline(char.clientId)}
                                className="text-xs text-primary hover:underline flex items-center gap-0.5"
                              >
                                <Plus className="w-3 h-3" /> Add
                              </button>
                            </div>

                            {char.guidelines.length === 0 && (
                              <p className="text-xs text-muted-foreground italic">
                                No guidelines yet.
                              </p>
                            )}

                            <div className="space-y-2">
                              {char.guidelines.map((gl) => (
                                <div
                                  key={gl.clientId}
                                  className="p-3 rounded-lg bg-slate-50 border space-y-2"
                                >
                                  <div className="flex items-center gap-2">
                                    <Input
                                      placeholder="Guideline title"
                                      value={gl.title}
                                      onChange={(e) =>
                                        updateGuidelineTitle(
                                          char.clientId,
                                          gl.clientId,
                                          e.target.value,
                                        )
                                      }
                                      className="flex-1 h-7 text-xs"
                                    />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        removeGuideline(char.clientId, gl.clientId)
                                      }
                                      className="h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                                      aria-label="Remove guideline"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                  <div className="flex gap-3 items-start">
                                    <SingleImageSlot
                                      item={gl.sample}
                                      onUpload={(file) =>
                                        uploadGuidelineSample(file, char.clientId, gl.clientId)
                                      }
                                      onRemove={() =>
                                        clearGuidelineSample(char.clientId, gl.clientId)
                                      }
                                      onPreview={(src, filename) =>
                                        setLightbox({ src, filename })
                                      }
                                    />
                                    <Textarea
                                      placeholder="e.g. Always shown with a laptop when in office contexts"
                                      value={gl.description}
                                      onChange={(e) =>
                                        updateGuidelineDescription(
                                          char.clientId,
                                          gl.clientId,
                                          e.target.value,
                                        )
                                      }
                                      className="flex-1 min-h-[72px] text-xs"
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Section 5 — Default characters facial colours */}
        <AccordionItem value="facial-colours" className="border rounded-lg overflow-hidden">
          <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-slate-50 transition-colors">
            <div>
              <p className="text-sm font-semibold text-left">Default characters facial colours</p>
              <p className="text-xs text-muted-foreground font-normal mt-0.5 text-left">
                Define the colour groups used across your illustrations.
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-4 pt-2">
              {COLOUR_PALETTE_GROUPS.map(({ key, label }) => (
                <ColorPaletteGroup
                  key={key}
                  label={label}
                  colors={illuData.default_character_facial_colours[key] ?? []}
                  onChange={(colors) =>
                    setIlluData((prev) => ({
                      ...prev,
                      default_character_facial_colours: { ...prev.default_character_facial_colours, [key]: colors },
                    }))
                  }
                />
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
        {/* Section 6 — Additional patterns */}
        <AccordionItem value="usage" className="border rounded-lg overflow-hidden">
          <AccordionPrimitive.Header className="flex items-center hover:bg-slate-50 transition-colors">
            <AccordionPrimitive.Trigger className="group/accordion-trigger flex-1 flex items-center justify-between px-4 py-3 text-left text-sm font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
              <div>
                <p className="text-sm font-semibold text-left">Additional patterns</p>
                <p className="text-xs text-muted-foreground font-normal mt-0.5 text-left">
                  Define additional illustration patterns and contexts.
                </p>
              </div>
              <ChevronDown className="pointer-events-none shrink-0 size-4 text-muted-foreground mr-2 group-aria-expanded/accordion-trigger:hidden" />
              <ChevronUp className="pointer-events-none hidden shrink-0 size-4 text-muted-foreground mr-2 group-aria-expanded/accordion-trigger:inline" />
            </AccordionPrimitive.Trigger>
            <div className="pr-4 flex-shrink-0">
              <Button type="button" variant="outline" size="sm" onClick={addUsage}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Usage
              </Button>
            </div>
          </AccordionPrimitive.Header>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-4 pt-2">
              {illuData.other_usecases.length === 0 && (
                <p className="text-sm text-muted-foreground italic">
                  No usages defined yet. Click &ldquo;Add Usage&rdquo; to get started.
                </p>
              )}

              {illuData.other_usecases.map((usage, idx) => {
                const sampleItem = usageSamples[idx] ?? null;
                return (
                  <div
                    key={usage.clientId}
                    className="p-4 border rounded-lg bg-slate-50/50 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-semibold">Usage {idx + 1}</Label>
                      <button
                        type="button"
                        onClick={() => removeUsage(idx)}
                        className="h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                        aria-label="Remove usage"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <Textarea
                      placeholder="e.g. Hero section illustrations of happy people using the product"
                      value={usage.description}
                      onChange={(e) => updateUsageDescription(idx, e.target.value)}
                      className="min-h-[80px]"
                    />

                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">
                        Sample Image
                      </Label>
                      <SingleImageSlot
                        item={sampleItem}
                        onUpload={(file) => uploadSingleForUsage(file, idx)}
                        onRemove={() =>
                          setUsageSamples((prev) => {
                            const next = [...prev];
                            next[idx] = null;
                            return next;
                          })
                        }
                        onPreview={(src, filename) => setLightbox({ src, filename })}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </AccordionContent>
        </AccordionItem>

      </Accordion>

      {/* Lightbox */}
      <dialog
        ref={dialogRef}
        className="m-auto max-w-3xl max-h-[90vh] rounded-xl overflow-hidden shadow-2xl p-0 bg-transparent backdrop:bg-black/70 backdrop:backdrop-blur-sm"
        onClose={() => setLightbox(null)}
      >
        {lightbox && (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightbox.src}
              alt={lightbox.filename}
              className="max-w-full max-h-[90vh] object-contain block"
            />
            <button
              type="button"
              onClick={() => setLightbox(null)}
              className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
              aria-label="Close preview"
            >
              <X className="w-4 h-4" />
            </button>
            <p className="absolute bottom-0 left-0 right-0 px-3 py-1.5 bg-black/50 text-white text-xs truncate">
              {lightbox.filename}
            </p>
          </div>
        )}
      </dialog>
    </div>
  );
}

