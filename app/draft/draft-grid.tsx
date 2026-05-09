"use client";

import { useEffect, useState } from "react";
import { ImageIcon, Video, Loader2, ChevronDown, Pencil, Trash2, Check, X, Sparkles, Download, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AssetThumbnail } from "@/components/ui/asset-thumbnail";
import { fetchDrafts, deleteDraft, type DraftItem, type DraftMediaType } from "./actions";

// ── Per-tab state ─────────────────────────────────────────────────────────────

type TabState = {
  items: DraftItem[];
  nextCursor: string | null;
  /** Only true while the "show more" button was clicked — not the initial load. */
  loadingMore: boolean;
  initialised: boolean;
};

const empty = (): TabState => ({
  items: [],
  nextCursor: null,
  loadingMore: false,
  initialised: false,
});

// ── Empty / loading placeholders ──────────────────────────────────────────────

function EmptyState({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 space-y-3 text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-100 text-slate-400">
        <Icon className="w-7 h-7" />
      </div>
      <p className="font-semibold text-base">{title}</p>
      <p className="text-sm text-muted-foreground max-w-xs">{description}</p>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6">
      {["a", "b", "c", "d", "e", "f"].map((key) => (
        <div key={key} className="aspect-square rounded-xl bg-slate-100 animate-pulse" />
      ))}
    </div>
  );
}

// ── Image grid ────────────────────────────────────────────────────────────────

function ImageGrid({
  items,
  nextCursor,
  loadingMore,
  onLoadMore,
  onDelete,
}: {
  items: DraftItem[];
  nextCursor: string | null;
  loadingMore: boolean;
  onLoadMore: () => void;
  onDelete: (id: string) => void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  if (!items.length) {
    return (
      <EmptyState
        icon={ImageIcon}
        title="No images yet"
        description="Generate on-brand images using the AI assistant, then save them here."
      />
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {items.map((item) => (
          <AssetThumbnail
            key={item.id}
            id={item.id}
            signedUrl={item.signedUrl}
            alt={item.filename}
            bottomLabel={new Date(item.createdAt).toLocaleDateString()}
            iconActions={
              confirmId === item.id
                ? [
                    {
                      icon: <Check className="h-3 w-3" />,
                      label: "Delete",
                      ariaLabel: "Confirm delete",
                      onClick: () => { onDelete(item.id); setConfirmId(null); },
                      className: "bg-red-600 hover:bg-red-700",
                    },
                    {
                      icon: <X className="h-3.5 w-3.5" />,
                      ariaLabel: "Cancel delete",
                      onClick: () => setConfirmId(null),
                    },
                  ]
                : [
                    {
                      icon: <Pencil className="h-3.5 w-3.5" />,
                      ariaLabel: "Edit image",
                      onClick: () => {},
                    },
                    {
                      icon: <Trash2 className="h-3.5 w-3.5" />,
                      ariaLabel: "Delete image",
                      onClick: () => setConfirmId(item.id),
                      className: "hover:bg-red-600",
                    },
                  ]
            }
            dropdownActions={[
              {
                icon: <Download />,
                label: "Download",
                onClick: () => window.open(item.signedUrl, "_blank"),
              },
              {
                icon: <Share2 />,
                label: "Share",
                onClick: () => navigator.clipboard.writeText(item.signedUrl),
              },
            ]}
          />
        ))}
      </div>

      {nextCursor && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" size="sm" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ChevronDown className="h-4 w-4 mr-2" />}
            Show more
          </Button>
        </div>
      )}
    </div>
  );
}

function IllustrationGrid({
  items,
  nextCursor,
  loadingMore,
  onLoadMore,
  onDelete,
}: {
  items: DraftItem[];
  nextCursor: string | null;
  loadingMore: boolean;
  onLoadMore: () => void;
  onDelete: (id: string) => void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  if (!items.length) {
    return (
      <EmptyState
        icon={Sparkles}
        title="No illustrations yet"
        description="Generate on-brand illustrations using the AI assistant, then save them here."
      />
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {items.map((item) => (
          <AssetThumbnail
            key={item.id}
            id={item.id}
            signedUrl={item.signedUrl}
            alt={item.filename}
            bottomLabel={new Date(item.createdAt).toLocaleDateString()}
            iconActions={
              confirmId === item.id
                ? [
                    {
                      icon: <Check className="h-3 w-3" />,
                      label: "Delete",
                      ariaLabel: "Confirm delete",
                      onClick: () => { onDelete(item.id); setConfirmId(null); },
                      className: "bg-red-600 hover:bg-red-700",
                    },
                    {
                      icon: <X className="h-3.5 w-3.5" />,
                      ariaLabel: "Cancel delete",
                      onClick: () => setConfirmId(null),
                    },
                  ]
                : [
                    {
                      icon: <Pencil className="h-3.5 w-3.5" />,
                      ariaLabel: "Edit illustration",
                      onClick: () => {},
                    },
                    {
                      icon: <Trash2 className="h-3.5 w-3.5" />,
                      ariaLabel: "Delete illustration",
                      onClick: () => setConfirmId(item.id),
                      className: "hover:bg-red-600",
                    },
                  ]
            }
            dropdownActions={[
              {
                icon: <Download />,
                label: "Download",
                onClick: () => window.open(item.signedUrl, "_blank"),
              },
              {
                icon: <Share2 />,
                label: "Share",
                onClick: () => navigator.clipboard.writeText(item.signedUrl),
              },
            ]}
          />
        ))}
      </div>

      {nextCursor && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" size="sm" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ChevronDown className="h-4 w-4 mr-2" />}
            Show more
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Video list ────────────────────────────────────────────────────────────────

function VideoList({
  items,
  nextCursor,
  loadingMore,
  onLoadMore,
}: {
  items: DraftItem[];
  nextCursor: string | null;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  if (!items.length) {
    return (
      <EmptyState
        icon={Video}
        title="No videos yet"
        description="Create short-form video content from the AI assistant, then save them here."
      />
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {items.map((item) => (
          <div key={item.id} className="rounded-xl border bg-slate-50 overflow-hidden shadow-sm">
            <video
              src={item.signedUrl}
              controls
              className="w-full aspect-video object-cover"
            >
              <track kind="captions" />
            </video>
            <div className="px-3 py-2 text-xs text-muted-foreground">
              {new Date(item.createdAt).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>

      {nextCursor && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" size="sm" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ChevronDown className="h-4 w-4 mr-2" />}
            Show more
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function DraftGrid({ mediaType }: { mediaType: DraftMediaType }) {
  const [state, setState] = useState<TabState>(empty);

  async function handleDelete(id: string) {
    setState((prev) => ({ ...prev, items: prev.items.filter((item) => item.id !== id) }));
    try {
      await deleteDraft(id);
    } catch (err) {
      console.error("deleteDraft error:", err);
      // Re-fetch to restore accurate state on failure.
      fetchDrafts(mediaType).then((result) =>
        setState({ items: result.items, nextCursor: result.nextCursor, loadingMore: false, initialised: true }),
      ).catch(() => {});
    }
  }

  // Initial load on mount — effect only starts the async operation, no
  // synchronous setState call here to avoid cascading renders.
  useEffect(() => {
    let cancelled = false;
    fetchDrafts(mediaType)
      .then((result) => {
        if (!cancelled) {
          setState({
            items: result.items,
            nextCursor: result.nextCursor,
            loadingMore: false,
            initialised: true,
          });
        }
      })
      .catch((err: unknown) => {
        console.error("fetchDrafts error:", err);
        if (!cancelled) setState({ items: [], nextCursor: null, loadingMore: false, initialised: true });
      });
    return () => { cancelled = true; };
  }, [mediaType]);

  // "Show more" — called from a click handler, so it's safe to setState here.
  async function handleLoadMore() {
    if (!state.nextCursor || state.loadingMore) return;
    setState((prev) => ({ ...prev, loadingMore: true }));
    try {
      const result = await fetchDrafts(mediaType, state.nextCursor);
      setState((prev) => ({
        items: [...prev.items, ...result.items],
        nextCursor: result.nextCursor,
        loadingMore: false,
        initialised: true,
      }));
    } catch (err) {
      console.error("fetchDrafts load more error:", err);
      setState((prev) => ({ ...prev, loadingMore: false }));
    }
  }

  if (!state.initialised) return <SkeletonGrid />;

  if (mediaType === "image") {
    return (
      <ImageGrid
        items={state.items}
        nextCursor={state.nextCursor}
        loadingMore={state.loadingMore}
        onLoadMore={handleLoadMore}
        onDelete={handleDelete}
      />
    );
  }

  if (mediaType === "illustration") {
    return (
      <IllustrationGrid
        items={state.items}
        nextCursor={state.nextCursor}
        loadingMore={state.loadingMore}
        onLoadMore={handleLoadMore}
        onDelete={handleDelete}
      />
    );
  }

  return (
    <VideoList
      items={state.items}
      nextCursor={state.nextCursor}
      loadingMore={state.loadingMore}
      onLoadMore={handleLoadMore}
    />
  );
}
