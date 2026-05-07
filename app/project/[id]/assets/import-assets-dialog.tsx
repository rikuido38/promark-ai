"use client";

import { useState, useRef, useEffect, useCallback, useTransition } from "react";
import { useDropzone } from "react-dropzone";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Upload,
  FolderOpen,
  ChevronDown,
  ImageIcon,
  Video,
  Sparkles,
  X,
  Check,
} from "lucide-react";
import {
  fetchUserCollectionAssets,
  shareAssetsToProject,
  uploadFilesToProject,
  type CollectionAssetItem,
} from "./import-actions";

// ── Types ─────────────────────────────────────────────────────────────────────

type TabId = "collection" | "upload";

type FileEntry = {
  id: string;
  file: File;
  previewUrl: string | null;
  mediaType: "image" | "video";
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const MEDIA_TYPE_ICONS: Record<
  CollectionAssetItem["mediaType"],
  React.ElementType
> = {
  illustration: Sparkles,
  image: ImageIcon,
  video: Video,
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── "Your collection" tab ─────────────────────────────────────────────────────

function CollectionTab({
  projectId,
  onImported,
}: {
  projectId: string;
  onImported: () => void;
}) {
  const [items, setItems] = useState<CollectionAssetItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mediaFilter, setMediaFilter] = useState<CollectionAssetItem["mediaType"] | "all">("all");
  const [isPending, startTransition] = useTransition();

  const load = useCallback(async (cursor?: string) => {
    if (cursor) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    try {
      const result = await fetchUserCollectionAssets(cursor);
      setItems((prev) =>
        cursor ? [...prev, ...result.items] : result.items,
      );
      setNextCursor(result.nextCursor);
    } finally {
      if (cursor) {
        setLoadingMore(false);
      } else {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleImport = () => {
    startTransition(async () => {
      await shareAssetsToProject(projectId, Array.from(selected));
      setSelected(new Set());
      onImported();
    });
  };

  const assetSuffix = selected.size === 1 ? "asset" : "assets";
  const visibleItems = mediaFilter === "all" ? items : items.filter((i) => i.mediaType === mediaFilter);

  if (loading) {
    return (
      <div className="grid grid-cols-5 gap-2 mt-4">
        {["a", "b", "c", "d", "e", "f"].map((k) => (
          <div
            key={k}
            className="aspect-square rounded-lg bg-slate-100 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
        <ImageIcon className="w-10 h-10 mb-3 opacity-30" />
        <p className="font-medium">No assets in your collection yet</p>
        <p className="text-sm mt-1">Assets you generate will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {selected.size > 0
            ? `${selected.size} selected`
            : "Click to select assets to import"}
        </p>
        <select
          value={mediaFilter}
          onChange={(e) => setMediaFilter(e.target.value as typeof mediaFilter)}
          className="text-sm border rounded-md px-2 py-1 bg-background"
        >
          <option value="all">All</option>
          <option value="illustration">Illustration</option>
          <option value="image">Image</option>
          <option value="video">Video</option>
        </select>
      </div>
      <div className="grid grid-cols-5 gap-2 max-h-[380px] overflow-y-auto pr-1">
        {visibleItems.map((item) => {
          const isSelected = selected.has(item.id);
          const Icon = MEDIA_TYPE_ICONS[item.mediaType];
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => toggle(item.id)}
              className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                isSelected
                  ? "border-primary ring-2 ring-primary/30"
                  : "border-transparent"
              }`}
            >
              {item.signedUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.signedUrl}
                  alt={item.filename}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-slate-100 flex items-center justify-center">
                  <Icon className="w-8 h-8 text-slate-400" />
                </div>
              )}
              {isSelected && (
                <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                  <Check className="w-3 h-3 text-primary-foreground" />
                </div>
              )}
            </button>
          );
        })}
      </div>
      {!visibleItems.length && (
        <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
          <ImageIcon className="w-8 h-8 mb-2 opacity-30" />
          <p className="text-sm">No assets match this filter</p>
        </div>
      )}
      {nextCursor && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => load(nextCursor ?? undefined)}
            disabled={loadingMore}
          >
            {loadingMore ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <ChevronDown className="h-4 w-4 mr-2" />
            )}
            Load more
          </Button>
        </div>
      )}
      <div className="flex justify-end pt-2 border-t">
        <Button
          onClick={handleImport}
          disabled={selected.size === 0 || isPending}
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Import
          {selected.size > 0
            ? ` ${selected.size} ${assetSuffix}`
            : ""}
        </Button>
      </div>
    </div>
  );
}

// ── Upload tab ────────────────────────────────────────────────────────────────

function UploadTab({
  projectId,
  onImported,
}: {
  projectId: string;
  onImported: () => void;
}) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const current = files;
    return () => {
      current.forEach((f) => {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = useCallback((newFiles: File[]) => {
    const entries: FileEntry[] = newFiles
      .filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"))
      .map((f) => ({
        id: crypto.randomUUID(),
        file: f,
        previewUrl: f.type.startsWith("image/") ? URL.createObjectURL(f) : null,
        mediaType: f.type.startsWith("video/") ? "video" : "image",
      }));

    setFiles((prev) => {
      const existing = new Set(prev.map((p) => p.file.name));
      return [...prev, ...entries.filter((e) => !existing.has(e.file.name))];
    });
  }, []);

  const remove = (id: string) => {
    setFiles((prev) => {
      const entry = prev.find((f) => f.id === id);
      if (entry?.previewUrl) URL.revokeObjectURL(entry.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "image/*": [], "video/*": [] },
    onDrop: addFiles,
    noClick: true,
  });

  const handleConfirm = () => {
    startTransition(async () => {
      const fd = new FormData();
      files.forEach((entry) => fd.append("files", entry.file));
      await uploadFilesToProject(projectId, fd);
      files.forEach((f) => {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      });
      setFiles([]);
      onImported();
    });
  };

  const fileSuffix = files.length === 1 ? "file" : "files";

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
          isDragActive
            ? "border-primary bg-primary/5"
            : "border-slate-200 hover:border-slate-300"
        }`}
      >
        <input {...getInputProps()} />
        <Upload className="w-8 h-8 mx-auto mb-3 text-slate-400" />
        <p className="text-sm font-medium">Drag files here</p>
        <p className="text-xs text-muted-foreground mt-1">
          Images and videos accepted
        </p>
        <div className="flex justify-center gap-2 mt-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            Add files
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => folderInputRef.current?.click()}
          >
            <FolderOpen className="h-3.5 w-3.5 mr-1.5" />
            Add folder
          </Button>
        </div>
      </div>

      {/* Hidden inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) addFiles(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
      {/* @ts-expect-error webkitdirectory is non-standard */}
      <input
        ref={folderInputRef}
        type="file"
        webkitdirectory=""
        multiple
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) addFiles(Array.from(e.target.files));
          e.target.value = "";
        }}
      />

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
          {files.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-3 p-2 rounded-lg border bg-slate-50"
            >
              <div className="w-10 h-10 rounded-md overflow-hidden shrink-0 bg-slate-200 flex items-center justify-center">
                {entry.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={entry.previewUrl}
                    alt={entry.file.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Video className="w-5 h-5 text-slate-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{entry.file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(entry.file.size)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(entry.id)}
                className="h-6 w-6 flex items-center justify-center rounded hover:bg-slate-200 shrink-0"
                aria-label="Remove file"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end pt-2 border-t">
        <Button
          onClick={handleConfirm}
          disabled={files.length === 0 || isPending}
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Upload &amp; Import
          {files.length > 0
            ? ` ${files.length} ${fileSuffix}`
            : ""}
        </Button>
      </div>
    </div>
  );
}

// ── Main dialog ───────────────────────────────────────────────────────────────

export function ImportAssetsDialog({
  open,
  onOpenChange,
  projectId,
  onImported,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  onImported: () => void;
}) {
  const [activeTab, setActiveTab] = useState<TabId>("collection");

  const handleImported = () => {
    onOpenChange(false);
    onImported();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Choose the sources</DialogTitle>
        </DialogHeader>

        {/* Tab bar */}
        <div className="flex gap-1 border-b -mx-6 px-6">
          {(["collection", "upload"] as TabId[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "collection" ? "Your collection" : "Upload files"}
            </button>
          ))}
        </div>

        <div className="pt-2">
          {activeTab === "collection" && (
            <CollectionTab
              projectId={projectId}
              onImported={handleImported}
            />
          )}
          {activeTab === "upload" && (
            <UploadTab projectId={projectId} onImported={handleImported} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
