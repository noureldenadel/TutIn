import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Eraser,
  Group,
  Hand,
  Highlighter,
  Image,
  LayoutGrid,
  Maximize,
  Minus,
  MousePointer,
  PanelRightClose,
  PanelRightOpen,
  PenLine,
  Plus,
  Redo2,
  RotateCcw,
  StickyNote,
  Type,
  Undo2,
} from "lucide-react";

import { STROKE_COLOR_OPTIONS, type CanvasToolMode } from "@/components/canvas/canvas-tokens";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import type { CanvasArtboardCardLayout, CanvasBoardLayoutMode } from "@/lib/app-settings";
import type { CanvasLayoutOptions, CanvasStrokeColorToken } from "@/lib/course-canvas";
import { cn } from "@/lib/utils";

const PEN_WIDTHS = [3, 5, 8];
const HIGHLIGHTER_WIDTHS = [16, 24, 34];

const BOARD_LAYOUT_OPTIONS: ReadonlyArray<{ id: CanvasBoardLayoutMode; label: string }> = [
  { id: "module-rows", label: "Modules" },
  { id: "wrapped-rows", label: "Rows" },
  { id: "masonry", label: "Masonry" },
];

const CARD_LAYOUT_OPTIONS: ReadonlyArray<{ id: CanvasArtboardCardLayout; label: string }> = [
  { id: "columns", label: "Columns" },
  { id: "grid", label: "Grid" },
  { id: "single", label: "Single" },
];

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
        "flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-35 [&_svg]:size-4 [&_svg]:stroke-[1.75]",
        active &&
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
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
  layoutOptions,
  onSelectTool,
  onChangeStrokeColor,
  onChangeStrokeSize,
  onUndo,
  onRedo,
  onChangeBoardLayout,
  onChangeCardLayout,
  onToggleColorByModule,
  onTidyAll,
  onResetArrangement,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onFitToView,
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
  layoutOptions: CanvasLayoutOptions;
  onSelectTool: (tool: CanvasToolMode) => void;
  onChangeStrokeColor: (color: CanvasStrokeColorToken) => void;
  onChangeStrokeSize: (size: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onChangeBoardLayout: (mode: CanvasBoardLayoutMode) => void;
  onChangeCardLayout: (mode: CanvasArtboardCardLayout) => void;
  onToggleColorByModule: (enabled: boolean) => void;
  onTidyAll: () => void;
  onResetArrangement: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onFitToView: () => void;
  onToggleDrawer: () => void;
  onTriggerImageUpload: () => void;
  onCreateArtboard: () => void;
}) {
  const [arrangeOpen, setArrangeOpen] = useState(false);
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
        className="pointer-events-auto absolute left-2.5 top-2.5 z-20 flex max-w-[calc(100vw-11rem)] items-center gap-1 rounded-xl border border-border/70 bg-card/95 p-1 shadow-card backdrop-blur-sm sm:left-4 sm:top-4"
      >
        <Link
          to="/learn/$courseId"
          params={{ courseId }}
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:px-2.5 [&_svg]:stroke-[1.75]"
        >
          <ArrowLeft className="size-3.5" />
          <span className="hidden sm:inline">Player</span>
        </Link>

        <div className="hidden h-4 w-px bg-border md:block" />

        <span
          title={courseTitle}
          className="hidden max-w-[200px] truncate px-2 text-xs font-semibold text-foreground md:inline"
        >
          {courseTitle}
        </span>

        <div className="h-4 w-px bg-border" />

        <button
          type="button"
          onClick={onToggleDrawer}
          title={drawerOpen ? "Hide notes drawer" : "Show notes drawer"}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:px-2.5 [&_svg]:stroke-[1.75]",
            drawerOpen && "bg-secondary text-foreground",
          )}
        >
          {drawerOpen ? (
            <PanelRightClose className="size-3.5" />
          ) : (
            <PanelRightOpen className="size-3.5" />
          )}
          <span className="hidden sm:inline">Notes</span>
          {unplacedCount > 0 && (
            <span className="rounded-sm bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-primary">
              {unplacedCount}
            </span>
          )}
        </button>
      </div>

      {/* Top-Right History, Reset & Zoom Bar */}
      <div
        data-canvas-ui="true"
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        className="pointer-events-auto absolute right-2.5 top-2.5 z-20 flex items-center gap-0.5 rounded-xl border border-border/70 bg-card/95 p-1 shadow-card backdrop-blur-sm sm:right-4 sm:top-4 sm:gap-1"
      >
        <HudBtn label="Undo" shortcut="Ctrl+Z" disabled={!canUndo} onClick={onUndo}>
          <Undo2 />
        </HudBtn>
        <HudBtn label="Redo" shortcut="Ctrl+Shift+Z" disabled={!canRedo} onClick={onRedo}>
          <Redo2 />
        </HudBtn>

        <div className="mx-0.5 h-4 w-px bg-border" />

        <Popover open={arrangeOpen} onOpenChange={setArrangeOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Arrange layout"
              aria-expanded={arrangeOpen}
              title="Arrange layout"
              className={cn(
                "flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground [&_svg]:size-4 [&_svg]:stroke-[1.75]",
                arrangeOpen && "bg-secondary text-foreground",
              )}
            >
              <LayoutGrid />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={10}
            data-canvas-ui="true"
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            className="w-64 space-y-3 rounded-xl border border-border/70 bg-popover p-3 shadow-workspace"
          >
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium text-muted-foreground">Artboards</div>
              <div className="grid grid-cols-3 gap-1 rounded-lg bg-secondary/75 p-1">
                {BOARD_LAYOUT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeBoardLayout(opt.id)}
                    className={cn(
                      "rounded-sm py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground",
                      layoutOptions.boardLayout === opt.id &&
                        "bg-card text-foreground shadow-card dark:bg-accent",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-[11px] font-medium text-muted-foreground">Cards</div>
              <div className="grid grid-cols-3 gap-1 rounded-lg bg-secondary/75 p-1">
                {CARD_LAYOUT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeCardLayout(opt.id)}
                    className={cn(
                      "rounded-sm py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground",
                      layoutOptions.cardLayout === opt.id &&
                        "bg-card text-foreground shadow-card dark:bg-accent",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex cursor-pointer items-center justify-between gap-2 py-0.5">
              <span className="text-xs text-foreground">Color by module</span>
              <Switch
                checked={layoutOptions.colorByModule}
                onCheckedChange={onToggleColorByModule}
              />
            </label>

            <div className="space-y-1.5 border-t border-border/50 pt-2.5">
              <button
                type="button"
                onClick={() => {
                  onTidyAll();
                  setArrangeOpen(false);
                }}
                className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-secondary/85 px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary [&_svg]:size-3.5 [&_svg]:stroke-[1.75]"
              >
                <LayoutGrid />
                <span>Tidy layout</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onResetArrangement();
                  setArrangeOpen(false);
                }}
                className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-secondary/60 [&_svg]:mt-0.5 [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:stroke-[1.75]"
              >
                <RotateCcw className="text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block text-xs font-medium leading-tight text-foreground">
                    Reset to lectures
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                    Returns moved notes to lessons
                  </span>
                </span>
              </button>
            </div>
          </PopoverContent>
        </Popover>

        <div className="mx-0.5 h-4 w-px bg-border" />

        <div className="hidden items-center gap-0.5 sm:flex sm:gap-1">
          <HudBtn label="Zoom out" onClick={onZoomOut}>
            <Minus />
          </HudBtn>
          <button
            type="button"
            onClick={onResetZoom}
            title="Reset to 100%"
            className="min-w-12 rounded-md px-1.5 py-1 font-mono text-xs font-medium tabular-nums text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {Math.round(zoom * 100)}%
          </button>
          <HudBtn label="Zoom in" onClick={onZoomIn}>
            <Plus />
          </HudBtn>
        </div>
        <HudBtn label="Fit to view" shortcut="0" onClick={onFitToView}>
          <Maximize />
        </HudBtn>
      </div>

      {/* Bottom Floating Tool Dock */}
      <div
        data-canvas-ui="true"
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        className="pointer-events-auto absolute bottom-3 left-1/2 z-20 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 flex-col items-center gap-2 sm:bottom-4"
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
                    strokeColor === opt.token &&
                      "ring-2 ring-primary ring-offset-2 ring-offset-card",
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

        <div className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl border border-border/70 bg-card/95 p-1 shadow-workspace backdrop-blur-sm scrollbar-none">
          <HudBtn
            label="Select"
            shortcut="V"
            active={tool === "select"}
            onClick={() => onSelectTool("select")}
          >
            <MousePointer />
          </HudBtn>
          <HudBtn
            label="Pan"
            shortcut="H"
            active={tool === "pan"}
            onClick={() => onSelectTool("pan")}
          >
            <Hand />
          </HudBtn>

          <div className="mx-1 h-4 w-px bg-border" />

          <HudBtn
            label="Add note"
            shortcut="N"
            active={tool === "note"}
            onClick={() => onSelectTool("note")}
          >
            <StickyNote />
          </HudBtn>
          <HudBtn
            label="Add text"
            shortcut="T"
            active={tool === "text"}
            onClick={() => onSelectTool("text")}
          >
            <Type />
          </HudBtn>
          <HudBtn
            label="Connect"
            shortcut="A"
            active={tool === "connect"}
            onClick={() => onSelectTool("connect")}
          >
            <ArrowRight />
          </HudBtn>

          <div className="mx-1 h-4 w-px bg-border" />

          <HudBtn
            label="Pen"
            shortcut="P"
            active={tool === "pen"}
            onClick={() => onSelectTool("pen")}
          >
            <PenLine />
          </HudBtn>
          <HudBtn
            label="Highlighter"
            shortcut="M"
            active={tool === "highlighter"}
            onClick={() => onSelectTool("highlighter")}
          >
            <Highlighter />
          </HudBtn>
          <HudBtn
            label="Eraser"
            shortcut="E"
            active={tool === "eraser"}
            onClick={() => onSelectTool("eraser")}
          >
            <Eraser />
          </HudBtn>

          <div className="mx-1 h-4 w-px bg-border" />

          <HudBtn label="Upload image" shortcut="I" onClick={onTriggerImageUpload}>
            <Image />
          </HudBtn>
          <HudBtn label="New artboard" shortcut="G" onClick={onCreateArtboard}>
            <Group />
          </HudBtn>
        </div>
      </div>
    </>
  );
}
