import {
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  Copy,
  CornerDownLeft,
  Group,
  LayoutGrid,
  Pencil,
  StickyNote,
  Trash2,
  Type,
} from "lucide-react";

import {
  ContextMenuDivider,
  ContextMenuItem,
  ContextMenuSurface,
  EditorAndImageMenuSections,
} from "@/components/notes/app-context-menu";
import { CANVAS_ACCENT_OPTIONS } from "@/components/canvas/canvas-tokens";
import type { CanvasCard, CanvasEdge, CanvasGroup } from "@/lib/course-canvas";
import type { ContextMenuTargetAnalysis } from "@/lib/spellcheck";
import { cn } from "@/lib/utils";

export type CanvasContextMenuTarget =
  | {
      kind: "cards";
      clientX: number;
      clientY: number;
      cardIds: string[];
      groupIds?: string[] | undefined;
      analysis?: ContextMenuTargetAnalysis | undefined;
      onOpenImage?: ((src: string) => void) | undefined;
    }
  | {
      kind: "artboard";
      clientX: number;
      clientY: number;
      groupIds: string[];
      cardIds?: string[] | undefined;
    }
  | {
      kind: "edge";
      clientX: number;
      clientY: number;
      edgeId: string;
    }
  | {
      kind: "stage";
      clientX: number;
      clientY: number;
      worldX: number;
      worldY: number;
    };

function ColorSwatchRow({
  activeIndex,
  allowDefault,
  onSelect,
}: {
  activeIndex: number | undefined | "mixed";
  allowDefault: boolean;
  onSelect: (accentIndex: number | undefined) => void;
}) {
  return (
    <div className="px-1.5 py-1">
      <div className="px-0.5 pb-1.5 text-[11px] font-medium text-muted-foreground">Color</div>
      <div className="flex items-center gap-1.5">
        {allowDefault && (
          <button
            type="button"
            title="Default"
            aria-label="Default color"
            aria-pressed={activeIndex === undefined}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelect(undefined)}
            className={cn(
              "relative flex size-5 items-center justify-center rounded-full border border-border bg-secondary transition-transform hover:scale-110",
              activeIndex === undefined && "ring-2 ring-primary ring-offset-2 ring-offset-popover",
            )}
          >
            <span className="h-3 w-[1.5px] rotate-45 rounded-full bg-muted-foreground/70" />
          </button>
        )}

        {CANVAS_ACCENT_OPTIONS.map((opt) => {
          const isActive = activeIndex === opt.index;
          return (
            <button
              key={opt.index}
              type="button"
              title={opt.label}
              aria-label={opt.label}
              aria-pressed={isActive}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(opt.index)}
              className={cn(
                "size-5 rounded-full border border-black/15 dark:border-white/15 transition-transform hover:scale-110",
                isActive && "ring-2 ring-primary ring-offset-2 ring-offset-popover",
              )}
              style={{ backgroundColor: opt.cssColor }}
            />
          );
        })}
      </div>
    </div>
  );
}

export function CanvasContextMenu({
  target,
  cards,
  editingCardId,
  groups,
  canTidyGroup = false,
  hasGroups = false,
  canPaste = false,
  activeSelectedCardIds = [],
  activeSelectedGroupIds = [],
  edge,
  onUpdateCardsAccent,
  onEditCard,
  onCopySelection,
  onPasteAt,
  onAddToArtboard,
  onReturnCardsToOrigin,
  onTidyCards,
  onDeleteSelection,
  onUpdateGroupsTint,
  onRenameGroup,
  onTidyGroups,
  onTidyAll,
  onSetGroupsCollapsed,
  onDeleteEdge,
  onAddNoteAt,
  onAddTextAt,
  onAddArtboardAt,
  onClose,
}: {
  target: CanvasContextMenuTarget;
  cards: CanvasCard[];
  editingCardId: string | null;
  groups: CanvasGroup[];
  canTidyGroup?: boolean | undefined;
  hasGroups?: boolean | undefined;
  canPaste?: boolean | undefined;
  activeSelectedCardIds?: string[] | undefined;
  activeSelectedGroupIds?: string[] | undefined;
  edge?: CanvasEdge | undefined;
  onUpdateCardsAccent: (cardIds: string[], accentIndex: number | undefined) => void;
  onEditCard: (cardId: string) => void;
  onCopySelection: (groupIds: string[], cardIds: string[]) => void;
  onPasteAt: (worldX: number, worldY: number) => void;
  onAddToArtboard: (groupIds: string[], cardIds: string[]) => void;
  onReturnCardsToOrigin: (cardIds: string[]) => void;
  onTidyCards: (cardIds: string[]) => void;
  onDeleteSelection: (groupIds: string[], cardIds: string[]) => void;
  onUpdateGroupsTint: (groupIds: string[], tintIndex: number) => void;
  onRenameGroup: (groupId: string) => void;
  onTidyGroups: (groupIds: string[]) => void;
  onTidyAll: () => void;
  onSetGroupsCollapsed: (groupIds: string[], collapsed: boolean) => void;
  onDeleteEdge: (edgeId: string) => void;
  onAddNoteAt: (worldX: number, worldY: number) => void;
  onAddTextAt: (worldX: number, worldY: number) => void;
  onAddArtboardAt: (worldX: number, worldY: number) => void;
  onClose: () => void;
}) {
  const cardIds = target.kind === "cards" ? target.cardIds : [];
  const cardTargetGroupIds = target.kind === "cards" ? (target.groupIds ?? []) : [];
  const accentSet = new Set(cards.map((c) => c.accentIndex));
  const sharedCardAccent = accentSet.size === 1 ? Array.from(accentSet)[0] : "mixed";
  const singleCard = cards.length === 1 ? cards[0] : undefined;
  const isEditingTargetCard = Boolean(editingCardId && cardIds.includes(editingCardId));
  const canEditSingle =
    Boolean(singleCard) &&
    cardTargetGroupIds.length === 0 &&
    singleCard!.type !== "image" &&
    editingCardId !== singleCard!.id;
  const hasReturnableVideoNote = cards.some(
    (c) =>
      c.type === "video-note" &&
      c.originLessonIdx !== undefined &&
      (c.membershipState === "detached" || c.membershipState === "reassigned"),
  );
  const hasVideoNote = cards.some((c) => c.type === "video-note");
  const totalCardTargetCount = cards.length + cardTargetGroupIds.length;

  const groupIds = target.kind === "artboard" ? target.groupIds : [];
  const groupTargetCardIds = target.kind === "artboard" ? (target.cardIds ?? []) : [];
  const tintSet = new Set(groups.map((g) => g.tintIndex));
  const sharedGroupTint = tintSet.size === 1 ? Array.from(tintSet)[0] : "mixed";
  const singleGroup =
    groups.length === 1 && groupTargetCardIds.length === 0 ? groups[0] : undefined;
  const allGroupsCollapsed = groups.length > 0 && groups.every((g) => g.collapsed);
  const totalGroupTargetCount = groups.length + groupTargetCardIds.length;
  const hasStageSelection = activeSelectedCardIds.length > 0 || activeSelectedGroupIds.length > 0;

  if (target.kind === "cards" && cards.length === 0) return null;
  if (target.kind === "artboard" && groups.length === 0) return null;
  if (target.kind === "edge" && !edge) return null;

  return (
    <ContextMenuSurface clientX={target.clientX} clientY={target.clientY}>
      {target.kind === "cards" && (
        <>
          {target.analysis && (
            <EditorAndImageMenuSections
              analysis={target.analysis}
              onOpenImage={target.onOpenImage}
              onClose={onClose}
              showTrailingDivider
            />
          )}

          {totalCardTargetCount > 1 && (
            <div className="px-2 pb-1 pt-0.5 font-mono text-[11px] font-medium text-muted-foreground">
              {totalCardTargetCount} selected
            </div>
          )}

          <ColorSwatchRow
            activeIndex={sharedCardAccent}
            allowDefault
            onSelect={(idx) => {
              onUpdateCardsAccent(cardIds, idx);
              onClose();
            }}
          />

          <ContextMenuDivider />

          {canEditSingle && singleCard && (
            <ContextMenuItem
              icon={<Pencil />}
              label="Edit"
              onClick={() => {
                onEditCard(singleCard.id);
                onClose();
              }}
            />
          )}

          {!isEditingTargetCard && (
            <>
              <ContextMenuItem
                icon={<Copy />}
                label="Copy"
                onClick={() => {
                  onCopySelection(cardTargetGroupIds, cardIds);
                  onClose();
                }}
              />
              <ContextMenuItem
                icon={<Group />}
                label="Add to artboard"
                onClick={() => {
                  onAddToArtboard(cardTargetGroupIds, cardIds);
                  onClose();
                }}
              />
            </>
          )}

          {hasReturnableVideoNote && (
            <ContextMenuItem
              icon={<CornerDownLeft />}
              label="To lesson"
              onClick={() => {
                onReturnCardsToOrigin(cardIds);
                onClose();
              }}
            />
          )}

          {cards.length >= 2 && (
            <ContextMenuItem
              icon={<LayoutGrid />}
              label="Tidy"
              onClick={() => {
                onTidyCards(cardIds);
                onClose();
              }}
            />
          )}

          <ContextMenuItem
            icon={<Trash2 />}
            label={hasVideoNote ? "Remove" : "Delete"}
            destructive
            onClick={() => {
              onDeleteSelection(cardTargetGroupIds, cardIds);
              onClose();
            }}
          />
        </>
      )}

      {target.kind === "artboard" && groups.length > 0 && (
        <>
          {totalGroupTargetCount > 1 && (
            <div className="px-2 pb-1 pt-0.5 font-mono text-[11px] font-medium text-muted-foreground">
              {totalGroupTargetCount} selected
            </div>
          )}

          <ColorSwatchRow
            activeIndex={sharedGroupTint}
            allowDefault={false}
            onSelect={(idx) => {
              if (idx !== undefined) {
                onUpdateGroupsTint(groupIds, idx);
              }
              onClose();
            }}
          />

          <ContextMenuDivider />

          {singleGroup && (
            <ContextMenuItem
              icon={<Pencil />}
              label="Rename"
              onClick={() => {
                onRenameGroup(singleGroup.id);
                onClose();
              }}
            />
          )}

          <ContextMenuItem
            icon={<Copy />}
            label="Copy"
            onClick={() => {
              onCopySelection(groupIds, groupTargetCardIds);
              onClose();
            }}
          />

          {groupTargetCardIds.length > 0 && (
            <ContextMenuItem
              icon={<Group />}
              label="Add to artboard"
              onClick={() => {
                onAddToArtboard(groupIds, groupTargetCardIds);
                onClose();
              }}
            />
          )}

          {canTidyGroup && (
            <ContextMenuItem
              icon={<LayoutGrid />}
              label="Tidy"
              onClick={() => {
                onTidyGroups(groupIds);
                onClose();
              }}
            />
          )}

          <ContextMenuItem
            icon={allGroupsCollapsed ? <ChevronDown /> : <ChevronUp />}
            label={allGroupsCollapsed ? "Expand" : "Collapse"}
            onClick={() => {
              onSetGroupsCollapsed(groupIds, !allGroupsCollapsed);
              onClose();
            }}
          />

          <ContextMenuDivider />

          <ContextMenuItem
            icon={<Trash2 />}
            label="Remove"
            destructive
            onClick={() => {
              onDeleteSelection(groupIds, groupTargetCardIds);
              onClose();
            }}
          />
        </>
      )}

      {target.kind === "edge" && edge && (
        <ContextMenuItem
          icon={<Trash2 />}
          label="Delete"
          destructive
          onClick={() => {
            onDeleteEdge(edge.id);
            onClose();
          }}
        />
      )}

      {target.kind === "stage" && (
        <>
          <ContextMenuItem
            icon={<StickyNote />}
            label="New note"
            onClick={() => {
              onAddNoteAt(target.worldX, target.worldY);
              onClose();
            }}
          />
          <ContextMenuItem
            icon={<Type />}
            label="New text"
            onClick={() => {
              onAddTextAt(target.worldX, target.worldY);
              onClose();
            }}
          />
          <ContextMenuItem
            icon={<Group />}
            label="New artboard"
            onClick={() => {
              onAddArtboardAt(target.worldX, target.worldY);
              onClose();
            }}
          />
          {canPaste && (
            <>
              <ContextMenuDivider />
              <ContextMenuItem
                icon={<ClipboardPaste />}
                label="Paste"
                onClick={() => {
                  onPasteAt(target.worldX, target.worldY);
                  onClose();
                }}
              />
            </>
          )}
          {hasStageSelection && (
            <>
              <ContextMenuDivider />
              <ContextMenuItem
                icon={<Copy />}
                label="Copy"
                onClick={() => {
                  onCopySelection(activeSelectedGroupIds, activeSelectedCardIds);
                  onClose();
                }}
              />
              {activeSelectedCardIds.length > 0 && (
                <ContextMenuItem
                  icon={<Group />}
                  label="Add to artboard"
                  onClick={() => {
                    onAddToArtboard(activeSelectedGroupIds, activeSelectedCardIds);
                    onClose();
                  }}
                />
              )}
            </>
          )}
          {hasGroups && (
            <>
              <ContextMenuDivider />
              <ContextMenuItem
                icon={<LayoutGrid />}
                label="Tidy all"
                onClick={() => {
                  onTidyAll();
                  onClose();
                }}
              />
            </>
          )}
        </>
      )}
    </ContextMenuSurface>
  );
}
