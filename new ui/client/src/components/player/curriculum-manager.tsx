import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  FolderOpen,
  LayoutGrid,
  Loader2,
  Mic,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Subtitles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { apiUrl } from "@/lib/api";
import { getLanguageLabel } from "@/lib/languages";
import {
  createCourseModule,
  createCourseVideo,
  deleteCourseModule,
  deleteCourseVideo,
  fetchCourseCurriculum,
  formatTimestamp,
  getLessonDurationSeconds,
  markVideoComplete,
  parseDurationToSeconds,
  subscribeCourseCurriculumChanged,
  updateCourseModule,
  updateCourseVideo,
  type CourseLessonItem,
  type CourseModuleSpec,
} from "@/lib/course-lessons";
import {
  COURSES_CHANGED_EVENT,
  fetchCourseById,
  generateId,
  isDirectLinkCourse,
  openFolderInExplorer,
  type Course,
} from "@/lib/courses";
import { cn } from "@/lib/utils";
import { InstructorAvatar } from "@/components/layout/instructor-avatar";
import { EditCourseModal } from "@/components/modals/edit-course-modal";
import {
  SmartCaptionsModal,
  type SmartCaptionMatch,
} from "@/components/modals/smart-captions-modal";
import { SyncPreviewModal } from "@/components/modals/sync-preview-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface ManagedModule {
  id: string;
  title: string;
  order: number;
  lessons: CourseLessonItem[];
}

export function CurriculumManager({ course: initialCourse }: { course: Course }) {
  const [course, setCourse] = useState<Course>(initialCourse);
  const [modules, setModules] = useState<ManagedModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [openMods, setOpenMods] = useState<Record<string, boolean>>({});
  const [dirtyOrder, setDirtyOrder] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);

  // Modals
  const [editOpen, setEditOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [smartCaptionData, setSmartCaptionData] = useState<{
    language: string;
    languageName: string;
    matches: SmartCaptionMatch[];
  } | null>(null);

  // Add / rename / delete inline states
  const [newModuleTitle, setNewModuleTitle] = useState("");
  const [addingModule, setAddingModule] = useState(false);
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null);
  const [editingModuleTitle, setEditingModuleTitle] = useState("");
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const [editingLessonTitle, setEditingLessonTitle] = useState("");
  const [addLessonModuleId, setAddLessonModuleId] = useState<string | null>(null);
  const [newLessonTitle, setNewLessonTitle] = useState("");
  const [newLessonUrl, setNewLessonUrl] = useState("");
  const [newLessonDuration, setNewLessonDuration] = useState("");
  const [savingLesson, setSavingLesson] = useState(false);

  // Confirm delete dialog
  const [confirmDelete, setConfirmDelete] = useState<
    | { kind: "module"; id: string; title: string }
    | { kind: "lesson"; id: string; title: string }
    | null
  >(null);
  const [deleting, setDeleting] = useState(false);

  // Subtitle file upload
  const captionInputRef = useRef<HTMLInputElement>(null);
  const pendingCaptionLessonRef = useRef<CourseLessonItem | null>(null);
  const [uploadingCaptionId, setUploadingCaptionId] = useState<string | null>(null);

  useEffect(() => {
    setCourse(initialCourse);
  }, [initialCourse]);

  const applyCurriculum = useCallback((nextModules: CourseModuleSpec[], nextLessons: CourseLessonItem[]) => {
    const grouped: ManagedModule[] = nextModules.map((mod, idx) => ({
      id: mod.id,
      title: mod.title,
      order: idx,
      lessons: nextLessons.filter((l) => l.moduleId === mod.id),
    }));
    setModules(grouped);
    setDirtyOrder(false);
    setOpenMods((prev) => {
      const next = { ...prev };
      for (const m of grouped) {
        if (next[m.id] === undefined) next[m.id] = true;
      }
      return next;
    });
  }, []);

  const loadCurriculum = useCallback(
    async (force = false) => {
      try {
        const data = await fetchCourseCurriculum(course.id, force);
        applyCurriculum(data.modules, data.lessons);
      } catch (err) {
        console.error("Failed to load curriculum:", err);
        toast.error("Failed to load curriculum.");
      } finally {
        setLoading(false);
      }
    },
    [course.id, applyCurriculum],
  );

  useEffect(() => {
    setLoading(true);
    void loadCurriculum(false);
  }, [loadCurriculum]);

  useEffect(() => {
    return subscribeCourseCurriculumChanged(course.id, (data) => {
      applyCurriculum(data.modules, data.lessons);
    });
  }, [course.id, applyCurriculum]);

  useEffect(() => {
    const onCoursesChanged = () => {
      void fetchCourseById(course.id).then((fresh) => {
        if (fresh) setCourse(fresh);
      });
    };
    window.addEventListener(COURSES_CHANGED_EVENT, onCoursesChanged);
    return () => window.removeEventListener(COURSES_CHANGED_EVENT, onCoursesChanged);
  }, [course.id]);

  const totals = useMemo(() => {
    let lessonsCount = 0;
    let doneCount = 0;
    let totalSecs = 0;
    for (const m of modules) {
      lessonsCount += m.lessons.length;
      for (const l of m.lessons) {
        if (l.isCompleted) doneCount++;
        totalSecs += getLessonDurationSeconds(l);
      }
    }
    return { lessonsCount, doneCount, totalSecs };
  }, [modules]);

  const globalIndexByLessonId = useMemo(() => {
    const map = new Map<string, number>();
    let idx = 0;
    for (const m of modules) {
      for (const l of m.lessons) {
        map.set(l.lessonId, idx++);
      }
    }
    return map;
  }, [modules]);

  const canSync =
    !isDirectLinkCourse(course) &&
    course.sourceType !== "google-drive" &&
    course.sourceType !== "drive" &&
    Boolean(course.folderPath || course.youtubePlaylistId || course.courseUrl);

  const handleAddModule = async () => {
    const title = newModuleTitle.trim();
    if (!title) return;
    setAddingModule(true);
    try {
      await createCourseModule({
        id: generateId("mod"),
        courseId: course.id,
        title,
        order: modules.length,
      });
      setNewModuleTitle("");
      toast.success("Module added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add module");
    } finally {
      setAddingModule(false);
    }
  };

  const handleSaveModuleTitle = async (moduleId: string) => {
    const trimmed = editingModuleTitle.trim();
    setEditingModuleId(null);
    if (!trimmed) return;
    try {
      await updateCourseModule(moduleId, course.id, { title: trimmed });
      toast.success("Module renamed");
    } catch {
      toast.error("Failed to rename module");
    }
  };

  const handleSaveLessonTitle = async (lessonId: string) => {
    const trimmed = editingLessonTitle.trim();
    setEditingLessonId(null);
    if (!trimmed) return;
    try {
      await updateCourseVideo(lessonId, course.id, { title: trimmed });
      toast.success("Lesson renamed");
    } catch {
      toast.error("Failed to rename lesson");
    }
  };

  const handleAddLesson = async (moduleId: string, existingCount: number) => {
    const title = newLessonTitle.trim();
    if (!title) return;
    setSavingLesson(true);
    try {
      const durationSec = newLessonDuration.trim()
        ? parseDurationToSeconds(newLessonDuration.trim())
        : 0;
      const trimmedUrl = newLessonUrl.trim();
      await createCourseVideo({
        id: generateId("vid"),
        courseId: course.id,
        moduleId,
        title,
        order: existingCount,
        duration: durationSec,
        ...(trimmedUrl ? { url: trimmedUrl } : {}),
      });
      setAddLessonModuleId(null);
      setNewLessonTitle("");
      setNewLessonUrl("");
      setNewLessonDuration("");
      toast.success("Lesson added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add lesson");
    } finally {
      setSavingLesson(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      if (confirmDelete.kind === "module") {
        await deleteCourseModule(confirmDelete.id, course.id);
        toast.success("Module deleted");
      } else {
        await deleteCourseVideo(confirmDelete.id, course.id);
        toast.success("Lesson deleted");
      }
      setConfirmDelete(null);
    } catch {
      toast.error("Failed to delete item");
    } finally {
      setDeleting(false);
    }
  };

  const moveModule = (idx: number, delta: -1 | 1) => {
    const target = idx + delta;
    if (target < 0 || target >= modules.length) return;
    setModules((prev) => {
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      if (!item) return prev;
      copy.splice(target, 0, item);
      return copy;
    });
    setDirtyOrder(true);
  };

  const moveLesson = (moduleId: string, idx: number, delta: -1 | 1) => {
    setModules((prev) =>
      prev.map((mod) => {
        if (mod.id !== moduleId) return mod;
        const target = idx + delta;
        if (target < 0 || target >= mod.lessons.length) return mod;
        const nextLessons = [...mod.lessons];
        const [item] = nextLessons.splice(idx, 1);
        if (!item) return mod;
        nextLessons.splice(target, 0, item);
        return { ...mod, lessons: nextLessons };
      }),
    );
    setDirtyOrder(true);
  };

  const handleSaveOrder = async () => {
    setSavingOrder(true);
    try {
      const ops: Promise<unknown>[] = [];
      modules.forEach((mod, modIdx) => {
        ops.push(updateCourseModule(mod.id, course.id, { order: modIdx }));
        mod.lessons.forEach((lesson, lessonIdx) => {
          ops.push(updateCourseVideo(lesson.lessonId, course.id, { order: lessonIdx }));
        });
      });
      await Promise.all(ops);
      await loadCurriculum(true);
      toast.success("Order saved");
    } catch {
      toast.error("Failed to save order");
    } finally {
      setSavingOrder(false);
    }
  };

  const triggerCaptionUpload = (lesson: CourseLessonItem) => {
    pendingCaptionLessonRef.current = lesson;
    captionInputRef.current?.click();
  };

  const handleCaptionFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const lesson = pendingCaptionLessonRef.current;
    e.target.value = "";
    if (!file || !lesson) return;

    setUploadingCaptionId(lesson.lessonId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("caption", file);

      const res = await fetch(
        apiUrl(`/api/transcripts/${encodeURIComponent(lesson.lessonId)}/upload`),
        {
          method: "POST",
          body: formData,
        },
      );
      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error || "Failed to upload subtitles");
      }

      const data = (await res.json()) as {
        language?: string;
        languageName?: string;
        detectedMatches?: SmartCaptionMatch[];
      };

      await loadCurriculum(true);
      toast.success(`Subtitles attached (${getLanguageLabel(data.language)})`);

      if (data.detectedMatches && data.detectedMatches.length > 0) {
        setSmartCaptionData({
          language: data.language || "en",
          languageName: data.languageName || getLanguageLabel(data.language || "en"),
          matches: data.detectedMatches,
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Subtitle upload failed");
    } finally {
      setUploadingCaptionId(null);
      pendingCaptionLessonRef.current = null;
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-border/60 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Link to="/" className="hover:text-foreground">
              Courses
            </Link>
            <span>/</span>
            <Link
              to="/learn/$courseId"
              params={{ courseId: course.id }}
              className="truncate hover:text-foreground"
            >
              {course.title}
            </Link>
            <span>/</span>
            <span className="font-medium text-foreground">Manage</span>
          </div>

          <h1 className="mt-1.5 truncate text-xl font-semibold tracking-tight sm:text-2xl">
            {course.title}
          </h1>

          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {course.instructor.trim() ? (
              <span className="inline-flex items-center gap-1.5">
                <InstructorAvatar name={course.instructor} course={course} size="sm" />
                <span>{course.instructor}</span>
              </span>
            ) : null}
            <span>
              {modules.length} {modules.length === 1 ? "module" : "modules"}
            </span>
            <span>
              {totals.doneCount} / {totals.lessonsCount} lessons
            </span>
            <span className="font-mono tabular-nums">{formatTimestamp(totals.totalSecs)}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {course.folderPath && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                void openFolderInExplorer(course.folderPath!);
              }}
              className="rounded-md text-muted-foreground"
              title="Show in Explorer"
            >
              <FolderOpen className="size-4" /> Folder
            </Button>
          )}
          {canSync && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setSyncOpen(true)}
              className="rounded-md"
            >
              <RefreshCw className="size-4" /> Sync
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setEditOpen(true)}
            className="rounded-md"
          >
            <Settings2 className="size-4" /> Edit
          </Button>
          <Button asChild variant="secondary" size="sm" className="rounded-md">
            <Link to="/canvas/$courseId" params={{ courseId: course.id }}>
              <LayoutGrid className="size-4" /> Canvas
            </Link>
          </Button>
          <Button asChild size="sm" className="rounded-md">
            <Link to="/learn/$courseId" params={{ courseId: course.id }}>
              <Play className="size-4" /> Watch
            </Link>
          </Button>
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2 sm:max-w-sm">
          <Input
            value={newModuleTitle}
            onChange={(e) => setNewModuleTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleAddModule();
            }}
            placeholder="New module title…"
            className="h-9 bg-card"
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!newModuleTitle.trim() || addingModule}
            onClick={() => void handleAddModule()}
            className="h-9 shrink-0 rounded-md"
          >
            {addingModule ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Add module
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled
            title="AI transcription unavailable"
            className="cursor-not-allowed rounded-md opacity-45"
          >
            <BookOpen className="size-4" /> Transcribe missing
          </Button>
          {dirtyOrder && (
            <Button
              type="button"
              size="sm"
              disabled={savingOrder}
              onClick={() => void handleSaveOrder()}
              className="rounded-md"
            >
              {savingOrder ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save order
            </Button>
          )}
        </div>
      </div>

      {/* Curriculum List */}
      <div className="mt-5 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center rounded-xl bg-card py-16 text-sm text-muted-foreground shadow-card">
            <Loader2 className="mr-2 size-4 animate-spin" /> Loading curriculum…
          </div>
        ) : modules.length === 0 ? (
          <div className="rounded-xl bg-card px-6 py-12 text-center shadow-card">
            <p className="text-sm text-muted-foreground">No modules yet.</p>
          </div>
        ) : (
          modules.map((mod, modIdx) => {
            const isOpen = openMods[mod.id] ?? true;
            const modDone = mod.lessons.filter((l) => l.isCompleted).length;
            const modSecs = mod.lessons.reduce((acc, l) => acc + getLessonDurationSeconds(l), 0);

            return (
              <section key={mod.id} className="overflow-hidden rounded-xl bg-card shadow-card">
                <div className="flex items-center gap-2 border-b border-border/50 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setOpenMods((prev) => ({ ...prev, [mod.id]: !isOpen }))}
                    aria-expanded={isOpen}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    <ChevronDown
                      className={cn(
                        "size-4 shrink-0 text-muted-foreground transition-transform duration-150",
                        !isOpen && "-rotate-90",
                      )}
                    />
                    {editingModuleId === mod.id ? (
                      <input
                        autoFocus
                        value={editingModuleTitle}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setEditingModuleTitle(e.target.value)}
                        onBlur={() => void handleSaveModuleTitle(mod.id)}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter") void handleSaveModuleTitle(mod.id);
                          if (e.key === "Escape") setEditingModuleId(null);
                        }}
                        className="h-7 flex-1 rounded-md border border-border bg-background px-2 text-sm font-semibold text-foreground outline-none"
                      />
                    ) : (
                      <span className="truncate text-sm font-semibold text-foreground">
                        {mod.title}
                      </span>
                    )}
                  </button>

                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {modDone}/{mod.lessons.length} · {formatTimestamp(modSecs)}
                  </span>

                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={modIdx === 0}
                      onClick={() => moveModule(modIdx, -1)}
                      title="Move module up"
                      aria-label="Move module up"
                      className="size-7 text-muted-foreground"
                    >
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={modIdx === modules.length - 1}
                      onClick={() => moveModule(modIdx, 1)}
                      title="Move module down"
                      aria-label="Move module down"
                      className="size-7 text-muted-foreground"
                    >
                      <ArrowDown className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditingModuleId(mod.id);
                        setEditingModuleTitle(mod.title);
                      }}
                      title="Rename module"
                      aria-label="Rename module"
                      className="size-7 text-muted-foreground"
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setAddLessonModuleId(addLessonModuleId === mod.id ? null : mod.id);
                        setNewLessonTitle("");
                        setNewLessonUrl("");
                        setNewLessonDuration("");
                      }}
                      title="Add lesson"
                      aria-label="Add lesson"
                      className="size-7 text-muted-foreground"
                    >
                      <Plus className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setConfirmDelete({ kind: "module", id: mod.id, title: mod.title })
                      }
                      title="Delete module"
                      aria-label="Delete module"
                      className="size-7 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>

                {isOpen && (
                  <div className="divide-y divide-border/40">
                    {mod.lessons.length === 0 ? (
                      <div className="px-4 py-4 text-xs text-muted-foreground">No lessons yet.</div>
                    ) : (
                      mod.lessons.map((lesson, lessonIdx) => {
                        const globalIdx = globalIndexByLessonId.get(lesson.lessonId) ?? 0;
                        const secs = getLessonDurationSeconds(lesson);
                        const captionCount = lesson.subtitleSources?.length ?? 0;

                        return (
                          <div
                            key={lesson.lessonId}
                            className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-secondary/45"
                          >
                            <button
                              type="button"
                              aria-label={
                                lesson.isCompleted ? "Mark as incomplete" : "Mark as complete"
                              }
                              onClick={() => {
                                void markVideoComplete(
                                  lesson.lessonId,
                                  !lesson.isCompleted,
                                  course.id,
                                );
                              }}
                              className={cn(
                                "flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-border transition-colors hover:border-chart-4/60",
                                lesson.isCompleted &&
                                  "border-chart-4 bg-chart-4 text-primary-foreground",
                              )}
                            >
                              {lesson.isCompleted && <Check className="size-3" strokeWidth={3} />}
                            </button>

                            <div className="min-w-0 flex-1">
                              {editingLessonId === lesson.lessonId ? (
                                <input
                                  autoFocus
                                  value={editingLessonTitle}
                                  onChange={(e) => setEditingLessonTitle(e.target.value)}
                                  onBlur={() => void handleSaveLessonTitle(lesson.lessonId)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      void handleSaveLessonTitle(lesson.lessonId);
                                    }
                                    if (e.key === "Escape") setEditingLessonId(null);
                                  }}
                                  className="h-7 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none"
                                />
                              ) : (
                                <Link
                                  to="/learn/$courseId"
                                  params={{ courseId: course.id }}
                                  search={{ lesson: globalIdx }}
                                  className="block truncate text-sm font-medium text-foreground hover:text-primary"
                                >
                                  {lesson.title}
                                </Link>
                              )}
                            </div>

                            {captionCount > 0 && (
                              <div className="hidden items-center gap-1 sm:flex">
                                {lesson.subtitleSources.slice(0, 3).map((src) => (
                                  <Badge
                                    key={`${src.lang}-${src.fileName ?? ""}`}
                                    variant="secondary"
                                    className="px-1.5 py-0 text-[10px] uppercase"
                                  >
                                    {src.lang}
                                  </Badge>
                                ))}
                              </div>
                            )}

                            <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                              {formatTimestamp(secs)}
                            </span>

                            <div className="flex shrink-0 items-center gap-0.5">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                disabled={lessonIdx === 0}
                                onClick={() => moveLesson(mod.id, lessonIdx, -1)}
                                title="Move up"
                                aria-label="Move lesson up"
                                className="size-7 text-muted-foreground"
                              >
                                <ArrowUp className="size-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                disabled={lessonIdx === mod.lessons.length - 1}
                                onClick={() => moveLesson(mod.id, lessonIdx, 1)}
                                title="Move down"
                                aria-label="Move lesson down"
                                className="size-7 text-muted-foreground"
                              >
                                <ArrowDown className="size-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                disabled={uploadingCaptionId === lesson.lessonId}
                                onClick={() => triggerCaptionUpload(lesson)}
                                title="Upload subtitles (.srt / .vtt)"
                                aria-label="Upload subtitles"
                                className="size-7 text-muted-foreground"
                              >
                                {uploadingCaptionId === lesson.lessonId ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                  <Subtitles className="size-3.5" />
                                )}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                disabled
                                title="Voice dubbing unavailable"
                                aria-label="Voice dubbing unavailable"
                                className="size-7 cursor-not-allowed text-muted-foreground opacity-40"
                              >
                                <Mic className="size-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setEditingLessonId(lesson.lessonId);
                                  setEditingLessonTitle(lesson.title);
                                }}
                                title="Rename lesson"
                                aria-label="Rename lesson"
                                className="size-7 text-muted-foreground"
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  setConfirmDelete({
                                    kind: "lesson",
                                    id: lesson.lessonId,
                                    title: lesson.title,
                                  })
                                }
                                title="Delete lesson"
                                aria-label="Delete lesson"
                                className="size-7 text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          </div>
                        );
                      })
                    )}

                    {addLessonModuleId === mod.id && (
                      <div className="flex flex-wrap items-center gap-2 bg-secondary/35 px-4 py-3">
                        <Input
                          value={newLessonTitle}
                          onChange={(e) => setNewLessonTitle(e.target.value)}
                          placeholder="Lesson title…"
                          className="h-8 min-w-[180px] flex-1 bg-background text-xs"
                        />
                        <Input
                          value={newLessonUrl}
                          onChange={(e) => setNewLessonUrl(e.target.value)}
                          placeholder="Video path or URL (optional)"
                          className="h-8 min-w-[180px] flex-1 bg-background text-xs"
                        />
                        <Input
                          value={newLessonDuration}
                          onChange={(e) => setNewLessonDuration(e.target.value)}
                          placeholder="12:30"
                          className="h-8 w-24 bg-background font-mono text-xs"
                        />
                        <Button
                          type="button"
                          size="sm"
                          disabled={!newLessonTitle.trim() || savingLesson}
                          onClick={() => void handleAddLesson(mod.id, mod.lessons.length)}
                          className="h-8 rounded-md text-xs"
                        >
                          {savingLesson ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Check className="size-3.5" />
                          )}
                          Add
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => setAddLessonModuleId(null)}
                          aria-label="Cancel add lesson"
                          className="size-8 text-muted-foreground"
                        >
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>

      {/* Hidden subtitle upload input */}
      <input
        ref={captionInputRef}
        type="file"
        accept=".srt,.vtt,.ass,.sub"
        onChange={(e) => void handleCaptionFileChange(e)}
        className="hidden"
      />

      {/* Delete confirmation dialog */}
      <Dialog
        open={Boolean(confirmDelete)}
        onOpenChange={(open) => {
          if (!open && !deleting) setConfirmDelete(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Delete {confirmDelete?.kind === "module" ? "module" : "lesson"}?
            </DialogTitle>
            <DialogDescription>
              {confirmDelete?.kind === "module"
                ? `"${confirmDelete.title}" and all lessons inside it will be removed.`
                : `"${confirmDelete?.title}" will be removed from this module.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              disabled={deleting}
              onClick={() => setConfirmDelete(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={() => void handleConfirmDelete()}
            >
              {deleting ? <Loader2 className="size-4 animate-spin" /> : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditCourseModal
        open={editOpen}
        onOpenChange={setEditOpen}
        course={course}
        onSave={(updated) => setCourse(updated)}
      />

      <SyncPreviewModal
        open={syncOpen}
        onOpenChange={setSyncOpen}
        course={course}
        onSyncApplied={(updated) => {
          setCourse(updated);
          void loadCurriculum(true);
        }}
      />

      {smartCaptionData && (
        <SmartCaptionsModal
          open={Boolean(smartCaptionData)}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setSmartCaptionData(null);
          }}
          language={smartCaptionData.language}
          languageName={smartCaptionData.languageName}
          matches={smartCaptionData.matches}
          onBatchImported={() => {
            setSmartCaptionData(null);
            void loadCurriculum(true);
          }}
        />
      )}
    </div>
  );
}
