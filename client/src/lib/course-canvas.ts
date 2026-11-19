import type { CanvasArtboardCardLayout, CanvasBoardLayoutMode } from "@/lib/app-settings";
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
export const CANVAS_ARTBOARD_TOP_PAD = CANVAS_GROUP_HEADER_HEIGHT + 14;
export const CANVAS_CARD_WIDTH = 320;
export const CANVAS_GROUP_WIDTH = 356;
export const CANVAS_PADDING_X = 18;
export const CANVAS_PADDING_BOTTOM = 22;
export const CANVAS_CARD_GAP = 24;
export const CANVAS_COL_GAP = 48;
export const CANVAS_ROW_GAP = 56;
export const CANVAS_MODULE_ROW_GAP = 72;
export const CANVAS_START_X = 80;
export const CANVAS_START_Y = 96;
export const CANVAS_MIN_ZOOM = 0.1;
export const CANVAS_MAX_ZOOM = 3;
export const CARD_FIT_MAX_WIDTH = 760;
export const CANVAS_ARTBOARD_MAX_COLS = 4;
export const CANVAS_ARTBOARD_TARGET_COL_HEIGHT = 1080;
export const CANVAS_BOARD_MIN_ROW_WIDTH = 1600;
export const CANVAS_BOARD_MAX_ROW_WIDTH = 4400;
const HYSTERESIS_MARGIN = 18;

export interface CanvasLayoutOptions {
  boardLayout: CanvasBoardLayoutMode;
  cardLayout: CanvasArtboardCardLayout;
  colorByModule: boolean;
}

export const DEFAULT_CANVAS_LAYOUT_OPTIONS: CanvasLayoutOptions = {
  boardLayout: "module-rows",
  cardLayout: "columns",
  colorByModule: true,
};

export function getCardMinWidth(type: CanvasCardType): number {
  switch (type) {
    case "text":
      return 100;
    case "video-note":
      return 180;
    case "image":
    case "canvas-note":
    default:
      return 120;
  }
}

export function getCardMinHeight(type: CanvasCardType): number {
  switch (type) {
    case "text":
      return 48;
    case "canvas-note":
      return 52;
    case "video-note":
      return 72;
    case "image":
      return 88;
    default:
      return 52;
  }
}

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
  cardType: CanvasCardType = "video-note",
): number {
  const plainText = stripHtmlToText(html);
  const blockBreaks = (html.match(/<(?:p|div|li|h[1-6]|blockquote|tr|br)\b/gi) ?? []).length;
  const innerWidth = Math.max(160, cardWidth - 32);
  const charsPerLine = Math.max(26, Math.round(innerWidth / 7.8));
  const lineEstimate = Math.max(
    plainText.length > 0 ? 1 : 0,
    Math.ceil(plainText.length / charsPerLine) + Math.floor(blockBreaks * 0.45),
  );
  const baseChrome = cardType === "video-note" ? 68 : cardType === "text" ? 26 : 34;
  const textHeight =
    plainText.length > 0
      ? baseChrome + lineEstimate * 22
      : cardType === "video-note"
        ? 56
        : baseChrome;
  const imgTags = (html.match(/<img\b/gi) ?? []).length;
  const effectiveImages = Math.max(imageCount, imgTags);
  // Embedded screenshots are capped at 288×220px so widening cards never inflates image height
  const cappedImgWidth = Math.min(innerWidth, 288);
  const estImgHeight = Math.min(220, Math.round(cappedImgWidth * (9 / 16))) + 16;
  const mediaHeight = effectiveImages * estImgHeight;
  const minFloor = cardType === "video-note" ? 136 : getCardMinHeight(cardType);
  return Math.max(minFloor, Math.min(2200, textHeight + mediaHeight));
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

export function getVideoArtboardTintIndex(
  lessonIdx: number,
  lessons: CourseLessonItem[],
  colorByModule: boolean,
): number {
  if (colorByModule) {
    const modIdx = lessons[lessonIdx]?.modIdx;
    if (modIdx !== undefined && Number.isFinite(modIdx)) {
      return Math.abs(modIdx) % 5;
    }
  }
  return Math.abs(lessonIdx) % 5;
}

function getGroupVisualHeight(group: CanvasGroup): number {
  return group.collapsed ? CANVAS_GROUP_HEADER_HEIGHT : group.height;
}

function moveGroupWithContents(
  group: CanvasGroup,
  dx: number,
  dy: number,
  cards: CanvasCard[],
  strokes: CanvasStroke[],
): void {
  const rdx = Math.round(dx);
  const rdy = Math.round(dy);
  if (rdx === 0 && rdy === 0) return;
  group.x += rdx;
  group.y += rdy;
  for (const c of cards) {
    if (c.groupId === group.id) {
      c.x += rdx;
      c.y += rdy;
    }
  }
  for (const s of strokes) {
    if (s.parentGroupId === group.id) {
      s.points = s.points.map(([px, py, pressure]) => [px + rdx, py + rdy, pressure]);
    }
  }
}

function computeTargetRowWidth(groups: CanvasGroup[]): number {
  if (groups.length <= 3) return CANVAS_BOARD_MAX_ROW_WIDTH;
  let totalArea = 0;
  let maxGroupWidth = CANVAS_GROUP_WIDTH;
  for (const g of groups) {
    const h = getGroupVisualHeight(g);
    totalArea += (g.width + CANVAS_COL_GAP) * (h + CANVAS_ROW_GAP);
    if (g.width > maxGroupWidth) maxGroupWidth = g.width;
  }
  // Target a ~1.55:1 widescreen aspect ratio so large course boards frame comfortably on 16:9 monitors.
  const idealWidth = Math.sqrt(totalArea * 1.55);
  return Math.max(
    maxGroupWidth,
    Math.min(
      CANVAS_BOARD_MAX_ROW_WIDTH,
      Math.max(CANVAS_BOARD_MIN_ROW_WIDTH, Math.round(idealWidth)),
    ),
  );
}

/**
 * Finds the top-most, left-most non-overlapping position within `[startX, startX + maxRowWidth]`
 * using Skyline bottom-left rectangle packing (handles arbitrary variable-width artboards cleanly).
 */
function findSkylineSlot(
  placed: CanvasBounds[],
  width: number,
  height: number,
  startX: number,
  startY: number,
  maxRowWidth: number,
): { x: number; y: number } {
  const candidateXs = new Set<number>([startX]);
  for (const rect of placed) {
    const rightX = Math.round(rect.x + rect.width + CANVAS_COL_GAP);
    if (rightX + width <= startX + maxRowWidth) {
      candidateXs.add(rightX);
    }
  }

  let bestX = startX;
  let bestY = Infinity;

  for (const candX of candidateXs) {
    let candY = startY;
    for (const rect of placed) {
      const horizOverlap =
        candX < rect.x + rect.width + CANVAS_COL_GAP - 1 &&
        candX + width + CANVAS_COL_GAP - 1 > rect.x;
      if (horizOverlap) {
        const neededY = Math.round(rect.y + rect.height + CANVAS_ROW_GAP);
        if (neededY > candY) candY = neededY;
      }
    }
    if (candY < bestY || (candY === bestY && candX < bestX)) {
      bestY = candY;
      bestX = candX;
    }
  }

  return { x: bestX, y: Number.isFinite(bestY) ? bestY : startY };
}

/**
 * Resolves 2D overlaps when one or more anchor artboards grow taller or wider (e.g. expanding from
 * 1 column to 2 columns or adding notes), cascading cleanly right within a row or down across rows.
 */
function resolveArtboardOverlaps(
  anchorGroupIds: Iterable<string>,
  groups: CanvasGroup[],
  cards: CanvasCard[],
  strokes: CanvasStroke[],
): void {
  const activeIds = new Set(anchorGroupIds);
  if (activeIds.size === 0 || groups.length < 2) return;

  for (let pass = 0; pass < 24; pass += 1) {
    let movedAny = false;
    const nextActive = new Set<string>();

    for (const a of groups) {
      if (!activeIds.has(a.id)) continue;
      const aH = getGroupVisualHeight(a);

      for (const b of groups) {
        if (b.id === a.id) continue;
        const bH = getGroupVisualHeight(b);

        const overlapX = a.x + a.width + CANVAS_COL_GAP - b.x;
        const revOverlapX = b.x + b.width + CANVAS_COL_GAP - a.x;
        const overlapY = a.y + aH + CANVAS_ROW_GAP - b.y;
        const revOverlapY = b.y + bH + CANVAS_ROW_GAP - a.y;

        if (overlapX <= 0 || revOverlapX <= 0 || overlapY <= 0 || revOverlapY <= 0) {
          continue;
        }

        // Same-row neighbor to the right -> push right; otherwise push down cleanly.
        const sameRow = Math.abs(b.y - a.y) <= Math.min(aH, bH) * 0.65;
        if (sameRow && b.x >= a.x) {
          moveGroupWithContents(b, overlapX, 0, cards, strokes);
        } else {
          moveGroupWithContents(b, 0, overlapY, cards, strokes);
        }
        nextActive.add(b.id);
        movedAny = true;
      }
    }

    if (!movedAny) break;
    for (const id of nextActive) activeIds.add(id);
  }
}

/**
 * Optimal sequential partition of chronologically ordered cards into `colCount` balanced vertical
 * columns (binary search on column height limit so columns have near-equal heights without reordering).
 */
function partitionCardsIntoBalancedColumns(cards: CanvasCard[], colCount: number): CanvasCard[][] {
  if (colCount <= 1 || cards.length <= 1) return [cards];
  const count = Math.min(colCount, cards.length);
  let low = Math.max(...cards.map((c) => c.height));
  let high = cards.reduce((sum, c) => sum + c.height, 0) + (cards.length - 1) * CANVAS_CARD_GAP;

  const fitsInColumns = (limit: number): boolean => {
    let usedCols = 1;
    let colH = 0;
    for (const card of cards) {
      const added = colH > 0 ? CANVAS_CARD_GAP + card.height : card.height;
      if (colH > 0 && colH + added > limit) {
        usedCols += 1;
        if (usedCols > count) return false;
        colH = card.height;
      } else {
        colH += added;
      }
    }
    return true;
  };

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (fitsInColumns(mid)) high = mid;
    else low = mid + 1;
  }

  const cols: CanvasCard[][] = [[]];
  let colH = 0;
  for (const card of cards) {
    const added = colH > 0 ? CANVAS_CARD_GAP + card.height : card.height;
    if (colH > 0 && colH + added > low && cols.length < count) {
      cols.push([card]);
      colH = card.height;
    } else {
      cols[cols.length - 1]!.push(card);
      colH += added;
    }
  }
  return cols;
}

/**
 * Single source of truth for laying out cards inside any artboard (video or custom).
 * Supports 3 modes:
 * - `"columns"` (default): 1-column for short lectures, auto-wrapping into 2–4 balanced columns for long lectures.
 * - `"grid"`: horizontal left-to-right wrapped row grid inside the artboard.
 * - `"single"`: classic single vertical column stack.
 */
export function layoutCardsInArtboard(
  group: CanvasGroup,
  cards: CanvasCard[],
  cardLayout: CanvasArtboardCardLayout = DEFAULT_CANVAS_LAYOUT_OPTIONS.cardLayout,
): void {
  const inGroup = cards.filter((c) => c.groupId === group.id);
  if (inGroup.length === 0) {
    if (group.type === "video-artboard") {
      group.width = CANVAS_GROUP_WIDTH;
      group.height = 180;
    }
    return;
  }

  let ordered: CanvasCard[];
  if (group.type === "video-artboard") {
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
    const autoSet = new Set(autoVideoCards);
    const extras = inGroup
      .filter((c) => !autoSet.has(c))
      .sort((a, b) => (Math.abs(a.y - b.y) > 28 ? a.y - b.y : a.x - b.x));
    ordered = [...autoVideoCards, ...extras];
  } else {
    ordered = [...inGroup].sort((a, b) => (Math.abs(a.y - b.y) > 28 ? a.y - b.y : a.x - b.x));
  }

  const totalStackedH =
    ordered.reduce((sum, c) => sum + c.height, 0) + (ordered.length - 1) * CANVAS_CARD_GAP;
  const targetCols =
    cardLayout === "single" ||
    ordered.length <= 2 ||
    totalStackedH <= CANVAS_ARTBOARD_TARGET_COL_HEIGHT
      ? 1
      : Math.min(
          CANVAS_ARTBOARD_MAX_COLS,
          ordered.length,
          Math.max(2, Math.ceil(totalStackedH / CANVAS_ARTBOARD_TARGET_COL_HEIGHT)),
        );

  const startX = group.x + CANVAS_PADDING_X;
  const startY = group.y + CANVAS_ARTBOARD_TOP_PAD;

  if (targetCols === 1) {
    let cursorY = startY;
    let maxCardW = CANVAS_CARD_WIDTH;
    for (const card of ordered) {
      card.x = startX;
      card.y = cursorY;
      cursorY += card.height + CANVAS_CARD_GAP;
      if (card.width > maxCardW) maxCardW = card.width;
    }
    group.width = Math.max(CANVAS_GROUP_WIDTH, maxCardW + CANVAS_PADDING_X * 2);
    group.height = Math.max(180, cursorY - CANVAS_CARD_GAP + CANVAS_PADDING_BOTTOM - group.y);
    return;
  }

  if (cardLayout === "grid") {
    const colWidths = new Array<number>(targetCols).fill(CANVAS_CARD_WIDTH);
    const rowHeights: number[] = [];
    ordered.forEach((card, idx) => {
      const col = idx % targetCols;
      const row = Math.floor(idx / targetCols);
      colWidths[col] = Math.max(colWidths[col]!, card.width);
      rowHeights[row] = Math.max(rowHeights[row] ?? 0, card.height);
    });

    const colXs: number[] = [];
    let cx = startX;
    for (let col = 0; col < targetCols; col += 1) {
      colXs.push(cx);
      cx += colWidths[col]! + CANVAS_CARD_GAP;
    }

    const rowYs: number[] = [];
    let cy = startY;
    for (let row = 0; row < rowHeights.length; row += 1) {
      rowYs.push(cy);
      cy += rowHeights[row]! + CANVAS_CARD_GAP;
    }

    ordered.forEach((card, idx) => {
      const col = idx % targetCols;
      const row = Math.floor(idx / targetCols);
      card.x = colXs[col]!;
      card.y = rowYs[row]!;
    });

    group.width = Math.max(CANVAS_GROUP_WIDTH, cx - CANVAS_CARD_GAP + CANVAS_PADDING_X - group.x);
    group.height = Math.max(180, cy - CANVAS_CARD_GAP + CANVAS_PADDING_BOTTOM - group.y);
    return;
  }

  // Default `"columns"`: balanced chronological vertical columns with zero dead row gaps
  const columns = partitionCardsIntoBalancedColumns(ordered, targetCols);
  let cursorX = startX;
  let maxBottom = startY;

  for (const colCards of columns) {
    let cursorY = startY;
    let colWidth = CANVAS_CARD_WIDTH;
    for (const card of colCards) {
      card.x = cursorX;
      card.y = cursorY;
      cursorY += card.height + CANVAS_CARD_GAP;
      if (card.width > colWidth) colWidth = card.width;
    }
    const colBottom = cursorY - CANVAS_CARD_GAP;
    if (colBottom > maxBottom) maxBottom = colBottom;
    cursorX += colWidth + CANVAS_CARD_GAP;
  }

  group.width = Math.max(
    CANVAS_GROUP_WIDTH,
    cursorX - CANVAS_CARD_GAP + CANVAS_PADDING_X - group.x,
  );
  group.height = Math.max(180, maxBottom + CANVAS_PADDING_BOTTOM - group.y);
}

export function createVideoArtboardGroup(
  lessonIdx: number,
  lessons: CourseLessonItem[],
  existingGroups: CanvasGroup[],
  existingCards: CanvasCard[],
  existingStrokes: CanvasStroke[] = [],
  courseId?: string,
  layoutOptions: CanvasLayoutOptions = DEFAULT_CANVAS_LAYOUT_OPTIONS,
): CanvasGroup {
  const lesson = lessons[lessonIdx];
  const videoGroups = existingGroups
    .filter((g) => g.type === "video-artboard" && g.lessonIdx !== undefined)
    .sort((a, b) => a.lessonIdx! - b.lessonIdx!);
  const prevBefore = [...videoGroups].reverse().find((g) => g.lessonIdx! < lessonIdx);

  const placedRects: CanvasBounds[] = existingGroups.map((g) => ({
    x: g.x,
    y: g.y,
    width: g.width,
    height: getGroupVisualHeight(g),
  }));
  for (const c of existingCards) {
    if (!c.groupId) {
      placedRects.push({ x: c.x, y: c.y, width: c.width, height: c.height });
    }
  }

  const targetRowWidth = computeTargetRowWidth(existingGroups);
  const newWidth = CANVAS_GROUP_WIDTH;
  const newHeight = 220;

  let x = CANVAS_START_X;
  let y = CANVAS_START_Y;

  if (prevBefore) {
    const prevModIdx =
      prevBefore.lessonIdx !== undefined ? lessons[prevBefore.lessonIdx]?.modIdx : undefined;
    const nextModIdx = lesson?.modIdx;
    const isNewModule =
      layoutOptions.boardLayout === "module-rows" &&
      prevModIdx !== undefined &&
      nextModIdx !== undefined &&
      prevModIdx !== nextModIdx;

    if (isNewModule) {
      let maxPrevBottom = prevBefore.y + getGroupVisualHeight(prevBefore);
      for (const g of existingGroups) {
        if (Math.abs(g.y - prevBefore.y) < 120) {
          maxPrevBottom = Math.max(maxPrevBottom, g.y + getGroupVisualHeight(g));
        }
      }
      const slot = findSkylineSlot(
        placedRects,
        newWidth,
        newHeight,
        CANVAS_START_X,
        Math.round(maxPrevBottom + CANVAS_MODULE_ROW_GAP),
        targetRowWidth,
      );
      x = slot.x;
      y = slot.y;
    } else {
      const rightX = Math.round(prevBefore.x + prevBefore.width + CANVAS_COL_GAP);
      const rightY = Math.round(prevBefore.y);
      const fitsInRow = rightX + newWidth <= CANVAS_START_X + targetRowWidth;
      const collidesRight = placedRects.some((r) =>
        rectsOverlap({ x: rightX, y: rightY, width: newWidth, height: newHeight }, r, 12),
      );
      if (fitsInRow && !collidesRight) {
        x = rightX;
        y = rightY;
      } else {
        const slot = findSkylineSlot(
          placedRects,
          newWidth,
          newHeight,
          CANVAS_START_X,
          rightY,
          targetRowWidth,
        );
        x = slot.x;
        y = slot.y;
      }
    }
  } else if (placedRects.length > 0) {
    const slot = findSkylineSlot(
      placedRects,
      newWidth,
      newHeight,
      CANVAS_START_X,
      CANVAS_START_Y,
      targetRowWidth,
    );
    x = slot.x;
    y = slot.y;
  }

  const created: CanvasGroup = {
    id: getVideoArtboardId(lessonIdx, courseId),
    type: "video-artboard",
    lessonIdx,
    videoId: lesson?.lessonId,
    title: formatCanvasArtboardTitle(lessons, lessonIdx),
    subtitle: lesson?.moduleTitle || lesson?.duration,
    x,
    y,
    width: newWidth,
    height: newHeight,
    tintIndex: getVideoArtboardTintIndex(lessonIdx, lessons, layoutOptions.colorByModule),
    layoutMode: "auto",
    collapsed: false,
  };

  // Preserve unused-param signature compatibility cleanly if caller passes strokes for overlap resolution
  void existingStrokes;
  return created;
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

    // Skip long backward-diagonal column-wrap or row-wrap jumps so arrows never slash across cards.
    const isColumnWrapJump = to.x > from.x + from.width - 12 && to.y < from.y - 40;
    const isRowWrapJump = to.y > from.y + from.height - 12 && to.x < from.x - 40;
    if (isColumnWrapJump || isRowWrapJump) continue;

    const sameColumnBelow = Math.abs(from.x - to.x) <= 48 && to.y >= from.y + from.height - 12;
    const sameRowRight = Math.abs(from.y - to.y) <= 48 && to.x >= from.x + from.width - 12;

    result.push({
      id: `chrono-${group.id}-${from.id}-${to.id}`,
      edgeKind: "auto-chrono",
      fromId: from.id,
      toId: to.id,
      ...(sameColumnBelow
        ? { fromSide: "bottom" as const, toSide: "top" as const }
        : sameRowRight
          ? { fromSide: "right" as const, toSide: "left" as const }
          : {}),
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
  cardLayout: CanvasArtboardCardLayout = DEFAULT_CANVAS_LAYOUT_OPTIONS.cardLayout,
): { x: number; y: number; requiredGroupWidth: number; requiredGroupHeight: number } {
  const inGroup = cards.filter((c) => c.groupId === group.id);
  const baseStartX = group.x + CANVAS_PADDING_X;
  const baseStartY = group.y + CANVAS_ARTBOARD_TOP_PAD;

  if (inGroup.length === 0) {
    return {
      x: baseStartX,
      y: baseStartY,
      requiredGroupWidth: Math.max(group.width, cardWidth + CANVAS_PADDING_X * 2),
      requiredGroupHeight: Math.max(
        group.height,
        baseStartY - group.y + cardHeight + CANVAS_PADDING_BOTTOM,
      ),
    };
  }

  // Group cards by rough visual columns so appending in custom mode stays compact instead of growing infinitely down.
  let rightmostX = baseStartX;
  for (const c of inGroup) {
    if (c.x > rightmostX) rightmostX = c.x;
  }

  const lastColCards = inGroup.filter((c) => Math.abs(c.x - rightmostX) <= 48);
  let lastColBottom = baseStartY - CANVAS_CARD_GAP;
  let lastColMaxRight = rightmostX + cardWidth;
  for (const c of lastColCards) {
    if (c.y + c.height > lastColBottom) lastColBottom = c.y + c.height;
    if (c.x + c.width > lastColMaxRight) lastColMaxRight = c.x + c.width;
  }

  const distinctColCount = new Set(inGroup.map((c) => Math.round((c.x - group.x) / 120))).size;
  const nextYInLastCol = lastColBottom + CANVAS_CARD_GAP;
  const shouldStartNextColumn =
    cardLayout !== "single" &&
    distinctColCount < CANVAS_ARTBOARD_MAX_COLS &&
    nextYInLastCol - group.y + cardHeight + CANVAS_PADDING_BOTTOM >
      CANVAS_ARTBOARD_TARGET_COL_HEIGHT;

  const x = shouldStartNextColumn ? Math.round(lastColMaxRight + CANVAS_CARD_GAP) : rightmostX;
  let y = shouldStartNextColumn ? baseStartY : nextYInLastCol;

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

  return {
    x,
    y,
    requiredGroupWidth: Math.max(group.width, x - group.x + cardWidth + CANVAS_PADDING_X),
    requiredGroupHeight: Math.max(group.height, y - group.y + cardHeight + CANVAS_PADDING_BOTTOM),
  };
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
  layoutOptions: CanvasLayoutOptions = DEFAULT_CANVAS_LAYOUT_OPTIONS,
): CourseCanvasState {
  const isInitialBoardBuild =
    !existingState || (existingState.groups.length === 0 && existingState.cards.length === 0);
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
  const expandedGroupIds = new Set<string>();
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
            layoutOptions,
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
          const prevW = targetGroup.width;
          const prevH = targetGroup.height;
          const slot = findFreeSlotInGroup(
            targetGroup,
            base.cards,
            CANVAS_CARD_WIDTH,
            existingCard.height,
            layoutOptions.cardLayout,
          );
          targetGroup.width = slot.requiredGroupWidth;
          targetGroup.height = slot.requiredGroupHeight;
          if (targetGroup.width > prevW || targetGroup.height > prevH) {
            expandedGroupIds.add(targetGroup.id);
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
          layoutOptions,
        );
        base.groups.push(created);
        expandedGroupIds.add(created.id);
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
        y: targetGroup.y + CANVAS_ARTBOARD_TOP_PAD,
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
      // append new Player note into the first collision-free slot extending the Artboard cleanly.
      const prevW = targetGroup.width;
      const prevH = targetGroup.height;
      const slot = findFreeSlotInGroup(
        targetGroup,
        base.cards,
        CANVAS_CARD_WIDTH,
        estHeight,
        layoutOptions.cardLayout,
      );
      targetGroup.width = slot.requiredGroupWidth;
      targetGroup.height = slot.requiredGroupHeight;
      if (targetGroup.width > prevW || targetGroup.height > prevH) {
        expandedGroupIds.add(targetGroup.id);
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

  if (isInitialBoardBuild && base.groups.length > 0) {
    const laidOut = tidyAllCanvasArtboards(base, lessons, layoutOptions);
    laidOut.lastSyncRevision = Math.max(laidOut.lastSyncRevision, syncRevision);
    return laidOut;
  }

  for (const gId of autoGroupsToReflow) {
    const group = base.groups.find((g) => g.id === gId);
    if (group) {
      const prevW = group.width;
      const prevH = group.height;
      layoutCardsInArtboard(group, base.cards, layoutOptions.cardLayout);
      if (group.width > prevW || group.height > prevH) {
        expandedGroupIds.add(group.id);
      }
    }
  }

  fitArtboardsToChildren(base.groups, base.cards);
  if (expandedGroupIds.size > 0) {
    resolveArtboardOverlaps(expandedGroupIds, base.groups, base.cards, base.strokes);
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
  cardLayout: CanvasArtboardCardLayout = DEFAULT_CANVAS_LAYOUT_OPTIONS.cardLayout,
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

  const expandedIds: string[] = [];
  if (target.groupId) {
    const group = nextGroups.find((g) => g.id === target.groupId);
    if (group && group.type === "video-artboard" && group.layoutMode === "auto") {
      const prevW = group.width;
      const prevH = group.height;
      layoutCardsInArtboard(group, nextCards, cardLayout);
      if (group.width > prevW || group.height > prevH) {
        expandedIds.push(group.id);
      }
    }
  }

  fitArtboardsToChildren(nextGroups, nextCards);
  if (expandedIds.length > 0) {
    resolveArtboardOverlaps(expandedIds, nextGroups, nextCards, nextStrokes);
  }

  return {
    ...state,
    groups: nextGroups,
    cards: nextCards,
    strokes: nextStrokes,
    edges:
      expandedIds.length > 0
        ? rebuildAllAutoChronoEdges(nextGroups, nextCards, state.edges)
        : state.edges,
  };
}

/**
 * Fits a card's width/height to a target size (growing or shrinking to remove empty space)
 * and keeps auto video artboards packed without leaving vertical gaps.
 */
export function resizeCardToFit(
  state: CourseCanvasState,
  cardId: string,
  nextWidth: number,
  nextHeight: number,
  cardLayout: CanvasArtboardCardLayout = DEFAULT_CANVAS_LAYOUT_OPTIONS.cardLayout,
): CourseCanvasState {
  const target = state.cards.find((c) => c.id === cardId);
  if (!target) return state;

  const clampedWidth = Math.max(
    getCardMinWidth(target.type),
    Math.min(2400, Math.round(nextWidth)),
  );
  const clampedHeight = Math.max(
    getCardMinHeight(target.type),
    Math.min(12000, Math.ceil(nextHeight)),
  );
  if (clampedWidth === target.width && clampedHeight === target.height) return state;

  const nextGroups = state.groups.map((g) => ({ ...g }));
  const now = Date.now();
  const nextCards = state.cards.map((c) =>
    c.id === cardId
      ? { ...c, width: clampedWidth, height: clampedHeight, updatedAt: now }
      : { ...c },
  );
  const nextStrokes = state.strokes.map((s) => ({
    ...s,
    points: s.points.map((pt) => [...pt] as [number, number, number]),
  }));

  const expandedIds: string[] = [];
  if (target.groupId) {
    const group = nextGroups.find((g) => g.id === target.groupId);
    if (group && group.type === "video-artboard" && group.layoutMode === "auto") {
      const prevW = group.width;
      const prevH = group.height;
      layoutCardsInArtboard(group, nextCards, cardLayout);
      if (group.width > prevW || group.height > prevH) {
        expandedIds.push(group.id);
      }
    }
  }

  fitArtboardsToChildren(nextGroups, nextCards);
  if (expandedIds.length > 0) {
    resolveArtboardOverlaps(expandedIds, nextGroups, nextCards, nextStrokes);
  }

  return {
    ...state,
    groups: nextGroups,
    cards: nextCards,
    strokes: nextStrokes,
    edges: rebuildAllAutoChronoEdges(nextGroups, nextCards, state.edges),
  };
}

export function tidyVideoArtboard(
  state: CourseCanvasState,
  groupId: string,
  cardLayout: CanvasArtboardCardLayout = DEFAULT_CANVAS_LAYOUT_OPTIONS.cardLayout,
): CourseCanvasState {
  const nextGroups = state.groups.map((g) => ({ ...g }));
  const nextCards = state.cards.map((c) => ({ ...c }));
  const nextStrokes = state.strokes.map((s) => ({
    ...s,
    points: s.points.map((pt) => [...pt] as [number, number, number]),
  }));
  const target = nextGroups.find((g) => g.id === groupId);
  if (!target) return state;

  const prevW = target.width;
  const prevH = target.height;
  if (target.type === "video-artboard") {
    target.layoutMode = "auto";
    for (const c of nextCards) {
      if (
        c.groupId === target.id &&
        c.type === "video-note" &&
        c.originLessonIdx === target.lessonIdx
      ) {
        c.membershipState = "auto";
      }
    }
  }

  layoutCardsInArtboard(target, nextCards, cardLayout);
  fitArtboardsToChildren(nextGroups, nextCards);
  if (target.width > prevW || target.height > prevH) {
    resolveArtboardOverlaps([target.id], nextGroups, nextCards, nextStrokes);
  }

  return {
    ...state,
    groups: nextGroups,
    cards: nextCards,
    strokes: nextStrokes,
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
  layoutOptions: CanvasLayoutOptions = DEFAULT_CANVAS_LAYOUT_OPTIONS,
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
      layoutOptions,
    );
    groups.push(originGroup);
  }

  originGroup.collapsed = false;
  card.membershipState = "auto";

  const prevW = originGroup.width;
  const prevH = originGroup.height;
  if (originGroup.layoutMode === "auto") {
    card.groupId = originGroup.id;
    layoutCardsInArtboard(originGroup, cards, layoutOptions.cardLayout);
  } else {
    card.groupId = null;
    const slot = findFreeSlotInGroup(
      originGroup,
      cards,
      card.width,
      card.height,
      layoutOptions.cardLayout,
    );
    originGroup.width = slot.requiredGroupWidth;
    originGroup.height = slot.requiredGroupHeight;
    card.groupId = originGroup.id;
    card.x = slot.x;
    card.y = slot.y;
  }

  fitArtboardsToChildren(groups, cards);
  if (originGroup.width > prevW || originGroup.height > prevH) {
    resolveArtboardOverlaps([originGroup.id], groups, cards, strokes);
  }
}

export function returnCardToOriginGroup(
  state: CourseCanvasState,
  cardId: string,
  lessons: CourseLessonItem[],
  layoutOptions: CanvasLayoutOptions = DEFAULT_CANVAS_LAYOUT_OPTIONS,
): CourseCanvasState {
  const nextGroups = state.groups.map((g) => ({ ...g }));
  const nextCards = state.cards.map((c) => ({ ...c }));
  const nextStrokes = state.strokes.map((s) => ({
    ...s,
    points: s.points.map((pt) => [...pt] as [number, number, number]),
  }));
  const card = nextCards.find((c) => c.id === cardId);
  if (!card || card.originLessonIdx === undefined) return state;

  attachCardToOriginVideoGroup(
    nextGroups,
    nextCards,
    nextStrokes,
    card,
    lessons,
    state.courseId,
    layoutOptions,
  );

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
  layoutOptions: CanvasLayoutOptions = DEFAULT_CANVAS_LAYOUT_OPTIONS,
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
    layoutOptions,
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

function layoutGroupsInWrappedRows(
  groups: CanvasGroup[],
  cards: CanvasCard[],
  strokes: CanvasStroke[],
  startX: number,
  startY: number,
  targetRowWidth: number,
): number {
  let cursorX = startX;
  let cursorY = startY;
  let rowMaxH = 0;

  for (const g of groups) {
    const gH = getGroupVisualHeight(g);
    if (cursorX > startX && cursorX + g.width > startX + targetRowWidth) {
      cursorX = startX;
      cursorY += rowMaxH + CANVAS_ROW_GAP;
      rowMaxH = 0;
    }
    moveGroupWithContents(g, cursorX - g.x, cursorY - g.y, cards, strokes);
    cursorX += g.width + CANVAS_COL_GAP;
    if (gH > rowMaxH) rowMaxH = gH;
  }

  return rowMaxH > 0 ? cursorY + rowMaxH : startY;
}

function layoutGroupsInMasonry(
  groups: CanvasGroup[],
  cards: CanvasCard[],
  strokes: CanvasStroke[],
  startX: number,
  startY: number,
  targetRowWidth: number,
): number {
  const placed: CanvasBounds[] = [];
  let maxBottom = startY;

  for (const g of groups) {
    const gH = getGroupVisualHeight(g);
    const slot = findSkylineSlot(placed, g.width, gH, startX, startY, targetRowWidth);
    moveGroupWithContents(g, slot.x - g.x, slot.y - g.y, cards, strokes);
    placed.push({ x: g.x, y: g.y, width: g.width, height: gH });
    if (g.y + gH > maxBottom) maxBottom = g.y + gH;
  }

  return maxBottom;
}

export function applyVideoArtboardTintPolicy(
  state: CourseCanvasState,
  lessons: CourseLessonItem[],
  colorByModule: boolean,
): CourseCanvasState {
  let changed = false;
  const nextGroups = state.groups.map((g) => {
    if (g.type !== "video-artboard" || g.lessonIdx === undefined) return g;
    const nextTint = getVideoArtboardTintIndex(g.lessonIdx, lessons, colorByModule);
    if (nextTint === g.tintIndex) return g;
    changed = true;
    return { ...g, tintIndex: nextTint };
  });
  return changed ? { ...state, groups: nextGroups } : state;
}

export function computeFitViewport(
  state: CourseCanvasState,
  viewportWidth: number,
  viewportHeight: number,
  padding = 72,
): CanvasViewport {
  const bounds = computeCanvasBundleBounds(state.groups, state.cards, state.strokes);
  if (!bounds || viewportWidth <= 0 || viewportHeight <= 0) {
    return { x: 40, y: 30, zoom: 1 };
  }
  const availW = Math.max(120, viewportWidth - padding * 2);
  // Reserve extra vertical breathing room for top floating HUD + bottom tool dock.
  const availH = Math.max(120, viewportHeight - padding * 2 - 48);
  const fitZoom = Math.min(availW / bounds.width, availH / bounds.height, 1);
  const zoom = Math.max(CANVAS_MIN_ZOOM, Math.min(CANVAS_MAX_ZOOM, fitZoom));
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  return {
    x: Math.round(viewportWidth / 2 - centerX * zoom),
    y: Math.round((viewportHeight - 16) / 2 - centerY * zoom),
    zoom,
  };
}

/**
 * Organizes all artboards across the canvas in 2D using the user's chosen board layout
 * (`module-rows`, `wrapped-rows`, or `masonry`) and internal card layout (`columns`, `grid`, or `single`),
 * keeping non-colliding freeform items intact.
 */
export function tidyAllCanvasArtboards(
  state: CourseCanvasState,
  lessons: CourseLessonItem[] = [],
  layoutOptions: CanvasLayoutOptions = DEFAULT_CANVAS_LAYOUT_OPTIONS,
): CourseCanvasState {
  const nextGroups = state.groups.map((g) => ({ ...g }));
  const nextCards = state.cards.map((c) => ({ ...c }));
  const nextStrokes = state.strokes.map((s) => ({
    ...s,
    points: s.points.map((pt) => [...pt] as [number, number, number]),
  }));

  // 1. Reflow cards inside every artboard first so final 2D artboard sizes are known before board packing.
  for (const g of nextGroups) {
    if (g.type === "video-artboard") {
      g.layoutMode = "auto";
      for (const c of nextCards) {
        if (c.groupId === g.id && c.type === "video-note" && c.originLessonIdx === g.lessonIdx) {
          c.membershipState = "auto";
        }
      }
      if (g.lessonIdx !== undefined) {
        g.tintIndex = getVideoArtboardTintIndex(g.lessonIdx, lessons, layoutOptions.colorByModule);
      }
    }
    layoutCardsInArtboard(g, nextCards, layoutOptions.cardLayout);
  }
  fitArtboardsToChildren(nextGroups, nextCards);

  const videoGroups = nextGroups
    .filter((g) => g.type === "video-artboard" && g.lessonIdx !== undefined)
    .sort((a, b) => a.lessonIdx! - b.lessonIdx!);
  const customGroups = nextGroups
    .filter((g) => !(g.type === "video-artboard" && g.lessonIdx !== undefined))
    .sort((a, b) => (Math.abs(a.y - b.y) > 40 ? a.y - b.y : a.x - b.x));

  const targetRowWidth = computeTargetRowWidth(videoGroups.length > 0 ? videoGroups : customGroups);

  // 2. Pack Video Artboards in 2D according to `boardLayout`.
  let contentBottom = CANVAS_START_Y;
  if (videoGroups.length > 0) {
    if (layoutOptions.boardLayout === "masonry") {
      contentBottom = layoutGroupsInMasonry(
        videoGroups,
        nextCards,
        nextStrokes,
        CANVAS_START_X,
        CANVAS_START_Y,
        targetRowWidth,
      );
    } else if (layoutOptions.boardLayout === "module-rows") {
      const moduleBuckets = new Map<number, CanvasGroup[]>();
      for (const g of videoGroups) {
        const modIdx = lessons[g.lessonIdx!]?.modIdx ?? 0;
        const bucket = moduleBuckets.get(modIdx) ?? [];
        bucket.push(g);
        moduleBuckets.set(modIdx, bucket);
      }

      let rowY = CANVAS_START_Y;
      const orderedModules = Array.from(moduleBuckets.entries()).sort(([a], [b]) => a - b);
      for (let i = 0; i < orderedModules.length; i += 1) {
        const [, bucketGroups] = orderedModules[i]!;
        const moduleBottom = layoutGroupsInWrappedRows(
          bucketGroups,
          nextCards,
          nextStrokes,
          CANVAS_START_X,
          rowY,
          targetRowWidth,
        );
        contentBottom = moduleBottom;
        rowY = moduleBottom + CANVAS_MODULE_ROW_GAP;
      }
    } else {
      // `"wrapped-rows"`: continuous left-to-right balanced rows
      contentBottom = layoutGroupsInWrappedRows(
        videoGroups,
        nextCards,
        nextStrokes,
        CANVAS_START_X,
        CANVAS_START_Y,
        targetRowWidth,
      );
    }
  }

  // 3. Place Custom Artboards in clean wrapped rows below the lecture artboards.
  if (customGroups.length > 0) {
    const customStartY =
      videoGroups.length > 0 ? contentBottom + CANVAS_MODULE_ROW_GAP : CANVAS_START_Y;
    contentBottom =
      layoutOptions.boardLayout === "masonry"
        ? layoutGroupsInMasonry(
            customGroups,
            nextCards,
            nextStrokes,
            CANVAS_START_X,
            customStartY,
            targetRowWidth,
          )
        : layoutGroupsInWrappedRows(
            customGroups,
            nextCards,
            nextStrokes,
            CANVAS_START_X,
            customStartY,
            targetRowWidth,
          );
  }

  const orderedGroups = [...videoGroups, ...customGroups];
  const groupVisualRects: CanvasBounds[] = orderedGroups.map((g) => ({
    x: g.x,
    y: g.y,
    width: g.width,
    height: getGroupVisualHeight(g),
  }));

  // 4. Coexistence with user-added freeform items (loose cards & unparented drawings):
  // Non-colliding freeform items stay untouched; any loose cards or strokes buried under an
  // artboard move neatly into a non-overlapping Freeform Zone below the artboards.
  const ungroupedCards = nextCards
    .filter((c) => !c.groupId)
    .sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));

  const collidingCards = ungroupedCards.filter((c) =>
    groupVisualRects.some((rect) => rectsOverlap(c, rect, 16)),
  );

  const movedCardDeltas: {
    oldBounds: CanvasBounds;
    dx: number;
    dy: number;
  }[] = [];

  const freeformStartY =
    orderedGroups.length > 0 ? contentBottom + CANVAS_MODULE_ROW_GAP : CANVAS_START_Y;
  let freeformX = CANVAS_START_X;
  let freeformY = freeformStartY;
  let freeformRowMaxH = 0;

  for (const card of collidingCards) {
    if (freeformX > CANVAS_START_X && freeformX + card.width > CANVAS_START_X + targetRowWidth) {
      freeformX = CANVAS_START_X;
      freeformY += freeformRowMaxH + CANVAS_CARD_GAP;
      freeformRowMaxH = 0;
    }
    const oldBounds = { x: card.x, y: card.y, width: card.width, height: card.height };
    const dx = freeformX - card.x;
    const dy = freeformY - card.y;
    card.x = freeformX;
    card.y = freeformY;
    freeformX += card.width + CANVAS_CARD_GAP;
    if (card.height > freeformRowMaxH) freeformRowMaxH = card.height;
    movedCardDeltas.push({ oldBounds, dx, dy });
  }

  let strokeZoneY =
    freeformRowMaxH > 0 ? freeformY + freeformRowMaxH + CANVAS_CARD_GAP : freeformStartY;

  for (const stroke of nextStrokes) {
    if (stroke.parentGroupId) continue;
    const bounds = getStrokeBounds(stroke);
    if (!bounds) continue;

    const attachedCardMove = movedCardDeltas.find((m) => rectsOverlap(bounds, m.oldBounds, 24));
    if (attachedCardMove) {
      stroke.points = stroke.points.map(([px, py, pressure]) => [
        px + attachedCardMove.dx,
        py + attachedCardMove.dy,
        pressure,
      ]);
      continue;
    }

    if (groupVisualRects.some((rect) => rectsOverlap(bounds, rect, 12))) {
      const dx = Math.round(CANVAS_START_X - bounds.x);
      const dy = Math.round(strokeZoneY - bounds.y);
      stroke.points = stroke.points.map(([px, py, pressure]) => [px + dx, py + dy, pressure]);
      strokeZoneY += Math.ceil(bounds.height) + CANVAS_CARD_GAP;
    }
  }

  return {
    ...state,
    groups: orderedGroups,
    cards: nextCards,
    strokes: nextStrokes,
    edges: rebuildAllAutoChronoEdges(orderedGroups, nextCards, state.edges),
  };
}

export function resetCanvasArrangement(
  state: CourseCanvasState,
  lessons: CourseLessonItem[],
  layoutOptions: CanvasLayoutOptions = DEFAULT_CANVAS_LAYOUT_OPTIONS,
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
        layoutOptions,
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
      if (g.lessonIdx !== undefined) {
        g.tintIndex = getVideoArtboardTintIndex(g.lessonIdx, lessons, layoutOptions.colorByModule);
        if (lessons[g.lessonIdx]) {
          const lesson = lessons[g.lessonIdx]!;
          g.title = formatCanvasArtboardTitle(lessons, g.lessonIdx);
          g.subtitle = lesson.moduleTitle || lesson.duration;
        }
      }
    }
  }

  const populatedGroups = nextGroups.filter((g) => {
    const hasCards = nextCards.some((c) => c.groupId === g.id);
    const hasStrokes = nextStrokes.some((s) => s.parentGroupId === g.id);
    if (g.type === "video-artboard") {
      return hasCards || hasStrokes;
    }
    if (g.id.startsWith("cnode_group_") && !hasCards && !hasStrokes) {
      return false;
    }
    return true;
  });

  return tidyAllCanvasArtboards(
    {
      ...state,
      groups: populatedGroups,
      cards: nextCards,
      strokes: nextStrokes,
    },
    lessons,
    layoutOptions,
  );
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

export const CANVAS_CLIPBOARD_MIME = "application/x-tutin-canvas";
export const CANVAS_ARTBOARD_MIN_WIDTH = 280;
export const CANVAS_ARTBOARD_MIN_HEIGHT = 160;

export interface CanvasBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasSelectionBundle {
  groups: CanvasGroup[];
  cards: CanvasCard[];
  edges: CanvasEdge[];
  strokes: CanvasStroke[];
  /** Card IDs that were explicitly in the selection (not only pulled in as group children). */
  explicitCardIds: string[];
}

export interface CanvasClipboardPayload {
  version: 1;
  clipboardId: string;
  sourceCourseId: string;
  bounds: CanvasBounds;
  explicitCardIds: string[];
  groups: CanvasGroup[];
  cards: CanvasCard[];
  edges: CanvasEdge[];
  strokes: CanvasStroke[];
  plainText: string;
}

export interface CanvasCloneResult {
  nextState: CourseCanvasState;
  clonedGroups: CanvasGroup[];
  clonedCards: CanvasCard[];
  clonedStrokes: CanvasStroke[];
  topLevelClonedCardIds: string[];
  groupIdMap: Map<string, string>;
  cardIdMap: Map<string, string>;
}

/**
 * Single source of truth for resolving everything that belongs to a canvas selection:
 * selected artboards, their child/enclosed cards, explicitly selected cards,
 * parented/enclosed strokes, and manual edges connecting two cards inside the bundle.
 */
export function collectCanvasSelectionItems(
  state: CourseCanvasState,
  groupIds: Iterable<string>,
  cardIds: Iterable<string>,
): CanvasSelectionBundle {
  const groupIdSet = new Set(groupIds);
  const explicitCardSet = new Set(cardIds);

  const groups: CanvasGroup[] = [];
  const activeGroupIds = new Set<string>();
  const nonCollapsedGroupBounds: CanvasBounds[] = [];
  for (const g of state.groups) {
    if (!groupIdSet.has(g.id)) continue;
    groups.push(g);
    activeGroupIds.add(g.id);
    if (!g.collapsed) {
      nonCollapsedGroupBounds.push({ x: g.x, y: g.y, width: g.width, height: g.height });
    }
  }

  const isPointInSelectedGroup = (px: number, py: number): boolean =>
    nonCollapsedGroupBounds.some(
      (b) => px >= b.x && px <= b.x + b.width && py >= b.y && py <= b.y + b.height,
    );

  const cards: CanvasCard[] = [];
  const includedCardIds = new Set<string>();
  const explicitCardIds: string[] = [];

  for (const c of state.cards) {
    const isExplicit = explicitCardSet.has(c.id);
    const belongsToGroup = Boolean(c.groupId && activeGroupIds.has(c.groupId));
    const enclosedInGroup =
      !c.groupId &&
      nonCollapsedGroupBounds.length > 0 &&
      isPointInSelectedGroup(c.x + c.width / 2, c.y + c.height / 2);

    if (isExplicit || belongsToGroup || enclosedInGroup) {
      cards.push(c);
      includedCardIds.add(c.id);
      if (isExplicit) explicitCardIds.push(c.id);
    }
  }

  const strokes: CanvasStroke[] = [];
  if (activeGroupIds.size > 0) {
    for (const s of state.strokes) {
      const belongsToGroup = Boolean(s.parentGroupId && activeGroupIds.has(s.parentGroupId));
      const enclosesMidpoint =
        !s.parentGroupId &&
        nonCollapsedGroupBounds.length > 0 &&
        s.points.length > 0 &&
        (() => {
          const mid = s.points[Math.floor(s.points.length / 2)]!;
          return isPointInSelectedGroup(mid[0], mid[1]);
        })();
      if (belongsToGroup || enclosesMidpoint) {
        strokes.push(s);
      }
    }
  }

  const edges = state.edges.filter(
    (e) => e.edgeKind === "manual" && includedCardIds.has(e.fromId) && includedCardIds.has(e.toId),
  );

  return { groups, cards, edges, strokes, explicitCardIds };
}

export function computeCanvasBundleBounds(
  groups: CanvasGroup[],
  cards: CanvasCard[],
  strokes: CanvasStroke[] = [],
): CanvasBounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const collapsedGroupIds = new Set<string>();
  for (const g of groups) {
    if (g.collapsed) collapsedGroupIds.add(g.id);
    const h = g.collapsed ? CANVAS_GROUP_HEADER_HEIGHT : g.height;
    if (g.x < minX) minX = g.x;
    if (g.y < minY) minY = g.y;
    if (g.x + g.width > maxX) maxX = g.x + g.width;
    if (g.y + h > maxY) maxY = g.y + h;
  }

  for (const c of cards) {
    if (c.groupId && collapsedGroupIds.has(c.groupId)) continue;
    if (c.x < minX) minX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.x + c.width > maxX) maxX = c.x + c.width;
    if (c.y + c.height > maxY) maxY = c.y + c.height;
  }

  for (const s of strokes) {
    if (s.parentGroupId && collapsedGroupIds.has(s.parentGroupId)) continue;
    const b = getStrokeBounds(s);
    if (!b) continue;
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.width > maxX) maxX = b.x + b.width;
    if (b.y + b.height > maxY) maxY = b.y + b.height;
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

function instantiateClonedBundle(
  bundle: Pick<CanvasSelectionBundle, "groups" | "cards" | "edges" | "strokes" | "explicitCardIds">,
  dx: number,
  dy: number,
): {
  clonedGroups: CanvasGroup[];
  clonedCards: CanvasCard[];
  clonedEdges: CanvasEdge[];
  clonedStrokes: CanvasStroke[];
  topLevelClonedCardIds: string[];
  groupIdMap: Map<string, string>;
  cardIdMap: Map<string, string>;
} {
  const now = Date.now();
  const rdx = Math.round(dx);
  const rdy = Math.round(dy);

  const groupIdMap = new Map<string, string>();
  const clonedGroups: CanvasGroup[] = bundle.groups.map((g) => {
    const nextId = createCanvasId("cgroup");
    groupIdMap.set(g.id, nextId);
    // Cloned artboards are always independent custom artboards so lesson video-artboard uniqueness stays intact.
    return {
      id: nextId,
      type: "custom-artboard",
      title: g.title,
      x: Math.round(g.x + rdx),
      y: Math.round(g.y + rdy),
      width: g.width,
      height: g.height,
      tintIndex: g.tintIndex,
      layoutMode: "custom",
      collapsed: g.collapsed ?? false,
    };
  });

  const cardIdMap = new Map<string, string>();
  const clonedCards: CanvasCard[] = bundle.cards.map((c) => {
    // Cloned video-notes become independent canvas-notes so 1:1 Player noteId sync never collides.
    const nextType: CanvasCardType = c.type === "video-note" ? "canvas-note" : c.type;
    const idPrefix = nextType === "text" ? "text" : nextType === "image" ? "img" : "ccard";
    const nextId = createCanvasId(idPrefix);
    cardIdMap.set(c.id, nextId);
    const mappedGroupId = c.groupId ? (groupIdMap.get(c.groupId) ?? null) : null;
    return {
      id: nextId,
      type: nextType,
      groupId: mappedGroupId,
      membershipState: "canvas-only",
      isCanvasOnly: true,
      x: Math.round(c.x + rdx),
      y: Math.round(c.y + rdy),
      width: c.width,
      height: c.height,
      htmlContent: c.htmlContent,
      ...(c.imageSrc !== undefined ? { imageSrc: c.imageSrc } : {}),
      ...(c.caption !== undefined ? { caption: c.caption } : {}),
      ...(c.accentIndex !== undefined ? { accentIndex: c.accentIndex } : {}),
      createdAt: now,
      updatedAt: now,
    };
  });

  const clonedEdges: CanvasEdge[] = [];
  for (const e of bundle.edges) {
    if (e.edgeKind !== "manual") continue;
    const fromId = cardIdMap.get(e.fromId);
    const toId = cardIdMap.get(e.toId);
    if (!fromId || !toId) continue;
    clonedEdges.push({
      id: createCanvasId("cedge"),
      edgeKind: "manual",
      fromId,
      toId,
      ...(e.fromSide !== undefined ? { fromSide: e.fromSide } : {}),
      ...(e.toSide !== undefined ? { toSide: e.toSide } : {}),
      style: e.style,
      ...(e.label !== undefined ? { label: e.label } : {}),
      createdAt: now,
    });
  }

  const clonedStrokes: CanvasStroke[] = bundle.strokes.map((s) => ({
    id: createCanvasId("stroke"),
    tool: s.tool,
    points: s.points.map(([px, py, pressure]) => [px + rdx, py + rdy, pressure]),
    colorToken: s.colorToken,
    size: s.size,
    parentGroupId: s.parentGroupId ? (groupIdMap.get(s.parentGroupId) ?? null) : null,
  }));

  const topLevelClonedCardIds = bundle.explicitCardIds
    .map((id) => cardIdMap.get(id))
    .filter((id): id is string => Boolean(id));

  return {
    clonedGroups,
    clonedCards,
    clonedEdges,
    clonedStrokes,
    topLevelClonedCardIds,
    groupIdMap,
    cardIdMap,
  };
}

export function createCanvasClipboardPayload(
  state: CourseCanvasState,
  groupIds: Iterable<string>,
  cardIds: Iterable<string>,
): CanvasClipboardPayload | null {
  const bundle = collectCanvasSelectionItems(state, groupIds, cardIds);
  if (bundle.groups.length === 0 && bundle.cards.length === 0) return null;

  const bounds = computeCanvasBundleBounds(bundle.groups, bundle.cards, bundle.strokes);
  if (!bounds) return null;

  const plainParts: string[] = [];
  for (const c of bundle.cards) {
    const text =
      c.type === "image" ? (c.caption?.trim() ?? "") : stripHtmlToText(c.htmlContent).trim();
    if (text) plainParts.push(text);
  }

  return {
    version: 1,
    clipboardId: createCanvasId("clip"),
    sourceCourseId: state.courseId,
    bounds,
    explicitCardIds: [...bundle.explicitCardIds],
    groups: bundle.groups.map((g) => ({ ...g })),
    cards: bundle.cards.map((c) => ({ ...c })),
    edges: bundle.edges.map((e) => ({ ...e })),
    strokes: bundle.strokes.map((s) => ({
      ...s,
      points: s.points.map((pt) => [...pt] as [number, number, number]),
    })),
    plainText: plainParts.join("\n\n"),
  };
}

export function parseCanvasClipboardPayload(raw: string): CanvasClipboardPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CanvasClipboardPayload> | null;
    if (
      !parsed ||
      parsed.version !== 1 ||
      typeof parsed.clipboardId !== "string" ||
      !Array.isArray(parsed.groups) ||
      !Array.isArray(parsed.cards) ||
      !Array.isArray(parsed.edges) ||
      !Array.isArray(parsed.strokes) ||
      !parsed.bounds ||
      !Number.isFinite(parsed.bounds.x) ||
      !Number.isFinite(parsed.bounds.y) ||
      !Number.isFinite(parsed.bounds.width) ||
      !Number.isFinite(parsed.bounds.height)
    ) {
      return null;
    }
    return {
      version: 1,
      clipboardId: parsed.clipboardId,
      sourceCourseId: typeof parsed.sourceCourseId === "string" ? parsed.sourceCourseId : "",
      bounds: {
        x: parsed.bounds.x,
        y: parsed.bounds.y,
        width: parsed.bounds.width,
        height: parsed.bounds.height,
      },
      explicitCardIds: Array.isArray(parsed.explicitCardIds)
        ? parsed.explicitCardIds.filter((id): id is string => typeof id === "string")
        : parsed.cards.map((c) => c.id),
      groups: parsed.groups,
      cards: parsed.cards,
      edges: parsed.edges,
      strokes: parsed.strokes,
      plainText: typeof parsed.plainText === "string" ? parsed.plainText : "",
    };
  } catch {
    return null;
  }
}

/**
 * Duplicates the currently selected groups and/or cards in place (used by Alt+Drag).
 * Drop membership for standalone cloned cards is resolved when the drag finishes.
 */
export function cloneCanvasSelectionItems(
  state: CourseCanvasState,
  groupIds: Iterable<string>,
  cardIds: Iterable<string>,
  dx = 0,
  dy = 0,
): CanvasCloneResult | null {
  const bundle = collectCanvasSelectionItems(state, groupIds, cardIds);
  if (bundle.groups.length === 0 && bundle.cards.length === 0) return null;

  const {
    clonedGroups,
    clonedCards,
    clonedEdges,
    clonedStrokes,
    topLevelClonedCardIds,
    groupIdMap,
    cardIdMap,
  } = instantiateClonedBundle(bundle, dx, dy);

  const nextState: CourseCanvasState = {
    ...state,
    groups: [...state.groups, ...clonedGroups],
    cards: [...state.cards, ...clonedCards],
    edges: [...state.edges, ...clonedEdges],
    strokes: [...state.strokes, ...clonedStrokes],
  };

  return {
    nextState,
    clonedGroups,
    clonedCards,
    clonedStrokes,
    topLevelClonedCardIds,
    groupIdMap,
    cardIdMap,
  };
}

/**
 * Pastes a serialized canvas clipboard payload at offset `(dx, dy)` relative to its original bounds.
 * When pasting cards without artboards, resolves artboard drop membership cleanly.
 */
export function pasteCanvasClipboardPayload(
  state: CourseCanvasState,
  payload: CanvasClipboardPayload,
  dx: number,
  dy: number,
): CanvasCloneResult {
  const {
    clonedGroups,
    clonedCards,
    clonedEdges,
    clonedStrokes,
    topLevelClonedCardIds,
    groupIdMap,
    cardIdMap,
  } = instantiateClonedBundle(payload, dx, dy);

  let nextState: CourseCanvasState = {
    ...state,
    groups: [...state.groups, ...clonedGroups],
    cards: [...state.cards, ...clonedCards],
    edges: [...state.edges, ...clonedEdges],
    strokes: [...state.strokes, ...clonedStrokes],
  };

  if (clonedGroups.length === 0 && clonedCards.length > 0) {
    nextState = applyCardDropMembership(nextState, new Set(clonedCards.map((c) => c.id)));
  } else if (clonedGroups.length > 0) {
    const fittedGroups = nextState.groups.map((g) => ({ ...g }));
    fitArtboardsToChildren(fittedGroups, nextState.cards);
    nextState = {
      ...nextState,
      groups: fittedGroups,
    };
  }

  return {
    nextState,
    clonedGroups,
    clonedCards,
    clonedStrokes,
    topLevelClonedCardIds,
    groupIdMap,
    cardIdMap,
  };
}

/**
 * Wraps the selected cards in a newly created custom artboard sized snugly around them,
 * preserving each card's exact canvas position and parenting any enclosed unparented strokes.
 */
export function groupSelectionIntoArtboard(
  state: CourseCanvasState,
  cardIds: Iterable<string>,
  title = "New group",
): { nextState: CourseCanvasState; group: CanvasGroup } | null {
  const idSet = new Set(cardIds);
  if (idSet.size === 0) return null;

  const nextGroups = state.groups.map((g) => ({ ...g }));
  const nextCards = state.cards.map((c) => ({ ...c }));
  const selected = nextCards.filter((c) => idSet.has(c.id));
  if (selected.length === 0) return null;

  const minX = Math.min(...selected.map((c) => c.x));
  const minY = Math.min(...selected.map((c) => c.y));
  const maxRight = Math.max(...selected.map((c) => c.x + c.width));
  const maxBottom = Math.max(...selected.map((c) => c.y + c.height));

  const topPad = CANVAS_GROUP_HEADER_HEIGHT + 14;
  const gx = Math.round(minX - CANVAS_PADDING_X);
  const gy = Math.round(minY - topPad);
  const gw = Math.max(
    CANVAS_ARTBOARD_MIN_WIDTH,
    Math.round(maxRight - minX + CANVAS_PADDING_X * 2),
  );
  const gh = Math.max(
    CANVAS_ARTBOARD_MIN_HEIGHT,
    Math.round(maxBottom - minY + topPad + CANVAS_PADDING_BOTTOM),
  );

  const newGroup: CanvasGroup = {
    id: createCanvasId("cgroup"),
    type: "custom-artboard",
    title,
    x: gx,
    y: gy,
    width: gw,
    height: gh,
    tintIndex: nextGroups.length % 5,
    layoutMode: "custom",
    collapsed: false,
  };

  for (const card of selected) {
    if (card.groupId) {
      const prevGroup = nextGroups.find((g) => g.id === card.groupId);
      if (prevGroup) prevGroup.layoutMode = "custom";
    }
    card.groupId = newGroup.id;
    card.membershipState = card.isCanvasOnly ? "canvas-only" : "reassigned";
  }

  nextGroups.push(newGroup);

  const nextStrokes = state.strokes.map((s) => {
    if (s.parentGroupId || s.points.length === 0) return s;
    const mid = s.points[Math.floor(s.points.length / 2)]!;
    if (mid[0] >= gx && mid[0] <= gx + gw && mid[1] >= gy && mid[1] <= gy + gh) {
      return { ...s, parentGroupId: newGroup.id };
    }
    return s;
  });

  return {
    group: newGroup,
    nextState: {
      ...state,
      groups: nextGroups,
      cards: nextCards,
      strokes: nextStrokes,
      edges: rebuildAllAutoChronoEdges(nextGroups, nextCards, state.edges),
    },
  };
}
