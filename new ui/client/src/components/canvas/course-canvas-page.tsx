import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, X } from "lucide-react";
import { toast } from "sonner";

import { CanvasArtboard } from "@/components/canvas/canvas-artboard";
import { CanvasCardView } from "@/components/canvas/canvas-card";
import { CanvasEdgesLayer } from "@/components/canvas/canvas-edges";
import { CanvasHud } from "@/components/canvas/canvas-hud";
import { CanvasInkLayer } from "@/components/canvas/canvas-ink-layer";
import { CanvasNotesDrawer } from "@/components/canvas/canvas-notes-drawer";
import type { CanvasToolMode } from "@/components/canvas/canvas-tokens";
import type { Course } from "@/lib/courses";
import {
  applyCardDropMembership,
  applyCardHeightUpdate,
  CANVAS_CARD_WIDTH,
  createCanvasId,
  estimateVideoNoteCardHeight,
  fetchCourseCanvas,
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
  restoreNoteCardToCanvas,
  returnCardToOriginGroup,
  saveCourseCanvas,
  tidyAllCanvasArtboards,
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
  hasMeaningfulHtmlContent,
  subscribeCourseNotesChanged,
  updateCourseNoteContent,
  type NoteItem,
} from "@/lib/course-notes";
import { resolveMediaUrl, saveMediaFile } from "@/lib/media-store";
import { cn } from "@/lib/utils";

const MAX_UNDO_HISTORY = 50;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;

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
  const editingDraftRef = useRef<{ cardId: string; html: string } | null>(null);

  // Interaction & UI state
  const [tool, setTool] = useState<CanvasToolMode>("select");
  const [strokeColor, setStrokeColor] = useState<CanvasStrokeColorToken>("ink");
  const [penSize, setPenSize] = useState(5);
  const [highlighterSize, setHighlighterSize] = useState(24);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(() => new Set());
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [dropTargetGroupId, setDropTargetGroupId] = useState<string | null>(null);

  const [spacePressed, setSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
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

  // Mutable gesture refs for high-frequency pointer handling
  const stateRef = useRef(canvasState);
  stateRef.current = canvasState;

  const panGestureRef = useRef<{
    startClientX: number;
    startClientY: number;
    origPanX: number;
    origPanY: number;
  } | null>(null);

  const dragCardsRef = useRef<{
    startWorldX: number;
    startWorldY: number;
    initialPositions: Map<string, { x: number; y: number }>;
    primaryCardId: string;
    snapshotBefore: HistorySnapshot;
    moved: boolean;
  } | null>(null);

  const dragGroupRef = useRef<{
    groupId: string;
    startWorldX: number;
    startWorldY: number;
    origGroupPos: { x: number; y: number };
    childOrigPositions: Map<string, { x: number; y: number }>;
    strokeOrigPoints: Map<string, [number, number, number][]>;
    snapshotBefore: HistorySnapshot;
    moved: boolean;
  } | null>(null);

  const resizeGestureRef = useRef<{
    kind: "card" | "group";
    id: string;
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
    editingDraftRef.current = null;
    setUndoStack([]);
    setRedoStack([]);
    setSelectedCardIds(new Set());
    setSelectedGroupId(null);
    setSelectedEdgeId(null);
    setEditingCardId(null);

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
        setCanvasState(reconcileCanvasWithNotes(loadedCanvas, loadedNotes, curr.lessons, courseId));
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
  }, [courseId]);

  // Subscribe to Player note updates & cross-tab updates
  useEffect(() => {
    return subscribeCourseNotesChanged(courseId, (nextNotes) => {
      lastNotesRevisionRef.current += 1;
      setNotes(nextNotes);
      setCanvasState((prev) =>
        reconcileCanvasWithNotes(prev, nextNotes, lessons, courseId, lastNotesRevisionRef.current),
      );
    });
  }, [courseId, lessons]);

  // Debounced auto-save to server SQLite & .tutin/canvas.json
  useEffect(() => {
    if (!canvasHydratedRef.current) return;
    const timer = window.setTimeout(() => {
      saveCourseCanvas(stateRef.current);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [canvasState]);

  useEffect(() => {
    const flush = () => {
      if (!canvasHydratedRef.current) return;
      saveCourseCanvas(stateRef.current);
      flushPendingCanvasSave(courseId);
    };
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, [courseId]);

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
      setCanvasState(next);
    },
    [pushHistorySnapshot],
  );

  const handleUndo = useCallback(() => {
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
    setCanvasState((curr) => ({ ...curr, ...snap }));
  }, []);

  const handleRedo = useCallback(() => {
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
    setCanvasState((curr) => ({ ...curr, ...snap }));
  }, []);

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
      const clampedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
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
    setSelectedGroupId(null);
    setSelectedEdgeId(null);
  }, []);

  const spawnCardAt = useCallback(
    (type: "canvas-note" | "text", worldX: number, worldY: number) => {
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
      setSelectedCardIds(new Set([draftCard.id]));
      setSelectedGroupId(null);
      setSelectedEdgeId(null);
      setEditingCardId(draftCard.id);
      setTool("select");
    },
    [applyWithUndo],
  );

  const insertImageFileAt = useCallback(
    async (file: File, worldX: number, worldY: number) => {
      try {
        const mediaUri = await saveMediaFile(file, courseId);
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
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to insert image.");
      }
    },
    [applyWithUndo, courseId],
  );

  const insertCustomArtboard = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    const vp = stateRef.current.viewport;
    const cx = rect ? (rect.width / 2 - vp.x) / vp.zoom : 240;
    const cy = rect ? (rect.height / 2 - vp.y) / vp.zoom : 200;

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
    setSelectedGroupId(newGroup.id);
    setSelectedCardIds(new Set());
    setTool("select");
  }, [applyWithUndo]);

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

  const deleteCardsByIds = useCallback(
    (cardIdsToRemove: Set<string>) => {
      if (cardIdsToRemove.size === 0) return;
      const cards = stateRef.current.cards.filter((c) => cardIdsToRemove.has(c.id));
      const hiddenVideoNoteIds = cards
        .filter((c) => c.type === "video-note" && c.noteId)
        .map((c) => c.noteId!);

      applyWithUndo((prev) => {
        const nextCards = prev.cards.filter((c) => !cardIdsToRemove.has(c.id));
        const nextDismissed = Array.from(
          new Set([...prev.dismissedNoteIds, ...hiddenVideoNoteIds]),
        );
        return {
          ...prev,
          cards: nextCards,
          dismissedNoteIds: nextDismissed,
          edges: rebuildAllAutoChronoEdges(prev.groups, nextCards, prev.edges),
        };
      });

      setSelectedCardIds(new Set());
      if (editingCardId && cardIdsToRemove.has(editingCardId)) {
        setEditingCardId(null);
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
    [applyWithUndo, editingCardId, handleUndo, restoreNoteToCanvas],
  );

  const handleReturnCardToOrigin = useCallback(
    (cardId: string) => {
      applyWithUndo((prev) => returnCardToOriginGroup(prev, cardId, lessons));
      toast("Returned to lesson artboard");
    },
    [applyWithUndo, lessons],
  );

  const handleSaveCardContent = useCallback(
    (cardId: string, html: string) => {
      editingDraftRef.current = null;
      const card = stateRef.current.cards.find((c) => c.id === cardId);
      if (!card) return;

      if (!hasMeaningfulHtmlContent(html) && card.isCanvasOnly) {
        setEditingCardId(null);
        deleteCardsByIds(new Set([cardId]));
        return;
      }

      if (card.type === "video-note" && !hasMeaningfulHtmlContent(html)) {
        setEditingCardId(null);
        return;
      }

      const estimatedHeight = estimateVideoNoteCardHeight(html, 0);
      applyWithUndo((prev) => applyCardHeightUpdate(prev, cardId, estimatedHeight, html));

      // Two-way live sync back to Video Player NotesTab (Option A)
      if (card.type === "video-note" && card.noteId) {
        lastNotesRevisionRef.current += 1;
        const nextNotes = updateCourseNoteContent(courseId, card.noteId, html);
        setNotes(nextNotes);
      }

      setEditingCardId(null);
    },
    [applyWithUndo, courseId, deleteCardsByIds],
  );

  const handleCancelCardEdit = useCallback((cardId: string) => {
    editingDraftRef.current = null;
    setEditingCardId(null);
    const card = stateRef.current.cards.find((c) => c.id === cardId);
    if (card && card.isCanvasOnly && !hasMeaningfulHtmlContent(card.htmlContent)) {
      setCanvasState((prev) => ({
        ...prev,
        cards: prev.cards.filter((c) => c.id !== cardId),
      }));
      setSelectedCardIds(new Set());
    }
  }, []);

  const commitPendingEdit = useCallback(() => {
    const pending = editingDraftRef.current;
    if (!pending) {
      if (editingCardId) handleCancelCardEdit(editingCardId);
      return;
    }
    handleSaveCardContent(pending.cardId, pending.html);
  }, [editingCardId, handleCancelCardEdit, handleSaveCardContent]);

  const finishConnection = useCallback(
    (fromId: string, targetCardId: string, fromSide?: CanvasSide) => {
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
    (targetCardId: string, ev: React.PointerEvent) => {
      if (!connectingFrom) {
        const wp = screenToWorld(ev.clientX, ev.clientY);
        setConnectingFrom({
          cardId: targetCardId,
          startClient: { x: ev.clientX, y: ev.clientY },
          pointerWorld: wp,
        });
        return;
      }

      if (connectingFrom.cardId === targetCardId) {
        setConnectingFrom(null);
        return;
      }

      finishConnection(connectingFrom.cardId, targetCardId, connectingFrom.fromSide);
      setConnectingFrom(null);
      setTool("select");
    },
    [connectingFrom, finishConnection, screenToWorld],
  );

  // Global keyboard shortcuts with editable element protection
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (lightboxImage) {
          setLightboxImage(null);
          return;
        }
        if (connectingFrom) {
          setConnectingFrom(null);
          return;
        }
        if (editingCardId) return;
        setSelectedCardIds(new Set());
        setSelectedGroupId(null);
        setSelectedEdgeId(null);
        setTool("select");
        return;
      }

      if (isEditableElement(e.target)) return;

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
        if (selectedCardIds.size > 0) {
          e.preventDefault();
          deleteCardsByIds(selectedCardIds);
          return;
        }
        if (selectedGroupId) {
          e.preventDefault();
          applyWithUndo((prev) => {
            const nextGroups = prev.groups.filter((g) => g.id !== selectedGroupId);
            const nextCards = prev.cards.map((c) =>
              c.groupId === selectedGroupId
                ? {
                    ...c,
                    groupId: null,
                    membershipState: c.isCanvasOnly
                      ? ("canvas-only" as const)
                      : ("detached" as const),
                  }
                : c,
            );
            return {
              ...prev,
              groups: nextGroups,
              cards: nextCards,
              edges: rebuildAllAutoChronoEdges(nextGroups, nextCards, prev.edges),
            };
          });
          setSelectedGroupId(null);
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
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [
    applyWithUndo,
    connectingFrom,
    deleteCardsByIds,
    editingCardId,
    handleRedo,
    handleUndo,
    insertCustomArtboard,
    lightboxImage,
    selectedCardIds,
    selectedEdgeId,
    selectedGroupId,
  ]);

  // Clipboard image paste onto open canvas
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isEditableElement(e.target) || editingCardId) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (!file) continue;
          e.preventDefault();
          const rect = containerRef.current?.getBoundingClientRect();
          const vp = stateRef.current.viewport;
          const cx = rect ? (rect.width / 2 - vp.x) / vp.zoom : 240;
          const cy = rect ? (rect.height / 2 - vp.y) / vp.zoom : 200;
          void insertImageFileAt(file, cx, cy);
          return;
        }
      }
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [editingCardId, insertImageFileAt]);

  // Native non-passive wheel listener for responsive zoom / pan
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (e.target instanceof Element && e.target.closest('[data-canvas-ui="true"]')) return;
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const zoomFactor = Math.exp(-e.deltaY * 0.0022);
        zoomAroundScreenPoint(e.clientX, e.clientY, stateRef.current.viewport.zoom * zoomFactor);
      } else {
        setCanvasState((prev) => ({
          ...prev,
          viewport: {
            ...prev.viewport,
            x: prev.viewport.x - e.deltaX,
            y: prev.viewport.y - e.deltaY,
          },
        }));
      }
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

    setSelectedCardIds(new Set());
    setSelectedGroupId(null);
    setSelectedEdgeId(null);

    e.currentTarget.setPointerCapture(e.pointerId);
    marqueeRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startWorldX: worldPt.x,
      startWorldY: worldPt.y,
    };
  };

  const handleStagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
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
      const wp = screenToWorld(e.clientX, e.clientY);
      const dx = wp.x - g.startWorldX;
      const dy = wp.y - g.startWorldY;
      if (Math.hypot(dx, dy) > 2) g.moved = true;

      let nextDropGroupId: string | null = null;
      setCanvasState((prev) => {
        const updatedCards = prev.cards.map((c) => {
          const orig = g.initialPositions.get(c.id);
          if (!orig) return c;
          const updated = { ...c, x: Math.round(orig.x + dx), y: Math.round(orig.y + dy) };
          if (c.id === g.primaryCardId) {
            const target = resolveCardGroupAtDrop(updated, prev.groups);
            nextDropGroupId = target?.id ?? null;
          }
          return updated;
        });
        return { ...prev, cards: updatedCards };
      });
      setDropTargetGroupId(nextDropGroupId);
      return;
    }

    if (dragGroupRef.current) {
      const g = dragGroupRef.current;
      const wp = screenToWorld(e.clientX, e.clientY);
      const dx = Math.round(wp.x - g.startWorldX);
      const dy = Math.round(wp.y - g.startWorldY);
      if (Math.hypot(dx, dy) > 2) g.moved = true;

      setCanvasState((prev) => ({
        ...prev,
        groups: prev.groups.map((gr) =>
          gr.id === g.groupId ? { ...gr, x: g.origGroupPos.x + dx, y: g.origGroupPos.y + dy } : gr,
        ),
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
        const nextW = Math.max(220, Math.round(r.origW + dw));
        const nextH = Math.max(96, Math.round(r.origH + dh));
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

      const hitIds = new Set(
        stateRef.current.cards
          .filter(
            (c) => c.x < wxMax && c.x + c.width > wxMin && c.y < wyMax && c.y + c.height > wyMin,
          )
          .map((c) => c.id),
      );
      setSelectedCardIds(hitIds);
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

    if (panGestureRef.current) {
      panGestureRef.current = null;
      setIsPanning(false);
    }

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
        const hitTarget = [...stateRef.current.cards]
          .reverse()
          .find(
            (c) =>
              c.id !== connectingFrom.cardId &&
              (!c.groupId || !collapsedIds.has(c.groupId)) &&
              wp.x >= c.x &&
              wp.x <= c.x + c.width &&
              wp.y >= c.y &&
              wp.y <= c.y + c.height,
          );
        if (hitTarget) {
          finishConnection(connectingFrom.cardId, hitTarget.id, connectingFrom.fromSide);
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
        const movedIds = new Set(gesture.initialPositions.keys());
        pushHistorySnapshot(gesture.snapshotBefore);
        setCanvasState((prev) => applyCardDropMembership(prev, movedIds));
      }
    }

    if (dragGroupRef.current) {
      if (dragGroupRef.current.moved) {
        pushHistorySnapshot(dragGroupRef.current.snapshotBefore);
      }
      dragGroupRef.current = null;
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

  const handleStartDragCard = (cardId: string, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const wp = screenToWorld(e.clientX, e.clientY);
    const activeIds = selectedCardIds.has(cardId) ? Array.from(selectedCardIds) : [cardId];

    const positions = new Map<string, { x: number; y: number }>();
    for (const id of activeIds) {
      const c = stateRef.current.cards.find((item) => item.id === id);
      if (c) positions.set(id, { x: c.x, y: c.y });
    }

    dragCardsRef.current = {
      startWorldX: wp.x,
      startWorldY: wp.y,
      initialPositions: positions,
      primaryCardId: cardId,
      snapshotBefore: snapshotOf(stateRef.current),
      moved: false,
    };
    try {
      containerRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handleStartDragGroup = (groupId: string, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const group = stateRef.current.groups.find((g) => g.id === groupId);
    if (!group) return;
    const wp = screenToWorld(e.clientX, e.clientY);

    const childOrigPositions = new Map<string, { x: number; y: number }>();
    for (const c of stateRef.current.cards) {
      if (c.groupId === groupId) {
        childOrigPositions.set(c.id, { x: c.x, y: c.y });
      }
    }

    const strokeOrigPoints = new Map<string, [number, number, number][]>();
    for (const s of stateRef.current.strokes) {
      if (s.parentGroupId === groupId) {
        strokeOrigPoints.set(
          s.id,
          s.points.map((pt) => [...pt] as [number, number, number]),
        );
      }
    }

    setSelectedGroupId(groupId);
    setSelectedCardIds(new Set());
    setSelectedEdgeId(null);

    dragGroupRef.current = {
      groupId,
      startWorldX: wp.x,
      startWorldY: wp.y,
      origGroupPos: { x: group.x, y: group.y },
      childOrigPositions,
      strokeOrigPoints,
      snapshotBefore: snapshotOf(stateRef.current),
      moved: false,
    };
    try {
      containerRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handleStartResize = (kind: "card" | "group", id: string, e: React.PointerEvent) => {
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
  };

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

  const stageCursor =
    isPanning || spacePressed || tool === "pan"
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
      onDoubleClick={(e) => {
        if (e.target !== e.currentTarget || isInkTool || tool === "pan") return;
        const wp = screenToWorld(e.clientX, e.clientY);
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
        style={{
          transform: `translate3d(${canvasState.viewport.x}px, ${canvasState.viewport.y}px, 0) scale(${canvasState.viewport.zoom})`,
          transformOrigin: "0 0",
        }}
        className="pointer-events-none absolute left-0 top-0"
      >
        {/* 1. Artboards (Pointer-Events Disabled While Pan/Draw/Spawn Active) */}
        <div className={stageInterceptsCards ? "pointer-events-none" : "pointer-events-auto"}>
          {canvasState.groups.map((group) => (
            <CanvasArtboard
              key={group.id}
              group={group}
              selected={selectedGroupId === group.id}
              isDropTarget={dropTargetGroupId === group.id}
              childCount={groupCounts.get(group.id) ?? 0}
              pointerEventsDisabled={stageInterceptsCards}
              onSelect={() => {
                setSelectedGroupId(group.id);
                setSelectedCardIds(new Set());
                setSelectedEdgeId(null);
              }}
              onStartDragHeader={(ev) => handleStartDragGroup(group.id, ev)}
              onStartResize={(ev) => handleStartResize("group", group.id, ev)}
              onRename={(nextTitle) => {
                applyWithUndo((prev) => ({
                  ...prev,
                  groups: prev.groups.map((g) =>
                    g.id === group.id ? { ...g, title: nextTitle } : g,
                  ),
                }));
              }}
              onToggleCollapse={() => {
                applyWithUndo((prev) => ({
                  ...prev,
                  groups: prev.groups.map((g) =>
                    g.id === group.id ? { ...g, collapsed: !g.collapsed } : g,
                  ),
                }));
              }}
              onTidy={() => {
                applyWithUndo((prev) => tidyVideoArtboard(prev, group.id));
              }}
              onDelete={() => {
                applyWithUndo((prev) => {
                  const nextGroups = prev.groups.filter((g) => g.id !== group.id);
                  const nextCards = prev.cards.map((c) =>
                    c.groupId === group.id
                      ? {
                          ...c,
                          groupId: null,
                          membershipState: c.isCanvasOnly
                            ? ("canvas-only" as const)
                            : ("detached" as const),
                        }
                      : c,
                  );
                  return {
                    ...prev,
                    groups: nextGroups,
                    cards: nextCards,
                    edges: rebuildAllAutoChronoEdges(nextGroups, nextCards, prev.edges),
                  };
                });
                if (selectedGroupId === group.id) setSelectedGroupId(null);
              }}
            />
          ))}
        </div>

        {/* 2. Arrows Layer */}
        <CanvasEdgesLayer
          edges={canvasState.edges}
          cards={visibleCards}
          selectedEdgeId={selectedEdgeId}
          connectingFrom={connectingFrom}
          interactive={!isInkTool && tool !== "pan"}
          onSelectEdge={(edgeId) => {
            setSelectedEdgeId(edgeId);
            setSelectedCardIds(new Set());
            setSelectedGroupId(null);
          }}
          onDeleteEdge={(edgeId) => {
            applyWithUndo((prev) => ({
              ...prev,
              edges: prev.edges.filter((edge) => edge.id !== edgeId),
            }));
            setSelectedEdgeId(null);
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
                isConnectMode={tool === "connect" || Boolean(connectingFrom)}
                pointerEventsDisabled={stageInterceptsCards}
                onSelect={(ev) => {
                  if (ev.shiftKey) {
                    setSelectedCardIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(card.id)) next.delete(card.id);
                      else next.add(card.id);
                      return next;
                    });
                  } else if (!selectedCardIds.has(card.id)) {
                    setSelectedCardIds(new Set([card.id]));
                  }
                  setSelectedGroupId(null);
                  setSelectedEdgeId(null);
                }}
                onStartDrag={(ev) => handleStartDragCard(card.id, ev)}
                onStartResize={(ev) => handleStartResize("card", card.id, ev)}
                onStartEdit={() => {
                  commitPendingEdit();
                  setSelectedCardIds(new Set([card.id]));
                  setEditingCardId(card.id);
                }}
                onCancelEdit={() => handleCancelCardEdit(card.id)}
                onDraftChange={(html) => {
                  editingDraftRef.current = { cardId: card.id, html };
                }}
                onSaveContent={(html) => handleSaveCardContent(card.id, html)}
                onMeasuredHeightGrow={(measuredHeight) => {
                  setCanvasState((prev) => applyCardHeightUpdate(prev, card.id, measuredHeight));
                }}
                onUpdateAccent={(accentIndex) => {
                  applyWithUndo((prev) => ({
                    ...prev,
                    cards: prev.cards.map((c) => (c.id === card.id ? { ...c, accentIndex } : c)),
                  }));
                }}
                onReturnToOriginGroup={() => handleReturnCardToOrigin(card.id)}
                onDelete={() => deleteCardsByIds(new Set([card.id]))}
                onStartConnect={(ev, side) => {
                  const wp = screenToWorld(ev.clientX, ev.clientY);
                  setConnectingFrom({
                    cardId: card.id,
                    fromSide: side,
                    startClient: { x: ev.clientX, y: ev.clientY },
                    pointerWorld: wp,
                  });
                  setTool("connect");
                }}
                onCompleteConnect={(ev) => handleCompleteConnect(card.id, ev)}
                onOpenLightbox={(src, c) =>
                  setLightboxImage({
                    src,
                    label:
                      c.originLessonIdx !== undefined
                        ? `${formatCanvasLessonCode(lessons, c.originLessonIdx)} · ${formatTimestamp(c.timestamp ?? 0)}`
                        : c.caption || "Image",
                  })
                }
                onUpdateImageCaption={(caption) => {
                  applyWithUndo((prev) => ({
                    ...prev,
                    cards: prev.cards.map((c) => (c.id === card.id ? { ...c, caption } : c)),
                  }));
                }}
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
        onTidyAll={() => {
          applyWithUndo((prev) => tidyAllCanvasArtboards(prev));
          toast("Canvas tidied");
        }}
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

      {/* Lightbox Image Preview */}
      {lightboxImage && (
        <div
          data-canvas-ui="true"
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="flex max-h-[90dvh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-card shadow-workspace"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
              <span className="text-xs font-semibold text-foreground">{lightboxImage.label}</span>
              <div className="flex items-center gap-1">
                <a
                  href={lightboxImage.src}
                  download="canvas-image.jpg"
                  aria-label="Download image"
                  className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <Download className="size-4" />
                </a>
                <button
                  type="button"
                  onClick={() => setLightboxImage(null)}
                  aria-label="Close"
                  className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
            <div className="flex min-h-[240px] flex-1 items-center justify-center overflow-auto bg-player p-4">
              <img
                src={lightboxImage.src}
                alt={lightboxImage.label}
                className="max-h-[75dvh] max-w-full rounded-lg object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
