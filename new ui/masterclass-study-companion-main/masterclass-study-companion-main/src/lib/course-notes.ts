export interface NoteItem {
  id: string;
  courseId?: string | undefined;
  videoId?: string | undefined;
  lessonIdx: number;
  timestamp: number;
  content: string;
  images: string[];
  createdAt: number;
  updatedAt?: number | undefined;
}

export type NoteChangeSource = "player" | "canvas" | "system";

export interface NotesChangedDetail {
  courseId: string;
  notes: NoteItem[];
  source: NoteChangeSource;
  revision: number;
}

export const INITIAL_DEMO_NOTES: NoteItem[] = [
  {
    id: "seed-note-1",
    videoId: "lesson-0",
    lessonIdx: 0,
    timestamp: 14,
    content:
      "<p><strong>Hierarchy</strong> tells the eye where to go first, and where to rest.</p>",
    images: [],
    createdAt: 1000,
  },
  {
    id: "seed-note-2",
    videoId: "lesson-0",
    lessonIdx: 0,
    timestamp: 35,
    content:
      "<ul><li>Use the squint test to spot what stands out immediately</li><li>Keep the palette small and let one accent do the heavy lifting</li></ul>",
    images: [],
    createdAt: 2000,
  },
  {
    id: "seed-note-3",
    videoId: "lesson-0",
    lessonIdx: 0,
    timestamp: 49,
    content: "<p>Apply <code>8px</code> spacing steps across the layout rhythm.</p>",
    images: [],
    createdAt: 3000,
  },
];

export const NOTES_CHANGED_EVENT = "tutin:notes_changed";

const revisionByCourse = new Map<string, number>();

export function getNotesStorageKey(courseId: string): string {
  return `tutin_course_notes_${courseId}`;
}

export function getNextNotesRevision(courseId: string): number {
  const next = (revisionByCourse.get(courseId) ?? 0) + 1;
  revisionByCourse.set(courseId, next);
  return next;
}

export function extractImagesFromHtml(html: string): string[] {
  const imgs: string[] = [];
  if (!html) return imgs;

  const regex = /<img[^>]+(?:data-media-uri|src)="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const src = match[1];
    if (src && !src.startsWith("blob:")) {
      imgs.push(src);
    }
  }
  return imgs;
}

export function stripHtmlToText(html: string): string {
  if (!html) return "";
  if (typeof document !== "undefined") {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return (tmp.textContent || tmp.innerText || "").trim();
  }
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function hasMeaningfulHtmlContent(html: string): boolean {
  const text = stripHtmlToText(html);
  return Boolean(text || html.includes("<img"));
}

function shouldSeedDemoNotes(courseId: string): boolean {
  if (!courseId || courseId.startsWith("course_")) return false;
  const numeric = Number(courseId);
  return Number.isFinite(numeric) && numeric >= 1 && numeric <= 25;
}

function cloneSeedNotes(courseId: string): NoteItem[] {
  return INITIAL_DEMO_NOTES.map((note) => ({
    ...note,
    courseId,
    images: [...note.images],
  }));
}

export function getCourseNotes(courseId: string): NoteItem[] {
  if (typeof window === "undefined") {
    return shouldSeedDemoNotes(courseId) ? cloneSeedNotes(courseId) : [];
  }

  try {
    const raw = window.localStorage.getItem(getNotesStorageKey(courseId));
    if (raw === null) {
      if (!shouldSeedDemoNotes(courseId)) return [];
      const seeded = cloneSeedNotes(courseId);
      window.localStorage.setItem(getNotesStorageKey(courseId), JSON.stringify(seeded));
      return seeded;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is NoteItem => Boolean(item && typeof item.id === "string"))
      .map((item) => ({
        ...item,
        courseId: item.courseId || courseId,
        lessonIdx: Number.isFinite(Number(item.lessonIdx)) ? Number(item.lessonIdx) : 0,
        timestamp: Number.isFinite(Number(item.timestamp)) ? Number(item.timestamp) : 0,
        content: typeof item.content === "string" ? item.content : "",
        images: Array.isArray(item.images) ? item.images : extractImagesFromHtml(item.content || ""),
        createdAt: Number.isFinite(Number(item.createdAt)) ? Number(item.createdAt) : Date.now(),
      }));
  } catch {
    return shouldSeedDemoNotes(courseId) ? cloneSeedNotes(courseId) : [];
  }
}

export function saveCourseNotes(
  courseId: string,
  notes: NoteItem[],
  source: NoteChangeSource = "system",
): number {
  const revision = getNextNotesRevision(courseId);
  if (typeof window === "undefined") return revision;

  const normalized = notes.map((note) => ({
    ...note,
    courseId,
    images: extractImagesFromHtml(note.content),
  }));

  try {
    window.localStorage.setItem(getNotesStorageKey(courseId), JSON.stringify(normalized));
  } catch (err) {
    console.warn("[CourseNotes] Failed to persist notes to localStorage:", err);
  }

  window.dispatchEvent(
    new CustomEvent<NotesChangedDetail>(NOTES_CHANGED_EVENT, {
      detail: { courseId, notes: normalized, source, revision },
    }),
  );

  return revision;
}

export function upsertCourseNote(
  courseId: string,
  note: NoteItem,
  source: NoteChangeSource,
): NoteItem[] {
  const current = getCourseNotes(courseId);
  const exists = current.some((n) => n.id === note.id);
  const next = exists
    ? current.map((n) => (n.id === note.id ? { ...n, ...note, updatedAt: Date.now() } : n))
    : [...current, { ...note, courseId, updatedAt: Date.now() }];
  saveCourseNotes(courseId, next, source);
  return next;
}

export function updateCourseNoteContent(
  courseId: string,
  noteId: string,
  htmlContent: string,
  source: NoteChangeSource,
): NoteItem[] {
  const current = getCourseNotes(courseId);
  const next = current.map((n) =>
    n.id === noteId
      ? {
          ...n,
          content: htmlContent,
          images: extractImagesFromHtml(htmlContent),
          updatedAt: Date.now(),
        }
      : n,
  );
  saveCourseNotes(courseId, next, source);
  return next;
}

export function deleteCourseNoteById(
  courseId: string,
  noteId: string,
  source: NoteChangeSource,
): NoteItem[] {
  const current = getCourseNotes(courseId);
  const next = current.filter((n) => n.id !== noteId);
  saveCourseNotes(courseId, next, source);
  return next;
}

export function subscribeCourseNotesChanged(
  courseId: string,
  onUpdate: (detail: NotesChangedDetail) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const onCustom = (event: Event) => {
    const custom = event as CustomEvent<NotesChangedDetail>;
    if (!custom.detail || custom.detail.courseId !== courseId) return;
    onUpdate(custom.detail);
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key !== getNotesStorageKey(courseId)) return;
    const notes = getCourseNotes(courseId);
    const revision = getNextNotesRevision(courseId);
    onUpdate({ courseId, notes, source: "system", revision });
  };

  window.addEventListener(NOTES_CHANGED_EVENT, onCustom);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(NOTES_CHANGED_EVENT, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}
