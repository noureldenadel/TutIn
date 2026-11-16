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
  Sparkles,
  Subtitles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { apiUrl } from "@/lib/api";
import { formatTrackDisplayLabel, getLanguageLabel, getOriginLabel } from "@/lib/languages";
import {
  TRANSCRIPT_UPDATED_EVENT,
  cancelAllTranscriptJobs,
  cancelTranscriptJob,
  deleteSubtitleTrack,
  setSubtitleTrackMaster,
  setSubtitleTrackSource,
  useTranscriptJobs,
} from "@/lib/transcript-ai";
import {
  TranscriptTranslateModal,
  type TranscriptModalLessonItem,
} from "@/components/modals/transcript-translate-modal";
import { AiJobTraceCard } from "@/components/shared/ai-job-trace";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { InstructorAvatar, normalizeInstructorSlug } from "@/components/layout/instructor-avatar";
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

interface LessonDragState {
  startIdx: number;
  targetValue: boolean;
}

/**
 * Shared pointer-drag range sweep across `[data-lesson-idx]` rows so lesson selection checkboxes
 * and completion progress circles share identical drag hit-testing and cleanup.
 */
function useLessonDragRange(
  dragState: LessonDragState | null,
  onRange: (min: number, max: number, targetValue: boolean) => void,
  onEnd: () => void,
) {
  const onRangeRef = useRef(onRange);
  onRangeRef.current = onRange;
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

  useEffect(() => {
    if (!dragState) return;

    const handlePointerMove = (e: PointerEvent) => {
      const row = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest<HTMLElement>("[data-lesson-idx]");
      if (!row) return;
      const hoverIdx = Number(row.dataset["lessonIdx"]);
      if (Number.isNaN(hoverIdx)) return;

      const min = Math.min(dragState.startIdx, hoverIdx);
      const max = Math.max(dragState.startIdx, hoverIdx);
      onRangeRef.current(min, max, dragState.targetValue);
    };

    const stopDrag = () => onEndRef.current();

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
    };
  }, [dragState]);
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

  // Subtitle file upload & AI transcript modal
  const captionInputRef = useRef<HTMLInputElement>(null);
  const pendingCaptionLessonRef = useRef<CourseLessonItem | null>(null);
  const [uploadingCaptionId, setUploadingCaptionId] = useState<string | null>(null);
  const [selectedLessonIds, setSelectedLessonIds] = useState<Set<string>>(new Set());
  const [selectDragState, setSelectDragState] = useState<{
    startIdx: number;
    targetValue: boolean;
  } | null>(null);
  const selectDragInitialRef = useRef<Set<string>>(new Set());
  const [doneDragState, setDoneDragState] = useState<{
    startIdx: number;
    targetValue: boolean;
  } | null>(null);
  const doneDragInitialRef = useRef<Map<string, boolean>>(new Map());
  const modulesRef = useRef(modules);
  modulesRef.current = modules;
  const [expandedJobVideoId, setExpandedJobVideoId] = useState<string | null>(null);
  const [aiModalState, setAiModalState] = useState<{
    open: boolean;
    mode: "transcribe" | "translate";
    lessons: TranscriptModalLessonItem[];
  }>({ open: false, mode: "transcribe", lessons: [] });

  const jobsMap = useTranscriptJobs();
  const courseActiveJobs = useMemo(
    () =>
      Object.values(jobsMap).filter(
        (j) => j.courseId === course.id && (j.status === "running" || j.status === "queued"),
      ),
    [jobsMap, course.id],
  );

  useEffect(() => {
    setCourse(initialCourse);
  }, [initialCourse]);

  const applyCurriculum = useCallback(
    (nextModules: CourseModuleSpec[], nextLessons: CourseLessonItem[]) => {
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
    },
    [],
  );

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

  useEffect(() => {
    const onTranscriptUpdated = () => {
      void loadCurriculum(true);
    };
    window.addEventListener(TRANSCRIPT_UPDATED_EVENT, onTranscriptUpdated);
    return () => window.removeEventListener(TRANSCRIPT_UPDATED_EVENT, onTranscriptUpdated);
  }, [loadCurriculum]);

  const allLessonsFlat = useMemo(() => modules.flatMap((m) => m.lessons), [modules]);

  useLessonDragRange(
    selectDragState,
    (min, max, targetValue) => {
      setSelectedLessonIds(() => {
        const next = new Set(selectDragInitialRef.current);
        for (let idx = min; idx <= max; idx += 1) {
          const item = allLessonsFlat[idx];
          if (!item) continue;
          if (targetValue) next.add(item.lessonId);
          else next.delete(item.lessonId);
        }
        return next;
      });
    },
    () => setSelectDragState(null),
  );

  useLessonDragRange(
    doneDragState,
    (min, max, targetValue) => {
      const initial = doneDragInitialRef.current;
      setModules((prev) => {
        let idx = 0;
        let changed = false;
        const next = prev.map((mod) => ({
          ...mod,
          lessons: mod.lessons.map((l) => {
            const currentIdx = idx++;
            const desired =
              currentIdx >= min && currentIdx <= max
                ? targetValue
                : (initial.get(l.lessonId) ?? l.isCompleted);
            if (desired !== l.isCompleted) {
              changed = true;
              return { ...l, isCompleted: desired };
            }
            return l;
          }),
        }));
        return changed ? next : prev;
      });
    },
    () => {
      const initial = doneDragInitialRef.current;
      const updates: Array<{ lessonId: string; done: boolean }> = [];
      for (const mod of modulesRef.current) {
        for (const l of mod.lessons) {
          const prevDone = initial.get(l.lessonId);
          if (prevDone !== undefined && prevDone !== l.isCompleted) {
            updates.push({ lessonId: l.lessonId, done: l.isCompleted });
          }
        }
      }
      setDoneDragState(null);
      if (updates.length > 0) {
        void Promise.all(
          updates.map(({ lessonId, done }) => markVideoComplete(lessonId, done, course.id)),
        ).catch(() => {
          toast.error("Failed to update lesson progress");
          void loadCurriculum(true);
        });
      }
    },
  );

  const toModalLesson = useCallback(
    (lesson: CourseLessonItem): TranscriptModalLessonItem => ({
      id: lesson.lessonId,
      title: lesson.title,
      subtitleSources: lesson.subtitleSources,
      availableLanguages: lesson.subtitleSources
        .map((s) => s.lang)
        .filter((l): l is string => typeof l === "string" && l.length > 0),
      hasTranscript: lesson.subtitleSources.length > 0,
    }),
    [],
  );

  const toggleLessonSelected = (lessonId: string) => {
    setSelectedLessonIds((prev) => {
      const next = new Set(prev);
      if (next.has(lessonId)) next.delete(lessonId);
      else next.add(lessonId);
      return next;
    });
  };

  const toggleAllSelected = () => {
    if (selectedLessonIds.size === allLessonsFlat.length && allLessonsFlat.length > 0) {
      setSelectedLessonIds(new Set());
    } else {
      setSelectedLessonIds(new Set(allLessonsFlat.map((l) => l.lessonId)));
    }
  };

  const handleSetTrackMaster = async (videoId: string, trackId: string) => {
    try {
      await setSubtitleTrackMaster(videoId, trackId, String(course.id));
      await loadCurriculum(true);
      toast.success("Set as master track");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to set master");
    }
  };

  const handleSetTrackSource = async (videoId: string, trackId: string) => {
    try {
      await setSubtitleTrackSource(videoId, trackId, String(course.id));
      await loadCurriculum(true);
      toast.success("Set as source track");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to set source");
    }
  };

  const handleDeleteTrack = async (videoId: string, trackId: string) => {
    try {
      await deleteSubtitleTrack(videoId, trackId);
      await loadCurriculum(true);
      toast.success("Subtitle track removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove track");
    }
  };

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
    <div
      className={cn(
        "mx-auto max-w-5xl px-4 py-6 sm:px-6",
        (selectDragState || doneDragState) && "select-none",
      )}
    >
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
              <Link
                to="/instructors"
                search={{ instructor: normalizeInstructorSlug(course.instructor) }}
                className="inline-flex items-center gap-1.5 rounded-md transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                title={`View ${course.instructor}`}
              >
                <InstructorAvatar name={course.instructor} course={course} size="sm" />
                <span>{course.instructor}</span>
              </Link>
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
            {addingModule ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Add module
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {courseActiveJobs.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary-soft/40 px-2.5 py-1 text-xs">
              <Loader2 className="size-3.5 animate-spin text-primary" />
              <span className="font-medium text-foreground">
                {courseActiveJobs.length} {courseActiveJobs.length === 1 ? "job" : "jobs"} active
              </span>
              <button
                type="button"
                onClick={() => cancelAllTranscriptJobs(course.id)}
                className="rounded px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          )}

          {allLessonsFlat.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={toggleAllSelected}
              className="rounded-md text-xs text-muted-foreground"
            >
              {selectedLessonIds.size > 0
                ? `${selectedLessonIds.size} selected · Clear`
                : "Select all"}
            </Button>
          )}

          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={allLessonsFlat.length === 0}
            onClick={() => {
              const targetLessons =
                selectedLessonIds.size > 0
                  ? allLessonsFlat.filter((l) => selectedLessonIds.has(l.lessonId))
                  : allLessonsFlat;
              setAiModalState({
                open: true,
                mode: "transcribe",
                lessons: targetLessons.map(toModalLesson),
              });
            }}
            className="rounded-md"
          >
            <Sparkles className="size-4 text-primary" />
            <span>
              {selectedLessonIds.size > 0
                ? `Subtitles / AI (${selectedLessonIds.size})`
                : "Subtitles / AI"}
            </span>
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
                        const lessonJob = jobsMap[lesson.lessonId];
                        const isJobActive =
                          lessonJob &&
                          (lessonJob.status === "running" || lessonJob.status === "queued");
                        const isSelected = selectedLessonIds.has(lesson.lessonId);
                        const isJobExpanded =
                          Boolean(isJobActive) && expandedJobVideoId === lesson.lessonId;

                        return (
                          <div
                            key={lesson.lessonId}
                            data-lesson-idx={globalIdx}
                            className={cn("transition-colors", isSelected && "bg-primary-soft/25")}
                          >
                            <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/45">
                              <button
                                type="button"
                                role="checkbox"
                                aria-checked={isSelected}
                                aria-label={`Select ${lesson.title}`}
                                title="Click or drag to select lessons"
                                onPointerDown={(e) => {
                                  if (e.button !== 0) return;
                                  e.preventDefault();
                                  selectDragInitialRef.current = new Set(selectedLessonIds);
                                  const targetValue = !isSelected;
                                  setSelectDragState({ startIdx: globalIdx, targetValue });
                                  setSelectedLessonIds((prev) => {
                                    const next = new Set(prev);
                                    if (targetValue) next.add(lesson.lessonId);
                                    else next.delete(lesson.lessonId);
                                    return next;
                                  });
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === " " || e.key === "Enter") {
                                    e.preventDefault();
                                    toggleLessonSelected(lesson.lessonId);
                                  }
                                }}
                                className={cn(
                                  "flex size-[18px] shrink-0 touch-none items-center justify-center rounded-[5px] border-2 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                  isSelected
                                    ? "border-primary bg-primary text-primary-foreground shadow-xs"
                                    : "border-border/80 bg-background/60 hover:border-primary/65 hover:bg-primary/5",
                                )}
                              >
                                <Check
                                  className={cn(
                                    "size-3 transition-transform duration-150",
                                    isSelected ? "scale-100 opacity-100" : "scale-50 opacity-0",
                                  )}
                                  strokeWidth={3}
                                />
                              </button>

                              <button
                                type="button"
                                aria-label={
                                  lesson.isCompleted ? "Mark as incomplete" : "Mark as complete"
                                }
                                title="Click or drag to mark lessons"
                                onPointerDown={(e) => {
                                  if (e.button !== 0) return;
                                  e.preventDefault();
                                  const initialMap = new Map<string, boolean>();
                                  for (const l of allLessonsFlat) {
                                    initialMap.set(l.lessonId, l.isCompleted);
                                  }
                                  doneDragInitialRef.current = initialMap;
                                  const targetValue = !lesson.isCompleted;
                                  setDoneDragState({ startIdx: globalIdx, targetValue });
                                  setModules((prev) =>
                                    prev.map((mod) => ({
                                      ...mod,
                                      lessons: mod.lessons.map((l) =>
                                        l.lessonId === lesson.lessonId
                                          ? { ...l, isCompleted: targetValue }
                                          : l,
                                      ),
                                    })),
                                  );
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === " " || e.key === "Enter") {
                                    e.preventDefault();
                                    void markVideoComplete(
                                      lesson.lessonId,
                                      !lesson.isCompleted,
                                      course.id,
                                    );
                                  }
                                }}
                                className={cn(
                                  "flex size-5 shrink-0 touch-none items-center justify-center rounded-full border-2 border-border transition-colors hover:border-chart-4/60",
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

                              {isJobActive && lessonJob && (
                                <div className="ai-shimmer-row t-resize flex shrink-0 items-center gap-1 rounded-md border border-primary/25 bg-primary-soft/40 pl-2 pr-1 py-0.5 text-[11px]">
                                  <button
                                    type="button"
                                    aria-expanded={isJobExpanded}
                                    onClick={() =>
                                      setExpandedJobVideoId((cur) =>
                                        cur === lesson.lessonId ? null : lesson.lessonId,
                                      )
                                    }
                                    title={isJobExpanded ? "Hide AI progress" : "Show AI progress"}
                                    className="flex items-center gap-1.5 rounded text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                  >
                                    <span className="ai-shimmer-text max-w-[120px] truncate font-medium">
                                      {getLanguageLabel(lessonJob.targetLanguage)} · AI
                                    </span>
                                    <span className="font-mono font-semibold text-primary tabular-nums">
                                      {lessonJob.status === "queued"
                                        ? "Queued"
                                        : `${lessonJob.progress}%`}
                                    </span>
                                    <ChevronDown
                                      className={cn(
                                        "size-3 text-primary/70 transition-transform duration-200",
                                        isJobExpanded && "rotate-180",
                                      )}
                                    />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => cancelTranscriptJob(lesson.lessonId)}
                                    title="Cancel task"
                                    aria-label="Cancel task"
                                    className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-destructive"
                                  >
                                    <X className="size-3" />
                                  </button>
                                </div>
                              )}

                              {captionCount > 0 && (
                                <div className="hidden items-center gap-1 sm:flex">
                                  {lesson.subtitleSources.slice(0, 4).map((src) => {
                                    const originShort = getOriginLabel(src.origin, src.version);
                                    const effectiveSource =
                                      lesson.subtitleSources.find((s) => s.is_ai_source) ??
                                      lesson.subtitleSources.find((s) => s.is_master) ??
                                      lesson.subtitleSources[0];
                                    const isSource = effectiveSource === src;
                                    return (
                                      <Badge
                                        key={src.id || `${src.lang}-${src.fileName ?? ""}`}
                                        variant="secondary"
                                        title={`${formatTrackDisplayLabel(src)}${isSource ? " (Source)" : ""}`}
                                        className={cn(
                                          "px-1.5 py-0 text-[10px]",
                                          lesson.subtitleSources.length > 1 &&
                                            isSource &&
                                            "ring-1 ring-primary/40",
                                        )}
                                      >
                                        <span className="uppercase">{src.lang}</span>
                                        <span className="mx-0.5 opacity-60">·</span>
                                        <span className="font-normal opacity-85">
                                          {originShort}
                                        </span>
                                      </Badge>
                                    );
                                  })}
                                  {captionCount > 4 && (
                                    <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                                      +{captionCount - 4}
                                    </Badge>
                                  )}
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

                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      disabled={uploadingCaptionId === lesson.lessonId}
                                      title="Subtitles & AI"
                                      aria-label="Subtitles & AI"
                                      className={cn(
                                        "size-7 text-muted-foreground",
                                        captionCount > 0 && "text-primary",
                                      )}
                                    >
                                      {uploadingCaptionId === lesson.lessonId ? (
                                        <Loader2 className="size-3.5 animate-spin" />
                                      ) : (
                                        <Subtitles className="size-3.5" />
                                      )}
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent
                                    align="end"
                                    className="w-64 rounded-lg p-1.5"
                                  >
                                    {lesson.subtitleSources.length > 0 && (
                                      <>
                                        <p className="px-2 py-1 text-[11px] font-semibold text-muted-foreground">
                                          Tracks
                                        </p>
                                        {lesson.subtitleSources.map((src) => {
                                          const trackId =
                                            src.id || `${src.lang}:${src.origin || "uploaded"}`;
                                          const effectiveSource =
                                            lesson.subtitleSources.find((s) => s.is_ai_source) ??
                                            lesson.subtitleSources.find((s) => s.is_master) ??
                                            lesson.subtitleSources[0];
                                          const isSource = effectiveSource === src;
                                          return (
                                            <div
                                              key={trackId}
                                              className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-secondary/60"
                                            >
                                              <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5 truncate font-medium text-foreground">
                                                  <span className="truncate">
                                                    {formatTrackDisplayLabel(src)}
                                                  </span>
                                                </div>
                                              </div>
                                              <div className="flex shrink-0 items-center gap-1">
                                                {src.is_master ? (
                                                  <span className="rounded-sm bg-chart-4/15 px-1.5 py-0.5 text-[10px] font-semibold text-chart-4">
                                                    Master
                                                  </span>
                                                ) : (
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      void handleSetTrackMaster(
                                                        lesson.lessonId,
                                                        trackId,
                                                      )
                                                    }
                                                    title="Set as master for this language"
                                                    className="rounded-sm border border-dashed border-muted-foreground/35 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/70 transition-colors hover:border-chart-4/60 hover:bg-chart-4/10 hover:text-chart-4"
                                                  >
                                                    Master
                                                  </button>
                                                )}
                                                {isSource ? (
                                                  <span className="rounded-sm bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                                                    Source
                                                  </span>
                                                ) : (
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      void handleSetTrackSource(
                                                        lesson.lessonId,
                                                        trackId,
                                                      )
                                                    }
                                                    title="Set as translation source"
                                                    className="rounded-sm border border-dashed border-muted-foreground/35 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/70 transition-colors hover:border-primary/60 hover:bg-primary/10 hover:text-primary"
                                                  >
                                                    Source
                                                  </button>
                                                )}
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    void handleDeleteTrack(lesson.lessonId, trackId)
                                                  }
                                                  title="Delete track"
                                                  aria-label="Delete track"
                                                  className="rounded p-1 text-muted-foreground/75 transition-colors hover:bg-destructive/15 hover:text-destructive"
                                                >
                                                  <Trash2 className="size-3.5" />
                                                </button>
                                              </div>
                                            </div>
                                          );
                                        })}
                                        <DropdownMenuSeparator />
                                      </>
                                    )}
                                    {isJobActive && lessonJob && (
                                      <>
                                        <AiJobTraceCard job={lessonJob} compact className="mb-1" />
                                        <DropdownMenuSeparator />
                                      </>
                                    )}
                                    <DropdownMenuItem
                                      className="rounded-md"
                                      onClick={() =>
                                        setAiModalState({
                                          open: true,
                                          mode:
                                            lesson.subtitleSources.length > 0
                                              ? "translate"
                                              : "transcribe",
                                          lessons: [toModalLesson(lesson)],
                                        })
                                      }
                                    >
                                      <Sparkles className="size-3.5 text-primary" />
                                      <span>Generate / translate AI…</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      className="rounded-md"
                                      onClick={() => triggerCaptionUpload(lesson)}
                                    >
                                      <Upload className="size-3.5" />
                                      <span>Upload file (.srt / .vtt)…</span>
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>

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
                            {isJobExpanded && lessonJob && (
                              <div className="px-4 pb-3 pt-0.5">
                                <AiJobTraceCard job={lessonJob} defaultExpanded />
                              </div>
                            )}
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

      <TranscriptTranslateModal
        isOpen={aiModalState.open}
        onClose={() => setAiModalState((prev) => ({ ...prev, open: false }))}
        courseId={course.id}
        courseLanguage={course.language || "en"}
        lessons={aiModalState.lessons}
        defaultMode={aiModalState.mode}
        onCourseLanguageChanged={(nextLang) => {
          setCourse((prev) => ({ ...prev, language: nextLang }));
        }}
      />
    </div>
  );
}
