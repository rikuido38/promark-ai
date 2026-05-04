"use client";

import { useState, useCallback } from "react";
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Download, Crop as CropIcon, X, ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { MediaItem } from "@/types/agent";

interface ImagePreviewPanelProps {
  medias: MediaItem[];
}

function defaultCrop(width: number, height: number): Crop {
  return centerCrop(
    makeAspectCrop({ unit: "%", width: 90 }, width / height, width, height),
    width,
    height,
  );
}

export function ImagePreviewPanel({ medias }: ImagePreviewPanelProps) {
  const images = medias.filter((m) => m.type === "image");
  const [activeIndex, setActiveIndex] = useState(0);
  const [cropMode, setCropMode] = useState(false);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [imgRef, setImgRef] = useState<HTMLImageElement | null>(null);
  const [exporting, setExporting] = useState(false);

  const activeImage = images[activeIndex] ?? null;

  const onImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const { naturalWidth, naturalHeight, width, height } = e.currentTarget;
      setNaturalSize({ width: naturalWidth, height: naturalHeight });
      setImgRef(e.currentTarget);
      if (cropMode) {
        setCrop(defaultCrop(width, height));
      }
    },
    [cropMode],
  );

  const handleToggleCrop = () => {
    if (!cropMode && imgRef) {
      setCrop(defaultCrop(imgRef.width, imgRef.height));
      setCompletedCrop(undefined);
    } else {
      setCrop(undefined);
      setCompletedCrop(undefined);
    }
    setCropMode((prev) => !prev);
  };

  const handleExport = async (format: "png" | "svg") => {
    if (!activeImage) return;
    setExporting(true);
    try {
      // Build the pixel-space crop (scale from rendered to natural dimensions)
      let cropPayload: { x: number; y: number; width: number; height: number } | undefined;
      if (completedCrop && imgRef && naturalSize) {
        const scaleX = naturalSize.width / imgRef.width;
        const scaleY = naturalSize.height / imgRef.height;
        cropPayload = {
          x: completedCrop.x * scaleX,
          y: completedCrop.y * scaleY,
          width: completedCrop.width * scaleX,
          height: completedCrop.height * scaleY,
        };
      }

      const res = await fetch("/api/studio/image-process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: activeImage.signedUrl, format, crop: cropPayload }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Export failed");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `illustration.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  if (images.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground bg-slate-50">
        <ImageIcon className="w-12 h-12 opacity-30" />
        <p className="text-sm">Generated illustrations will appear here</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-white shrink-0">
        <span className="text-sm font-medium text-slate-700 truncate">
          {activeImage?.filename ?? "Preview"}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant={cropMode ? "default" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={handleToggleCrop}
            title={cropMode ? "Cancel crop" : "Crop"}
          >
            {cropMode ? <X className="h-4 w-4" /> : <CropIcon className="h-4 w-4" />}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors disabled:pointer-events-none disabled:opacity-50"
              disabled={exporting}
              title="Export"
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport("png")}>Export as PNG</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("svg")}>Export as SVG</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Image canvas */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-4">
        {cropMode ? (
          <ReactCrop
            crop={crop}
            onChange={(c) => setCrop(c)}
            onComplete={(c) => setCompletedCrop(c)}
            className="max-w-full max-h-full"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeImage!.signedUrl}
              alt={activeImage!.filename}
              onLoad={onImageLoad}
              className="max-w-full max-h-[calc(100vh-12rem)] object-contain rounded-lg"
            />
          </ReactCrop>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={activeImage!.signedUrl}
            alt={activeImage!.filename}
            onLoad={onImageLoad}
            className="max-w-full max-h-[calc(100vh-12rem)] object-contain rounded-lg shadow-sm"
          />
        )}
      </div>

      {/* Thumbnail strip (multiple images) */}
      {images.length > 1 && (
        <div className="shrink-0 border-t bg-white px-3 py-2 flex gap-2 overflow-x-auto">
          {images.map((img, i) => (
            <button
              key={img.filename}
              onClick={() => { setActiveIndex(i); setCropMode(false); setCrop(undefined); }}
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
