import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRightLeft,
  BookPlus,
  ClipboardPaste,
  Copy,
  EyeOff,
  Maximize2,
  RemoveFormatting,
  Scissors,
} from "lucide-react";
import { toast } from "sonner";

import {
  checkWordSpelling,
  subscribeSpellCheckerReady,
  type ContextMenuTargetAnalysis,
} from "@/lib/spellcheck";
import { cn } from "@/lib/utils";

export function ContextMenuDivider() {
  return <div className="my-1 h-px bg-border/60" />;
}

export function ContextMenuItem({
  icon,
  label,
  destructive = false,
  emphasis = false,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  destructive?: boolean | undefined;
  emphasis?: boolean | undefined;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors focus:outline-none [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:stroke-[1.75]",
        destructive
          ? "text-destructive hover:bg-destructive/12 focus:bg-destructive/12"
          : "text-popover-foreground hover:bg-accent hover:text-accent-foreground focus:bg-accent",
        emphasis && "font-medium",
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

export function ContextMenuSurface({
  clientX,
  clientY,
  children,
}: {
  clientX: number;
  clientY: number;
  children: ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({
    left: clientX,
    top: clientY,
  });

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    const clampedLeft = Math.max(pad, Math.min(clientX, window.innerWidth - rect.width - pad));
    const clampedTop = Math.max(pad, Math.min(clientY, window.innerHeight - rect.height - pad));
    setPos({ left: clampedLeft, top: clampedTop });
  }, [clientX, clientY]);

  return (
    <div
      ref={menuRef}
      role="menu"
      data-canvas-ui="true"
      data-canvas-context-menu="true"
      style={{ left: pos.left, top: pos.top }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      className="fixed z-50 min-w-[228px] rounded-lg border border-border/80 bg-popover p-1.5 text-popover-foreground shadow-workspace animate-in fade-in zoom-in-95 duration-100"
    >
      {children}
    </div>
  );
}

export function EditorAndImageMenuSections({
  analysis,
  onOpenImage,
  onClose,
  showTrailingDivider = false,
}: {
  analysis: ContextMenuTargetAnalysis;
  onOpenImage?: ((src: string) => void) | undefined;
  onClose: () => void;
  showTrailingDivider?: boolean | undefined;
}) {
  const [, setDictVersion] = useState(0);

  useEffect(() => {
    if (!analysis.wordMatch) return;
    return subscribeSpellCheckerReady(() => setDictVersion((v) => v + 1));
  }, [analysis.wordMatch]);

  const spellResult = analysis.wordMatch ? checkWordSpelling(analysis.wordMatch.word) : null;
  const hasSpellingSection = Boolean(analysis.wordMatch && spellResult && !spellResult.isCorrect);
  const hasImageSection = Boolean(analysis.imageSrc);
  const hasSelection = analysis.hasSelection;
  const hasClipboardSection = analysis.isEditable || hasSelection;

  if (!hasSpellingSection && !hasImageSection && !hasClipboardSection) {
    return null;
  }

  return (
    <>
      {hasSpellingSection && analysis.wordMatch && spellResult && (
        <>
          {spellResult.suggestions.length > 0 ? (
            spellResult.suggestions.map((suggestion) => (
              <ContextMenuItem
                key={suggestion}
                icon={<ArrowRightLeft />}
                label={suggestion}
                emphasis
                onClick={() => {
                  analysis.wordMatch!.replaceWith(suggestion);
                  onClose();
                }}
              />
            ))
          ) : (
            <div className="px-2 py-1.5 text-[12px] text-muted-foreground">No suggestions</div>
          )}

          <ContextMenuItem
            icon={<BookPlus />}
            label="Add to dictionary"
            onClick={() => {
              analysis.wordMatch!.addToDictionary();
              toast("Added to dictionary");
              onClose();
            }}
          />

          <ContextMenuItem
            icon={<EyeOff />}
            label="Ignore"
            onClick={() => {
              analysis.wordMatch!.ignoreWord();
              onClose();
            }}
          />

          {(hasImageSection || hasClipboardSection || showTrailingDivider) && (
            <ContextMenuDivider />
          )}
        </>
      )}

      {hasImageSection && analysis.imageSrc && (
        <>
          <ContextMenuItem
            icon={<Copy />}
            label="Copy image"
            onClick={() => {
              void analysis
                .copyImage()
                .then(() => toast.success("Image copied"))
                .catch((err) =>
                  toast.error(err instanceof Error ? err.message : "Failed to copy image"),
                );
              onClose();
            }}
          />
          {onOpenImage && (
            <ContextMenuItem
              icon={<Maximize2 />}
              label="Expand"
              onClick={() => {
                onOpenImage(analysis.imageSrc!);
                onClose();
              }}
            />
          )}
          {(hasClipboardSection || showTrailingDivider) && <ContextMenuDivider />}
        </>
      )}

      {hasClipboardSection && (
        <>
          {analysis.isEditable && hasSelection && (
            <ContextMenuItem
              icon={<Scissors />}
              label="Cut"
              onClick={() => {
                void analysis.cut().catch(() => toast.error("Failed to cut text"));
                onClose();
              }}
            />
          )}

          {hasSelection && (
            <ContextMenuItem
              icon={<Copy />}
              label="Copy"
              onClick={() => {
                void analysis.copy().catch(() => toast.error("Failed to copy text"));
                onClose();
              }}
            />
          )}

          {analysis.isEditable && (
            <>
              <ContextMenuItem
                icon={<ClipboardPaste />}
                label="Paste"
                onClick={() => {
                  void analysis.paste().then((ok) => {
                    if (!ok) toast.error("Use Ctrl+V to paste.");
                  });
                  onClose();
                }}
              />
              <ContextMenuItem
                icon={<RemoveFormatting />}
                label="Paste without formatting"
                onClick={() => {
                  void analysis.pastePlainText().then((ok) => {
                    if (!ok) toast.error("Use Ctrl+Shift+V to paste without formatting.");
                  });
                  onClose();
                }}
              />
            </>
          )}

          {showTrailingDivider && <ContextMenuDivider />}
        </>
      )}
    </>
  );
}

export interface StandaloneContextMenuState {
  clientX: number;
  clientY: number;
  analysis: ContextMenuTargetAnalysis;
}

export function StandaloneAppContextMenu({
  state,
  onOpenImage,
  onClose,
}: {
  state: StandaloneContextMenuState;
  onOpenImage?: ((src: string) => void) | undefined;
  onClose: () => void;
}) {
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (e.target instanceof Element && e.target.closest('[data-canvas-context-menu="true"]')) {
        return;
      }
      onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [onClose]);

  return (
    <ContextMenuSurface clientX={state.clientX} clientY={state.clientY}>
      <EditorAndImageMenuSections
        analysis={state.analysis}
        onOpenImage={onOpenImage}
        onClose={onClose}
      />
    </ContextMenuSurface>
  );
}
