"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronDown, ChevronUp, ImageIcon, Layers, Upload } from "lucide-react";
import { ImageEditor } from "@/components/ui/image-editor";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { MediaItem } from "@/types/agent";
import { publishNewVersion, loadAssetVersions, type AssetVersion } from "./actions";

interface ImagePreviewPanelProps {
  assetId: string;
  medias: MediaItem[];
  onExportBase64?: (base64: string) => void;
  requestedUrl?: { url: string; seq: number };
}

export function ImagePreviewPanel({ assetId, medias, onExportBase64, requestedUrl }: ImagePreviewPanelProps) {
  const images = medias.filter((m) => m.type === "image");
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPublishing, setIsPublishing] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState<AssetVersion[]>([]);
  const [versionsLoaded, setVersionsLoaded] = useState(false);
  const [lastPublishedStoragePath, setLastPublishedStoragePath] = useState<string | null>(null);

  // Always jump to the latest image whenever the list grows (new generation or initial load).
  useEffect(() => {
    if (images.length > 0) setActiveIndex(images.length - 1);
  }, [images.length]);

  // Jump to a specific image when requested (e.g. from "Send to editor" in chatbot).
  useEffect(() => {
    if (!requestedUrl) return;
    const idx = images.findIndex((img) => img.signedUrl === requestedUrl.url);
    if (idx !== -1) setActiveIndex(idx);
  }, [requestedUrl, images]);

  const fetchVersions = useCallback(async () => {
    try {
      const data = await loadAssetVersions(assetId);
      setVersions(data);
      if (data.length > 0) {
        setLastPublishedStoragePath(data.at(-1)?.storagePath ?? null);
      }
    } catch {
      // silent
    } finally {
      setVersionsLoaded(true);
    }
  }, [assetId]);

  useEffect(() => {
    void fetchVersions();
  }, [fetchVersions]);

  const handlePublish = async () => {
    const activeImage = images[activeIndex];
    if (!activeImage?.storagePath) {
      toast.error("No storage path available for this image");
      return;
    }
    setIsPublishing(true);
    try {
      const result = await publishNewVersion(assetId, activeImage.storagePath);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`Version ${result.version} published`);
        setLastPublishedStoragePath(activeImage.storagePath);
        await fetchVersions();
        setVersionsOpen(true);
      }
    } catch (err) {
      toast.error("Failed to publish version");
      console.error(err);
    } finally {
      setIsPublishing(false);
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

  const activeImage = images[activeIndex];
  const hasStoragePath = !!activeImage?.storagePath;
  const isDirty = activeImage?.storagePath !== lastPublishedStoragePath;

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Top action toolbar */}
      <div className="flex items-center justify-end gap-2 px-3 py-2 border-b bg-white shrink-0">
        <Button
          size="sm"
          className="h-7 text-xs px-3 gap-1.5"
          onClick={() => void handlePublish()}
          disabled={isPublishing || !hasStoragePath || !isDirty}
        >
          <Upload className="h-3 w-3" />
          {isPublishing ? "Publishing…" : "Publish new version"}
        </Button>
      </div>

      {/* Editor — fills available height */}
      <div className="flex-1 overflow-hidden min-h-0">
        <ImageEditor
          key={activeImage.signedUrl}
          imageUrl={activeImage.signedUrl}
          onExportBase64={onExportBase64}
          className="h-full"
        />
      </div>

      {/* Collapsible version panel */}
      <div className="shrink-0 border-t bg-white">
        <button
          type="button"
          className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          onClick={() => setVersionsOpen((prev) => !prev)}
        >
          <span className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5" />
            Versions
            {versionsLoaded && versions.length > 0 && (
              <span className="bg-slate-200 text-slate-600 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none">
                {versions.length}
              </span>
            )}
          </span>
          {versionsOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        {versionsOpen && (
          <div className="px-3 pb-3">
            {versions.length === 0 ? (
              <p className="text-xs text-slate-400 py-1">No published versions yet.</p>
            ) : (
              <div className="flex gap-2 overflow-x-auto py-1">
                {versions.map((v) => (
                  <div key={v.version} className={cn("shrink-0 flex flex-col items-center gap-1")}>
                    <div
                      className="h-16 w-16 rounded-md overflow-hidden border border-slate-200 bg-white"
                      style={{
                        backgroundImage:
                          "linear-gradient(45deg,#d0d0d0 25%,transparent 25%)," +
                          "linear-gradient(-45deg,#d0d0d0 25%,transparent 25%)," +
                          "linear-gradient(45deg,transparent 75%,#d0d0d0 75%)," +
                          "linear-gradient(-45deg,transparent 75%,#d0d0d0 75%)",
                        backgroundSize: "10px 10px",
                        backgroundPosition: "0 0,0 5px,5px -5px,-5px 0px",
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={v.signedUrl}
                        alt={`Version ${v.version}`}
                        className="h-16 w-16 object-cover"
                      />
                    </div>
                    <span className="text-[10px] text-slate-500">v{v.version}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
