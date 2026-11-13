import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Check,
  Clock,
  CornerDownLeft,
  Maximize2,
  Pencil,
  Trash2,
  X,
} from "lucide-react";

import { RichNoteHtmlContent, RichNoteSurface } from "@/components/rich-note-surface";
import { getArtboardAccentVar } from "@/components/canvas/canvas-tokens";
import { formatTimestamp } from "@/lib/course-lessons";
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
      <div className="group/img relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-secondary/45">
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
            <Maximize2 className="size-3.5" />
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
                setDraft(card.caption ?? "");
                onCancelCaption();
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
  selected,
  isEditing,
  isConnectSource,
  isConnectMode,
  pointerEventsDisabled,
  hasOriginGroup,
  onSelect,
  onStartDrag,
  onStartResize,
  onStartEdit,
  onCancelEdit,
  onDraftChange,
  onSaveContent,
  onUpdateAccent,
  onReturnToOriginGroup,
  onDelete,
  onStartConnect,
  onCompleteConnect,
  onOpenLightbox,
  onUpdateImageCaption,
}: {
  courseId: string;
  card: CanvasCard;
  selected: boolean;
  isEditing: boolean;
  isConnectSource: boolean;
  isConnectMode: boolean;
  pointerEventsDisabled: boolean;
  hasOriginGroup: boolean;
  onSelect: (e: React.PointerEvent) => void;
  onStartDrag: (e: React.PointerEvent) => void;
  onStartResize: (e: React.PointerEvent) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onDraftChange?: ((html: string) => void) | undefined;
  onSaveContent: (html: string) => void;
  onUpdateAccent: (accentIndex: number | undefined) => void;
  onReturnToOriginGroup: () => void;
  onDelete: () => void;
  onStartConnect: (e: React.PointerEvent, side: CanvasSide) => void;
  onCompleteConnect: (e: React.PointerEvent) => void;
  onOpenLightbox: (src: string, card: CanvasCard) => void;
  onUpdateImageCaption: (caption: string) => void;
}) {
  const [draftHtml, setDraftHtml] = useState(card.htmlContent);
  const [editingCaption, setEditingCaption] = useState(false);
  const onDraftChangeRef = useRef(onDraftChange);
  onDraftChangeRef.current = onDraftChange;

  useEffect(() => {
    if (isEditing) {
      setDraftHtml(card.htmlContent);
      onDraftChangeRef.current?.(card.htmlContent);
    }
  }, [isEditing, card.htmlContent]);

  const isVideoNote = card.type === "video-note";
  const isImage = card.type === "image";
  const isTextOnly = card.type === "text";
  const lessonLabel =
    card.originLessonIdx !== undefined
      ? `L${card.originLessonIdx + 1} · ${formatTimestamp(card.timestamp ?? 0)}`
      : formatTimestamp(card.timestamp ?? 0);

  const accentVar =
    card.accentIndex !== undefined ? getArtboardAccentVar(card.accentIndex) : undefined;

  return (
    <div
      data-canvas-card-id={card.id}
      style={{
        transform: `translate3d(${card.x}px, ${card.y}px, 0)`,
        width: card.width,
        minHeight: card.height,
        height: isImage ? card.height : undefined,
        backgroundColor: isTextOnly && !selected && !isEditing ? "transparent" : undefined,
      }}
      onPointerDown={(e) => {
        if (pointerEventsDisabled) return;
        e.stopPropagation();
        if (isConnectMode) {
          onCompleteConnect(e);
          return;
        }
        onSelect(e);
        if (!isEditing && !editingCaption) {
          onStartDrag(e);
        }
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
        isTextOnly
          ? selected || isEditing
            ? "border border-border bg-card/95 shadow-card"
            : "border border-transparent hover:border-border/60 hover:bg-card/55"
          : "border border-border/80 bg-card shadow-card",
        selected && !isConnectSource && "border-primary/70 ring-2 ring-primary/25",
        isConnectSource && "border-primary ring-2 ring-primary/50",
        isEditing && "z-30 border-primary ring-2 ring-primary/30 shadow-workspace",
        isConnectMode && "cursor-crosshair",
        pointerEventsDisabled && "pointer-events-none",
      )}
    >
      {/* Subtle Top Accent Strip for Canvas Notes */}
      {!isVideoNote && !isTextOnly && accentVar && (
        <div
          className="h-1 w-full shrink-0 rounded-t-[7px]"
          style={{ backgroundColor: accentVar }}
        />
      )}

      {/* Card Header */}
      {!isTextOnly && (
        <div className="flex shrink-0 items-center justify-between gap-1.5 border-b border-border/45 px-3 py-2 text-xs">
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
                title="Jump to video timestamp"
                className="inline-flex items-center gap-1 rounded-sm bg-primary-soft px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-primary transition-colors hover:bg-primary/20"
              >
                <Clock className="size-3" />
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
            className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/card:opacity-100 focus-within:opacity-100"
          >
            {isVideoNote &&
              (card.membershipState === "detached" || card.membershipState === "reassigned") &&
              hasOriginGroup && (
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
          onPointerDown={(e) => e.stopPropagation()}
          onWheel={(e) => {
            if (e.ctrlKey || e.metaKey) return;
            const scroller = e.currentTarget.querySelector(".custom-scrollbar-sm");
            if (scroller && scroller.scrollHeight > scroller.clientHeight) {
              e.stopPropagation();
            }
          }}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <RichNoteSurface
            content={draftHtml}
            onChange={(html) => {
              setDraftHtml(html);
              onDraftChange?.(html);
            }}
            onSubmit={() => onSaveContent(draftHtml)}
            onCancel={onCancelEdit}
            compactToolbar={!isTextOnly}
            minHeightClassName={isTextOnly ? "min-h-[60px]" : "min-h-[90px]"}
            maxHeightClassName="max-h-[260px]"
            placeholder={isTextOnly ? "Type text…" : "Write note…"}
          />

          <div className="flex items-center justify-between gap-2 border-t border-border/50 bg-secondary/25 px-2.5 py-1.5">
            {card.type === "canvas-note" ? (
              <div className="flex items-center gap-1">
                {[undefined, 0, 1, 2, 3, 4].map((idx) => (
                  <button
                    key={idx ?? "none"}
                    type="button"
                    aria-label={idx === undefined ? "Neutral card" : `Color ${idx + 1}`}
                    onClick={() => onUpdateAccent(idx)}
                    className={cn(
                      "size-3.5 rounded-full border border-border transition-transform hover:scale-110",
                      card.accentIndex === idx && "ring-2 ring-primary ring-offset-1 ring-offset-card",
                    )}
                    style={{
                      backgroundColor:
                        idx === undefined ? "var(--secondary)" : getArtboardAccentVar(idx),
                    }}
                  />
                ))}
              </div>
            ) : (
              <span className="text-[10px] text-muted-foreground">Ctrl+Enter to save</span>
            )}

            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={onCancelEdit}
                className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X className="size-3" />
              </button>
              <button
                type="button"
                onClick={() => onSaveContent(draftHtml)}
                className="inline-flex h-6 items-center gap-1 rounded-md bg-primary px-2 text-[11px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                <Check className="size-3" /> Save
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          className={cn(
            "px-3 py-2.5",
            isTextOnly && "px-3.5 py-2",
          )}
        >
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
                className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          )}

          <RichNoteHtmlContent
            html={card.htmlContent || "<p></p>"}
            className={isTextOnly ? "text-base font-medium leading-6" : undefined}
            onImageClick={(src) => onOpenLightbox(src, card)}
          />
        </div>
      )}

      {/* 4-Side Connection Ports */}
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
            return (
              <button
                key={side}
                type="button"
                aria-label={`Connect from ${side}`}
                title="Drag or click to connect arrow"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onStartConnect(e, side);
                }}
                className={cn(
                  "absolute size-3 rounded-full border-2 border-card bg-primary opacity-0 shadow-sm transition-all hover:scale-125 group-hover/card:opacity-100",
                  selected && "opacity-85",
                  posClass,
                )}
              />
            );
          })}
        </>
      )}

      {/* Corner Resize Handle */}
      {!pointerEventsDisabled && !isEditing && (
        <div
          onPointerDown={(e) => {
            e.stopPropagation();
            onStartResize(e);
          }}
          title="Drag to resize"
          className="absolute bottom-1 right-1 flex size-4 cursor-nwse-resize items-end justify-end rounded-br-lg p-0.5 opacity-0 transition-opacity group-hover/card:opacity-100"
        >
          <span className="size-2 rounded-br-[3px] border-b-2 border-r-2 border-muted-foreground/55" />
        </div>
      )}
    </div>
  );
}

