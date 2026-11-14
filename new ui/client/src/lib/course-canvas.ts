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

export function formatCanvasLessonCode(
  lessons: CourseLessonItem[],
  lessonIdx: number,
): string {
  const lesson = lessons[lessonIdx];
  if (lesson) {
    return `M${lesson.modIdx + 1}L${lesson.lessonInModule + 1}`;
  }
  return `L${lessonIdx + 1}`;
}

export function formatCanvasArtboardTitle(
  lessons: CourseLessonItem[],
  lessonIdx: number,
): string {
  const lesson = lessons[lessonIdx];
  if (!lesson) return `Lesson ${lessonIdx + 1}`;
  return `${formatCanvasLessonCode(lessons, lessonIdx)} · ${lesson.title}`;
}

export function fitArtboardsToChildren(
  groups: CanvasGroup[],
  cards: CanvasCard[],
): void {
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

export function estimateVideoNoteCardHeight(html: string, imageCount: number): number {
  const plainText = stripHtmlToText(html);
  const blockBreaks = (html.match(/<(?:p|div|li|h[1-6]|blockquote|tr|br)\b/gi) ?? []).length;
  const lineEstimate = Math.max(
    plainText.length > 0 ? 1 : 0,
    Math.ceil(plainText.length / 34) + Math.floor(blockBreaks * 0.45),
  );
  const textHeight = plainText.length > 0 ? 58 + lineEstimate * 22 : 48;
  const imgTags = (html.match(/<img\b/gi) ?? []).length;
  const effectiveImages = Math.max(imageCount, imgTags);
  // Embedded screenshots scale cleanly inside a ~278px column (~156px at 16:9 + spacing)
  const mediaHeight = effectiveImages * 172;
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

const canvasMemoryCache = new Map<string, CourseCanvasState>();
const pendingCanvasSaves = new Map<string, number>();

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
  const timer = window.setTimeout(() => {
    pendingCanvasSaves.delete(state.courseId);
    void saveCourseCanvasToServer(payload);
  }, 220);
  pendingCanvasSaves.set(state.courseId, timer);
}

export function flushPendingCanvasSave(courseId: string): void {
  if (typeof window === "undefined") return;
  const timer = pendingCanvasSaves.get(courseId);
  if (timer !== undefined) {
    window.clearTimeout(timer);
    pendingCanvasSaves.delete(courseId);
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
}

export function summarizeCanvasState(parsed: Partial<CourseCanvasState> | null | undefined): CanvasSummaryMetrics {
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
      return { ...c, y: clampedY, groupId: targetGroup.id, membershipState: "canvas-only" as const };
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

  const clampedHeight = Math.max(target.height, Math.min(2800, Math.ceil(nextHeight)));
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
    const estimatedHeight =
      g.type === "video-artboard"
        ? next.cards
            .filter((c) => c.groupId === g.id)
            .reduce(
              (sum, c) => sum + c.height + CANVAS_CARD_GAP,
              CANVAS_GROUP_HEADER_HEIGHT + 14 + CANVAS_PADDING_BOTTOM,
            )
        : g.height;
    cursorX = advancePastOverlappingCards(
      cursorX,
      CANVAS_START_Y,
      next.cards,
      Math.max(560, g.height, estimatedHeight),
    );
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

  for (const card of nextCards) {
    if (card.type !== "video-note" || card.isCanvasOnly || card.originLessonIdx === undefined) {
      continue;
    }
    let originGroup = findVideoArtboardGroup(nextGroups, card.originLessonIdx, state.courseId);
    if (!originGroup) {
      originGroup = createVideoArtboardGroup(
        card.originLessonIdx,
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
    }
  }

  const populatedGroups = nextGroups.filter((g) => {
    if (g.type !== "video-artboard") return true;
    return (
      nextCards.some((c) => c.groupId === g.id) ||
      nextStrokes.some((s) => s.parentGroupId === g.id)
    );
  });

  return tidyAllCanvasArtboards({
    ...state,
    groups: populatedGroups,
    cards: nextCards,
    strokes: nextStrokes,
  });
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
