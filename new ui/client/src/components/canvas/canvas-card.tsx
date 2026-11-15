import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Clock, CornerDownLeft, Maximize2, Pencil, Trash2 } from "lucide-react";

import { RichNoteHtmlContent, RichNoteSurface } from "@/components/notes/rich-note-surface";
import { getArtboardAccentVar } from "@/components/canvas/canvas-tokens";
import { formatTimestamp } from "@/lib/course-lessons";
import { hasMeaningfulHtmlContent } from "@/lib/course-notes";
import type { CanvasCard, CanvasSide } from "@/lib/course-canvas";
import { useMediaUrl } from "@/lib/media-store";
import { cn } from "@/lib/utils";

const CONNECTOR_SIDES: CanvasSide[] = ["top", "right", "bottom", "left"];

function ImageCardBody({
  card,
  editingCaption,
  onCommitCaption,
  onCancelCaption,
  onStartEditCaption,
  onOpenLightbox,
}: {
  card: CanvasCard;
  editingCaption: boolean;
  onCommitCaption: (caption: string) => void;
  onCancelCaption: () => void;
  onStartEditCaption: () => void;
  onOpenLightbox: (src: string) => void;
}) {
  const resolvedUrl = useMediaUrl(card.imageSrc);
  const [draft, setDraft] = useState(card.caption ?? "");

  useEffect(() => {
    setDraft(card.caption ?? "");
  }, [card.caption]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        className="group/img relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-secondary/45"
        onDoubleClick={(e) => {
          if (!resolvedUrl) return;
          e.stopPropagation();
          onOpenLightbox(resolvedUrl);
        }}
      >
        {resolvedUrl ? (
          <img
            src={resolvedUrl}
            alt={card.caption || "Canvas image"}
            draggable={false}
            className="size-full select-none object-contain"
          />
        ) : (
          <span className="text-xs text-muted-foreground">Loading image…</span>
        )}
        {resolvedUrl && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onOpenLightbox(resolvedUrl);
            }}
            aria-label="Preview image"
            title="Expand image"
            className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-md bg-popover/90 text-foreground opacity-0 shadow-card transition-opacity hover:bg-popover group-hover/img:opacity-100"
          >
            <Maximize2 className="size-3.5 stroke-[1.75]" />
          </button>
        )}
      </div>

      <div
        onPointerDown={(e) => editingCaption && e.stopPropagation()}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onStartEditCaption();
        }}
        className="border-t border-border/50 px-3 py-1.5"
      >
        {editingCaption ? (
          <input
            type="text"
            autoFocus
            value={draft}
            placeholder="Caption…"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => onCommitCaption(draft.trim())}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onCommitCaption(draft.trim());
              } else if (e.key === "Escape") {
                e.preventDefault();
                onCommitCaption(draft.trim());
              }
            }}
            className="w-full rounded bg-secondary px-1.5 py-0.5 text-xs text-foreground outline-none ring-1 ring-primary"
          />
        ) : (
          <p className="truncate text-xs text-muted-foreground">
            {card.caption || "Double-click to caption"}
          </p>
        )}
      </div>
    </div>
  );
}

export function CanvasCardView({
  courseId,
  card,
  lessonCode,
  lessonTooltip,
  selected,
  isEditing,
  isConnectSource,
  activeConnectSide,
  snapTargetSide,
  isConnectMode,
  pointerEventsDisabled,
  onSelect,
  onStartDrag,
  onStartResize,
  onStartEdit,
  onFinishEdit,
  onDraftChange,
  onCommitHtml,
  onMeasuredHeightGrow,
  onReturnToOriginGroup,
  onDelete,
  onStartConnect,
  onCompleteConnect,
  onContextMenu,
  onOpenLightbox,
  onUpdateImageCaption,
}: {
  courseId: string;
  card: CanvasCard;
  lessonCode?: string | undefined;
  lessonTooltip?: string | undefined;
  selected: boolean;
  isEditing: boolean;
  isConnectSource: boolean;
  activeConnectSide?: CanvasSide | undefined;
  snapTargetSide?: CanvasSide | undefined;
  isConnectMode: boolean;
  pointerEventsDisabled: boolean;
  onSelect: (e: React.PointerEvent) => void;
  onStartDrag: (e: React.PointerEvent) => void;
  onStartResize: (e: React.PointerEvent, axis?: "both" | "width" | "height") => void;
  onStartEdit: () => void;
  onFinishEdit: () => void;
  onDraftChange?: ((html: string) => void) | undefined;
  onCommitHtml?: ((html: string) => void) | undefined;
  onMeasuredHeightGrow?: ((nextHeight: number) => void) | undefined;
  onReturnToOriginGroup: () => void;
  onDelete: () => void;
  onStartConnect: (e: React.PointerEvent, side: CanvasSide) => void;
  onCompleteConnect: (e: React.PointerEvent, side?: CanvasSide) => void;
  onContextMenu?: ((e: React.MouseEvent) => void) | undefined;
  onOpenLightbox: (src: string, card: CanvasCard) => void;
  onUpdateImageCaption: (caption: string) => void;
}) {
  const [draftHtml, setDraftHtml] = useState(card.htmlContent);
  const [editingCaption, setEditingCaption] = useState(false);
  const [hoveredPortSide, setHoveredPortSide] = useState<CanvasSide | null>(null);
  const cardRootRef = useRef<HTMLDivElement>(null);
  const wasEditingRef = useRef(false);
  const initialHtmlOnEditRef = useRef(card.htmlContent);
  const hasEditedDraftRef = useRef(false);
  const cardHeightRef = useRef(card.height);
  cardHeightRef.current = card.height;
  const onDraftChangeRef = useRef(onDraftChange);
  onDraftChangeRef.current = onDraftChange;
  const onMeasuredHeightGrowRef = useRef(onMeasuredHeightGrow);
  onMeasuredHeightGrowRef.current = onMeasuredHeightGrow;

  useEffect(() => {
    if (isEditing || pointerEventsDisabled || editingCaption) {
      setHoveredPortSide(null);
    }
  }, [isEditing, pointerEventsDisabled, editingCaption]);

  useEffect(() => {
    if (isEditing && !wasEditingRef.current) {
      wasEditingRef.current = true;
      initialHtmlOnEditRef.current = card.htmlContent;
      hasEditedDraftRef.current = false;
      setDraftHtml(card.htmlContent);
      onDraftChangeRef.current?.(card.htmlContent);
    } else if (!isEditing) {
      wasEditingRef.current = false;
      hasEditedDraftRef.current = false;
    }
  }, [isEditing, card.htmlContent]);

  const isVideoNote = card.type === "video-note";
  const isImage = card.type === "image";
  const isTextOnly = card.type === "text";
  const isEmptyCard = !isImage && !hasMeaningfulHtmlContent(card.htmlContent);

  useEffect(() => {
    const el = cardRootRef.current;
    if (!el || isImage) return;

    let rafId = 0;
    const measureAndGrow = () => {
      rafId = 0;
      if (!el.isConnected) return;

      if (isEditing) {
        if (!hasEditedDraftRef.current) return;
        const editorEl = el.querySelector(".note-editor") as HTMLElement | null;
        if (!editorEl) return;
        const headerEl = el.querySelector("[data-card-header='true']") as HTMLElement | null;
        const viewChromeHeight = (headerEl?.offsetHeight ?? 0) + (isTextOnly ? 18 : 24);
        const measured = Math.ceil(viewChromeHeight + editorEl.offsetHeight);
        if (measured > cardHeightRef.current + 2 && measured <= 12000) {
          onMeasuredHeightGrowRef.current?.(measured);
        }
        return;
      }

      const measured = Math.ceil(el.offsetHeight);
      if (measured > cardHeightRef.current + 4 && measured <= 12000) {
        onMeasuredHeightGrowRef.current?.(measured);
      }
    };

    const scheduleCheck = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(measureAndGrow);
    };

    scheduleCheck();
    if (typeof ResizeObserver === "undefined") {
      return () => {
        if (rafId) cancelAnimationFrame(rafId);
      };
    }

    const observer = new ResizeObserver(() => scheduleCheck());
    if (isEditing) {
      const editorEl = el.querySelector(".note-editor");
      if (editorEl) observer.observe(editorEl);
    } else {
      observer.observe(el);
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [card.htmlContent, isEditing, isImage, isTextOnly, draftHtml]);

  const codePrefix =
    lessonCode ?? (card.originLessonIdx !== undefined ? `L${card.originLessonIdx + 1}` : undefined);
  const lessonLabel = codePrefix
    ? `${codePrefix} · ${formatTimestamp(card.timestamp ?? 0)}`
    : formatTimestamp(card.timestamp ?? 0);

  const accentVar =
    card.accentIndex !== undefined ? getArtboardAccentVar(card.accentIndex) : undefined;

  return (
    <div
      ref={cardRootRef}
      data-canvas-card-id={card.id}
      style={{
        transform: `translate3d(${card.x}px, ${card.y}px, 0)`,
        width: card.width,
        minHeight: card.height,
        height: isImage ? card.height : undefined,
        backgroundColor: isTextOnly
          ? accentVar
            ? `color-mix(in oklch, ${accentVar} 10%, var(--card))`
            : !selected && !isEditing && !isEmptyCard
              ? "transparent"
              : undefined
          : undefined,
        borderColor:
          accentVar && !selected && !isEditing
            ? `color-mix(in oklch, ${accentVar} 38%, var(--border))`
            : undefined,
      }}
      onPointerDown={(e) => {
        if (pointerEventsDisabled) return;
        if (e.button === 1) return;
        e.stopPropagation();
        if (e.button === 2) {
          if (!selected) {
            onSelect(e);
          }
          return;
        }
        const targetEl = e.target as HTMLElement | null;
        if (!isEditing && targetEl?.closest("input[data-task-checkbox], a")) {
          return;
        }
        if (isConnectMode) {
          onCompleteConnect(e);
          return;
        }
        if (!isEditing && !editingCaption) {
          setHoveredPortSide(null);
          onStartDrag(e);
        }
        onSelect(e);
      }}
      onPointerMove={(e) => {
        if (pointerEventsDisabled || isEditing || editingCaption || isConnectSource) return;
        const targetEl = e.target as HTMLElement | null;
        if (targetEl?.closest("[data-connect-port='true']")) return;
        if (targetEl?.closest("button, a, input")) {
          if (hoveredPortSide !== null) setHoveredPortSide(null);
          return;
        }

        const rect = e.currentTarget.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        const dTop = e.clientY - rect.top;
        const dRight = rect.right - e.clientX;
        const dBottom = rect.bottom - e.clientY;
        const dLeft = e.clientX - rect.left;

        // Leave the bottom-right corner clear for resize interaction
        if (dRight <= 18 && dBottom <= 18) {
          if (hoveredPortSide !== null) setHoveredPortSide(null);
          return;
        }

        const bandX = Math.min(22, rect.width * 0.25);
        const bandY = Math.min(22, rect.height * 0.25);
        const candidates: [CanvasSide, number][] = [];
        if (dTop <= bandY) candidates.push(["top", dTop]);
        if (dRight <= bandX) candidates.push(["right", dRight]);
        if (dBottom <= bandY) candidates.push(["bottom", dBottom]);
        if (dLeft <= bandX) candidates.push(["left", dLeft]);

        if (candidates.length === 0) {
          if (hoveredPortSide !== null) setHoveredPortSide(null);
          return;
        }
        candidates.sort((a, b) => a[1] - b[1]);
        const nextSide = candidates[0]![0];
        if (hoveredPortSide !== nextSide) {
          setHoveredPortSide(nextSide);
        }
      }}
      onPointerLeave={() => {
        if (hoveredPortSide !== null) setHoveredPortSide(null);
      }}
      onContextMenu={(e) => {
        if (pointerEventsDisabled) return;
        e.preventDefault();
        e.stopPropagation();
        onContextMenu?.(e);
      }}
      onDoubleClick={(e) => {
        if (pointerEventsDisabled || isConnectMode) return;
        e.stopPropagation();
        if (isImage) {
          setEditingCaption(true);
        } else if (!isEditing) {
          onStartEdit();
        }
      }}
      className={cn(
        "group/card absolute left-0 top-0 flex flex-col rounded-lg text-card-foreground transition-[box-shadow,border-color] duration-150",
        !isImage && "canvas-card-note",
        isTextOnly
          ? selected || isEditing
            ? "border border-border bg-card/95 shadow-card"
            : isEmptyCard
              ? "border border-dashed border-border/60 bg-card/35 hover:border-border/80 hover:bg-card/55"
              : accentVar
                ? "border border-border/60 shadow-card"
                : "border border-transparent hover:border-border/60 hover:bg-card/55"
          : "border border-border/80 bg-card shadow-card",
        selected && !isConnectSource && "border-primary/70 ring-2 ring-primary/25",
        isConnectSource && "border-primary ring-2 ring-primary/50",
        isEditing && "z-30 border-primary ring-2 ring-primary/30 shadow-workspace",
        isConnectMode && "cursor-crosshair",
        pointerEventsDisabled && "pointer-events-none",
      )}
    >
      {/* Subtle Top Accent Strip for Headed Cards */}
      {!isTextOnly && accentVar && (
        <div
          className="h-1 w-full shrink-0 rounded-t-[7px]"
          style={{ backgroundColor: accentVar }}
        />
      )}

      {/* Card Header */}
      {!isTextOnly && (
        <div
          data-card-header="true"
          className="flex shrink-0 items-center justify-between gap-1.5 border-b border-border/45 px-3 py-2 text-xs"
        >
          <div className="flex min-w-0 items-center gap-1.5">
            {isVideoNote ? (
              <Link
                to="/learn/$courseId"
                params={{ courseId }}
                search={{
                  lesson: card.originLessonIdx ?? 0,
                  t: Math.floor(card.timestamp ?? 0),
                  tab: "notes",
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                title={lessonTooltip ?? "Jump to video timestamp"}
                className="inline-flex items-center gap-1 rounded-sm bg-primary-soft px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-primary transition-colors hover:bg-primary/20"
              >
                <Clock className="size-3 stroke-[1.75]" />
                <span>{lessonLabel}</span>
              </Link>
            ) : (
              <span className="rounded-sm bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {isImage ? "Image" : "Canvas"}
              </span>
            )}

            {isVideoNote && card.membershipState === "detached" && (
              <span className="rounded-sm bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                Detached
              </span>
            )}
            {isVideoNote && card.membershipState === "reassigned" && (
              <span className="rounded-sm bg-amber-500/12 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                Moved
              </span>
            )}
          </div>

          {/* Action Controls */}
          <div
            onPointerDown={(e) => e.stopPropagation()}
            className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/card:opacity-100 focus-within:opacity-100 [&_svg]:stroke-[1.75]"
          >
            {isVideoNote &&
              (card.membershipState === "detached" || card.membershipState === "reassigned") &&
              card.originLessonIdx !== undefined && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onReturnToOriginGroup();
                  }}
                  title="Return to lesson artboard"
                  className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <CornerDownLeft className="size-3.5" />
                </button>
              )}

            {!isImage && !isEditing && (
              <button
                type="button"
                aria-label="Edit note"
                title="Edit note"
                onClick={(e) => {
                  e.stopPropagation();
                  onStartEdit();
                }}
                className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Pencil className="size-3" />
              </button>
            )}

            <button
              type="button"
              aria-label={isVideoNote ? "Remove from canvas" : "Delete card"}
              title={isVideoNote ? "Hide from canvas" : "Delete card"}
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Card Body */}
      {isImage ? (
        <ImageCardBody
          card={card}
          editingCaption={editingCaption}
          onStartEditCaption={() => setEditingCaption(true)}
          onCommitCaption={(caption) => {
            setEditingCaption(false);
            onUpdateImageCaption(caption);
          }}
          onCancelCaption={() => setEditingCaption(false)}
          onOpenLightbox={(src) => onOpenLightbox(src, card)}
        />
      ) : isEditing ? (
        <div
          onPointerDown={(e) => {
            if (e.button === 1) return;
            e.stopPropagation();
          }}
          onWheel={(e) => {
            if (e.altKey) return;
            const scroller = e.currentTarget.querySelector(".custom-scrollbar-sm");
            if (scroller && scroller.scrollHeight > scroller.clientHeight) {
              e.stopPropagation();
            }
          }}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <RichNoteSurface
            courseId={courseId}
            content={draftHtml}
            onChange={(html) => {
              if (html !== initialHtmlOnEditRef.current) {
                hasEditedDraftRef.current = true;
              }
              setDraftHtml(html);
              onDraftChange?.(html);
            }}
            onSubmit={onFinishEdit}
            onCancel={onFinishEdit}
            compactToolbar={!isTextOnly}
            minHeightClassName={isTextOnly ? "min-h-[60px]" : "min-h-[90px]"}
            maxHeightClassName=""
            className="flex min-h-0 flex-1 flex-col"
            wrapperClassName="flex-1"
            placeholder={isTextOnly ? "Type text…" : "Write note…"}
          />
        </div>
      ) : (
        <div className={cn("px-3 py-2.5", isTextOnly && "px-3.5 py-2")}>
          {isTextOnly && (
            <div
              onPointerDown={(e) => e.stopPropagation()}
              className="float-right ml-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/card:opacity-100"
            >
              <button
                type="button"
                aria-label="Delete text"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-destructive/15 hover:text-destructive [&_svg]:stroke-[1.75]"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          )}

          <RichNoteHtmlContent
            html={card.htmlContent || "<p></p>"}
            className={isTextOnly ? "text-base font-medium leading-6" : undefined}
            onImageClick={(src) => onOpenLightbox(src, card)}
            onHtmlChange={onCommitHtml}
          />
        </div>
      )}

      {/* 4-Side Edge-Hover Connection Ports (Obsidian-style: reveal only hovered edge) */}
      {!pointerEventsDisabled && !isEditing && (
        <>
          {CONNECTOR_SIDES.map((side) => {
            const posClass =
              side === "top"
                ? "left-1/2 -top-1.5 -translate-x-1/2"
                : side === "right"
                  ? "-right-1.5 top-1/2 -translate-y-1/2"
                  : side === "bottom"
                    ? "-bottom-1.5 left-1/2 -translate-x-1/2"
                    : "-left-1.5 top-1/2 -translate-y-1/2";
            const isActiveSource = isConnectSource && activeConnectSide === side;
            const isSnapTarget = snapTargetSide === side;
            const isVisible =
              isActiveSource ||
              isSnapTarget ||
              (!isConnectSource && !snapTargetSide && hoveredPortSide === side);

            return (
              <button
                key={side}
                type="button"
                data-connect-port="true"
                aria-label={`Connect from ${side}`}
                title="Drag or click to connect arrow"
                onPointerEnter={() => {
                  if (!isConnectSource && !snapTargetSide) {
                    setHoveredPortSide(side);
                  }
                }}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.stopPropagation();
                  setHoveredPortSide(null);
                  if (isConnectMode) {
                    onCompleteConnect(e, side);
                    return;
                  }
                  onStartConnect(e, side);
                }}
                className={cn(
                  "absolute z-20 size-3 rounded-full border-2 border-card bg-primary shadow-sm transition-[opacity,transform] duration-150 before:absolute before:-inset-1.5 before:rounded-full",
                  isVisible
                    ? "pointer-events-auto scale-100 opacity-100 hover:scale-125"
                    : "pointer-events-none scale-75 opacity-0",
                  (isActiveSource || isSnapTarget) && "scale-125 ring-4 ring-primary/25",
                  posClass,
                )}
              />
            );
          })}
        </>
      )}

      {/* Edge & Corner Resize Handles (active both in view mode and while editing) */}
      {!pointerEventsDisabled && !isConnectMode && (
        <>
          <div
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              e.stopPropagation();
              setHoveredPortSide(null);
              onStartResize(e, "width");
            }}
            title="Drag edge to resize width"
            className="absolute inset-y-2.5 right-0 z-10 w-1.5 cursor-ew-resize"
          />
          <div
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              e.stopPropagation();
              setHoveredPortSide(null);
              onStartResize(e, "height");
            }}
            title="Drag edge to resize height"
            className="absolute inset-x-2.5 bottom-0 z-10 h-1.5 cursor-ns-resize"
          />
          <div
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              e.stopPropagation();
              setHoveredPortSide(null);
              onStartResize(e, "both");
            }}
            title="Drag to resize"
            className={cn(
              "absolute bottom-1 right-1 z-20 flex size-4 cursor-nwse-resize items-end justify-end rounded-br-lg p-0.5 transition-opacity",
              selected || isEditing ? "opacity-90" : "opacity-0 group-hover/card:opacity-100",
            )}
          >
            <span className="size-2 rounded-br-[3px] border-b-2 border-r-2 border-muted-foreground/65" />
          </div>
        </>
      )}
    </div>
  );
}
