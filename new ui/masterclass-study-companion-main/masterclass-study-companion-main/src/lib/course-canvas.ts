import type { CourseLessonItem } from "@/lib/course-lessons";
import { stripHtmlToText, type NoteItem } from "@/lib/course-notes";

export type CanvasSide = "top" | "right" | "bottom" | "left";

export type CanvasGroupType = "video-artboard" | "custom-artboard";
export type CanvasCardType = "video-note" | "canvas-note" | "image" | "text";
export type CanvasMembershipState = "auto" | "detached" | "reassigned" | "canvas-only";
export type CanvasEdgeKind = "auto-chrono" | "manual";
export type CanvasStrokeColorToken =
  | "ink"
  | "primary"
  | "violet"
  | "sky"
  | "amber"
  | "emerald"
  | "rose";

export interface CanvasGroup {
  id: string;
  type: CanvasGroupType;
  lessonIdx?: number | undefined;
  videoId?: string | undefined;
  title: string;
  subtitle?: string | undefined;
  x: number;
  y: number;
  width: number;
  height: number;
  tintIndex: number;
  layoutMode: "auto" | "custom";
  collapsed?: boolean | undefined;
}

export interface CanvasCard {
  id: string;
  type: CanvasCardType;
  noteId?: string | undefined;
  originLessonIdx?: number | undefined;
  originVideoId?: string | undefined;
  timestamp?: number | undefined;
  groupId: string | null;
  membershipState: CanvasMembershipState;
  isCanvasOnly: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  htmlContent: string;
  imageSrc?: string | undefined;
  caption?: string | undefined;
  accentIndex?: number | undefined;
  createdAt: number;
  updatedAt: number;
}

export interface CanvasEdge {
  id: string;
  edgeKind: CanvasEdgeKind;
  fromId: string;
  toId: string;
  fromSide?: CanvasSide | undefined;
  toSide?: CanvasSide | undefined;
  style: "dashed" | "solid";
  label?: string | undefined;
  createdAt: number;
}

export interface CanvasStroke {
  id: string;
  tool: "pen" | "highlighter";
  points: [number, number, number][];
  colorToken: CanvasStrokeColorToken;
  size: number;
  parentGroupId?: string | null | undefined;
}

export interface CanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface CourseCanvasState {
  version: 2;
  courseId: string;
  groups: CanvasGroup[];
  cards: CanvasCard[];
  edges: CanvasEdge[];
  strokes: CanvasStroke[];
  dismissedNoteIds: string[];
  viewport: CanvasViewport;
  lastSyncRevision: number;
  updatedAt: number;
}

export interface CanvasSummaryMetrics {
  exists: boolean;
  cardCount: number;
  artboardCount: number;
  edgeCount: number;
  strokeCount: number;
}

export const CANVAS_STORAGE_PREFIX = "tutin_course_canvas_";
export const CANVAS_GROUP_HEADER_HEIGHT = 48;
export const CANVAS_CARD_WIDTH = 304;
export const CANVAS_GROUP_WIDTH = 340;
export const CANVAS_PADDING_X = 18;
export const CANVAS_PADDING_BOTTOM = 22;
export const CANVAS_CARD_GAP = 24;
export const CANVAS_COL_GAP = 52;
export const CANVAS_START_X = 80;
export const CANVAS_START_Y = 96;
const HYSTERESIS_MARGIN = 18;

export function getCanvasStorageKey(courseId: string): string {
  return `${CANVAS_STORAGE_PREFIX}${courseId}`;
}

export function getVideoArtboardId(lessonIdx: number): string {
  return `vgroup-${lessonIdx}`;
}

export function getVideoNoteCardId(noteId: string): string {
  return `vcard-${noteId}`;
}

export function createCanvasId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function estimateVideoNoteCardHeight(html: string, imageCount: number): number {
  const plainText = stripHtmlToText(html);
  const lineEstimate = Math.max(2, Math.ceil(plainText.length / 36));
  const textHeight = Math.min(180, 44 + lineEstimate * 22);
  const mediaHeight = imageCount > 0 || html.includes("<img") ? 132 : 0;
  return Math.max(128, Math.min(340, textHeight + mediaHeight));
}

export function createEmptyCanvasState(courseId: string): CourseCanvasState {
  return {
    version: 2,
    courseId,
    groups: [],
    cards: [],
    edges: [],
    strokes: [],
    dismissedNoteIds: [],
    viewport: { x: 40, y: 30, zoom: 1 },
    lastSyncRevision: 0,
    updatedAt: Date.now(),
  };
}

/**
 * Upgrades legacy `.tutin/canvas.json` or SQLite `canvas_nodes` / `canvas_edges`
 * records into the v2 Canvas schema cleanly.
 */
export function normalizeLegacyCanvasPayload(
  raw: unknown,
  courseId: string,
  lessons: CourseLessonItem[],
): CourseCanvasState | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  if (obj["version"] === 2 && Array.isArray(obj["groups"]) && Array.isArray(obj["cards"])) {
    return {
      version: 2,
      courseId,
      groups: obj["groups"] as CanvasGroup[],
      cards: obj["cards"] as CanvasCard[],
      edges: Array.isArray(obj["edges"]) ? (obj["edges"] as CanvasEdge[]) : [],
      strokes: Array.isArray(obj["strokes"]) ? (obj["strokes"] as CanvasStroke[]) : [],
      dismissedNoteIds: Array.isArray(obj["dismissedNoteIds"])
        ? (obj["dismissedNoteIds"] as string[])
        : [],
      viewport: normalizeViewport(obj["viewport"]),
      lastSyncRevision: Number(obj["lastSyncRevision"]) || 0,
      updatedAt: Number(obj["updatedAt"]) || Date.now(),
    };
  }

  if (!Array.isArray(obj["nodes"])) return null;

  const groups: CanvasGroup[] = [];
  const cards: CanvasCard[] = [];
  const now = Date.now();

  for (const rawNode of obj["nodes"]) {
    if (!rawNode || typeof rawNode !== "object") continue;
    const node = rawNode as Record<string, unknown>;
    const id = typeof node["id"] === "string" ? node["id"] : createCanvasId("legacy");
    const type = String(node["type"] || "note");
    const x = Number(node["x"]) || 0;
    const y = Number(node["y"]) || 0;
    const width = Number(node["width"]) || (type === "group" ? CANVAS_GROUP_WIDTH : CANVAS_CARD_WIDTH);
    const height = Number(node["height"]) || (type === "group" ? 280 : 168);

    if (type === "group") {
      const lessonMatch = lessons.findIndex(
        (l) => l.lessonId === node["videoId"] || l.title === node["title"],
      );
      groups.push({
        id,
        type: lessonMatch >= 0 ? "video-artboard" : "custom-artboard",
        lessonIdx: lessonMatch >= 0 ? lessonMatch : undefined,
        videoId: typeof node["videoId"] === "string" ? node["videoId"] : undefined,
        title:
          typeof node["title"] === "string" && node["title"] ? node["title"] : "Artboard",
        x,
        y,
        width,
        height,
        tintIndex: groups.length % 5,
        layoutMode: "custom",
        collapsed: Boolean(node["collapsed"]),
      });
    } else {
      const noteId = typeof node["noteId"] === "string" ? node["noteId"] : undefined;
      const parentGroupId =
        typeof node["parentGroupId"] === "string" ? node["parentGroupId"] : null;
      const lessonIdx = lessons.findIndex(
        (l) => l.lessonId === node["videoId"] || l.title === node["videoTitle"],
      );
      const isSynced = Boolean(noteId);
      cards.push({
        id,
        type: isSynced ? "video-note" : "canvas-note",
        noteId,
        originLessonIdx: lessonIdx >= 0 ? lessonIdx : undefined,
        originVideoId: typeof node["videoId"] === "string" ? node["videoId"] : undefined,
        timestamp: Number.isFinite(Number(node["timestamp"]))
          ? Number(node["timestamp"])
          : undefined,
        groupId: parentGroupId,
        membershipState: isSynced ? (parentGroupId ? "auto" : "detached") : "canvas-only",
        isCanvasOnly: !isSynced,
        x,
        y,
        width,
        height,
        htmlContent: typeof node["content"] === "string" ? node["content"] : "",
        accentIndex: 0,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  const edges: CanvasEdge[] = [];
  if (Array.isArray(obj["edges"])) {
    for (const rawEdge of obj["edges"]) {
      if (!rawEdge || typeof rawEdge !== "object") continue;
      const edge = rawEdge as Record<string, unknown>;
      const fromId = String(edge["fromNodeId"] || edge["fromId"] || "");
      const toId = String(edge["toNodeId"] || edge["toId"] || "");
      if (!fromId || !toId) continue;
      edges.push({
        id: typeof edge["id"] === "string" ? edge["id"] : createCanvasId("cedge"),
        edgeKind: "manual",
        fromId,
        toId,
        style: "solid",
        createdAt: now,
      });
    }
  }

  return {
    version: 2,
    courseId,
    groups,
    cards,
    edges,
    strokes: [],
    dismissedNoteIds: [],
    viewport: normalizeViewport(obj["viewport"]),
    lastSyncRevision: 0,
    updatedAt: now,
  };
}

function normalizeViewport(raw: unknown): CanvasViewport {
  if (!raw || typeof raw !== "object") {
    return { x: 40, y: 30, zoom: 1 };
  }
  const obj = raw as Record<string, unknown>;
  const rawPan = obj["pan"];
  const pan =
    rawPan && typeof rawPan === "object"
      ? (rawPan as Record<string, unknown>)
      : null;
  const x = Number(pan?.["x"] ?? obj["x"]) || 40;
  const y = Number(pan?.["y"] ?? obj["y"]) || 30;
  const zoom = Math.max(0.25, Math.min(2, Number(obj["zoom"]) || 1));
  return { x, y, zoom };
}

export function loadCourseCanvas(
  courseId: string,
  lessons: CourseLessonItem[],
): CourseCanvasState | null {
  if (typeof window === "undefined") return null;
  try {
    const rawStr = window.localStorage.getItem(getCanvasStorageKey(courseId));
    if (!rawStr) return null;
    const parsed = JSON.parse(rawStr);
    return normalizeLegacyCanvasPayload(parsed, courseId, lessons);
  } catch {
    return null;
  }
}

export function saveCourseCanvas(state: CourseCanvasState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      getCanvasStorageKey(state.courseId),
      JSON.stringify({ ...state, updatedAt: Date.now() }),
    );
  } catch (err) {
    console.warn("[CourseCanvas] Failed to persist canvas state:", err);
  }
}

export function getCanvasSummaryMetrics(courseId: string): CanvasSummaryMetrics {
  if (typeof window === "undefined") {
    return { exists: false, cardCount: 0, artboardCount: 0, edgeCount: 0, strokeCount: 0 };
  }
  try {
    const rawStr = window.localStorage.getItem(getCanvasStorageKey(courseId));
    if (!rawStr) {
      return { exists: false, cardCount: 0, artboardCount: 0, edgeCount: 0, strokeCount: 0 };
    }
    const parsed = JSON.parse(rawStr) as Partial<CourseCanvasState>;
    const cards = Array.isArray(parsed.cards) ? parsed.cards.length : 0;
    const groups = Array.isArray(parsed.groups) ? parsed.groups.length : 0;
    const edges = Array.isArray(parsed.edges) ? parsed.edges.length : 0;
    const strokes = Array.isArray(parsed.strokes) ? parsed.strokes.length : 0;
    return {
      exists: cards > 0 || groups > 0 || strokes > 0,
      cardCount: cards,
      artboardCount: groups,
      edgeCount: edges,
      strokeCount: strokes,
    };
  } catch {
    return { exists: false, cardCount: 0, artboardCount: 0, edgeCount: 0, strokeCount: 0 };
  }
}

function findNextColumnX(groups: CanvasGroup[]): number {
  if (groups.length === 0) return CANVAS_START_X;
  let maxRight = CANVAS_START_X - CANVAS_COL_GAP;
  for (const g of groups) {
    if (g.x + g.width > maxRight) maxRight = g.x + g.width;
  }
  return maxRight + CANVAS_COL_GAP;
}

export function buildAutoChronoEdgesForGroup(
  group: CanvasGroup,
  cards: CanvasCard[],
): CanvasEdge[] {
  if (group.type !== "video-artboard" || group.lessonIdx === undefined) return [];
  const eligible = cards
    .filter(
      (c) =>
        c.groupId === group.id &&
        c.type === "video-note" &&
        c.originLessonIdx === group.lessonIdx &&
        c.membershipState === "auto",
    )
    .sort((a, b) => {
      const ta = a.timestamp ?? 0;
      const tb = b.timestamp ?? 0;
      if (ta !== tb) return ta - tb;
      return a.createdAt - b.createdAt;
    });

  const result: CanvasEdge[] = [];
  for (let i = 0; i < eligible.length - 1; i++) {
    const from = eligible[i]!;
    const to = eligible[i + 1]!;
    result.push({
      id: `chrono-${group.id}-${from.id}-${to.id}`,
      edgeKind: "auto-chrono",
      fromId: from.id,
      toId: to.id,
      style: "dashed",
      createdAt: from.createdAt,
    });
  }
  return result;
}

export function rebuildAllAutoChronoEdges(
  groups: CanvasGroup[],
  cards: CanvasCard[],
  existingEdges: CanvasEdge[],
): CanvasEdge[] {
  const validCardIds = new Set(cards.map((c) => c.id));
  const manualEdges = existingEdges.filter(
    (e) =>
      e.edgeKind === "manual" && validCardIds.has(e.fromId) && validCardIds.has(e.toId),
  );
  const autoEdges = groups.flatMap((group) => buildAutoChronoEdgesForGroup(group, cards));
  return [...manualEdges, ...autoEdges];
}

export function findFreeSlotInGroup(
  group: CanvasGroup,
  cards: CanvasCard[],
  cardWidth: number,
  cardHeight: number,
): { x: number; y: number; requiredGroupHeight: number } {
  const inGroup = cards.filter((c) => c.groupId === group.id);
  const x = group.x + CANVAS_PADDING_X;

  if (inGroup.length === 0) {
    const y = group.y + CANVAS_GROUP_HEADER_HEIGHT + 14;
    return {
      x,
      y,
      requiredGroupHeight: Math.max(
        group.height,
        y - group.y + cardHeight + CANVAS_PADDING_BOTTOM,
      ),
    };
  }

  let maxBottom = group.y + CANVAS_GROUP_HEADER_HEIGHT;
  for (const c of inGroup) {
    if (c.y + c.height > maxBottom) maxBottom = c.y + c.height;
  }

  const candidateY = maxBottom + CANVAS_CARD_GAP;
  // Nudge downward only if any card in the column somehow overlaps candidateY band
  let y = candidateY;
  let safety = 0;
  while (safety < 40) {
    const collides = inGroup.some(
      (c) =>
        x < c.x + c.width &&
        x + cardWidth > c.x &&
        y < c.y + c.height + 8 &&
        y + cardHeight > c.y - 8,
    );
    if (!collides) break;
    y += 40;
    safety += 1;
  }

  const requiredGroupHeight = Math.max(
    group.height,
    y - group.y + cardHeight + CANVAS_PADDING_BOTTOM,
  );
  return { x, y, requiredGroupHeight };
}

function shiftGroupsBelowColumn(
  groups: CanvasGroup[],
  cards: CanvasCard[],
  strokes: CanvasStroke[],
  sourceGroup: CanvasGroup,
  deltaHeight: number,
): void {
  if (deltaHeight <= 0) return;
  const oldBottom = sourceGroup.y + sourceGroup.height;
  const sourceRight = sourceGroup.x + sourceGroup.width;

  const shiftedGroupIds = new Set<string>();
  for (const g of groups) {
    if (g.id === sourceGroup.id) continue;
    const horizOverlap = g.x < sourceRight && g.x + g.width > sourceGroup.x;
    if (horizOverlap && g.y >= oldBottom - 12 && g.y < oldBottom + deltaHeight + 24) {
      g.y += deltaHeight;
      shiftedGroupIds.add(g.id);
    }
  }

  if (shiftedGroupIds.size === 0) return;

  for (const c of cards) {
    if (c.groupId && shiftedGroupIds.has(c.groupId)) {
      c.y += deltaHeight;
    }
  }
  for (const s of strokes) {
    if (s.parentGroupId && shiftedGroupIds.has(s.parentGroupId)) {
      s.points = s.points.map(([px, py, pressure]) => [px, py + deltaHeight, pressure]);
    }
  }
}

function reflowAutoVideoGroup(
  group: CanvasGroup,
  cards: CanvasCard[],
): void {
  const inGroup = cards.filter((c) => c.groupId === group.id);
  const autoVideoCards = inGroup
    .filter(
      (c) =>
        c.type === "video-note" &&
        c.originLessonIdx === group.lessonIdx &&
        c.membershipState === "auto",
    )
    .sort((a, b) => {
      const ta = a.timestamp ?? 0;
      const tb = b.timestamp ?? 0;
      if (ta !== tb) return ta - tb;
      return a.createdAt - b.createdAt;
    });

  let cursorY = group.y + CANVAS_GROUP_HEADER_HEIGHT + 14;
  for (const card of autoVideoCards) {
    card.x = group.x + CANVAS_PADDING_X;
    card.y = cursorY;
    cursorY += card.height + CANVAS_CARD_GAP;
  }

  // Keep any canvas-only cards pinned below auto cards if they overlap cleanly
  const extras = inGroup.filter((c) => !autoVideoCards.includes(c));
  for (const extra of extras) {
    if (extra.y < cursorY) {
      extra.y = cursorY;
      cursorY += extra.height + CANVAS_CARD_GAP;
    } else {
      cursorY = Math.max(cursorY, extra.y + extra.height + CANVAS_CARD_GAP);
    }
  }

  group.height = Math.max(
    180,
    (cursorY > group.y + CANVAS_GROUP_HEADER_HEIGHT + 14
      ? cursorY - CANVAS_CARD_GAP + CANVAS_PADDING_BOTTOM
      : 180) - group.y,
  );
}

/**
 * Reconciles synced Video Notes from `course-notes.ts` with the current whiteboard state.
 * Preserves custom card positions, detached notes, cross-artboard drops, manual edges,
 * and freehand strokes while cleanly inserting/updating/removing synced Player notes.
 */
export function reconcileCanvasWithNotes(
  existingState: CourseCanvasState | null,
  notes: NoteItem[],
  lessons: CourseLessonItem[],
  courseId: string,
  syncRevision = 0,
): CourseCanvasState {
  const base = existingState
    ? {
        ...existingState,
        groups: existingState.groups.map((g) => ({ ...g })),
        cards: existingState.cards.map((c) => ({ ...c })),
        edges: existingState.edges.map((e) => ({ ...e })),
        strokes: existingState.strokes.map((s) => ({
          ...s,
          points: s.points.map((pt) => [...pt] as [number, number, number]),
        })),
        dismissedNoteIds: [...existingState.dismissedNoteIds],
      }
    : createEmptyCanvasState(courseId);

  const noteById = new Map(notes.map((n) => [n.id, n]));
  const dismissedSet = new Set(base.dismissedNoteIds.filter((id) => noteById.has(id)));

  // 1. Remove synced cards whose Player note was actually deleted
  const survivingCards: CanvasCard[] = [];
  for (const card of base.cards) {
    if (card.type === "video-note" && card.noteId && !noteById.has(card.noteId)) {
      continue;
    }
    survivingCards.push(card);
  }
  base.cards = survivingCards;
  base.dismissedNoteIds = Array.from(dismissedSet);

  const cardByNoteId = new Map<string, CanvasCard>();
  for (const card of base.cards) {
    if (card.noteId) cardByNoteId.set(card.noteId, card);
  }

  const autoGroupsToReflow = new Set<string>();
  const now = Date.now();

  // Sort notes consistently so fresh columns populate chronologically
  const sortedNotes = [...notes].sort((a, b) => {
    if (a.lessonIdx !== b.lessonIdx) return a.lessonIdx - b.lessonIdx;
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    return a.createdAt - b.createdAt;
  });

  for (const note of sortedNotes) {
    if (dismissedSet.has(note.id)) continue;

    const existingCard = cardByNoteId.get(note.id);
    if (existingCard) {
      // Option A: Live content/timestamp update without moving user-positioned card
      const changedContent = existingCard.htmlContent !== note.content;
      existingCard.htmlContent = note.content;
      existingCard.timestamp = note.timestamp;
      existingCard.originLessonIdx = note.lessonIdx;
      existingCard.originVideoId = note.videoId || lessons[note.lessonIdx]?.lessonId;
      if (changedContent) {
        existingCard.height = Math.max(
          existingCard.height,
          estimateVideoNoteCardHeight(note.content, note.images.length),
        );
        existingCard.updatedAt = now;
        if (existingCard.groupId && existingCard.membershipState === "auto") {
          const g = base.groups.find((gr) => gr.id === existingCard.groupId);
          if (g && g.layoutMode === "auto") autoGroupsToReflow.add(g.id);
        }
      }
      continue;
    }

    // 2. Spawn or locate origin Video Artboard
    const groupId = getVideoArtboardId(note.lessonIdx);
    const lesson = lessons[note.lessonIdx];
    const existingGroup = base.groups.find((g) => g.id === groupId);
    const targetGroup: CanvasGroup =
      existingGroup ??
      (() => {
        const colX = findNextColumnX(base.groups);
        const created: CanvasGroup = {
          id: groupId,
          type: "video-artboard",
          lessonIdx: note.lessonIdx,
          videoId: lesson?.lessonId ?? note.videoId,
          title: lesson ? `L${note.lessonIdx + 1} · ${lesson.title}` : `Lesson ${note.lessonIdx + 1}`,
          subtitle: lesson?.duration,
          x: colX,
          y: CANVAS_START_Y,
          width: CANVAS_GROUP_WIDTH,
          height: 220,
          tintIndex: note.lessonIdx % 5,
          layoutMode: "auto",
          collapsed: false,
        };
        base.groups.push(created);
        return created;
      })();

    const estHeight = estimateVideoNoteCardHeight(note.content, note.images.length);

    if (targetGroup.layoutMode === "auto") {
      const newCard: CanvasCard = {
        id: getVideoNoteCardId(note.id),
        type: "video-note",
        noteId: note.id,
        originLessonIdx: note.lessonIdx,
        originVideoId: lesson?.lessonId ?? note.videoId,
        timestamp: note.timestamp,
        groupId: targetGroup.id,
        membershipState: "auto",
        isCanvasOnly: false,
        x: targetGroup.x + CANVAS_PADDING_X,
        y: targetGroup.y + CANVAS_GROUP_HEADER_HEIGHT + 14,
        width: CANVAS_CARD_WIDTH,
        height: estHeight,
        htmlContent: note.content,
        createdAt: note.createdAt,
        updatedAt: now,
      };
      base.cards.push(newCard);
      cardByNoteId.set(note.id, newCard);
      autoGroupsToReflow.add(targetGroup.id);
    } else {
      // Option A custom mode: keep every existing card & detached card where it sits,
      // append new Player note into the first collision-free bottom slot extending the Artboard.
      const prevHeight = targetGroup.height;
      const slot = findFreeSlotInGroup(targetGroup, base.cards, CANVAS_CARD_WIDTH, estHeight);
      const delta = slot.requiredGroupHeight - prevHeight;
      if (delta > 0) {
        shiftGroupsBelowColumn(base.groups, base.cards, base.strokes, targetGroup, delta);
        targetGroup.height = slot.requiredGroupHeight;
      }

      const newCard: CanvasCard = {
        id: getVideoNoteCardId(note.id),
        type: "video-note",
        noteId: note.id,
        originLessonIdx: note.lessonIdx,
        originVideoId: lesson?.lessonId ?? note.videoId,
        timestamp: note.timestamp,
        groupId: targetGroup.id,
        membershipState: "auto",
        isCanvasOnly: false,
        x: slot.x,
        y: slot.y,
        width: CANVAS_CARD_WIDTH,
        height: estHeight,
        htmlContent: note.content,
        createdAt: note.createdAt,
        updatedAt: now,
      };
      base.cards.push(newCard);
      cardByNoteId.set(note.id, newCard);
    }
  }

  for (const gId of autoGroupsToReflow) {
    const group = base.groups.find((g) => g.id === gId);
    if (group) {
      const prevH = group.height;
      reflowAutoVideoGroup(group, base.cards);
      if (group.height > prevH) {
        shiftGroupsBelowColumn(base.groups, base.cards, base.strokes, group, group.height - prevH);
      }
    }
  }

  base.edges = rebuildAllAutoChronoEdges(base.groups, base.cards, base.edges);
  base.lastSyncRevision = Math.max(base.lastSyncRevision, syncRevision);
  return base;
}

/**
 * Evaluates center-point artboard containment on `pointerup` with hysteresis
 * so cards never flicker when brushing near borders.
 */
export function resolveCardGroupAtDrop(
  card: CanvasCard,
  groups: CanvasGroup[],
): CanvasGroup | null {
  const cx = card.x + card.width / 2;
  const cy = card.y + card.height / 2;

  if (card.groupId) {
    const current = groups.find((g) => g.id === card.groupId && !g.collapsed);
    if (
      current &&
      cx >= current.x - HYSTERESIS_MARGIN &&
      cx <= current.x + current.width + HYSTERESIS_MARGIN &&
      cy >= current.y - HYSTERESIS_MARGIN &&
      cy <= current.y + current.height + HYSTERESIS_MARGIN
    ) {
      return current;
    }
  }

  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i]!;
    if (g.collapsed) continue;
    if (
      cx >= g.x &&
      cx <= g.x + g.width &&
      cy >= g.y + CANVAS_GROUP_HEADER_HEIGHT * 0.5 &&
      cy <= g.y + g.height
    ) {
      return g;
    }
  }

  return null;
}

/**
 * Updates card membership when dropped inside/outside an Artboard and
 * automatically bridges/updates `auto-chrono` arrows per Option A rules.
 */
export function applyCardDropMembership(
  state: CourseCanvasState,
  movedCardIds: Set<string>,
): CourseCanvasState {
  const nextGroups = state.groups.map((g) => ({ ...g }));
  const nextCards = state.cards.map((c) => {
    if (!movedCardIds.has(c.id)) return { ...c };

    const targetGroup = resolveCardGroupAtDrop(c, nextGroups);
    const prevGroupId = c.groupId;

    if (prevGroupId && prevGroupId !== targetGroup?.id) {
      const prevG = nextGroups.find((g) => g.id === prevGroupId);
      if (prevG) prevG.layoutMode = "custom";
    }

    if (!targetGroup) {
      return {
        ...c,
        groupId: null,
        membershipState: c.isCanvasOnly ? ("canvas-only" as const) : ("detached" as const),
      };
    }

    if (targetGroup.id === prevGroupId) {
      // Moved cleanly inside the same Video Artboard -> mark artboard custom
      if (targetGroup.type === "video-artboard") {
        targetGroup.layoutMode = "custom";
      }
      return { ...c };
    }

    // Moved into a different group
    if (c.isCanvasOnly) {
      return { ...c, groupId: targetGroup.id, membershipState: "canvas-only" as const };
    }

    const isOriginGroup =
      targetGroup.type === "video-artboard" && targetGroup.lessonIdx === c.originLessonIdx;
    return {
      ...c,
      groupId: targetGroup.id,
      membershipState: isOriginGroup ? ("auto" as const) : ("reassigned" as const),
    };
  });

  // Expand artboard gently if dropped card extends near its edge
  for (const g of nextGroups) {
    const children = nextCards.filter((c) => c.groupId === g.id);
    for (const child of children) {
      const neededRight = child.x + child.width + CANVAS_PADDING_X - g.x;
      const neededBottom = child.y + child.height + CANVAS_PADDING_BOTTOM - g.y;
      if (neededRight > g.width) g.width = neededRight;
      if (neededBottom > g.height) g.height = neededBottom;
    }
  }

  return {
    ...state,
    groups: nextGroups,
    cards: nextCards,
    edges: rebuildAllAutoChronoEdges(nextGroups, nextCards, state.edges),
  };
}

export function tidyVideoArtboard(
  state: CourseCanvasState,
  groupId: string,
): CourseCanvasState {
  const nextGroups = state.groups.map((g) => ({ ...g }));
  const nextCards = state.cards.map((c) => ({ ...c }));
  const target = nextGroups.find((g) => g.id === groupId);
  if (!target) return state;

  target.layoutMode = "auto";
  if (target.type === "video-artboard") {
    for (const c of nextCards) {
      if (
        c.groupId === target.id &&
        c.type === "video-note" &&
        c.originLessonIdx === target.lessonIdx
      ) {
        c.membershipState = "auto";
      }
    }
    reflowAutoVideoGroup(target, nextCards);
  } else {
    // Tidy custom artboard items top-to-bottom cleanly
    const inGroup = nextCards.filter((c) => c.groupId === target.id).sort((a, b) => a.y - b.y);
    let cy = target.y + CANVAS_GROUP_HEADER_HEIGHT + 14;
    for (const c of inGroup) {
      c.x = target.x + CANVAS_PADDING_X;
      c.y = cy;
      cy += c.height + CANVAS_CARD_GAP;
    }
    target.height = Math.max(
      180,
      inGroup.length > 0 ? cy - CANVAS_CARD_GAP + CANVAS_PADDING_BOTTOM - target.y : 180,
    );
  }

  return {
    ...state,
    groups: nextGroups,
    cards: nextCards,
    edges: rebuildAllAutoChronoEdges(nextGroups, nextCards, state.edges),
  };
}

export function tidyAllCanvasArtboards(state: CourseCanvasState): CourseCanvasState {
  let next: CourseCanvasState = {
    ...state,
    groups: state.groups.map((g) => ({ ...g })),
    cards: state.cards.map((c) => ({ ...c })),
    edges: state.edges.map((e) => ({ ...e })),
    strokes: state.strokes.map((s) => ({
      ...s,
      points: s.points.map((pt) => [...pt] as [number, number, number]),
    })),
  };

  const ordered = [...next.groups].sort((a, b) => {
    const ai = a.lessonIdx ?? 9999;
    const bi = b.lessonIdx ?? 9999;
    return ai !== bi ? ai - bi : a.x - b.x;
  });

  let cursorX = CANVAS_START_X;
  for (const g of ordered) {
    const dx = cursorX - g.x;
    const dy = CANVAS_START_Y - g.y;
    g.x = cursorX;
    g.y = CANVAS_START_Y;
    if (g.type === "video-artboard") {
      const childMaxWidth = next.cards
        .filter((c) => c.groupId === g.id)
        .reduce((max, c) => Math.max(max, c.width + CANVAS_PADDING_X * 2), CANVAS_GROUP_WIDTH);
      g.width = childMaxWidth;
    }
    for (const c of next.cards) {
      if (c.groupId === g.id) {
        c.x += dx;
        c.y += dy;
      }
    }
    for (const s of next.strokes) {
      if (s.parentGroupId === g.id) {
        s.points = s.points.map(([px, py, pressure]) => [px + dx, py + dy, pressure]);
      }
    }
    next = tidyVideoArtboard(next, g.id);
    const updatedGroup = next.groups.find((gr) => gr.id === g.id);
    cursorX += (updatedGroup?.width ?? CANVAS_GROUP_WIDTH) + CANVAS_COL_GAP;
  }

  return next;
}

export function getDetachedSideAnchors(
  from: { x: number; y: number; width: number; height: number },
  to: { x: number; y: number; width: number; height: number },
  explicitFrom?: CanvasSide,
  explicitTo?: CanvasSide,
): {
  fromPoint: { x: number; y: number; side: CanvasSide };
  toPoint: { x: number; y: number; side: CanvasSide };
} {
  const fromCx = from.x + from.width / 2;
  const fromCy = from.y + from.height / 2;
  const toCx = to.x + to.width / 2;
  const toCy = to.y + to.height / 2;
  const dx = toCx - fromCx;
  const dy = toCy - fromCy;

  let fromSide: CanvasSide = explicitFrom ?? "bottom";
  let toSide: CanvasSide = explicitTo ?? "top";

  if (!explicitFrom || !explicitTo) {
    if (Math.abs(dx) > Math.abs(dy) * 1.15) {
      fromSide = dx >= 0 ? "right" : "left";
      toSide = dx >= 0 ? "left" : "right";
    } else {
      fromSide = dy >= 0 ? "bottom" : "top";
      toSide = dy >= 0 ? "top" : "bottom";
    }
  }

  const pointForSide = (
    rect: { x: number; y: number; width: number; height: number },
    side: CanvasSide,
  ) => {
    switch (side) {
      case "top":
        return { x: rect.x + rect.width / 2, y: rect.y, side };
      case "right":
        return { x: rect.x + rect.width, y: rect.y + rect.height / 2, side };
      case "bottom":
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height, side };
      case "left":
        return { x: rect.x, y: rect.y + rect.height / 2, side };
    }
  };

  return {
    fromPoint: pointForSide(from, fromSide),
    toPoint: pointForSide(to, toSide),
  };
}

export function hitTestStroke(
  stroke: CanvasStroke,
  worldX: number,
  worldY: number,
  radiusWorld: number,
): boolean {
  const threshold = radiusWorld + stroke.size * 0.55;
  const thresholdSq = threshold * threshold;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [px, py] of stroke.points) {
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
  }

  if (
    worldX < minX - threshold ||
    worldX > maxX + threshold ||
    worldY < minY - threshold ||
    worldY > maxY + threshold
  ) {
    return false;
  }

  if (stroke.points.length === 0) return false;
  if (stroke.points.length === 1) {
    const [px, py] = stroke.points[0]!;
    const dx = px - worldX;
    const dy = py - worldY;
    return dx * dx + dy * dy <= thresholdSq;
  }

  for (let i = 0; i < stroke.points.length - 1; i++) {
    const [ax, ay] = stroke.points[i]!;
    const [bx, by] = stroke.points[i + 1]!;
    const vx = bx - ax;
    const vy = by - ay;
    const wx = worldX - ax;
    const wy = worldY - ay;
    const lenSq = vx * vx + vy * vy;
    const t = lenSq > 0 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / lenSq)) : 0;
    const closestX = ax + t * vx;
    const closestY = ay + t * vy;
    const dx = worldX - closestX;
    const dy = worldY - closestY;
    if (dx * dx + dy * dy <= thresholdSq) {
      return true;
    }
  }
  return false;
}
