"use client";

import { useEffect, useState } from "react";
import { Sparkles, Loader2, ChevronDown, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchDrafts, deleteDraft, type DraftItem } from "@/app/draft/actions";

type TabState = {
  items: DraftItem[];
  nextCursor: string | null;
  loadingMore: boolean;
  initialised: boolean;
};

const empty = (): TabState => ({
  items: [],
  nextCursor: null,
  loadingMore: false,
  initialised: false,
});

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      {["a", "b", "c", "d", "e", "f", "g", "h"].map((key) => (
        <div key={key} className="aspect-square rounded-xl bg-slate-100 animate-pulse" />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-3 text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-100 text-slate-400">
        <Sparkles className="w-7 h-7" />
      </div>
      <p className="font-semibold text-base">No illustrations yet</p>
      <p className="text-sm text-muted-foreground max-w-xs">
        Describe what you want to create above and let AI bring it to life.
      </p>
    </div>
  );
}

export function StudioIllustrationGrid() {
  const [state, setState] = useState<TabState>(empty);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    setState((prev) => ({ ...prev, items: prev.items.filter((item) => item.id !== id) }));
    setConfirmId(null);
    try {
      await deleteDraft(id);
    } catch (err) {
      console.error("deleteDraft error:", err);
      fetchDrafts("illustration")
        .then((result) =>
          setState({ items: result.items, nextCursor: result.nextCursor, loadingMore: false, initialised: true }),
        )
        .catch(() => {});
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetchDrafts("illustration")
      .then((result) => {
        if (!cancelled) {
          setState({ items: result.items, nextCursor: result.nextCursor, loadingMore: false, initialised: true });
        }
      })
      .catch((err: unknown) => {
        console.error("fetchDrafts error:", err);
        if (!cancelled) setState({ items: [], nextCursor: null, loadingMore: false, initialised: true });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLoadMore() {
    if (!state.nextCursor || state.loadingMore) return;
    setState((prev) => ({ ...prev, loadingMore: true }));
    try {
      const result = await fetchDrafts("illustration", state.nextCursor);
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
  if (!state.items.length) return <EmptyState />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {state.items.map((item) => (
          <div
            key={item.id}
            className="group relative aspect-square overflow-hidden rounded-xl border bg-slate-50 shadow-sm hover:shadow-md transition-shadow"
          >
            <a href={item.signedUrl} target="_blank" rel="noopener noreferrer" className="block w-full h-full">
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
                  onClick={() => handleDelete(item.id)}
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

      {state.nextCursor && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" size="sm" onClick={handleLoadMore} disabled={state.loadingMore}>
            {state.loadingMore ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <ChevronDown className="h-4 w-4 mr-2" />
            )}
            Show more
          </Button>
        </div>
      )}
    </div>
  );
}
