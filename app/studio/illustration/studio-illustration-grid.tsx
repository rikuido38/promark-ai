"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, ChevronDown, Pencil, Trash2, Check, X, Download, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AssetThumbnail } from "@/components/ui/asset-thumbnail";
import { fetchStudioIllustrations, deleteStudioIllustration, type IllustrationItem } from "./actions";

type TabState = {
  items: IllustrationItem[];
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
  const router = useRouter();
  const [state, setState] = useState<TabState>(empty);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function handleDelete(assetId: string) {
    setState((prev) => ({ ...prev, items: prev.items.filter((item) => item.assetId !== assetId) }));
    setConfirmId(null);
    try {
      await deleteStudioIllustration(assetId);
    } catch (err) {
      console.error("deleteStudioIllustration error:", err);
      fetchStudioIllustrations()
        .then((result) =>
          setState({ items: result.items, nextCursor: result.nextCursor, loadingMore: false, initialised: true }),
        )
        .catch(() => {});
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetchStudioIllustrations()
      .then((result) => {
        if (!cancelled) {
          setState({ items: result.items, nextCursor: result.nextCursor, loadingMore: false, initialised: true });
        }
      })
      .catch((err: unknown) => {
        console.error("fetchStudioIllustrations error:", err);
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
      const result = await fetchStudioIllustrations(state.nextCursor);
      setState((prev) => ({
        items: [...prev.items, ...result.items],
        nextCursor: result.nextCursor,
        loadingMore: false,
        initialised: true,
      }));
    } catch (err) {
      console.error("fetchStudioIllustrations load more error:", err);
      setState((prev) => ({ ...prev, loadingMore: false }));
    }
  }

  if (!state.initialised) return <SkeletonGrid />;
  if (!state.items.length) return <EmptyState />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {state.items.map((item) => (
          <AssetThumbnail
            key={item.assetId}
            signedUrl={item.signedUrl}
            alt="Illustration"
            bottomLabel={new Date(item.createdAt).toLocaleDateString()}
            href={`/studio/illustration/${item.assetId}`}
            iconActions={
              confirmId === item.assetId
                ? [
                    {
                      icon: <Check className="h-3 w-3" />,
                      label: "Delete",
                      ariaLabel: "Confirm delete",
                      onClick: (e) => { e.preventDefault(); void handleDelete(item.assetId); },
                      className: "bg-red-600 hover:bg-red-700",
                    },
                    {
                      icon: <X className="h-3.5 w-3.5" />,
                      ariaLabel: "Cancel delete",
                      onClick: (e) => { e.preventDefault(); setConfirmId(null); },
                    },
                  ]
                : [
                    {
                      icon: <Pencil className="h-3.5 w-3.5" />,
                      ariaLabel: "Edit illustration",
                      onClick: (e) => { e.preventDefault(); router.push(`/studio/illustration/${item.assetId}`); },
                    },
                    {
                      icon: <Trash2 className="h-3.5 w-3.5" />,
                      ariaLabel: "Delete illustration",
                      onClick: (e) => { e.preventDefault(); setConfirmId(item.assetId); },
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
