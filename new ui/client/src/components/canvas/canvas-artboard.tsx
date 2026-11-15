import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronDown, ChevronRight, Group, LayoutGrid, Trash2, Video } from "lucide-react";
import { CANVAS_GROUP_HEADER_HEIGHT, type CanvasGroup } from "@/lib/course-canvas";
import { getArtboardAccentVar } from "@/components/canvas/canvas-tokens";
import { cn } from "@/lib/utils";

const ARTBOARD_EDGE_STRIPS: ReadonlyArray<{ key: string; style: CSSProperties }> = [
  {
    key: "top",
    style: {
      top: "calc(-1 * clamp(6px, calc(8px / var(--canvas-zoom, 1)), 22px))",
      left: "clamp(4px, calc(6px / var(--canvas-zoom, 1)), 16px)",
      right: "clamp(4px, calc(6px / var(--canvas-zoom, 1)), 16px)",
      height: "clamp(8px, calc(11px / var(--canvas-zoom, 1)), 28px)",
    },
  },
  {
    key: "bottom",
    style: {
      bottom: "calc(-1 * clamp(5px, calc(6px / var(--canvas-zoom, 1)), 18px))",
      left: 0,
      right: "clamp(10px, calc(14px / var(--canvas-zoom, 1)), 24px)",
      height: "clamp(10px, calc(12px / var(--canvas-zoom, 1)), 36px)",
    },
  },
  {
    key: "left",
    style: {
      top: "clamp(3px, calc(4px / var(--canvas-zoom, 1)), 12px)",
      bottom: 0,
      left: "calc(-1 * clamp(5px, calc(6px / var(--canvas-zoom, 1)), 18px))",
      width: "clamp(10px, calc(12px / var(--canvas-zoom, 1)), 36px)",
    },
  },
  {
    key: "right",
    style: {
      top: "clamp(3px, calc(4px / var(--canvas-zoom, 1)), 12px)",
      bottom: "clamp(10px, calc(14px / var(--canvas-zoom, 1)), 24px)",
      right: "calc(-1 * clamp(5px, calc(6px / var(--canvas-zoom, 1)), 18px))",
      width: "clamp(10px, calc(12px / var(--canvas-zoom, 1)), 36px)",
    },
  },
];

export function CanvasArtboard({
  group,
  selected,
  isDropTarget,
  childCount,
  renameSignal = 0,
  pointerEventsDisabled,
  onSelect,
  onStartDragHeader,
  onStartDragEdge,
  onStartResize,
  onRename,
  onToggleCollapse,
  onTidy,
  onDelete,
  onContextMenu,
}: {
  group: CanvasGroup;
  selected: boolean;
  isDropTarget: boolean;
  childCount: number;
  renameSignal?: number | undefined;
  pointerEventsDisabled: boolean;
  onSelect: (e: React.PointerEvent) => void;
  onStartDragHeader: (e: React.PointerEvent) => void;
  onStartDragEdge: (e: React.PointerEvent) => void;
  onStartResize: (e: React.PointerEvent) => void;
  onRename: (nextTitle: string) => void;
  onToggleCollapse: () => void;
  onTidy: () => void;
  onDelete: () => void;
  onContextMenu?: ((e: React.MouseEvent) => void) | undefined;
}) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(group.title);
  const [edgeHovered, setEdgeHovered] = useState(false);
  const lastRenameSignalRef = useRef(renameSignal);

  useEffect(() => {
    if (renameSignal > 0 && renameSignal !== lastRenameSignalRef.current) {
      lastRenameSignalRef.current = renameSignal;
      setDraftTitle(group.title);
      setIsEditingTitle(true);
    }
  }, [renameSignal, group.title]);

  useEffect(() => {
    if (group.collapsed || pointerEventsDisabled) {
      setEdgeHovered(false);
    }
  }, [group.collapsed, pointerEventsDisabled]);

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

  const handleEdgePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerEventsDisabled || e.button === 1) return;
    if (e.button === 2) {
      e.stopPropagation();
      onSelect(e);
      return;
    }
    if (e.button !== 0) return;
    e.stopPropagation();
    if (!selected) {
      // Obsidian-style: clicking an unselected group perimeter selects it without starting a drag.
      onSelect(e);
      return;
    }
    onStartDragEdge(e);
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
        "group/artboard pointer-events-none absolute left-0 top-0 select-none rounded-xl border border-border/80 transition-[box-shadow,border-color] duration-150",
        !selected && !isDropTarget && edgeHovered && "border-primary/45",
        selected && "border-primary/60 ring-2 ring-primary/25",
        selected && !isDropTarget && edgeHovered && "border-primary ring-primary/35",
        isDropTarget && "border-primary ring-2 ring-primary/45",
      )}
      onContextMenu={(e) => {
        if (pointerEventsDisabled) return;
        if (isEditingTitle && e.target instanceof Element && e.target.closest("input, textarea")) {
          e.stopPropagation();
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        onContextMenu?.(e);
      }}
    >
      {/* Perimeter Edge Hit Strips (Obsidian-style: select first, drag once selected) */}
      {!group.collapsed &&
        ARTBOARD_EDGE_STRIPS.map((strip) => (
          <div
            key={strip.key}
            data-canvas-group-edge={strip.key}
            style={strip.style}
            onPointerEnter={() => {
              if (!pointerEventsDisabled) setEdgeHovered(true);
            }}
            onPointerLeave={() => setEdgeHovered(false)}
            onPointerDown={handleEdgePointerDown}
            className={cn(
              "absolute z-10",
              pointerEventsDisabled ? "pointer-events-none" : "pointer-events-auto",
              selected ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
            )}
          />
        ))}

      {/* Top Accent Hairline */}
      <div
        className="pointer-events-none absolute inset-x-3 top-0 h-[3px] rounded-b-full opacity-75"
        style={{ backgroundColor: accentVar }}
      />

      {/* Artboard Header (Drag Handle) */}
      <div
        style={{ height: CANVAS_GROUP_HEADER_HEIGHT }}
        onPointerDown={(e) => {
          if (pointerEventsDisabled || isEditingTitle || e.button === 1) return;
          if (e.button === 2) {
            e.stopPropagation();
            onSelect(e);
            return;
          }
          e.stopPropagation();
          onStartDragHeader(e);
        }}
        className={cn(
          "flex items-center gap-2 rounded-t-xl px-3.5 text-xs",
          pointerEventsDisabled ? "pointer-events-none" : "pointer-events-auto",
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
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground [&_svg]:stroke-[1.75]"
        >
          {group.collapsed ? (
            <ChevronRight className="size-3.5" />
          ) : (
            <ChevronDown className="size-3.5" />
          )}
        </button>

        {isVideo ? (
          <Video className="size-3.5 shrink-0 stroke-[1.75]" style={{ color: accentVar }} />
        ) : (
          <Group className="size-3.5 shrink-0 stroke-[1.75]" style={{ color: accentVar }} />
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
              <LayoutGrid className="size-3 stroke-[1.75] text-primary" />
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
            <Trash2 className="size-3.5 stroke-[1.75]" />
          </button>
        </div>
      </div>

      {/* Corner Resize Handle */}
      {!group.collapsed && (
        <div
          onPointerDown={(e) => {
            if (pointerEventsDisabled || e.button === 1) return;
            e.stopPropagation();
            onStartResize(e);
          }}
          title="Drag to resize artboard"
          className={cn(
            "absolute bottom-0 right-0 z-20 flex size-5 cursor-nwse-resize items-end justify-end rounded-br-xl p-1 opacity-0 transition-opacity group-hover/artboard:opacity-100",
            selected && "opacity-80",
            pointerEventsDisabled ? "pointer-events-none" : "pointer-events-auto",
          )}
        >
          <span className="size-2 rounded-br-[3px] border-b-2 border-r-2 border-muted-foreground/55" />
        </div>
      )}
    </div>
  );
}
