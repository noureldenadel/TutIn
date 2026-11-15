import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { CanvasArtboard } from "@/components/canvas/canvas-artboard";
import { CanvasCardView } from "@/components/canvas/canvas-card";
import {
  CanvasContextMenu,
  type CanvasContextMenuTarget,
} from "@/components/canvas/canvas-context-menu";
import { CanvasEdgesLayer } from "@/components/canvas/canvas-edges";
import { CanvasHud } from "@/components/canvas/canvas-hud";
import { CanvasInkLayer } from "@/components/canvas/canvas-ink-layer";
import { CanvasNotesDrawer } from "@/components/canvas/canvas-notes-drawer";
import type { CanvasToolMode } from "@/components/canvas/canvas-tokens";
import { ImageLightboxModal } from "@/components/notes/image-lightbox-modal";
import type { Course } from "@/lib/courses";
import {
  applyCardDropMembership,
  applyCardHeightUpdate,
  CANVAS_CARD_WIDTH,
  CANVAS_GROUP_HEADER_HEIGHT,
  CANVAS_MAX_ZOOM,
  CANVAS_MIN_ZOOM,
  createCanvasId,
  estimateVideoNoteCardHeight,
  fetchCourseCanvas,
  findConnectionTargetCard,
  fitArtboardsToChildren,
  flushPendingCanvasSave,
  formatCanvasLessonCode,
  getVideoNoteCardId,
  hitTestStroke,
  loadCourseCanvas,
  rebuildAllAutoChronoEdges,
  reconcileCanvasWithNotes,
  resetCanvasArrangement,
  resolveCardGroupAtDrop,
  resolveNearestSideOnRect,
  resolveTargetConnectionSide,
  restoreNoteCardToCanvas,
  returnCardToOriginGroup,
  saveCourseCanvas,
  saveCourseViewport,
  tidyAllCanvasArtboards,
  tidySelectedCards,
  tidyVideoArtboard,
  type CanvasCard,
  type CanvasGroup,
  type CanvasSide,
  type CanvasStroke,
  type CanvasStrokeColorToken,
  type CourseCanvasState,
} from "@/lib/course-canvas";
import {
  fetchCourseCurriculum,
  formatTimestamp,
  getCourseLessons,
  subscribeCourseCurriculumChanged,
  type CourseLessonItem,
} from "@/lib/course-lessons";
import {
  fetchCourseNotes,
  getCourseNotes,
  subscribeCourseNotesChanged,
  updateCourseNoteContent,
  type NoteItem,
} from "@/lib/course-notes";
import { copyImageToClipboard } from "@/lib/clipboard";
import {
  extractSameCourseVaultImageUrisFromHtml,
  resolveMediaUrl,
  saveMediaFile,
  verifyVaultMediaExists,
} from "@/lib/media-store";
import { inspectAppContextTarget } from "@/lib/spellcheck";
import { cn } from "@/lib/utils";

const MAX_UNDO_HISTORY = 50;

type HistorySnapshot = Pick<
  CourseCanvasState,
  "groups" | "cards" | "edges" | "strokes" | "dismissedNoteIds"
>;

function snapshotOf(state: CourseCanvasState): HistorySnapshot {
  return {
    groups: state.groups.map((g) => ({ ...g })),
    cards: state.cards.map((c) => ({ ...c })),
    edges: state.edges.map((e) => ({ ...e })),
    strokes: state.strokes.map((s) => ({
      ...s,
      points: s.points.map((pt) => [...pt] as [number, number, number]),
    })),
    dismissedNoteIds: [...state.dismissedNoteIds],
  };
}

function measureImageDimensions(srcUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const targetWidth = Math.min(420, Math.max(220, img.naturalWidth || 320));
      const ratio =
        img.naturalHeight > 0 && img.naturalWidth > 0 ? img.naturalHeight / img.naturalWidth : 0.65;
      resolve({
        width: Math.round(targetWidth),
        height: Math.round(targetWidth * ratio) + 34,
      });
    };
    img.onerror = () => resolve({ width: 320, height: 240 });
    img.src = srcUrl;
  });
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

export function CourseCanvasPage({ course }: { course: Course }) {
  const courseId = String(course.id);
  const [lessons, setLessons] = useState<CourseLessonItem[]>(() => getCourseLessons(courseId));

  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastNotesRevisionRef = useRef(0);
  const canvasHydratedRef = useRef(false);
  const lastSavedSnapshotRef = useRef<CourseCanvasState | null>(null);
  const altUsedInGestureRef = useRef(false);
  const zoomDragRef = useRef<{
    anchorClientX: number;
    anchorClientY: number;
    startZoom: number;
  } | null>(null);
  const [isZoomDragging, setIsZoomDragging] = useState(false);

  const [notes, setNotes] = useState<NoteItem[]>(() => getCourseNotes(courseId));
  const [canvasState, setCanvasState] = useState<CourseCanvasState>(() =>
    reconcileCanvasWithNotes(
      loadCourseCanvas(courseId, lessons),
      getCourseNotes(courseId),
      lessons,
      courseId,
    ),
  );

  // Undo / redo stacks + StrictMode-safe refs
  const [undoStack, setUndoStack] = useState<HistorySnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<HistorySnapshot[]>([]);
  const undoStackRef = useRef<HistorySnapshot[]>([]);
  const redoStackRef = useRef<HistorySnapshot[]>([]);
  const editingCardIdRef = useRef<string | null>(null);
  const editingDraftRef = useRef<{ cardId: string; html: string } | null>(null);
  const editSessionRef = useRef<{
    cardId: string;
    snapshotBefore: HistorySnapshot;
    undoPushed: boolean;
  } | null>(null);
  const draftSaveTimerRef = useRef<number | null>(null);
  const resetEditSession = useCallback(() => {
    if (draftSaveTimerRef.current !== null) {
      window.clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
    editingCardIdRef.current = null;
    editingDraftRef.current = null;
    editSessionRef.current = null;
    setEditingCardId(null);
  }, []);

  // Interaction & UI state
  const [tool, setTool] = useState<CanvasToolMode>("select");
  const [strokeColor, setStrokeColor] = useState<CanvasStrokeColorToken>("ink");
  const [penSize, setPenSize] = useState(5);
  const [highlighterSize, setHighlighterSize] = useState(24);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(() => new Set());
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(() => new Set());
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [dropTargetGroupId, setDropTargetGroupId] = useState<string | null>(null);

  const [spacePressed, setSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [isDraggingSelection, setIsDraggingSelection] = useState(false);
  const [marqueeRect, setMarqueeRect] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const [activeStroke, setActiveStroke] = useState<CanvasStroke | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<{
    cardId: string;
    fromSide?: CanvasSide | undefined;
    startClient: { x: number; y: number };
    pointerWorld: { x: number; y: number };
  } | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{
    src: string;
    label: string;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<CanvasContextMenuTarget | null>(null);
  const contextMenuRef = useRef<CanvasContextMenuTarget | null>(null);
  contextMenuRef.current = contextMenu;
  const [renameGroupSignal, setRenameGroupSignal] = useState<{
    groupId: string;
    seq: number;
  } | null>(null);

  // Mutable gesture refs for high-frequency pointer handling
  const stateRef = useRef(canvasState);
  stateRef.current = canvasState;
  const selectedCardIdsRef = useRef(selectedCardIds);
  selectedCardIdsRef.current = selectedCardIds;
  const selectedGroupIdsRef = useRef(selectedGroupIds);
  selectedGroupIdsRef.current = selectedGroupIds;

  const panGestureRef = useRef<{
    startClientX: number;
    startClientY: number;
    origPanX: number;
    origPanY: number;
  } | null>(null);

  const dragCardsRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startWorldX: number;
    startWorldY: number;
    initialPositions: Map<string, { x: number; y: number }>;
    groupOrigPositions: Map<string, { x: number; y: number }>;
    strokeOrigPoints: Map<string, [number, number, number][]>;
    primaryCardId: string;
    snapshotBefore: HistorySnapshot;
    moved: boolean;
    wasSoleSelectedAtDown: boolean;
    shiftKey: boolean;
    allowClickEdit: boolean;
  } | null>(null);

  const dragGroupRef = useRef<{
    groupId: string;
    startWorldX: number;
    startWorldY: number;
    groupOrigPositions: Map<string, { x: number; y: number }>;
    childOrigPositions: Map<string, { x: number; y: number }>;
    strokeOrigPoints: Map<string, [number, number, number][]>;
    snapshotBefore: HistorySnapshot;
    moved: boolean;
    shiftKey: boolean;
  } | null>(null);

  const resizeGestureRef = useRef<{
    kind: "card" | "group";
    id: string;
    axis: "both" | "width" | "height";
    startWorldX: number;
    startWorldY: number;
    origW: number;
    origH: number;
    snapshotBefore: HistorySnapshot;
    changed: boolean;
  } | null>(null);

  const marqueeRef = useRef<{
    startClientX: number;
    startClientY: number;
    startWorldX: number;
    startWorldY: number;
    initialCardIds: Set<string>;
    initialGroupIds: Set<string>;
  } | null>(null);

  const eraseSweepRef = useRef<{
    snapshotBefore: HistorySnapshot;
    erasedAny: boolean;
  } | null>(null);

  // Hydrate real curriculum, notes, and Canvas v2 state from SQLite + .tutin/canvas.json
  useEffect(() => {
    let cancelled = false;
    canvasHydratedRef.current = false;
    undoStackRef.current = [];
    redoStackRef.current = [];
    setUndoStack([]);
    setRedoStack([]);
    setSelectedCardIds(new Set());
    setSelectedGroupIds(new Set());
    setSelectedEdgeId(null);
    resetEditSession();

    void (async () => {
      try {
        const curr = await fetchCourseCurriculum(courseId);
        if (cancelled) return;
        const [loadedNotes, loadedCanvas] = await Promise.all([
          fetchCourseNotes(courseId, curr.lessons),
          fetchCourseCanvas(courseId, curr.lessons),
        ]);
        if (cancelled) return;
        setLessons(curr.lessons);
        setNotes(loadedNotes);
        const reconciled = reconcileCanvasWithNotes(
          loadedCanvas,
          loadedNotes,
          curr.lessons,
          courseId,
        );
        lastSavedSnapshotRef.current = reconciled;
        setCanvasState(reconciled);
        canvasHydratedRef.current = true;
      } catch (err) {
        console.error("[CourseCanvas] Failed to hydrate from server:", err);
        canvasHydratedRef.current = true;
      }
    })();

    const unsubCurr = subscribeCourseCurriculumChanged(courseId, (data) => {
      if (!cancelled) setLessons(data.lessons);
    });

    return () => {
      cancelled = true;
      unsubCurr();
    };
  }, [courseId, resetEditSession]);

  // Subscribe to Player note updates & cross-tab updates
  useEffect(() => {
    return subscribeCourseNotesChanged(courseId, (nextNotes, meta) => {
      if (meta?.source === "canvas") return;
      lastNotesRevisionRef.current += 1;
      setNotes(nextNotes);
      setCanvasState((prev) =>
        reconcileCanvasWithNotes(prev, nextNotes, lessons, courseId, lastNotesRevisionRef.current),
      );
    });
  }, [courseId, lessons]);

  // Debounced auto-save to server SQLite & .tutin/canvas.json (or lightweight viewport PATCH)
  useEffect(() => {
    if (!canvasHydratedRef.current) return;
    const saved = lastSavedSnapshotRef.current;
    const structureDirty =
      !saved ||
      canvasState.groups !== saved.groups ||
      canvasState.cards !== saved.cards ||
      canvasState.edges !== saved.edges ||
      canvasState.strokes !== saved.strokes ||
      canvasState.dismissedNoteIds !== saved.dismissedNoteIds;
    const viewportDirty = !saved || canvasState.viewport !== saved.viewport;

    if (!structureDirty && !viewportDirty) return;

    if (structureDirty) {
      const timer = window.setTimeout(() => {
        const current = stateRef.current;
        saveCourseCanvas(current);
        lastSavedSnapshotRef.current = current;
      }, 180);
      return () => window.clearTimeout(timer);
    }

    const vpTimer = window.setTimeout(() => {
      const current = stateRef.current;
      saveCourseViewport(courseId, current.viewport);
      lastSavedSnapshotRef.current = current;
    }, 180);
    return () => window.clearTimeout(vpTimer);
  }, [canvasState, courseId]);

  useEffect(() => {
    const flush = () => {
      if (draftSaveTimerRef.current !== null) {
        window.clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
      if (!canvasHydratedRef.current) return;
      const pending = editingDraftRef.current;
      if (pending) {
        const card = stateRef.current.cards.find((c) => c.id === pending.cardId);
        if (card && pending.html !== card.htmlContent) {
          const estimatedHeight = estimateVideoNoteCardHeight(pending.html, 0, card.width);
          stateRef.current = applyCardHeightUpdate(
            stateRef.current,
            pending.cardId,
            estimatedHeight,
            pending.html,
          );
          if (card.type === "video-note" && card.noteId) {
            updateCourseNoteContent(courseId, card.noteId, pending.html, {
              source: "canvas",
            });
          }
        }
      }
      const current = stateRef.current;
      const saved = lastSavedSnapshotRef.current;
      const structureDirty =
        !saved ||
        current.groups !== saved.groups ||
        current.cards !== saved.cards ||
        current.edges !== saved.edges ||
        current.strokes !== saved.strokes ||
        current.dismissedNoteIds !== saved.dismissedNoteIds;
      const viewportDirty = !saved || current.viewport !== saved.viewport;

      if (structureDirty) {
        saveCourseCanvas(current);
        lastSavedSnapshotRef.current = current;
      } else if (viewportDirty) {
        saveCourseViewport(courseId, current.viewport);
        lastSavedSnapshotRef.current = current;
      }
      flushPendingCanvasSave(courseId);
    };
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, [courseId, resetEditSession]);

  const syncRevertedVideoNoteContents = useCallback(
    (prevCards: CanvasCard[], nextCards: CanvasCard[]) => {
      const prevHtmlByNoteId = new Map<string, string>();
      for (const c of prevCards) {
        if (c.type === "video-note" && c.noteId) {
          prevHtmlByNoteId.set(c.noteId, c.htmlContent);
        }
      }
      let latestNotes: NoteItem[] | null = null;
      for (const c of nextCards) {
        if (c.type === "video-note" && c.noteId) {
          const prevHtml = prevHtmlByNoteId.get(c.noteId);
          if (prevHtml !== undefined && prevHtml !== c.htmlContent) {
            lastNotesRevisionRef.current += 1;
            latestNotes = updateCourseNoteContent(courseId, c.noteId, c.htmlContent, {
              source: "canvas",
            });
          }
        }
      }
      if (latestNotes) {
        setNotes(latestNotes);
      }
    },
    [courseId],
  );

  const pushHistorySnapshot = useCallback((snapshot: HistorySnapshot) => {
    const nextUndo = [...undoStackRef.current.slice(-(MAX_UNDO_HISTORY - 1)), snapshot];
    undoStackRef.current = nextUndo;
    redoStackRef.current = [];
    setUndoStack(nextUndo);
    setRedoStack([]);
  }, []);

  const applyWithUndo = useCallback(
    (updater: (prev: CourseCanvasState) => CourseCanvasState) => {
      const prev = stateRef.current;
      const next = updater(prev);
      if (next === prev) return;
      pushHistorySnapshot(snapshotOf(prev));
      stateRef.current = next;
      setCanvasState(next);
    },
    [pushHistorySnapshot],
  );

  const handleUndo = useCallback(() => {
    resetEditSession();
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    const snap = stack[stack.length - 1]!;
    const currentSnap = snapshotOf(stateRef.current);
    const nextUndo = stack.slice(0, -1);
    const nextRedo = [...redoStackRef.current.slice(-(MAX_UNDO_HISTORY - 1)), currentSnap];
    undoStackRef.current = nextUndo;
    redoStackRef.current = nextRedo;
    setUndoStack(nextUndo);
    setRedoStack(nextRedo);
    syncRevertedVideoNoteContents(currentSnap.cards, snap.cards);
    stateRef.current = { ...stateRef.current, ...snap };
    setCanvasState((curr) => ({ ...curr, ...snap }));
  }, [resetEditSession, syncRevertedVideoNoteContents]);

  const handleRedo = useCallback(() => {
    resetEditSession();
    const stack = redoStackRef.current;
    if (stack.length === 0) return;
    const snap = stack[stack.length - 1]!;
    const currentSnap = snapshotOf(stateRef.current);
    const nextRedo = stack.slice(0, -1);
    const nextUndo = [...undoStackRef.current.slice(-(MAX_UNDO_HISTORY - 1)), currentSnap];
    undoStackRef.current = nextUndo;
    redoStackRef.current = nextRedo;
    setUndoStack(nextUndo);
    setRedoStack(nextRedo);
    syncRevertedVideoNoteContents(currentSnap.cards, snap.cards);
    stateRef.current = { ...stateRef.current, ...snap };
    setCanvasState((curr) => ({ ...curr, ...snap }));
  }, [resetEditSession, syncRevertedVideoNoteContents]);

  const screenToWorld = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const vp = stateRef.current.viewport;
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - vp.x) / vp.zoom,
      y: (clientY - rect.top - vp.y) / vp.zoom,
    };
  }, []);

  const zoomAroundScreenPoint = useCallback(
    (clientX: number, clientY: number, nextZoom: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const clampedZoom = Math.max(CANVAS_MIN_ZOOM, Math.min(CANVAS_MAX_ZOOM, nextZoom));
      setCanvasState((prev) => {
        const sx = clientX - rect.left;
        const sy = clientY - rect.top;
        const wx = (sx - prev.viewport.x) / prev.viewport.zoom;
        const wy = (sy - prev.viewport.y) / prev.viewport.zoom;
        return {
          ...prev,
          viewport: {
            x: sx - wx * clampedZoom,
            y: sy - wy * clampedZoom,
            zoom: clampedZoom,
          },
        };
      });
    },
    [],
  );

  const centerViewportZoom = useCallback(
    (factor: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      zoomAroundScreenPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
        stateRef.current.viewport.zoom * factor,
      );
    },
    [zoomAroundScreenPoint],
  );

  const resetView = useCallback(() => {
    setCanvasState((prev) => ({
      ...prev,
      viewport: { x: 40, y: 30, zoom: 1 },
    }));
  }, []);

  const focusCard = useCallback((cardId: string) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const card = stateRef.current.cards.find((c) => c.id === cardId);
    if (!rect || !card) return;
    const targetZoom = Math.max(0.85, Math.min(1.15, stateRef.current.viewport.zoom));
    const centerX = card.x + card.width / 2;
    const centerY = card.y + card.height / 2;
    setCanvasState((prev) => ({
      ...prev,
      viewport: {
        x: rect.width / 2 - centerX * targetZoom,
        y: rect.height / 2 - centerY * targetZoom,
        zoom: targetZoom,
      },
    }));
    setSelectedCardIds(new Set([cardId]));
    setSelectedGroupIds(new Set());
    setSelectedEdgeId(null);
  }, []);

  const persistCardDraft = useCallback(
    (cardId: string, html: string, { updateLayout }: { updateLayout: boolean }) => {
      if (draftSaveTimerRef.current !== null) {
        window.clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
      const card = stateRef.current.cards.find((c) => c.id === cardId);
      if (!card) return;

      const contentChanged = html !== card.htmlContent;
      if (contentChanged) {
        if (editSessionRef.current?.cardId === cardId) {
          if (!editSessionRef.current.undoPushed) {
            pushHistorySnapshot(editSessionRef.current.snapshotBefore);
            editSessionRef.current.undoPushed = true;
          }
        } else {
          pushHistorySnapshot(snapshotOf(stateRef.current));
        }
      }

      if (updateLayout) {
        if (!contentChanged) return;
        const estimatedHeight = estimateVideoNoteCardHeight(html, 0, card.width);
        setCanvasState((prev) => applyCardHeightUpdate(prev, cardId, estimatedHeight, html));
      } else if (contentChanged) {
        const now = Date.now();
        setCanvasState((prev) => ({
          ...prev,
          cards: prev.cards.map((c) =>
            c.id === cardId ? { ...c, htmlContent: html, updatedAt: now } : c,
          ),
        }));
      }

      // Two-way live sync back to Video Player NotesTab (Option A)
      if (contentChanged && card.type === "video-note" && card.noteId) {
        lastNotesRevisionRef.current += 1;
        const nextNotes = updateCourseNoteContent(courseId, card.noteId, html, {
          source: "canvas",
        });
        setNotes(nextNotes);
      }
    },
    [courseId, pushHistorySnapshot],
  );

  const commitPendingEdit = useCallback(() => {
    if (draftSaveTimerRef.current !== null) {
      window.clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
    const activeId = editingCardIdRef.current;
    if (!activeId) return;

    const pending = editingDraftRef.current;
    editingCardIdRef.current = null;
    editingDraftRef.current = null;

    if (pending && pending.cardId === activeId) {
      persistCardDraft(activeId, pending.html, { updateLayout: true });
    }
    editSessionRef.current = null;
    setEditingCardId(null);
  }, [persistCardDraft]);

  const startEditingCard = useCallback(
    (cardId: string) => {
      if (editingCardIdRef.current && editingCardIdRef.current !== cardId) {
        commitPendingEdit();
      }
      const card = stateRef.current.cards.find((c) => c.id === cardId);
      if (!card || card.type === "image") return;

      const nextSelected = new Set([cardId]);
      selectedCardIdsRef.current = nextSelected;
      setSelectedCardIds(nextSelected);
      selectedGroupIdsRef.current = new Set();
      setSelectedGroupIds(new Set());
      setSelectedEdgeId(null);
      editingCardIdRef.current = cardId;
      editSessionRef.current = {
        cardId,
        snapshotBefore: snapshotOf(stateRef.current),
        undoPushed: false,
      };
      editingDraftRef.current = { cardId, html: card.htmlContent };
      setEditingCardId(cardId);
    },
    [commitPendingEdit],
  );

  const handleDraftChange = useCallback(
    (cardId: string, html: string) => {
      editingDraftRef.current = { cardId, html };
      if (draftSaveTimerRef.current !== null) {
        window.clearTimeout(draftSaveTimerRef.current);
      }
      draftSaveTimerRef.current = window.setTimeout(() => {
        draftSaveTimerRef.current = null;
        persistCardDraft(cardId, html, { updateLayout: false });
      }, 220);
    },
    [persistCardDraft],
  );

  // Auto-save and exit edit mode whenever clicking outside the editing card (Obsidian-style)
  useEffect(() => {
    if (!editingCardId) return;
    const onWindowPointerDown = (e: PointerEvent) => {
      if (!(e.target instanceof Element)) return;
      if (e.target.closest('[data-canvas-context-menu="true"]')) return;
      const cardEl = e.target.closest("[data-canvas-card-id]");
      if (cardEl?.getAttribute("data-canvas-card-id") === editingCardId) return;
      commitPendingEdit();
    };
    window.addEventListener("pointerdown", onWindowPointerDown, true);
    return () => window.removeEventListener("pointerdown", onWindowPointerDown, true);
  }, [editingCardId, commitPendingEdit]);

  // Dismiss open context menu when clicking elsewhere
  useEffect(() => {
    if (!contextMenu) return;
    const onWindowPointerDown = (e: PointerEvent) => {
      if (e.target instanceof Element && e.target.closest('[data-canvas-context-menu="true"]')) {
        return;
      }
      setContextMenu(null);
    };
    window.addEventListener("pointerdown", onWindowPointerDown, true);
    return () => window.removeEventListener("pointerdown", onWindowPointerDown, true);
  }, [contextMenu]);

  const spawnCardAt = useCallback(
    (type: "canvas-note" | "text", worldX: number, worldY: number) => {
      commitPendingEdit();
      const width = type === "text" ? 260 : CANVAS_CARD_WIDTH;
      const height = type === "text" ? 72 : 148;
      const draftCard: CanvasCard = {
        id: createCanvasId(type === "text" ? "text" : "ccard"),
        type,
        groupId: null,
        membershipState: "canvas-only",
        isCanvasOnly: true,
        x: Math.round(worldX - width / 2),
        y: Math.round(worldY - height / 2),
        width,
        height,
        htmlContent: "<p></p>",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const targetGroup = resolveCardGroupAtDrop(draftCard, stateRef.current.groups);
      draftCard.groupId = targetGroup?.id ?? null;

      applyWithUndo((prev) => ({
        ...prev,
        cards: [...prev.cards, draftCard],
      }));
      startEditingCard(draftCard.id);
      setTool("select");
    },
    [applyWithUndo, commitPendingEdit, startEditingCard],
  );

  const insertImageMediaUriAt = useCallback(
    async (mediaUri: string, worldX: number, worldY: number) => {
      const resolvedUrl = await resolveMediaUrl(mediaUri);
      const dims = await measureImageDimensions(resolvedUrl);

      const imgCard: CanvasCard = {
        id: createCanvasId("img"),
        type: "image",
        groupId: null,
        membershipState: "canvas-only",
        isCanvasOnly: true,
        x: Math.round(worldX - dims.width / 2),
        y: Math.round(worldY - dims.height / 2),
        width: dims.width,
        height: dims.height,
        htmlContent: "",
        imageSrc: mediaUri,
        caption: "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const targetGroup = resolveCardGroupAtDrop(imgCard, stateRef.current.groups);
      imgCard.groupId = targetGroup?.id ?? null;

      applyWithUndo((prev) => ({
        ...prev,
        cards: [...prev.cards, imgCard],
      }));
      setSelectedCardIds(new Set([imgCard.id]));
      setTool("select");
    },
    [applyWithUndo],
  );

  const insertImageFileAt = useCallback(
    async (file: File, worldX: number, worldY: number) => {
      try {
        const mediaUri = await saveMediaFile(file, courseId);
        await insertImageMediaUriAt(mediaUri, worldX, worldY);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to insert image.");
      }
    },
    [courseId, insertImageMediaUriAt],
  );

  const insertCustomArtboardAt = useCallback(
    (worldX?: number, worldY?: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      const vp = stateRef.current.viewport;
      const cx = worldX ?? (rect ? (rect.width / 2 - vp.x) / vp.zoom : 240);
      const cy = worldY ?? (rect ? (rect.height / 2 - vp.y) / vp.zoom : 200);

      const newGroup: CanvasGroup = {
        id: createCanvasId("cgroup"),
        type: "custom-artboard",
        title: "New group",
        x: Math.round(cx - 190),
        y: Math.round(cy - 140),
        width: 380,
        height: 280,
        tintIndex: stateRef.current.groups.length % 5,
        layoutMode: "custom",
        collapsed: false,
      };

      applyWithUndo((prev) => ({
        ...prev,
        groups: [...prev.groups, newGroup],
      }));
      const nextGroups = new Set([newGroup.id]);
      selectedGroupIdsRef.current = nextGroups;
      setSelectedGroupIds(nextGroups);
      selectedCardIdsRef.current = new Set();
      setSelectedCardIds(new Set());
      setSelectedEdgeId(null);
      setTool("select");
    },
    [applyWithUndo],
  );

  const insertCustomArtboard = useCallback(() => {
    insertCustomArtboardAt();
  }, [insertCustomArtboardAt]);

  const restoreNoteToCanvas = useCallback(
    (noteId: string) => {
      const note = notes.find((n) => n.id === noteId);
      if (!note) return;

      applyWithUndo((prev) => restoreNoteCardToCanvas(prev, note, lessons));

      const cardId =
        stateRef.current.cards.find((c) => c.noteId === noteId)?.id ?? getVideoNoteCardId(noteId);
      requestAnimationFrame(() => focusCard(cardId));
    },
    [notes, lessons, applyWithUndo, focusCard],
  );

  const deleteSelectionByIds = useCallback(
    (cardIdsToRemove: Set<string>, groupIdsToRemove: Set<string>) => {
      if (cardIdsToRemove.size === 0 && groupIdsToRemove.size === 0) return;

      const cards = stateRef.current.cards.filter((c) => cardIdsToRemove.has(c.id));
      const hiddenVideoNoteIds = cards
        .filter((c) => c.type === "video-note" && c.noteId)
        .map((c) => c.noteId!);

      applyWithUndo((prev) => {
        const nextGroups = prev.groups.filter((g) => !groupIdsToRemove.has(g.id));
        const nextCards = prev.cards
          .filter((c) => !cardIdsToRemove.has(c.id))
          .map((c) =>
            c.groupId && groupIdsToRemove.has(c.groupId)
              ? {
                  ...c,
                  groupId: null,
                  membershipState: c.isCanvasOnly
                    ? ("canvas-only" as const)
                    : ("detached" as const),
                }
              : c,
          );
        const nextStrokes =
          groupIdsToRemove.size > 0
            ? prev.strokes.map((s) =>
                s.parentGroupId && groupIdsToRemove.has(s.parentGroupId)
                  ? { ...s, parentGroupId: null }
                  : s,
              )
            : prev.strokes;
        const nextDismissed = Array.from(
          new Set([...prev.dismissedNoteIds, ...hiddenVideoNoteIds]),
        );
        return {
          ...prev,
          groups: nextGroups,
          cards: nextCards,
          strokes: nextStrokes,
          dismissedNoteIds: nextDismissed,
          edges: rebuildAllAutoChronoEdges(nextGroups, nextCards, prev.edges),
        };
      });

      if (cardIdsToRemove.size > 0) {
        setSelectedCardIds((curr) => {
          const next = new Set<string>();
          for (const id of curr) {
            if (!cardIdsToRemove.has(id)) next.add(id);
          }
          selectedCardIdsRef.current = next;
          return next;
        });
        if (editingCardIdRef.current && cardIdsToRemove.has(editingCardIdRef.current)) {
          resetEditSession();
        }
      }

      if (groupIdsToRemove.size > 0) {
        setSelectedGroupIds((curr) => {
          const next = new Set<string>();
          for (const id of curr) {
            if (!groupIdsToRemove.has(id)) next.add(id);
          }
          selectedGroupIdsRef.current = next;
          return next;
        });
      }

      if (hiddenVideoNoteIds.length > 0) {
        const firstNoteId = hiddenVideoNoteIds[0]!;
        toast("Removed from canvas (kept in lesson notes)", {
          action: {
            label: "Undo",
            onClick: () => {
              if (hiddenVideoNoteIds.length === 1) {
                restoreNoteToCanvas(firstNoteId);
              } else {
                handleUndo();
              }
            },
          },
        });
      }
    },
    [applyWithUndo, handleUndo, resetEditSession, restoreNoteToCanvas],
  );

  const deleteCardsByIds = useCallback(
    (cardIdsToRemove: Set<string>) => deleteSelectionByIds(cardIdsToRemove, new Set()),
    [deleteSelectionByIds],
  );

  const deleteGroupsByIds = useCallback(
    (groupIdsToRemove: Set<string>) => deleteSelectionByIds(new Set(), groupIdsToRemove),
    [deleteSelectionByIds],
  );

  const handleReturnCardToOrigin = useCallback(
    (cardId: string) => {
      applyWithUndo((prev) => returnCardToOriginGroup(prev, cardId, lessons));
      toast("Returned to lesson artboard");
    },
    [applyWithUndo, lessons],
  );

  const updateCardsAccent = useCallback(
    (cardIds: string[], accentIndex: number | undefined) => {
      const targetSet = new Set(cardIds);
      if (targetSet.size === 0) return;
      applyWithUndo((prev) => ({
        ...prev,
        cards: prev.cards.map((c) => (targetSet.has(c.id) ? { ...c, accentIndex } : c)),
      }));
    },
    [applyWithUndo],
  );

  const finishConnection = useCallback(
    (fromId: string, targetCardId: string, fromSide?: CanvasSide, toSide?: CanvasSide) => {
      if (fromId === targetCardId) return;
      const duplicate = stateRef.current.edges.some(
        (e) => e.edgeKind === "manual" && e.fromId === fromId && e.toId === targetCardId,
      );
      if (!duplicate) {
        applyWithUndo((prev) => ({
          ...prev,
          edges: [
            ...prev.edges,
            {
              id: createCanvasId("cedge"),
              edgeKind: "manual",
              fromId,
              toId: targetCardId,
              fromSide,
              toSide,
              style: "solid",
              createdAt: Date.now(),
            },
          ],
        }));
      }
    },
    [applyWithUndo],
  );

  const handleCompleteConnect = useCallback(
    (targetCardId: string, ev: React.PointerEvent, explicitSide?: CanvasSide) => {
      const wp = screenToWorld(ev.clientX, ev.clientY);
      const targetCard = stateRef.current.cards.find((c) => c.id === targetCardId);

      if (!connectingFrom) {
        const resolvedFromSide =
          explicitSide ?? (targetCard ? resolveNearestSideOnRect(targetCard, wp) : undefined);
        setConnectingFrom({
          cardId: targetCardId,
          fromSide: resolvedFromSide,
          startClient: { x: ev.clientX, y: ev.clientY },
          pointerWorld: wp,
        });
        return;
      }

      if (connectingFrom.cardId === targetCardId) {
        setConnectingFrom(null);
        return;
      }

      const fromCard = stateRef.current.cards.find((c) => c.id === connectingFrom.cardId);
      const resolvedToSide =
        explicitSide ??
        (fromCard && targetCard
          ? resolveTargetConnectionSide(fromCard, connectingFrom.fromSide, targetCard, wp)
          : undefined);

      finishConnection(
        connectingFrom.cardId,
        targetCardId,
        connectingFrom.fromSide,
        resolvedToSide,
      );
      setConnectingFrom(null);
      setTool("select");
    },
    [connectingFrom, finishConnection, screenToWorld],
  );

  // Global keyboard shortcuts with editable element protection
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (contextMenuRef.current) {
          setContextMenu(null);
          return;
        }
        if (lightboxImage) {
          setLightboxImage(null);
          return;
        }
        if (connectingFrom) {
          setConnectingFrom(null);
          return;
        }
        if (editingCardIdRef.current) {
          commitPendingEdit();
          return;
        }
        setSelectedCardIds(new Set());
        setSelectedGroupIds(new Set());
        setSelectedEdgeId(null);
        setTool("select");
        return;
      }

      if (isEditableElement(e.target)) return;

      if (
        e.key === "Enter" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !e.shiftKey &&
        selectedCardIds.size === 1
      ) {
        const [onlyId] = Array.from(selectedCardIds);
        const targetCard = onlyId ? stateRef.current.cards.find((c) => c.id === onlyId) : undefined;
        if (targetCard && targetCard.type !== "image") {
          e.preventDefault();
          startEditingCard(targetCard.id);
          return;
        }
      }

      if (e.code === "Space") {
        e.preventDefault();
        setSpacePressed(true);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
        return;
      }

      if (
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === "c" &&
        selectedCardIds.size === 1 &&
        !window.getSelection()?.toString()
      ) {
        const selectedId = Array.from(selectedCardIds)[0];
        const card = stateRef.current.cards.find((c) => c.id === selectedId);
        if (card?.type === "image" && card.imageSrc) {
          e.preventDefault();
          void resolveMediaUrl(card.imageSrc)
            .then((resolved) => copyImageToClipboard(resolved))
            .then(() => toast("Image copied"))
            .catch(() => toast.error("Could not copy image."));
          return;
        }
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedEdgeId) {
          e.preventDefault();
          applyWithUndo((prev) => ({
            ...prev,
            edges: prev.edges.filter((edge) => edge.id !== selectedEdgeId),
          }));
          setSelectedEdgeId(null);
          return;
        }
        if (selectedCardIds.size > 0 || selectedGroupIds.size > 0) {
          e.preventDefault();
          deleteSelectionByIds(selectedCardIds, selectedGroupIds);
          return;
        }
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;

      switch (e.key.toLowerCase()) {
        case "v":
          setTool("select");
          break;
        case "h":
          setTool("pan");
          break;
        case "n":
          setTool("note");
          break;
        case "t":
          setTool("text");
          break;
        case "a":
          setTool("connect");
          break;
        case "p":
          setTool("pen");
          break;
        case "m":
          setTool("highlighter");
          break;
        case "e":
          setTool("eraser");
          break;
        case "i":
          fileInputRef.current?.click();
          break;
        case "g":
          insertCustomArtboard();
          break;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpacePressed(false);
      if (e.key === "Alt" && altUsedInGestureRef.current) {
        e.preventDefault();
        altUsedInGestureRef.current = false;
      }
    };

    const onBlur = () => {
      setSpacePressed(false);
      altUsedInGestureRef.current = false;
      zoomDragRef.current = null;
      setIsZoomDragging(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [
    applyWithUndo,
    commitPendingEdit,
    connectingFrom,
    deleteSelectionByIds,
    handleRedo,
    handleUndo,
    insertCustomArtboard,
    lightboxImage,
    selectedCardIds,
    selectedEdgeId,
    selectedGroupIds,
    startEditingCard,
  ]);

  // Clipboard image paste onto open canvas
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isEditableElement(e.target) || editingCardId) return;
      const rawHtml = e.clipboardData?.getData("text/html") ?? "";
      const items = e.clipboardData?.items ? Array.from(e.clipboardData.items) : [];
      const pastedFiles = items
        .filter((item) => item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));

      const sameCourseUris = rawHtml
        ? extractSameCourseVaultImageUrisFromHtml(rawHtml, courseId)
        : null;
      if ((!sameCourseUris || sameCourseUris.length === 0) && pastedFiles.length === 0) return;

      e.preventDefault();
      const rect = containerRef.current?.getBoundingClientRect();
      const vp = stateRef.current.viewport;
      const cx = rect ? (rect.width / 2 - vp.x) / vp.zoom : 240;
      const cy = rect ? (rect.height / 2 - vp.y) / vp.zoom : 200;

      if (sameCourseUris && sameCourseUris.length > 0) {
        void (async () => {
          const checks = await Promise.all(
            sameCourseUris.map((uri) => verifyVaultMediaExists(uri)),
          );
          if (checks.every(Boolean)) {
            for (let i = 0; i < sameCourseUris.length; i++) {
              await insertImageMediaUriAt(sameCourseUris[i]!, cx + i * 36, cy + i * 36);
            }
            return;
          }
          if (pastedFiles.length > 0) {
            await insertImageFileAt(pastedFiles[0]!, cx, cy);
          }
        })().catch((err) => {
          toast.error(err instanceof Error ? err.message : "Failed to paste image.");
        });
        return;
      }

      if (pastedFiles.length > 0) {
        void insertImageFileAt(pastedFiles[0]!, cx, cy);
      }
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [courseId, editingCardId, insertImageFileAt, insertImageMediaUriAt]);

  // Native non-passive wheel listener for responsive zoom (Alt + wheel) and pan
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const normalizeWheelDelta = (delta: number, deltaMode: number, pageSize: number): number => {
      if (deltaMode === WheelEvent.DOM_DELTA_LINE) return delta * 33;
      if (deltaMode === WheelEvent.DOM_DELTA_PAGE) return delta * (pageSize || 800);
      return delta;
    };

    const onWheel = (e: WheelEvent) => {
      if (e.target instanceof Element && e.target.closest('[data-canvas-ui="true"]')) return;
      e.preventDefault();
      if (contextMenuRef.current) {
        setContextMenu(null);
      }

      const normX = normalizeWheelDelta(e.deltaX, e.deltaMode, el.clientWidth);
      const normY = normalizeWheelDelta(e.deltaY, e.deltaMode, el.clientHeight);

      if (e.altKey) {
        altUsedInGestureRef.current = true;
        // Support Alt + Shift + vertical wheel (reported as deltaX in Chromium)
        const dominantDelta = Math.abs(normY) >= Math.abs(normX) ? normY : normX;
        const clampedDelta = Math.max(-240, Math.min(240, dominantDelta));
        const zoomFactor = Math.exp(-clampedDelta * 0.0022);
        zoomAroundScreenPoint(e.clientX, e.clientY, stateRef.current.viewport.zoom * zoomFactor);
        return;
      }

      // Ignore Ctrl/Meta + wheel so browser/trackpad pinch never pans the canvas unexpectedly
      if (e.ctrlKey || e.metaKey) return;

      setCanvasState((prev) => ({
        ...prev,
        viewport: {
          ...prev.viewport,
          x: prev.viewport.x - normX,
          y: prev.viewport.y - normY,
        },
      }));
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAroundScreenPoint]);

  const isInkTool = tool === "pen" || tool === "highlighter" || tool === "eraser";
  const stageInterceptsCards =
    isInkTool || tool === "pan" || spacePressed || tool === "note" || tool === "text";

  const handleStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target instanceof Element && e.target.closest('[data-canvas-ui="true"]')) return;
    commitPendingEdit();

    // Alt + Middle button (scroll-wheel drag) -> scrub-zoom around press anchor
    if (e.altKey && e.button === 1) {
      e.preventDefault();
      altUsedInGestureRef.current = true;
      setIsZoomDragging(true);
      zoomDragRef.current = {
        anchorClientX: e.clientX,
        anchorClientY: e.clientY,
        startZoom: stateRef.current.viewport.zoom,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    // Middle button or Space or Pan tool -> pan canvas
    if (e.button === 1 || spacePressed || tool === "pan") {
      e.preventDefault();
      setIsPanning(true);
      panGestureRef.current = {
        startClientX: e.clientX,
        startClientY: e.clientY,
        origPanX: canvasState.viewport.x,
        origPanY: canvasState.viewport.y,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    if (e.button !== 0) return;

    const worldPt = screenToWorld(e.clientX, e.clientY);

    if (tool === "pen" || tool === "highlighter") {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const enclosingGroup = canvasState.groups.find(
        (g) =>
          !g.collapsed &&
          worldPt.x >= g.x &&
          worldPt.x <= g.x + g.width &&
          worldPt.y >= g.y &&
          worldPt.y <= g.y + g.height,
      );
      setActiveStroke({
        id: createCanvasId("stroke"),
        tool,
        points: [[worldPt.x, worldPt.y, e.pressure > 0 ? e.pressure : 0.5]],
        colorToken: strokeColor,
        size: tool === "highlighter" ? highlighterSize : penSize,
        parentGroupId: enclosingGroup?.id ?? null,
      });
      return;
    }

    if (tool === "eraser") {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const snapBefore = snapshotOf(stateRef.current);
      const radiusWorld = 12 / stateRef.current.viewport.zoom;
      const survivors = stateRef.current.strokes.filter(
        (s) => !hitTestStroke(s, worldPt.x, worldPt.y, radiusWorld),
      );
      const hitNow = survivors.length !== stateRef.current.strokes.length;
      eraseSweepRef.current = { snapshotBefore: snapBefore, erasedAny: hitNow };
      if (hitNow) {
        setCanvasState((prev) => ({ ...prev, strokes: survivors }));
      }
      return;
    }

    if (tool === "note" || tool === "text") {
      spawnCardAt(tool === "note" ? "canvas-note" : "text", worldPt.x, worldPt.y);
      return;
    }

    // Background click in Select / Connect
    if (connectingFrom) {
      setConnectingFrom(null);
      return;
    }

    if (!e.shiftKey) {
      selectedCardIdsRef.current = new Set();
      setSelectedCardIds(new Set());
      selectedGroupIdsRef.current = new Set();
      setSelectedGroupIds(new Set());
      setSelectedEdgeId(null);
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    marqueeRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startWorldX: worldPt.x,
      startWorldY: worldPt.y,
      initialCardIds: e.shiftKey ? new Set(selectedCardIdsRef.current) : new Set(),
      initialGroupIds: e.shiftKey ? new Set(selectedGroupIdsRef.current) : new Set(),
    };
  };

  const handleStagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (zoomDragRef.current) {
      const zoomDrag = zoomDragRef.current;
      const dragDelta = e.clientX - zoomDrag.anchorClientX - (e.clientY - zoomDrag.anchorClientY);
      const nextZoom = zoomDrag.startZoom * Math.exp(dragDelta * 0.005);
      zoomAroundScreenPoint(zoomDrag.anchorClientX, zoomDrag.anchorClientY, nextZoom);
      return;
    }

    if (panGestureRef.current) {
      const pan = panGestureRef.current;
      const nextPanX = pan.origPanX + (e.clientX - pan.startClientX);
      const nextPanY = pan.origPanY + (e.clientY - pan.startClientY);
      setCanvasState((prev) => ({
        ...prev,
        viewport: {
          ...prev.viewport,
          x: nextPanX,
          y: nextPanY,
        },
      }));
      return;
    }

    if (connectingFrom) {
      const worldPt = screenToWorld(e.clientX, e.clientY);
      setConnectingFrom((prev) => (prev ? { ...prev, pointerWorld: worldPt } : null));
    }

    if (activeStroke) {
      const nativeEv = e.nativeEvent as PointerEvent;
      const events =
        typeof nativeEv.getCoalescedEvents === "function"
          ? nativeEv.getCoalescedEvents()
          : [nativeEv];
      const appended: [number, number, number][] = (events.length > 0 ? events : [nativeEv]).map(
        (ev) => {
          const wp = screenToWorld(ev.clientX, ev.clientY);
          return [wp.x, wp.y, ev.pressure > 0 ? ev.pressure : 0.5];
        },
      );
      setActiveStroke((prev) => (prev ? { ...prev, points: [...prev.points, ...appended] } : null));
      return;
    }

    if (eraseSweepRef.current) {
      const nativeEv = e.nativeEvent as PointerEvent;
      const events =
        typeof nativeEv.getCoalescedEvents === "function"
          ? nativeEv.getCoalescedEvents()
          : [nativeEv];
      const radiusWorld = 12 / stateRef.current.viewport.zoom;
      setCanvasState((prev) => {
        let next = prev.strokes;
        let changed = false;
        for (const ev of events.length > 0 ? events : [nativeEv]) {
          const wp = screenToWorld(ev.clientX, ev.clientY);
          const filtered = next.filter((s) => !hitTestStroke(s, wp.x, wp.y, radiusWorld));
          if (filtered.length !== next.length) {
            next = filtered;
            changed = true;
          }
        }
        if (!changed) return prev;
        if (eraseSweepRef.current) eraseSweepRef.current.erasedAny = true;
        return { ...prev, strokes: next };
      });
      return;
    }

    if (dragCardsRef.current) {
      const g = dragCardsRef.current;
      if (!g.moved) {
        if (Math.hypot(e.clientX - g.startClientX, e.clientY - g.startClientY) <= 4) {
          return;
        }
        g.moved = true;
        setIsDraggingSelection(true);
        try {
          containerRef.current?.setPointerCapture(g.pointerId);
        } catch {
          // ignore
        }
      }
      const wp = screenToWorld(e.clientX, e.clientY);
      const dx = wp.x - g.startWorldX;
      const dy = wp.y - g.startWorldY;
      const rdx = Math.round(dx);
      const rdy = Math.round(dy);

      let nextDropGroupId: string | null = null;
      setCanvasState((prev) => {
        const updatedGroups =
          g.groupOrigPositions.size > 0
            ? prev.groups.map((gr) => {
                const orig = g.groupOrigPositions.get(gr.id);
                return orig ? { ...gr, x: orig.x + rdx, y: orig.y + rdy } : gr;
              })
            : prev.groups;
        const updatedCards = prev.cards.map((c) => {
          const orig = g.initialPositions.get(c.id);
          if (!orig) return c;
          const updated = { ...c, x: Math.round(orig.x + dx), y: Math.round(orig.y + dy) };
          if (c.id === g.primaryCardId && g.groupOrigPositions.size === 0) {
            const target = resolveCardGroupAtDrop(updated, prev.groups);
            nextDropGroupId = target?.id ?? null;
          }
          return updated;
        });
        const updatedStrokes =
          g.strokeOrigPoints.size > 0
            ? prev.strokes.map((s) => {
                const origPts = g.strokeOrigPoints.get(s.id);
                return origPts
                  ? {
                      ...s,
                      points: origPts.map(
                        ([px, py, pr]) => [px + rdx, py + rdy, pr] as [number, number, number],
                      ),
                    }
                  : s;
              })
            : prev.strokes;
        return { ...prev, groups: updatedGroups, cards: updatedCards, strokes: updatedStrokes };
      });
      setDropTargetGroupId(nextDropGroupId);
      return;
    }

    if (dragGroupRef.current) {
      const g = dragGroupRef.current;
      const wp = screenToWorld(e.clientX, e.clientY);
      const dx = Math.round(wp.x - g.startWorldX);
      const dy = Math.round(wp.y - g.startWorldY);
      if (!g.moved && Math.hypot(dx, dy) > 2) {
        g.moved = true;
        setIsDraggingSelection(true);
      }

      setCanvasState((prev) => ({
        ...prev,
        groups: prev.groups.map((gr) => {
          const orig = g.groupOrigPositions.get(gr.id);
          return orig ? { ...gr, x: orig.x + dx, y: orig.y + dy } : gr;
        }),
        cards: prev.cards.map((c) => {
          const orig = g.childOrigPositions.get(c.id);
          return orig ? { ...c, x: orig.x + dx, y: orig.y + dy } : c;
        }),
        strokes: prev.strokes.map((s) => {
          const origPts = g.strokeOrigPoints.get(s.id);
          return origPts
            ? { ...s, points: origPts.map(([px, py, pr]) => [px + dx, py + dy, pr]) }
            : s;
        }),
      }));
      return;
    }

    if (resizeGestureRef.current) {
      const r = resizeGestureRef.current;
      const wp = screenToWorld(e.clientX, e.clientY);
      const dw = wp.x - r.startWorldX;
      const dh = wp.y - r.startWorldY;
      if (Math.hypot(dw, dh) > 2) r.changed = true;

      if (r.kind === "card") {
        const nextW = r.axis === "height" ? r.origW : Math.max(220, Math.round(r.origW + dw));
        const nextH = r.axis === "width" ? r.origH : Math.max(96, Math.round(r.origH + dh));
        setCanvasState((prev) => {
          const nextGroups = prev.groups.map((gr) => ({ ...gr }));
          const nextCards = prev.cards.map((c) =>
            c.id === r.id ? { ...c, width: nextW, height: nextH } : c,
          );
          fitArtboardsToChildren(nextGroups, nextCards);
          return {
            ...prev,
            groups: nextGroups,
            cards: nextCards,
          };
        });
      } else {
        const nextW = Math.max(280, Math.round(r.origW + dw));
        const nextH = Math.max(160, Math.round(r.origH + dh));
        setCanvasState((prev) => ({
          ...prev,
          groups: prev.groups.map((gr) =>
            gr.id === r.id ? { ...gr, width: nextW, height: nextH, layoutMode: "custom" } : gr,
          ),
        }));
      }
      return;
    }

    if (marqueeRef.current) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const m = marqueeRef.current;
      const sx1 = m.startClientX - rect.left;
      const sy1 = m.startClientY - rect.top;
      const sx2 = e.clientX - rect.left;
      const sy2 = e.clientY - rect.top;
      setMarqueeRect({
        x: Math.min(sx1, sx2),
        y: Math.min(sy1, sy2),
        w: Math.abs(sx2 - sx1),
        h: Math.abs(sy2 - sy1),
      });

      const wp = screenToWorld(e.clientX, e.clientY);
      const wxMin = Math.min(m.startWorldX, wp.x);
      const wxMax = Math.max(m.startWorldX, wp.x);
      const wyMin = Math.min(m.startWorldY, wp.y);
      const wyMax = Math.max(m.startWorldY, wp.y);

      const hitCardIds = new Set(m.initialCardIds);
      for (const c of stateRef.current.cards) {
        if (c.x < wxMax && c.x + c.width > wxMin && c.y < wyMax && c.y + c.height > wyMin) {
          hitCardIds.add(c.id);
        }
      }
      const hitGroupIds = new Set(m.initialGroupIds);
      for (const g of stateRef.current.groups) {
        const gHeight = g.collapsed ? CANVAS_GROUP_HEADER_HEIGHT : g.height;
        if (g.x >= wxMin && g.x + g.width <= wxMax && g.y >= wyMin && g.y + gHeight <= wyMax) {
          hitGroupIds.add(g.id);
        }
      }
      selectedCardIdsRef.current = hitCardIds;
      setSelectedCardIds(hitCardIds);
      selectedGroupIdsRef.current = hitGroupIds;
      setSelectedGroupIds(hitGroupIds);
    }
  };

  const handleStagePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }

    if (zoomDragRef.current) {
      zoomDragRef.current = null;
      setIsZoomDragging(false);
    }
    if (panGestureRef.current) {
      panGestureRef.current = null;
      setIsPanning(false);
    }
    setIsDraggingSelection(false);

    if (connectingFrom) {
      const dragDist = Math.hypot(
        e.clientX - connectingFrom.startClient.x,
        e.clientY - connectingFrom.startClient.y,
      );
      if (dragDist > 8) {
        const wp = screenToWorld(e.clientX, e.clientY);
        const collapsedIds = new Set(
          stateRef.current.groups.filter((g) => g.collapsed).map((g) => g.id),
        );
        const hitTarget = findConnectionTargetCard(
          stateRef.current.cards,
          collapsedIds,
          connectingFrom.cardId,
          wp,
        );
        const fromCard = stateRef.current.cards.find((c) => c.id === connectingFrom.cardId);
        if (hitTarget) {
          const toSide = fromCard
            ? resolveTargetConnectionSide(fromCard, connectingFrom.fromSide, hitTarget, wp)
            : undefined;
          finishConnection(connectingFrom.cardId, hitTarget.id, connectingFrom.fromSide, toSide);
          setTool("select");
        }
        setConnectingFrom(null);
      }
    }

    if (activeStroke) {
      if (activeStroke.points.length >= 2) {
        const finalized = activeStroke;
        applyWithUndo((prev) => ({
          ...prev,
          strokes: [...prev.strokes, finalized],
        }));
      }
      setActiveStroke(null);
    }

    if (eraseSweepRef.current) {
      if (eraseSweepRef.current.erasedAny) {
        pushHistorySnapshot(eraseSweepRef.current.snapshotBefore);
      }
      eraseSweepRef.current = null;
    }

    if (dragCardsRef.current) {
      const gesture = dragCardsRef.current;
      dragCardsRef.current = null;
      setDropTargetGroupId(null);

      if (gesture.moved) {
        pushHistorySnapshot(gesture.snapshotBefore);
        if (gesture.groupOrigPositions.size === 0) {
          const movedIds = new Set(gesture.initialPositions.keys());
          setCanvasState((prev) => applyCardDropMembership(prev, movedIds));
        }
      } else {
        const clickedCard = stateRef.current.cards.find((c) => c.id === gesture.primaryCardId);
        if (
          gesture.wasSoleSelectedAtDown &&
          gesture.allowClickEdit &&
          clickedCard &&
          clickedCard.type !== "image"
        ) {
          startEditingCard(gesture.primaryCardId);
        } else if (!gesture.shiftKey && clickedCard) {
          const nextCards = new Set([gesture.primaryCardId]);
          selectedCardIdsRef.current = nextCards;
          setSelectedCardIds(nextCards);
          selectedGroupIdsRef.current = new Set();
          setSelectedGroupIds(new Set());
          setSelectedEdgeId(null);
        }
      }
    }

    if (dragGroupRef.current) {
      const gesture = dragGroupRef.current;
      dragGroupRef.current = null;
      if (gesture.moved) {
        pushHistorySnapshot(gesture.snapshotBefore);
      } else if (!gesture.shiftKey) {
        const nextGroups = new Set([gesture.groupId]);
        selectedGroupIdsRef.current = nextGroups;
        setSelectedGroupIds(nextGroups);
        selectedCardIdsRef.current = new Set();
        setSelectedCardIds(new Set());
        setSelectedEdgeId(null);
      }
    }

    if (resizeGestureRef.current) {
      if (resizeGestureRef.current.changed) {
        pushHistorySnapshot(resizeGestureRef.current.snapshotBefore);
      }
      resizeGestureRef.current = null;
    }

    if (marqueeRef.current) {
      marqueeRef.current = null;
      setMarqueeRect(null);
    }
  };

  const captureMoveOrigins = useCallback(
    (groupIds: Iterable<string>, cardIds: Iterable<string>) => {
      const groupOrigPositions = new Map<string, { x: number; y: number }>();
      const movedGroupIds = new Set<string>();
      const movedGroupBounds: Array<{ x: number; y: number; width: number; height: number }> = [];
      for (const gid of groupIds) {
        const group = stateRef.current.groups.find((item) => item.id === gid);
        if (group) {
          groupOrigPositions.set(gid, { x: group.x, y: group.y });
          movedGroupIds.add(gid);
          if (!group.collapsed) {
            movedGroupBounds.push({
              x: group.x,
              y: group.y,
              width: group.width,
              height: group.height,
            });
          }
        }
      }

      const isPointInMovedGroup = (px: number, py: number): boolean =>
        movedGroupBounds.some(
          (b) => px >= b.x && px <= b.x + b.width && py >= b.y && py <= b.y + b.height,
        );

      const cardOrigPositions = new Map<string, { x: number; y: number }>();
      for (const c of stateRef.current.cards) {
        if (
          (c.groupId && movedGroupIds.has(c.groupId)) ||
          (!c.groupId &&
            movedGroupBounds.length > 0 &&
            isPointInMovedGroup(c.x + c.width / 2, c.y + c.height / 2))
        ) {
          cardOrigPositions.set(c.id, { x: c.x, y: c.y });
        }
      }
      for (const cid of cardIds) {
        if (!cardOrigPositions.has(cid)) {
          const c = stateRef.current.cards.find((item) => item.id === cid);
          if (c) cardOrigPositions.set(cid, { x: c.x, y: c.y });
        }
      }

      const strokeOrigPoints = new Map<string, [number, number, number][]>();
      if (movedGroupIds.size > 0) {
        for (const s of stateRef.current.strokes) {
          const belongsToGroup = Boolean(s.parentGroupId && movedGroupIds.has(s.parentGroupId));
          const enclosesMidpoint =
            !s.parentGroupId &&
            movedGroupBounds.length > 0 &&
            s.points.length > 0 &&
            (() => {
              const mid = s.points[Math.floor(s.points.length / 2)]!;
              return isPointInMovedGroup(mid[0], mid[1]);
            })();
          if (belongsToGroup || enclosesMidpoint) {
            strokeOrigPoints.set(
              s.id,
              s.points.map((pt) => [...pt] as [number, number, number]),
            );
          }
        }
      }

      return { groupOrigPositions, cardOrigPositions, strokeOrigPoints };
    },
    [],
  );

  const handleStartDragCard = useCallback(
    (cardId: string, e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const wp = screenToWorld(e.clientX, e.clientY);
      const currentSelectedCards = selectedCardIdsRef.current;
      const currentSelectedGroups = selectedGroupIdsRef.current;
      const wasSoleSelectedAtDown =
        !e.shiftKey &&
        ((currentSelectedCards.size === 1 &&
          currentSelectedCards.has(cardId) &&
          currentSelectedGroups.size === 0) ||
          e.detail >= 2);
      const allowClickEdit =
        !e.shiftKey &&
        !(e.target instanceof Element && Boolean(e.target.closest("img, a, button")));
      const isCardInSelection = currentSelectedCards.has(cardId);
      const activeCardIds = isCardInSelection ? Array.from(currentSelectedCards) : [cardId];
      const activeGroupIds = isCardInSelection ? Array.from(currentSelectedGroups) : [];
      const { groupOrigPositions, cardOrigPositions, strokeOrigPoints } = captureMoveOrigins(
        activeGroupIds,
        activeCardIds,
      );

      dragCardsRef.current = {
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startWorldX: wp.x,
        startWorldY: wp.y,
        initialPositions: cardOrigPositions,
        groupOrigPositions,
        strokeOrigPoints,
        primaryCardId: cardId,
        snapshotBefore: snapshotOf(stateRef.current),
        moved: false,
        wasSoleSelectedAtDown,
        shiftKey: e.shiftKey,
        allowClickEdit,
      };
    },
    [captureMoveOrigins, screenToWorld],
  );

  const handleStartDragGroup = useCallback(
    (groupId: string, e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const group = stateRef.current.groups.find((g) => g.id === groupId);
      if (!group) return;

      const currentSelectedGroups = selectedGroupIdsRef.current;
      const currentSelectedCards = selectedCardIdsRef.current;
      let activeGroupIds: string[];
      let activeCardIds: string[];

      if (e.shiftKey) {
        const nextGroups = new Set(currentSelectedGroups);
        if (nextGroups.has(groupId)) {
          nextGroups.delete(groupId);
          selectedGroupIdsRef.current = nextGroups;
          setSelectedGroupIds(nextGroups);
          setSelectedEdgeId(null);
          return;
        }
        nextGroups.add(groupId);
        selectedGroupIdsRef.current = nextGroups;
        setSelectedGroupIds(nextGroups);
        setSelectedEdgeId(null);
        activeGroupIds = Array.from(nextGroups);
        activeCardIds = Array.from(currentSelectedCards);
      } else if (currentSelectedGroups.has(groupId)) {
        activeGroupIds = Array.from(currentSelectedGroups);
        activeCardIds = Array.from(currentSelectedCards);
      } else {
        const nextGroups = new Set([groupId]);
        selectedGroupIdsRef.current = nextGroups;
        setSelectedGroupIds(nextGroups);
        selectedCardIdsRef.current = new Set();
        setSelectedCardIds(new Set());
        setSelectedEdgeId(null);
        activeGroupIds = [groupId];
        activeCardIds = [];
      }

      const wp = screenToWorld(e.clientX, e.clientY);
      const { groupOrigPositions, cardOrigPositions, strokeOrigPoints } = captureMoveOrigins(
        activeGroupIds,
        activeCardIds,
      );

      dragGroupRef.current = {
        groupId,
        startWorldX: wp.x,
        startWorldY: wp.y,
        groupOrigPositions,
        childOrigPositions: cardOrigPositions,
        strokeOrigPoints,
        snapshotBefore: snapshotOf(stateRef.current),
        moved: false,
        shiftKey: e.shiftKey,
      };
      try {
        containerRef.current?.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    },
    [captureMoveOrigins, screenToWorld],
  );

  const handleStartResize = useCallback(
    (
      kind: "card" | "group",
      id: string,
      e: React.PointerEvent,
      axis: "both" | "width" | "height" = "both",
    ) => {
      if (e.button !== 0) return;
      const wp = screenToWorld(e.clientX, e.clientY);
      const target =
        kind === "card"
          ? stateRef.current.cards.find((c) => c.id === id)
          : stateRef.current.groups.find((g) => g.id === id);
      if (!target) return;

      resizeGestureRef.current = {
        kind,
        id,
        axis,
        startWorldX: wp.x,
        startWorldY: wp.y,
        origW: target.width,
        origH: target.height,
        snapshotBefore: snapshotOf(stateRef.current),
        changed: false,
      };
      try {
        containerRef.current?.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    },
    [screenToWorld],
  );

  const handleSelectGroup = useCallback((groupId: string, ev: React.PointerEvent) => {
    if (ev.button === 2) {
      if (!selectedGroupIdsRef.current.has(groupId)) {
        const nextGroups = new Set([groupId]);
        selectedGroupIdsRef.current = nextGroups;
        setSelectedGroupIds(nextGroups);
        selectedCardIdsRef.current = new Set();
        setSelectedCardIds(new Set());
        setSelectedEdgeId(null);
      }
      return;
    }
    if (ev.shiftKey) {
      const next = new Set(selectedGroupIdsRef.current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      selectedGroupIdsRef.current = next;
      setSelectedGroupIds(next);
      setSelectedEdgeId(null);
      return;
    }
    const nextGroups = new Set([groupId]);
    selectedGroupIdsRef.current = nextGroups;
    setSelectedGroupIds(nextGroups);
    selectedCardIdsRef.current = new Set();
    setSelectedCardIds(new Set());
    setSelectedEdgeId(null);
  }, []);

  const handleStartGroupResize = useCallback(
    (groupId: string, ev: React.PointerEvent) => handleStartResize("group", groupId, ev),
    [handleStartResize],
  );

  const handleRenameGroup = useCallback(
    (groupId: string, nextTitle: string) => {
      applyWithUndo((prev) => ({
        ...prev,
        groups: prev.groups.map((g) => (g.id === groupId ? { ...g, title: nextTitle } : g)),
      }));
    },
    [applyWithUndo],
  );

  const handleToggleGroupCollapse = useCallback(
    (groupId: string) => {
      applyWithUndo((prev) => ({
        ...prev,
        groups: prev.groups.map((g) => (g.id === groupId ? { ...g, collapsed: !g.collapsed } : g)),
      }));
    },
    [applyWithUndo],
  );

  const handleTidyGroup = useCallback(
    (groupId: string) => {
      applyWithUndo((prev) => tidyVideoArtboard(prev, groupId));
    },
    [applyWithUndo],
  );

  const handleDeleteSingleGroup = useCallback(
    (groupId: string) => deleteGroupsByIds(new Set([groupId])),
    [deleteGroupsByIds],
  );

  const handleGroupContextMenu = useCallback((groupId: string, ev: React.MouseEvent) => {
    const currSelectedGroups = selectedGroupIdsRef.current;
    const targetGroupIds = currSelectedGroups.has(groupId)
      ? Array.from(currSelectedGroups)
      : [groupId];
    if (!currSelectedGroups.has(groupId)) {
      const nextGroups = new Set([groupId]);
      selectedGroupIdsRef.current = nextGroups;
      setSelectedGroupIds(nextGroups);
      selectedCardIdsRef.current = new Set();
      setSelectedCardIds(new Set());
      setSelectedEdgeId(null);
    }
    setContextMenu({
      kind: "artboard",
      clientX: ev.clientX,
      clientY: ev.clientY,
      groupIds: targetGroupIds,
    });
  }, []);

  const handleSelectCard = useCallback((cardId: string, ev: React.PointerEvent) => {
    if (ev.shiftKey) {
      const next = new Set(selectedCardIdsRef.current);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      selectedCardIdsRef.current = next;
      setSelectedCardIds(next);
    } else if (!selectedCardIdsRef.current.has(cardId)) {
      const next = new Set([cardId]);
      selectedCardIdsRef.current = next;
      setSelectedCardIds(next);
      selectedGroupIdsRef.current = new Set();
      setSelectedGroupIds(new Set());
    }
    setSelectedEdgeId(null);
  }, []);

  const handleStartCardResize = useCallback(
    (cardId: string, ev: React.PointerEvent, axis?: "both" | "width" | "height") =>
      handleStartResize("card", cardId, ev, axis),
    [handleStartResize],
  );

  const handleCommitCardHtml = useCallback(
    (cardId: string, html: string) => persistCardDraft(cardId, html, { updateLayout: false }),
    [persistCardDraft],
  );

  const handleMeasuredCardHeightGrow = useCallback((cardId: string, measuredHeight: number) => {
    setCanvasState((prev) => applyCardHeightUpdate(prev, cardId, measuredHeight));
  }, []);

  const handleDeleteSingleCard = useCallback(
    (cardId: string) => deleteCardsByIds(new Set([cardId])),
    [deleteCardsByIds],
  );

  const handleStartCardConnect = useCallback(
    (cardId: string, ev: React.PointerEvent, side: CanvasSide) => {
      const wp = screenToWorld(ev.clientX, ev.clientY);
      setConnectingFrom({
        cardId,
        fromSide: side,
        startClient: { x: ev.clientX, y: ev.clientY },
        pointerWorld: wp,
      });
      setTool("connect");
    },
    [screenToWorld],
  );

  const handleCardContextMenu = useCallback(
    (card: CanvasCard, ev: React.MouseEvent) => {
      const currSelected = selectedCardIdsRef.current;
      const targetIds = currSelected.has(card.id) ? Array.from(currSelected) : [card.id];
      if (!currSelected.has(card.id)) {
        const next = new Set([card.id]);
        selectedCardIdsRef.current = next;
        setSelectedCardIds(next);
        selectedGroupIdsRef.current = new Set();
        setSelectedGroupIds(new Set());
        setSelectedEdgeId(null);
      }
      const cardImgEl =
        card.type === "image"
          ? ((ev.currentTarget as Element | null)?.querySelector("img") ?? null)
          : null;
      const fallbackImageSrc =
        card.type === "image"
          ? cardImgEl?.currentSrc || cardImgEl?.src || card.imageSrc || null
          : null;
      const analysis = inspectAppContextTarget({
        clientX: ev.clientX,
        clientY: ev.clientY,
        target: ev.target,
        fallbackImageSrc,
      });
      const cardLabel =
        card.originLessonIdx !== undefined
          ? `${formatCanvasLessonCode(lessons, card.originLessonIdx)} · ${formatTimestamp(card.timestamp ?? 0)}`
          : card.caption || "Image";
      setContextMenu({
        kind: "cards",
        clientX: ev.clientX,
        clientY: ev.clientY,
        cardIds: targetIds,
        analysis,
        onOpenImage: (src) => setLightboxImage({ src, label: cardLabel }),
      });
    },
    [lessons],
  );

  const handleOpenCardLightbox = useCallback(
    (src: string, card: CanvasCard) => {
      setLightboxImage({
        src,
        label:
          card.originLessonIdx !== undefined
            ? `${formatCanvasLessonCode(lessons, card.originLessonIdx)} · ${formatTimestamp(card.timestamp ?? 0)}`
            : card.caption || "Image",
      });
    },
    [lessons],
  );

  const handleUpdateImageCaption = useCallback(
    (cardId: string, caption: string) => {
      applyWithUndo((prev) => ({
        ...prev,
        cards: prev.cards.map((c) => (c.id === cardId ? { ...c, caption } : c)),
      }));
    },
    [applyWithUndo],
  );

  const groupCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of canvasState.cards) {
      if (c.groupId) counts.set(c.groupId, (counts.get(c.groupId) ?? 0) + 1);
    }
    return counts;
  }, [canvasState.cards]);

  const collapsedGroupIds = useMemo(
    () => new Set(canvasState.groups.filter((g) => g.collapsed).map((g) => g.id)),
    [canvasState.groups],
  );

  const visibleCards = useMemo(
    () => canvasState.cards.filter((c) => !c.groupId || !collapsedGroupIds.has(c.groupId)),
    [canvasState.cards, collapsedGroupIds],
  );

  const snapConnectTarget = useMemo(() => {
    if (!connectingFrom) return null;
    const fromCard = visibleCards.find((c) => c.id === connectingFrom.cardId);
    if (!fromCard) return null;
    const targetCard = findConnectionTargetCard(
      visibleCards,
      collapsedGroupIds,
      connectingFrom.cardId,
      connectingFrom.pointerWorld,
    );
    if (!targetCard) return null;
    return {
      cardId: targetCard.id,
      toSide: resolveTargetConnectionSide(
        fromCard,
        connectingFrom.fromSide,
        targetCard,
        connectingFrom.pointerWorld,
      ),
    };
  }, [connectingFrom, visibleCards, collapsedGroupIds]);

  const stageCursor = isZoomDragging
    ? "cursor-ns-resize"
    : isDraggingSelection
      ? "cursor-grabbing"
      : isPanning || spacePressed || tool === "pan"
        ? isPanning
          ? "cursor-grabbing"
          : "cursor-grab"
        : tool === "pen" ||
            tool === "highlighter" ||
            tool === "eraser" ||
            tool === "note" ||
            tool === "text"
          ? "cursor-crosshair"
          : "cursor-default";

  return (
    <div
      ref={containerRef}
      onPointerDown={handleStagePointerDown}
      onPointerMove={handleStagePointerMove}
      onPointerUp={handleStagePointerUp}
      onPointerCancel={handleStagePointerUp}
      onContextMenu={(e) => {
        if (
          e.target instanceof Element &&
          (e.target.closest('[data-canvas-ui="true"]') ||
            e.target.closest(".note-editor, [contenteditable='true'], input, textarea"))
        ) {
          return;
        }
        e.preventDefault();
        if (isInkTool || tool === "pan") return;
        const wp = screenToWorld(e.clientX, e.clientY);
        setContextMenu({
          kind: "stage",
          clientX: e.clientX,
          clientY: e.clientY,
          worldX: wp.x,
          worldY: wp.y,
        });
      }}
      onDoubleClick={(e) => {
        if (isInkTool || tool === "pan") return;
        const targetEl = e.target instanceof Element ? e.target : null;
        if (targetEl?.closest("[data-canvas-card-id]") || editingCardIdRef.current) return;
        const isEmptyCanvasArea =
          e.target === e.currentTarget || Boolean(targetEl?.hasAttribute("data-canvas-group-id"));
        if (!isEmptyCanvasArea) return;
        const wp = screenToWorld(e.clientX, e.clientY);
        const hitCard = [...visibleCards]
          .reverse()
          .find(
            (c) => wp.x >= c.x && wp.x <= c.x + c.width && wp.y >= c.y && wp.y <= c.y + c.height,
          );
        if (hitCard) {
          if (hitCard.type !== "image") startEditingCard(hitCard.id);
          return;
        }
        spawnCardAt("canvas-note", wp.x, wp.y);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(e) => {
        e.preventDefault();
        const files = Array.from(e.dataTransfer?.files || []).filter((f) =>
          f.type.startsWith("image/"),
        );
        if (files.length === 0) return;
        const wp = screenToWorld(e.clientX, e.clientY);
        files.forEach((file, idx) => {
          void insertImageFileAt(file, wp.x + idx * 36, wp.y + idx * 36);
        });
      }}
      style={{
        backgroundImage: "radial-gradient(circle, var(--border) 1px, transparent 1px)",
        backgroundSize: `${24 * canvasState.viewport.zoom}px ${24 * canvasState.viewport.zoom}px`,
        backgroundPosition: `${canvasState.viewport.x}px ${canvasState.viewport.y}px`,
      }}
      className={cn(
        "relative h-dvh w-full overflow-hidden bg-shell/65 select-none touch-none",
        stageCursor,
      )}
    >
      {/* Hidden image upload input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith("image/"));
          if (files.length > 0) {
            const rect = containerRef.current?.getBoundingClientRect();
            const vp = stateRef.current.viewport;
            const cx = rect ? (rect.width / 2 - vp.x) / vp.zoom : 240;
            const cy = rect ? (rect.height / 2 - vp.y) / vp.zoom : 200;
            files.forEach((file, idx) => {
              void insertImageFileAt(file, cx + idx * 36, cy + idx * 36);
            });
          }
          e.target.value = "";
        }}
      />

      {/* World Transform Stage */}
      <div
        style={
          {
            transform: `translate3d(${canvasState.viewport.x}px, ${canvasState.viewport.y}px, 0) scale(${canvasState.viewport.zoom})`,
            transformOrigin: "0 0",
            "--canvas-zoom": String(canvasState.viewport.zoom),
          } as React.CSSProperties
        }
        className="pointer-events-none absolute left-0 top-0"
      >
        {/* 1. Artboards (Pointer-Events Disabled While Pan/Draw/Spawn Active) */}
        <div className={stageInterceptsCards ? "pointer-events-none" : "pointer-events-auto"}>
          {canvasState.groups.map((group) => (
            <CanvasArtboard
              key={group.id}
              group={group}
              selected={selectedGroupIds.has(group.id)}
              isDropTarget={dropTargetGroupId === group.id}
              childCount={groupCounts.get(group.id) ?? 0}
              renameSignal={renameGroupSignal?.groupId === group.id ? renameGroupSignal.seq : 0}
              pointerEventsDisabled={stageInterceptsCards}
              onSelect={handleSelectGroup}
              onStartDragHeader={handleStartDragGroup}
              onStartDragEdge={handleStartDragGroup}
              onStartResize={handleStartGroupResize}
              onRename={handleRenameGroup}
              onToggleCollapse={handleToggleGroupCollapse}
              onTidy={handleTidyGroup}
              onDelete={handleDeleteSingleGroup}
              onContextMenu={handleGroupContextMenu}
            />
          ))}
        </div>

        {/* 2. Arrows Layer */}
        <CanvasEdgesLayer
          edges={canvasState.edges}
          cards={visibleCards}
          selectedEdgeId={selectedEdgeId}
          connectingFrom={connectingFrom}
          connectingSnapTarget={snapConnectTarget}
          interactive={!isInkTool && tool !== "pan"}
          onSelectEdge={(edgeId) => {
            setSelectedEdgeId(edgeId);
            setSelectedCardIds(new Set());
            setSelectedGroupIds(new Set());
          }}
          onDeleteEdge={(edgeId) => {
            applyWithUndo((prev) => ({
              ...prev,
              edges: prev.edges.filter((edge) => edge.id !== edgeId),
            }));
            setSelectedEdgeId(null);
          }}
          onContextMenuEdge={(edgeId, ev) => {
            setSelectedEdgeId(edgeId);
            setSelectedCardIds(new Set());
            setSelectedGroupIds(new Set());
            setContextMenu({
              kind: "edge",
              clientX: ev.clientX,
              clientY: ev.clientY,
              edgeId,
            });
          }}
        />

        {/* 3. Cards Layer */}
        <div className={stageInterceptsCards ? "pointer-events-none" : "pointer-events-auto"}>
          {visibleCards.map((card) => {
            const lessonItem =
              card.originLessonIdx !== undefined ? lessons[card.originLessonIdx] : undefined;
            const lessonCode =
              card.originLessonIdx !== undefined
                ? formatCanvasLessonCode(lessons, card.originLessonIdx)
                : undefined;
            const lessonTooltip = lessonItem
              ? `${lessonItem.moduleTitle} — ${lessonItem.title}`
              : undefined;

            return (
              <CanvasCardView
                key={card.id}
                courseId={courseId}
                card={card}
                lessonCode={lessonCode}
                lessonTooltip={lessonTooltip}
                selected={selectedCardIds.has(card.id)}
                isEditing={editingCardId === card.id}
                isConnectSource={connectingFrom?.cardId === card.id}
                activeConnectSide={
                  connectingFrom?.cardId === card.id ? connectingFrom.fromSide : undefined
                }
                snapTargetSide={
                  snapConnectTarget?.cardId === card.id ? snapConnectTarget.toSide : undefined
                }
                isConnectMode={tool === "connect" || Boolean(connectingFrom)}
                pointerEventsDisabled={stageInterceptsCards}
                onSelect={handleSelectCard}
                onStartDrag={handleStartDragCard}
                onStartResize={handleStartCardResize}
                onStartEdit={startEditingCard}
                onFinishEdit={commitPendingEdit}
                onDraftChange={handleDraftChange}
                onCommitHtml={handleCommitCardHtml}
                onMeasuredHeightGrow={handleMeasuredCardHeightGrow}
                onReturnToOriginGroup={handleReturnCardToOrigin}
                onDelete={handleDeleteSingleCard}
                onContextMenu={handleCardContextMenu}
                onStartConnect={handleStartCardConnect}
                onCompleteConnect={handleCompleteConnect}
                onOpenLightbox={handleOpenCardLightbox}
                onUpdateImageCaption={handleUpdateImageCaption}
              />
            );
          })}
        </div>

        {/* 4. Freehand Ink & Highlighter SVG Overlay */}
        <CanvasInkLayer strokes={canvasState.strokes} activeStroke={activeStroke} />
      </div>

      {/* Marquee Selection Box */}
      {marqueeRect && marqueeRect.w > 3 && marqueeRect.h > 3 && (
        <div
          style={{
            left: marqueeRect.x,
            top: marqueeRect.y,
            width: marqueeRect.w,
            height: marqueeRect.h,
          }}
          className="pointer-events-none absolute z-30 rounded-md border border-primary/70 bg-primary/10"
        />
      )}

      {/* Calm Empty Hint When Zero Cards & Notes */}
      {canvasState.cards.length === 0 && canvasState.groups.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-xl bg-card/85 px-4 py-3 text-center shadow-card backdrop-blur-sm">
            <p className="text-xs font-medium text-muted-foreground">
              Double-click anywhere to add a note, or drop images here.
            </p>
          </div>
        </div>
      )}

      {/* Floating HUD & Bottom Tool Dock */}
      <CanvasHud
        courseId={courseId}
        courseTitle={course.title}
        zoom={canvasState.viewport.zoom}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        drawerOpen={drawerOpen}
        unplacedCount={canvasState.dismissedNoteIds.length}
        tool={tool}
        strokeColor={strokeColor}
        strokeSize={tool === "highlighter" ? highlighterSize : penSize}
        onSelectTool={(nextTool) => {
          setTool(nextTool);
          if (nextTool !== "connect") setConnectingFrom(null);
        }}
        onChangeStrokeColor={setStrokeColor}
        onChangeStrokeSize={(size) => {
          if (tool === "highlighter") setHighlighterSize(size);
          else setPenSize(size);
        }}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onResetArrangement={() => {
          applyWithUndo((prev) => resetCanvasArrangement(prev, lessons));
          toast("Video cards reset to artboards");
        }}
        onZoomIn={() => centerViewportZoom(1.18)}
        onZoomOut={() => centerViewportZoom(0.84)}
        onResetView={resetView}
        onToggleDrawer={() => setDrawerOpen((v) => !v)}
        onTriggerImageUpload={() => fileInputRef.current?.click()}
        onCreateArtboard={insertCustomArtboard}
      />

      {/* Collapsible Course Notes Drawer */}
      <CanvasNotesDrawer
        open={drawerOpen}
        notes={notes}
        cards={canvasState.cards}
        lessons={lessons}
        dismissedNoteIds={canvasState.dismissedNoteIds}
        onFocusCard={focusCard}
        onRestoreNote={restoreNoteToCanvas}
        onClose={() => setDrawerOpen(false)}
      />

      {/* Right-Click Context Menu */}
      {contextMenu && (
        <CanvasContextMenu
          target={contextMenu}
          cards={
            contextMenu.kind === "cards"
              ? canvasState.cards.filter((c) => contextMenu.cardIds.includes(c.id))
              : []
          }
          editingCardId={editingCardId}
          groups={
            contextMenu.kind === "artboard"
              ? canvasState.groups.filter((g) => contextMenu.groupIds.includes(g.id))
              : []
          }
          canTidyGroup={
            contextMenu.kind === "artboard"
              ? canvasState.cards.some(
                  (c) => c.groupId !== null && contextMenu.groupIds.includes(c.groupId),
                )
              : false
          }
          hasGroups={canvasState.groups.length > 0}
          edge={
            contextMenu.kind === "edge"
              ? canvasState.edges.find((edge) => edge.id === contextMenu.edgeId)
              : undefined
          }
          onUpdateCardsAccent={updateCardsAccent}
          onEditCard={startEditingCard}
          onReturnCardsToOrigin={(cardIds) => {
            applyWithUndo((prev) =>
              cardIds.reduce(
                (nextState, id) => returnCardToOriginGroup(nextState, id, lessons),
                prev,
              ),
            );
            toast("Returned to lesson artboard");
          }}
          onTidyCards={(cardIds) => {
            applyWithUndo((prev) => tidySelectedCards(prev, cardIds));
            toast("Selection tidied");
          }}
          onDeleteCards={(cardIds) => deleteCardsByIds(new Set(cardIds))}
          onUpdateGroupsTint={(groupIds, tintIndex) => {
            const targetSet = new Set(groupIds);
            applyWithUndo((prev) => ({
              ...prev,
              groups: prev.groups.map((g) => (targetSet.has(g.id) ? { ...g, tintIndex } : g)),
            }));
          }}
          onRenameGroup={(groupId) => {
            setRenameGroupSignal((prev) => ({ groupId, seq: (prev?.seq ?? 0) + 1 }));
          }}
          onTidyGroups={(groupIds) => {
            applyWithUndo((prev) =>
              groupIds.reduce((nextState, id) => tidyVideoArtboard(nextState, id), prev),
            );
            toast(groupIds.length > 1 ? "Artboards tidied" : "Artboard tidied");
          }}
          onTidyAll={() => {
            applyWithUndo((prev) => tidyAllCanvasArtboards(prev));
            toast("Canvas tidied");
          }}
          onSetGroupsCollapsed={(groupIds, collapsed) => {
            const targetSet = new Set(groupIds);
            applyWithUndo((prev) => ({
              ...prev,
              groups: prev.groups.map((g) => (targetSet.has(g.id) ? { ...g, collapsed } : g)),
            }));
          }}
          onDeleteGroups={(groupIds) => deleteGroupsByIds(new Set(groupIds))}
          onDeleteEdge={(edgeId) => {
            applyWithUndo((prev) => ({
              ...prev,
              edges: prev.edges.filter((edge) => edge.id !== edgeId),
            }));
            setSelectedEdgeId((curr) => (curr === edgeId ? null : curr));
          }}
          onAddNoteAt={(worldX, worldY) => spawnCardAt("canvas-note", worldX, worldY)}
          onAddTextAt={(worldX, worldY) => spawnCardAt("text", worldX, worldY)}
          onAddArtboardAt={(worldX, worldY) => insertCustomArtboardAt(worldX, worldY)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Lightbox Image Preview */}
      {lightboxImage && (
        <ImageLightboxModal
          src={lightboxImage.src}
          alt={lightboxImage.label}
          downloadName="canvas-image.png"
          onClose={() => setLightboxImage(null)}
        />
      )}
    </div>
  );
}
