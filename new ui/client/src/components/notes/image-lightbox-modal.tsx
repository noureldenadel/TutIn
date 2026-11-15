import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Download, Minus, Plus, X } from "lucide-react";
import { toast } from "sonner";

import {
  StandaloneAppContextMenu,
  type StandaloneContextMenuState,
} from "@/components/notes/app-context-menu";
import { copyImageToClipboard } from "@/lib/clipboard";
import { inspectAppContextTarget } from "@/lib/spellcheck";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 100) / 100));
}

export interface ImageLightboxModalProps {
  src: string;
  alt: string;
  downloadName?: string | undefined;
  onClose: () => void;
}

export function ImageLightboxModal({
  src,
  alt,
  downloadName = "image.png",
  onClose,
}: ImageLightboxModalProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [copied, setCopied] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [contextMenu, setContextMenu] = useState<StandaloneContextMenuState | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const stepZoom = useCallback((delta: number) => {
    setZoom((prev) => {
      const next = clampZoom(prev + delta);
      if (next <= 1) {
        setPan({ x: 0, y: 0 });
      }
      return next;
    });
  }, []);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setCopied(false);
  }, [src]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        stepZoom(ZOOM_STEP);
        return;
      }
      if (e.key === "-") {
        e.preventDefault();
        stepZoom(-ZOOM_STEP);
        return;
      }
      if (e.key === "0") {
        e.preventDefault();
        resetView();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose, resetView, stepZoom]);

  const handleCopy = async () => {
    try {
      await copyImageToClipboard(src);
      setCopied(true);
      toast.success("Image copied to clipboard");
      window.setTimeout(() => setCopied(false), 1600);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to copy image.");
    }
  };

  return (
    <div
      data-canvas-ui="true"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onWheel={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const delta = e.deltaY < 0 ? 0.15 : -0.15;
        stepZoom(delta);
      }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
    >
      {/* Top-Right Action Controls */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="fixed right-4 top-4 z-20 flex items-center gap-2"
      >
        <button
          type="button"
          onClick={() => void handleCopy()}
          aria-label="Copy image"
          title="Copy image"
          className="flex size-10 items-center justify-center rounded-full border border-white/10 bg-zinc-900/85 text-zinc-100 shadow-lg backdrop-blur-md transition-colors hover:bg-zinc-800"
        >
          {copied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
        </button>

        <a
          href={src}
          download={downloadName}
          aria-label="Download image"
          title="Download image"
          className="flex size-10 items-center justify-center rounded-full border border-white/10 bg-zinc-900/85 text-zinc-100 shadow-lg backdrop-blur-md transition-colors hover:bg-zinc-800"
        >
          <Download className="size-4" />
        </a>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          title="Close (Esc)"
          className="flex size-10 items-center justify-center rounded-full border border-white/10 bg-zinc-900/85 text-zinc-100 shadow-lg backdrop-blur-md transition-colors hover:bg-zinc-800"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Centered Zoomable / Pannable Image */}
      <div
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (zoom === 1) {
            setZoom(2);
          } else {
            resetView();
          }
        }}
        onPointerDown={(e) => {
          if (zoom <= 1 || e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          setIsDragging(true);
          dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            originX: pan.x,
            originY: pan.y,
          };
        }}
        onPointerMove={(e) => {
          if (!dragRef.current) return;
          setPan({
            x: dragRef.current.originX + (e.clientX - dragRef.current.startX),
            y: dragRef.current.originY + (e.clientY - dragRef.current.startY),
          });
        }}
        onPointerUp={() => {
          dragRef.current = null;
          setIsDragging(false);
        }}
        onPointerCancel={() => {
          dragRef.current = null;
          setIsDragging(false);
        }}
        style={{
          transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
          transition: isDragging ? "none" : "transform 140ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
        className={
          zoom > 1
            ? isDragging
              ? "cursor-grabbing select-none"
              : "cursor-grab select-none"
            : "cursor-zoom-in select-none"
        }
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setContextMenu({
              clientX: e.clientX,
              clientY: e.clientY,
              analysis: inspectAppContextTarget({
                clientX: e.clientX,
                clientY: e.clientY,
                target: e.target,
                fallbackImageSrc: src,
              }),
            });
          }}
          className="max-h-[84dvh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
        />
      </div>

      {contextMenu && (
        <StandaloneAppContextMenu state={contextMenu} onClose={() => setContextMenu(null)} />
      )}

      {/* Bottom-Center Floating Zoom Pill */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="fixed bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-zinc-900/85 px-2 py-1.5 text-zinc-100 shadow-lg backdrop-blur-md"
      >
        <button
          type="button"
          onClick={() => stepZoom(-ZOOM_STEP)}
          disabled={zoom <= MIN_ZOOM}
          aria-label="Zoom out"
          title="Zoom out (-)"
          className="flex size-7 items-center justify-center rounded-full text-zinc-200 transition-colors hover:bg-white/10 disabled:opacity-35"
        >
          <Minus className="size-3.5" />
        </button>

        <button
          type="button"
          onClick={resetView}
          aria-label="Reset zoom"
          title="Reset to 100% (0)"
          className="min-w-14 rounded-full px-2 py-1 text-center font-mono text-xs font-medium tabular-nums text-zinc-100 transition-colors hover:bg-white/10"
        >
          {Math.round(zoom * 100)}%
        </button>

        <button
          type="button"
          onClick={() => stepZoom(ZOOM_STEP)}
          disabled={zoom >= MAX_ZOOM}
          aria-label="Zoom in"
          title="Zoom in (+)"
          className="flex size-7 items-center justify-center rounded-full text-zinc-200 transition-colors hover:bg-white/10 disabled:opacity-35"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
