import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ClipboardEvent as ReactClipboardEvent,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  Bold,
  Camera,
  Check,
  Crop,
  GripVertical,
  ImagePlus,
  Italic,
  List,
  Strikethrough,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  StandaloneAppContextMenu,
  type StandaloneContextMenuState,
} from "@/components/notes/app-context-menu";
import { Button } from "@/components/ui/button";
import {
  type CaretBookmark,
  NOTE_IMAGE_BLOCK_ATTR,
  NOTE_IMAGE_TAIL_ATTR,
  applyInlineMarkdownAtCaret,
  applyMarkdownOnBackspace,
  applyMarkdownOnEnter,
  applyMarkdownOnSpace,
  applyMarkdownOnTab,
  clearAllLiveMarkdownSyntax,
  exitInlineMarkOnClick,
  getCaretBookmark,
  handleMarkdownDelimiterBackspace,
  handleMarkdownDelimiterKeyDown,
  isImageBlockElement,
  isInsideMarkdownSyntax,
  moveCaretOutOfImageBlock,
  normalizeEditorImageBlocks,
  normalizeEmptyEditorOnMount,
  placeCaretAtEnd,
  placeCaretAtStart,
  placeCaretInEditableBlockAtY,
  reconcileActiveMarkdownSyntax,
  resolveArrowIntoImageBlock,
  resolveImageBoundaryBeforeBackspace,
  resolveImageBoundaryBeforeDelete,
  resolveInlineBoundaryOnArrow,
  restoreCaretBookmark,
  sanitizeClipboardHtml,
  sanitizeHttpUrl,
  sanitizeStoredNoteHtml,
  stripLiveSyntaxArtifacts,
  stripSyntaxBeforeExecCommand,
  syncImageTailParagraphs,
  syncLiveMarkdownSyntax,
  toggleInlineWrapperCommand,
  toggleTaskCheckboxElement,
  toggleTaskListCommand,
  unwrapEmptyInlinePairOnSpace,
  wrapSelectionAsLink,
} from "@/components/notes/note-markdown";
import { copyImageToClipboard } from "@/lib/clipboard";
import {
  extractSameCourseVaultImageUrisFromHtml,
  hydrateContainerMedia,
  isMediaUri,
  resolveMediaUrl,
  saveMediaDataUrl,
  saveMediaFile,
  serializeContainerMediaHtml,
  useResolvedNoteHtml,
  verifyVaultMediaExists,
} from "@/lib/media-store";
import {
  inspectAppContextTarget,
  preloadSpellChecker,
  registerEditorContextHooks,
} from "@/lib/spellcheck";
import { cn } from "@/lib/utils";

const MAX_CROP_WIDTH = 1200;
const MAX_CROP_HEIGHT = 800;

export interface RichNoteSuggestion {
  completion: string;
  fullPhrase: string;
}

export interface RichNoteSurfaceProps {
  courseId?: string | undefined;
  content: string;
  onChange: (html: string) => void;
  onSubmit?: (() => void) | undefined;
  onCancel?: (() => void) | undefined;
  onCaptureScreenshot?: (() => Promise<string>) | undefined;
  onOpenImage?: ((src: string) => void) | undefined;
  getSuggestion?: ((textBefore: string) => RichNoteSuggestion | null) | undefined;
  onWritingActivity?: (() => void) | undefined;
  onSuspendSmartTimers?: (() => void) | undefined;
  placeholder?: string | undefined;
  compactToolbar?: boolean | undefined;
  maxHeightClassName?: string | undefined;
  minHeightClassName?: string | undefined;
  wrapperClassName?: string | undefined;
  wrapperStyle?: CSSProperties | undefined;
  autoFocus?: boolean | undefined;
  className?: string | undefined;
}

export function RichNoteHtmlContent({
  html,
  className,
  onDoubleClick,
  onImageClick,
  onHtmlChange,
}: {
  html: string;
  className?: string | undefined;
  onDoubleClick?: ((e: React.MouseEvent<HTMLDivElement>) => void) | undefined;
  onImageClick?: ((src: string, e: React.MouseEvent<HTMLDivElement>) => void) | undefined;
  onHtmlChange?: ((nextHtml: string) => void) | undefined;
}) {
  const safeHtml = useMemo(() => sanitizeStoredNoteHtml(html), [html]);
  const resolvedHtml = useResolvedNoteHtml(safeHtml);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{
    state: StandaloneContextMenuState;
    sourceEvent: React.MouseEvent<HTMLDivElement>;
  } | null>(null);

  return (
    <>
      <div
        ref={contentRef}
        className={cn("note-content select-text text-sm leading-[1.5] text-foreground", className)}
        dir="auto"
        onDoubleClick={onDoubleClick}
        onPointerDown={(e) => {
          const target = e.target as HTMLElement | null;
          if (target?.closest("input[data-task-checkbox], a")) {
            e.stopPropagation();
          }
        }}
        onContextMenu={(e) => {
          if (e.currentTarget.closest("[data-canvas-card-id]")) return;
          const analysis = inspectAppContextTarget({
            clientX: e.clientX,
            clientY: e.clientY,
            target: e.target,
          });
          if (!analysis.imageSrc && !analysis.selectedText) return;
          e.preventDefault();
          e.stopPropagation();
          setContextMenu({
            state: {
              clientX: e.clientX,
              clientY: e.clientY,
              analysis,
            },
            sourceEvent: e,
          });
        }}
        onClick={(e) => {
          const target = e.target as HTMLElement | null;
          if (!target) return;

          if (target.tagName === "INPUT" && target.hasAttribute("data-task-checkbox")) {
            e.stopPropagation();
            if (!onHtmlChange) {
              e.preventDefault();
              return;
            }
            toggleTaskCheckboxElement(target as HTMLInputElement);
            if (contentRef.current) {
              onHtmlChange(serializeContainerMediaHtml(contentRef.current));
            }
            return;
          }

          const anchor = target.closest("a");
          if (anchor && contentRef.current?.contains(anchor)) {
            e.preventDefault();
            e.stopPropagation();
            const safeHref = sanitizeHttpUrl(anchor.getAttribute("href") || "");
            if (safeHref) {
              window.open(safeHref, "_blank", "noopener,noreferrer");
            }
            return;
          }

          if (!onImageClick) return;
          if (target.tagName === "IMG") {
            const img = target as HTMLImageElement;
            const src = img.currentSrc || img.src;
            if (src) {
              e.stopPropagation();
              onImageClick(src, e);
            }
          }
        }}
        dangerouslySetInnerHTML={{ __html: resolvedHtml }}
      />

      {contextMenu && (
        <StandaloneAppContextMenu
          state={contextMenu.state}
          onOpenImage={
            onImageClick ? (src) => onImageClick(src, contextMenu.sourceEvent) : undefined
          }
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}

function EditorToolBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground [&_svg]:size-3.5"
    >
      {children}
    </button>
  );
}

type CropRectPct = { x: number; y: number; width: number; height: number };
type CropDragMode = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "move" | "draw";

const DEFAULT_CROP_RECT: CropRectPct = { x: 0, y: 0, width: 100, height: 100 };

const CROP_HANDLES: ReadonlyArray<{
  mode: Exclude<CropDragMode, "move" | "draw">;
  cursor: string;
  posClass: string;
  barClass: string;
}> = [
  {
    mode: "nw",
    cursor: "cursor-nwse-resize",
    posClass: "-left-2 -top-2 size-4",
    barClass: "size-2.5 rounded-tl-[2px] border-l-2 border-t-2 border-white",
  },
  {
    mode: "ne",
    cursor: "cursor-nesw-resize",
    posClass: "-right-2 -top-2 size-4",
    barClass: "size-2.5 rounded-tr-[2px] border-r-2 border-t-2 border-white",
  },
  {
    mode: "sw",
    cursor: "cursor-nesw-resize",
    posClass: "-bottom-2 -left-2 size-4",
    barClass: "size-2.5 rounded-bl-[2px] border-b-2 border-l-2 border-white",
  },
  {
    mode: "se",
    cursor: "cursor-nwse-resize",
    posClass: "-bottom-2 -right-2 size-4",
    barClass: "size-2.5 rounded-br-[2px] border-b-2 border-r-2 border-white",
  },
  {
    mode: "n",
    cursor: "cursor-ns-resize",
    posClass: "-top-2 left-1/2 h-4 w-7 -translate-x-1/2",
    barClass: "h-1 w-5 rounded-full bg-white",
  },
  {
    mode: "s",
    cursor: "cursor-ns-resize",
    posClass: "-bottom-2 left-1/2 h-4 w-7 -translate-x-1/2",
    barClass: "h-1 w-5 rounded-full bg-white",
  },
  {
    mode: "w",
    cursor: "cursor-ew-resize",
    posClass: "-left-2 top-1/2 h-7 w-4 -translate-y-1/2",
    barClass: "h-5 w-1 rounded-full bg-white",
  },
  {
    mode: "e",
    cursor: "cursor-ew-resize",
    posClass: "-right-2 top-1/2 h-7 w-4 -translate-y-1/2",
    barClass: "h-5 w-1 rounded-full bg-white",
  },
];

function isCropModified(crop: CropRectPct): boolean {
  return crop.x > 0.25 || crop.y > 0.25 || crop.width < 99.5 || crop.height < 99.5;
}

function measureImageLocalRect(
  imgEl: HTMLImageElement,
  wrap: HTMLElement,
): { top: number; left: number; width: number; height: number } {
  const wrapRect = wrap.getBoundingClientRect();
  const imgRect = imgEl.getBoundingClientRect();
  const scaleX = wrap.offsetWidth > 0 && wrapRect.width > 0 ? wrapRect.width / wrap.offsetWidth : 1;
  const scaleY =
    wrap.offsetHeight > 0 && wrapRect.height > 0 ? wrapRect.height / wrap.offsetHeight : 1;
  return {
    top: (imgRect.top - wrapRect.top) / scaleY + wrap.scrollTop,
    left: (imgRect.left - wrapRect.left) / scaleX + wrap.scrollLeft,
    width: Math.max(24, imgRect.width / scaleX),
    height: Math.max(24, imgRect.height / scaleY),
  };
}

function InPlaceImageCropOverlay({
  imageSrc,
  fallbackElement,
  rect,
  wrapperElement,
  onApplyCrop,
  onCancel,
}: {
  imageSrc: string;
  fallbackElement: HTMLImageElement;
  rect: { top: number; left: number; width: number; height: number };
  wrapperElement: HTMLElement | null;
  onApplyCrop: (dataUrl: string, didModify: boolean) => void;
  onCancel: () => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const sourceImgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<CropRectPct>(DEFAULT_CROP_RECT);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{
    mode: CropDragMode;
    startClientX: number;
    startClientY: number;
    startPctX: number;
    startPctY: number;
    startCrop: CropRectPct;
  } | null>(null);

  const modified = isCropModified(crop);

  const handleApply = useCallback(() => {
    if (!modified) {
      onApplyCrop("", false);
      return;
    }

    const img =
      sourceImgRef.current && sourceImgRef.current.naturalWidth > 0
        ? sourceImgRef.current
        : fallbackElement;
    if (!img || !img.naturalWidth || !img.naturalHeight) return;

    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    const srcX = Math.max(0, Math.round((crop.x / 100) * nw));
    const srcY = Math.max(0, Math.round((crop.y / 100) * nh));
    const srcW = Math.min(nw - srcX, Math.max(1, Math.round((crop.width / 100) * nw)));
    const srcH = Math.min(nh - srcY, Math.max(1, Math.round((crop.height / 100) * nh)));
    if (srcW <= 0 || srcH <= 0) return;

    const scale = Math.min(1, MAX_CROP_WIDTH / srcW, MAX_CROP_HEIGHT / srcH);
    const destW = Math.max(1, Math.round(srcW * scale));
    const destH = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = destW;
    canvas.height = destH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, destW, destH);
    try {
      onApplyCrop(canvas.toDataURL("image/jpeg", 0.9), true);
    } catch {
      toast.error("Cannot crop this external image due to origin restrictions.");
    }
  }, [crop, fallbackElement, modified, onApplyCrop]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        handleApply();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [handleApply, onCancel]);

  const startDrag = (mode: CropDragMode, e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const box = frameRef.current?.getBoundingClientRect();
    if (!box || box.width <= 0 || box.height <= 0) return;

    e.preventDefault();
    e.stopPropagation();

    const startPctX = Math.max(0, Math.min(100, ((e.clientX - box.left) / box.width) * 100));
    const startPctY = Math.max(0, Math.min(100, ((e.clientY - box.top) / box.height) * 100));

    dragRef.current = {
      mode,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startPctX,
      startPctY,
      startCrop: { ...crop },
    };
    if (mode === "draw") {
      setCrop({ x: startPctX, y: startPctY, width: 0, height: 0 });
    }
    setIsDragging(true);
    try {
      frameRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    const box = frameRef.current?.getBoundingClientRect();
    if (!d || !box || box.width <= 0 || box.height <= 0) return;

    const curPctX = Math.max(0, Math.min(100, ((e.clientX - box.left) / box.width) * 100));
    const curPctY = Math.max(0, Math.min(100, ((e.clientY - box.top) / box.height) * 100));

    if (d.mode === "draw") {
      setCrop({
        x: Math.min(d.startPctX, curPctX),
        y: Math.min(d.startPctY, curPctY),
        width: Math.abs(curPctX - d.startPctX),
        height: Math.abs(curPctY - d.startPctY),
      });
      return;
    }

    const dxPct = ((e.clientX - d.startClientX) / box.width) * 100;
    const dyPct = ((e.clientY - d.startClientY) / box.height) * 100;

    if (d.mode === "move") {
      const nextX = Math.max(0, Math.min(100 - d.startCrop.width, d.startCrop.x + dxPct));
      const nextY = Math.max(0, Math.min(100 - d.startCrop.height, d.startCrop.y + dyPct));
      setCrop({ ...d.startCrop, x: nextX, y: nextY });
      return;
    }

    const minSize = 5;
    let left = d.startCrop.x;
    let right = d.startCrop.x + d.startCrop.width;
    let top = d.startCrop.y;
    let bottom = d.startCrop.y + d.startCrop.height;

    if (d.mode.includes("w")) {
      left = Math.max(0, Math.min(right - minSize, d.startCrop.x + dxPct));
    }
    if (d.mode.includes("e")) {
      right = Math.min(100, Math.max(left + minSize, d.startCrop.x + d.startCrop.width + dxPct));
    }
    if (d.mode.includes("n")) {
      top = Math.max(0, Math.min(bottom - minSize, d.startCrop.y + dyPct));
    }
    if (d.mode.includes("s")) {
      bottom = Math.min(100, Math.max(top + minSize, d.startCrop.y + d.startCrop.height + dyPct));
    }

    if (e.shiftKey && (d.mode === "nw" || d.mode === "ne" || d.mode === "sw" || d.mode === "se")) {
      const ratio = d.startCrop.width / Math.max(1, d.startCrop.height);
      const w = right - left;
      const h = bottom - top;
      const targetH = Math.max(minSize, w / ratio);
      const maxH = d.mode.includes("n") ? bottom : 100 - top;
      const clampedH = Math.min(targetH, maxH);
      const clampedW = clampedH * ratio;
      if (d.mode.includes("n")) top = bottom - clampedH;
      else bottom = top + clampedH;
      if (d.mode.includes("w")) left = right - Math.min(clampedW, right);
      else right = left + Math.min(clampedW, 100 - left);
      if (Math.abs(h - clampedH) < 0.01 && Math.abs(w - (right - left)) < 0.01) {
        // already balanced
      }
    }

    setCrop({
      x: left,
      y: top,
      width: Math.max(minSize, right - left),
      height: Math.max(minSize, bottom - top),
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const mode = dragRef.current.mode;
    dragRef.current = null;
    setIsDragging(false);
    try {
      if (frameRef.current?.hasPointerCapture(e.pointerId)) {
        frameRef.current.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }
    if (mode === "draw") {
      setCrop((prev) => (prev.width < 2 || prev.height < 2 ? DEFAULT_CROP_RECT : prev));
    }
  };

  // Position the compact action bar cleanly below the image unless clipped at bottom
  const wrapScrollTop = wrapperElement?.scrollTop ?? 0;
  const wrapClientHeight = wrapperElement?.clientHeight ?? 0;
  const viewBottom = wrapScrollTop + wrapClientHeight;
  const spaceBelow = wrapClientHeight > 0 ? viewBottom - (rect.top + rect.height) : 52;
  const spaceAbove = wrapClientHeight > 0 ? rect.top - wrapScrollTop : 52;
  const barPlacementClass =
    spaceBelow >= 44
      ? "top-[calc(100%+12px)]"
      : spaceAbove >= 44
        ? "bottom-[calc(100%+12px)]"
        : "bottom-2";

  return (
    <div
      className="in-place-image-cropper pointer-events-auto absolute z-30 select-none"
      style={{
        top: `${rect.top}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div
        ref={frameRef}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerDown={(e) => startDrag(e.altKey && modified ? "move" : "draw", e)}
        className="relative h-full w-full cursor-crosshair touch-none rounded-[8px]"
      >
        {/* Slight outer hit rim lets edge clicks start a crop cleanly from 0%/100% */}
        <div className="pointer-events-auto absolute -inset-2 cursor-crosshair" />
        <img
          ref={sourceImgRef}
          src={imageSrc}
          crossOrigin="anonymous"
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full rounded-[8px] object-contain opacity-0"
          draggable={false}
        />

        {/* Dim only the cropped-out regions within this image's bounds */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 rounded-t-[8px] bg-black/55"
          style={{ height: `${crop.y}%` }}
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-[8px] bg-black/55"
          style={{ height: `${Math.max(0, 100 - (crop.y + crop.height))}%` }}
        />
        <div
          className="pointer-events-none absolute left-0 bg-black/55"
          style={{
            top: `${crop.y}%`,
            width: `${crop.x}%`,
            height: `${crop.height}%`,
          }}
        />
        <div
          className="pointer-events-none absolute right-0 bg-black/55"
          style={{
            top: `${crop.y}%`,
            width: `${Math.max(0, 100 - (crop.x + crop.width))}%`,
            height: `${crop.height}%`,
          }}
        />

        {/* Active Crop Box + Handles */}
        <div
          className="pointer-events-none absolute border border-white/95 shadow-[0_0_0_1px_rgba(0,0,0,0.45)]"
          style={{
            top: `${crop.y}%`,
            left: `${crop.x}%`,
            width: `${crop.width}%`,
            height: `${crop.height}%`,
          }}
        >
          {isDragging && (
            <>
              <div className="absolute inset-y-0 left-1/3 w-px bg-white/30" />
              <div className="absolute inset-y-0 left-2/3 w-px bg-white/30" />
              <div className="absolute inset-x-0 top-1/3 h-px bg-white/30" />
              <div className="absolute inset-x-0 top-2/3 h-px bg-white/30" />
            </>
          )}

          {modified &&
            CROP_HANDLES.map((h) => (
              <div
                key={h.mode}
                onPointerDown={(e) => startDrag(h.mode, e)}
                className={cn(
                  "pointer-events-auto absolute flex items-center justify-center",
                  h.posClass,
                  h.cursor,
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none block shadow-[0_0_2px_rgba(0,0,0,0.65)]",
                    h.barClass,
                  )}
                />
              </div>
            ))}
        </div>
      </div>

      {/* Floating Commit / Cancel Action Bar (fades out during handle drag so edges stay unobstructed) */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        className={cn(
          "absolute left-1/2 z-40 flex w-max -translate-x-1/2 items-center gap-1 rounded-lg border border-border/50 bg-popover/95 p-1 text-popover-foreground shadow-workspace backdrop-blur-sm transition-opacity duration-150",
          barPlacementClass,
          isDragging && "pointer-events-none opacity-0",
        )}
      >
        {modified && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setCrop(DEFAULT_CROP_RECT)}
          >
            Reset
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 rounded-md px-2.5 text-xs"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7 rounded-md px-2.5 text-xs"
          onClick={handleApply}
        >
          <Check className="size-3.5" /> Apply
        </Button>
      </div>
    </div>
  );
}

function getTopLevelEditorChild(node: Node | null, editor: HTMLElement): HTMLElement | null {
  let curr: Node | null = node;
  while (curr && curr.parentNode !== editor) {
    curr = curr.parentNode;
  }
  return curr && curr.nodeType === Node.ELEMENT_NODE ? (curr as HTMLElement) : null;
}

function isBlockEmptyForImage(el: Element | null): boolean {
  if (!el) return false;
  if (el.tagName === "HR" || el.hasAttribute(NOTE_IMAGE_BLOCK_ATTR)) return false;
  if (el.querySelector("img, hr, pre, ul, ol")) return false;
  return !(el.textContent || "")
    .replace(/\u00A0/g, "")
    .replace(/\u200B/g, "")
    .trim();
}

function createImageTailParagraph(): HTMLParagraphElement {
  const pTail = document.createElement("p");
  pTail.setAttribute(NOTE_IMAGE_TAIL_ATTR, "true");
  pTail.appendChild(document.createElement("br"));
  return pTail;
}

function resolvePostImageCaretTarget(ed: HTMLElement, imgWrapper: HTMLElement): HTMLElement | null {
  const nextEl = imgWrapper.nextElementSibling as HTMLElement | null;
  if (!nextEl) {
    const pTail = createImageTailParagraph();
    ed.appendChild(pTail);
    return pTail;
  }
  return isBlockEmptyForImage(nextEl) ? nextEl : null;
}

function insertImageBlockCleanly(
  ed: HTMLElement,
  range: Range,
  imgWrapper: HTMLElement,
): { caretTarget: HTMLElement | null } {
  range.deleteContents();
  const topBlock = getTopLevelEditorChild(range.startContainer, ed);

  // Break out of lists so images sit centered across the card rather than indented under list markers
  if (topBlock && (topBlock.tagName === "UL" || topBlock.tagName === "OL")) {
    let curLi: Node | null = range.startContainer;
    while (curLi && curLi !== topBlock && (curLi as Element).tagName !== "LI") {
      curLi = curLi.parentNode;
    }

    if (curLi && (curLi as Element).tagName === "LI" && curLi.parentNode === topBlock) {
      const liEl = curLi as HTMLLIElement;
      const afterRange = document.createRange();
      afterRange.setStart(range.endContainer, range.endOffset);
      afterRange.setEnd(liEl, liEl.childNodes.length);
      const trailingLiFrag = afterRange.extractContents();

      const trailingSiblings: HTMLLIElement[] = [];
      let sib = liEl.nextElementSibling;
      while (sib) {
        const next = sib.nextElementSibling;
        if (sib.tagName === "LI") {
          trailingSiblings.push(sib as HTMLLIElement);
        }
        sib = next;
      }

      const liHasContent =
        Boolean(liEl.textContent?.replace(/\u200B/g, "").trim()) ||
        Boolean(liEl.querySelector("img"));
      if (!liHasContent) {
        liEl.remove();
      }

      const insertAnchor = topBlock.nextSibling;
      ed.insertBefore(imgWrapper, insertAnchor);

      const trailingHasContent =
        Boolean(trailingLiFrag.textContent?.replace(/\u200B/g, "").trim()) ||
        Boolean(trailingLiFrag.querySelector("img"));
      let contList: HTMLElement | null = null;
      if (trailingHasContent || trailingSiblings.length > 0) {
        contList = document.createElement(topBlock.tagName.toLowerCase());
        if (topBlock.hasAttribute("data-task-list")) {
          contList.setAttribute("data-task-list", "true");
        }
        if (trailingHasContent) {
          const newLi = document.createElement("li");
          newLi.appendChild(trailingLiFrag);
          contList.appendChild(newLi);
        }
        for (const t of trailingSiblings) {
          contList.appendChild(t);
        }
        ed.insertBefore(contList, insertAnchor);
      }

      if (!topBlock.querySelector("li")) {
        topBlock.remove();
      }

      if (contList) {
        return { caretTarget: (contList.querySelector("li") as HTMLElement | null) ?? contList };
      }
      return { caretTarget: resolvePostImageCaretTarget(ed, imgWrapper) };
    }
  }

  if (topBlock && topBlock.parentNode === ed) {
    const afterRange = document.createRange();
    afterRange.setStart(range.endContainer, range.endOffset);
    afterRange.setEnd(topBlock, topBlock.childNodes.length);
    const trailingFrag = afterRange.extractContents();
    const blockHasContent =
      Boolean(topBlock.textContent?.replace(/\u200B/g, "").trim()) ||
      Boolean(topBlock.querySelector("img"));
    const trailingHasContent =
      Boolean(trailingFrag.textContent?.replace(/\u200B/g, "").trim()) ||
      Boolean(trailingFrag.querySelector("img"));

    const insertAnchor = topBlock.nextSibling;
    if (!blockHasContent) {
      topBlock.remove();
    }
    ed.insertBefore(imgWrapper, insertAnchor);
    if (trailingHasContent) {
      const topTag = topBlock.tagName.toLowerCase();
      const trailingTag = ["h1", "h2", "h3", "h4", "h5", "h6", "blockquote"].includes(topTag)
        ? topTag
        : "p";
      const trailingBlock = document.createElement(trailingTag);
      trailingBlock.appendChild(trailingFrag);
      ed.insertBefore(trailingBlock, insertAnchor);
      return { caretTarget: trailingBlock };
    }
    return { caretTarget: resolvePostImageCaretTarget(ed, imgWrapper) };
  }

  range.insertNode(imgWrapper);
  return { caretTarget: resolvePostImageCaretTarget(ed, imgWrapper) };
}

export function RichNoteSurface({
  courseId,
  content,
  onChange,
  onSubmit,
  onCancel,
  onCaptureScreenshot,
  onOpenImage,
  getSuggestion,
  onWritingActivity,
  onSuspendSmartTimers,
  placeholder = "Write a note…",
  compactToolbar = false,
  maxHeightClassName = "max-h-[280px]",
  minHeightClassName = "min-h-[100px]",
  wrapperClassName,
  wrapperStyle,
  autoFocus = true,
  className,
}: RichNoteSurfaceProps) {
  const courseIdRef = useRef(courseId);
  courseIdRef.current = courseId;
  const editorRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isInitializedRef = useRef(false);
  const draggingBlockRef = useRef<HTMLElement | null>(null);
  const ghostSpanRef = useRef<HTMLSpanElement | null>(null);
  const undoStackRef = useRef<{ html: string; bookmark: CaretBookmark | null }[]>([]);
  const redoStackRef = useRef<{ html: string; bookmark: CaretBookmark | null }[]>([]);
  const lastUndoAtRef = useRef(0);
  const beforeInputSnapRef = useRef<{ html: string; bookmark: CaretBookmark | null } | null>(null);
  const handledSpaceKeyDownRef = useRef(false);
  const contextMenuOpenRef = useRef(false);
  const forcePlainPasteRef = useRef(false);
  const blurTimeoutRef = useRef<number | null>(null);

  const [croppingImage, setCroppingImage] = useState<{
    element: HTMLImageElement;
    src: string;
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const [selectedImg, setSelectedImg] = useState<{
    element: HTMLImageElement;
    src: string;
    top: number;
    left: number;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<StandaloneContextMenuState | null>(null);
  contextMenuOpenRef.current = Boolean(contextMenu);
  const [ghostSuggestion, setGhostSuggestion] = useState<{
    completion: string;
    fullPhrase: string;
    node: Text;
    offset: number;
  } | null>(null);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const getSuggestionRef = useRef(getSuggestion);
  getSuggestionRef.current = getSuggestion;
  const onWritingActivityRef = useRef(onWritingActivity);
  onWritingActivityRef.current = onWritingActivity;

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current !== null) {
        window.clearTimeout(blurTimeoutRef.current);
        blurTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const ed = editorRef.current;
    if (!ed || isInitializedRef.current) return;
    ed.innerHTML = sanitizeStoredNoteHtml(content || "");
    normalizeEmptyEditorOnMount(ed);
    normalizeEditorImageBlocks(ed);
    isInitializedRef.current = true;
    undoStackRef.current = [
      {
        html: serializeContainerMediaHtml(ed),
        bookmark: null,
      },
    ];
    redoStackRef.current = [];
    void hydrateContainerMedia(ed);
    if (autoFocus) {
      const firstChild = ed.firstElementChild as HTMLElement | null;
      if (firstChild && isImageBlockElement(firstChild)) {
        const firstImg = firstChild.querySelector("img");
        ed.focus({ preventScroll: true });
        window.getSelection()?.removeAllRanges();
        if (firstImg) {
          requestAnimationFrame(() => updateSelectedImgPos(firstImg));
        }
      } else {
        ed.focus();
        syncLiveMarkdownSyntax(ed);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus, content]);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      onChangeRef.current(serializeContainerMediaHtml(editorRef.current));
    }
  }, []);

  const writeCleanSelectionToClipboard = useCallback(
    (e: ReactClipboardEvent<HTMLDivElement>): { ed: HTMLDivElement; range: Range } | null => {
      const sel = window.getSelection();
      const ed = editorRef.current;
      if (!sel || sel.rangeCount === 0 || !ed) return null;
      const range = sel.getRangeAt(0);
      if (range.collapsed || !ed.contains(range.commonAncestorContainer)) return null;
      const div = document.createElement("div");
      div.appendChild(range.cloneContents());
      stripLiveSyntaxArtifacts(div);
      const html = div.innerHTML.replace(/\u200B/g, "");
      const plain = (div.textContent || "").replace(/\u200B/g, "");
      e.preventDefault();
      e.clipboardData.setData("text/html", html);
      e.clipboardData.setData("text/plain", plain);
      return { ed, range };
    },
    [],
  );

  const triggerWritingActivity = useCallback(() => {
    onWritingActivityRef.current?.();
  }, []);

  const captureUndoSnapshot = useCallback(
    (force = false, explicit?: { html: string; bookmark: CaretBookmark | null }) => {
      const ed = editorRef.current;
      if (!ed) return;
      const now = Date.now();
      if (!force && now - lastUndoAtRef.current < 450 && undoStackRef.current.length > 0) {
        return;
      }
      const snap = explicit ?? {
        html: serializeContainerMediaHtml(ed),
        bookmark: getCaretBookmark(ed),
      };
      const stack = undoStackRef.current;
      const top = stack[stack.length - 1];
      if (top && top.html === snap.html) return;
      stack.push(snap);
      if (stack.length > 80) stack.shift();
      redoStackRef.current = [];
      lastUndoAtRef.current = now;
    },
    [],
  );

  const performUndo = useCallback(() => {
    const ed = editorRef.current;
    if (!ed || undoStackRef.current.length === 0) return false;
    const currentHtml = serializeContainerMediaHtml(ed);
    const currentBookmark = getCaretBookmark(ed);

    let prev = undoStackRef.current.pop();
    while (prev && prev.html === currentHtml && undoStackRef.current.length > 0) {
      prev = undoStackRef.current.pop();
    }
    if (!prev || prev.html === currentHtml) return false;

    redoStackRef.current.push({ html: currentHtml, bookmark: currentBookmark });
    ed.innerHTML = prev.html;
    normalizeEditorImageBlocks(ed);
    void hydrateContainerMedia(ed);
    ed.focus();
    if (!restoreCaretBookmark(ed, prev.bookmark)) {
      const r = document.createRange();
      r.selectNodeContents(ed);
      r.collapse(false);
      const s = window.getSelection();
      s?.removeAllRanges();
      s?.addRange(r);
    }
    syncLiveMarkdownSyntax(ed);
    setSelectedImg(null);
    handleInput();
    triggerWritingActivity();
    return true;
  }, [handleInput, triggerWritingActivity]);

  const performRedo = useCallback(() => {
    const ed = editorRef.current;
    if (!ed || redoStackRef.current.length === 0) return false;
    const next = redoStackRef.current.pop();
    if (!next) return false;

    undoStackRef.current.push({
      html: serializeContainerMediaHtml(ed),
      bookmark: getCaretBookmark(ed),
    });
    ed.innerHTML = next.html;
    normalizeEditorImageBlocks(ed);
    void hydrateContainerMedia(ed);
    ed.focus();
    restoreCaretBookmark(ed, next.bookmark);
    syncLiveMarkdownSyntax(ed);
    setSelectedImg(null);
    handleInput();
    triggerWritingActivity();
    return true;
  }, [handleInput, triggerWritingActivity]);

  const removeGhostSpan = useCallback(() => {
    if (ghostSpanRef.current && ghostSpanRef.current.isConnected) {
      ghostSpanRef.current.remove();
    }
    ghostSpanRef.current = null;
  }, []);

  const insertGhostSpan = useCallback(
    (textNode: Text, offset: number, completion: string) => {
      removeGhostSpan();
      if (!textNode.isConnected) return;

      const span = document.createElement("span");
      span.setAttribute("data-ghost", "true");
      span.contentEditable = "false";
      span.textContent = completion;
      span.style.cssText =
        "color: var(--color-primary); opacity: 0.55; font-style: italic; pointer-events: none; user-select: none; display: inline;";

      const after = textNode.splitText(offset);
      textNode.parentNode?.insertBefore(span, after);
      ghostSpanRef.current = span;

      try {
        const sel = window.getSelection();
        const r = document.createRange();
        r.setStart(textNode, textNode.textContent?.length ?? 0);
        r.collapse(true);
        sel?.removeAllRanges();
        sel?.addRange(r);
      } catch {
        // ignore
      }
    },
    [removeGhostSpan],
  );

  const updateGhostSuggestion = useCallback(() => {
    const suggestFn = getSuggestionRef.current;
    if (!suggestFn || !editorRef.current) {
      removeGhostSpan();
      setGhostSuggestion(null);
      return;
    }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) {
      removeGhostSpan();
      setGhostSuggestion(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (
      !editorRef.current.contains(node) ||
      node === ghostSpanRef.current ||
      isInsideMarkdownSyntax(node, editorRef.current)
    ) {
      removeGhostSpan();
      setGhostSuggestion(null);
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      const textNode = node as Text;
      const textBefore = (textNode.textContent || "").slice(0, range.startOffset);
      const suggestion = suggestFn(textBefore);
      if (suggestion && suggestion.completion) {
        if (ghostSpanRef.current?.textContent !== suggestion.completion) {
          insertGhostSpan(textNode, range.startOffset, suggestion.completion);
        }
        setGhostSuggestion({
          completion: suggestion.completion,
          fullPhrase: suggestion.fullPhrase,
          node: textNode,
          offset: range.startOffset,
        });
        return;
      }
    }
    removeGhostSpan();
    setGhostSuggestion(null);
  }, [insertGhostSpan, removeGhostSpan]);

  const acceptGhostSuggestion = () => {
    if (!ghostSuggestion) return;
    removeGhostSpan();
    const { node: textNode, offset, completion } = ghostSuggestion;
    if (textNode && textNode.isConnected) {
      const text = textNode.textContent || "";
      textNode.textContent = text.slice(0, offset) + completion + text.slice(offset);
      try {
        const sel = window.getSelection();
        const r = document.createRange();
        r.setStart(textNode, offset + completion.length);
        r.collapse(true);
        sel?.removeAllRanges();
        sel?.addRange(r);
      } catch {
        // ignore
      }
    } else {
      document.execCommand("insertText", false, completion);
    }
    setGhostSuggestion(null);
    handleInput();
    triggerWritingActivity();
  };

  const getDirectEditorChild = useCallback((node: Node | null): HTMLElement | null => {
    if (!editorRef.current || !node) return null;
    let curr: Node | null = node;
    while (curr && curr.parentNode !== editorRef.current) {
      curr = curr.parentNode;
    }
    if (curr && curr.parentNode === editorRef.current && curr.nodeType === Node.ELEMENT_NODE) {
      return curr as HTMLElement;
    }
    return null;
  }, []);

  const getImageBlock = useCallback(
    (imgEl: HTMLImageElement): HTMLElement | null => {
      return getDirectEditorChild(imgEl) || imgEl;
    },
    [getDirectEditorChild],
  );

  const updateSelectedImgPos = useCallback((imgEl: HTMLImageElement) => {
    const wrap = wrapperRef.current;
    if (!wrap || !imgEl.isConnected) {
      setSelectedImg(null);
      return;
    }
    if (editorRef.current) {
      editorRef.current.querySelectorAll("img.is-selected").forEach((img) => {
        if (img !== imgEl) img.classList.remove("is-selected");
      });
    }
    imgEl.classList.add("is-selected");

    const wrapRect = wrap.getBoundingClientRect();
    const imgRect = imgEl.getBoundingClientRect();
    // Account for CSS transform scaling (e.g. Workspace Canvas 25%-300% zoom) so
    // unscaled CSS top/left match the wrapper's local coordinate space.
    const scaleX =
      wrap.offsetWidth > 0 && wrapRect.width > 0 ? wrapRect.width / wrap.offsetWidth : 1;
    const scaleY =
      wrap.offsetHeight > 0 && wrapRect.height > 0 ? wrapRect.height / wrap.offsetHeight : 1;
    const toolbarW = toolbarRef.current?.offsetWidth || 188;
    const toolbarH = toolbarRef.current?.offsetHeight || 32;

    const imgTop = (imgRect.top - wrapRect.top) / scaleY + wrap.scrollTop;
    const imgHeight = imgRect.height / scaleY;
    const imgLeft = (imgRect.left - wrapRect.left) / scaleX + wrap.scrollLeft;
    const imgWidth = imgRect.width / scaleX;

    const rawTop = imgTop + 8;
    const minVisibleTop = wrap.scrollTop + 6;
    const maxImgTop = Math.max(rawTop, imgTop + imgHeight - toolbarH - 6);
    const top = Math.min(Math.max(rawTop, minVisibleTop), maxImgTop);

    const desiredLeft = imgLeft + imgWidth - toolbarW - 8;
    const maxLeft = Math.max(8, wrap.scrollLeft + wrap.clientWidth - toolbarW - 8);
    const left = Math.max(8, Math.min(desiredLeft, maxLeft));
    const nextSrc = imgEl.currentSrc || imgEl.src;

    setSelectedImg((prev) => {
      if (
        prev &&
        prev.element === imgEl &&
        prev.src === nextSrc &&
        Math.abs(prev.top - top) < 1 &&
        Math.abs(prev.left - left) < 1
      ) {
        return prev;
      }
      return {
        element: imgEl,
        src: nextSrc,
        top,
        left,
      };
    });
  }, []);

  const clearSelectedImage = useCallback(() => {
    setSelectedImg((prev) => {
      if (prev) prev.element.classList.remove("is-selected");
      return null;
    });
    if (editorRef.current) {
      editorRef.current.querySelectorAll("img.is-selected").forEach((img) => {
        img.classList.remove("is-selected");
      });
    }
  }, []);

  const selectImageElement = useCallback(
    (imgEl: HTMLImageElement, clearSelection = true) => {
      imgEl.draggable = false;
      imgEl.setAttribute("draggable", "false");
      if (clearSelection) {
        editorRef.current?.focus({ preventScroll: true });
        window.getSelection()?.removeAllRanges();
      }
      updateSelectedImgPos(imgEl);
    },
    [updateSelectedImgPos],
  );

  const findImageBlockAtClientY = useCallback(
    (ed: HTMLElement, clientY: number): HTMLElement | null => {
      const blocks = ed.querySelectorAll(`[${NOTE_IMAGE_BLOCK_ATTR}="true"]`);
      for (const block of Array.from(blocks)) {
        const rect = block.getBoundingClientRect();
        if (clientY >= rect.top && clientY <= rect.bottom) {
          return block as HTMLElement;
        }
      }
      return null;
    },
    [],
  );

  const moveImageBlock = useCallback(
    (imgEl: HTMLImageElement, direction: "up" | "down") => {
      const ed = editorRef.current;
      if (!ed || !imgEl.isConnected) return;
      const block = getImageBlock(imgEl);
      if (!block || !block.parentElement) return;

      if (direction === "up") {
        const prev = block.previousElementSibling;
        if (prev) {
          captureUndoSnapshot(true);
          ed.insertBefore(block, prev);
          normalizeEditorImageBlocks(ed);
          handleInput();
          triggerWritingActivity();
          block.scrollIntoView({ block: "nearest", behavior: "smooth" });
          requestAnimationFrame(() => updateSelectedImgPos(imgEl));
        }
      } else {
        const next = block.nextElementSibling as HTMLElement | null;
        const isEmptyTailSpacer =
          next?.hasAttribute(NOTE_IMAGE_TAIL_ATTR) &&
          !next.textContent
            ?.replace(/\u00A0/g, "")
            .replace(/\u200B/g, "")
            .trim() &&
          !next.querySelector("img, hr, pre, ul, ol");
        if (next && !isEmptyTailSpacer) {
          captureUndoSnapshot(true);
          ed.insertBefore(block, next.nextElementSibling);
          normalizeEditorImageBlocks(ed);
          handleInput();
          triggerWritingActivity();
          block.scrollIntoView({ block: "nearest", behavior: "smooth" });
          requestAnimationFrame(() => updateSelectedImgPos(imgEl));
        }
      }
    },
    [captureUndoSnapshot, getImageBlock, handleInput, triggerWritingActivity, updateSelectedImgPos],
  );

  const handleRemoveImage = useCallback(
    (imgEl: HTMLImageElement) => {
      const ed = editorRef.current;
      captureUndoSnapshot(true);
      imgEl.classList.remove("is-selected");
      const block = getImageBlock(imgEl);
      const prevSib = block?.previousElementSibling as HTMLElement | null;
      const nextSib = block?.nextElementSibling as HTMLElement | null;

      if (block && block !== ed && block.contains(imgEl)) {
        if (block.hasAttribute(NOTE_IMAGE_BLOCK_ATTR) || !block.textContent?.trim()) {
          block.remove();
        } else {
          imgEl.remove();
        }
      } else {
        imgEl.remove();
      }
      setSelectedImg(null);

      if (ed) {
        normalizeEmptyEditorOnMount(ed);
        normalizeEditorImageBlocks(ed);
        handleInput();
        triggerWritingActivity();

        if (prevSib && prevSib.isConnected && !isImageBlockElement(prevSib)) {
          ed.focus({ preventScroll: true });
          const target =
            prevSib.tagName === "UL" || prevSib.tagName === "OL"
              ? ((prevSib.querySelector("li:last-child") as HTMLElement | null) ?? prevSib)
              : prevSib;
          placeCaretAtEnd(target);
        } else if (nextSib && nextSib.isConnected && !isImageBlockElement(nextSib)) {
          ed.focus({ preventScroll: true });
          const target =
            nextSib.tagName === "UL" || nextSib.tagName === "OL"
              ? ((nextSib.querySelector("li") as HTMLElement | null) ?? nextSib)
              : nextSib;
          placeCaretAtStart(target);
        } else if (ed.children.length === 0) {
          ed.focus();
        } else {
          placeCaretInEditableBlockAtY(ed, ed.getBoundingClientRect().top);
        }
        return;
      }

      handleInput();
      triggerWritingActivity();
    },
    [captureUndoSnapshot, getImageBlock, handleInput, triggerWritingActivity],
  );

  const commitInsertedImageUri = useCallback(
    async (storedUri: string, preAwaitRange: Range | null, shouldCaptureUndo = false) => {
      const ed = editorRef.current;
      if (!ed) return;
      if (shouldCaptureUndo) captureUndoSnapshot(true);

      const displayUrl =
        isMediaUri(storedUri) || storedUri.startsWith("/api/")
          ? await resolveMediaUrl(storedUri)
          : storedUri;

      const imgWrapper = document.createElement("div");
      imgWrapper.setAttribute(NOTE_IMAGE_BLOCK_ATTR, "true");
      imgWrapper.contentEditable = "false";
      const img = document.createElement("img");
      img.src = displayUrl;
      if (isMediaUri(storedUri) || storedUri.startsWith("/api/")) {
        img.setAttribute("data-media-uri", storedUri);
      }
      img.alt = "Note snapshot";
      img.draggable = false;
      img.setAttribute("draggable", "false");
      imgWrapper.appendChild(img);

      const sel = window.getSelection();
      const liveRange =
        sel && sel.rangeCount > 0 && ed.contains(sel.getRangeAt(0).startContainer)
          ? sel.getRangeAt(0)
          : preAwaitRange &&
              preAwaitRange.startContainer.isConnected &&
              ed.contains(preAwaitRange.startContainer)
            ? preAwaitRange
            : null;

      let caretTarget: HTMLElement | null = null;
      if (liveRange) {
        ({ caretTarget } = insertImageBlockCleanly(ed, liveRange, imgWrapper));
      } else {
        const lastEl = ed.lastElementChild as HTMLElement | null;
        if (lastEl && isBlockEmptyForImage(lastEl)) {
          lastEl.replaceWith(imgWrapper);
        } else {
          ed.appendChild(imgWrapper);
        }
        caretTarget = resolvePostImageCaretTarget(ed, imgWrapper);
      }

      normalizeEditorImageBlocks(ed);

      if (caretTarget && caretTarget.isConnected) {
        clearSelectedImage();
        placeCaretAtStart(caretTarget);
      } else {
        selectImageElement(img);
      }

      handleInput();
      triggerWritingActivity();
      const syncInsertedImage = () => {
        if (!img.isConnected) return;
        img.scrollIntoView({ block: "nearest" });
        if (!caretTarget || !caretTarget.isConnected) {
          updateSelectedImgPos(img);
        }
      };
      if (!img.complete || img.naturalWidth === 0) {
        img.addEventListener("load", syncInsertedImage, { once: true });
      }
      requestAnimationFrame(syncInsertedImage);
    },
    [
      captureUndoSnapshot,
      clearSelectedImage,
      handleInput,
      selectImageElement,
      triggerWritingActivity,
      updateSelectedImgPos,
    ],
  );

  const capturePreAwaitRange = useCallback((): Range | null => {
    const ed = editorRef.current;
    if (!ed) return null;
    const selBefore = window.getSelection();
    return selBefore &&
      selBefore.rangeCount > 0 &&
      ed.contains(selBefore.getRangeAt(0).startContainer)
      ? selBefore.getRangeAt(0).cloneRange()
      : null;
  }, []);

  const handleImageInsert = useCallback(
    async (rawSrcOrFile: string | File) => {
      const ed = editorRef.current;
      if (!ed) return;
      const preAwaitRange = capturePreAwaitRange();
      ed.focus({ preventScroll: true });
      captureUndoSnapshot(true);

      const storedUri =
        typeof rawSrcOrFile === "string"
          ? await saveMediaDataUrl(rawSrcOrFile, courseIdRef.current)
          : await saveMediaFile(rawSrcOrFile, courseIdRef.current);

      await commitInsertedImageUri(storedUri, preAwaitRange, false);
    },
    [capturePreAwaitRange, captureUndoSnapshot, commitInsertedImageUri],
  );

  const tryPasteSameCourseVaultImages = useCallback(
    async (rawHtml: string, explicitRange?: Range | null): Promise<boolean> => {
      const uris = extractSameCourseVaultImageUrisFromHtml(rawHtml, courseIdRef.current);
      if (!uris || uris.length === 0) return false;
      const checks = await Promise.all(uris.map((uri) => verifyVaultMediaExists(uri)));
      if (checks.some((exists) => !exists)) return false;

      const ed = editorRef.current;
      if (!ed) return false;
      const initialRange = explicitRange ?? capturePreAwaitRange();
      ed.focus({ preventScroll: true });
      captureUndoSnapshot(true);
      for (let i = 0; i < uris.length; i++) {
        await commitInsertedImageUri(uris[i]!, i === 0 ? initialRange : null, false);
      }
      return true;
    },
    [capturePreAwaitRange, captureUndoSnapshot, commitInsertedImageUri],
  );

  useEffect(() => {
    void preloadSpellChecker();
    const ed = editorRef.current;
    if (!ed) return;
    registerEditorContextHooks(ed, {
      onBeforeMutate: () => captureUndoSnapshot(true),
      onAfterPaste: () => {
        normalizeEditorImageBlocks(ed);
        syncLiveMarkdownSyntax(ed);
        handleInput();
        void hydrateContainerMedia(ed);
        triggerWritingActivity();
      },
      onPasteImage: (file) => handleImageInsert(file),
      onTryPasteVaultHtml: (rawHtml) => tryPasteSameCourseVaultImages(rawHtml),
    });
  }, [
    captureUndoSnapshot,
    handleImageInsert,
    handleInput,
    triggerWritingActivity,
    tryPasteSameCourseVaultImages,
  ]);

  const handleSelectedImageKeyDown = useCallback(
    (e: KeyboardEvent | React.KeyboardEvent<HTMLDivElement>): boolean => {
      if (!selectedImg || !selectedImg.element.isConnected) return false;
      const ed = editorRef.current;
      if (!ed) return false;

      if (e.altKey && (e.key === "ArrowUp" || e.key === "Up")) {
        e.preventDefault();
        e.stopPropagation();
        moveImageBlock(selectedImg.element, "up");
        return true;
      }
      if (e.altKey && (e.key === "ArrowDown" || e.key === "Down")) {
        e.preventDefault();
        e.stopPropagation();
        moveImageBlock(selectedImg.element, "down");
        return true;
      }

      const sel = window.getSelection();
      const hasTextCaret = Boolean(
        sel && sel.rangeCount > 0 && ed.contains(sel.getRangeAt(0).startContainer),
      );

      const lower = e.key.toLowerCase();
      if (!hasTextCaret && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
        if (lower === "c" || lower === "x") {
          e.preventDefault();
          e.stopPropagation();
          const imgEl = selectedImg.element;
          const imgSrc = selectedImg.src;
          void copyImageToClipboard(imgSrc)
            .then(() => {
              if (lower === "x") {
                if (imgEl.isConnected) handleRemoveImage(imgEl);
              } else {
                toast("Image copied");
              }
            })
            .catch(() => {
              toast.error("Could not copy image.");
            });
          return true;
        }
      }

      if (e.key === "Backspace" || e.key === "Delete") {
        if (hasTextCaret) {
          clearSelectedImage();
          return false;
        }
        e.preventDefault();
        e.stopPropagation();
        handleRemoveImage(selectedImg.element);
        return true;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        clearSelectedImage();
        return true;
      }

      if (!hasTextCaret && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        const direction =
          e.key === "Enter"
            ? ("enter" as const)
            : e.key === "ArrowDown" || e.key === "ArrowRight"
              ? ("after" as const)
              : e.key === "ArrowUp" || e.key === "ArrowLeft"
                ? ("before" as const)
                : null;
        if (direction) {
          e.preventDefault();
          e.stopPropagation();
          const { nextSelectedImage, mutatedDom } = moveCaretOutOfImageBlock(
            ed,
            selectedImg.element,
            direction,
          );
          if (nextSelectedImage) {
            selectImageElement(nextSelectedImage);
          } else {
            clearSelectedImage();
          }
          if (mutatedDom) {
            handleInput();
            triggerWritingActivity();
          }
          return true;
        }
      }

      return false;
    },
    [
      clearSelectedImage,
      handleInput,
      handleRemoveImage,
      moveImageBlock,
      selectImageElement,
      selectedImg,
      triggerWritingActivity,
    ],
  );

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const ed = editorRef.current;
    if (handleSelectedImageKeyDown(e)) {
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && onSubmit) {
      e.preventDefault();
      e.stopPropagation();
      onSubmit();
      return;
    }
    if (e.key === "Escape") {
      if (ghostSuggestion) {
        e.preventDefault();
        e.stopPropagation();
        removeGhostSpan();
        setGhostSuggestion(null);
        return;
      }
      if (onCancel) {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
      return;
    }
    if (ghostSuggestion && (e.key === "Tab" || e.key === "ArrowRight")) {
      if (e.key === "ArrowRight") {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const r = sel.getRangeAt(0);
          if (r.startOffset < (r.startContainer.textContent?.length ?? 0)) return;
        }
      }
      e.preventDefault();
      e.stopPropagation();
      captureUndoSnapshot(true);
      acceptGhostSuggestion();
      return;
    }

    if (ed && (e.ctrlKey || e.metaKey) && !e.altKey) {
      const lower = e.key.toLowerCase();
      if (lower === "z" && !e.shiftKey) {
        if (performUndo()) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }
      if ((lower === "z" && e.shiftKey) || (lower === "y" && !e.shiftKey)) {
        if (performRedo()) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }
      if (lower === "l" && !e.shiftKey) {
        captureUndoSnapshot(true);
        if (toggleTaskListCommand(ed)) {
          e.preventDefault();
          e.stopPropagation();
          handleInput();
          triggerWritingActivity();
        }
        return;
      }
      if (lower === "e" && !e.shiftKey) {
        captureUndoSnapshot(true);
        if (toggleInlineWrapperCommand(ed, "code")) {
          e.preventDefault();
          e.stopPropagation();
          handleInput();
          triggerWritingActivity();
        }
        return;
      }
      if (lower === "h" && e.shiftKey) {
        captureUndoSnapshot(true);
        if (toggleInlineWrapperCommand(ed, "mark")) {
          e.preventDefault();
          e.stopPropagation();
          handleInput();
          triggerWritingActivity();
        }
        return;
      }
      if ((lower === "x" || lower === "s") && e.shiftKey) {
        captureUndoSnapshot(true);
        if (toggleInlineWrapperCommand(ed, "s")) {
          e.preventDefault();
          e.stopPropagation();
          handleInput();
          triggerWritingActivity();
        }
        return;
      }
      if (lower === "v" && e.shiftKey) {
        forcePlainPasteRef.current = true;
        return;
      }
      if ((lower === "b" || lower === "i") && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        captureUndoSnapshot(true);
        stripSyntaxBeforeExecCommand(ed);
        document.execCommand(lower === "b" ? "bold" : "italic", false);
        syncLiveMarkdownSyntax(ed);
        handleInput();
        triggerWritingActivity();
        return;
      }
    }

    if (!["Control", "Shift", "Alt", "Meta", "CapsLock"].includes(e.key)) {
      removeGhostSpan();
      setGhostSuggestion(null);
      triggerWritingActivity();
    }

    if (e.nativeEvent.isComposing || !ed) return;

    if (e.key === "Tab" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      captureUndoSnapshot(true);
      if (applyMarkdownOnTab(ed, e.shiftKey)) {
        e.preventDefault();
        e.stopPropagation();
        handleInput();
      }
      return;
    }

    if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      captureUndoSnapshot(true);
      if (applyMarkdownOnEnter(ed, e.shiftKey)) {
        e.preventDefault();
        handleInput();
      }
      return;
    }

    if (e.key === "Backspace" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
      const snapBefore = {
        html: serializeContainerMediaHtml(ed),
        bookmark: getCaretBookmark(ed),
      };
      if (handleMarkdownDelimiterBackspace(ed)) {
        captureUndoSnapshot(true, snapBefore);
        e.preventDefault();
        e.stopPropagation();
        handleInput();
        return;
      }
      const boundaryImg = resolveImageBoundaryBeforeBackspace(ed);
      if (boundaryImg) {
        e.preventDefault();
        e.stopPropagation();
        selectImageElement(boundaryImg);
        handleInput();
        return;
      }
      captureUndoSnapshot(true);
      if (applyMarkdownOnBackspace(ed)) {
        e.preventDefault();
        handleInput();
      }
      return;
    }

    if (e.key === "Delete" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
      const boundaryImg = resolveImageBoundaryBeforeDelete(ed);
      if (boundaryImg) {
        e.preventDefault();
        e.stopPropagation();
        selectImageElement(boundaryImg);
      }
      return;
    }

    if (
      (e.key === "ArrowLeft" || e.key === "ArrowRight") &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      !e.shiftKey
    ) {
      if (resolveInlineBoundaryOnArrow(ed, e.key)) {
        e.preventDefault();
        e.stopPropagation();
        requestAnimationFrame(updateGhostSuggestion);
        return;
      }
    }

    if (
      (e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowDown") &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      !e.shiftKey
    ) {
      const targetImg = resolveArrowIntoImageBlock(ed, e.key);
      if (targetImg) {
        e.preventDefault();
        e.stopPropagation();
        selectImageElement(targetImg);
        return;
      }
    }

    const isSpaceKey = e.key === " " || e.code === "Space";
    if (isSpaceKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      handledSpaceKeyDownRef.current = true;
      captureUndoSnapshot(true);
      unwrapEmptyInlinePairOnSpace(ed);
      if (applyMarkdownOnSpace(ed)) {
        e.preventDefault();
        handleInput();
      }
      return;
    }

    if (
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      ["(", ")", "[", "]", '"', "`", "*", "~", "="].includes(e.key)
    ) {
      const snapBefore = {
        html: serializeContainerMediaHtml(ed),
        bookmark: getCaretBookmark(ed),
      };
      if (handleMarkdownDelimiterKeyDown(ed, e.key)) {
        captureUndoSnapshot(true, snapBefore);
        e.preventDefault();
        handleInput();
        return;
      }
    }

    if (
      ![
        "Control",
        "Shift",
        "Alt",
        "Meta",
        "CapsLock",
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
      ].includes(e.key)
    ) {
      captureUndoSnapshot(false);
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    const forcePlain = forcePlainPasteRef.current;
    forcePlainPasteRef.current = false;
    triggerWritingActivity();

    if (!forcePlain) {
      const ed = editorRef.current;
      const rawHtml = e.clipboardData?.getData("text/html") ?? "";
      const plain = e.clipboardData?.getData("text/plain")?.trim() ?? "";
      const items = e.clipboardData?.items ? Array.from(e.clipboardData.items) : [];
      const pastedImageFiles = items
        .filter((item) => item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));

      if (rawHtml && extractSameCourseVaultImageUrisFromHtml(rawHtml, courseIdRef.current)) {
        e.preventDefault();
        const preAwaitRange = capturePreAwaitRange();
        if (await tryPasteSameCourseVaultImages(rawHtml, preAwaitRange)) {
          return;
        }
      }

      if (pastedImageFiles.length > 0) {
        e.preventDefault();
        try {
          await handleImageInsert(pastedImageFiles[0]!);
        } catch (err: unknown) {
          toast.error(err instanceof Error ? err.message : "Failed to paste image.");
        }
        return;
      }

      if (ed && plain && /^https?:\/\/\S+$/i.test(plain)) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed) {
          const snapBefore = {
            html: serializeContainerMediaHtml(ed),
            bookmark: getCaretBookmark(ed),
          };
          if (wrapSelectionAsLink(ed, plain)) {
            captureUndoSnapshot(true, snapBefore);
            e.preventDefault();
            handleInput();
            return;
          }
        }
      }

      if (ed && rawHtml) {
        const cleanHtml = sanitizeClipboardHtml(rawHtml);
        if (cleanHtml) {
          e.preventDefault();
          captureUndoSnapshot(true);
          if (typeof document.execCommand === "function") {
            document.execCommand("insertHTML", false, cleanHtml);
          }
          normalizeEditorImageBlocks(ed);
          syncLiveMarkdownSyntax(ed);
          handleInput();
          void hydrateContainerMedia(ed);
          return;
        }
      }
      captureUndoSnapshot(true);
      return;
    }

    const ed = editorRef.current;
    const plainText = e.clipboardData?.getData("text/plain") ?? "";
    e.preventDefault();
    if (!ed || !plainText) return;
    captureUndoSnapshot(true);
    const applied =
      typeof document.execCommand === "function" &&
      document.execCommand("insertText", false, plainText);
    if (!applied) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const textNode = document.createTextNode(plainText);
        range.insertNode(textNode);
        range.setStart(textNode, plainText.length);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
    syncLiveMarkdownSyntax(ed);
    handleInput();
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    triggerWritingActivity();
    const files = e.dataTransfer?.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      if (file.type.startsWith("image/")) {
        e.stopPropagation();
        try {
          await handleImageInsert(file);
        } catch (err: unknown) {
          toast.error(err instanceof Error ? err.message : "Failed to drop image.");
        }
        return;
      }
    }
  };

  const handleEditorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" && target.hasAttribute("data-task-checkbox")) {
      e.stopPropagation();
      captureUndoSnapshot(true);
      toggleTaskCheckboxElement(target as HTMLInputElement);
      handleInput();
      triggerWritingActivity();
      return;
    }
    const anchor = target.closest("a");
    if (anchor && editorRef.current?.contains(anchor) && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      e.stopPropagation();
      const safeHref = sanitizeHttpUrl(anchor.getAttribute("href") || "");
      if (safeHref) {
        window.open(safeHref, "_blank", "noopener,noreferrer");
      }
      return;
    }
    if (editorRef.current && target.tagName !== "IMG") {
      exitInlineMarkOnClick(editorRef.current, e.clientX);
    }
    const imgBlock = target.closest(`[${NOTE_IMAGE_BLOCK_ATTR}="true"]`) as HTMLElement | null;
    if (imgBlock && editorRef.current?.contains(imgBlock)) {
      e.stopPropagation();
      const imgEl = imgBlock.querySelector("img");
      if (imgEl) selectImageElement(imgEl);
      return;
    }
    if (target.tagName === "IMG") {
      e.stopPropagation();
      selectImageElement(target as HTMLImageElement);
      return;
    }
    if (target.closest(".image-action-toolbar")) return;
    if (selectedImg) {
      clearSelectedImage();
    }
    if (target === wrapperRef.current && editorRef.current) {
      const ed = editorRef.current;
      if (findImageBlockAtClientY(ed, e.clientY)) return;
      if (ed.querySelector(`[${NOTE_IMAGE_BLOCK_ATTR}="true"]`)) return;
      ed.focus();
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.selectNodeContents(ed);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  };

  useEffect(() => {
    if (croppingImage) return;
    const handleSelectionChange = () => {
      const ed = editorRef.current;
      if (!ed) return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (!ed.contains(range.startContainer)) return;

      syncLiveMarkdownSyntax(ed);

      if (!range.collapsed) return;

      const startEl =
        range.startContainer.nodeType === Node.ELEMENT_NODE
          ? (range.startContainer as HTMLElement)
          : range.startContainer.parentElement;
      const insideImgBlock = startEl?.closest(`[${NOTE_IMAGE_BLOCK_ATTR}="true"]`);
      if (insideImgBlock && ed.contains(insideImgBlock)) {
        const img = insideImgBlock.querySelector("img");
        sel.removeAllRanges();
        if (img) updateSelectedImgPos(img);
        return;
      }

      if (range.startContainer === ed && ed.children.length > 0) {
        const before = ed.childNodes[range.startOffset - 1] ?? null;
        const after = ed.childNodes[range.startOffset] ?? null;
        if (after && isImageBlockElement(after)) {
          const img = (after as HTMLElement).querySelector("img");
          sel.removeAllRanges();
          if (img) updateSelectedImgPos(img);
          return;
        }
        if (before && isImageBlockElement(before)) {
          if (after && after.nodeType === Node.ELEMENT_NODE && !isImageBlockElement(after)) {
            const afterEl = after as HTMLElement;
            const target =
              afterEl.tagName === "UL" || afterEl.tagName === "OL"
                ? ((afterEl.querySelector("li") as HTMLElement | null) ?? afterEl)
                : afterEl;
            placeCaretAtStart(target);
          } else {
            const img = (before as HTMLElement).querySelector("img");
            sel.removeAllRanges();
            if (img) updateSelectedImgPos(img);
          }
        }
      }
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [croppingImage, updateSelectedImgPos]);

  useEffect(() => {
    if (!selectedImg) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const targetImgBlock = target?.closest(`[${NOTE_IMAGE_BLOCK_ATTR}="true"]`);
      if (
        !target?.closest(".image-action-toolbar") &&
        target !== selectedImg.element &&
        !targetImgBlock?.contains(selectedImg.element)
      ) {
        clearSelectedImage();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!selectedImg.element.isConnected) {
        setSelectedImg(null);
        return;
      }
      handleSelectedImageKeyDown(e);
    };

    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    const rafId = requestAnimationFrame(() => updateSelectedImgPos(selectedImg.element));

    const wrap = wrapperRef.current;
    const onWrapScroll = () => updateSelectedImgPos(selectedImg.element);
    wrap?.addEventListener("scroll", onWrapScroll, { passive: true });

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        updateSelectedImgPos(selectedImg.element);
      });
      ro.observe(selectedImg.element);
      if (wrap) ro.observe(wrap);
      if (toolbarRef.current) ro.observe(toolbarRef.current);
    }

    return () => {
      cancelAnimationFrame(rafId);
      wrap?.removeEventListener("scroll", onWrapScroll);
      ro?.disconnect();
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [selectedImg, clearSelectedImage, handleSelectedImageKeyDown, updateSelectedImgPos]);

  useEffect(() => {
    if (!croppingImage) return;
    const syncRect = () => {
      const wrap = wrapperRef.current;
      const imgEl = croppingImage.element;
      if (!wrap || !imgEl.isConnected) {
        setCroppingImage(null);
        return;
      }
      const next = measureImageLocalRect(imgEl, wrap);
      setCroppingImage((prev) => {
        if (!prev || prev.element !== imgEl) return prev;
        if (
          Math.abs(prev.top - next.top) < 0.5 &&
          Math.abs(prev.left - next.left) < 0.5 &&
          Math.abs(prev.width - next.width) < 0.5 &&
          Math.abs(prev.height - next.height) < 0.5
        ) {
          return prev;
        }
        return { ...prev, ...next };
      });
    };

    const rafId = requestAnimationFrame(syncRect);
    const wrap = wrapperRef.current;
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(syncRect);
      ro.observe(croppingImage.element);
      if (wrap) ro.observe(wrap);
    }
    window.addEventListener("resize", syncRect);
    return () => {
      cancelAnimationFrame(rafId);
      ro?.disconnect();
      window.removeEventListener("resize", syncRect);
    };
  }, [croppingImage]);

  const handleApplyCrop = async (croppedDataUrl: string, didModify: boolean) => {
    const activeCrop = croppingImage;
    setCroppingImage(null);
    if (!activeCrop) return;

    let targetImg: HTMLImageElement | null = activeCrop.element.isConnected
      ? activeCrop.element
      : null;
    if (!targetImg && editorRef.current) {
      for (const img of Array.from(editorRef.current.querySelectorAll("img"))) {
        if (img.src === activeCrop.src) {
          targetImg = img;
          break;
        }
      }
    }

    if (didModify && croppedDataUrl && targetImg) {
      captureUndoSnapshot(true);
      const storedUri = await saveMediaDataUrl(croppedDataUrl, courseIdRef.current);
      const displayUrl =
        isMediaUri(storedUri) || storedUri.startsWith("/api/")
          ? await resolveMediaUrl(storedUri)
          : storedUri;
      targetImg.src = displayUrl;
      if (isMediaUri(storedUri) || storedUri.startsWith("/api/")) {
        targetImg.setAttribute("data-media-uri", storedUri);
      } else {
        targetImg.removeAttribute("data-media-uri");
      }

      if (editorRef.current) {
        normalizeEditorImageBlocks(editorRef.current);
      }
      handleInput();
      triggerWritingActivity();
    }

    if (targetImg && targetImg.isConnected) {
      selectImageElement(targetImg);
    } else {
      setSelectedImg(null);
    }
  };

  const execCmd = (cmd: string) => {
    const ed = editorRef.current;
    captureUndoSnapshot(true);
    if (ed) stripSyntaxBeforeExecCommand(ed);
    document.execCommand(cmd, false);
    if (ed) syncLiveMarkdownSyntax(ed);
    handleInput();
    triggerWritingActivity();
  };

  return (
    <div className={cn("relative flex flex-col overflow-hidden", className)}>
      <div
        className={cn(
          "flex items-center gap-0.5 border-b border-border/50 bg-secondary/30",
          compactToolbar ? "px-2 pb-1.5 pt-1" : "px-2.5 pb-2 pt-1.5",
        )}
      >
        <EditorToolBtn label="Bold (Ctrl+B)" onClick={() => execCmd("bold")}>
          <Bold />
        </EditorToolBtn>
        <EditorToolBtn label="Italic (Ctrl+I)" onClick={() => execCmd("italic")}>
          <Italic />
        </EditorToolBtn>
        <EditorToolBtn label="Strikethrough" onClick={() => execCmd("strikeThrough")}>
          <Strikethrough />
        </EditorToolBtn>
        <div className="mx-1 h-3.5 w-px bg-border" />
        <EditorToolBtn label="Bullet list" onClick={() => execCmd("insertUnorderedList")}>
          <List />
        </EditorToolBtn>
        <div className="mx-1 h-3.5 w-px bg-border" />
        <EditorToolBtn label="Add image" onClick={() => fileInputRef.current?.click()}>
          <ImagePlus />
        </EditorToolBtn>
        {onCaptureScreenshot && (
          <EditorToolBtn
            label="Capture video screenshot"
            onClick={async () => {
              const dataUrl = await onCaptureScreenshot();
              if (dataUrl) await handleImageInsert(dataUrl);
            }}
          >
            <Camera />
          </EditorToolBtn>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              await handleImageInsert(file);
            } catch (err: unknown) {
              toast.error(err instanceof Error ? err.message : "Failed to load image.");
            }
            e.target.value = "";
          }}
        />
      </div>

      <div
        ref={wrapperRef}
        data-note-scroll-wrapper="true"
        onClick={handleEditorClick}
        onContextMenu={(e) => {
          if (e.currentTarget.closest("[data-canvas-card-id]")) return;
          e.preventDefault();
          e.stopPropagation();
          setContextMenu({
            clientX: e.clientX,
            clientY: e.clientY,
            analysis: inspectAppContextTarget({
              clientX: e.clientX,
              clientY: e.clientY,
              target: e.target,
            }),
          });
        }}
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          const target = e.target as HTMLElement | null;
          if (
            !target ||
            target.closest(".image-action-toolbar") ||
            target.closest(".in-place-image-cropper")
          ) {
            return;
          }

          if (croppingImage) {
            setCroppingImage(null);
          }

          const imgBlock = target.closest(
            `[${NOTE_IMAGE_BLOCK_ATTR}="true"]`,
          ) as HTMLElement | null;
          if (imgBlock && editorRef.current?.contains(imgBlock)) {
            e.preventDefault();
            e.stopPropagation();
            const img = imgBlock.querySelector("img");
            if (img) selectImageElement(img);
            return;
          }

          if (target.tagName === "IMG" && editorRef.current?.contains(target)) {
            e.preventDefault();
            e.stopPropagation();
            selectImageElement(target as HTMLImageElement);
            return;
          }

          const ed = editorRef.current;
          if (!ed) return;
          if (target === wrapperRef.current || target === ed) {
            const bandImgBlock = findImageBlockAtClientY(ed, e.clientY);
            if (bandImgBlock) {
              e.preventDefault();
              e.stopPropagation();
              const img = bandImgBlock.querySelector("img");
              if (img) selectImageElement(img);
              return;
            }
            const lastChild = ed.lastElementChild as HTMLElement | null;
            const clickedBelowContent =
              target === wrapperRef.current ||
              !lastChild ||
              e.clientY > lastChild.getBoundingClientRect().bottom;
            if (clickedBelowContent || ed.querySelector(`[${NOTE_IMAGE_BLOCK_ATTR}="true"]`)) {
              e.preventDefault();
              clearSelectedImage();
              placeCaretInEditableBlockAtY(ed, e.clientY);
            }
          }
        }}
        onScroll={() => {
          updateGhostSuggestion();
          if (selectedImg) updateSelectedImgPos(selectedImg.element);
        }}
        style={{ scrollbarGutter: "stable", ...wrapperStyle }}
        className={cn(
          "relative w-full cursor-text overflow-y-auto px-3.5 py-3 pb-8 custom-scrollbar-sm",
          maxHeightClassName,
          minHeightClassName,
          wrapperClassName,
        )}
      >
        <div
          ref={editorRef}
          contentEditable={!croppingImage}
          spellCheck
          suppressContentEditableWarning
          onBeforeInput={() => {
            const ed = editorRef.current;
            if (ed) {
              beforeInputSnapRef.current = {
                html: serializeContainerMediaHtml(ed),
                bookmark: getCaretBookmark(ed),
              };
            }
          }}
          onInput={(e) => {
            removeGhostSpan();
            setGhostSuggestion(null);
            if (selectedImg) {
              clearSelectedImage();
            }
            const ed = editorRef.current;
            const nativeEv = e.nativeEvent as InputEvent;
            const isComposing = Boolean(nativeEv.isComposing);
            const insertedSpaceViaIme =
              !handledSpaceKeyDownRef.current &&
              !isComposing &&
              nativeEv.inputType === "insertText" &&
              nativeEv.data === " ";
            handledSpaceKeyDownRef.current = false;

            if (ed && !isComposing) {
              syncImageTailParagraphs(ed);
              const hasLooseImg = Array.from(ed.querySelectorAll("img")).some(
                (img) => !img.closest(`[${NOTE_IMAGE_BLOCK_ATTR}="true"]`),
              );
              if (hasLooseImg) {
                normalizeEditorImageBlocks(ed);
              }
              if (insertedSpaceViaIme) {
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0 && sel.isCollapsed) {
                  const r = sel.getRangeAt(0);
                  if (
                    r.startContainer.nodeType === Node.TEXT_NODE &&
                    r.startOffset > 0 &&
                    (r.startContainer.nodeValue || "").charAt(r.startOffset - 1) === " "
                  ) {
                    const tn = r.startContainer as Text;
                    const off = r.startOffset;
                    const val = tn.nodeValue || "";
                    tn.nodeValue = val.slice(0, off - 1) + val.slice(off);
                    const nextR = document.createRange();
                    nextR.setStart(tn, off - 1);
                    nextR.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(nextR);
                    unwrapEmptyInlinePairOnSpace(ed);
                    if (applyMarkdownOnSpace(ed)) {
                      if (beforeInputSnapRef.current) {
                        captureUndoSnapshot(true, beforeInputSnapRef.current);
                      }
                      beforeInputSnapRef.current = null;
                      handleInput();
                      triggerWritingActivity();
                      requestAnimationFrame(updateGhostSuggestion);
                      return;
                    }
                    // Restore space if no block trigger matched
                    const curVal = tn.nodeValue || "";
                    tn.nodeValue = curVal.slice(0, off - 1) + " " + curVal.slice(off - 1);
                    const restoreR = document.createRange();
                    restoreR.setStart(tn, off);
                    restoreR.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(restoreR);
                  }
                }
              }

              reconcileActiveMarkdownSyntax(ed);
              if (applyInlineMarkdownAtCaret(ed) && beforeInputSnapRef.current) {
                captureUndoSnapshot(true, beforeInputSnapRef.current);
              }
              syncLiveMarkdownSyntax(ed);
            }
            beforeInputSnapRef.current = null;
            handleInput();
            triggerWritingActivity();
            requestAnimationFrame(updateGhostSuggestion);
          }}
          onKeyUp={(e) => {
            if (!["Tab", "ArrowRight"].includes(e.key)) {
              updateGhostSuggestion();
            }
          }}
          onMouseUp={updateGhostSuggestion}
          onBlur={() => {
            if (blurTimeoutRef.current !== null) {
              window.clearTimeout(blurTimeoutRef.current);
            }
            blurTimeoutRef.current = window.setTimeout(() => {
              blurTimeoutRef.current = null;
              removeGhostSpan();
              setGhostSuggestion(null);
              const ed = editorRef.current;
              if (
                ed &&
                !contextMenuOpenRef.current &&
                document.activeElement !== ed &&
                !ed.contains(document.activeElement)
              ) {
                clearAllLiveMarkdownSyntax(ed);
              }
            }, 150);
          }}
          onCopy={(e) => {
            writeCleanSelectionToClipboard(e);
          }}
          onCut={(e) => {
            const extracted = writeCleanSelectionToClipboard(e);
            if (!extracted) return;
            const { ed, range } = extracted;
            captureUndoSnapshot(true);
            range.deleteContents();
            range.collapse(true);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
            normalizeEmptyEditorOnMount(ed);
            if (
              ed.firstElementChild &&
              (!ed.contains(range.startContainer) || range.startContainer === ed)
            ) {
              placeCaretAtStart(ed.firstElementChild as HTMLElement);
            }
            syncImageTailParagraphs(ed);
            reconcileActiveMarkdownSyntax(ed);
            syncLiveMarkdownSyntax(ed);
            handleInput();
            triggerWritingActivity();
          }}
          onFocus={() => {
            if (blurTimeoutRef.current !== null) {
              window.clearTimeout(blurTimeoutRef.current);
              blurTimeoutRef.current = null;
            }
            try {
              document.execCommand("defaultParagraphSeparator", false, "p");
            } catch {
              // ignore unsupported browsers
            }
          }}
          onKeyDown={handleEditorKeyDown}
          onPaste={handlePaste}
          onDragStart={(e) => {
            const target = e.target as HTMLElement;
            if (target.tagName === "IMG") e.preventDefault();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (draggingBlockRef.current) {
              e.dataTransfer.dropEffect = "move";
              const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
              const targetBlock = target ? getDirectEditorChild(target) : null;
              if (
                targetBlock &&
                targetBlock !== draggingBlockRef.current &&
                editorRef.current?.contains(targetBlock)
              ) {
                const rect = targetBlock.getBoundingClientRect();
                const isAfter = e.clientY > rect.top + rect.height / 2;
                if (isAfter) {
                  editorRef.current.insertBefore(
                    draggingBlockRef.current,
                    targetBlock.nextElementSibling,
                  );
                } else {
                  editorRef.current.insertBefore(draggingBlockRef.current, targetBlock);
                }
              }
            } else {
              e.dataTransfer.dropEffect = "copy";
            }
          }}
          onDrop={(e) => {
            if (draggingBlockRef.current) {
              e.preventDefault();
              e.stopPropagation();
              handleInput();
              triggerWritingActivity();
              const imgEl = selectedImg?.element;
              draggingBlockRef.current = null;
              if (imgEl && imgEl.isConnected) {
                requestAnimationFrame(() => updateSelectedImgPos(imgEl));
              }
              return;
            }
            void handleDrop(e);
          }}
          className="note-editor min-h-[68px] w-full text-sm leading-[1.5] outline-none"
          data-placeholder={placeholder}
          dir="auto"
        />

        {ghostSuggestion && (
          <div className="pointer-events-none absolute bottom-2 right-2 z-20 flex items-center gap-1">
            <span className="inline-flex select-none items-center gap-0.5 rounded bg-primary-soft px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary">
              Tab
            </span>
          </div>
        )}

        {croppingImage && (
          <InPlaceImageCropOverlay
            imageSrc={croppingImage.src}
            fallbackElement={croppingImage.element}
            rect={{
              top: croppingImage.top,
              left: croppingImage.left,
              width: croppingImage.width,
              height: croppingImage.height,
            }}
            wrapperElement={wrapperRef.current}
            onApplyCrop={handleApplyCrop}
            onCancel={() => {
              const targetImg = croppingImage.element;
              setCroppingImage(null);
              if (targetImg.isConnected) {
                selectImageElement(targetImg);
              }
            }}
          />
        )}

        {selectedImg && !croppingImage && (
          <div
            ref={toolbarRef}
            className="image-action-toolbar pointer-events-auto absolute z-20 flex items-center gap-0.5 rounded-lg bg-popover/95 p-1 text-popover-foreground shadow-workspace backdrop-blur-sm animate-in fade-in zoom-in-95 duration-150"
            style={{
              top: `${Math.max(6, selectedImg.top)}px`,
              left: `${Math.max(6, selectedImg.left)}px`,
            }}
          >
            <div
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-note-image", "1");
                e.dataTransfer.effectAllowed = "move";
                draggingBlockRef.current = getImageBlock(selectedImg.element);
              }}
              onDragEnd={() => {
                draggingBlockRef.current = null;
              }}
              className="flex size-6 cursor-grab items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground active:cursor-grabbing"
              title="Drag to reorder"
            >
              <GripVertical className="size-3.5" />
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                moveImageBlock(selectedImg.element, "up");
              }}
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Move up (Alt+Up)"
            >
              <ArrowUp className="size-3.5" />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                moveImageBlock(selectedImg.element, "down");
              }}
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Move down (Alt+Down)"
            >
              <ArrowDown className="size-3.5" />
            </button>

            <div className="mx-0.5 h-3.5 w-px bg-border" />

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleInput();
                onSuspendSmartTimers?.();
                const imgEl = selectedImg.element;
                const wrap = wrapperRef.current;
                imgEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
                const rect = wrap
                  ? measureImageLocalRect(imgEl, wrap)
                  : { top: 0, left: 0, width: imgEl.width || 200, height: imgEl.height || 140 };
                setCroppingImage({ element: imgEl, src: selectedImg.src, ...rect });
                imgEl.classList.remove("is-selected");
                setSelectedImg(null);
              }}
              className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              title="Crop image"
            >
              <Crop className="size-3.5 text-muted-foreground" />
              <span>Crop</span>
            </button>

            <div className="mx-0.5 h-3.5 w-px bg-border" />

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleRemoveImage(selectedImg.element);
              }}
              className="flex size-6 items-center justify-center rounded-md text-destructive transition-colors hover:bg-destructive/15"
              title="Delete image (Del)"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        )}
      </div>

      {contextMenu && (
        <StandaloneAppContextMenu
          state={contextMenu}
          onOpenImage={onOpenImage}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
