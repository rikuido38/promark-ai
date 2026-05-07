"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Users,
  Settings,
  Palette,
  BookText,
  ChevronLeft,
  ChevronRight,
  Search,
  Blocks,
  PenLine,
  FolderOpen,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Project } from "@/types/models";

const NAV_LINKS = [
  { href: "/brand/brand-dna", icon: Palette, label: "Brand DNA" },
  {
    href: "/brand/content-library",
    icon: BookText,
    label: "Content Library",
  },
  { href: "/brand/prompt-library", icon: Search, label: "Prompt Library" },
  { href: "#", icon: Users, label: "Customer Segmentation" },
];

const SETTINGS_LINKS = [
  { href: "/settings/ai-assistant", icon: Settings, label: "AI Assistant" },
  { href: "/settings/integrations", icon: Blocks, label: "Integrations" },
];

const CREATE_LINKS = [
  { href: "/studio/illustration", icon: Sparkles, label: "Illustration" },
];

export function SidebarClient({ recentProjects }: { recentProjects: Project[] }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <TooltipProvider delay={0}>
      <div
        className={cn(
          "relative border-r flex flex-col transition-all duration-300 ease-in-out hidden md:flex shrink-0",
          collapsed ? "w-[60px]" : "w-64",
        )}
      >
        {/* Logo */}
        <div
          className={cn(
            "border-b flex items-center py-4 overflow-hidden transition-all duration-300",
            collapsed ? "justify-center px-2" : "px-6",
          )}
        >
          {collapsed ? (
            <div className="relative w-8 h-8">
              <Image
                src="/ge-master-logo.svg"
                alt="Logo"
                fill
                style={{ objectFit: "contain" }}
                priority
              />
            </div>
          ) : (
            <Link href="/" className="flex items-center w-full">
              <div className="relative w-[160px] h-[40px]">
                <Image
                  src="/ge-master-logo.svg"
                  alt="GE Master Logo"
                  fill
                  style={{ objectFit: "contain" }}
                  priority
                />
              </div>
            </Link>
          )}
        </div>

        {/* Nav Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-4 space-y-4">
          {/* Projects — hidden for now */}

          {/* Your collection */}
          <div className={cn("px-3 pt-4")}>
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger>
                  <Link
                    href="/draft"
                    className="flex items-center justify-center h-9 w-9 mx-auto rounded-md hover:bg-muted/50 transition-colors text-muted-foreground"
                  >
                    <PenLine className="h-4 w-4" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">Your collection</TooltipContent>
              </Tooltip>
            ) : (
              <Link
                href="/draft"
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
              >
                <PenLine className="h-4 w-4" />
                Your Collection
              </Link>
            )}
          </div>

          {/* Recent Projects */}
          {recentProjects.length > 0 && (
            <div className={cn("px-3 pt-4")}>
              {!collapsed && (
                <h2 className="mb-2 px-4 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  Recent Projects
                </h2>
              )}
              <div className="space-y-1">
                {recentProjects.map((project) =>
                  collapsed ? (
                    <Tooltip key={project.id}>
                      <TooltipTrigger>
                        <Link
                          href={`/project/${project.id}`}
                          className="flex items-center justify-center h-9 w-9 mx-auto rounded-md hover:bg-muted/50 transition-colors text-muted-foreground"
                        >
                          <FolderOpen className="h-4 w-4" />
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right">{project.name}</TooltipContent>
                    </Tooltip>
                  ) : (
                    <Link
                      key={project.id}
                      href={`/project/${project.id}`}
                      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
                    >
                      <FolderOpen className="h-4 w-4 shrink-0" />
                      <span className="truncate">{project.name}</span>
                    </Link>
                  ),
                )}
              </div>
            </div>
          )}

          {/* Brand */}
          <div className={cn("px-3 pt-4")}>
            {!collapsed && (
              <h2 className="mb-2 px-4 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Brand
              </h2>
            )}
            <div className="space-y-1">
              {NAV_LINKS.map(({ href, icon: Icon, label }) =>
                collapsed ? (
                  <Tooltip key={label}>
                    <TooltipTrigger>
                      <Link
                        href={href}
                        className="flex items-center justify-center h-9 w-9 mx-auto rounded-md hover:bg-muted/50 transition-colors text-muted-foreground"
                      >
                        <Icon className="h-4 w-4" />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">{label}</TooltipContent>
                  </Tooltip>
                ) : (
                  <Link
                    key={label}
                    href={href}
                    className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                ),
              )}
            </div>
          </div>

          {/* Create — hidden for now */}

          {/* Create */}
          <div className={cn("px-3 pt-4")}>
            {!collapsed && (
              <h2 className="mb-2 px-4 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Create
              </h2>
            )}
            <div className="space-y-1">
              {CREATE_LINKS.map(({ href, icon: Icon, label }) =>
                collapsed ? (
                  <Tooltip key={label}>
                    <TooltipTrigger>
                      <Link
                        href={href}
                        className="flex items-center justify-center h-9 w-9 mx-auto rounded-md hover:bg-muted/50 transition-colors text-muted-foreground"
                      >
                        <Icon className="h-4 w-4" />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">{label}</TooltipContent>
                  </Tooltip>
                ) : (
                  <Link
                    key={label}
                    href={href}
                    className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                ),
              )}
            </div>
          </div>

          {/* Settings */}
          <div className={cn("px-3 pt-4 border-t")}>
            {!collapsed && (
              <h2 className="mb-2 px-4 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Settings
              </h2>
            )}
            <div className="space-y-1">
              {SETTINGS_LINKS.map(({ href, icon: Icon, label }) =>
                collapsed ? (
                  <Tooltip key={label}>
                    <TooltipTrigger>
                      <Link
                        href={href}
                        className="flex items-center justify-center h-9 w-9 mx-auto rounded-md hover:bg-muted/50 transition-colors text-muted-foreground"
                      >
                        <Icon className="h-4 w-4" />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">{label}</TooltipContent>
                  </Tooltip>
                ) : (
                  <Link
                    key={label}
                    href={href}
                    className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                ),
              )}
            </div>
          </div>
        </div>

        {/* Toggle Button */}
        <Button
          variant="outline"
          size="icon"
          onClick={() => setCollapsed((v) => !v)}
          className="absolute -right-3.5 top-16 z-10 h-7 w-7 rounded-full border bg-white shadow-md hover:bg-slate-50"
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronLeft className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    </TooltipProvider>
  );
}
