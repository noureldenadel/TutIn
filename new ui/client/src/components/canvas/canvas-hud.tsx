import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowUpRight,
  Eraser,
  Hand,
  Highlighter,
  ImagePlus,
  Layers,
  Minus,
  MousePointer2,
  PanelRightClose,
  PanelRightOpen,
  Pen,
  Plus,
  Redo2,
  RotateCcw,
  Sparkles,
  StickyNote,
  Type,
  Undo2,
} from "lucide-react";

import {
  STROKE_COLOR_OPTIONS,
  type CanvasToolMode,
} from "@/components/canvas/canvas-tokens";
import type { CanvasStrokeColorToken } from "@/lib/course-canvas";
import { cn } from "@/lib/utils";

const PEN_WIDTHS = [3, 5, 8];
const HIGHLIGHTER_WIDTHS = [16, 24, 34];

function HudBtn({
  active,
  disabled,
  label,
  shortcut,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  shortcut?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={cn(
        "flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-35 [&_svg]:size-4",
        active && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function CanvasHud({
  courseId,
  courseTitle,
  zoom,
  canUndo,
  canRedo,
  drawerOpen,
  unplacedCount,
  tool,
  strokeColor,
  strokeSize,
  onSelectTool,
  onChangeStrokeColor,
  onChangeStrokeSize,
  onUndo,
  onRedo,
  onTidyAll,
  onResetArrangement,
  onZoomIn,
  onZoomOut,
  onResetView,
  onToggleDrawer,
  onTriggerImageUpload,
  onCreateArtboard,
}: {
  courseId: string;
  courseTitle: string;
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
  drawerOpen: boolean;
  unplacedCount: number;
  tool: CanvasToolMode;
  strokeColor: CanvasStrokeColorToken;
  strokeSize: number;
  onSelectTool: (tool: CanvasToolMode) => void;
  onChangeStrokeColor: (color: CanvasStrokeColorToken) => void;
  onChangeStrokeSize: (size: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onTidyAll: () => void;
  onResetArrangement: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onToggleDrawer: () => void;
  onTriggerImageUpload: () => void;
  onCreateArtboard: () => void;
}) {
  const showInkOptions = tool === "pen" || tool === "highlighter";
  const widthChoices = tool === "highlighter" ? HIGHLIGHTER_WIDTHS : PEN_WIDTHS;

  return (
    <>
      {/* Top-Left Context Bar */}
      <div
        data-canvas-ui="true"
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        className="pointer-events-auto absolute left-4 top-4 z-20 flex max-w-[calc(100vw-11rem)] items-center gap-1 rounded-xl border border-border/70 bg-card/95 p-1 shadow-card backdrop-blur-sm"
      >
        <Link
          to="/learn/$courseId"
          params={{ courseId }}
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          <span>Player</span>
        </Link>

        <div className="h-4 w-px bg-border" />

        <span
          title={courseTitle}
          className="max-w-[200px] truncate px-2 text-xs font-semibold text-foreground"
        >
          {courseTitle}
        </span>

        <div className="h-4 w-px bg-border" />

        <button
          type="button"
          onClick={onToggleDrawer}
          title={drawerOpen ? "Hide notes drawer" : "Show notes drawer"}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
            drawerOpen && "bg-secondary text-foreground",
          )}
        >
          {drawerOpen ? <PanelRightClose className="size-3.5" /> : <PanelRightOpen className="size-3.5" />}
          <span>Notes</span>
          {unplacedCount > 0 && (
            <span className="rounded-sm bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-primary">
              {unplacedCount}
            </span>
          )}
        </button>
      </div>

      {/* Top-Right History, Tidy & Zoom Bar */}
      <div
        data-canvas-ui="true"
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        className="pointer-events-auto absolute right-4 top-4 z-20 flex items-center gap-1 rounded-xl border border-border/70 bg-card/95 p-1 shadow-card backdrop-blur-sm"
      >
        <HudBtn label="Undo" shortcut="Ctrl+Z" disabled={!canUndo} onClick={onUndo}>
          <Undo2 />
        </HudBtn>
        <HudBtn label="Redo" shortcut="Ctrl+Shift+Z" disabled={!canRedo} onClick={onRedo}>
          <Redo2 />
        </HudBtn>

        <div className="mx-0.5 h-4 w-px bg-border" />

        <button
          type="button"
          onClick={onTidyAll}
          title="Tidy all lesson artboards"
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
        >
          <Sparkles className="size-3.5 text-primary" />
          <span>Tidy</span>
        </button>
        <HudBtn label="Reset arrangement" onClick={onResetArrangement}>
          <RotateCcw />
        </HudBtn>

        <div className="mx-0.5 h-4 w-px bg-border" />

        <HudBtn label="Zoom out" onClick={onZoomOut}>
          <Minus />
        </HudBtn>
        <button
          type="button"
          onClick={onResetView}
          title="Reset view"
          className="min-w-12 rounded-md px-1.5 py-1 font-mono text-xs font-medium tabular-nums text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          {Math.round(zoom * 100)}%
        </button>
        <HudBtn label="Zoom in" onClick={onZoomIn}>
          <Plus />
        </HudBtn>
      </div>

      {/* Bottom Floating Tool Dock */}
      <div
        data-canvas-ui="true"
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        className="pointer-events-auto absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-2"
      >
        {showInkOptions && (
          <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-card/95 px-2.5 py-1.5 shadow-card backdrop-blur-sm animate-in fade-in slide-in-from-bottom-1 duration-150">
            <div className="flex items-center gap-1.5">
              {STROKE_COLOR_OPTIONS.map((opt) => (
                <button
                  key={opt.token}
                  type="button"
                  aria-label={opt.label}
                  title={opt.label}
                  onClick={() => onChangeStrokeColor(opt.token)}
                  className={cn(
                    "size-4 rounded-full border border-border/80 transition-transform hover:scale-110",
                    strokeColor === opt.token && "ring-2 ring-primary ring-offset-2 ring-offset-card",
                  )}
                  style={{ backgroundColor: opt.cssColor }}
                />
              ))}
            </div>

            <div className="h-4 w-px bg-border" />

            <div className="flex items-center gap-1">
              {widthChoices.map((w, idx) => (
                <button
                  key={w}
                  type="button"
                  aria-label={`Stroke size ${idx + 1}`}
                  onClick={() => onChangeStrokeSize(w)}
                  className={cn(
                    "flex size-6 items-center justify-center rounded-md transition-colors hover:bg-secondary",
                    strokeSize === w && "bg-secondary ring-1 ring-primary/50",
                  )}
                >
                  <span
                    className="rounded-full bg-foreground"
                    style={{ width: 5 + idx * 3, height: 5 + idx * 3 }}
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-0.5 rounded-xl border border-border/70 bg-card/95 p-1 shadow-workspace backdrop-blur-sm">
          <HudBtn label="Select" shortcut="V" active={tool === "select"} onClick={() => onSelectTool("select")}>
            <MousePointer2 />
          </HudBtn>
          <HudBtn label="Pan" shortcut="H" active={tool === "pan"} onClick={() => onSelectTool("pan")}>
            <Hand />
          </HudBtn>

          <div className="mx-1 h-4 w-px bg-border" />

          <HudBtn label="Add note" shortcut="N" active={tool === "note"} onClick={() => onSelectTool("note")}>
            <StickyNote />
          </HudBtn>
          <HudBtn label="Add text" shortcut="T" active={tool === "text"} onClick={() => onSelectTool("text")}>
            <Type />
          </HudBtn>
          <HudBtn label="Connect" shortcut="A" active={tool === "connect"} onClick={() => onSelectTool("connect")}>
            <ArrowUpRight />
          </HudBtn>

          <div className="mx-1 h-4 w-px bg-border" />

          <HudBtn label="Pen" shortcut="P" active={tool === "pen"} onClick={() => onSelectTool("pen")}>
            <Pen />
          </HudBtn>
          <HudBtn label="Highlighter" shortcut="M" active={tool === "highlighter"} onClick={() => onSelectTool("highlighter")}>
            <Highlighter />
          </HudBtn>
          <HudBtn label="Eraser" shortcut="E" active={tool === "eraser"} onClick={() => onSelectTool("eraser")}>
            <Eraser />
          </HudBtn>

          <div className="mx-1 h-4 w-px bg-border" />

          <HudBtn label="Upload image" shortcut="I" onClick={onTriggerImageUpload}>
            <ImagePlus />
          </HudBtn>
          <HudBtn label="New artboard" shortcut="G" onClick={onCreateArtboard}>
            <Layers />
          </HudBtn>
        </div>
      </div>
    </>
  );
}
