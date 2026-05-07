"use client";

import { useEffect, useState } from "react";
import { ImageIcon, Video, Loader2, ChevronDown, Sparkles, Upload, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { fetchProjectAssets, type AssetItem, type AssetMediaType } from "./actions";
import { ImportAssetsDialog } from "./import-assets-dialog";

type TabState = {
  items: AssetItem[];
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

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
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
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-4 mt-6">
      {["a", "b", "c", "d", "e", "f", "g", "h"].map((key) => (
        <div key={key} className="aspect-square rounded-xl bg-slate-100 animate-pulse" />
      ))}
    </div>
  );
}

function AssetGrid({
  items,
  nextCursor,
  loadingMore,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  onLoadMore,
}: {
  items: AssetItem[];
  nextCursor: string | null;
  loadingMore: boolean;
  emptyIcon: React.ElementType;
  emptyTitle: string;
  emptyDescription: string;
  onLoadMore: () => void;
}) {
  if (!items.length) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
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
              {item.filename || new Date(item.createdAt).toLocaleDateString()}
            </p>
          </div>
        ))}
      </div>

      {nextCursor && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? (
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

// ── Section grid (used inside split view) ────────────────────────────────────

function SectionGrid({ title, items }: { title: string; items: AssetItem[] }) {
  if (!items.length) return null;
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </h3>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
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
              {item.filename || new Date(item.createdAt).toLocaleDateString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Illustration split view ───────────────────────────────────────────────────

function IllustrationSplitView({
  projectItems,
  sharedItems,
  nextCursor,
  loadingMore,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  onLoadMore,
}: {
  projectItems: AssetItem[];
  sharedItems: AssetItem[];
  nextCursor: string | null;
  loadingMore: boolean;
  emptyIcon: React.ElementType;
  emptyTitle: string;
  emptyDescription: string;
  onLoadMore: () => void;
}) {
  if (!projectItems.length && !sharedItems.length) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }
  return (
    <div className="mt-6 space-y-8">
      <SectionGrid title="Project assets" items={projectItems} />
      <SectionGrid title="Shared assets" items={sharedItems} />
      {nextCursor && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? (
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

const TAB_META: Record<
  AssetMediaType,
  { icon: React.ElementType; emptyTitle: string; emptyDescription: string }
> = {
  illustration: {
    icon: Sparkles,
    emptyTitle: "No illustrations yet",
    emptyDescription:
      "Illustrations assigned or shared to this project will appear here.",
  },
  image: {
    icon: ImageIcon,
    emptyTitle: "No images yet",
    emptyDescription:
      "Images assigned or shared to this project will appear here.",
  },
  video: {
    icon: Video,
    emptyTitle: "No videos yet",
    emptyDescription:
      "Videos assigned or shared to this project will appear here.",
  },
};

export function ProjectAssetsGrid({ projectId }: { projectId: string }) {
  const [activeTab, setActiveTab] = useState<AssetMediaType>("illustration");
  const [refreshKey, setRefreshKey] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const [tabs, setTabs] = useState<Record<AssetMediaType, TabState>>({
    illustration: empty(),
    image: empty(),
    video: empty(),
  });

  const current = tabs[activeTab];

  const load = async (mediaType: AssetMediaType, cursor?: string) => {
    setTabs((prev) => ({
      ...prev,
      [mediaType]: { ...prev[mediaType], loadingMore: Boolean(cursor) },
    }));
    try {
      const result = await fetchProjectAssets(projectId, mediaType, cursor);
      setTabs((prev) => ({
        ...prev,
        [mediaType]: {
          items: cursor
            ? [...prev[mediaType].items, ...result.items]
            : result.items,
          nextCursor: result.nextCursor,
          loadingMore: false,
          initialised: true,
        },
      }));
    } catch {
      setTabs((prev) => ({
        ...prev,
        [mediaType]: { ...prev[mediaType], loadingMore: false, initialised: true },
      }));
    }
  };

  // Reload all tabs on refresh
  useEffect(() => {
    if (refreshKey > 0) {
      setTabs({ illustration: empty(), image: empty(), video: empty() });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // Load active tab on first visit
  useEffect(() => {
    if (!tabs[activeTab].initialised) {
      load(activeTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const handleTabChange = (tab: AssetMediaType) => {
    setActiveTab(tab);
  };

  const meta = TAB_META[activeTab];

  let tabContent: React.ReactNode;
  if (!current.initialised) {
    tabContent = <SkeletonGrid />;
  } else if (activeTab === "illustration") {
    const projectItems = current.items.filter((i) => i.source === "project");
    const sharedItems = current.items.filter((i) => i.source === "shared");
    tabContent = (
      <IllustrationSplitView
        projectItems={projectItems}
        sharedItems={sharedItems}
        nextCursor={current.nextCursor}
        loadingMore={current.loadingMore}
        emptyIcon={meta.icon}
        emptyTitle={meta.emptyTitle}
        emptyDescription={meta.emptyDescription}
        onLoadMore={() => load(activeTab, current.nextCursor ?? undefined)}
      />
    );
  } else {
    tabContent = (
      <AssetGrid
        items={current.items}
        nextCursor={current.nextCursor}
        loadingMore={current.loadingMore}
        emptyIcon={meta.icon}
        emptyTitle={meta.emptyTitle}
        emptyDescription={meta.emptyDescription}
        onLoadMore={() => load(activeTab, current.nextCursor ?? undefined)}
      />
    );
  }

  return (
    <div className="w-full">
      {/* Tab bar + Import button */}
      <div className="flex items-center justify-between border-b mb-2">
        <div className="flex gap-1">
          {([
            "illustration",
            "image",
            "video",
          ] as AssetMediaType[]).map((tab) => {
            const { icon: Icon } = TAB_META[tab];
            const isActive = tab === activeTab;
            return (
              <button
                key={tab}
                onClick={() => handleTabChange(tab)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab === "illustration" && "Illustrations"}
                {tab === "image" && "Images"}
                {tab === "video" && "Videos"}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 mb-1">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setImportOpen(true)}
          >
            <Upload className="w-4 h-4" />
            Import assets
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button size="sm" className="gap-1.5" />}>
              <Plus className="w-4 h-4" />
              Create
              <ChevronDown className="w-3.5 h-3.5 ml-0.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => setActiveTab("illustration")}
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Illustration
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setActiveTab("image")}
              >
                <ImageIcon className="w-4 h-4 mr-2" />
                Image
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setActiveTab("video")}
              >
                <Video className="w-4 h-4 mr-2" />
                Video
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Content */}
      {tabContent}

      <ImportAssetsDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        projectId={projectId}
        onImported={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  );
}
