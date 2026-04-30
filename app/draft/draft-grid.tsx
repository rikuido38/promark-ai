"use client";

import { useEffect, useState } from "react";
import { ImageIcon, Video, Loader2, ChevronDown, Trash2, Check, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
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
          <div
            key={item.id}
            className="group relative aspect-square overflow-hidden rounded-xl border bg-slate-50 shadow-sm hover:shadow-md transition-shadow"
          >
            <a
              href={item.signedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full h-full"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.signedUrl}
                alt={item.filename}
                className="w-full h-full object-cover transition-transform group-hover:scale-105"
              />
            </a>
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors pointer-events-none" />
            <p className="absolute bottom-0 left-0 right-0 px-2 py-1.5 text-[10px] text-white truncate bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              {new Date(item.createdAt).toLocaleDateString()}
            </p>
            {confirmId === item.id ? (
              <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
                <button
                  onClick={() => { onDelete(item.id); setConfirmId(null); }}
                  className="h-6 px-1.5 flex items-center gap-1 rounded-md bg-red-600 text-white text-[10px] font-medium hover:bg-red-700"
                  aria-label="Confirm delete"
                >
                  <Check className="h-3 w-3" /> Delete
                </button>
                <button
                  onClick={() => setConfirmId(null)}
                  className="h-6 w-6 flex items-center justify-center rounded-md bg-black/50 text-white hover:bg-black/70"
                  aria-label="Cancel delete"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmId(item.id)}
                className="absolute top-1.5 right-1.5 h-6 w-6 flex items-center justify-center rounded-md bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                aria-label="Delete draft"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
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

// ── Illustration grid ─────────────────────────────────────────────────────────

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
          <div
            key={item.id}
            className="group relative aspect-square overflow-hidden rounded-xl border bg-slate-50 shadow-sm hover:shadow-md transition-shadow"
          >
            <a
              href={item.signedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full h-full"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.signedUrl}
                alt={item.filename}
                className="w-full h-full object-cover transition-transform group-hover:scale-105"
              />
            </a>
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors pointer-events-none" />
            <p className="absolute bottom-0 left-0 right-0 px-2 py-1.5 text-[10px] text-white truncate bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              {new Date(item.createdAt).toLocaleDateString()}
            </p>
            {confirmId === item.id ? (
              <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
                <button
                  onClick={() => { onDelete(item.id); setConfirmId(null); }}
                  className="h-6 px-1.5 flex items-center gap-1 rounded-md bg-red-600 text-white text-[10px] font-medium hover:bg-red-700"
                  aria-label="Confirm delete"
                >
                  <Check className="h-3 w-3" /> Delete
                </button>
                <button
                  onClick={() => setConfirmId(null)}
                  className="h-6 w-6 flex items-center justify-center rounded-md bg-black/50 text-white hover:bg-black/70"
                  aria-label="Cancel delete"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmId(item.id)}
                className="absolute top-1.5 right-1.5 h-6 w-6 flex items-center justify-center rounded-md bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                aria-label="Delete draft"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
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
