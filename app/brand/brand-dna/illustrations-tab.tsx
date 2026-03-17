"use client";

import { useState, useRef, useEffect } from "react";
import {
  IllustrationSettings,
  IllustrationColourPalette,
} from "@/types/settings";
import { saveIllustrationSettings, uploadIllustrationToTemp } from "../actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ColorPaletteGroup } from "@/components/ui/color-palette-group";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Plus, X } from "lucide-react";
import {
  ImageGrid,
  IllustrationItem,
  makeItem,
  makePlaceholder,
} from "./image-grid";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_STYLE_IMAGES = 5;
const MAX_PALETTE_IMAGES = 5;

const COLOUR_PALETTE_GROUPS: Array<{
  key: keyof Omit<IllustrationColourPalette, "sample_images">;
  label: string;
}> = [
  { key: "outline_colors", label: "Outline" },
  { key: "supporting_colors", label: "Supporting" },
  { key: "skin_tone_colors", label: "Skin Tones" },
  { key: "hair_colors", label: "Hair" },
  { key: "background_colors", label: "Background" },
  { key: "shadow_colors", label: "Shadow" },
];

const DEFAULT_ILLU_SETTINGS: IllustrationSettings = {
  style_description: "",
  style_samples: [],
  colour_palette: {
    outline_colors: [],
    supporting_colors: [],
    skin_tone_colors: [],
    hair_colors: [],
    background_colors: [],
    shadow_colors: [],
    sample_images: [],
  },
  usages: [],
};

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
    style_samples: src?.style_samples ?? [],
    colour_palette: {
      ...DEFAULT_ILLU_SETTINGS.colour_palette,
      ...src?.colour_palette,
      sample_images: src?.colour_palette?.sample_images ?? [],
    },
    usages: src?.usages ?? [],
  };

  const [illuData, setIlluData] = useState<IllustrationSettings>(initIllu);

  const [styleSamples, setStyleSamples] = useState<IllustrationItem[]>(() =>
    initIllu.style_samples.map((m) => makeItem(m, m.url)),
  );

  const [paletteSamples, setPaletteSamples] = useState<IllustrationItem[]>(() =>
    initIllu.colour_palette.sample_images.map((m) => makeItem(m, m.url)),
  );

  const [usageSamples, setUsageSamples] = useState<(IllustrationItem | null)[]>(
    () =>
      initIllu.usages.map((u) =>
        u.sample ? makeItem(u.sample, u.sample.url) : null,
      ),
  );

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
    usageSamples.some((i) => i?.uploading);

  const isDirty =
    JSON.stringify(illuData) !== JSON.stringify(initIllu) ||
    styleSamples.some((i) => i.media.url.startsWith("temp/")) ||
    paletteSamples.some((i) => i.media.url.startsWith("temp/")) ||
    usageSamples.some((i) => i?.media.url.startsWith("temp/")) ||
    styleSamples.length !== initIllu.style_samples.length ||
    paletteSamples.length !== initIllu.colour_palette.sample_images.length ||
    usageSamples.length !== initIllu.usages.length;

  // ── Upload helpers ──────────────────────────────────────────────────────────

  async function uploadSingle(
    file: File,
    clientId: string,
    setter: React.Dispatch<React.SetStateAction<IllustrationItem[]>>,
  ) {
    try {
      const fd = new FormData();
      fd.append("file", file);
      const resultString = await uploadIllustrationToTemp(fd);
      const result = JSON.parse(resultString) as {
        signedUrl: string;
        path: string;
        filename: string;
      };
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

  async function uploadSingleForUsage(file: File, usageIndex: number) {
    const placeholder = makePlaceholder(file);
    setUsageSamples((prev) => {
      const next = [...prev];
      next[usageIndex] = placeholder;
      return next;
    });
    try {
      const fd = new FormData();
      fd.append("file", file);
      const resultString = await uploadIllustrationToTemp(fd);
      const result = JSON.parse(resultString) as {
        signedUrl: string;
        path: string;
        filename: string;
      };
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

  // ── Usage handlers ──────────────────────────────────────────────────────────

  const addUsage = () => {
    setIlluData((prev) => ({
      ...prev,
      usages: [
        ...prev.usages,
        { clientId: crypto.randomUUID(), description: "", sample: null },
      ],
    }));
    setUsageSamples((prev) => [...prev, null]);
  };

  const removeUsage = (index: number) => {
    setIlluData((prev) => {
      const usages = [...prev.usages];
      usages.splice(index, 1);
      return { ...prev, usages };
    });
    setUsageSamples((prev) => {
      const next = [...prev];
      next.splice(index, 1);
      return next;
    });
  };

  const updateUsageDescription = (index: number, value: string) => {
    setIlluData((prev) => {
      const usages = [...prev.usages];
      usages[index] = { ...usages[index], description: value };
      return { ...prev, usages };
    });
  };

  // ── Save ────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setLoading(true);
    try {
      const settingsToSave: IllustrationSettings = {
        ...illuData,
        style_samples: styleSamples.map((i) => i.media),
        colour_palette: {
          ...illuData.colour_palette,
          sample_images: paletteSamples.map((i) => i.media),
        },
        usages: illuData.usages.map((u, idx) => ({
          ...u,
          sample: usageSamples[idx]?.media ?? null,
        })),
      };
      await saveIllustrationSettings(settingsToSave);
      toast.success("Illustrations saved successfully");
      router.refresh();
    } catch {
      toast.error("Failed to save illustrations");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-8 rounded-lg border shadow-sm space-y-10">
      {/* Section 1 — Illustration Style */}
      <div className="space-y-4">
        <div>
          <p className="text-base font-semibold">Illustration Style</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Describe the general style of your illustrations and upload sample
            references.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="style_description" className="text-sm font-medium">
            User style description
          </Label>
          <Textarea
            id="style_description"
            placeholder="Flat design with bold outlines, vibrant colours, minimal gradients..."
            value={illuData.style_description}
            onChange={(e) =>
              setIlluData((prev) => ({
                ...prev,
                style_description: e.target.value,
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
              AI will analyze these images to understand the style, so include a variety
            </p>
          </div>

          <ImageGrid
            items={styleSamples}
            max={MAX_STYLE_IMAGES}
            onAdd={(files) =>
              addSamplesToSetter(
                files,
                styleSamples,
                MAX_STYLE_IMAGES,
                setStyleSamples,
              )
            }
            onRemove={(id) =>
              setStyleSamples((prev) => prev.filter((i) => i.clientId !== id))
            }
          />
        </div>
      </div>

      <hr className="border-slate-100" />

      {/* Section 2 — Colour Palette */}
      <div className="space-y-4">
        <div>
          <p className="text-base font-semibold">Illustration Colour Palette</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Define the colour groups used across your illustrations.
          </p>
        </div>

        <div className="space-y-4">
          {COLOUR_PALETTE_GROUPS.map(({ key, label }) => (
            <ColorPaletteGroup
              key={key}
              label={label}
              colors={illuData.colour_palette[key] ?? []}
              onChange={(colors) =>
                setIlluData((prev) => ({
                  ...prev,
                  colour_palette: { ...prev.colour_palette, [key]: colors },
                }))
              }
            />
          ))}
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">
            Palette Sample Images{" "}
            <span className="ml-1.5 text-xs text-muted-foreground font-normal">
              (up to {MAX_PALETTE_IMAGES})
            </span>
          </Label>
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
      </div>

      <hr className="border-slate-100" />

      {/* Section 3 — Illustration Usage */}
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-base font-semibold">Illustration Usage</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Define contexts where illustrations are used, with a description
              and optional sample image per entry.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addUsage}
            className="flex-shrink-0"
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Usage
          </Button>
        </div>

        {illuData.usages.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            No usages defined yet. Click &ldquo;Add Usage&rdquo; to get started.
          </p>
        )}

        <div className="space-y-4">
          {illuData.usages.map((usage, idx) => {
            const sampleItem = usageSamples[idx] ?? null;
            return (
              <div
                key={usage.clientId}
                className="p-4 border rounded-lg bg-slate-50/50 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">
                    Usage {idx + 1}
                  </Label>
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
                  {sampleItem ? (
                    <div className="relative group w-24 h-24 rounded-lg border bg-slate-100 overflow-hidden flex-shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={sampleItem.previewUrl}
                        alt={sampleItem.media.filename}
                        className="w-full h-full object-cover"
                      />
                      {sampleItem.uploading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg">
                          <Loader2 className="w-5 h-5 text-white animate-spin" />
                        </div>
                      )}
                      {!sampleItem.uploading && (
                        <>
                          <button
                            type="button"
                            onClick={() => setLightbox({ src: sampleItem.previewUrl, filename: sampleItem.media.filename })}
                            className="absolute inset-0 w-full h-full cursor-zoom-in focus:outline-none"
                            aria-label={`Preview ${sampleItem.media.filename}`}
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setUsageSamples((prev) => {
                                const next = [...prev];
                                next[idx] = null;
                                return next;
                              })
                            }
                            className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            aria-label="Remove sample"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </>
                      )}
                    </div>
                  ) : (
                    <label className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 hover:border-gray-400 bg-gray-50/50 flex flex-col items-center justify-center gap-1.5 text-muted-foreground transition-colors cursor-pointer">
                      <ImagePlus className="w-5 h-5" />
                      <span className="text-xs font-medium">Add</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) uploadSingleForUsage(file, idx);
                          (e.target as HTMLInputElement).value = "";
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end pt-2">
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
