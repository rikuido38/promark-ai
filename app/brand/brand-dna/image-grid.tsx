"use client";

import { useRef, useState, useEffect } from "react";
import { Media } from "@/types/models";
import { ImagePlus, Loader2, X } from "lucide-react";

// ─── IllustrationItem ─────────────────────────────────────────────────────────

export interface IllustrationItem {
  clientId: string;
  media: Media;
  previewUrl: string;
  uploading: boolean;
}

export function makeItem(media: Media, previewUrl: string): IllustrationItem {
  return { clientId: crypto.randomUUID(), media, previewUrl, uploading: false };
}

export function makePlaceholder(file: File): IllustrationItem {
  return {
    clientId: crypto.randomUUID(),
    media: { filename: file.name, url: "" },
    previewUrl: URL.createObjectURL(file),
    uploading: true,
  };
}

// ─── ImageGrid ────────────────────────────────────────────────────────────────

export function ImageGrid({
  items,
  max,
  onAdd,
  onRemove,
  disabled,
}: {
  items: IllustrationItem[];
  max: number;
  onAdd: (files: FileList) => void;
  onRemove: (clientId: string) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const hasUploading = items.some((i) => i.uploading);
  const [lightbox, setLightbox] = useState<IllustrationItem | null>(null);

  useEffect(() => {
    if (lightbox) {
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [lightbox]);

  return (
    <>
      <div className="flex flex-wrap gap-3">
        {items.map((item) => (
          <div
            key={item.clientId}
            className="relative group w-24 h-24 rounded-lg border bg-slate-50 overflow-hidden flex-shrink-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.previewUrl}
              alt={item.media.filename}
              className="w-full h-full object-cover"
            />
            {!item.uploading && (
              <button
                type="button"
                onClick={() => setLightbox(item)}
                className="absolute inset-0 w-full h-full cursor-zoom-in focus:outline-none"
                aria-label={`Preview ${item.media.filename}`}
              />
            )}
            {item.uploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg">
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              </div>
            )}
            {!item.uploading && (
              <button
                type="button"
                onClick={() => onRemove(item.clientId)}
                className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label={`Remove ${item.media.filename}`}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}

        {items.length < max && (
          <>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) onAdd(e.target.files);
                (e.target as HTMLInputElement).value = "";
              }}
            />
            <button
              type="button"
              disabled={disabled || hasUploading}
              onClick={() => inputRef.current?.click()}
              className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 hover:border-gray-400 bg-gray-50/50 flex flex-col items-center justify-center gap-1.5 text-muted-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ImagePlus className="w-5 h-5" />
              <span className="text-xs font-medium">Add</span>
            </button>
          </>
        )}
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
              src={lightbox.previewUrl}
              alt={lightbox.media.filename}
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
              {lightbox.media.filename}
            </p>
          </div>
        )}
      </dialog>
    </>
  );
}
