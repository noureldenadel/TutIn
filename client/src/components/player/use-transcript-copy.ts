import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { toast } from "sonner";

import { copyTextToClipboard } from "@/lib/clipboard";

export interface CueCopyRange {
  start: number;
  end: number;
}

interface CopyDragState {
  startIdx: number;
  endIdx: number;
}

const COPIED_FEEDBACK_MS = 1400;
const EDGE_SCROLL_ZONE_PX = 36;
const EDGE_SCROLL_MIN_STEP_PX = 4;
const EDGE_SCROLL_MAX_STEP_PX = 14;

export function normalizeCopyRange(startIdx: number, endIdx: number): CueCopyRange {
  return startIdx <= endIdx ? { start: startIdx, end: endIdx } : { start: endIdx, end: startIdx };
}

/**
 * Formats cues in `[startIdx, endIdx]` strictly in chronological order regardless
 * of drag direction (downward or upward).
 */
export function formatTranscriptCueRange(
  cues: ReadonlyArray<{ readonly text: string }>,
  startIdx: number,
  endIdx: number,
): { text: string; count: number } {
  if (cues.length === 0) return { text: "", count: 0 };
  const raw = normalizeCopyRange(startIdx, endIdx);
  const start = Math.max(0, Math.min(raw.start, cues.length - 1));
  const end = Math.max(0, Math.min(raw.end, cues.length - 1));

  const parts: string[] = [];
  for (let i = start; i <= end; i += 1) {
    const normalized = cues[i]!.text.replace(/\s+/g, " ").trim();
    if (normalized) parts.push(normalized);
  }
  return { text: parts.join(" "), count: parts.length };
}

/**
 * Resolves the transcript cue index under a viewport point. Uses direct hit-testing
 * first and falls back to an O(log n) vertical binary search across list rows so
 * inter-row gaps, scrollbars, and horizontal pointer drift stay seamless.
 */
export function resolveCueIndexAtPoint(
  listEl: HTMLElement,
  clientX: number,
  clientY: number,
): number | null {
  const hit = document.elementFromPoint(clientX, clientY);
  const hitRow = hit?.closest<HTMLElement>("[data-cue-idx]");
  if (hitRow && listEl.contains(hitRow)) {
    const idx = Number(hitRow.dataset["cueIdx"]);
    if (Number.isInteger(idx)) return idx;
  }

  const children = listEl.children;
  const len = children.length;
  if (len === 0) return null;

  let low = 0;
  let high = len - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    const child = children[mid] as HTMLElement;
    const rect = child.getBoundingClientRect();
    if (clientY < rect.top) {
      high = mid - 1;
    } else if (clientY > rect.bottom) {
      low = mid + 1;
    } else {
      const idx = Number(child.dataset["cueIdx"]);
      return Number.isInteger(idx) ? idx : mid;
    }
  }

  if (high < 0) {
    const first = children[0] as HTMLElement;
    const idx = Number(first.dataset["cueIdx"]);
    return Number.isInteger(idx) ? idx : 0;
  }
  if (low >= len) {
    const last = children[len - 1] as HTMLElement;
    const idx = Number(last.dataset["cueIdx"]);
    return Number.isInteger(idx) ? idx : len - 1;
  }

  const prevEl = children[high] as HTMLElement;
  const nextEl = children[low] as HTMLElement;
  const distPrev = Math.abs(clientY - prevEl.getBoundingClientRect().bottom);
  const distNext = Math.abs(nextEl.getBoundingClientRect().top - clientY);
  const chosen = distPrev <= distNext ? prevEl : nextEl;
  const idx = Number(chosen.dataset["cueIdx"]);
  return Number.isInteger(idx) ? idx : distPrev <= distNext ? high : low;
}

function computeEdgeScrollStep(listEl: HTMLElement, clientY: number): number {
  const rect = listEl.getBoundingClientRect();
  if (clientY < rect.top + EDGE_SCROLL_ZONE_PX && listEl.scrollTop > 0) {
    const ratio = Math.min(
      1,
      Math.max(0, (rect.top + EDGE_SCROLL_ZONE_PX - clientY) / EDGE_SCROLL_ZONE_PX),
    );
    return -(EDGE_SCROLL_MIN_STEP_PX + ratio * (EDGE_SCROLL_MAX_STEP_PX - EDGE_SCROLL_MIN_STEP_PX));
  }
  const maxScrollTop = listEl.scrollHeight - listEl.clientHeight;
  if (clientY > rect.bottom - EDGE_SCROLL_ZONE_PX && listEl.scrollTop < maxScrollTop) {
    const ratio = Math.min(
      1,
      Math.max(0, (clientY - (rect.bottom - EDGE_SCROLL_ZONE_PX)) / EDGE_SCROLL_ZONE_PX),
    );
    return EDGE_SCROLL_MIN_STEP_PX + ratio * (EDGE_SCROLL_MAX_STEP_PX - EDGE_SCROLL_MIN_STEP_PX);
  }
  return 0;
}

export function useTranscriptCopy(
  cues: ReadonlyArray<{ readonly text: string }>,
  listRef: RefObject<HTMLOListElement | null>,
  isVisible: boolean,
) {
  const [dragState, setDragState] = useState<CopyDragState | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const cuesRef = useRef(cues);
  cuesRef.current = cues;

  const dragStateRef = useRef<CopyDragState | null>(null);
  const isCopyDraggingRef = useRef(false);
  const cleanupDragRef = useRef<(() => void) | null>(null);
  const copiedTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const clearCopiedFeedback = useCallback(() => {
    if (copiedTimerRef.current !== null) {
      window.clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = null;
    }
    setCopiedIdx(null);
  }, []);

  const cancelCopyDrag = useCallback(() => {
    cleanupDragRef.current?.();
    cleanupDragRef.current = null;
    dragStateRef.current = null;
    isCopyDraggingRef.current = false;
    setDragState(null);
  }, []);

  const commitCopyRange = useCallback(async (startIdx: number, endIdx: number) => {
    const currentCues = cuesRef.current;
    const { text, count } = formatTranscriptCueRange(currentCues, startIdx, endIdx);
    if (!text) return;

    const clampedEndIdx = Math.max(0, Math.min(endIdx, currentCues.length - 1));
    try {
      await copyTextToClipboard(text);
      if (!mountedRef.current) return;
      setCopiedIdx(clampedEndIdx);
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
      copiedTimerRef.current = window.setTimeout(() => {
        copiedTimerRef.current = null;
        setCopiedIdx(null);
      }, COPIED_FEEDBACK_MS);
      toast(count > 1 ? `${count} lines copied` : "Copied");
    } catch {
      if (mountedRef.current) {
        toast.error("Could not copy text");
      }
    }
  }, []);

  // Reset active drag or copied badges when cues change or the tab hides.
  useEffect(() => {
    cancelCopyDrag();
    clearCopiedFeedback();
  }, [cues, isVisible, cancelCopyDrag, clearCopiedFeedback]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cleanupDragRef.current?.();
      cleanupDragRef.current = null;
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
        copiedTimerRef.current = null;
      }
    };
  }, []);

  const startCopyDrag = useCallback(
    (cueIdx: number, e: ReactPointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      cleanupDragRef.current?.();
      cleanupDragRef.current = null;

      // Clear any pre-existing text selection inside the transcript list so only
      // the cue copy range is visually active while sweeping.
      const listEl = listRef.current;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && listEl && sel.anchorNode && listEl.contains(sel.anchorNode)) {
        sel.removeAllRanges();
      }

      const initial: CopyDragState = { startIdx: cueIdx, endIdx: cueIdx };
      dragStateRef.current = initial;
      isCopyDraggingRef.current = true;
      setDragState(initial);

      let lastX = e.clientX;
      let lastY = e.clientY;
      let rafId: number | null = null;

      const updateRangeFromPoint = (clientX: number, clientY: number) => {
        const list = listRef.current;
        const current = dragStateRef.current;
        if (!list || !current) return;
        const hoverIdx = resolveCueIndexAtPoint(list, clientX, clientY);
        if (hoverIdx === null || hoverIdx === current.endIdx) return;
        const next: CopyDragState = { startIdx: current.startIdx, endIdx: hoverIdx };
        dragStateRef.current = next;
        setDragState(next);
      };

      const stopEdgeScroll = () => {
        if (rafId !== null) {
          window.cancelAnimationFrame(rafId);
          rafId = null;
        }
      };

      const stepEdgeScroll = () => {
        rafId = null;
        const list = listRef.current;
        if (!list || !dragStateRef.current) return;
        const delta = computeEdgeScrollStep(list, lastY);
        if (delta === 0) return;
        const before = list.scrollTop;
        list.scrollTop = before + delta;
        if (list.scrollTop === before) return;
        updateRangeFromPoint(lastX, lastY);
        rafId = window.requestAnimationFrame(stepEdgeScroll);
      };

      const handlePointerMove = (moveEvent: PointerEvent) => {
        lastX = moveEvent.clientX;
        lastY = moveEvent.clientY;
        updateRangeFromPoint(lastX, lastY);

        const list = listRef.current;
        if (list && computeEdgeScrollStep(list, lastY) !== 0) {
          if (rafId === null) {
            rafId = window.requestAnimationFrame(stepEdgeScroll);
          }
        } else {
          stopEdgeScroll();
        }
      };

      const handleListScroll = () => {
        updateRangeFromPoint(lastX, lastY);
      };

      const teardown = () => {
        stopEdgeScroll();
        listEl?.removeEventListener("scroll", handleListScroll);
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", handleCancel);
        window.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("blur", handleCancel);
      };

      const handlePointerUp = () => {
        const finalDrag = dragStateRef.current;
        cancelCopyDrag();
        if (finalDrag) {
          void commitCopyRange(finalDrag.startIdx, finalDrag.endIdx);
        }
      };

      const handleCancel = () => {
        cancelCopyDrag();
      };

      const handleKeyDown = (keyEvent: KeyboardEvent) => {
        if (keyEvent.key === "Escape") {
          keyEvent.preventDefault();
          cancelCopyDrag();
        }
      };

      cleanupDragRef.current = teardown;
      listEl?.addEventListener("scroll", handleListScroll, { passive: true });
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handleCancel);
      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("blur", handleCancel);
    },
    [cancelCopyDrag, commitCopyRange, listRef],
  );

  const copySingleCue = useCallback(
    (cueIdx: number) => {
      void commitCopyRange(cueIdx, cueIdx);
    },
    [commitCopyRange],
  );

  const activeCopyRange = dragState
    ? normalizeCopyRange(dragState.startIdx, dragState.endIdx)
    : null;

  return {
    activeCopyRange,
    activeCopyEndIdx: dragState ? dragState.endIdx : null,
    copiedIdx,
    isCopyDragging: dragState !== null,
    isCopyDraggingRef,
    startCopyDrag,
    copySingleCue,
  };
}
