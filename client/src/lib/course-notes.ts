import { apiJson, apiRequest } from "@/lib/api";
import type { CourseLessonItem } from "@/lib/course-lessons";
import { normalizeMediaSrcForStorage } from "@/lib/media-store";

export interface NoteItem {
  id: string;
  courseId?: string | undefined;
  videoId?: string | undefined;
  lessonIdx: number;
  timestamp: number;
  content: string;
  images: string[];
  tags?: string[] | undefined;
  isBookmark?: boolean | undefined;
  createdAt: number;
  updatedAt?: number | undefined;
}

export const NOTES_CHANGED_EVENT = "tutin:notes_changed";
export type NoteChangeSource = "player" | "canvas" | "fetch" | "rollback";

const courseNotesCache = new Map<string, NoteItem[]>();
const notesRevisionByCourse = new Map<string, number>();

export function getNextNotesRevision(courseId: string): number {
  const next = (notesRevisionByCourse.get(courseId) ?? 0) + 1;
  notesRevisionByCourse.set(courseId, next);
  return next;
}

export function extractImagesFromHtml(html: string): string[] {
  if (!html) return [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  return Array.from(doc.querySelectorAll("img"))
    .map((img) => normalizeMediaSrcForStorage(img.getAttribute("src") ?? ""))
    .filter(Boolean);
}

export function stripHtmlToText(html: string): string {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent ?? "").replace(/\u200B/g, "").trim();
}

export function hasMeaningfulHtmlContent(html: string): boolean {
  if (!html) return false;
  if (/<img\b/i.test(html)) return true;
  return stripHtmlToText(html).length > 0;
}

function cloneNote(note: NoteItem): NoteItem {
  return {
    ...note,
    images: [...note.images],
    ...(note.tags ? { tags: [...note.tags] } : {}),
  };
}

function parseTimestampMillis(val: unknown, fallback: number): number {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "string" && val.trim()) {
    const parsed = Date.parse(val);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallback;
}

function appendMissingImagesToHtml(content: string, images: string[]): string {
  if (images.length === 0) return content;
  const doc = content ? new DOMParser().parseFromString(content, "text/html") : null;
  const existingNorms = new Set(
    doc
      ? Array.from(doc.querySelectorAll("img"))
          .map((img) => normalizeMediaSrcForStorage(img.getAttribute("src") ?? ""))
          .filter(Boolean)
      : [],
  );
  const missing = images
    .map((img) => normalizeMediaSrcForStorage(img))
    .filter((src) => src && !existingNorms.has(src));
  if (missing.length === 0) return content;

  const extraHtml = missing
    .map((src) => {
      const escaped = src.replace(/"/g, "&quot;");
      return `<div data-note-image-block="true"><img src="${escaped}" alt="Note image"></div>`;
    })
    .join("");
  return content ? `${content}${extraHtml}` : extraHtml;
}

function mapApiNoteRow(
  raw: Record<string, unknown>,
  courseId: string,
  lessons: CourseLessonItem[],
): NoteItem {
  const videoId = String(raw["videoId"] ?? raw["video_id"] ?? "");
  const matchedLessonIdx = lessons.findIndex((l) => l.lessonId === videoId);
  const rawIdx = Number(raw["lessonIdx"]);
  const lessonIdx =
    matchedLessonIdx >= 0 ? matchedLessonIdx : Number.isFinite(rawIdx) && rawIdx >= 0 ? rawIdx : 0;

  const rawContent = String(raw["content"] ?? "");
  const rawImages = Array.isArray(raw["images"])
    ? raw["images"].filter((img): img is string => typeof img === "string" && Boolean(img))
    : [];
  const content = appendMissingImagesToHtml(rawContent, rawImages);
  const images = rawImages.length > 0 ? rawImages : extractImagesFromHtml(content);

  const now = Date.now();
  return {
    id: String(raw["id"] ?? ""),
    courseId: String(raw["courseId"] ?? raw["course_id"] ?? courseId),
    videoId,
    lessonIdx,
    timestamp: Math.max(0, Number(raw["timestamp"] ?? 0) || 0),
    content,
    images,
    tags: Array.isArray(raw["tags"])
      ? raw["tags"].filter((t): t is string => typeof t === "string")
      : undefined,
    isBookmark: Boolean(raw["isBookmark"]),
    createdAt: parseTimestampMillis(raw["createdAt"] ?? raw["created_at"], now),
    updatedAt: parseTimestampMillis(raw["updatedAt"] ?? raw["updated_at"], now),
  };
}

function emitNotesChanged(
  courseId: string,
  notes: NoteItem[],
  revision?: number,
  source: NoteChangeSource = "player",
): void {
  const cloned = notes.map(cloneNote);
  courseNotesCache.set(courseId, cloned);
  const rev = revision ?? getNextNotesRevision(courseId);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(NOTES_CHANGED_EVENT, {
        detail: { courseId, notes: cloned, revision: rev, source },
      }),
    );
  }
}

export async function fetchCourseNotes(
  courseId: string,
  lessons: CourseLessonItem[] = [],
): Promise<NoteItem[]> {
  if (!courseId) return [];
  const rows = await apiJson<Record<string, unknown>[]>(
    `/api/notes/by-course/${encodeURIComponent(courseId)}`,
  );
  const mapped = Array.isArray(rows)
    ? rows.map((row) => mapApiNoteRow(row, courseId, lessons))
    : [];
  emitNotesChanged(courseId, mapped, undefined, "fetch");
  return mapped.map(cloneNote);
}

export function getCourseNotes(courseId: string): NoteItem[] {
  return (courseNotesCache.get(courseId) ?? []).map(cloneNote);
}

export async function createNoteOnServer(courseId: string, note: NoteItem): Promise<NoteItem> {
  const withCreatedAt: NoteItem = {
    ...note,
    courseId,
    createdAt: note.createdAt || Date.now(),
    updatedAt: Date.now(),
  };

  await apiJson<{ success: boolean; id: string }>("/api/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: withCreatedAt.id,
      videoId: withCreatedAt.videoId,
      courseId,
      timestamp: withCreatedAt.timestamp,
      content: withCreatedAt.content,
      isBookmark: Boolean(withCreatedAt.isBookmark),
      tags: withCreatedAt.tags ?? [],
      images: withCreatedAt.images,
    }),
  });

  const existing = getCourseNotes(courseId);
  emitNotesChanged(courseId, [...existing, withCreatedAt], undefined, "player");
  return withCreatedAt;
}

export function updateCourseNoteContent(
  courseId: string,
  noteId: string,
  htmlContent: string,
  options?: { source?: NoteChangeSource },
): NoteItem[] {
  const existing = getCourseNotes(courseId);
  const now = Date.now();
  const nextImages = extractImagesFromHtml(htmlContent);
  const nextList = existing.map((n) =>
    n.id === noteId
      ? {
          ...n,
          content: htmlContent,
          images: nextImages,
          updatedAt: now,
        }
      : n,
  );
  emitNotesChanged(courseId, nextList, undefined, options?.source ?? "player");
  void apiRequest(`/api/notes/${encodeURIComponent(noteId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: htmlContent,
      images: nextImages,
    }),
    keepalive: true,
  })
    .then((res) => {
      if (!res.ok) {
        console.error(`[CourseNotes] Failed to update note ${noteId}: ${res.status}`);
        emitNotesChanged(courseId, existing, undefined, "rollback");
      }
    })
    .catch((err) => {
      console.error(`[CourseNotes] Failed to update note ${noteId}:`, err);
      emitNotesChanged(courseId, existing, undefined, "rollback");
    });
  return nextList;
}

export function deleteCourseNoteById(
  courseId: string,
  noteId: string,
  options?: { source?: NoteChangeSource },
): NoteItem[] {
  const existing = getCourseNotes(courseId);
  const nextList = existing.filter((n) => n.id !== noteId);
  emitNotesChanged(courseId, nextList, undefined, options?.source ?? "player");
  void apiRequest(`/api/notes/${encodeURIComponent(noteId)}`, {
    method: "DELETE",
    keepalive: true,
  })
    .then((res) => {
      if (!res.ok) {
        console.error(`[CourseNotes] Failed to delete note ${noteId}: ${res.status}`);
        emitNotesChanged(courseId, existing, undefined, "rollback");
      }
    })
    .catch((err) => {
      console.error(`[CourseNotes] Failed to delete note ${noteId}:`, err);
      emitNotesChanged(courseId, existing, undefined, "rollback");
    });
  return nextList;
}

export function subscribeCourseNotesChanged(
  courseId: string,
  listener: (notes: NoteItem[], meta?: { source?: NoteChangeSource | undefined }) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const onCustom = (e: Event) => {
    const detail = (
      e as CustomEvent<{ courseId?: string; notes?: NoteItem[]; source?: NoteChangeSource }>
    ).detail;
    if (detail?.courseId === courseId && Array.isArray(detail.notes)) {
      listener(
        detail.notes.map(cloneNote),
        detail.source !== undefined ? { source: detail.source } : undefined,
      );
    }
  };

  window.addEventListener(NOTES_CHANGED_EVENT, onCustom);
  return () => {
    window.removeEventListener(NOTES_CHANGED_EVENT, onCustom);
  };
}
