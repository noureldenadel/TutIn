import type { CourseLessonItem } from "@/lib/course-lessons";
import { stripHtmlToText, type NoteItem } from "@/lib/course-notes";

export type CanvasSide = "top" | "right" | "bottom" | "left";

export type CanvasGroupType = "video-artboard" | "custom-artboard";
export type CanvasCardType = "video-note" | "canvas-note" | "image" | "text";
export type CanvasMembershipState = "auto" | "detached" | "reassigned" | "canvas-only";
export type CanvasEdgeKind = "auto-chrono" | "manual";
export type CanvasStrokeColorToken =
  "ink" | "primary" | "violet" | "sky" | "amber" | "emerald" | "rose";

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
export const CANVAS_MIN_ZOOM = 0.25;
export const CANVAS_MAX_ZOOM = 3;
const HYSTERESIS_MARGIN = 18;

export function getVideoArtboardId(lessonIdx: number, courseId?: string): string {
  return courseId ? `vgroup-${courseId}-${lessonIdx}` : `vgroup-${lessonIdx}`;
}

function findVideoArtboardGroup(
  groups: CanvasGroup[],
  lessonIdx: number,
  courseId?: string,
): CanvasGroup | undefined {
  const scopedId = getVideoArtboardId(lessonIdx, courseId);
  const legacyId = getVideoArtboardId(lessonIdx);
  return groups.find(
    (g) =>
      (g.type === "video-artboard" && g.lessonIdx === lessonIdx) ||
      g.id === scopedId ||
      g.id === legacyId,
  );
}

export function getVideoNoteCardId(noteId: string): string {
  return `vcard-${noteId}`;
}

export function formatCanvasLessonCode(lessons: CourseLessonItem[], lessonIdx: number): string {
  const lesson = lessons[lessonIdx];
  if (lesson) {
    return `M${lesson.modIdx + 1}L${lesson.lessonInModule + 1}`;
  }
  return `L${lessonIdx + 1}`;
}

export function formatCanvasArtboardTitle(lessons: CourseLessonItem[], lessonIdx: number): string {
  const lesson = lessons[lessonIdx];
  if (!lesson) return `Lesson ${lessonIdx + 1}`;
  return `${formatCanvasLessonCode(lessons, lessonIdx)} · ${lesson.title}`;
}

export function fitArtboardsToChildren(groups: CanvasGroup[], cards: CanvasCard[]): void {
  for (const g of groups) {
    const children = cards.filter((c) => c.groupId === g.id);
    if (children.length === 0) continue;

    for (const child of children) {
      const leftOverflow = g.x + CANVAS_PADDING_X - child.x;
      if (leftOverflow > 0) {
        g.x -= leftOverflow;
        g.width += leftOverflow;
      }

      const topOverflow = g.y + CANVAS_GROUP_HEADER_HEIGHT + 12 - child.y;
      if (topOverflow > 0) {
        g.y -= topOverflow;
        g.height += topOverflow;
      }

      const neededRight = child.x + child.width + CANVAS_PADDING_X - g.x;
      if (neededRight > g.width) g.width = neededRight;

      const neededBottom = child.y + child.height + CANVAS_PADDING_BOTTOM - g.y;
      if (neededBottom > g.height) g.height = neededBottom;
    }
  }
}

export function createCanvasId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function estimateVideoNoteCardHeight(
  html: string,
  imageCount: number,
  cardWidth = CANVAS_CARD_WIDTH,
): number {
  const plainText = stripHtmlToText(html);
  const blockBreaks = (html.match(/<(?:p|div|li|h[1-6]|blockquote|tr|br)\b/gi) ?? []).length;
  const charsPerLine = Math.max(26, Math.round((cardWidth - 28) / 7.8));
  const lineEstimate = Math.max(
    plainText.length > 0 ? 1 : 0,
    Math.ceil(plainText.length / charsPerLine) + Math.floor(blockBreaks * 0.45),
  );
  const textHeight = plainText.length > 0 ? 58 + lineEstimate * 22 : 48;
  const imgTags = (html.match(/<img\b/gi) ?? []).length;
  const effectiveImages = Math.max(imageCount, imgTags);
  // Embedded screenshots scale cleanly inside the card column (capped at 380px high)
  const estImgHeight = Math.min(380, Math.round((cardWidth - 28) * (9 / 16))) + 16;
  const mediaHeight = effectiveImages * estImgHeight;
  return Math.max(128, Math.min(2200, textHeight + mediaHeight));
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
    const width =
      Number(node["width"]) || (type === "group" ? CANVAS_GROUP_WIDTH : CANVAS_CARD_WIDTH);
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
        title: typeof node["title"] === "string" && node["title"] ? node["title"] : "Artboard",
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
  const pan = rawPan && typeof rawPan === "object" ? (rawPan as Record<string, unknown>) : null;
  const rawX = Number(pan?.["x"] ?? obj["x"]);
  const rawY = Number(pan?.["y"] ?? obj["y"]);
  const rawZoom = Number(obj["zoom"]);
  const x = Number.isFinite(rawX) ? rawX : 40;
  const y = Number.isFinite(rawY) ? rawY : 30;
  const zoom = Math.max(
    CANVAS_MIN_ZOOM,
    Math.min(CANVAS_MAX_ZOOM, Number.isFinite(rawZoom) && rawZoom > 0 ? rawZoom : 1),
  );
  return { x, y, zoom };
}

const canvasMemoryCache = new Map<string, CourseCanvasState>();
const pendingCanvasSaves = new Map<string, number>();
const pendingViewportSaves = new Map<string, { timer: number; viewport: CanvasViewport }>();

export async function fetchCourseCanvas(
  courseId: string,
  lessons: CourseLessonItem[],
): Promise<CourseCanvasState | null> {
  if (typeof window === "undefined" || !courseId) return null;
  try {
    const res = await fetch(`/api/canvas/${encodeURIComponent(courseId)}`);
    if (!res.ok) return canvasMemoryCache.get(courseId) ?? null;
    const parsed = (await res.json()) as unknown;
    const normalized = normalizeLegacyCanvasPayload(parsed, courseId, lessons);
    if (normalized) {
      canvasMemoryCache.set(courseId, normalized);
    }
    return normalized;
  } catch {
    return canvasMemoryCache.get(courseId) ?? null;
  }
}

export async function saveCourseCanvasToServer(state: CourseCanvasState): Promise<void> {
  if (typeof window === "undefined" || !state.courseId) return;
  const pendingVp = pendingViewportSaves.get(state.courseId);
  if (pendingVp !== undefined) {
    window.clearTimeout(pendingVp.timer);
    pendingViewportSaves.delete(state.courseId);
  }
  const payload = { ...state, updatedAt: Date.now() };
  canvasMemoryCache.set(state.courseId, payload);
  try {
    await fetch(`/api/canvas/${encodeURIComponent(state.courseId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn("[CourseCanvas] Failed to persist canvas state to server:", err);
  }
}

export function loadCourseCanvas(
  courseId: string,
  lessons: CourseLessonItem[],
): CourseCanvasState | null {
  if (typeof window === "undefined") return null;
  const cached = canvasMemoryCache.get(courseId);
  if (cached) return normalizeLegacyCanvasPayload(cached, courseId, lessons);
  return null;
}

export function saveCourseCanvas(state: CourseCanvasState): void {
  if (typeof window === "undefined" || !state.courseId) return;
  const payload = { ...state, updatedAt: Date.now() };
  canvasMemoryCache.set(state.courseId, payload);

  const existingTimer = pendingCanvasSaves.get(state.courseId);
  if (existingTimer !== undefined) {
    window.clearTimeout(existingTimer);
  }
  const pendingVp = pendingViewportSaves.get(state.courseId);
  if (pendingVp !== undefined) {
    window.clearTimeout(pendingVp.timer);
    pendingViewportSaves.delete(state.courseId);
  }
  const timer = window.setTimeout(() => {
    pendingCanvasSaves.delete(state.courseId);
    void saveCourseCanvasToServer(payload);
  }, 220);
  pendingCanvasSaves.set(state.courseId, timer);
}

/**
 * Persists pan/zoom changes via PATCH /viewport so camera movement never rewrites
 * cards, strokes, or vault files on disk.
 */
export function saveCourseViewport(courseId: string, viewport: CanvasViewport): void {
  if (typeof window === "undefined" || !courseId) return;
  const cached = canvasMemoryCache.get(courseId);
  if (cached) {
    canvasMemoryCache.set(courseId, { ...cached, viewport });
  }
  const existing = pendingViewportSaves.get(courseId);
  if (existing !== undefined) {
    window.clearTimeout(existing.timer);
  }
  const timer = window.setTimeout(() => {
    pendingViewportSaves.delete(courseId);
    void fetch(`/api/canvas/${encodeURIComponent(courseId)}/viewport`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(viewport),
    }).catch((err) => {
      console.warn("[CourseCanvas] Failed to persist canvas viewport:", err);
    });
  }, 280);
  pendingViewportSaves.set(courseId, { timer, viewport });
}

export function flushPendingCanvasSave(courseId: string): void {
  if (typeof window === "undefined") return;
  const timer = pendingCanvasSaves.get(courseId);
  const pendingVp = pendingViewportSaves.get(courseId);

  if (timer !== undefined) {
    window.clearTimeout(timer);
    pendingCanvasSaves.delete(courseId);
    if (pendingVp !== undefined) {
      window.clearTimeout(pendingVp.timer);
      pendingViewportSaves.delete(courseId);
    }
    const latest = canvasMemoryCache.get(courseId);
    if (latest) {
      void fetch(`/api/canvas/${encodeURIComponent(courseId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...latest, updatedAt: Date.now() }),
        keepalive: true,
      }).catch(() => {});
    }
    return;
  }

  if (pendingVp !== undefined) {
    window.clearTimeout(pendingVp.timer);
    pendingViewportSaves.delete(courseId);
    void fetch(`/api/canvas/${encodeURIComponent(courseId)}/viewport`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pendingVp.viewport),
      keepalive: true,
    }).catch(() => {});
  }
}

export function summarizeCanvasState(
  parsed: Partial<CourseCanvasState> | null | undefined,
): CanvasSummaryMetrics {
  if (!parsed) {
    return { exists: false, cardCount: 0, artboardCount: 0, edgeCount: 0, strokeCount: 0 };
  }
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
}

export function getCanvasSummaryMetrics(courseId: string): CanvasSummaryMetrics {
  return summarizeCanvasState(canvasMemoryCache.get(courseId));
}

export async function fetchCanvasSummaryMetrics(courseId: string): Promise<CanvasSummaryMetrics> {
  if (typeof window === "undefined" || !courseId) {
    return { exists: false, cardCount: 0, artboardCount: 0, edgeCount: 0, strokeCount: 0 };
  }
  try {
    const res = await fetch(`/api/canvas/${encodeURIComponent(courseId)}`);
    if (!res.ok) return getCanvasSummaryMetrics(courseId);
    const parsed = (await res.json()) as Partial<CourseCanvasState>;
    return summarizeCanvasState(parsed);
  } catch {
    return getCanvasSummaryMetrics(courseId);
  }
}

function advancePastOverlappingCards(
  startX: number,
  targetY: number,
  existingCards: CanvasCard[],
  groupHeight = 560,
): number {
  let candidateX = startX;
  let adjusted = true;
  let safety = 0;
  while (adjusted && safety < 50) {
    adjusted = false;
    safety += 1;
    for (const c of existingCards) {
      if (c.groupId) continue;
      const overlapsY = c.y < targetY + groupHeight && c.y + c.height > targetY - 40;
      const overlapsX =
        c.x < candidateX + CANVAS_GROUP_WIDTH + 12 && c.x + c.width > candidateX - 12;
      if (overlapsY && overlapsX) {
        candidateX = Math.max(candidateX, c.x + c.width + CANVAS_COL_GAP);
        adjusted = true;
      }
    }
  }
  return candidateX;
}

function shiftGroupsHorizontally(
  groups: CanvasGroup[],
  cards: CanvasCard[],
  strokes: CanvasStroke[],
  minXInclusive: number,
  deltaX: number,
): void {
  if (deltaX <= 0) return;
  const shiftedGroupIds = new Set<string>();
  for (const g of groups) {
    if (g.x >= minXInclusive) {
      g.x += deltaX;
      shiftedGroupIds.add(g.id);
    }
  }
  if (shiftedGroupIds.size === 0) return;

  for (const c of cards) {
    if (c.groupId && shiftedGroupIds.has(c.groupId)) {
      c.x += deltaX;
    }
  }
  for (const s of strokes) {
    if (s.parentGroupId && shiftedGroupIds.has(s.parentGroupId)) {
      s.points = s.points.map(([px, py, pressure]) => [px + deltaX, py, pressure]);
    }
  }
}

function findNextColumnX(
  groups: CanvasGroup[],
  existingCards: CanvasCard[] = [],
  targetY = CANVAS_START_Y,
): number {
  if (groups.length === 0) {
    return advancePastOverlappingCards(CANVAS_START_X, targetY, existingCards);
  }
  let maxRight = CANVAS_START_X - CANVAS_COL_GAP;
  for (const g of groups) {
    if (g.x + g.width > maxRight) maxRight = g.x + g.width;
  }
  return advancePastOverlappingCards(maxRight + CANVAS_COL_GAP, targetY, existingCards);
}

export function createVideoArtboardGroup(
  lessonIdx: number,
  lessons: CourseLessonItem[],
  existingGroups: CanvasGroup[],
  existingCards: CanvasCard[],
  existingStrokes: CanvasStroke[] = [],
  courseId?: string,
): CanvasGroup {
  const lesson = lessons[lessonIdx];
  const videoGroups = existingGroups
    .filter((g) => g.type === "video-artboard" && g.lessonIdx !== undefined)
    .sort((a, b) => a.lessonIdx! - b.lessonIdx!);
  const prevBefore = [...videoGroups].reverse().find((g) => g.lessonIdx! < lessonIdx);
  const nextAfter = videoGroups.find((g) => g.lessonIdx! > lessonIdx);

  let x: number;
  let y: number;
  if (nextAfter && (!prevBefore || nextAfter.x >= prevBefore.x)) {
    y = Math.round(prevBefore?.y ?? nextAfter.y);
    if (prevBefore) {
      x = prevBefore.x + prevBefore.width + CANVAS_COL_GAP;
    } else {
      let leftMinX = CANVAS_START_X;
      for (const g of existingGroups) {
        if (g.x < nextAfter.x && g.x + g.width + CANVAS_COL_GAP > leftMinX) {
          leftMinX = g.x + g.width + CANVAS_COL_GAP;
        }
      }
      leftMinX = advancePastOverlappingCards(leftMinX, y, existingCards);
      const slotBeforeNext = nextAfter.x - (CANVAS_GROUP_WIDTH + CANVAS_COL_GAP);
      x = slotBeforeNext >= leftMinX ? slotBeforeNext : Math.min(leftMinX, nextAfter.x);
      if (x < leftMinX) x = leftMinX;
    }
    const neededShift = x + CANVAS_GROUP_WIDTH + CANVAS_COL_GAP - nextAfter.x;
    if (neededShift > 0) {
      shiftGroupsHorizontally(
        existingGroups,
        existingCards,
        existingStrokes,
        nextAfter.x - 1,
        neededShift,
      );
    }
  } else {
    y = prevBefore ? Math.round(prevBefore.y) : CANVAS_START_Y;
    x = findNextColumnX(existingGroups, existingCards, y);
  }

  return {
    id: getVideoArtboardId(lessonIdx, courseId),
    type: "video-artboard",
    lessonIdx,
    videoId: lesson?.lessonId,
    title: formatCanvasArtboardTitle(lessons, lessonIdx),
    subtitle: lesson?.moduleTitle || lesson?.duration,
    x,
    y,
    width: CANVAS_GROUP_WIDTH,
    height: 220,
    tintIndex: lessonIdx % 5,
    layoutMode: "auto",
    collapsed: false,
  };
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
    (e) => e.edgeKind === "manual" && validCardIds.has(e.fromId) && validCardIds.has(e.toId),
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
      requiredGroupHeight: Math.max(group.height, y - group.y + cardHeight + CANVAS_PADDING_BOTTOM),
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

function reflowAutoVideoGroup(group: CanvasGroup, cards: CanvasCard[]): void {
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
  const extras = inGroup
    .filter((c) => !autoVideoCards.includes(c))
    .sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));
  for (const extra of extras) {
    extra.x = group.x + CANVAS_PADDING_X;
    extra.y = cursorY;
    cursorY += extra.height + CANVAS_CARD_GAP;
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
        strokes: existingState.strokes.map((s) => ({ ...s })),
        dismissedNoteIds: [...existingState.dismissedNoteIds],
      }
    : createEmptyCanvasState(courseId);

  const noteById = new Map(notes.map((n) => [n.id, n]));
  const dismissedSet = new Set(base.dismissedNoteIds.filter((id) => noteById.has(id)));

  // 1. Remove synced cards whose Player note was deleted (including legacy orphaned video-notes)
  const survivingCards: CanvasCard[] = [];
  for (const card of base.cards) {
    if (
      card.type === "video-note" &&
      !card.isCanvasOnly &&
      (!card.noteId || !noteById.has(card.noteId))
    ) {
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

  // Upgrade legacy auto-generated "L{n} · Title" Artboard headers to module-aware "M{m}L{l} · Title"
  for (const g of base.groups) {
    if (g.type !== "video-artboard" || g.lessonIdx === undefined) continue;
    const lesson = lessons[g.lessonIdx];
    if (lesson) {
      if (!g.subtitle || g.subtitle === lesson.duration) {
        g.subtitle = lesson.moduleTitle || lesson.duration;
      }
      if (/^(?:L\d+\s*(?:·|Â·|-)\s*|Lesson \d+$)/.test(g.title)) {
        g.title = formatCanvasArtboardTitle(lessons, g.lessonIdx);
      }
    }
  }

  // Scope legacy unscoped `vgroup-<n>` IDs to the course so SQLite primary keys never collide across courses
  const remappedGroupIds = new Map<string, string>();
  for (const g of base.groups) {
    if (g.type === "video-artboard" && g.lessonIdx !== undefined && /^vgroup-\d+$/.test(g.id)) {
      const scopedId = getVideoArtboardId(g.lessonIdx, courseId);
      if (g.id !== scopedId) {
        remappedGroupIds.set(g.id, scopedId);
        g.id = scopedId;
      }
    }
  }
  if (remappedGroupIds.size > 0) {
    for (const c of base.cards) {
      if (c.groupId && remappedGroupIds.has(c.groupId)) {
        c.groupId = remappedGroupIds.get(c.groupId)!;
      }
    }
    for (const s of base.strokes) {
      if (s.parentGroupId && remappedGroupIds.has(s.parentGroupId)) {
        s.parentGroupId = remappedGroupIds.get(s.parentGroupId)!;
      }
    }
  }

  // Prune empty legacy v1 `cnode_group_*` shells whose cards have already migrated into `vgroup-*`
  base.groups = base.groups.filter((g) => {
    if (g.type === "custom-artboard" && g.id.startsWith("cnode_group_")) {
      const hasChildren = base.cards.some((c) => c.groupId === g.id);
      const hasStrokes = base.strokes.some((s) => s.parentGroupId === g.id);
      return hasChildren || hasStrokes;
    }
    return true;
  });

  // Detect untouched legacy v1 flat `cnode_*` piles (left-gutter x≈60, no lesson Artboard yet)
  const legacyFlatCandidates = base.cards.filter(
    (c) =>
      c.id.startsWith("cnode_") &&
      c.type === "video-note" &&
      Boolean(c.noteId) &&
      c.groupId === null &&
      c.originLessonIdx !== undefined &&
      Math.abs(c.x - 60) <= 6,
  );
  const legacyFlatIds = new Set<string>(
    legacyFlatCandidates.length >= 2
      ? legacyFlatCandidates
          .filter((c) => !findVideoArtboardGroup(base.groups, c.originLessonIdx!, courseId))
          .map((c) => c.id)
      : [],
  );
  for (const card of base.cards) {
    if (legacyFlatIds.has(card.id) && card.originLessonIdx !== undefined) {
      // Pre-mark membership so spawned Artboards don't dodge legacy x=60 pile coordinates
      card.groupId = getVideoArtboardId(card.originLessonIdx, courseId);
      card.membershipState = "auto";
    }
  }

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
      const estimatedH = estimateVideoNoteCardHeight(note.content, note.images.length);
      const needsHeightBump = estimatedH > existingCard.height;

      existingCard.htmlContent = note.content;
      existingCard.timestamp = note.timestamp;
      existingCard.originLessonIdx = note.lessonIdx;
      existingCard.originVideoId = note.videoId || lessons[note.lessonIdx]?.lessonId;
      if (existingCard.type === "video-note") {
        existingCard.isCanvasOnly = false;
        if (existingCard.membershipState === "canvas-only") {
          const expectedGroupId = getVideoArtboardId(note.lessonIdx, courseId);
          existingCard.membershipState = !existingCard.groupId
            ? "detached"
            : existingCard.groupId === expectedGroupId
              ? "auto"
              : "reassigned";
        }
      }

      if (legacyFlatIds.has(existingCard.id)) {
        let targetGroup = findVideoArtboardGroup(base.groups, note.lessonIdx, courseId);
        if (!targetGroup) {
          targetGroup = createVideoArtboardGroup(
            note.lessonIdx,
            lessons,
            base.groups,
            base.cards,
            base.strokes,
            courseId,
          );
          base.groups.push(targetGroup);
        }
        existingCard.groupId = targetGroup.id;
        existingCard.membershipState = "auto";
        existingCard.width = CANVAS_CARD_WIDTH;
        existingCard.height = Math.max(existingCard.height, estimatedH);
        existingCard.updatedAt = now;
        if (targetGroup.layoutMode === "auto") {
          autoGroupsToReflow.add(targetGroup.id);
        } else {
          existingCard.groupId = null;
          const prevHeight = targetGroup.height;
          const slot = findFreeSlotInGroup(
            targetGroup,
            base.cards,
            CANVAS_CARD_WIDTH,
            existingCard.height,
          );
          const delta = slot.requiredGroupHeight - prevHeight;
          if (delta > 0) {
            shiftGroupsBelowColumn(base.groups, base.cards, base.strokes, targetGroup, delta);
            targetGroup.height = slot.requiredGroupHeight;
          }
          existingCard.groupId = targetGroup.id;
          existingCard.x = slot.x;
          existingCard.y = slot.y;
        }
        continue;
      }

      if (changedContent || needsHeightBump) {
        existingCard.height = Math.max(existingCard.height, estimatedH);
        existingCard.updatedAt = now;
        if (existingCard.groupId && existingCard.membershipState === "auto") {
          const g = base.groups.find((gr) => gr.id === existingCard.groupId);
          if (g && g.layoutMode === "auto") autoGroupsToReflow.add(g.id);
        }
      }
      continue;
    }

    // 2. Spawn or locate origin Video Artboard
    const lesson = lessons[note.lessonIdx];
    const existingGroup = findVideoArtboardGroup(base.groups, note.lessonIdx, courseId);
    const targetGroup: CanvasGroup =
      existingGroup ??
      (() => {
        const created = createVideoArtboardGroup(
          note.lessonIdx,
          lessons,
          base.groups,
          base.cards,
          base.strokes,
          courseId,
        );
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

  fitArtboardsToChildren(base.groups, base.cards);
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

    const minYInGroup = targetGroup.y + CANVAS_GROUP_HEADER_HEIGHT + 12;
    const clampedY = c.y < minYInGroup ? minYInGroup : c.y;

    if (targetGroup.id === prevGroupId) {
      // Moved cleanly inside the same Video Artboard -> mark artboard custom
      if (targetGroup.type === "video-artboard") {
        targetGroup.layoutMode = "custom";
      }
      return clampedY !== c.y ? { ...c, y: clampedY } : { ...c };
    }

    // Moved into a different group
    if (c.isCanvasOnly) {
      return {
        ...c,
        y: clampedY,
        groupId: targetGroup.id,
        membershipState: "canvas-only" as const,
      };
    }

    const isOriginGroup =
      targetGroup.type === "video-artboard" && targetGroup.lessonIdx === c.originLessonIdx;
    return {
      ...c,
      y: clampedY,
      groupId: targetGroup.id,
      membershipState: isOriginGroup ? ("auto" as const) : ("reassigned" as const),
    };
  });

  fitArtboardsToChildren(nextGroups, nextCards);

  return {
    ...state,
    groups: nextGroups,
    cards: nextCards,
    edges: rebuildAllAutoChronoEdges(nextGroups, nextCards, state.edges),
  };
}

export function applyCardHeightUpdate(
  state: CourseCanvasState,
  cardId: string,
  nextHeight: number,
  htmlContent?: string,
): CourseCanvasState {
  const target = state.cards.find((c) => c.id === cardId);
  if (!target) return state;

  const clampedHeight = Math.max(target.height, Math.min(12000, Math.ceil(nextHeight)));
  const contentChanged = htmlContent !== undefined && htmlContent !== target.htmlContent;
  const heightChanged = clampedHeight > target.height;
  if (!contentChanged && !heightChanged) return state;

  const nextGroups = state.groups.map((g) => ({ ...g }));
  const nextCards = state.cards.map((c) =>
    c.id === cardId
      ? {
          ...c,
          ...(htmlContent !== undefined ? { htmlContent, updatedAt: Date.now() } : {}),
          height: clampedHeight,
        }
      : { ...c },
  );
  const nextStrokes = state.strokes.map((s) => ({
    ...s,
    points: s.points.map((pt) => [...pt] as [number, number, number]),
  }));

  if (target.groupId) {
    const group = nextGroups.find((g) => g.id === target.groupId);
    if (group && group.type === "video-artboard" && group.layoutMode === "auto") {
      const prevH = group.height;
      reflowAutoVideoGroup(group, nextCards);
      if (group.height > prevH) {
        shiftGroupsBelowColumn(nextGroups, nextCards, nextStrokes, group, group.height - prevH);
      }
    }
  }

  fitArtboardsToChildren(nextGroups, nextCards);

  return {
    ...state,
    groups: nextGroups,
    cards: nextCards,
    strokes: nextStrokes,
  };
}

export function tidyVideoArtboard(state: CourseCanvasState, groupId: string): CourseCanvasState {
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

  fitArtboardsToChildren(nextGroups, nextCards);

  return {
    ...state,
    groups: nextGroups,
    cards: nextCards,
    edges: rebuildAllAutoChronoEdges(nextGroups, nextCards, state.edges),
  };
}

export function tidySelectedCards(state: CourseCanvasState, cardIds: string[]): CourseCanvasState {
  if (cardIds.length < 2) return state;
  const idSet = new Set(cardIds);
  const nextGroups = state.groups.map((g) => ({ ...g }));
  const nextCards = state.cards.map((c) => ({ ...c }));
  const selected = nextCards.filter((c) => idSet.has(c.id));
  if (selected.length < 2) return state;

  const minX = Math.min(...selected.map((c) => c.x));
  const minY = Math.min(...selected.map((c) => c.y));
  const maxRight = Math.max(...selected.map((c) => c.x + c.width));
  const maxBottom = Math.max(...selected.map((c) => c.y + c.height));
  const spanW = maxRight - minX;
  const spanH = maxBottom - minY;

  const sharedGroupId = selected.every((c) => c.groupId && c.groupId === selected[0]!.groupId)
    ? selected[0]!.groupId
    : null;

  if (!sharedGroupId && spanW > spanH * 1.25) {
    // Grid/row arrangement when selected cards are spread wider horizontally than vertically
    const cols = Math.min(selected.length, Math.max(2, Math.ceil(Math.sqrt(selected.length))));
    const ordered = [...selected].sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));
    const colWidths = new Array<number>(cols).fill(0);
    const rowHeights: number[] = [];

    ordered.forEach((c, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      colWidths[col] = Math.max(colWidths[col]!, c.width);
      rowHeights[row] = Math.max(rowHeights[row] ?? 0, c.height);
    });

    const colXs: number[] = [];
    let cx = minX;
    for (let col = 0; col < cols; col += 1) {
      colXs.push(cx);
      cx += colWidths[col]! + CANVAS_CARD_GAP;
    }

    const rowYs: number[] = [];
    let cy = minY;
    for (let row = 0; row < rowHeights.length; row += 1) {
      rowYs.push(cy);
      cy += rowHeights[row]! + CANVAS_CARD_GAP;
    }

    ordered.forEach((c, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      c.x = colXs[col]!;
      c.y = rowYs[row]!;
    });
  } else {
    const ordered = [...selected].sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));
    const targetX = sharedGroupId
      ? (nextGroups.find((g) => g.id === sharedGroupId)?.x ?? minX - CANVAS_PADDING_X) +
        CANVAS_PADDING_X
      : minX;
    let cy = minY;
    for (const c of ordered) {
      c.x = targetX;
      c.y = cy;
      cy += c.height + CANVAS_CARD_GAP;
    }
  }

  fitArtboardsToChildren(nextGroups, nextCards);

  return {
    ...state,
    groups: nextGroups,
    cards: nextCards,
    edges: rebuildAllAutoChronoEdges(nextGroups, nextCards, state.edges),
  };
}

function attachCardToOriginVideoGroup(
  groups: CanvasGroup[],
  cards: CanvasCard[],
  strokes: CanvasStroke[],
  card: CanvasCard,
  lessons: CourseLessonItem[],
  courseId: string,
): void {
  if (card.originLessonIdx === undefined) return;
  let originGroup = findVideoArtboardGroup(groups, card.originLessonIdx, courseId);
  if (!originGroup) {
    originGroup = createVideoArtboardGroup(
      card.originLessonIdx,
      lessons,
      groups,
      cards,
      strokes,
      courseId,
    );
    groups.push(originGroup);
  }

  originGroup.collapsed = false;
  card.membershipState = "auto";

  if (originGroup.layoutMode === "auto") {
    card.groupId = originGroup.id;
    const prevH = originGroup.height;
    reflowAutoVideoGroup(originGroup, cards);
    if (originGroup.height > prevH) {
      shiftGroupsBelowColumn(groups, cards, strokes, originGroup, originGroup.height - prevH);
    }
  } else {
    card.groupId = null;
    const prevH = originGroup.height;
    const slot = findFreeSlotInGroup(originGroup, cards, card.width, card.height);
    const delta = slot.requiredGroupHeight - prevH;
    if (delta > 0) {
      shiftGroupsBelowColumn(groups, cards, strokes, originGroup, delta);
      originGroup.height = slot.requiredGroupHeight;
    }
    card.groupId = originGroup.id;
    card.x = slot.x;
    card.y = slot.y;
  }

  fitArtboardsToChildren(groups, cards);
}

export function returnCardToOriginGroup(
  state: CourseCanvasState,
  cardId: string,
  lessons: CourseLessonItem[],
): CourseCanvasState {
  const nextGroups = state.groups.map((g) => ({ ...g }));
  const nextCards = state.cards.map((c) => ({ ...c }));
  const nextStrokes = state.strokes.map((s) => ({
    ...s,
    points: s.points.map((pt) => [...pt] as [number, number, number]),
  }));
  const card = nextCards.find((c) => c.id === cardId);
  if (!card || card.originLessonIdx === undefined) return state;

  attachCardToOriginVideoGroup(nextGroups, nextCards, nextStrokes, card, lessons, state.courseId);

  return {
    ...state,
    groups: nextGroups,
    cards: nextCards,
    strokes: nextStrokes,
    edges: rebuildAllAutoChronoEdges(nextGroups, nextCards, state.edges),
  };
}

export function restoreNoteCardToCanvas(
  state: CourseCanvasState,
  note: NoteItem,
  lessons: CourseLessonItem[],
): CourseCanvasState {
  const nextGroups = state.groups.map((g) => ({ ...g }));
  const nextCards = state.cards.map((c) => ({ ...c }));
  const nextStrokes = state.strokes.map((s) => ({
    ...s,
    points: s.points.map((pt) => [...pt] as [number, number, number]),
  }));
  const nextDismissed = state.dismissedNoteIds.filter((id) => id !== note.id);

  const existingCard = nextCards.find((c) => c.noteId === note.id);
  if (existingCard) {
    return { ...state, dismissedNoteIds: nextDismissed };
  }

  const lesson = lessons[note.lessonIdx];
  const estHeight = estimateVideoNoteCardHeight(note.content, note.images.length);
  const restoredCard: CanvasCard = {
    id: getVideoNoteCardId(note.id),
    type: "video-note",
    noteId: note.id,
    originLessonIdx: note.lessonIdx,
    originVideoId: lesson?.lessonId ?? note.videoId,
    timestamp: note.timestamp,
    groupId: null,
    membershipState: "auto",
    isCanvasOnly: false,
    x: 0,
    y: 0,
    width: CANVAS_CARD_WIDTH,
    height: estHeight,
    htmlContent: note.content,
    createdAt: note.createdAt,
    updatedAt: Date.now(),
  };
  nextCards.push(restoredCard);
  attachCardToOriginVideoGroup(
    nextGroups,
    nextCards,
    nextStrokes,
    restoredCard,
    lessons,
    state.courseId,
  );

  return {
    ...state,
    groups: nextGroups,
    cards: nextCards,
    strokes: nextStrokes,
    dismissedNoteIds: nextDismissed,
    edges: rebuildAllAutoChronoEdges(nextGroups, nextCards, state.edges),
  };
}

function getStrokeBounds(stroke: CanvasStroke): {
  x: number;
  y: number;
  width: number;
  height: number;
} | null {
  if (stroke.points.length === 0) return null;
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
  const pad = Math.max(4, stroke.size * 0.5);
  return {
    x: minX - pad,
    y: minY - pad,
    width: Math.max(8, maxX - minX + pad * 2),
    height: Math.max(8, maxY - minY + pad * 2),
  };
}

function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
  margin = 16,
): boolean {
  return (
    a.x < b.x + b.width + margin &&
    a.x + a.width > b.x - margin &&
    a.y < b.y + b.height + margin &&
    a.y + a.height > b.y - margin
  );
}

export function tidyAllCanvasArtboards(state: CourseCanvasState): CourseCanvasState {
  const nextGroups = state.groups.map((g) => ({ ...g }));
  const nextCards = state.cards.map((c) => ({ ...c }));
  const nextStrokes = state.strokes.map((s) => ({
    ...s,
    points: s.points.map((pt) => [...pt] as [number, number, number]),
  }));

  // 1. Sort artboards so Video Artboards appear in strict chronological lessonIdx order (M1L1 -> M1L2 -> ...),
  // followed by any user-created Custom Artboards.
  nextGroups.sort((a, b) => {
    const aIsVideo = a.type === "video-artboard" && a.lessonIdx !== undefined;
    const bIsVideo = b.type === "video-artboard" && b.lessonIdx !== undefined;
    if (aIsVideo && bIsVideo) return a.lessonIdx! - b.lessonIdx!;
    if (aIsVideo !== bIsVideo) return aIsVideo ? -1 : 1;
    return a.x !== b.x ? a.x - b.x : a.y - b.y;
  });

  // 2. Arrange all Artboards strictly side-by-side along a single top-aligned row (y = CANVAS_START_Y)
  // and reflow each Artboard's cards and parented strokes in-place before running any bounds fit.
  let cursorX = CANVAS_START_X;
  for (const g of nextGroups) {
    const dx = cursorX - g.x;
    const dy = CANVAS_START_Y - g.y;
    g.x = cursorX;
    g.y = CANVAS_START_Y;
    g.layoutMode = "auto";

    for (const s of nextStrokes) {
      if (s.parentGroupId === g.id) {
        s.points = s.points.map(([px, py, pressure]) => [px + dx, py + dy, pressure]);
      }
    }

    if (g.type === "video-artboard") {
      const inGroup = nextCards.filter((c) => c.groupId === g.id);
      let maxChildWidth = CANVAS_CARD_WIDTH;
      for (const c of inGroup) {
        if (c.type === "video-note" && c.originLessonIdx === g.lessonIdx) {
          c.membershipState = "auto";
        }
        if (c.width > maxChildWidth) maxChildWidth = c.width;
      }
      g.width = Math.max(CANVAS_GROUP_WIDTH, maxChildWidth + CANVAS_PADDING_X * 2);
      reflowAutoVideoGroup(g, nextCards);
    } else {
      const inGroup = nextCards
        .filter((c) => c.groupId === g.id)
        .sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));
      let cy = g.y + CANVAS_GROUP_HEADER_HEIGHT + 14;
      let maxChildWidth = CANVAS_CARD_WIDTH;
      for (const c of inGroup) {
        c.x = g.x + CANVAS_PADDING_X;
        c.y = cy;
        cy += c.height + CANVAS_CARD_GAP;
        if (c.width > maxChildWidth) maxChildWidth = c.width;
      }
      g.width = Math.max(g.width, maxChildWidth + CANVAS_PADDING_X * 2);
      g.height = Math.max(
        180,
        inGroup.length > 0 ? cy - CANVAS_CARD_GAP + CANVAS_PADDING_BOTTOM - g.y : g.height,
      );
    }

    cursorX = g.x + g.width + CANVAS_COL_GAP;
  }

  fitArtboardsToChildren(nextGroups, nextCards);

  // Re-verify horizontal non-overlap after fitArtboardsToChildren
  let verifyX = CANVAS_START_X;
  for (const g of nextGroups) {
    if (g.x < verifyX) {
      const shiftX = verifyX - g.x;
      g.x = verifyX;
      for (const c of nextCards) {
        if (c.groupId === g.id) c.x += shiftX;
      }
      for (const s of nextStrokes) {
        if (s.parentGroupId === g.id) {
          s.points = s.points.map(([px, py, pressure]) => [px + shiftX, py, pressure]);
        }
      }
    }
    verifyX = g.x + g.width + CANVAS_COL_GAP;
  }
  cursorX = verifyX;

  // 3. Coexistence with user-added freeform items (loose cards & unparented drawings):
  // Non-colliding freeform items stay untouched where the user placed them; any loose cards or
  // unparented strokes that would be buried underneath an Artboard are moved into a clean
  // non-overlapping Freeform Zone immediately to the right of the Artboard row.
  const ungroupedCards = nextCards
    .filter((c) => !c.groupId)
    .sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));

  const collidingCards = ungroupedCards.filter((c) =>
    nextGroups.some((g) => rectsOverlap(c, g, 16)),
  );

  const movedCardDeltas: {
    oldBounds: { x: number; y: number; width: number; height: number };
    dx: number;
    dy: number;
  }[] = [];

  let freeformY = CANVAS_START_Y;
  const freeformX = cursorX;

  for (const card of collidingCards) {
    const oldBounds = { x: card.x, y: card.y, width: card.width, height: card.height };
    const dx = freeformX - card.x;
    const dy = freeformY - card.y;
    card.x = freeformX;
    card.y = freeformY;
    freeformY += card.height + CANVAS_CARD_GAP;
    movedCardDeltas.push({ oldBounds, dx, dy });
  }

  for (const stroke of nextStrokes) {
    if (stroke.parentGroupId) continue;
    const bounds = getStrokeBounds(stroke);
    if (!bounds) continue;

    // If stroke was drawn over a loose card that just moved, keep it attached to that card
    const attachedCardMove = movedCardDeltas.find((m) => rectsOverlap(bounds, m.oldBounds, 24));
    if (attachedCardMove) {
      stroke.points = stroke.points.map(([px, py, pressure]) => [
        px + attachedCardMove.dx,
        py + attachedCardMove.dy,
        pressure,
      ]);
      continue;
    }

    // If an unparented stroke collides with an Artboard, shift it into the Freeform Zone
    if (nextGroups.some((g) => rectsOverlap(bounds, g, 12))) {
      const dx = Math.round(freeformX - bounds.x);
      const dy = Math.round(freeformY - bounds.y);
      stroke.points = stroke.points.map(([px, py, pressure]) => [px + dx, py + dy, pressure]);
      freeformY += Math.ceil(bounds.height) + CANVAS_CARD_GAP;
    }
  }

  return {
    ...state,
    groups: nextGroups,
    cards: nextCards,
    strokes: nextStrokes,
    edges: rebuildAllAutoChronoEdges(nextGroups, nextCards, state.edges),
  };
}

export function resetCanvasArrangement(
  state: CourseCanvasState,
  lessons: CourseLessonItem[],
): CourseCanvasState {
  const nextGroups = state.groups.map((g) => ({ ...g }));
  const nextCards = state.cards.map((c) => ({ ...c }));
  const nextStrokes = state.strokes.map((s) => ({
    ...s,
    points: s.points.map((pt) => [...pt] as [number, number, number]),
  }));

  const lessonIdxByVideoId = new Map<string, number>();
  lessons.forEach((l, idx) => {
    if (l.lessonId) lessonIdxByVideoId.set(l.lessonId, idx);
  });

  for (const card of nextCards) {
    const isLectureCard =
      (card.type === "video-note" || Boolean(card.noteId)) && !card.isCanvasOnly;
    if (!isLectureCard) continue;

    const resolvedLessonIdx =
      card.originLessonIdx ??
      (card.originVideoId ? lessonIdxByVideoId.get(card.originVideoId) : undefined);
    if (resolvedLessonIdx === undefined || resolvedLessonIdx < 0) continue;

    card.type = "video-note";
    card.originLessonIdx = resolvedLessonIdx;

    let originGroup = findVideoArtboardGroup(nextGroups, resolvedLessonIdx, state.courseId);
    if (!originGroup) {
      originGroup = createVideoArtboardGroup(
        resolvedLessonIdx,
        lessons,
        nextGroups,
        nextCards,
        nextStrokes,
        state.courseId,
      );
      nextGroups.push(originGroup);
    }
    card.groupId = originGroup.id;
    card.membershipState = "auto";
    card.width = CANVAS_CARD_WIDTH;
  }

  for (const g of nextGroups) {
    if (g.type === "video-artboard") {
      g.layoutMode = "auto";
      g.collapsed = false;
      g.width = CANVAS_GROUP_WIDTH;
      if (g.lessonIdx !== undefined && lessons[g.lessonIdx]) {
        const lesson = lessons[g.lessonIdx]!;
        g.title = formatCanvasArtboardTitle(lessons, g.lessonIdx);
        g.subtitle = lesson.moduleTitle || lesson.duration;
      }
    }
  }

  const populatedGroups = nextGroups.filter((g) => {
    const hasCards = nextCards.some((c) => c.groupId === g.id);
    const hasStrokes = nextStrokes.some((s) => s.parentGroupId === g.id);
    if (g.type === "video-artboard") {
      return hasCards || hasStrokes;
    }
    // Remove empty legacy v1 `cnode_group_*` shells whose lecture cards were recalled into Video Artboards
    if (g.id.startsWith("cnode_group_") && !hasCards && !hasStrokes) {
      return false;
    }
    return true;
  });

  return tidyAllCanvasArtboards({
    ...state,
    groups: populatedGroups,
    cards: nextCards,
    strokes: nextStrokes,
  });
}

export function getPointForCardSide(
  rect: { x: number; y: number; width: number; height: number },
  side: CanvasSide,
): { x: number; y: number; side: CanvasSide } {
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
}

export function resolveNearestSideOnRect(
  rect: { x: number; y: number; width: number; height: number },
  worldPt: { x: number; y: number },
): CanvasSide {
  const dists: [CanvasSide, number][] = [
    ["top", Math.abs(worldPt.y - rect.y)],
    ["right", Math.abs(rect.x + rect.width - worldPt.x)],
    ["bottom", Math.abs(rect.y + rect.height - worldPt.y)],
    ["left", Math.abs(worldPt.x - rect.x)],
  ];
  dists.sort((a, b) => a[1] - b[1]);
  return dists[0]![0];
}

export function resolveTargetConnectionSide(
  fromRect: { x: number; y: number; width: number; height: number },
  fromSide: CanvasSide | undefined,
  toRect: { x: number; y: number; width: number; height: number },
  pointerWorld: { x: number; y: number },
): CanvasSide {
  const EDGE_SNAP_PX = 28;
  const dists: [CanvasSide, number][] = [
    ["top", Math.abs(pointerWorld.y - toRect.y)],
    ["right", Math.abs(toRect.x + toRect.width - pointerWorld.x)],
    ["bottom", Math.abs(toRect.y + toRect.height - pointerWorld.y)],
    ["left", Math.abs(pointerWorld.x - toRect.x)],
  ];
  dists.sort((a, b) => a[1] - b[1]);
  if (dists[0]![1] <= EDGE_SNAP_PX) {
    return dists[0]![0];
  }

  const anchor = fromSide
    ? getPointForCardSide(fromRect, fromSide)
    : { x: fromRect.x + fromRect.width / 2, y: fromRect.y + fromRect.height / 2 };
  const dx = toRect.x + toRect.width / 2 - anchor.x;
  const dy = toRect.y + toRect.height / 2 - anchor.y;
  if (Math.abs(dx) > Math.abs(dy) * 1.15) {
    return dx >= 0 ? "left" : "right";
  }
  return dy >= 0 ? "top" : "bottom";
}

export function findConnectionTargetCard(
  cards: CanvasCard[],
  collapsedGroupIds: Set<string>,
  sourceCardId: string,
  worldPt: { x: number; y: number },
): CanvasCard | undefined {
  const candidates = cards.filter(
    (c) => c.id !== sourceCardId && (!c.groupId || !collapsedGroupIds.has(c.groupId)),
  );
  for (let i = candidates.length - 1; i >= 0; i--) {
    const c = candidates[i]!;
    if (
      worldPt.x >= c.x &&
      worldPt.x <= c.x + c.width &&
      worldPt.y >= c.y &&
      worldPt.y <= c.y + c.height
    ) {
      return c;
    }
  }
  const pad = 12;
  for (let i = candidates.length - 1; i >= 0; i--) {
    const c = candidates[i]!;
    if (
      worldPt.x >= c.x - pad &&
      worldPt.x <= c.x + c.width + pad &&
      worldPt.y >= c.y - pad &&
      worldPt.y <= c.y + c.height + pad
    ) {
      return c;
    }
  }
  return undefined;
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
  const dxCenter = toCx - fromCx;
  const dyCenter = toCy - fromCy;

  let autoFrom: CanvasSide;
  if (Math.abs(dxCenter) > Math.abs(dyCenter) * 1.15) {
    autoFrom = dxCenter >= 0 ? "right" : "left";
  } else {
    autoFrom = dyCenter >= 0 ? "bottom" : "top";
  }

  // Never overwrite an explicitly anchored starting side
  const fromSide: CanvasSide = explicitFrom ?? autoFrom;
  const fromPoint = getPointForCardSide(from, fromSide);

  let toSide: CanvasSide;
  if (explicitTo) {
    toSide = explicitTo;
  } else if (explicitFrom) {
    const dx = toCx - fromPoint.x;
    const dy = toCy - fromPoint.y;
    if (Math.abs(dx) > Math.abs(dy) * 1.15) {
      toSide = dx >= 0 ? "left" : "right";
    } else {
      toSide = dy >= 0 ? "top" : "bottom";
    }
  } else {
    toSide =
      autoFrom === "right"
        ? "left"
        : autoFrom === "left"
          ? "right"
          : autoFrom === "bottom"
            ? "top"
            : "bottom";
  }

  return {
    fromPoint,
    toPoint: getPointForCardSide(to, toSide),
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
