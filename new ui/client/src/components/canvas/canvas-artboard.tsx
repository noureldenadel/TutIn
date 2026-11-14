import { useState } from "react";
import { ChevronDown, ChevronRight, Layers, Sparkles, Trash2, Video } from "lucide-react";
import { CANVAS_GROUP_HEADER_HEIGHT, type CanvasGroup } from "@/lib/course-canvas";
import { getArtboardAccentVar } from "@/components/canvas/canvas-tokens";
import { cn } from "@/lib/utils";

export function CanvasArtboard({
  group,
  selected,
  isDropTarget,
  childCount,
  pointerEventsDisabled,
  onSelect,
  onStartDragHeader,
  onStartResize,
  onRename,
  onToggleCollapse,
  onTidy,
  onDelete,
}: {
  group: CanvasGroup;
  selected: boolean;
  isDropTarget: boolean;
  childCount: number;
  pointerEventsDisabled: boolean;
  onSelect: (e: React.PointerEvent) => void;
  onStartDragHeader: (e: React.PointerEvent) => void;
  onStartResize: (e: React.PointerEvent) => void;
  onRename: (nextTitle: string) => void;
  onToggleCollapse: () => void;
  onTidy: () => void;
  onDelete: () => void;
}) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(group.title);

  const accentVar = getArtboardAccentVar(group.tintIndex);
  const isVideo = group.type === "video-artboard";
  const renderedHeight = group.collapsed ? CANVAS_GROUP_HEADER_HEIGHT : group.height;

  const commitTitle = () => {
    setIsEditingTitle(false);
    const trimmed = draftTitle.trim();
    if (trimmed && trimmed !== group.title) {
      onRename(trimmed);
    } else {
      setDraftTitle(group.title);
    }
  };

  return (
    <div
      data-canvas-group-id={group.id}
      style={{
        transform: `translate3d(${group.x}px, ${group.y}px, 0)`,
        width: group.width,
        height: renderedHeight,
        backgroundColor: `color-mix(in oklch, ${accentVar} 5%, var(--card))`,
      }}
      className={cn(
        "group/artboard absolute left-0 top-0 select-none rounded-xl border border-border/80 transition-[box-shadow,border-color] duration-150",
        selected && "border-primary/60 ring-2 ring-primary/25",
        isDropTarget && "border-primary ring-2 ring-primary/45",
        pointerEventsDisabled && "pointer-events-none",
      )}
      onPointerDown={(e) => {
        if (pointerEventsDisabled) return;
        e.stopPropagation();
        onSelect(e);
      }}
    >
      {/* Top Accent Hairline */}
      <div
        className="pointer-events-none absolute inset-x-3 top-0 h-[3px] rounded-b-full opacity-75"
        style={{ backgroundColor: accentVar }}
      />

      {/* Artboard Header (Drag Handle) */}
      <div
        style={{ height: CANVAS_GROUP_HEADER_HEIGHT }}
        onPointerDown={(e) => {
          if (pointerEventsDisabled || isEditingTitle) return;
          e.stopPropagation();
          onStartDragHeader(e);
        }}
        className={cn(
          "flex items-center gap-2 rounded-t-xl px-3.5 text-xs",
          !isEditingTitle && "cursor-grab active:cursor-grabbing",
          !group.collapsed && "border-b border-border/50",
        )}
      >
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse();
          }}
          aria-label={group.collapsed ? "Expand artboard" : "Collapse artboard"}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          {group.collapsed ? (
            <ChevronRight className="size-3.5" />
          ) : (
            <ChevronDown className="size-3.5" />
          )}
        </button>

        {isVideo ? (
          <Video className="size-3.5 shrink-0" style={{ color: accentVar }} />
        ) : (
          <Layers className="size-3.5 shrink-0" style={{ color: accentVar }} />
        )}

        {isEditingTitle ? (
          <input
            type="text"
            autoFocus
            value={draftTitle}
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => setDraftTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitTitle();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setDraftTitle(group.title);
                setIsEditingTitle(false);
              }
            }}
            className="min-w-0 flex-1 rounded bg-background px-1.5 py-0.5 text-xs font-semibold text-foreground outline-none ring-1 ring-primary"
          />
        ) : (
          <span
            onDoubleClick={(e) => {
              e.stopPropagation();
              setDraftTitle(group.title);
              setIsEditingTitle(true);
            }}
            title={group.subtitle ? `${group.subtitle} — ${group.title}` : group.title}
            className="min-w-0 flex-1 truncate font-semibold text-foreground"
          >
            {group.title}
          </span>
        )}

        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="flex shrink-0 items-center gap-1"
        >
          {isVideo && group.layoutMode === "custom" && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTidy();
              }}
              title="Sort chronologically"
              className="inline-flex h-6 items-center gap-1 rounded-sm bg-secondary/80 px-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-secondary"
            >
              <Sparkles className="size-3 text-primary" />
              <span>Tidy</span>
            </button>
          )}

          <span className="rounded-sm bg-secondary/75 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
            {childCount}
          </span>

          <button
            type="button"
            aria-label="Delete artboard"
            title="Remove artboard frame"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/15 hover:text-destructive group-hover/artboard:opacity-100 focus-visible:opacity-100"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Corner Resize Handle */}
      {!group.collapsed && (
        <div
          onPointerDown={(e) => {
            if (pointerEventsDisabled) return;
            e.stopPropagation();
            onStartResize(e);
          }}
          title="Drag to resize artboard"
          className="absolute bottom-1 right-1 flex size-4 cursor-nwse-resize items-end justify-end rounded-br-lg p-0.5 opacity-0 transition-opacity group-hover/artboard:opacity-100"
        >
          <span className="size-2 rounded-br-[3px] border-b-2 border-r-2 border-muted-foreground/55" />
        </div>
      )}
    </div>
  );
}
