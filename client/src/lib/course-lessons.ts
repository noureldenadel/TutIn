import { apiJson, apiRequest } from "@/lib/api";
import { COURSES_CHANGED_EVENT, fetchCourses, touchCourseLastAccessed } from "@/lib/courses";
import { formatTimestamp, parseTimestampToSeconds } from "@/lib/format";

export { formatTimestamp, parseTimestampToSeconds as parseDurationToSeconds };

export interface SubtitleTrackMeta {
  pipeline?: string | undefined;
  generationSeconds?: number | null | undefined;
  transcriptionModel?: string | null | undefined;
  translationModel?: string | null | undefined;
  sourceTrackFile?: string | null | undefined;
  sourceLanguage?: string | null | undefined;
  generatedAt?: string | null | undefined;
}

export interface SubtitleSource {
  id?: string | undefined;
  language?: string | undefined;
  lang?: string | undefined;
  origin?: "uploaded" | "generated" | string | undefined;
  version?: number | undefined;
  label?: string | undefined;
  filePath?: string | undefined;
  fileName?: string | undefined;
  format?: string | undefined;
  isDefault?: boolean | undefined;
  is_master?: boolean | undefined;
  is_ai_source?: boolean | undefined;
  meta?: SubtitleTrackMeta | undefined;
}

export interface VideoBookmark {
  id?: string | undefined;
  time: number;
  label?: string | undefined;
  note?: string | undefined;
}

export interface DbModule {
  id: string;
  courseId: string;
  parentModuleId?: string | null | undefined;
  title: string;
  originalTitle?: string | null | undefined;
  description?: string | undefined;
  thumbnailData?: string | null | undefined;
  folderPath?: string | null | undefined;
  order: number;
  totalDuration: number;
  totalVideos: number;
  completedVideos: number;
  dateAdded?: string | undefined;
}

export interface DbVideo {
  id: string;
  courseId: string;
  moduleId: string;
  title: string;
  originalTitle?: string | null | undefined;
  description?: string | undefined;
  fileName?: string | undefined;
  filePath?: string | null | undefined;
  fileSize?: number | undefined;
  duration: number;
  thumbnailData?: string | null | undefined;
  order: number;
  isRequired: boolean;
  isCompleted: boolean;
  isFavorite: boolean;
  watchProgress: number;
  lastWatchedPosition: number;
  lastWatchedAt?: string | null | undefined;
  completedAt?: string | null | undefined;
  watchCount: number;
  tags: string[];
  bookmarks: VideoBookmark[];
  youtubeId?: string | null | undefined;
  url?: string | null | undefined;
  hasTranscript: boolean;
  hasSummary: boolean;
  primaryTranscript?: string | null | undefined;
  subtitleSources: SubtitleSource[];
  dubbedTracks: Array<Record<string, unknown>>;
}

export interface CourseLessonSpec {
  id: string;
  title: string;
  duration: string;
  durationSec: number;
}

export interface CourseModuleSpec {
  id: string;
  title: string;
  parentModuleId?: string | null | undefined;
  lessons: CourseLessonSpec[];
}

export interface CourseLessonItem {
  lessonId: string;
  moduleId: string;
  title: string;
  duration: string;
  durationSec: number;
  modIdx: number;
  moduleTitle: string;
  lessonInModule: number;
  fileName?: string | undefined;
  filePath?: string | null | undefined;
  fileSize?: number | undefined;
  order: number;
  isRequired: boolean;
  isCompleted: boolean;
  isFavorite: boolean;
  watchProgress: number;
  lastWatchedPosition: number;
  lastWatchedAt?: string | null | undefined;
  youtubeId?: string | null | undefined;
  url?: string | null | undefined;
  description?: string | undefined;
  tags: string[];
  bookmarks: VideoBookmark[];
  hasTranscript: boolean;
  hasSummary: boolean;
  primaryTranscript?: string | null | undefined;
  subtitleSources: SubtitleSource[];
  dubbedTracks: Array<Record<string, unknown>>;
}

export interface CourseCurriculumData {
  courseId: string;
  rawModules: DbModule[];
  rawVideos: DbVideo[];
  modules: CourseModuleSpec[];
  lessons: CourseLessonItem[];
}

export const CURRICULUM_CHANGED_EVENT = "tutin:curriculum_changed";

const curriculumCache = new Map<string, CourseCurriculumData>();
const inFlightCurriculum = new Map<string, Promise<CourseCurriculumData>>();

function emitCurriculumChanged(courseId: string, data: CourseCurriculumData): void {
  curriculumCache.set(courseId, data);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CURRICULUM_CHANGED_EVENT, { detail: { courseId, data } }));
  }
}

export function buildCourseCurriculum(
  courseId: string,
  rawModules: DbModule[],
  rawVideos: DbVideo[],
): CourseCurriculumData {
  const sortedModules = [...rawModules].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const sortedVideos = [...rawVideos].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const videosByModule = new Map<string, DbVideo[]>();
  for (const video of sortedVideos) {
    const list = videosByModule.get(video.moduleId) ?? [];
    list.push(video);
    videosByModule.set(video.moduleId, list);
  }

  // Order top-level modules cleanly, followed immediately by their submodules
  const childModulesByParent = new Map<string, DbModule[]>();
  const rootModules: DbModule[] = [];
  const moduleIds = new Set(sortedModules.map((m) => m.id));

  for (const mod of sortedModules) {
    if (mod.parentModuleId && moduleIds.has(mod.parentModuleId)) {
      const list = childModulesByParent.get(mod.parentModuleId) ?? [];
      list.push(mod);
      childModulesByParent.set(mod.parentModuleId, list);
    } else {
      rootModules.push(mod);
    }
  }

  const orderedFlatModules: Array<{ mod: DbModule; displayTitle: string }> = [];
  const appendWithChildren = (mod: DbModule, prefix = "") => {
    const displayTitle = prefix ? `${prefix} / ${mod.title}` : mod.title;
    orderedFlatModules.push({ mod, displayTitle });
    const children = childModulesByParent.get(mod.id) ?? [];
    for (const child of children) {
      appendWithChildren(child, displayTitle);
    }
  };
  for (const root of rootModules) {
    appendWithChildren(root);
  }

  // Fallback bucket if any orphan video exists without a matching module row
  const knownModuleIds = new Set(orderedFlatModules.map((item) => item.mod.id));
  const orphanVideos = sortedVideos.filter((v) => !knownModuleIds.has(v.moduleId));

  const modules: CourseModuleSpec[] = [];
  const lessons: CourseLessonItem[] = [];

  orderedFlatModules.forEach(({ mod, displayTitle }, modIdx) => {
    const modVideos = (videosByModule.get(mod.id) ?? []).sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0),
    );
    const lessonSpecs: CourseLessonSpec[] = modVideos.map((v, lessonInModule) => {
      const durationSec = Math.max(0, Math.floor(Number(v.duration) || 0));
      const duration = formatTimestamp(durationSec);
      lessons.push({
        lessonId: v.id,
        moduleId: mod.id,
        title: v.title,
        duration,
        durationSec,
        modIdx,
        moduleTitle: displayTitle,
        lessonInModule,
        fileName: v.fileName,
        filePath: v.filePath,
        fileSize: v.fileSize,
        order: v.order ?? lessonInModule,
        isRequired: v.isRequired,
        isCompleted: v.isCompleted,
        isFavorite: v.isFavorite,
        watchProgress: v.watchProgress ?? 0,
        lastWatchedPosition: v.lastWatchedPosition ?? 0,
        lastWatchedAt: v.lastWatchedAt ?? null,
        youtubeId: v.youtubeId,
        url: v.url,
        description: v.description,
        tags: v.tags ?? [],
        bookmarks: v.bookmarks ?? [],
        hasTranscript: v.hasTranscript,
        hasSummary: v.hasSummary,
        primaryTranscript: v.primaryTranscript,
        subtitleSources: v.subtitleSources ?? [],
        dubbedTracks: v.dubbedTracks ?? [],
      });
      return {
        id: v.id,
        title: v.title,
        duration,
        durationSec,
      };
    });

    modules.push({
      id: mod.id,
      title: displayTitle,
      parentModuleId: mod.parentModuleId,
      lessons: lessonSpecs,
    });
  });

  if (orphanVideos.length > 0) {
    const modIdx = modules.length;
    const lessonSpecs: CourseLessonSpec[] = orphanVideos.map((v, lessonInModule) => {
      const durationSec = Math.max(0, Math.floor(Number(v.duration) || 0));
      const duration = formatTimestamp(durationSec);
      lessons.push({
        lessonId: v.id,
        moduleId: v.moduleId || "orphan",
        title: v.title,
        duration,
        durationSec,
        modIdx,
        moduleTitle: "Lessons",
        lessonInModule,
        fileName: v.fileName,
        filePath: v.filePath,
        fileSize: v.fileSize,
        order: v.order ?? lessonInModule,
        isRequired: v.isRequired,
        isCompleted: v.isCompleted,
        isFavorite: v.isFavorite,
        watchProgress: v.watchProgress ?? 0,
        lastWatchedPosition: v.lastWatchedPosition ?? 0,
        lastWatchedAt: v.lastWatchedAt ?? null,
        youtubeId: v.youtubeId,
        url: v.url,
        description: v.description,
        tags: v.tags ?? [],
        bookmarks: v.bookmarks ?? [],
        hasTranscript: v.hasTranscript,
        hasSummary: v.hasSummary,
        primaryTranscript: v.primaryTranscript,
        subtitleSources: v.subtitleSources ?? [],
        dubbedTracks: v.dubbedTracks ?? [],
      });
      return { id: v.id, title: v.title, duration, durationSec };
    });
    modules.push({ id: "orphan", title: "Lessons", lessons: lessonSpecs });
  }

  return {
    courseId,
    rawModules: sortedModules,
    rawVideos: sortedVideos,
    modules,
    lessons,
  };
}

export async function fetchCourseCurriculum(
  courseId: string,
  force = false,
): Promise<CourseCurriculumData> {
  if (!courseId) {
    return { courseId: "", rawModules: [], rawVideos: [], modules: [], lessons: [] };
  }
  if (!force && curriculumCache.has(courseId)) {
    return curriculumCache.get(courseId)!;
  }
  const existing = inFlightCurriculum.get(courseId);
  if (existing && !force) return existing;

  const req = (async () => {
    const [rawModules, rawVideos] = await Promise.all([
      apiJson<DbModule[]>(`/api/modules/by-course/${encodeURIComponent(courseId)}`),
      apiJson<DbVideo[]>(`/api/videos/by-course/${encodeURIComponent(courseId)}`),
    ]);
    const built = buildCourseCurriculum(
      courseId,
      Array.isArray(rawModules) ? rawModules : [],
      Array.isArray(rawVideos) ? rawVideos : [],
    );
    emitCurriculumChanged(courseId, built);
    return built;
  })().finally(() => {
    inFlightCurriculum.delete(courseId);
  });

  inFlightCurriculum.set(courseId, req);
  return req;
}

export function getCachedCurriculum(courseId?: string): CourseCurriculumData | null {
  if (!courseId) return null;
  return curriculumCache.get(courseId) ?? null;
}

export function getCourseModules(courseId?: string): CourseModuleSpec[] {
  if (!courseId) return [];
  return curriculumCache.get(courseId)?.modules ?? [];
}

export function getCourseLessons(courseId?: string): CourseLessonItem[] {
  if (!courseId) return [];
  return curriculumCache.get(courseId)?.lessons ?? [];
}

export function getLessonDurationSeconds(
  lesson: Pick<CourseLessonItem, "durationSec" | "duration">,
): number {
  if (lesson.durationSec > 0) return lesson.durationSec;
  return parseTimestampToSeconds(lesson.duration);
}

export function subscribeCourseCurriculumChanged(
  courseId: string,
  listener: (data: CourseCurriculumData) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<{ courseId?: string; data?: CourseCurriculumData }>).detail;
    if (detail?.courseId === courseId && detail.data) {
      listener(detail.data);
    }
  };
  window.addEventListener(CURRICULUM_CHANGED_EVENT, handler);
  return () => window.removeEventListener(CURRICULUM_CHANGED_EVENT, handler);
}

// ── Module & Video CRUD Helpers ───────────────────────────────────────────────

export async function createCourseModule(
  payload: Partial<DbModule> & { id: string; courseId: string; title: string },
): Promise<{ success: boolean; id: string }> {
  const res = await apiJson<{ success: boolean; id: string }>("/api/modules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  await fetchCourseCurriculum(payload.courseId, true);
  return res;
}

export async function updateCourseModule(
  moduleId: string,
  courseId: string,
  updates: Partial<DbModule>,
): Promise<{ success: boolean }> {
  const res = await apiJson<{ success: boolean }>(`/api/modules/${encodeURIComponent(moduleId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  await fetchCourseCurriculum(courseId, true);
  return res;
}

export async function deleteCourseModule(
  moduleId: string,
  courseId: string,
): Promise<{ success: boolean }> {
  const res = await apiJson<{ success: boolean }>(`/api/modules/${encodeURIComponent(moduleId)}`, {
    method: "DELETE",
  });
  await Promise.all([fetchCourseCurriculum(courseId, true), fetchCourses(true)]);
  return res;
}

export async function createCourseVideo(
  payload: Partial<DbVideo> & {
    id: string;
    courseId: string;
    moduleId: string;
    title: string;
  },
): Promise<{ success: boolean; id: string }> {
  const res = await apiJson<{ success: boolean; id: string }>("/api/videos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  await fetchCourseCurriculum(payload.courseId, true);
  return res;
}

export async function updateCourseVideo(
  videoId: string,
  courseId: string,
  updates: Partial<DbVideo>,
): Promise<{ success: boolean }> {
  const res = await apiJson<{ success: boolean }>(`/api/videos/${encodeURIComponent(videoId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  await fetchCourseCurriculum(courseId, true);
  if (updates.duration !== undefined || updates.isCompleted !== undefined) {
    await fetchCourses(true);
  }
  return res;
}

export interface UpdateVideoProgressOptions {
  recordHistory?: boolean;
  recordPosition?: boolean;
  keepalive?: boolean;
}

export async function updateVideoProgress(
  videoId: string,
  currentTime: number,
  duration: number,
  courseId?: string,
  options: UpdateVideoProgressOptions = {},
): Promise<void> {
  const safePosition = Math.max(0, Number(currentTime) || 0);
  const safeDuration = Number(duration) || 0;
  const watchProgress =
    safeDuration > 0 ? Math.min(1, Math.max(0, safePosition / safeDuration)) : 0;
  const recordPosition = options.recordPosition ?? true;
  const shouldMarkHistory = options.recordHistory === true;
  const nowIso = shouldMarkHistory ? new Date().toISOString() : undefined;

  // Update cached lesson state optimistically so revisiting lesson resumes accurately
  if (courseId && curriculumCache.has(courseId)) {
    const cached = curriculumCache.get(courseId)!;
    const lesson = cached.lessons.find((l) => l.lessonId === videoId);
    if (lesson) {
      if (recordPosition) {
        lesson.lastWatchedPosition = safePosition;
        lesson.watchProgress = watchProgress;
      }
      if (nowIso) {
        lesson.lastWatchedAt = nowIso;
      }
    }
    const raw = cached.rawVideos.find((v) => v.id === videoId);
    if (raw) {
      if (recordPosition) {
        raw.lastWatchedPosition = safePosition;
        raw.watchProgress = watchProgress;
      }
      if (nowIso) {
        raw.lastWatchedAt = nowIso;
      }
    }
  }

  if (nowIso && courseId) {
    touchCourseLastAccessed(courseId, nowIso);
  }

  await apiRequest(`/api/videos/${encodeURIComponent(videoId)}/progress`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    keepalive: options.keepalive ?? false,
    body: JSON.stringify({
      watchProgress,
      lastWatchedPosition: safePosition,
      recordHistory: options.recordHistory,
      recordPosition,
    }),
  });
}

export async function markVideoComplete(
  videoId: string,
  isCompleted: boolean,
  courseId?: string,
): Promise<{ success: boolean }> {
  const res = await apiJson<{ success: boolean }>(
    `/api/videos/${encodeURIComponent(videoId)}/complete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isCompleted }),
    },
  );
  if (courseId) {
    await Promise.all([fetchCourseCurriculum(courseId, true), fetchCourses(true)]);
  } else {
    await fetchCourses(true);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(COURSES_CHANGED_EVENT));
    }
  }
  return res;
}

export async function deleteCourseVideo(
  videoId: string,
  courseId: string,
): Promise<{ success: boolean }> {
  const res = await apiJson<{ success: boolean }>(`/api/videos/${encodeURIComponent(videoId)}`, {
    method: "DELETE",
  });
  await Promise.all([fetchCourseCurriculum(courseId, true), fetchCourses(true)]);
  return res;
}
