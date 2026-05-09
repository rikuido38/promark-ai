"use client";

import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface ThumbnailIconAction {
  icon: React.ReactNode;
  /**
   * Optional text shown next to the icon (e.g. for a confirm-delete button).
   * When omitted the button is icon-only (square 24 px).
   */
  label?: string;
  ariaLabel: string;
  onClick: (e: React.MouseEvent) => void;
  className?: string;
}

export interface ThumbnailDropdownAction {
  icon?: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}

export interface AssetThumbnailProps {
  signedUrl: string;
  alt?: string;
  /** Short text shown at the bottom-left on hover (e.g. date or filename). */
  bottomLabel?: string;
  /** If set, wraps the image in an `<a>` tag. */
  href?: string;
  /** Icon buttons shown top-right on hover, in order left → right. */
  iconActions?: ThumbnailIconAction[];
  /** Items in the ··· dropdown shown top-right on hover. */
  dropdownActions?: ThumbnailDropdownAction[];
  className?: string;
}

/**
 * Reusable asset thumbnail card used across Studio, Draft, and Project pages.
 *
 * - `iconActions`  — contextual icon buttons (e.g. Edit, Delete) provided by the parent.
 * - `dropdownActions` — contextual three-dot menu items (e.g. Download, Share) provided by the parent.
 *
 * The component owns the hover overlay and action bar layout; all action logic
 * lives in the parent.
 */
export function AssetThumbnail({
  signedUrl,
  alt,
  bottomLabel,
  href,
  iconActions,
  dropdownActions,
  className,
}: AssetThumbnailProps) {
  const hasIcons = (iconActions?.length ?? 0) > 0;
  const hasDropdown = (dropdownActions?.length ?? 0) > 0;

  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={signedUrl}
      alt={alt ?? ""}
      className="w-full h-full object-cover transition-transform group-hover:scale-105"
    />
  );

  return (
    <div
      className={cn(
        "group relative aspect-square overflow-hidden rounded-xl border bg-slate-50 shadow-sm hover:shadow-md transition-shadow",
        className,
      )}
    >
      {href ? (
        <a href={href} className="block w-full h-full">
          {img}
        </a>
      ) : (
        <div className="block w-full h-full">{img}</div>
      )}

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors pointer-events-none" />

      {/* Bottom label */}
      {bottomLabel && (
        <p className="absolute bottom-0 left-0 right-0 px-2 py-1.5 text-[10px] text-white truncate bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          {bottomLabel}
        </p>
      )}

      {/* Top-right action bar — appears on hover */}
      {(hasIcons || hasDropdown) && (
        <div className="absolute top-1.5 right-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {iconActions?.map((action) => (
            <button
              key={action.ariaLabel}
              onClick={action.onClick}
              aria-label={action.ariaLabel}
              className={cn(
                "h-6 flex items-center justify-center rounded-md bg-black/50 text-white hover:bg-black/70 transition-colors",
                action.label ? "px-1.5 gap-1 text-[10px] font-medium" : "w-6",
                action.className,
              )}
            >
              {action.icon}
              {action.label && <span>{action.label}</span>}
            </button>
          ))}

          {hasDropdown && (
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="More options"
                className="h-6 w-6 flex items-center justify-center rounded-md bg-black/50 text-white hover:bg-black/70 transition-colors"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {dropdownActions?.map((item) => (
                  <DropdownMenuItem
                    key={item.label}
                    onClick={item.onClick}
                    className={cn(item.destructive && "text-red-600 focus:text-red-600")}
                  >
                    {item.icon && (
                      <span className="mr-2 [&>svg]:h-4 [&>svg]:w-4">{item.icon}</span>
                    )}
                    {item.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
    </div>
  );
}
