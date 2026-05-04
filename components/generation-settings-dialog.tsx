"use client";

import { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { createClient } from "@/utils/supabase/client";
import { TABLES } from "@/utils/supabase/constant";
import type {
  GenerationSettings,
  GenerationTabKey,
  GenerationTemplate,
} from "@/types/generation-settings";

const SIZE_OPTIONS: { value: string; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "1024x1024", label: "1024 × 1024" },
  { value: "1536x1024", label: "1536 × 1024 (landscape)" },
  { value: "1024x1536", label: "1024 × 1536 (portrait)" },
  { value: "2048x2048", label: "2048 × 2048" },
  { value: "2048x1152", label: "2048 × 1152 (wide)" },
  { value: "3840x2160", label: "3840 × 2160 (4K)" },
  { value: "2160x3840", label: "2160 × 3840 (4K portrait)" },
];

const QUALITY_LABELS: Record<string, string> = { low: "Low", medium: "Medium", high: "High" };
const BACKGROUND_LABELS: Record<string, string> = { opaque: "Opaque", auto: "Automatic" };
const FORMAT_LABELS: Record<string, string> = { png: "PNG", jpeg: "JPEG", webp: "WebP" };

interface Props {
  tabKey: GenerationTabKey;
  settings: GenerationSettings;
  availableModels: string[];
  onSettingsChange: (settings: GenerationSettings) => void;
}

export function GenerationSettingsButton({
  tabKey,
  settings,
  availableModels,
  onSettingsChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<GenerationSettings>(settings);
  const [templates, setTemplates] = useState<GenerationTemplate[]>([]);

  useEffect(() => {
    if (!open) return;
    const supabase = createClient();
    supabase
      .from(TABLES.TEMPLATES)
      .select("id, key, name, value")
      .eq("key", tabKey)
      .then(({ data }) => {
        if (data) setTemplates(data as GenerationTemplate[]);
      });
  }, [open, tabKey]);

  function applyTemplate(templateId: string) {
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;
    setDraft((prev) => ({ ...prev, ...tpl.value }));
  }

  function set<K extends keyof GenerationSettings>(key: K, value: GenerationSettings[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function handleOpen(next: boolean) {
    if (next) setDraft(settings);
    setOpen(next);
  }

  const compressionDisabled = draft.outputFormat === "png";

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
        onClick={() => handleOpen(true)}
        title="Generation settings"
      >
        <Settings className="h-3.5 w-3.5" />
      </Button>

      <Dialog open={open} onOpenChange={handleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Generation settings</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-4 py-2">
            {/* Template */}
            {templates.length > 0 && (
              <>
                <Label>Template</Label>
                <Select onValueChange={applyTemplate}>
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder="Select a template…" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}

            {/* Model */}
            {availableModels.length > 1 && (
              <>
                <Label>Model</Label>
                <Select value={draft.model} onValueChange={(v) => set("model", v)}>
                  <SelectTrigger className="w-44">
                    <SelectValue>{draft.model}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {availableModels.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}

            {/* Quality */}
            <Label>Quality</Label>
            <Select
              value={draft.quality}
              onValueChange={(v) => set("quality", v as GenerationSettings["quality"])}
            >
              <SelectTrigger className="w-44">
                <SelectValue>{QUALITY_LABELS[draft.quality] ?? draft.quality}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>

            {/* Background */}
            <Label>Background</Label>
            <Select
              value={draft.background}
              onValueChange={(v) => set("background", v as GenerationSettings["background"])}
            >
              <SelectTrigger className="w-44">
                <SelectValue>{BACKGROUND_LABELS[draft.background] ?? draft.background}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="opaque">Opaque</SelectItem>
                <SelectItem value="auto">Automatic</SelectItem>
              </SelectContent>
            </Select>

            {/* Size */}
            <Label>Size</Label>
            <Select
              value={draft.size}
              onValueChange={(v) => set("size", v as GenerationSettings["size"])}
            >
              <SelectTrigger className="w-44">
                <SelectValue>{SIZE_OPTIONS.find((o) => o.value === draft.size)?.label ?? draft.size}</SelectValue>
              </SelectTrigger>
              <SelectContent className="w-auto min-w-max" alignItemWithTrigger={false}>
                {SIZE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Output format */}
            <Label>Output format</Label>
            <Select
              value={draft.outputFormat}
              onValueChange={(v) => set("outputFormat", v as GenerationSettings["outputFormat"])}
            >
              <SelectTrigger className="w-44">
                <SelectValue>{FORMAT_LABELS[draft.outputFormat] ?? draft.outputFormat}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="png">PNG</SelectItem>
                <SelectItem value="jpeg">JPEG</SelectItem>
                <SelectItem value="webp">WebP</SelectItem>
              </SelectContent>
            </Select>

            {/* Compression */}
            <Label className={compressionDisabled ? "text-slate-400" : undefined}>
              Compression — {draft.compression}%
            </Label>
            <div className="flex w-44 flex-col gap-1">
              <Slider
                min={0}
                max={100}
                step={1}
                disabled={compressionDisabled}
                value={draft.compression}
                onValueChange={(v) => set("compression", v as number)}
              />
              {compressionDisabled && (
                <p className="text-xs text-slate-400">JPEG / WebP only</p>
              )}
            </div>
          </div>

          <div className="flex w-full gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={() => { onSettingsChange(draft); setOpen(false); }}
            >
              Confirm
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
