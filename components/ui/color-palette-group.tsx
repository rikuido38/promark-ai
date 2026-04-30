"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Plus, X } from "lucide-react";
import { PaletteColor } from "@/types/settings";

// ─── ColorSwatch ──────────────────────────────────────────────────────────────

interface ColorSwatchProps {
  color: PaletteColor;
  onChange: (value: PaletteColor) => void;
  onRemove: () => void;
}

function ColorSwatch({ color, onChange, onRemove }: ColorSwatchProps) {
  const [hexInput, setHexInput] = useState(color.hex ?? "#000000");

  useEffect(() => {
    setHexInput(color.hex ?? "#000000");
  }, [color.hex]);

  // Build a clean PaletteColor — never spread `color` directly since legacy
  // data may contain numeric keys ("0"–"6") from a previous string-spread bug.
  const clean = (overrides: Partial<PaletteColor>): PaletteColor => ({
    hex: color.hex ?? "#000000",
    ...(color.opacity !== undefined && { opacity: color.opacity }),
    ...(color.description !== undefined && { description: color.description }),
    ...overrides,
  });

  // Use a value sync helper so both onChange and onInput on the native picker work.
  // macOS native color picker fires `change` on close but `input` continuously —
  // attaching both ensures the hex field updates in real-time while dragging.
  const syncPicker = (val: string) => {
    setHexInput(val);
    onChange(clean({ hex: val }));
  };

  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    if (val && !val.startsWith("#")) val = `#${val}`;
    setHexInput(val);
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      onChange(clean({ hex: val }));
    }
  };

  const handleHexBlur = () => {
    if (!/^#[0-9a-fA-F]{6}$/.test(hexInput)) {
      setHexInput(color.hex ?? "#000000");
    }
  };

  const handleOpacityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = Number.parseInt(e.target.value, 10);
    const clamped = Number.isNaN(raw) ? undefined : Math.min(100, Math.max(0, raw));
    onChange(clean({ opacity: clamped }));
  };

  return (
    <div className="flex items-start gap-3">
      {/* Circular color picker — shows hex + opacity visually */}
      <div
        className="relative mt-0.5 h-9 w-9 rounded-full border-2 border-white shadow-sm flex-shrink-0 ring-1 ring-border"
        style={{
          backgroundImage:
            "linear-gradient(45deg,#e0e0e0 25%,transparent 25%)," +
            "linear-gradient(-45deg,#e0e0e0 25%,transparent 25%)," +
            "linear-gradient(45deg,transparent 75%,#e0e0e0 75%)," +
            "linear-gradient(-45deg,transparent 75%,#e0e0e0 75%)",
          backgroundSize: "8px 8px",
          backgroundPosition: "0 0,0 4px,4px -4px,-4px 0px",
        }}
      >
        {/* Colour fill at the current opacity */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            backgroundColor: color.hex ?? "#000000",
            opacity: (color.opacity ?? 100) / 100,
          }}
        />
        {/* Invisible native picker on top — click opens the OS colour picker */}
        <input
          type="color"
          value={color.hex ?? "#000000"}
          onChange={(e) => syncPicker(e.target.value)}
          onInput={(e) => syncPicker(e.currentTarget.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer rounded-full"
        />
      </div>

      {/* Fields column */}
      <div className="flex-1 flex flex-col gap-1.5">
        {/* Row 1: hex + opacity + remove */}
        <div className="flex items-center gap-2">
          <Input
            value={hexInput}
            onChange={handleHexChange}
            onBlur={handleHexBlur}
            maxLength={7}
            className="h-7 w-28 px-2 text-center text-xs font-mono uppercase tracking-wide"
            spellCheck={false}
            aria-label="Hex colour value"
          />
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={0}
              max={100}
              step={10}
              value={color.opacity ?? 100}
              onChange={handleOpacityChange}
              className="h-7 w-16 px-2 text-xs text-center"
              aria-label="Opacity percentage"
            />
            <span className="text-xs text-muted-foreground flex-shrink-0">%</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-destructive ml-auto"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Row 2: description textarea */}
        <textarea
          value={color.description ?? ""}
          onChange={(e) => onChange(clean({ description: e.target.value || undefined }))}
          placeholder="Optional context to AI"
          rows={2}
          className="w-full resize-none rounded-md border border-input bg-background px-2.5 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          aria-label="Colour description"
        />
      </div>
    </div>
  );
}

// ─── ColorPaletteGroup ────────────────────────────────────────────────────────

interface ColorPaletteGroupProps {
  /** Section label shown above the swatches */
  label: string;
  /** Controlled array of PaletteColor objects */
  colors: PaletteColor[];
  /** Called with the updated array whenever a color is added, changed, or removed */
  onChange: (colors: PaletteColor[]) => void;
  /** Text shown when the array is empty */
  emptyText?: string;
  className?: string;
}

export function ColorPaletteGroup({
  label,
  colors,
  onChange,
  emptyText = "No colours added.",
  className,
}: ColorPaletteGroupProps) {
  const [ids, setIds] = useState<string[]>(() =>
    colors.map(() => crypto.randomUUID()),
  );

  const add = () => {
    onChange([...colors, { hex: "#000000" }]);
    setIds((prev) => [...prev, crypto.randomUUID()]);
  };

  const remove = (index: number) => {
    const next = [...colors];
    next.splice(index, 1);
    onChange(next);
    setIds((prev) => {
      const arr = [...prev];
      arr.splice(index, 1);
      return arr;
    });
  };

  const change = (index: number, value: PaletteColor) => {
    const next = [...colors];
    next[index] = value;
    onChange(next);
  };

  return (
    <div className={cn("space-y-3 p-4 border rounded-lg bg-slate-50/50", className)}>
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">{label}</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={add}
          className="h-7 px-2 text-xs"
        >
          <Plus className="h-3 w-3 mr-1" /> Add Color
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        {colors.length === 0 ? (
          <span className="text-sm text-muted-foreground py-2 italic">{emptyText}</span>
        ) : (
          colors.map((color, index) => (
            <ColorSwatch
              key={ids[index]}
              color={color}
              onChange={(v) => change(index, v)}
              onRemove={() => remove(index)}
            />
          ))
        )}
      </div>
    </div>
  );
}
