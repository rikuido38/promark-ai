"use client";

/**
 * ImageEditor — frontend canvas-based image editor built on Fabric.js.
 *
 * Features:
 *   • Select / move / resize existing objects
 *   • Crop   — drag a dashed rect overlay, then "Apply Crop"
 *   • Shapes — click to place a Rectangle or Circle
 *   • Text   — click to place an editable IText overlay
 *   • Export — Download PNG  |  Send base64 PNG to AI callback
 *
 * Fabric is loaded via dynamic import (avoids SSR issues in Next.js).
 */

import React, { useEffect, useRef, useState } from "react";
import {
  Check,
  Circle as CircleIcon,
  Crop,
  Loader2,
  MousePointer2,
  Square,
  Type,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type EditorMode = "select" | "crop" | "rect" | "circle" | "text";

// Minimal shape of the subset of the fabric module we use
type FabricModule = {
  Canvas: new (el: HTMLCanvasElement, opts?: object) => FabricCanvas;
  FabricImage: {
    fromURL: (url: string, opts?: object) => Promise<FabricObj>;
  };
  Rect: new (opts?: object) => FabricObj;
  Circle: new (opts?: object) => FabricObj;
  IText: new (text: string, opts?: object) => FabricObj & { enterEditing?: () => void };
};

type FabricCanvas = {
  width?: number;
  height?: number;
  selection: boolean;
  defaultCursor: string;
  add: (...objs: FabricObj[]) => void;
  remove: (...objs: FabricObj[]) => void;
  getObjects: () => FabricObj[];
  getActiveObject: () => FabricObj | null;
  getActiveObjects: () => FabricObj[];
  setActiveObject: (obj: FabricObj) => void;
  discardActiveObject: () => void;
  sendObjectToBack: (obj: FabricObj) => void;
  centerObject: (obj: FabricObj) => void;
  renderAll: () => void;
  dispose: () => void;
  setDimensions: (dims: { width?: number; height?: number }) => void;
  toDataURL: (opts?: { format?: string; multiplier?: number }) => string;
  getElement: () => HTMLCanvasElement;
  on: (event: string, handler: (e: MouseDownEvent) => void) => void;
  off: (event: string, handler: (e: MouseDownEvent) => void) => void;
};

type FabricObj = {
  type?: string;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  scaleX?: number;
  scaleY?: number;
  _isBgImage?: boolean;
  set: (opts: object) => void;
  getBoundingRect: () => { left: number; top: number; width: number; height: number };
  enterEditing?: () => void;
};

type MouseDownEvent = {
  pointer?: { x: number; y: number };
  scenePoint?: { x: number; y: number };
};

export interface ImageEditorProps {
  imageUrl: string;
  /** Called with a base64 PNG data URL when "Send to AI" is clicked. */
  onExportBase64?: (base64: string) => void;
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ImageEditor({ imageUrl, onExportBase64, className }: ImageEditorProps) {
  const outerRef = useRef<HTMLDivElement>(null);   // size measurement + flex centering container
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<FabricCanvas | null>(null);
  const fmRef = useRef<FabricModule | null>(null);
  const cropRectRef = useRef<FabricObj | null>(null);

  const [mode, setMode] = useState<EditorMode>("select");
  const [isReady, setIsReady] = useState(false);
  const [hasCropRect, setHasCropRect] = useState(false);

  // ── Canvas init ─────────────────────────────────────────────────────────────
  // Measure the container via ResizeObserver so the canvas fills 100% of the
  // available area. The image is scaled to fit inside (letterboxed if needed).
  useEffect(() => {
    if (!canvasElRef.current || !outerRef.current) return;
    let destroyed = false;
    let canvas: FabricCanvas | null = null;
    setIsReady(false);

    const init = async (w: number, h: number) => {
      if (destroyed || canvas) return;
      const fabric = (await import("fabric")) as unknown as FabricModule;
      if (destroyed) return;
      fmRef.current = fabric;

      canvas = new fabric.Canvas(canvasElRef.current, {
        width: w,
        height: h,
        backgroundColor: "transparent",
        selection: true,
      });
      fabricRef.current = canvas;

      await loadBgImage(canvas, fabric, imageUrl, w, h);
      if (!destroyed) setIsReady(true);
    };

    const resize = (w: number, h: number) => {
      const c = fabricRef.current;
      if (!c) return;
      c.setDimensions({ width: w, height: h });
      c.getObjects()
        .filter((o) => o._isBgImage)
        .forEach((o) => {
          const iw = o.width ?? w;
          const ih = o.height ?? h;
          const scale = Math.min(w / iw, h / ih, 1);
          o.set({ scaleX: scale, scaleY: scale });
          c.centerObject(o);
        });
      c.renderAll();
    };

    let initialized = false;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      const w = Math.floor(rect.width);
      const h = Math.floor(rect.height);
      if (initialized) {
        resize(w, h);
      } else {
        initialized = true;
        void init(w, h);
      }
    });
    ro.observe(outerRef.current);

    return () => {
      destroyed = true;
      ro.disconnect();
      canvas?.dispose();
      fabricRef.current = null;
      fmRef.current = null;
    };
  }, [imageUrl]);

  // ── Cursor + mousedown for add-object modes ──────────────────────────────────
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || !isReady) return;

    if (mode === "select" || mode === "crop") {
      canvas.defaultCursor = "default";
      canvas.selection = mode === "select";
      return;
    }

    canvas.defaultCursor = mode === "text" ? "text" : "crosshair";
    canvas.selection = false;

    const onMouseDown = (e: MouseDownEvent) => {
      const fm = fmRef.current;
      if (!fm) return;
      const pt = e.scenePoint ?? e.pointer;
      if (!pt) return;

      if (mode === "rect") {
        const rect = new fm.Rect({
          left: pt.x - 50,
          top: pt.y - 30,
          width: 100,
          height: 60,
          fill: "rgba(59,130,246,0.25)",
          stroke: "#3b82f6",
          strokeWidth: 2,
          strokeUniform: true,
        });
        canvas.add(rect);
        canvas.setActiveObject(rect);
        canvas.renderAll();
        setMode("select");
      } else if (mode === "circle") {
        const circle = new fm.Circle({
          left: pt.x - 40,
          top: pt.y - 40,
          radius: 40,
          fill: "rgba(168,85,247,0.25)",
          stroke: "#a855f7",
          strokeWidth: 2,
          strokeUniform: true,
        });
        canvas.add(circle);
        canvas.setActiveObject(circle);
        canvas.renderAll();
        setMode("select");
      } else if (mode === "text") {
        const active = canvas.getActiveObject();
        if (active && (active.type === "i-text" || active.type === "textbox")) return;
        const text = new fm.IText("Text", {
          left: pt.x,
          top: pt.y,
          fontSize: 24,
          fill: "#1e293b",
          fontFamily: "sans-serif",
        });
        canvas.add(text);
        canvas.setActiveObject(text);
        text.enterEditing?.();
        canvas.renderAll();
        setMode("select");
      }
    };

    canvas.on("mouse:down", onMouseDown);
    return () => {
      canvas.off("mouse:down", onMouseDown);
      canvas.defaultCursor = "default";
    };
  }, [mode, isReady]);

  // ── Keyboard delete ──────────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      // Don't intercept when typing in an input/textarea
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      deleteSelected();
    };
    globalThis.addEventListener("keydown", onKeyDown);
    return () => globalThis.removeEventListener("keydown", onKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Mode change ───────────────────────────────────────────────────────────────
  const handleSetMode = (newMode: EditorMode) => {
    const canvas = fabricRef.current;
    const fm = fmRef.current;

    // Discard crop rect when leaving crop mode
    if (mode === "crop" && newMode !== "crop" && cropRectRef.current) {
      canvas?.remove(cropRectRef.current);
      cropRectRef.current = null;
      setHasCropRect(false);
      canvas?.renderAll();
    }

    if (newMode === "crop" && canvas && fm) {
      if (cropRectRef.current) canvas.remove(cropRectRef.current);
      const w = canvas.width ?? 600;
      const h = canvas.height ?? 500;
      const pad = 40;
      const rect = new fm.Rect({
        left: pad,
        top: pad,
        width: w - pad * 2,
        height: h - pad * 2,
        fill: "transparent",
        stroke: "#f59e0b",
        strokeWidth: 2,
        strokeDashArray: [8, 4],
        strokeUniform: true,
        selectable: true,
        evented: true,
      });
      canvas.add(rect);
      canvas.setActiveObject(rect);
      canvas.renderAll();
      cropRectRef.current = rect;
      setHasCropRect(true);
    }

    setMode(newMode);
  };

  // ── Apply crop ────────────────────────────────────────────────────────────────
  const handleApplyCrop = async () => {
    const canvas = fabricRef.current;
    const fm = fmRef.current;
    const cropRect = cropRectRef.current;
    if (!canvas || !fm || !cropRect) return;

    const bounds = cropRect.getBoundingRect();
    const left = Math.max(0, Math.round(bounds.left));
    const top = Math.max(0, Math.round(bounds.top));
    const width = Math.min(Math.round(bounds.width), (canvas.width ?? 0) - left);
    const height = Math.min(Math.round(bounds.height), (canvas.height ?? 0) - top);

    // Remove crop rect, deselect
    canvas.remove(cropRect);
    cropRectRef.current = null;
    setHasCropRect(false);
    canvas.discardActiveObject();
    canvas.renderAll();

    // Rasterise the visible canvas region via a temp <canvas>
    const htmlCanvas = canvas.getElement();
    const tmp = document.createElement("canvas");
    tmp.width = width;
    tmp.height = height;
    const ctx = tmp.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(htmlCanvas, left, top, width, height, 0, 0, width, height);
    const croppedUrl = tmp.toDataURL("image/png");

    // Replace background with the cropped image, scale to fit
    const bgObjects = canvas.getObjects().filter((o) => o._isBgImage);
    bgObjects.forEach((o) => canvas.remove(o));

    const img = await fm.FabricImage.fromURL(croppedUrl);
    const cw = canvas.width ?? 600;
    const ch = canvas.height ?? 500;
    const scale = Math.min(cw / (img.width ?? cw), ch / (img.height ?? ch), 1);
    img.set({
      scaleX: scale,
      scaleY: scale,
      selectable: false,
      evented: false,
      originX: "center",
      originY: "center",
    });
    img._isBgImage = true;
    canvas.add(img);
    canvas.centerObject(img);
    canvas.sendObjectToBack(img);
    canvas.renderAll();
    setMode("select");
  };

  // ── Delete selected ───────────────────────────────────────────────────────────
  const deleteSelected = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObjects();
    active.forEach((o) => {
      if (!o._isBgImage) {
        canvas.remove(o);
        if (o === cropRectRef.current) {
          cropRectRef.current = null;
          setHasCropRect(false);
        }
      }
    });
    canvas.discardActiveObject();
    canvas.renderAll();
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b bg-white shrink-0 flex-wrap">
        {/* Mode buttons */}
        <div className="flex items-center gap-0.5">
          <ToolBtn active={mode === "select"} onClick={() => handleSetMode("select")} title="Select / Move">
            <MousePointer2 className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn active={mode === "crop"} onClick={() => handleSetMode("crop")} title="Crop">
            <Crop className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn active={mode === "rect"} onClick={() => handleSetMode("rect")} title="Add rectangle">
            <Square className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn active={mode === "circle"} onClick={() => handleSetMode("circle")} title="Add circle">
            <CircleIcon className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn active={mode === "text"} onClick={() => handleSetMode("text")} title="Add text">
            <Type className="h-4 w-4" />
          </ToolBtn>
        </div>

        <div className="w-px h-5 bg-slate-200 mx-1 shrink-0" />

        {/* Apply crop (only visible in crop mode) */}
        {mode === "crop" && hasCropRect && (
          <Button size="sm" className="h-7 text-xs px-2 gap-1" onClick={() => void handleApplyCrop()}>
            <Check className="h-3 w-3" />
            Apply Crop
          </Button>
        )}

      </div>

      {/* Canvas area — fills all available space, checkered bg for transparent images */}
      <div
        ref={outerRef}
        className="flex-1 overflow-hidden relative"
        style={{
          backgroundColor: "#e8e8e8",
          backgroundImage:
            "linear-gradient(45deg,#d0d0d0 25%,transparent 25%)," +
            "linear-gradient(-45deg,#d0d0d0 25%,transparent 25%)," +
            "linear-gradient(45deg,transparent 75%,#d0d0d0 75%)," +
            "linear-gradient(-45deg,transparent 75%,#d0d0d0 75%)",
          backgroundSize: "20px 20px",
          backgroundPosition: "0 0,0 10px,10px -10px,-10px 0px",
        }}
      >
        {!isReady && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        )}
        <canvas ref={canvasElRef} className="touch-none" />
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loadBgImage(
  canvas: FabricCanvas,
  fabric: FabricModule,
  url: string,
  cw: number,
  ch: number,
) {
  try {
    const img = await fabric.FabricImage.fromURL(url, { crossOrigin: "anonymous" });
    const iw = img.width ?? cw;
    const ih = img.height ?? ch;
    const scale = Math.min(cw / iw, ch / ih, 1);
    img.set({
      scaleX: scale,
      scaleY: scale,
      selectable: false,
      evented: false,
      originX: "center",
      originY: "center",
    });
    img._isBgImage = true;
    canvas.add(img);
    canvas.centerObject(img);
    canvas.renderAll();
  } catch {
    // Image load failed — canvas shows transparent background
  }
}


// ── ToolBtn ───────────────────────────────────────────────────────────────────

function ToolBtn({
  children,
  onClick,
  title,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-700",
      )}
    >
      {children}
    </button>
  );
}
