import { apiJson } from "@/lib/api";
import { fetchCanvasSummaryMetrics } from "@/lib/course-canvas";
import {
  createCourseModule,
  createCourseVideo,
  deleteCourseModule,
  deleteCourseVideo,
  fetchCourseCurriculum,
  type DbModule,
  type DbVideo,
  type SubtitleSource,
  updateCourseModule,
  updateCourseVideo,
} from "@/lib/course-lessons";
import {
  createCourse,
  fetchCourseById,
  fetchCourses,
  generateId,
  hydrateCourseVault,
  recalculateCourseProgress,
  updateCourse,
  type Course,
} from "@/lib/courses";
import { normalizeLanguageCode } from "@/lib/languages";

// ── Local Scan Types ──────────────────────────────────────────────────────────

export interface ScannedSubtitleFile {
  filePath: string;
  lang: string;
  format: string;
  origin: "existing" | "generated" | string;
}

export interface ScannedVideoFile {
  title: string;
  originalTitle: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  duration: number;
  order: number;
  subtitleFiles?: ScannedSubtitleFile[] | undefined;
  hasSummary?: boolean | undefined;
}

export interface ScannedModuleNode {
  title: string;
  originalTitle?: string | undefined;
  folderPath?: string | undefined;
  order: number;
  videos: ScannedVideoFile[];
  subModules: ScannedModuleNode[];
  totalDuration: number;
  totalVideos: number;
}

export interface ScannedVaultData {
  metadata?: {
    title?: string;
    instructor?: string;
    language?: string;
    description?: string;
    tags?: string[];
  } | null;
  progress?: {
    videos?: Record<
      string,
      { isCompleted?: boolean; watchProgress?: number; lastWatchedPosition?: number }
    >;
  } | null;
  notes?: Array<Record<string, unknown>> | null;
  canvas?: Record<string, unknown> | null;
  summary?: {
    hasVault?: boolean;
    vaultPath?: string;
    totalSizeBytes?: number;
    totalFileCount?: number;
    dubs?: { diskCount?: number; langs?: string[] };
    transcripts?: { diskCount?: number; langs?: string[] };
    summaries?: { diskCount?: number };
    canvas?: { exists?: boolean; nodeCount?: number; edgeCount?: number };
    notes?: { count?: number; screenshotsCount?: number };
  } | null;
}

export interface ScannedCourseData {
  title: string;
  originalTitle: string;
  folderPath: string;
  instructor: string;
  language: string;
  totalDuration: number;
  totalVideos: number;
  thumbnailData: string | null;
  modules: ScannedModuleNode[];
  vaultData?: ScannedVaultData | null;
}

export interface FlattenedScanModule {
  tempId: string;
  parentTempId: string | null;
  title: string;
  originalTitle: string;
  folderPath?: string | undefined;
  order: number;
  totalDuration: number;
  totalVideos: number;
  videos: ScannedVideoFile[];
}

export async function pickFolder(): Promise<{ name: string; path: string } | null> {
  const result = await apiJson<{ path?: string | null; name?: string | null }>(
    "/api/fs/pick-folder",
  );
  if (!result?.path) return null;
  return {
    name: result.name || result.path.split(/[\\/]/).pop() || "Course",
    path: result.path,
  };
}

export async function scanCourseFolder(folderPath: string): Promise<ScannedCourseData> {
  return apiJson<ScannedCourseData>("/api/fs/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folderPath }),
  });
}

export function flattenScannedModules(
  modules: ScannedModuleNode[],
  parentTempId: string | null = null,
): FlattenedScanModule[] {
  const result: FlattenedScanModule[] = [];
  for (const mod of modules) {
    const tempId = generateId("scanmod_");
    result.push({
      tempId,
      parentTempId,
      title: mod.title,
      originalTitle: mod.originalTitle || mod.title,
      folderPath: mod.folderPath,
      order: mod.order ?? result.length,
      totalDuration: mod.totalDuration ?? 0,
      totalVideos: mod.totalVideos ?? mod.videos.length,
      videos: mod.videos ?? [],
    });
    if (Array.isArray(mod.subModules) && mod.subModules.length > 0) {
      result.push(...flattenScannedModules(mod.subModules, tempId));
    }
  }
  return result;
}

function buildSubtitleSources(files?: ScannedSubtitleFile[]): SubtitleSource[] {
  if (!Array.isArray(files) || files.length === 0) return [];
  return files.map((s) => ({
    language: s.lang || "source",
    lang: s.lang || "source",
    format: s.format || "vtt",
    filePath: s.filePath,
    fileName: s.filePath.split(/[\\/]/).pop() || "captions.vtt",
  }));
}

export async function importScannedLocalCourse(params: {
  scanned: ScannedCourseData;
  title: string;
  instructor: string;
  language: string;
  description?: string;
  tags?: string[];
  thumbnailData?: string | null;
  restoreVault?: boolean;
}): Promise<Course | null> {
  const { scanned, title, instructor, language, description, tags, thumbnailData } = params;
  const courseId = generateId("course_");

  await createCourse({
    id: courseId,
    title: title.trim() || scanned.title,
    originalTitle: scanned.originalTitle,
    description: description ?? scanned.vaultData?.metadata?.description ?? "",
    folderPath: scanned.folderPath,
    sourceType: "local",
    instructor: instructor.trim() || (scanned.instructor || "").trim(),
    language: normalizeLanguageCode(language),
    tags: tags ?? scanned.vaultData?.metadata?.tags ?? [],
    thumbnailData: thumbnailData ?? scanned.thumbnailData ?? null,
    totalDuration: scanned.totalDuration,
    totalVideos: scanned.totalVideos,
    completedVideos: 0,
    completionPercentage: 0,
  });

  const flattened = flattenScannedModules(scanned.modules);
  const tempToRealModId = new Map<string, string>();
  let globalOrder = 0;

  for (const mod of flattened) {
    const moduleId = generateId("mod_");
    tempToRealModId.set(mod.tempId, moduleId);
    const parentModuleId = mod.parentTempId ? (tempToRealModId.get(mod.parentTempId) ?? null) : null;

    await createCourseModule({
      id: moduleId,
      courseId,
      parentModuleId,
      title: mod.title,
      originalTitle: mod.originalTitle,
      folderPath: mod.folderPath ?? null,
      order: mod.order,
      totalDuration: mod.totalDuration,
      totalVideos: mod.totalVideos,
      completedVideos: 0,
    });

    for (const vid of mod.videos) {
      const videoId = generateId("vid_");
      const subtitleSources = buildSubtitleSources(vid.subtitleFiles);
      const hasTranscript = subtitleSources.length > 0;
      const primaryTranscript = subtitleSources[0]?.language ?? null;

      await createCourseVideo({
        id: videoId,
        courseId,
        moduleId,
        title: vid.title,
        originalTitle: vid.originalTitle,
        fileName: vid.fileName,
        filePath: vid.filePath,
        fileSize: vid.fileSize,
        duration: vid.duration,
        order: globalOrder++,
        isRequired: true,
        isCompleted: false,
        isFavorite: false,
        watchProgress: 0,
        lastWatchedPosition: 0,
        hasTranscript,
        hasSummary: Boolean(vid.hasSummary),
        primaryTranscript,
        subtitleSources,
      });
    }
  }

  if (params.restoreVault !== false && scanned.vaultData) {
    await hydrateCourseVault(courseId, scanned.vaultData as Record<string, unknown>);
  }

  await recalculateCourseProgress(courseId);
  return fetchCourseById(courseId);
}

// ── Course & Vault Sync Diff + Apply ──────────────────────────────────────────

export interface SyncAddedVideo {
  id: string;
  title: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  duration: number;
  moduleId: string;
  moduleTitle: string;
  order: number;
  subtitleSources: SubtitleSource[];
  hasTranscript: boolean;
  hasSummary: boolean;
}

export interface SyncMovedVideo {
  videoId: string;
  title: string;
  oldPath: string;
  newPath: string;
  newModuleId: string;
  newModuleTitle: string;
  duration: number;
}

export interface SyncUpdatedVideo {
  videoId: string;
  title: string;
  reason: string;
  duration: number;
  fileSize: number;
  subtitleSources: SubtitleSource[];
  hasTranscript: boolean;
  hasSummary: boolean;
}

export interface SyncRemovedVideo {
  videoId: string;
  title: string;
  filePath: string;
  isCompleted: boolean;
}

export interface SyncVaultStats {
  hasVault: boolean;
  vaultPath?: string | undefined;
  totalSizeBytes: number;
  totalFileCount: number;
  transcripts: { diskCount: number; newCount: number; languages: string[] };
  summaries: { diskCount: number; newCount: number };
  canvas: {
    exists: boolean;
    cardCount: number;
    artboardCount: number;
    edgeCount: number;
    strokeCount: number;
  };
  notes: { count: number; screenshotsCount: number };
}

export interface SyncAssetUpdate {
  videoId: string;
  title: string;
  detail: string;
}

export interface SyncPreviewData {
  course: Course;
  folderMissing: boolean;
  scanned: ScannedCourseData | null;
  added: SyncAddedVideo[];
  removed: SyncRemovedVideo[];
  moved: SyncMovedVideo[];
  updated: SyncUpdatedVideo[];
  newModules: Array<{ title: string; parentTempId: string | null; tempId: string; order: number; folderPath?: string }>;
  removedModules: Array<{ id: string; title: string }>;
  assetUpdates: SyncAssetUpdate[];
  repairedDurationsCount: number;
  thumbnailChanged: boolean;
  newThumbnailData: string | null;
  vaultStats: SyncVaultStats;
  progressRecalc: {
    before: { completedVideos: number; totalVideos: number; completionPercentage: number };
    after: { completedVideos: number; totalVideos: number; completionPercentage: number };
  };
}

function normalizeFsPath(p?: string | null): string {
  return String(p ?? "")
    .replace(/\\/g, "/")
    .toLowerCase()
    .trim();
}

export async function computeSyncPreview(course: Course): Promise<SyncPreviewData> {
  const curriculum = await fetchCourseCurriculum(course.id, true);
  const canvasSummary = await fetchCanvasSummaryMetrics(course.id);

  let notesCount = 0;
  try {
    const notesRows = await apiJson<Array<{ images?: string[] }>>(
      `/api/notes/by-course/${encodeURIComponent(course.id)}`,
    );
    notesCount = Array.isArray(notesRows) ? notesRows.length : 0;
  } catch {
    notesCount = 0;
  }

  let scanned: ScannedCourseData | null = null;
  let folderMissing = false;

  if (!course.folderPath) {
    folderMissing = true;
  } else {
    try {
      scanned = await scanCourseFolder(course.folderPath);
    } catch {
      folderMissing = true;
    }
  }

  const beforeTotal = curriculum.rawVideos.length;
  const beforeCompleted = curriculum.rawVideos.filter((v) => v.isCompleted).length;
  const beforePct = beforeTotal > 0 ? Math.round((beforeCompleted / beforeTotal) * 100) : 0;

  if (!scanned) {
    return {
      course,
      folderMissing,
      scanned: null,
      added: [],
      removed: [],
      moved: [],
      updated: [],
      newModules: [],
      removedModules: [],
      assetUpdates: [],
      repairedDurationsCount: 0,
      thumbnailChanged: false,
      newThumbnailData: null,
      vaultStats: {
        hasVault: false,
        vaultPath: course.folderPath ? `${course.folderPath}/.tutin` : undefined,
        totalSizeBytes: 0,
        totalFileCount: 0,
        transcripts: { diskCount: 0, newCount: 0, languages: [] },
        summaries: { diskCount: 0, newCount: 0 },
        canvas: canvasSummary,
        notes: { count: notesCount, screenshotsCount: 0 },
      },
      progressRecalc: {
        before: {
          completedVideos: beforeCompleted,
          totalVideos: beforeTotal,
          completionPercentage: beforePct,
        },
        after: {
          completedVideos: beforeCompleted,
          totalVideos: beforeTotal,
          completionPercentage: beforePct,
        },
      },
    };
  }

  const existingModules = curriculum.rawModules;
  const existingVideos = curriculum.rawVideos;
  const flattened = flattenScannedModules(scanned.modules);

  // Match existing modules by normalized folderPath or title
  const modByPath = new Map<string, DbModule>();
  const modByTitle = new Map<string, DbModule>();
  for (const m of existingModules) {
    if (m.folderPath) modByPath.set(normalizeFsPath(m.folderPath), m);
    modByTitle.set(m.title.toLowerCase(), m);
  }

  const matchedDbModuleIds = new Set<string>();
  const scanTempToModuleId = new Map<string, string>();
  const scanTempToModuleTitle = new Map<string, string>();
  const newModules: SyncPreviewData["newModules"] = [];

  for (const sm of flattened) {
    const byPath = sm.folderPath ? modByPath.get(normalizeFsPath(sm.folderPath)) : undefined;
    const byTitle = !byPath ? modByTitle.get(sm.title.toLowerCase()) : undefined;
    const match = byPath ?? byTitle;

    if (match) {
      matchedDbModuleIds.add(match.id);
      scanTempToModuleId.set(sm.tempId, match.id);
      scanTempToModuleTitle.set(sm.tempId, match.title);
    } else {
      const freshModId = generateId("mod_");
      scanTempToModuleId.set(sm.tempId, freshModId);
      scanTempToModuleTitle.set(sm.tempId, sm.title);
      newModules.push({
        title: sm.title,
        tempId: freshModId,
        parentTempId: sm.parentTempId ? (scanTempToModuleId.get(sm.parentTempId) ?? null) : null,
        order: sm.order,
        ...(sm.folderPath ? { folderPath: sm.folderPath } : {}),
      });
    }
  }

  // Build video lookup maps
  const dbByPath = new Map<string, DbVideo>();
  const dbByFileNameSize = new Map<string, DbVideo[]>();
  const matchedDbVideoIds = new Set<string>();

  for (const v of existingVideos) {
    if (v.filePath) dbByPath.set(normalizeFsPath(v.filePath), v);
    const key = `${(v.fileName || v.originalTitle || v.title).toLowerCase()}::${v.fileSize || 0}`;
    const list = dbByFileNameSize.get(key) ?? [];
    list.push(v);
    dbByFileNameSize.set(key, list);
  }

  const added: SyncAddedVideo[] = [];
  const moved: SyncMovedVideo[] = [];
  const updated: SyncUpdatedVideo[] = [];
  const assetUpdates: SyncAssetUpdate[] = [];
  let repairedDurationsCount = 0;

  for (const sm of flattened) {
    const modId = scanTempToModuleId.get(sm.tempId)!;
    const modTitle = scanTempToModuleTitle.get(sm.tempId) || sm.title;

    for (const sv of sm.videos) {
      const diskPathNorm = normalizeFsPath(sv.filePath);
      let dbMatch = dbByPath.get(diskPathNorm);
      let wasMoved = false;

      if (!dbMatch) {
        const key = `${sv.fileName.toLowerCase()}::${sv.fileSize || 0}`;
        const candidates = (dbByFileNameSize.get(key) ?? []).filter(
          (c) => !matchedDbVideoIds.has(c.id),
        );
        if (candidates.length > 0) {
          dbMatch = candidates[0];
          wasMoved = true;
        }
      }

      const nextSubs = buildSubtitleSources(sv.subtitleFiles);
      const nextHasTranscript = nextSubs.length > 0;
      const nextHasSummary = Boolean(sv.hasSummary);

      if (dbMatch && !matchedDbVideoIds.has(dbMatch.id)) {
        matchedDbVideoIds.add(dbMatch.id);

        if (wasMoved) {
          moved.push({
            videoId: dbMatch.id,
            title: dbMatch.title,
            oldPath: dbMatch.filePath || "",
            newPath: sv.filePath,
            newModuleId: modId,
            newModuleTitle: modTitle,
            duration: sv.duration > 0 ? sv.duration : dbMatch.duration,
          });
        }

        const missingDurationFix =
          (dbMatch.duration || 0) === 0 && sv.duration > 0;
        const sizeChanged = sv.fileSize > 0 && sv.fileSize !== dbMatch.fileSize;
        const durationChanged =
          sv.duration > 0 && Math.abs(sv.duration - (dbMatch.duration || 0)) > 2;
        const subCountChanged = nextSubs.length > (dbMatch.subtitleSources?.length ?? 0);
        const summaryDiscovered = nextHasSummary && !dbMatch.hasSummary;

        if (missingDurationFix) repairedDurationsCount++;

        if (missingDurationFix || sizeChanged || durationChanged || subCountChanged || summaryDiscovered) {
          const reasons: string[] = [];
          if (missingDurationFix) reasons.push(`Backfilled duration (${sv.duration}s)`);
          else if (durationChanged) reasons.push(`Duration updated (${sv.duration}s)`);
          if (sizeChanged) reasons.push("File modified");
          if (subCountChanged) reasons.push(`+${nextSubs.length - (dbMatch.subtitleSources?.length ?? 0)} subtitle track(s)`);
          if (summaryDiscovered) reasons.push("Vault summary detected");

          updated.push({
            videoId: dbMatch.id,
            title: dbMatch.title,
            reason: reasons.join(" · "),
            duration: sv.duration > 0 ? sv.duration : dbMatch.duration,
            fileSize: sv.fileSize,
            subtitleSources: nextSubs.length > 0 ? nextSubs : dbMatch.subtitleSources,
            hasTranscript: dbMatch.hasTranscript || nextHasTranscript,
            hasSummary: dbMatch.hasSummary || nextHasSummary,
          });
        }

        if (subCountChanged || summaryDiscovered) {
          assetUpdates.push({
            videoId: dbMatch.id,
            title: dbMatch.title,
            detail: [
              subCountChanged ? `${nextSubs.length} captions on disk` : "",
              summaryDiscovered ? "Summary markdown" : "",
            ]
              .filter(Boolean)
              .join(", "),
          });
        }
      } else {
        added.push({
          id: generateId("vid_"),
          title: sv.title,
          fileName: sv.fileName,
          filePath: sv.filePath,
          fileSize: sv.fileSize,
          duration: sv.duration,
          moduleId: modId,
          moduleTitle: modTitle,
          order: existingVideos.length + added.length,
          subtitleSources: nextSubs,
          hasTranscript: nextHasTranscript,
          hasSummary: nextHasSummary,
        });
      }
    }
  }

  const removed: SyncRemovedVideo[] = existingVideos
    .filter((v) => !matchedDbVideoIds.has(v.id))
    .map((v) => ({
      videoId: v.id,
      title: v.title,
      filePath: v.filePath || v.fileName || "",
      isCompleted: v.isCompleted,
    }));

  const removedSet = new Set(removed.map((r) => r.videoId));
  const afterTotal = beforeTotal - removed.length + added.length;
  const afterCompleted = existingVideos.filter(
    (v) => v.isCompleted && !removedSet.has(v.id),
  ).length;
  const afterPct = afterTotal > 0 ? Math.round((afterCompleted / afterTotal) * 100) : 0;

  const removedModules = existingModules
    .filter((m) => !matchedDbModuleIds.has(m.id))
    .map((m) => ({ id: m.id, title: m.title }));

  const diskSummary = scanned.vaultData?.summary;
  const dbTranscriptCount = existingVideos.filter((v) => v.hasTranscript).length;
  const diskTranscriptCount = diskSummary?.transcripts?.diskCount ?? 0;
  const dbSummaryCount = existingVideos.filter((v) => v.hasSummary).length;
  const diskSummaryCount = diskSummary?.summaries?.diskCount ?? 0;

  return {
    course,
    folderMissing: false,
    scanned,
    added,
    removed,
    moved,
    updated,
    newModules,
    removedModules,
    assetUpdates,
    repairedDurationsCount,
    thumbnailChanged: Boolean(!course.thumbnailUrl && scanned.thumbnailData),
    newThumbnailData: !course.thumbnailUrl ? scanned.thumbnailData : null,
    vaultStats: {
      hasVault: Boolean(diskSummary?.hasVault || scanned.vaultData),
      vaultPath: diskSummary?.vaultPath || `${scanned.folderPath}/.tutin`,
      totalSizeBytes: diskSummary?.totalSizeBytes ?? 0,
      totalFileCount: diskSummary?.totalFileCount ?? 0,
      transcripts: {
        diskCount: diskTranscriptCount,
        newCount: Math.max(0, diskTranscriptCount - dbTranscriptCount),
        languages: diskSummary?.transcripts?.langs ?? [],
      },
      summaries: {
        diskCount: diskSummaryCount,
        newCount: Math.max(0, diskSummaryCount - dbSummaryCount),
      },
      canvas: canvasSummary,
      notes: {
        count: Math.max(notesCount, diskSummary?.notes?.count ?? 0),
        screenshotsCount: diskSummary?.notes?.screenshotsCount ?? 0,
      },
    },
    progressRecalc: {
      before: {
        completedVideos: beforeCompleted,
        totalVideos: beforeTotal,
        completionPercentage: beforePct,
      },
      after: {
        completedVideos: afterCompleted,
        totalVideos: afterTotal,
        completionPercentage: afterPct,
      },
    },
  };
}

export async function applyCourseSync(
  preview: SyncPreviewData,
): Promise<{ course: Course | null }> {
  const courseId = preview.course.id;

  // 1. Create any newly discovered folders/modules
  for (const mod of preview.newModules) {
    await createCourseModule({
      id: mod.tempId,
      courseId,
      parentModuleId: mod.parentTempId,
      title: mod.title,
      originalTitle: mod.title,
      folderPath: mod.folderPath ?? null,
      order: mod.order,
    });
  }

  // 2. Delete removed videos and removed modules
  for (const rem of preview.removed) {
    await deleteCourseVideo(rem.videoId, courseId);
  }
  for (const remMod of preview.removedModules) {
    await deleteCourseModule(remMod.id, courseId);
  }

  // 3. Apply moved videos
  for (const mov of preview.moved) {
    await updateCourseVideo(mov.videoId, courseId, {
      filePath: mov.newPath,
      moduleId: mov.newModuleId,
      duration: mov.duration,
    });
  }

  // 4. Apply metadata / missing-duration repairs / asset discoveries
  for (const upd of preview.updated) {
    await updateCourseVideo(upd.videoId, courseId, {
      duration: upd.duration,
      subtitleSources: upd.subtitleSources,
      hasTranscript: upd.hasTranscript,
      hasSummary: upd.hasSummary,
    });
  }

  // 5. Insert newly added videos
  for (const add of preview.added) {
    await createCourseVideo({
      id: add.id,
      courseId,
      moduleId: add.moduleId,
      title: add.title,
      originalTitle: add.fileName,
      fileName: add.fileName,
      filePath: add.filePath,
      fileSize: add.fileSize,
      duration: add.duration,
      order: add.order,
      hasTranscript: add.hasTranscript,
      hasSummary: add.hasSummary,
      subtitleSources: add.subtitleSources,
      primaryTranscript: add.subtitleSources[0]?.language ?? null,
    });
  }

  // 6. Optional thumbnail backfill
  if (preview.thumbnailChanged && preview.newThumbnailData) {
    await updateCourse(courseId, { thumbnailData: preview.newThumbnailData });
  }

  // 7. Re-hydrate vault if disk has vault notes/canvas that DB lacked, then recalculate totals
  if (preview.scanned?.vaultData) {
    await hydrateCourseVault(courseId, preview.scanned.vaultData as Record<string, unknown>);
  }
  await recalculateCourseProgress(courseId);
  await fetchCourseCurriculum(courseId, true);
  await fetchCourses(true);

  return { course: await fetchCourseById(courseId) };
}

export async function relocateMovedCourseFolder(
  course: Course,
  newFolderPath: string,
): Promise<SyncPreviewData> {
  const oldRoot = course.folderPath || "";
  const curriculum = await fetchCourseCurriculum(course.id, true);

  await updateCourse(course.id, { folderPath: newFolderPath });

  if (oldRoot) {
    const oldNorm = normalizeFsPath(oldRoot);
    for (const mod of curriculum.rawModules) {
      if (mod.folderPath && normalizeFsPath(mod.folderPath).startsWith(oldNorm)) {
        const rel = mod.folderPath.slice(oldRoot.length).replace(/^[\\/]/, "");
        const updatedModPath = rel ? `${newFolderPath}\\${rel}` : newFolderPath;
        await updateCourseModule(mod.id, course.id, { folderPath: updatedModPath });
      }
    }
    for (const vid of curriculum.rawVideos) {
      if (vid.filePath && normalizeFsPath(vid.filePath).startsWith(oldNorm)) {
        const rel = vid.filePath.slice(oldRoot.length).replace(/^[\\/]/, "");
        await updateCourseVideo(vid.id, course.id, {
          filePath: rel ? `${newFolderPath}\\${rel}` : newFolderPath,
        });
      }
    }
  }

  const refreshed = (await fetchCourseById(course.id)) ?? { ...course, folderPath: newFolderPath };
  return computeSyncPreview(refreshed);
}

// ── YouTube Import Helpers ────────────────────────────────────────────────────

export interface YoutubeVideoPreview {
  title: string;
  youtubeId: string;
  duration: number;
  thumbnailUrl?: string;
}

export interface YoutubeImportPreview {
  title: string;
  instructor: string;
  courseUrl: string;
  playlistId: string | null;
  thumbnailData: string | null;
  videos: YoutubeVideoPreview[];
  totalDuration: number;
}

export function extractYoutubeIds(rawUrl: string): {
  playlistId: string | null;
  videoId: string | null;
} {
  try {
    const parsed = new URL(rawUrl.trim());
    const playlistId = parsed.searchParams.get("list");
    let videoId = parsed.searchParams.get("v");
    if (!videoId && parsed.hostname.includes("youtu.be")) {
      videoId = parsed.pathname.replace(/^\//, "").split("/")[0] || null;
    }
    return { playlistId, videoId };
  } catch {
    return { playlistId: null, videoId: null };
  }
}

function parseIsoDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
}

export async function fetchYoutubeCourseData(
  url: string,
  apiKey?: string,
): Promise<YoutubeImportPreview> {
  const { playlistId, videoId } = extractYoutubeIds(url);
  if (!playlistId && !videoId) {
    throw new Error("Invalid YouTube playlist or video URL");
  }

  const trimmedKey = apiKey?.trim();

  if (trimmedKey && playlistId) {
    const plRes = await fetch(
      `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${encodeURIComponent(playlistId)}&key=${encodeURIComponent(trimmedKey)}`,
    );
    const plJson = (await plRes.json()) as {
      error?: { message?: string };
      items?: Array<{
        snippet?: {
          title?: string;
          channelTitle?: string;
          thumbnails?: { maxres?: { url: string }; high?: { url: string }; medium?: { url: string } };
        };
      }>;
    };
    if (!plRes.ok || !plJson.items?.[0]) {
      throw new Error(plJson.error?.message || "Playlist not found");
    }
    const snippet = plJson.items[0].snippet;

    const itemIds: Array<{ youtubeId: string; title: string; thumb?: string }> = [];
    let pageToken = "";
    do {
      const itemsUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${encodeURIComponent(playlistId)}&key=${encodeURIComponent(trimmedKey)}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
      const itemsRes = await fetch(itemsUrl);
      const itemsJson = (await itemsRes.json()) as {
        nextPageToken?: string;
        items?: Array<{
          snippet?: {
            title?: string;
            resourceId?: { videoId?: string };
            thumbnails?: { medium?: { url: string } };
          };
        }>;
      };
      for (const item of itemsJson.items ?? []) {
        const vid = item.snippet?.resourceId?.videoId;
        const vTitle = item.snippet?.title;
        if (vid && vTitle && vTitle !== "Private video" && vTitle !== "Deleted video") {
          const thumbUrl = item.snippet?.thumbnails?.medium?.url;
          itemIds.push({
            youtubeId: vid,
            title: vTitle,
            ...(thumbUrl ? { thumb: thumbUrl } : {}),
          });
        }
      }
      pageToken = itemsJson.nextPageToken || "";
    } while (pageToken && itemIds.length < 250);

    // Fetch video durations in batches of 50
    const durationMap = new Map<string, number>();
    for (let i = 0; i < itemIds.length; i += 50) {
      const batch = itemIds.slice(i, i + 50).map((x) => x.youtubeId);
      const vRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${batch.join(",")}&key=${encodeURIComponent(trimmedKey)}`,
      );
      const vJson = (await vRes.json()) as {
        items?: Array<{ id: string; contentDetails?: { duration?: string } }>;
      };
      for (const v of vJson.items ?? []) {
        durationMap.set(v.id, parseIsoDuration(v.contentDetails?.duration || ""));
      }
    }

    const videos: YoutubeVideoPreview[] = itemIds.map((it) => ({
      title: it.title,
      youtubeId: it.youtubeId,
      duration: durationMap.get(it.youtubeId) ?? 0,
      ...(it.thumb ? { thumbnailUrl: it.thumb } : {}),
    }));

    return {
      title: snippet?.title || "YouTube Playlist",
      instructor: snippet?.channelTitle || "YouTube",
      courseUrl: url.trim(),
      playlistId,
      thumbnailData:
        snippet?.thumbnails?.maxres?.url ||
        snippet?.thumbnails?.high?.url ||
        snippet?.thumbnails?.medium?.url ||
        null,
      videos,
      totalDuration: videos.reduce((sum, v) => sum + v.duration, 0),
    };
  }

  if (videoId) {
    // Public YouTube oEmbed works without any API key
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;
    const res = await fetch(oembedUrl);
    if (!res.ok) {
      throw new Error("Could not fetch YouTube video info");
    }
    const data = (await res.json()) as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    };
    return {
      title: data.title || "YouTube Video",
      instructor: data.author_name || "YouTube",
      courseUrl: url.trim(),
      playlistId: null,
      thumbnailData: data.thumbnail_url || null,
      videos: [
        {
          title: data.title || "Video Lesson",
          youtubeId: videoId,
          duration: 0,
          ...(data.thumbnail_url ? { thumbnailUrl: data.thumbnail_url } : {}),
        },
      ],
      totalDuration: 0,
    };
  }

  throw new Error("Enter a YouTube Data API key to import full playlists, or paste a single video URL.");
}

export async function importYoutubeCourse(params: {
  preview: YoutubeImportPreview;
  title: string;
  instructor: string;
  language: string;
}): Promise<Course | null> {
  const { preview, title, instructor, language } = params;
  const courseId = generateId("course_");
  const moduleId = generateId("mod_");

  await createCourse({
    id: courseId,
    title: title.trim() || preview.title,
    sourceType: "youtube",
    instructor: instructor.trim() || preview.instructor || "YouTube",
    language: normalizeLanguageCode(language),
    courseUrl: preview.courseUrl,
    youtubePlaylistId: preview.playlistId,
    thumbnailData: preview.thumbnailData,
    totalVideos: preview.videos.length,
    totalDuration: preview.totalDuration,
  });

  await createCourseModule({
    id: moduleId,
    courseId,
    title: "Playlist Videos",
    order: 0,
    totalVideos: preview.videos.length,
    totalDuration: preview.totalDuration,
  });

  for (let idx = 0; idx < preview.videos.length; idx++) {
    const vid = preview.videos[idx]!;
    await createCourseVideo({
      id: generateId("vid_"),
      courseId,
      moduleId,
      title: vid.title,
      youtubeId: vid.youtubeId,
      url: `https://www.youtube.com/watch?v=${vid.youtubeId}`,
      duration: vid.duration,
      thumbnailData: vid.thumbnailUrl ?? null,
      order: idx,
    });
  }

  await recalculateCourseProgress(courseId);
  return fetchCourseById(courseId);
}

// ── Google Drive Import Helpers ───────────────────────────────────────────────

export interface GoogleDriveImportModule {
  title: string;
  videos: Array<{
    title: string;
    originalTitle: string;
    driveFileId: string;
    duration: number;
    order: number;
  }>;
  totalVideos: number;
  totalDuration: number;
}

export interface GoogleDriveImportPreview {
  folderId: string;
  modules: GoogleDriveImportModule[];
  totalVideos: number;
  totalDuration: number;
}

export function extractGoogleDriveFolderId(url: string): string | null {
  const folderMatch = url.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch?.[1]) return folderMatch[1];
  const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return idMatch?.[1] ?? null;
}

async function listDriveFolderFiles(folderId: string, apiKey: string) {
  const files: Array<{
    id: string;
    name: string;
    mimeType: string;
    videoMediaMetadata?: { durationMillis?: string | number };
  }> = [];
  let pageToken = "";
  const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const fields = encodeURIComponent(
    "nextPageToken, files(id, name, mimeType, videoMediaMetadata(durationMillis))",
  );
  do {
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&key=${encodeURIComponent(apiKey)}&pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
    const res = await fetch(url);
    const data = (await res.json()) as {
      error?: { message?: string };
      nextPageToken?: string;
      files?: typeof files;
    };
    if (!res.ok) {
      throw new Error(data.error?.message || "Failed to list Google Drive folder");
    }
    if (data.files) files.push(...data.files);
    pageToken = data.nextPageToken || "";
  } while (pageToken);

  return files;
}

function isDriveVideoFile(file: { mimeType: string; name: string }): boolean {
  if (file.mimeType.startsWith("video/")) return true;
  return /\.(mp4|mkv|webm|mov|avi|m4v)$/i.test(file.name);
}

function cleanDriveVideoTitle(name: string): string {
  return name.replace(/\.[^/.]+$/, "").replace(/^\d+[\s._-]+/, "").trim() || name;
}

export async function scanGoogleDriveCourseFolder(
  url: string,
  apiKey: string,
): Promise<GoogleDriveImportPreview> {
  const folderId = extractGoogleDriveFolderId(url);
  if (!folderId) throw new Error("Invalid Google Drive folder URL");

  const entries = await listDriveFolderFiles(folderId, apiKey);
  const subFolders = entries
    .filter((f) => f.mimeType === "application/vnd.google-apps.folder")
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const rootVideos = entries
    .filter((f) => isDriveVideoFile(f))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  const modules: GoogleDriveImportModule[] = [];
  let totalVideos = 0;
  let totalDuration = 0;

  for (const folder of subFolders) {
    const subEntries = await listDriveFolderFiles(folder.id, apiKey);
    const modVideos = subEntries
      .filter((f) => isDriveVideoFile(f))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      .map((v, idx) => {
        const dur = v.videoMediaMetadata?.durationMillis
          ? Math.round(Number(v.videoMediaMetadata.durationMillis) / 1000)
          : 0;
        totalDuration += dur;
        return {
          title: cleanDriveVideoTitle(v.name),
          originalTitle: v.name,
          driveFileId: v.id,
          duration: dur,
          order: idx,
        };
      });

    if (modVideos.length > 0) {
      totalVideos += modVideos.length;
      modules.push({
        title: folder.name,
        videos: modVideos,
        totalVideos: modVideos.length,
        totalDuration: modVideos.reduce((sum, v) => sum + v.duration, 0),
      });
    }
  }

  if (rootVideos.length > 0) {
    const rootList = rootVideos.map((v, idx) => {
      const dur = v.videoMediaMetadata?.durationMillis
        ? Math.round(Number(v.videoMediaMetadata.durationMillis) / 1000)
        : 0;
      totalDuration += dur;
      return {
        title: cleanDriveVideoTitle(v.name),
        originalTitle: v.name,
        driveFileId: v.id,
        duration: dur,
        order: idx,
      };
    });
    totalVideos += rootList.length;
    modules.unshift({
      title: modules.length > 0 ? "Introduction" : "Videos",
      videos: rootList,
      totalVideos: rootList.length,
      totalDuration: rootList.reduce((sum, v) => sum + v.duration, 0),
    });
  }

  return { folderId, modules, totalVideos, totalDuration };
}

export async function importGoogleDriveCourse(params: {
  preview: GoogleDriveImportPreview;
  title: string;
  instructor: string;
  language: string;
  courseUrl: string;
}): Promise<Course | null> {
  const { preview, title, instructor, language, courseUrl } = params;
  const courseId = generateId("course_");

  await createCourse({
    id: courseId,
    title: title.trim() || "Google Drive Course",
    sourceType: "google-drive",
    instructor: instructor.trim() || "Google Drive",
    language: normalizeLanguageCode(language),
    driveFolderId: preview.folderId,
    courseUrl,
    totalVideos: preview.totalVideos,
    totalDuration: preview.totalDuration,
  });

  let orderIdx = 0;
  for (let mIdx = 0; mIdx < preview.modules.length; mIdx++) {
    const mod = preview.modules[mIdx]!;
    const moduleId = generateId("mod_");
    await createCourseModule({
      id: moduleId,
      courseId,
      title: mod.title,
      order: mIdx,
      totalVideos: mod.totalVideos,
      totalDuration: mod.totalDuration,
    });

    for (const v of mod.videos) {
      await createCourseVideo({
        id: generateId("vid_"),
        courseId,
        moduleId,
        title: v.title,
        originalTitle: v.originalTitle,
        url: `https://drive.google.com/file/d/${v.driveFileId}/preview`,
        duration: v.duration,
        order: orderIdx++,
      });
    }
  }

  await recalculateCourseProgress(courseId);
  return fetchCourseById(courseId);
}

// ── External Link Metadata Helper ─────────────────────────────────────────────

export interface ExternalPageMetadata {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  author?: string;
}

export async function fetchExternalPageMetadata(
  url: string,
): Promise<ExternalPageMetadata> {
  return apiJson<ExternalPageMetadata>("/api/data/fetch-page-metadata", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
}
