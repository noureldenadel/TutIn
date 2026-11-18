import { useCallback, useEffect, useState } from "react";
import { apiJson, apiRequest, apiUrl } from "@/lib/api";
import { formatDurationClock } from "@/lib/format";

export type CourseSourceType =
  "local" | "youtube" | "google-drive" | "external-link" | "drive" | "link";

export interface Course {
  id: string;
  title: string;
  originalTitle?: string | undefined;
  description?: string | undefined;
  folderPath?: string | null | undefined;
  sourceType: CourseSourceType;
  instructor: string;
  language?: string | undefined;
  tags?: string[] | undefined;
  customMetadata?: Record<string, unknown> | null | undefined;
  totalDuration: number;
  totalVideos: number;
  completedVideos: number;
  completionPercentage: number;
  progress: number;
  lessons: number;
  duration: string;
  thumbnailUrl?: string | undefined;
  thumbnailData?: string | null | undefined;
  dateAdded?: string | undefined;
  lastAccessedAt?: string | null | undefined;
  completedAt?: string | null | undefined;
  order?: number | undefined;
  courseUrl?: string | undefined;
  youtubePlaylistId?: string | null | undefined;
  driveFolderId?: string | null | undefined;
  thumbnailHue?: number | undefined;
  thumbnailSeed?: number | undefined;
  art?: string | undefined;
}

export const COURSES_CHANGED_EVENT = "tutin:courses_changed";
export const COURSE_UPDATED_EVENT = "tutin:course-updated";
export const COURSE_DELETED_EVENT = "tutin:course_deleted";

let coursesCache: Course[] = [];
let hasFetchedCourses = false;
let inFlightCoursesFetch: Promise<Course[]> | null = null;

export function generateId(prefix = ""): string {
  return `${prefix}${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export function isDirectLinkCourse(
  course: Pick<Course, "sourceType" | "courseUrl" | "lessons" | "totalVideos">,
): boolean {
  if (course.sourceType === "external-link" || course.sourceType === "link") {
    return true;
  }
  return Boolean(
    course.courseUrl &&
    course.sourceType !== "youtube" &&
    course.sourceType !== "google-drive" &&
    course.sourceType !== "drive" &&
    (course.totalVideos ?? course.lessons ?? 0) === 0,
  );
}

export function videoStreamUrl(filePath?: string | null): string {
  if (!filePath) return "";
  return apiUrl(`/video/${encodeURIComponent(filePath)}`);
}

function pickLatestIsoTimestamp(...values: unknown[]): string | null {
  let bestStr: string | null = null;
  let bestMs = -Infinity;
  for (const val of values) {
    if (typeof val !== "string" || !val) continue;
    const ms = Date.parse(val);
    if (!Number.isNaN(ms) && ms > bestMs) {
      bestMs = ms;
      bestStr = val;
    }
  }
  return bestStr;
}

export function mapApiCourse(raw: Record<string, unknown>): Course {
  const id = String(raw["id"] ?? "");
  const totalDuration = Number(raw["totalDuration"] ?? 0) || 0;
  const totalVideos = Number(raw["totalVideos"] ?? raw["lessons"] ?? 0) || 0;
  const completedVideos = Number(raw["completedVideos"] ?? 0) || 0;
  const completionPercentage = Number(raw["completionPercentage"] ?? raw["progress"] ?? 0) || 0;
  const progress =
    completionPercentage >= 100 ? 100 : Math.min(99, Math.max(0, Math.round(completionPercentage)));

  const rawSourceType = String(raw["sourceType"] ?? "local") as CourseSourceType;
  const rawThumbUrl =
    typeof raw["thumbnailUrl"] === "string" && raw["thumbnailUrl"]
      ? raw["thumbnailUrl"]
      : undefined;
  const rawThumbData =
    typeof raw["thumbnailData"] === "string" && raw["thumbnailData"]
      ? raw["thumbnailData"]
      : undefined;

  const customMeta =
    raw["customMetadata"] && typeof raw["customMetadata"] === "object"
      ? (raw["customMetadata"] as Record<string, unknown>)
      : null;

  const seedFromMeta = Number(customMeta?.["thumbnailSeed"]);
  const hueFromMeta = Number(customMeta?.["thumbnailHue"]);

  const rawTags = Array.isArray(raw["tags"])
    ? raw["tags"].filter((t): t is string => typeof t === "string" && Boolean(t.trim()))
    : [];

  return {
    id,
    title: String(raw["title"] ?? "Untitled Course"),
    originalTitle: typeof raw["originalTitle"] === "string" ? raw["originalTitle"] : undefined,
    description: typeof raw["description"] === "string" ? raw["description"] : "",
    folderPath: typeof raw["folderPath"] === "string" ? raw["folderPath"] : null,
    sourceType: rawSourceType,
    instructor: typeof raw["instructor"] === "string" ? raw["instructor"].trim() : "",
    language: typeof raw["language"] === "string" ? raw["language"] : "en",
    tags: rawTags,
    customMetadata: customMeta,
    totalDuration,
    totalVideos,
    completedVideos,
    completionPercentage,
    progress,
    lessons: totalVideos,
    duration:
      totalDuration > 0
        ? formatDurationClock(totalDuration)
        : typeof raw["duration"] === "string" && raw["duration"]
          ? raw["duration"]
          : isDirectLinkCourse({
                sourceType: rawSourceType,
                courseUrl: typeof raw["courseUrl"] === "string" ? raw["courseUrl"] : undefined,
                totalVideos,
                lessons: totalVideos,
              })
            ? "External"
            : "00:00:00",
    thumbnailUrl: rawThumbUrl ?? rawThumbData,
    thumbnailData: rawThumbData ?? null,
    dateAdded: typeof raw["dateAdded"] === "string" ? raw["dateAdded"] : undefined,
    lastAccessedAt: pickLatestIsoTimestamp(
      raw["lastAccessedAt"],
      raw["lastAccessed"],
      raw["lastAccessedClickTime"],
    ),
    completedAt: typeof raw["completedAt"] === "string" ? raw["completedAt"] : null,
    order: typeof raw["order"] === "number" ? raw["order"] : undefined,
    courseUrl: typeof raw["courseUrl"] === "string" ? raw["courseUrl"] : undefined,
    youtubePlaylistId:
      typeof raw["youtubePlaylistId"] === "string" ? raw["youtubePlaylistId"] : null,
    driveFolderId: typeof raw["driveFolderId"] === "string" ? raw["driveFolderId"] : null,
    thumbnailHue: Number.isFinite(hueFromMeta) ? hueFromMeta : undefined,
    thumbnailSeed: Number.isFinite(seedFromMeta) ? seedFromMeta : undefined,
  };
}

function notifyCoursesChanged(nextCourses: Course[]): void {
  coursesCache = nextCourses;
  hasFetchedCourses = true;
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(COURSES_CHANGED_EVENT, { detail: { courses: nextCourses } }),
    );
  }
}

export function touchCourseLastAccessed(courseId: string, isoTimestamp: string): void {
  const idx = coursesCache.findIndex((c) => String(c.id) === String(courseId));
  if (idx < 0) return;
  const updated = [...coursesCache];
  const existing = updated[idx];
  if (!existing) return;
  updated[idx] = { ...existing, lastAccessedAt: isoTimestamp };
  notifyCoursesChanged(updated);
}

export function getSavedCourses(): Course[] {
  return coursesCache;
}

export function findSavedCourseById(courseId: string): Course | undefined {
  return coursesCache.find((c) => String(c.id) === String(courseId));
}

export async function fetchCourses(force = false): Promise<Course[]> {
  if (!force && hasFetchedCourses) return coursesCache;
  if (inFlightCoursesFetch && !force) return inFlightCoursesFetch;

  inFlightCoursesFetch = (async () => {
    const rows = await apiJson<Record<string, unknown>[]>("/api/courses");
    const mapped = Array.isArray(rows) ? rows.map(mapApiCourse) : [];
    notifyCoursesChanged(mapped);
    return mapped;
  })().finally(() => {
    inFlightCoursesFetch = null;
  });

  return inFlightCoursesFetch;
}

export async function fetchCourseById(courseId: string): Promise<Course | null> {
  const res = await apiRequest<Record<string, unknown>>(
    `/api/courses/${encodeURIComponent(courseId)}`,
  );
  if (!res.ok || !res.data) return null;
  const mapped = mapApiCourse(res.data);
  const existingIdx = coursesCache.findIndex((c) => c.id === mapped.id);
  if (existingIdx >= 0) {
    const updated = [...coursesCache];
    updated[existingIdx] = mapped;
    notifyCoursesChanged(updated);
  } else {
    notifyCoursesChanged([...coursesCache, mapped]);
  }
  return mapped;
}

export async function createCourse(
  data: Record<string, unknown> & { title: string },
): Promise<{ success: boolean; id: string }> {
  const id = typeof data["id"] === "string" && data["id"] ? data["id"] : generateId("course_");
  const result = await apiJson<{ success: boolean; id: string }>("/api/courses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...data, id }),
  });
  await fetchCourses(true);
  return result;
}

export async function updateCourse(
  courseId: string,
  updates: Record<string, unknown>,
): Promise<{ success: boolean }> {
  const res = await apiJson<{ success: boolean }>(`/api/courses/${encodeURIComponent(courseId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  await fetchCourses(true);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(COURSE_UPDATED_EVENT, { detail: { courseId, updates } }));
  }
  return res;
}

export async function deleteCourse(courseId: string): Promise<{ success: boolean }> {
  const res = await apiJson<{ success: boolean }>(`/api/courses/${encodeURIComponent(courseId)}`, {
    method: "DELETE",
  });
  notifyCoursesChanged(coursesCache.filter((c) => c.id !== courseId));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(COURSE_DELETED_EVENT, { detail: { courseId } }));
  }
  return res;
}

export async function reorderCourses(
  updates: Array<{ id: string; order: number }>,
): Promise<{ success: boolean }> {
  const res = await apiJson<{ success: boolean }>("/api/courses/reorder", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ updates }),
  });
  await fetchCourses(true);
  return res;
}

export async function recalculateCourseProgress(courseId: string): Promise<{
  completedVideos: number;
  totalVideos: number;
  totalDuration: number;
  completionPercentage: number;
} | null> {
  const res = await apiRequest<{
    completedVideos: number;
    totalVideos: number;
    totalDuration: number;
    completionPercentage: number;
  }>(`/api/courses/${encodeURIComponent(courseId)}/recalculate-progress`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (res.ok) {
    await fetchCourses(true);
    return res.data;
  }
  return null;
}

export async function hydrateCourseVault(
  courseId: string,
  vaultData?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await apiJson<Record<string, unknown>>(
    `/api/courses/${encodeURIComponent(courseId)}/hydrate-vault`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vaultData }),
    },
  );
  await fetchCourses(true);
  return res;
}

export async function openFolderInExplorer(folderPath: string): Promise<boolean> {
  const res = await apiRequest<{ success?: boolean }>("/api/fs/open-folder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folderPath }),
  });
  return Boolean(res.ok && res.data?.success);
}

export function useCoursesList(): {
  courses: Course[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<Course[]>;
} {
  const [list, setList] = useState<Course[]>(() => coursesCache);
  const [isLoading, setIsLoading] = useState<boolean>(() => !hasFetchedCourses);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const next = await fetchCourses(true);
      setList(next);
      return next;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load courses";
      setError(message);
      return coursesCache;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    if (!hasFetchedCourses) {
      fetchCourses(false)
        .then((next) => {
          if (active) {
            setList(next);
            setIsLoading(false);
          }
        })
        .catch((err) => {
          if (active) {
            setError(err instanceof Error ? err.message : "Failed to load courses");
            setIsLoading(false);
          }
        });
    }

    const syncFromCache = () => {
      if (active) {
        setList([...coursesCache]);
        setIsLoading(false);
      }
    };
    const handleForceRefresh = () => {
      void fetchCourses(true).catch(() => {});
    };

    window.addEventListener(COURSES_CHANGED_EVENT, syncFromCache);
    window.addEventListener(COURSE_DELETED_EVENT, syncFromCache);
    window.addEventListener(COURSE_UPDATED_EVENT, handleForceRefresh);
    return () => {
      active = false;
      window.removeEventListener(COURSES_CHANGED_EVENT, syncFromCache);
      window.removeEventListener(COURSE_DELETED_EVENT, syncFromCache);
      window.removeEventListener(COURSE_UPDATED_EVENT, handleForceRefresh);
    };
  }, []);

  return { courses: list, isLoading, error, refresh };
}

export function useSavedCourseQuery(courseId: string): {
  course: Course | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
} {
  const [course, setCourse] = useState<Course | null>(() => findSavedCourseById(courseId) ?? null);
  const [isLoading, setIsLoading] = useState<boolean>(() => !findSavedCourseById(courseId));

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const fetched = await fetchCourseById(courseId);
      setCourse(fetched);
    } finally {
      setIsLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    let active = true;
    const cached = findSavedCourseById(courseId);
    if (cached) {
      setCourse(cached);
      setIsLoading(false);
    } else {
      setIsLoading(true);
      fetchCourseById(courseId)
        .then((fetched) => {
          if (active) {
            setCourse(fetched);
            setIsLoading(false);
          }
        })
        .catch(() => {
          if (active) setIsLoading(false);
        });
    }

    const syncFromCache = () => {
      if (active) {
        const next = findSavedCourseById(courseId);
        if (next) setCourse(next);
      }
    };

    window.addEventListener(COURSES_CHANGED_EVENT, syncFromCache);
    return () => {
      active = false;
      window.removeEventListener(COURSES_CHANGED_EVENT, syncFromCache);
    };
  }, [courseId]);

  return { course, isLoading, refresh };
}

export function useSavedCourse(courseId: string): Course | null {
  return useSavedCourseQuery(courseId).course;
}

export function calculateCourseCompletionPercentage(
  items: ReadonlyArray<{ isCompleted: boolean; duration?: number | undefined }>,
  mode: "videos" | "duration",
): number {
  const totalVideos = items.length;
  if (totalVideos === 0) return 0;

  const completedVideos = items.filter((item) => item.isCompleted).length;
  if (completedVideos === totalVideos) return 100;

  if (mode === "duration") {
    let totalDuration = 0;
    let completedDuration = 0;
    let hasIncompleteWithoutDuration = false;

    for (const item of items) {
      const dur = Math.max(0, Number(item.duration) || 0);
      totalDuration += dur;
      if (item.isCompleted) {
        completedDuration += dur;
      } else if (dur === 0) {
        hasIncompleteWithoutDuration = true;
      }
    }

    if (totalDuration > 0) {
      const pct = (completedDuration / totalDuration) * 100;
      if (hasIncompleteWithoutDuration && pct >= 100) return 99;
      if (pct >= 100) return 99.9;
      return Math.min(100, Math.max(0, pct));
    }
  }

  return Math.min(100, Math.max(0, (completedVideos / totalVideos) * 100));
}

export const COURSE_SORT_OPTIONS = ["Recent", "Progress", "A–Z"] as const;
export type CourseSortOption = (typeof COURSE_SORT_OPTIONS)[number];

export function sortCourses(courses: Course[], sort: CourseSortOption): Course[] {
  return [...courses].sort((a, b) => {
    if (sort === "Progress") return b.progress - a.progress;
    if (sort === "A–Z") return a.title.localeCompare(b.title);
    const timeA = Date.parse(a.lastAccessedAt || a.dateAdded || "") || 0;
    const timeB = Date.parse(b.lastAccessedAt || b.dateAdded || "") || 0;
    if (timeA !== timeB) return timeB - timeA;
    return (a.order ?? 0) - (b.order ?? 0);
  });
}
