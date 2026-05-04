"use client";

import { useState } from "react";
import { ImageIcon } from "lucide-react";
import { ImageEditor } from "@/components/ui/image-editor";
import { cn } from "@/lib/utils";
import type { MediaItem } from "@/types/agent";

interface ImagePreviewPanelProps {
  medias: MediaItem[];
  onExportBase64?: (base64: string) => void;
}

export function ImagePreviewPanel({ medias, onExportBase64 }: ImagePreviewPanelProps) {
  const images = medias.filter((m) => m.type === "image");
  const [activeIndex, setActiveIndex] = useState(0);

  if (images.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground bg-slate-50">
        <ImageIcon className="w-12 h-12 opacity-30" />
        <p className="text-sm">Generated illustrations will appear here</p>
      </div>
    );
  }

  const activeImage = images[activeIndex];

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Editor — fills available height */}
      <div className="flex-1 overflow-hidden">
        {/*
          Key on signedUrl so the editor fully remounts (and reloads the canvas)
          whenever the user switches thumbnails.
        */}
        <ImageEditor
          key={activeImage.signedUrl}
          imageUrl={activeImage.signedUrl}
          onExportBase64={onExportBase64}
          className="h-full"
        />
      </div>

      {/* Thumbnail strip — only shown when there are multiple images */}
      {images.length > 1 && (
        <div className="shrink-0 border-t bg-white px-3 py-2 flex gap-2 overflow-x-auto">
          {images.map((img, i) => (
            <button
              key={img.filename}
              type="button"
              onClick={() => setActiveIndex(i)}
              className={cn(
                "h-14 w-14 shrink-0 rounded border-2 overflow-hidden",
                i === activeIndex ? "border-primary" : "border-transparent",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.signedUrl} alt={img.filename} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
