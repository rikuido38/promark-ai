"use client";

import { useState, useEffect } from "react";
import { ImageIcon } from "lucide-react";
import { ImageEditor } from "@/components/ui/image-editor";
import type { MediaItem } from "@/types/agent";

interface ImagePreviewPanelProps {
  medias: MediaItem[];
  onExportBase64?: (base64: string) => void;
  requestedUrl?: { url: string; seq: number };
}

export function ImagePreviewPanel({ medias, onExportBase64, requestedUrl }: ImagePreviewPanelProps) {
  const images = medias.filter((m) => m.type === "image");
  const [activeIndex, setActiveIndex] = useState(0);

  // Always jump to the latest image whenever the list grows (new generation or initial load).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (images.length > 0) setActiveIndex(images.length - 1);
  }, [images.length]);

  // Jump to a specific image when requested (e.g. from "Send to editor" in chatbot).
  useEffect(() => {
    if (!requestedUrl) return;
    const idx = images.findIndex((img) => img.signedUrl === requestedUrl.url);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (idx !== -1) setActiveIndex(idx);
  }, [requestedUrl, images]);

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

    </div>
  );
}
