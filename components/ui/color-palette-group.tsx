"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Plus, X } from "lucide-react";

// ─── ColorSwatch ──────────────────────────────────────────────────────────────

interface ColorSwatchProps {
  color: string;
  onChange: (value: string) => void;
  onRemove: () => void;
}

function ColorSwatch({ color, onChange, onRemove }: ColorSwatchProps) {
  const [hexInput, setHexInput] = useState(color);

  // Sync display when the color changes via picker or external update
  useEffect(() => {
    setHexInput(color);
  }, [color]);

  const handlePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    setHexInput(e.target.value);
  };

  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    if (val && !val.startsWith("#")) val = `#${val}`;
    setHexInput(val);
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      onChange(val);
    }
  };

  const handleHexBlur = () => {
    if (!/^#[0-9a-fA-F]{6}$/.test(hexInput)) {
      setHexInput(color);
    }
  };

  return (
    <div className="relative group flex flex-col items-center gap-1.5">
      {/* Circular color picker */}
      <div className="relative h-10 w-10 rounded-full border-2 border-white shadow-sm overflow-hidden flex-shrink-0 ring-1 ring-border">
        <input
          type="color"
          value={color}
          onChange={handlePickerChange}
          className="absolute inset-[-10px] w-16 h-16 cursor-pointer"
        />
      </div>
      {/* Hex text input */}
      <Input
        value={hexInput}
        onChange={handleHexChange}
        onBlur={handleHexBlur}
        maxLength={7}
        className="h-6 w-[72px] px-1 text-center text-[10px] font-mono uppercase tracking-wide"
        spellCheck={false}
        aria-label="Hex colour value"
      />
      {/* Remove button */}
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={onRemove}
        className="absolute -top-2 -right-2 h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
      >
        <X className="w-3 h-3" />
      </Button>
    </div>
  );
}

// ─── ColorPaletteGroup ────────────────────────────────────────────────────────

interface ColorPaletteGroupProps {
  /** Section label shown above the swatches */
  label: string;
  /** Controlled array of hex strings, e.g. ["#ff0000", "#00ff00"] */
  colors: string[];
  /** Called with the updated array whenever a color is added, changed, or removed */
  onChange: (colors: string[]) => void;
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
  // Stable IDs so React never remounts swatches on value change
  const [ids, setIds] = useState<string[]>(() =>
    colors.map(() => crypto.randomUUID()),
  );

  const add = () => {
    onChange([...colors, "#000000"]);
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

  const change = (index: number, value: string) => {
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
      <div className="flex flex-wrap gap-x-3 gap-y-4">
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
