import { memo, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Clock, CornerDownLeft, Maximize2, Pencil, Trash2 } from "lucide-react";

import { RichNoteHtmlContent, RichNoteSurface } from "@/components/notes/rich-note-surface";
import { getArtboardAccentVar } from "@/components/canvas/canvas-tokens";
import { formatTimestamp } from "@/lib/course-lessons";
import { hasMeaningfulHtmlContent } from "@/lib/course-notes";
import {
  CARD_FIT_MAX_WIDTH,
  getCardMinHeight,
  getCardMinWidth,
  type CanvasCard,
  type CanvasSide,
} from "@/lib/course-canvas";
import { useMediaUrl } from "@/lib/media-store";
import { cn } from "@/lib/utils";

const CONNECTOR_SIDES: CanvasSide[] = ["top", "right", "bottom", "left"];

function measureVideoHeaderMinWidth(cardRootEl: HTMLElement): number {
  const headerEl = cardRootEl.querySelector("[data-card-header='true']") as HTMLElement | null;
  if (!headerEl) return 0;

  const cs = window.getComputedStyle(headerEl);
  const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  const borderX = Math.max(0, cardRootEl.offsetWidth - cardRootEl.clientWidth);
  const leftEl = headerEl.children[0] as HTMLElement | undefined;
  const rightEl = headerEl.children[1] as HTMLElement | undefined;

  let leftW = 0;
  if (leftEl) {
    const children = Array.from(leftEl.children) as HTMLElement[];
    if (children.length > 0) {
      for (const child of children) {
        leftW += child.offsetWidth;
      }
      leftW += Math.max(0, children.length - 1) * 6;
    } else {
      leftW = leftEl.scrollWidth;
    }
  }
  const rightW = rightEl?.offsetWidth ?? 0;
  return Math.ceil(leftW + rightW + padX + borderX + 8);
}

function computeInlineRightChrome(startEl: HTMLElement, boundaryEl: HTMLElement): number {
  let extra = 0;
  let el: HTMLElement | null = startEl;
  while (el && el !== boundaryEl) {
    const cs = window.getComputedStyle(el);
    const isInline = cs.display.startsWith("inline");
    if (isInline || el.tagName === "PRE" || el.tagName === "BLOCKQUOTE") {
      extra += (parseFloat(cs.paddingRight) || 0) + (parseFloat(cs.borderRightWidth) || 0);
      if (isInline) {
        extra += Math.max(0, parseFloat(cs.marginRight) || 0);
      }
    }
    el = el.parentElement;
  }
  return extra;
}

function measureNoteContentWidth(
  cardRootEl: HTMLElement,
  contentEl: HTMLElement,
  card: CanvasCard,
  scale: number,
  horizontalChrome: number,
  headerMinWidth: number,
): number {
  const contentRect = contentEl.getBoundingClientRect();
  const contentLeft = contentRect.left;
  const contentTop = contentRect.top;
  const floatEl = cardRootEl.querySelector("[data-text-delete-float='true']") as HTMLElement | null;
  const floatRect = floatEl?.getBoundingClientRect() ?? null;
  const floatReserve = card.type === "text" ? (floatEl ? (floatEl.offsetWidth || 20) + 4 : 24) : 0;

  let maxInnerW = 0;
  const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT);
  const range = document.createRange();

  let textNode: Node | null;
  while ((textNode = walker.nextNode())) {
    const rawText = textNode.textContent;
    if (!rawText) continue;
    const parentEl = textNode.parentElement;
    if (!parentEl) continue;
    const insidePre = Boolean(parentEl.closest("pre"));
    if (!insidePre && !rawText.trim() && !rawText.includes("\u00A0")) continue;

    range.selectNodeContents(textNode);
    const rects = range.getClientRects();
    if (rects.length === 0) continue;

    const extraRight = computeInlineRightChrome(parentEl, contentEl);
    for (let i = 0; i < rects.length; i++) {
      const rect = rects[i]!;
      if (rect.width <= 0.5 || rect.height <= 0.5) continue;

      let right = (rect.right - contentLeft) / scale + extraRight;
      if (floatReserve > 0) {
        const overlapsFloat = floatRect
          ? rect.top < floatRect.bottom - 1 && rect.bottom > floatRect.top + 1
          : (rect.top - contentTop) / scale < 26;
        if (overlapsFloat) right += floatReserve;
      }
      if (right > maxInnerW) maxInnerW = right;
    }
  }

  for (const img of Array.from(contentEl.querySelectorAll("img"))) {
    const rect = img.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    const imgBoxW = Math.min(288, rect.width / scale);
    const blockHolder = img.closest("[data-note-image-block='true'], div, p, li");
    const isBlockImg =
      window.getComputedStyle(img).display === "block" ||
      Boolean(img.closest("[data-note-image-block='true']"));
    if (isBlockImg) {
      const holderLeft = blockHolder
        ? Math.max(0, (blockHolder.getBoundingClientRect().left - contentLeft) / scale)
        : 0;
      maxInnerW = Math.max(maxInnerW, holderLeft + imgBoxW);
    } else {
      maxInnerW = Math.max(maxInnerW, (rect.right - contentLeft) / scale);
    }
  }

  for (const pre of Array.from(contentEl.querySelectorAll("pre"))) {
    if (pre.scrollWidth > pre.clientWidth + 1) {
      const preOffsetLeft = Math.max(0, (pre.getBoundingClientRect().left - contentLeft) / scale);
      const preBorderX = Math.max(0, pre.offsetWidth - pre.clientWidth);
      const neededPreW = preOffsetLeft + pre.scrollWidth + preBorderX;
      maxInnerW = Math.max(
        maxInnerW,
        Math.min(neededPreW, Math.max(card.width, CARD_FIT_MAX_WIDTH) - horizontalChrome),
      );
    }
  }

  for (const cb of Array.from(contentEl.querySelectorAll("input[data-task-checkbox='true']"))) {
    const rect = cb.getBoundingClientRect();
    if (rect.width > 0) {
      maxInnerW = Math.max(maxInnerW, (rect.right - contentLeft) / scale + 6);
    }
  }

  if (maxInnerW <= 0) {
    return card.type === "video-note"
      ? Math.max(headerMinWidth, 200)
      : card.type === "text"
        ? 130
        : 160;
  }

  return Math.max(headerMinWidth, Math.ceil(maxInnerW + horizontalChrome + 4));
}

function measureImageCardFittedSize(
  cardRootEl: HTMLElement,
  card: CanvasCard,
  axis: "width" | "height" | "both",
  minW: number,
  minH: number,
): { width: number; height: number } | null {
  const imgEl = cardRootEl.querySelector("img") as HTMLImageElement | null;
  const imgBox = cardRootEl.querySelector("[data-card-image-box='true']") as HTMLElement | null;
  if (!imgEl || !imgBox || imgEl.naturalWidth <= 0 || imgEl.naturalHeight <= 0) return null;

  const borderX = Math.max(0, cardRootEl.offsetWidth - cardRootEl.clientWidth);
  const chromeY = Math.max(0, cardRootEl.offsetHeight - imgBox.clientHeight);
  const aspect = imgEl.naturalWidth / imgEl.naturalHeight;

  let nextW = card.width;
  let nextH = card.height;

  if (axis === "width") {
    const idealW = borderX + Math.round(imgBox.clientHeight * aspect);
    nextW = Math.max(minW, Math.min(2400, idealW));
  } else if (axis === "height") {
    const idealH = chromeY + Math.round(cardRootEl.clientWidth / aspect);
    nextH = Math.max(minH, Math.min(12000, idealH));
  } else {
    const renderedH = Math.min(imgBox.clientHeight, imgBox.clientWidth / aspect);
    const renderedW = renderedH * aspect;
    nextW = Math.max(minW, Math.min(2400, borderX + Math.round(renderedW)));
    nextH = Math.max(minH, Math.min(12000, chromeY + Math.round(renderedH)));
  }

  return { width: nextW, height: nextH };
}

function measureFittedCardDimensions(
  cardRootEl: HTMLElement,
  card: CanvasCard,
  axis: "width" | "height" | "both",
): { width: number; height: number } | null {
  const headerMinW = card.type === "video-note" ? measureVideoHeaderMinWidth(cardRootEl) : 0;
  const minW = Math.max(getCardMinWidth(card.type), headerMinW);
  const minH = getCardMinHeight(card.type);

  if (card.type === "image") {
    return measureImageCardFittedSize(cardRootEl, card, axis, minW, minH);
  }

  const contentEl = cardRootEl.querySelector(".note-editor, .note-content") as HTMLElement | null;
  const rootRect = cardRootEl.getBoundingClientRect();
  const scale =
    cardRootEl.offsetWidth > 0 && rootRect.width > 0 ? rootRect.width / cardRootEl.offsetWidth : 1;

  let nextW = card.width;
  if (axis !== "height" && contentEl) {
    const horizontalChrome = Math.max(0, cardRootEl.offsetWidth - contentEl.clientWidth);
    const measuredW = measureNoteContentWidth(
      cardRootEl,
      contentEl,
      card,
      scale,
      horizontalChrome,
      headerMinW,
    );
    const maxFitW = Math.max(card.width, CARD_FIT_MAX_WIDTH);
    nextW = Math.max(minW, Math.min(maxFitW, measuredW));
  }

  let nextH = card.height;
  if (axis !== "width") {
    const prevWidth = cardRootEl.style.width;
    const prevMinHeight = cardRootEl.style.minHeight;
    let measuredH = card.height;
    try {
      if (nextW !== card.width) {
        cardRootEl.style.width = `${nextW}px`;
      }
      cardRootEl.style.minHeight = "0px";
      measuredH = Math.ceil(cardRootEl.offsetHeight);
    } finally {
      cardRootEl.style.width = prevWidth;
      cardRootEl.style.minHeight = prevMinHeight;
    }
    nextH = Math.max(minH, Math.min(12000, measuredH));
  }

  return { width: nextW, height: nextH };
}

function ImageCardBody({
  card,
  hasAccentStrip,
  editingCaption,
  onCommitCaption,
  onCancelCaption,
  onStartEditCaption,
  onOpenLightbox,
}: {
  card: CanvasCard;
  hasAccentStrip: boolean;
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
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden",
        hasAccentStrip ? "rounded-b-[7px]" : "rounded-[7px]",
      )}
    >
      <div
        data-card-image-box="true"
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

export const CanvasCardView = memo(function CanvasCardView({
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
  onFitDimensions,
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
  onSelect: (cardId: string, e: React.PointerEvent) => void;
  onStartDrag: (cardId: string, e: React.PointerEvent) => void;
  onStartResize: (
    cardId: string,
    e: React.PointerEvent,
    axis?: "both" | "width" | "height",
  ) => void;
  onFitDimensions?: ((cardId: string, width: number, height: number) => void) | undefined;
  onStartEdit: (cardId: string) => void;
  onFinishEdit: () => void;
  onDraftChange?: ((cardId: string, html: string) => void) | undefined;
  onCommitHtml?: ((cardId: string, html: string) => void) | undefined;
  onMeasuredHeightGrow?: ((cardId: string, nextHeight: number) => void) | undefined;
  onReturnToOriginGroup: (cardId: string) => void;
  onDelete: (cardId: string) => void;
  onStartConnect: (cardId: string, e: React.PointerEvent, side: CanvasSide) => void;
  onCompleteConnect: (cardId: string, e: React.PointerEvent, side?: CanvasSide) => void;
  onContextMenu?: ((card: CanvasCard, e: React.MouseEvent) => void) | undefined;
  onOpenLightbox: (src: string, card: CanvasCard) => void;
  onUpdateImageCaption: (cardId: string, caption: string) => void;
}) {
  const [draftHtml, setDraftHtml] = useState(card.htmlContent);
  const [editingCaption, setEditingCaption] = useState(false);
  const [hoveredPortSide, setHoveredPortSide] = useState<CanvasSide | null>(null);
  const cardRootRef = useRef<HTMLDivElement>(null);
  const wasEditingRef = useRef(false);
  const initialHtmlOnEditRef = useRef(card.htmlContent);
  const hasEditedDraftRef = useRef(false);
  const cardIdRef = useRef(card.id);
  cardIdRef.current = card.id;
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
      onDraftChangeRef.current?.(cardIdRef.current, card.htmlContent);
    } else if (!isEditing) {
      wasEditingRef.current = false;
      hasEditedDraftRef.current = false;
    }
  }, [isEditing, card.htmlContent]);

  const isVideoNote = card.type === "video-note";
  const isImage = card.type === "image";
  const isTextOnly = card.type === "text";
  const isEmptyCard = !isImage && !hasMeaningfulHtmlContent(card.htmlContent);
  // Shared 1:1 Read/Edit padding prevents width or baseline jumps when toggling edit mode.
  const bodyPaddingClassName = isTextOnly ? "px-4 py-3" : isVideoNote ? "px-4 pt-3 pb-4" : "p-4";

  const handleEdgeFitDoubleClick = (
    axis: "width" | "height" | "both",
    e: React.MouseEvent<HTMLDivElement>,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const el = cardRootRef.current;
    if (!el || !onFitDimensions) return;
    const fitted = measureFittedCardDimensions(el, card, axis);
    if (fitted && (fitted.width !== card.width || fitted.height !== card.height)) {
      onFitDimensions(card.id, fitted.width, fitted.height);
    }
  };

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
        const wrapperEl = el.querySelector(
          "[data-note-scroll-wrapper='true']",
        ) as HTMLElement | null;
        let measured: number;
        if (wrapperEl && wrapperEl.clientHeight > 0) {
          const cs = window.getComputedStyle(wrapperEl);
          const wrapperPaddingY =
            (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
          const chromeHeight = Math.max(0, el.offsetHeight - wrapperEl.clientHeight);
          const contentHeight = Math.max(
            wrapperEl.scrollHeight,
            editorEl.offsetHeight + wrapperPaddingY,
          );
          measured = Math.ceil(chromeHeight + contentHeight);
        } else {
          const headerEl = el.querySelector("[data-card-header='true']") as HTMLElement | null;
          measured = Math.ceil((headerEl?.offsetHeight ?? 0) + editorEl.offsetHeight);
        }
        if (measured > cardHeightRef.current + 2 && measured <= 12000) {
          onMeasuredHeightGrowRef.current?.(cardIdRef.current, measured);
        }
        return;
      }

      const measured = Math.ceil(el.offsetHeight);
      if (measured > cardHeightRef.current + 4 && measured <= 12000) {
        onMeasuredHeightGrowRef.current?.(cardIdRef.current, measured);
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
  }, [card.id, card.htmlContent, isEditing, isImage]);

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
      data-editing-card={isEditing ? "true" : undefined}
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
            onSelect(card.id, e);
          }
          return;
        }
        const targetEl = e.target as HTMLElement | null;
        if (!isEditing && targetEl?.closest("input[data-task-checkbox], a")) {
          return;
        }
        if (isConnectMode) {
          onCompleteConnect(card.id, e);
          return;
        }
        if (!isEditing && !editingCaption) {
          setHoveredPortSide(null);
          onStartDrag(card.id, e);
        }
        onSelect(card.id, e);
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
        onContextMenu?.(card, e);
      }}
      onDoubleClick={(e) => {
        if (pointerEventsDisabled || isConnectMode) return;
        e.stopPropagation();
        if (isImage) {
          setEditingCaption(true);
        } else if (!isEditing) {
          onStartEdit(card.id);
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

      {/* Video Note Header (linked course timestamp & artboard controls) */}
      {isVideoNote && (
        <div
          data-card-header="true"
          className="flex shrink-0 items-center justify-between gap-1.5 border-b border-border/45 px-4 py-2.5 text-xs"
        >
          <div className="flex min-w-0 items-center gap-1.5">
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

            {card.membershipState === "detached" && (
              <span className="rounded-sm bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                Detached
              </span>
            )}
            {card.membershipState === "reassigned" && (
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
            {(card.membershipState === "detached" || card.membershipState === "reassigned") &&
              card.originLessonIdx !== undefined && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onReturnToOriginGroup(card.id);
                  }}
                  title="Return to lesson artboard"
                  className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <CornerDownLeft className="size-3.5" />
                </button>
              )}

            {!isEditing && (
              <button
                type="button"
                aria-label="Edit note"
                title="Edit note"
                onClick={(e) => {
                  e.stopPropagation();
                  onStartEdit(card.id);
                }}
                className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Pencil className="size-3" />
              </button>
            )}

            <button
              type="button"
              aria-label="Remove from canvas"
              title="Hide from canvas"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(card.id);
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
          hasAccentStrip={Boolean(accentVar)}
          editingCaption={editingCaption}
          onStartEditCaption={() => setEditingCaption(true)}
          onCommitCaption={(caption) => {
            setEditingCaption(false);
            onUpdateImageCaption(card.id, caption);
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
          className="flex min-h-0 flex-1 flex-col"
        >
          <RichNoteSurface
            courseId={courseId}
            content={draftHtml}
            onChange={(html) => {
              if (html !== initialHtmlOnEditRef.current) {
                hasEditedDraftRef.current = true;
              }
              setDraftHtml(html);
              onDraftChange?.(card.id, html);
            }}
            onSubmit={onFinishEdit}
            onCancel={onFinishEdit}
            onOpenImage={(src) => onOpenLightbox(src, card)}
            toolbarPlacement="floating"
            wrapperPaddingClassName={bodyPaddingClassName}
            editorClassName={isTextOnly ? "min-h-0 text-base font-medium leading-[1.6]" : "min-h-0"}
            minHeightClassName=""
            maxHeightClassName=""
            className="flex min-h-0 flex-1 flex-col"
            wrapperClassName="flex-1"
            placeholder={isTextOnly ? "Type text…" : "Write note…"}
          />
        </div>
      ) : (
        <div className={bodyPaddingClassName}>
          {isTextOnly && (
            <div
              data-text-delete-float="true"
              onPointerDown={(e) => e.stopPropagation()}
              className="float-right ml-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/card:opacity-100"
            >
              <button
                type="button"
                aria-label="Delete text"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(card.id);
                }}
                className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-destructive/15 hover:text-destructive [&_svg]:stroke-[1.75]"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          )}

          <RichNoteHtmlContent
            html={card.htmlContent || "<p></p>"}
            className={isTextOnly ? "text-base font-medium leading-[1.6]" : undefined}
            onImageClick={(src) => onOpenLightbox(src, card)}
            onHtmlChange={onCommitHtml ? (nextHtml) => onCommitHtml(card.id, nextHtml) : undefined}
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
                    onCompleteConnect(card.id, e, side);
                    return;
                  }
                  onStartConnect(card.id, e, side);
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
            data-resize-handle="true"
            style={{ width: "clamp(6px, calc(8px / var(--canvas-zoom, 1)), 18px)" }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.stopPropagation();
              setHoveredPortSide(null);
              onStartResize(card.id, e, "width");
            }}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => handleEdgeFitDoubleClick("width", e)}
            title="Drag or double-click to fit width"
            className="absolute inset-y-2.5 right-0 z-10 cursor-ew-resize select-none after:pointer-events-none after:absolute after:inset-y-1 after:right-0 after:w-[2px] after:rounded-full after:bg-primary/50 after:opacity-0 after:transition-opacity hover:after:opacity-100"
          />
          <div
            data-resize-handle="true"
            style={{ height: "clamp(6px, calc(8px / var(--canvas-zoom, 1)), 18px)" }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.stopPropagation();
              setHoveredPortSide(null);
              onStartResize(card.id, e, "height");
            }}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => handleEdgeFitDoubleClick("height", e)}
            title="Drag or double-click to fit height"
            className="absolute inset-x-2.5 bottom-0 z-10 cursor-ns-resize select-none after:pointer-events-none after:absolute after:inset-x-1 after:bottom-0 after:h-[2px] after:rounded-full after:bg-primary/50 after:opacity-0 after:transition-opacity hover:after:opacity-100"
          />
          <div
            data-resize-handle="true"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.stopPropagation();
              setHoveredPortSide(null);
              onStartResize(card.id, e, "both");
            }}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => handleEdgeFitDoubleClick("both", e)}
            title="Drag or double-click to fit"
            className={cn(
              "absolute bottom-1 right-1 z-20 flex size-4 cursor-nwse-resize select-none items-end justify-end rounded-br-lg p-0.5 transition-opacity hover:[&>span]:border-primary",
              selected || isEditing ? "opacity-90" : "opacity-0 group-hover/card:opacity-100",
            )}
          >
            <span className="size-2 rounded-br-[3px] border-b-2 border-r-2 border-muted-foreground/65 transition-colors" />
          </div>
        </>
      )}
    </div>
  );
});
