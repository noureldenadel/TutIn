import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  BookOpen,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Download,
  Gauge,
  LayoutGrid,
  ListChecks,
  Maximize,
  MessageSquareText,
  Mic,
  Minimize,
  Minus,
  MoreVertical,
  NotebookPen,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  PictureInPicture,
  Play,
  Plus,
  Settings,
  Sparkles,
  Subtitles,
  Trash2,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import mpegts from "mpegts.js";

import { ImageLightboxModal } from "@/components/notes/image-lightbox-modal";
import { noteHtmlToMarkdown } from "@/components/notes/note-markdown";
import { RichNoteHtmlContent, RichNoteSurface } from "@/components/notes/rich-note-surface";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  fetchCourseCurriculum,
  getLessonDurationSeconds,
  markVideoComplete,
  subscribeCourseCurriculumChanged,
  updateCourseVideo,
  updateVideoProgress,
  type CourseLessonItem,
  type CourseModuleSpec,
} from "@/lib/course-lessons";
import { apiRequest, apiUrl } from "@/lib/api";
import {
  formatClockShort as fmtTime,
  formatDurationLabel,
  formatTimestamp as fmt,
  parseTimestampToSeconds as parseTs,
} from "@/lib/format";
import {
  createNoteOnServer,
  deleteCourseNoteById,
  extractImagesFromHtml,
  fetchCourseNotes,
  getCourseNotes,
  hasMeaningfulHtmlContent,
  stripHtmlToText,
  subscribeCourseNotesChanged,
  updateCourseNoteContent,
  type NoteItem,
} from "@/lib/course-notes";
import { cn } from "@/lib/utils";
import {
  calculateCourseCompletionPercentage,
  generateId,
  videoStreamUrl,
  type Course,
} from "@/lib/courses";
import { InstructorAvatar, normalizeInstructorSlug } from "@/components/layout/instructor-avatar";
import {
  SmartCaptionsModal,
  type SmartCaptionMatch,
} from "@/components/modals/smart-captions-modal";
import {
  arePlayerShortcutsEnabled,
  readAppSettings,
  SETTINGS_CHANGED_EVENT,
} from "@/lib/app-settings";
import { formatTrackDisplayLabel, getLanguageLabel, getLanguageName } from "@/lib/languages";
import {
  TRANSCRIPT_UPDATED_EVENT,
  cancelTranscriptJob,
  deleteSubtitleTrack,
  setSubtitleTrackMaster,
  setSubtitleTrackSource,
  useVideoTranscriptJob,
} from "@/lib/transcript-ai";
import { TranscriptTranslateModal } from "@/components/modals/transcript-translate-modal";
import type { SubtitleSource } from "@/lib/course-lessons";
import {
  getHistoryThresholdSeconds,
  parseYoutubeIframeMessage,
  sendYoutubeListeningHandshake,
  trackExternalCourseOpen,
} from "@/lib/watch-history";

interface StudySessionState {
  videoId: string;
  startedAt: string;
  lastResumedAt: number | null;
  accumulatedSecs: number;
  startPosition: number;
  latestPosition: number;
  latestDuration: number;
  historyQualified: boolean;
}

function pauseActiveSessionSlice(sess: StudySessionState | null): void {
  if (!sess || sess.lastResumedAt === null) return;
  sess.accumulatedSecs += Math.max(0, (Date.now() - sess.lastResumedAt) / 1000);
  sess.lastResumedAt = null;
}

function getActiveSessionSeconds(sess: StudySessionState | null): number {
  if (!sess) return 0;
  const live =
    sess.lastResumedAt !== null ? Math.max(0, (Date.now() - sess.lastResumedAt) / 1000) : 0;
  return sess.accumulatedSecs + live;
}

interface TranscriptCue {
  start: number;
  end: number;
  text: string;
}

interface TranscriptTrack {
  id: string;
  lang: string;
  label: string;
  short: string;
  rtl: boolean;
  origin?: "uploaded" | "generated" | string | undefined;
  version?: number | undefined;
  fileName?: string | undefined;
  is_master?: boolean | undefined;
  is_ai_source?: boolean | undefined;
}

const RTL_LANG_PREFIXES = ["ar", "he", "fa", "ur"];

function isRtlLanguage(lang: string): boolean {
  const lower = lang.toLowerCase();
  return RTL_LANG_PREFIXES.some((p) => lower === p || lower.startsWith(`${p}-`));
}

/** Resolve a track ID, `'source'`, or bare language code to an exact track ID, preferring Master. */
function resolveBestTrackId(
  tracks: TranscriptTrack[],
  candidate: string | null | undefined,
): string | null {
  if (!candidate || candidate === "off" || tracks.length === 0) return null;
  if (candidate === "source") {
    return (
      tracks.find((t) => t.is_ai_source)?.id ??
      tracks.find((t) => t.is_master)?.id ??
      tracks[0]?.id ??
      null
    );
  }
  const exact = tracks.find((t) => t.id === candidate);
  if (exact) return exact.id;
  const norm = candidate.toLowerCase();
  const byMaster = tracks.find((t) => t.lang.toLowerCase() === norm && t.is_master);
  if (byMaster) return byMaster.id;
  return tracks.find((t) => t.lang.toLowerCase() === norm)?.id ?? null;
}

function extractYoutubeVideoId(url?: string | null): string | null {
  if (!url) return null;
  const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{6,})/);
  if (watchMatch?.[1]) return watchMatch[1];
  const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/);
  if (shortMatch?.[1]) return shortMatch[1];
  const embedMatch = url.match(/\/embed\/([a-zA-Z0-9_-]{6,})/);
  return embedMatch?.[1] ?? null;
}

function extractGoogleDriveFileId(url?: string | null): string | null {
  if (!url || !url.includes("drive.google.com")) return null;
  const dMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (dMatch?.[1]) return dMatch[1];
  const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return idMatch?.[1] ?? null;
}

function normalizeTranscriptChunks(raw: unknown): TranscriptCue[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { chunks?: unknown[] }).chunks)
      ? (raw as { chunks: unknown[] }).chunks
      : [];

  const cues: TranscriptCue[] = [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i] as {
      text?: string;
      timestamp?: [number | null, number | null];
      start?: number;
      end?: number;
    };
    const text = (item.text ?? "").trim();
    if (!text) continue;
    const rawStart = Array.isArray(item.timestamp) ? item.timestamp[0] : item.start;
    const rawEnd = Array.isArray(item.timestamp) ? item.timestamp[1] : item.end;
    const start =
      typeof rawStart === "number" && Number.isFinite(rawStart) ? Math.max(0, rawStart) : 0;
    const end =
      typeof rawEnd === "number" && Number.isFinite(rawEnd) && rawEnd > start ? rawEnd : start + 5;
    cues.push({ start, end, text });
  }
  return cues;
}

function findActiveCueIndex(cues: TranscriptCue[], t: number, allowGapBridge: boolean): number {
  // Reverse half-open [start, end) match gives precedence to newly starting cues on shared boundaries
  for (let i = cues.length - 1; i >= 0; i--) {
    const c = cues[i]!;
    const isLast = i === cues.length - 1;
    if (t >= c.start && (t < c.end || (isLast && t <= c.end))) {
      return i;
    }
  }
  if (allowGapBridge) {
    for (let i = 0; i < cues.length - 1; i++) {
      const curr = cues[i]!;
      const next = cues[i + 1]!;
      if (t > curr.end && t < next.start && next.start - curr.end <= 0.35) {
        return i;
      }
    }
  }
  return -1;
}

type Tab = "playlist" | "notes" | "transcript";

export function CoursePlayer({
  course,
  initialLessonIdx,
  initialVideoId,
  initialTime,
  initialTab,
}: {
  course: Course;
  initialLessonIdx?: number | undefined;
  initialVideoId?: string | undefined;
  initialTime?: number | undefined;
  initialTab?: Tab | undefined;
}) {
  const [courseModules, setCourseModules] = useState<CourseModuleSpec[]>([]);
  const [allLessons, setAllLessons] = useState<CourseLessonItem[]>([]);
  const [curriculumLoading, setCurriculumLoading] = useState(true);
  const initialSelectionDoneRef = useRef(false);
  const consumedInitialTimeRef = useRef(false);
  const lastNavTargetRef = useRef("");
  const autoCompletedIdsRef = useRef<Set<string>>(new Set());

  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const mpegtsPlayerRef = useRef<ReturnType<typeof mpegts.createPlayer> | null>(null);
  const pendingSeekRef = useRef<number | null>(
    typeof initialTime === "number" && Number.isFinite(initialTime) && initialTime >= 0
      ? initialTime
      : null,
  );
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(
    typeof initialTime === "number" && Number.isFinite(initialTime) && initialTime >= 0
      ? initialTime
      : 0,
  );
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [autoplay, setAutoplay] = useState(true);
  const [remainingTime, setRemainingTime] = useState(false);
  const [subtitleTrack, setSubtitleTrack] = useState<string>("off");
  const [transcriptLang, setTranscriptLang] = useState<string | null>(null);
  const [availableTracks, setAvailableTracks] = useState<TranscriptTrack[]>([]);
  const pendingTrackSelectionRef = useRef<string | null>(null);
  const dubAudioRef = useRef<HTMLAudioElement>(null);
  const lastDubLangRef = useRef<string>("original");
  const volumeRef = useRef(volume);
  const mutedRef = useRef(muted);
  const speedRef = useRef(speed);
  volumeRef.current = volume;
  mutedRef.current = muted;
  speedRef.current = speed;
  const [dubLanguages, setDubLanguages] = useState<string[]>([]);
  const [selectedDubLang, setSelectedDubLang] = useState<string>("original");
  const [transcriptCues, setTranscriptCues] = useState<TranscriptCue[]>([]);
  const [cuesLoading, setCuesLoading] = useState(false);
  const [savedSummary, setSavedSummary] = useState("");
  const [transcriptRefreshTick, setTranscriptRefreshTick] = useState(0);
  const [isPiP, setIsPiP] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [tracksMenuOpen, setTracksMenuOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [controlsActive, setControlsActive] = useState(false);
  const anyPlayerMenuOpen = tracksMenuOpen || settingsMenuOpen;
  const anyMenuOpenRef = useRef(false);
  anyMenuOpenRef.current = anyPlayerMenuOpen;
  const isPointerInsidePlayerRef = useRef(false);
  const isPointerOverControlsRef = useRef(false);
  const controlsHideTimerRef = useRef<number | null>(null);
  const lastMenuDismissAtRef = useRef(0);
  const seekGuardRef = useRef<{ floorTime: number; expiresAt: number } | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [tab, setTab] = useState<Tab>(initialTab ?? "playlist");
  const [active, setActive] = useState(
    typeof initialLessonIdx === "number" &&
      Number.isFinite(initialLessonIdx) &&
      initialLessonIdx >= 0
      ? Math.floor(initialLessonIdx)
      : 0,
  );
  const [done, setDone] = useState<boolean[]>([]);

  // Load real curriculum from SQLite and subscribe to live updates
  useEffect(() => {
    initialSelectionDoneRef.current = false;
    consumedInitialTimeRef.current = false;
    setCurriculumLoading(true);

    let cancelled = false;
    const applyLoaded = (mods: CourseModuleSpec[], lessons: CourseLessonItem[]) => {
      if (cancelled) return;
      setCourseModules(mods);
      setAllLessons(lessons);
      setDone(lessons.map((l) => l.isCompleted));
      setCurriculumLoading(false);
      void fetchCourseNotes(course.id, lessons);

      if (!initialSelectionDoneRef.current && lessons.length > 0) {
        initialSelectionDoneRef.current = true;
        const matchedVideoIdx = initialVideoId
          ? lessons.findIndex((l) => l.lessonId === initialVideoId)
          : -1;
        if (matchedVideoIdx >= 0) {
          setActive(matchedVideoIdx);
        } else if (typeof initialLessonIdx === "number" && Number.isFinite(initialLessonIdx)) {
          setActive(Math.max(0, Math.min(lessons.length - 1, Math.floor(initialLessonIdx))));
        } else {
          const resumeIdx = lessons.findIndex((l) => !l.isCompleted);
          setActive(resumeIdx >= 0 ? resumeIdx : 0);
        }
      }
    };

    void fetchCourseCurriculum(course.id)
      .then((data) => applyLoaded(data.modules, data.lessons))
      .catch((err) => {
        console.error("Failed to fetch curriculum:", err);
        if (!cancelled) setCurriculumLoading(false);
      });

    const unsub = subscribeCourseCurriculumChanged(course.id, (data) => {
      applyLoaded(data.modules, data.lessons);
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [course.id, initialLessonIdx, initialVideoId]);

  useEffect(() => {
    if (allLessons.length === 0) return;
    const navKey = `${course.id}:${initialVideoId ?? ""}:${initialLessonIdx ?? ""}:${initialTime ?? ""}:${initialTab ?? ""}`;
    if (lastNavTargetRef.current === navKey) return;
    lastNavTargetRef.current = navKey;

    const matchedVideoIdx = initialVideoId
      ? allLessons.findIndex((l) => l.lessonId === initialVideoId)
      : -1;
    if (matchedVideoIdx >= 0) {
      setActive(matchedVideoIdx);
    } else if (typeof initialLessonIdx === "number" && Number.isFinite(initialLessonIdx)) {
      const next = Math.max(0, Math.min(allLessons.length - 1, Math.floor(initialLessonIdx)));
      setActive(next);
    }
    if (initialTab) {
      setTab(initialTab);
      setPanelOpen(true);
    }
    if (typeof initialTime === "number" && Number.isFinite(initialTime) && initialTime >= 0) {
      pendingSeekRef.current = initialTime;
      const v = videoRef.current;
      if (v && v.readyState >= 1) {
        const clamped = Math.max(0, Math.min(initialTime, v.duration || initialTime));
        v.currentTime = clamped;
        setTime(clamped);
        pendingSeekRef.current = null;
      } else {
        setTime(initialTime);
      }
    }
  }, [course.id, initialLessonIdx, initialVideoId, initialTime, initialTab, allLessons]);

  const currentLesson = allLessons[active] ?? allLessons[0] ?? null;
  const lessonTitles = useMemo(() => allLessons.map((l) => l.title), [allLessons]);
  const effectiveDuration =
    duration || (currentLesson ? getLessonDurationSeconds(currentLesson) : 0);

  const youtubeId = useMemo(
    () => currentLesson?.youtubeId || extractYoutubeVideoId(currentLesson?.url) || null,
    [currentLesson?.youtubeId, currentLesson?.url],
  );
  const driveFileId = useMemo(
    () => extractGoogleDriveFileId(currentLesson?.url),
    [currentLesson?.url],
  );
  const localVideoUrl = useMemo(
    () => (currentLesson?.filePath ? videoStreamUrl(currentLesson.filePath) : ""),
    [currentLesson?.filePath],
  );
  const externalDirectUrl =
    !youtubeId && !driveFileId && !localVideoUrl && currentLesson?.url ? currentLesson.url : "";
  const isPlayableExternalVideo =
    Boolean(externalDirectUrl) && /\.(mp4|webm|ogg|mov|m4v|ts)(\?|$)/i.test(externalDirectUrl);
  const resolvedVideoSrc = localVideoUrl || (isPlayableExternalVideo ? externalDirectUrl : "");
  const isEmbeddedPlayer = Boolean(youtubeId || driveFileId);
  const isExternalResourceOnly = Boolean(externalDirectUrl && !isPlayableExternalVideo);
  const isTsVideo = useMemo(() => {
    const rawPath = currentLesson?.filePath || resolvedVideoSrc;
    if (!rawPath) return false;
    const lower = rawPath.toLowerCase();
    return lower.endsWith(".ts") || lower.includes(".ts?");
  }, [currentLesson?.filePath, resolvedVideoSrc]);

  // Attach mpegts.js MSE player for MPEG-TS (.ts) streams
  useEffect(() => {
    if (mpegtsPlayerRef.current) {
      try {
        mpegtsPlayerRef.current.unload();
        mpegtsPlayerRef.current.detachMediaElement();
        mpegtsPlayerRef.current.destroy();
      } catch (err) {
        console.error("Failed to cleanup mpegts player:", err);
      }
      mpegtsPlayerRef.current = null;
    }

    if (isTsVideo && resolvedVideoSrc && videoRef.current && mpegts.isSupported()) {
      if (mpegts.LoggingControl) {
        mpegts.LoggingControl.applyConfig({
          enableAll: false,
          enableDebug: false,
          enableVerbose: false,
          enableInfo: false,
          enableWarn: false,
        });
      }
      const player = mpegts.createPlayer(
        { type: "mpegts", url: resolvedVideoSrc, isLive: false },
        { enableWorker: true, lazyLoadMaxDuration: 180, seekType: "range" },
      );
      player.attachMediaElement(videoRef.current);
      player.load();
      mpegtsPlayerRef.current = player;
    }

    return () => {
      if (mpegtsPlayerRef.current) {
        try {
          mpegtsPlayerRef.current.unload();
          mpegtsPlayerRef.current.detachMediaElement();
          mpegtsPlayerRef.current.destroy();
        } catch {
          // Ignore teardown noise
        }
        mpegtsPlayerRef.current = null;
      }
    };
  }, [isTsVideo, resolvedVideoSrc, currentLesson?.lessonId]);

  // Watch progress & study session tracking refs
  const progressSaveTimerRef = useRef<number>(Date.now());
  const studySessionRef = useRef<StudySessionState | null>(null);
  const ytIframeRef = useRef<HTMLIFrameElement | null>(null);
  const ytStartCacheRef = useRef<{ lessonId: string; startSec: number }>({
    lessonId: "",
    startSec: 0,
  });

  if (currentLesson && ytStartCacheRef.current.lessonId !== currentLesson.lessonId) {
    const appSettings = readAppSettings();
    let startSec = 0;
    if (
      !consumedInitialTimeRef.current &&
      typeof initialTime === "number" &&
      Number.isFinite(initialTime) &&
      initialTime >= 0
    ) {
      startSec = Math.floor(initialTime);
    } else if (
      appSettings.resumePlayback &&
      currentLesson.lastWatchedPosition > 0 &&
      (!currentLesson.durationSec ||
        currentLesson.lastWatchedPosition < currentLesson.durationSec - 3)
    ) {
      startSec = Math.floor(currentLesson.lastWatchedPosition);
    }
    ytStartCacheRef.current = {
      lessonId: currentLesson.lessonId,
      startSec: Math.max(0, startSec),
    };
  }

  const recordPlaybackProgress = useCallback(
    (
      pos: number,
      dur: number,
      options: {
        forceSave?: boolean;
        recordPosition?: boolean;
        keepalive?: boolean;
      } = {},
    ) => {
      const sess = studySessionRef.current;
      if (!sess) return;
      sess.latestPosition = pos;
      if (dur > 0) sess.latestDuration = dur;

      const effectiveDur = dur > 0 ? dur : sess.latestDuration;
      const elapsed = getActiveSessionSeconds(sess);
      const justQualified =
        !sess.historyQualified && elapsed >= getHistoryThresholdSeconds(effectiveDur);
      if (justQualified) {
        sess.historyQualified = true;
      }

      const now = Date.now();
      const canSavePosition = options.recordPosition ?? pendingSeekRef.current === null;
      if (
        justQualified ||
        options.forceSave ||
        (canSavePosition && now - progressSaveTimerRef.current >= 5000)
      ) {
        progressSaveTimerRef.current = now;
        void updateVideoProgress(sess.videoId, pos, effectiveDur, course.id, {
          recordHistory: sess.historyQualified,
          recordPosition: canSavePosition,
          keepalive: options.keepalive ?? false,
        });
      }
    },
    [course.id],
  );

  const flushStudySession = useCallback(
    (keepalive = false) => {
      const sess = studySessionRef.current;
      if (!sess) return;
      pauseActiveSessionSlice(sess);

      const secs = Math.round(sess.accumulatedSecs);
      const vid = sess.videoId;
      const endPos = sess.latestPosition;
      const dur = sess.latestDuration;
      const qualified =
        sess.historyQualified || sess.accumulatedSecs >= getHistoryThresholdSeconds(dur);
      const shouldSavePos = endPos > 0 && pendingSeekRef.current === null;
      studySessionRef.current = null;

      if (vid && (qualified || shouldSavePos)) {
        void updateVideoProgress(vid, endPos, dur, course.id, {
          recordHistory: qualified,
          recordPosition: shouldSavePos,
          keepalive,
        });
      }
      if (vid && secs >= 5) {
        void apiRequest("/api/analytics/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          keepalive,
          body: JSON.stringify({
            id: generateId("sess"),
            videoId: vid,
            courseId: course.id,
            startedAt: sess.startedAt,
            endedAt: new Date().toISOString(),
            durationSeconds: secs,
            startPosition: Math.round(sess.startPosition),
            endPosition: Math.round(endPos),
          }),
        }).catch(() => {});
      }
    },
    [course.id],
  );

  // Reset per-lesson playback & resume state when lesson changes
  useEffect(() => {
    const vid = currentLesson?.lessonId;
    if (!vid) return;

    setDuration(currentLesson.durationSec || 0);
    setPlaying(false);
    progressSaveTimerRef.current = Date.now();

    const appSettings = readAppSettings();
    if (
      !consumedInitialTimeRef.current &&
      typeof initialTime === "number" &&
      Number.isFinite(initialTime) &&
      initialTime >= 0
    ) {
      consumedInitialTimeRef.current = true;
      pendingSeekRef.current = initialTime;
      setTime(initialTime);
    } else if (
      appSettings.resumePlayback &&
      currentLesson.lastWatchedPosition > 0 &&
      (!currentLesson.durationSec ||
        currentLesson.lastWatchedPosition < currentLesson.durationSec - 3)
    ) {
      pendingSeekRef.current = currentLesson.lastWatchedPosition;
      setTime(currentLesson.lastWatchedPosition);
    } else {
      pendingSeekRef.current = null;
      setTime(0);
    }

    studySessionRef.current = {
      videoId: vid,
      startedAt: new Date().toISOString(),
      lastResumedAt: null,
      accumulatedSecs: 0,
      startPosition: pendingSeekRef.current ?? 0,
      latestPosition: pendingSeekRef.current ?? 0,
      latestDuration: currentLesson.durationSec || 0,
      historyQualified: false,
    };

    return () => {
      flushStudySession();
    };
  }, [currentLesson?.lessonId, flushStudySession, initialTime]);

  useEffect(() => {
    const onTranscriptUpdated = (e: Event) => {
      const detail = (e as CustomEvent<{ videoId?: string; targetLang?: string; trackId?: string }>)
        .detail;
      if (!detail?.videoId || detail.videoId === currentLesson?.lessonId) {
        const nextSelection = detail?.trackId || detail?.targetLang;
        if (nextSelection) {
          pendingTrackSelectionRef.current = nextSelection;
          setTranscriptLang(nextSelection);
          setSubtitleTrack(nextSelection);
        }
        setTranscriptRefreshTick((n) => n + 1);
      }
    };
    window.addEventListener(TRANSCRIPT_UPDATED_EVENT, onTranscriptUpdated);
    return () => window.removeEventListener(TRANSCRIPT_UPDATED_EVENT, onTranscriptUpdated);
  }, [currentLesson?.lessonId]);

  // Fetch available subtitle/transcript tracks & saved summary for active lesson
  useEffect(() => {
    const vid = currentLesson?.lessonId;
    if (!vid) {
      setAvailableTracks([]);
      setTranscriptLang(null);
      setSubtitleTrack("off");
      setTranscriptCues([]);
      setSavedSummary("");
      return;
    }

    let cancelled = false;

    void fetch(apiUrl(`/api/transcripts/${encodeURIComponent(vid)}/languages`))
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          data: {
            sourceExists?: boolean;
            existingLangs?: string[];
            translatedLangs?: string[];
            subtitleSources?: SubtitleSource[];
            allSources?: SubtitleSource[];
          } | null,
        ) => {
          if (cancelled || !data) return;
          const tracks: TranscriptTrack[] = [];
          const validIds = new Set<string>();

          const rawSources = Array.isArray(data.subtitleSources)
            ? data.subtitleSources
            : Array.isArray(data.allSources)
              ? data.allSources
              : [];

          if (rawSources.length > 0) {
            for (const src of rawSources) {
              const langCode = src.lang || "en";
              const id = src.id || `${langCode}:${src.origin || "uploaded"}`;
              if (validIds.has(id)) continue;
              validIds.add(id);
              const displayLabel = formatTrackDisplayLabel(src);
              tracks.push({
                id,
                lang: langCode,
                label: displayLabel,
                short: displayLabel,
                rtl: isRtlLanguage(langCode),
                origin: src.origin,
                version: src.version,
                fileName: src.fileName,
                is_master: src.is_master,
                is_ai_source: src.is_ai_source,
              });
            }
          } else {
            for (const lang of data.existingLangs ?? []) {
              const id = `${lang}:uploaded`;
              if (validIds.has(id)) continue;
              validIds.add(id);
              const displayLabel = formatTrackDisplayLabel({ lang, origin: "uploaded" });
              tracks.push({
                id,
                lang,
                label: displayLabel,
                short: displayLabel,
                rtl: isRtlLanguage(lang),
                origin: "uploaded",
                is_master: true,
              });
            }
            for (const lang of data.translatedLangs ?? []) {
              const id = `${lang}:generated`;
              if (validIds.has(id)) continue;
              validIds.add(id);
              const displayLabel = formatTrackDisplayLabel({ lang, origin: "generated" });
              tracks.push({
                id,
                lang,
                label: displayLabel,
                short: displayLabel,
                rtl: isRtlLanguage(lang),
                origin: "generated",
                is_master: !tracks.some((t) => t.lang === lang),
              });
            }
          }

          setAvailableTracks(tracks);

          const pendingTarget = pendingTrackSelectionRef.current;
          const resolvedPending = resolveBestTrackId(tracks, pendingTarget);
          if (resolvedPending) {
            pendingTrackSelectionRef.current = null;
          }

          setTranscriptLang((prev) => {
            if (resolvedPending) return resolvedPending;
            const kept = resolveBestTrackId(tracks, prev);
            if (kept) return kept;
            const fromPrimary = resolveBestTrackId(tracks, currentLesson.primaryTranscript);
            if (fromPrimary) return fromPrimary;
            const fromSpoken = resolveBestTrackId(tracks, course.language || "en");
            if (fromSpoken) return fromSpoken;
            return tracks[0]?.id ?? null;
          });

          setSubtitleTrack((prev) => {
            if (resolvedPending) return resolvedPending;
            if (prev === "off") return tracks[0]?.id ?? "off";
            const kept = resolveBestTrackId(tracks, prev);
            if (kept) return kept;
            const fromPrimary = resolveBestTrackId(tracks, currentLesson.primaryTranscript);
            if (fromPrimary) return fromPrimary;
            return tracks[0]?.id ?? "off";
          });
        },
      )
      .catch(() => {
        if (!cancelled) {
          setAvailableTracks([]);
          setTranscriptLang(null);
        }
      });

    void fetch(apiUrl(`/api/summaries/${encodeURIComponent(vid)}`))
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { content?: string } | null) => {
        if (!cancelled) setSavedSummary(typeof data?.content === "string" ? data.content : "");
      })
      .catch(() => {
        if (!cancelled) setSavedSummary("");
      });

    return () => {
      cancelled = true;
    };
  }, [
    course.language,
    currentLesson?.lessonId,
    currentLesson?.primaryTranscript,
    transcriptRefreshTick,
  ]);

  const activeCueLang = subtitleTrack !== "off" ? subtitleTrack : transcriptLang;
  useEffect(() => {
    const vid = currentLesson?.lessonId;
    if (!vid || !activeCueLang) {
      setTranscriptCues([]);
      setCuesLoading(false);
      return;
    }

    let cancelled = false;
    setCuesLoading(true);
    void fetch(
      apiUrl(
        `/api/transcripts/${encodeURIComponent(vid)}/chunks?lang=${encodeURIComponent(activeCueLang)}`,
      ),
    )
      .then((res) => (res.ok ? res.json() : []))
      .then((raw) => {
        if (!cancelled) setTranscriptCues(normalizeTranscriptChunks(raw));
      })
      .catch(() => {
        if (!cancelled) setTranscriptCues([]);
      })
      .finally(() => {
        if (!cancelled) setCuesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentLesson?.lessonId, activeCueLang, transcriptRefreshTick]);

  const activePlayerTrack = useMemo(() => {
    if (subtitleTrack === "off") return null;
    const id = resolveBestTrackId(availableTracks, subtitleTrack);
    return (id ? availableTracks.find((t) => t.id === id) : null) ?? null;
  }, [availableTracks, subtitleTrack]);

  const activeCaptionCue = useMemo(() => {
    if (subtitleTrack === "off" || isEmbeddedPlayer || transcriptCues.length === 0) return null;
    const idx = findActiveCueIndex(transcriptCues, time, true);
    return idx >= 0 ? transcriptCues[idx]! : null;
  }, [subtitleTrack, isEmbeddedPlayer, transcriptCues, time]);

  const clearControlsHideTimer = useCallback(() => {
    if (controlsHideTimerRef.current !== null) {
      window.clearTimeout(controlsHideTimerRef.current);
      controlsHideTimerRef.current = null;
    }
  }, []);

  const scheduleControlsHide = useCallback(
    (delay = 2400) => {
      clearControlsHideTimer();
      controlsHideTimerRef.current = window.setTimeout(() => {
        controlsHideTimerRef.current = null;
        if (!anyMenuOpenRef.current && !isPointerOverControlsRef.current) {
          setControlsActive(false);
        }
      }, delay);
    },
    [clearControlsHideTimer],
  );

  const wakeControls = useCallback(() => {
    setControlsActive(true);
    if (!anyMenuOpenRef.current && !isPointerOverControlsRef.current) {
      scheduleControlsHide(2400);
    } else {
      clearControlsHideTimer();
    }
  }, [clearControlsHideTimer, scheduleControlsHide]);

  useEffect(() => {
    if (!anyPlayerMenuOpen) {
      lastMenuDismissAtRef.current = performance.now();
      if (isPointerInsidePlayerRef.current) {
        setControlsActive(true);
        scheduleControlsHide(2400);
      } else {
        clearControlsHideTimer();
        setControlsActive(false);
      }
      return;
    }

    clearControlsHideTimer();
    setControlsActive(true);

    const updatePointerBounds = (e: PointerEvent) => {
      const rect = frameRef.current?.getBoundingClientRect();
      if (!rect) return;
      isPointerInsidePlayerRef.current =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;
    };

    window.addEventListener("pointermove", updatePointerBounds, { passive: true });
    window.addEventListener("pointerdown", updatePointerBounds, { capture: true, passive: true });
    return () => {
      window.removeEventListener("pointermove", updatePointerBounds);
      window.removeEventListener("pointerdown", updatePointerBounds, { capture: true });
    };
  }, [anyPlayerMenuOpen, clearControlsHideTimer, scheduleControlsHide]);

  useEffect(() => {
    if (playing && !anyMenuOpenRef.current && !isPointerOverControlsRef.current) {
      if (isPointerInsidePlayerRef.current) {
        scheduleControlsHide(2400);
      } else {
        clearControlsHideTimer();
        setControlsActive(false);
      }
    }
  }, [playing, clearControlsHideTimer, scheduleControlsHide]);

  useEffect(() => () => clearControlsHideTimer(), [clearControlsHideTimer]);

  const seek = useCallback(
    (t: number, options?: { minLockTime?: number }) => {
      const v = videoRef.current;
      if (!v) return;
      const maxDur = v.duration || effectiveDuration || t;
      const target = Math.max(0, Math.min(t, maxDur));
      const floorTime =
        options?.minLockTime !== undefined
          ? Math.max(0, Math.min(options.minLockTime, maxDur))
          : undefined;
      seekGuardRef.current =
        floorTime !== undefined ? { floorTime, expiresAt: performance.now() + 500 } : null;
      v.currentTime = target;
      const dubEl = dubAudioRef.current;
      if (dubEl && selectedDubLang !== "original" && target < (dubEl.duration || Infinity)) {
        dubEl.currentTime = target;
      }
      const displayTime = floorTime !== undefined ? Math.max(target, floorTime) : target;
      setTime(displayTime);
      if (studySessionRef.current) {
        studySessionRef.current.latestPosition = displayTime;
      }
    },
    [effectiveDuration, selectedDubLang],
  );
  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play();
    } else {
      v.pause();
    }
  };
  const handleVideoStageClick = () => {
    if (anyMenuOpenRef.current || performance.now() - lastMenuDismissAtRef.current < 220) {
      return;
    }
    togglePlay();
  };
  const playVideo = useCallback(() => {
    videoRef.current?.play().catch(() => {});
  }, []);
  const pauseVideo = useCallback(() => {
    videoRef.current?.pause();
  }, []);
  const getPlaybackState = useCallback(() => {
    const v = videoRef.current;
    return {
      isPlaying: v ? !v.paused && !v.ended : playing,
      currentTime: v ? v.currentTime : time,
    };
  }, [playing, time]);

  const captureVideoFrame = useCallback(async (): Promise<string> => {
    const v = videoRef.current;
    if (v && v.videoWidth > 0 && v.videoHeight > 0) {
      try {
        const scale = Math.min(1, 960 / v.videoWidth);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(v.videoWidth * scale);
        canvas.height = Math.round(v.videoHeight * scale);
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL("image/jpeg", 0.86);
        }
      } catch {
        // Cross-origin fallback below
      }
    }
    // Clean high-DPI fallback frame if cross-origin stream tainting blocks canvas readback
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 450;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, 800, 450);
      grad.addColorStop(0, "#1c1f2b");
      grad.addColorStop(1, "#0f1117");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 800, 450);
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 2;
      ctx.strokeRect(24, 24, 752, 402);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "600 22px system-ui, sans-serif";
      ctx.fillText(currentLesson?.title || course.title, 48, 215);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = "500 15px ui-monospace, monospace";
      ctx.fillText(`${course.title} • ${fmt(v?.currentTime ?? time)}`, 48, 250);
    }
    return canvas.toDataURL("image/jpeg", 0.88);
  }, [course.title, currentLesson?.title, time]);

  const togglePiP = async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPiP(false);
      } else if (document.pictureInPictureEnabled) {
        await v.requestPictureInPicture();
        setIsPiP(true);
      }
    } catch {
      // Ignore PiP errors when media is not yet ready
    }
  };

  const toggleFullscreen = () => {
    const el = frameRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      el.requestFullscreen?.();
    }
  };

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onEnterPiP = () => setIsPiP(true);
    const onLeavePiP = () => setIsPiP(false);
    v.addEventListener("enterpictureinpicture", onEnterPiP);
    v.addEventListener("leavepictureinpicture", onLeavePiP);
    return () => {
      v.removeEventListener("enterpictureinpicture", onEnterPiP);
      v.removeEventListener("leavepictureinpicture", onLeavePiP);
    };
  }, []);

  useEffect(() => {
    const isDubActive = !isEmbeddedPlayer && selectedDubLang !== "original";
    const v = videoRef.current;
    if (v) {
      v.volume = volume;
      v.muted = isDubActive ? true : muted;
    }
    const a = dubAudioRef.current;
    if (a) {
      a.volume = volume;
      a.muted = muted;
    }
  }, [volume, muted, selectedDubLang, isEmbeddedPlayer]);
  useEffect(() => {
    const v = videoRef.current;
    if (v) v.playbackRate = speed;
    const a = dubAudioRef.current;
    if (a) a.playbackRate = speed;
  }, [speed, selectedDubLang]);

  useEffect(() => {
    const lessonId = currentLesson?.lessonId;
    setSelectedDubLang("original");
    if (!lessonId || isEmbeddedPlayer) {
      setDubLanguages([]);
      return;
    }

    let cancelled = false;
    fetch(apiUrl(`/api/dub/video/${encodeURIComponent(lessonId)}/languages`))
      .then((res) => (res.ok ? res.json() : { languages: [] }))
      .then((data: { languages?: string[] }) => {
        if (cancelled) return;
        const list = Array.isArray(data.languages)
          ? data.languages.map((l) => String(l).trim().toLowerCase()).filter(Boolean)
          : [];
        setDubLanguages(list);
        if (lastDubLangRef.current !== "original" && list.includes(lastDubLangRef.current)) {
          setSelectedDubLang(lastDubLangRef.current);
        }
      })
      .catch(() => {
        if (!cancelled) setDubLanguages([]);
      });

    return () => {
      cancelled = true;
    };
  }, [currentLesson?.lessonId, isEmbeddedPlayer]);

  useEffect(() => {
    const lessonId = currentLesson?.lessonId;
    const v = videoRef.current;
    const a = dubAudioRef.current;

    if (!lessonId || isEmbeddedPlayer || selectedDubLang === "original" || !v || !a) {
      if (a) {
        a.pause();
        if (a.getAttribute("src")) {
          a.removeAttribute("src");
          a.load();
        }
      }
      if (v) {
        v.muted = mutedRef.current;
        v.volume = volumeRef.current;
      }
      return;
    }

    const srcUrl = apiUrl(
      `/api/dub/audio/${encodeURIComponent(lessonId)}?lang=${encodeURIComponent(selectedDubLang)}`,
    );
    v.muted = true;
    a.volume = volumeRef.current;
    a.muted = mutedRef.current;
    a.playbackRate = v.playbackRate || speedRef.current;
    a.src = srcUrl;
    a.load();

    const syncTimeFromVideo = () => {
      const target = v.currentTime || 0;
      const limit = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : Infinity;
      if (target < limit && Math.abs(a.currentTime - target) > 0.2) {
        try {
          a.currentTime = target;
        } catch {
          // Ignore seek before metadata settles
        }
      }
    };

    const handlePlay = () => {
      v.muted = true;
      a.playbackRate = v.playbackRate || speedRef.current;
      syncTimeFromVideo();
      if (a.readyState >= 1 && (v.currentTime || 0) < (a.duration || Infinity) - 0.15) {
        void a.play().catch(() => {});
      }
    };

    const handlePause = () => {
      a.pause();
      syncTimeFromVideo();
    };

    const handleSeek = () => {
      syncTimeFromVideo();
    };

    const handleRateChange = () => {
      a.playbackRate = v.playbackRate || speedRef.current;
    };

    const handleTimeUpdate = () => {
      v.muted = true;
      if (v.paused || v.ended || a.readyState < 2) return;
      const limit = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : Infinity;
      if (v.currentTime >= limit - 0.15) return;
      if (a.paused) {
        void a.play().catch(() => {});
      }
      if (Math.abs(a.currentTime - v.currentTime) > 0.45) {
        try {
          a.currentTime = v.currentTime;
        } catch {
          // Ignore temporary seek errors
        }
      }
    };

    const handleAudioReady = () => {
      a.volume = volumeRef.current;
      a.muted = mutedRef.current;
      a.playbackRate = v.playbackRate || speedRef.current;
      syncTimeFromVideo();
      if (!v.paused && !v.ended && v.currentTime < (a.duration || Infinity) - 0.15) {
        void a.play().catch(() => {});
      }
    };

    const handleVideoLoadedMetadata = () => {
      v.muted = true;
      syncTimeFromVideo();
    };

    const handleAudioError = () => {
      setSelectedDubLang("original");
      lastDubLangRef.current = "original";
      v.muted = mutedRef.current;
      v.volume = volumeRef.current;
      toast.error("Could not load dubbed audio");
    };

    v.addEventListener("play", handlePlay);
    v.addEventListener("playing", handlePlay);
    v.addEventListener("pause", handlePause);
    v.addEventListener("waiting", handlePause);
    v.addEventListener("ended", handlePause);
    v.addEventListener("seeking", handleSeek);
    v.addEventListener("seeked", handleSeek);
    v.addEventListener("ratechange", handleRateChange);
    v.addEventListener("timeupdate", handleTimeUpdate);
    v.addEventListener("loadedmetadata", handleVideoLoadedMetadata);
    a.addEventListener("loadedmetadata", handleAudioReady);
    a.addEventListener("error", handleAudioError);

    return () => {
      v.removeEventListener("play", handlePlay);
      v.removeEventListener("playing", handlePlay);
      v.removeEventListener("pause", handlePause);
      v.removeEventListener("waiting", handlePause);
      v.removeEventListener("ended", handlePause);
      v.removeEventListener("seeking", handleSeek);
      v.removeEventListener("seeked", handleSeek);
      v.removeEventListener("ratechange", handleRateChange);
      v.removeEventListener("timeupdate", handleTimeUpdate);
      v.removeEventListener("loadedmetadata", handleVideoLoadedMetadata);
      a.removeEventListener("loadedmetadata", handleAudioReady);
      a.removeEventListener("error", handleAudioError);
    };
  }, [currentLesson?.lessonId, isEmbeddedPlayer, selectedDubLang]);

  const goTo = useCallback(
    (i: number) => {
      if (i < 0 || i >= allLessons.length) return;
      flushStudySession();
      setActive(i);
    },
    [allLessons.length, flushStudySession],
  );

  const handleToggleLessonDone = useCallback(
    (idx: number, nextDone: boolean) => {
      const target = allLessons[idx];
      if (!target) return;
      setDone((prev) => prev.map((d, j) => (j === idx ? nextDone : d)));
      void markVideoComplete(target.lessonId, nextDone, course.id);
    },
    [allLessons, course.id],
  );

  const maybeAutoCompleteLesson = useCallback(
    (pos: number, dur: number) => {
      if (!currentLesson || dur <= 0 || currentLesson.isCompleted) return;
      const threshold = readAppSettings().autoMarkCompleteAt;
      if (
        threshold < 100 &&
        !autoCompletedIdsRef.current.has(currentLesson.lessonId) &&
        (pos / dur) * 100 >= threshold
      ) {
        autoCompletedIdsRef.current.add(currentLesson.lessonId);
        handleToggleLessonDone(active, true);
      }
    },
    [active, currentLesson, handleToggleLessonDone],
  );

  // Save checkpoint on tab background and flush reliably on page unload
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== "hidden") return;
      const sess = studySessionRef.current;
      if (!sess) return;
      const elapsed = getActiveSessionSeconds(sess);
      const qualified =
        sess.historyQualified || elapsed >= getHistoryThresholdSeconds(sess.latestDuration);
      if (qualified) sess.historyQualified = true;
      const canSavePosition = sess.latestPosition > 0 && pendingSeekRef.current === null;
      if (canSavePosition || qualified) {
        void updateVideoProgress(
          sess.videoId,
          sess.latestPosition,
          sess.latestDuration,
          course.id,
          {
            recordHistory: qualified,
            recordPosition: canSavePosition,
            keepalive: true,
          },
        );
      }
    };

    const onPageHide = () => {
      flushStudySession(true);
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [course.id, flushStudySession]);

  // YouTube embed active playback tracking via postMessage (`enablejsapi=1`)
  useEffect(() => {
    const vid = currentLesson?.lessonId;
    if (!youtubeId || !vid) return;

    let handshakeReceived = false;
    let attempts = 0;
    const playerDomId = `yt-player-${vid}`;

    const tryHandshake = () => {
      sendYoutubeListeningHandshake(ytIframeRef.current, playerDomId);
    };

    tryHandshake();
    const retryInterval = setInterval(() => {
      attempts += 1;
      if (handshakeReceived || attempts >= 12) {
        clearInterval(retryInterval);
        return;
      }
      tryHandshake();
    }, 500);

    const onMessage = (event: MessageEvent) => {
      const update = parseYoutubeIframeMessage(event, ytIframeRef.current?.contentWindow);
      if (!update) return;
      handshakeReceived = true;

      const sess = studySessionRef.current;
      if (!sess || sess.videoId !== vid) return;

      if (typeof update.duration === "number" && update.duration > 0) {
        sess.latestDuration = update.duration;
        setDuration(update.duration);
      }
      if (typeof update.currentTime === "number" && update.currentTime >= 0) {
        setTime(update.currentTime);
        sess.latestPosition = update.currentTime;
      }

      if (update.playerState === 1) {
        setPlaying(true);
        pendingSeekRef.current = null;
        if (sess.lastResumedAt === null) {
          sess.lastResumedAt = Date.now();
        }
      } else if (update.playerState === 2) {
        setPlaying(false);
        pendingSeekRef.current = null;
        pauseActiveSessionSlice(sess);
        recordPlaybackProgress(sess.latestPosition, sess.latestDuration, {
          forceSave: true,
          recordPosition: sess.latestPosition > 0,
        });
      } else if (update.playerState === 3) {
        pauseActiveSessionSlice(sess);
      } else if (update.playerState === 0) {
        setPlaying(false);
        pendingSeekRef.current = null;
        if (sess.latestDuration > 0) {
          sess.latestPosition = sess.latestDuration;
          setTime(sess.latestDuration);
        }
        flushStudySession();
        if (!currentLesson.isCompleted && !autoCompletedIdsRef.current.has(vid)) {
          autoCompletedIdsRef.current.add(vid);
          handleToggleLessonDone(active, true);
        }
        return;
      }

      if (update.playerState === 1 || sess.lastResumedAt !== null) {
        const pos = update.currentTime ?? sess.latestPosition;
        const dur = update.duration ?? sess.latestDuration;
        recordPlaybackProgress(pos, dur, { recordPosition: true });
        maybeAutoCompleteLesson(pos, dur);
      }
    };

    window.addEventListener("message", onMessage);
    return () => {
      clearInterval(retryInterval);
      window.removeEventListener("message", onMessage);
    };
  }, [
    active,
    currentLesson,
    flushStudySession,
    handleToggleLessonDone,
    maybeAutoCompleteLesson,
    recordPlaybackProgress,
    youtubeId,
  ]);

  // Google Drive embed active visibility dwell tracking (no postMessage API available)
  useEffect(() => {
    const vid = currentLesson?.lessonId;
    if (youtubeId || !driveFileId || !vid) return;

    const interval = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const sess = studySessionRef.current;
      if (!sess || sess.videoId !== vid) return;

      sess.accumulatedSecs += 1;
      if (
        !sess.historyQualified &&
        sess.accumulatedSecs >= getHistoryThresholdSeconds(sess.latestDuration)
      ) {
        sess.historyQualified = true;
        void updateVideoProgress(vid, 0, sess.latestDuration, course.id, {
          recordHistory: true,
          recordPosition: false,
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [course.id, currentLesson?.lessonId, driveFileId, youtubeId]);

  const handleCommitBulkDone = useCallback(
    (updates: Array<{ idx: number; done: boolean }>) => {
      if (updates.length === 0) return;
      void Promise.all(
        updates.map(({ idx, done: val }) => {
          const lesson = allLessons[idx];
          return lesson ? markVideoComplete(lesson.lessonId, val, course.id) : Promise.resolve();
        }),
      );
    },
    [allLessons, course.id],
  );

  const [shortcutsEnabled, setShortcutsEnabled] = useState(true);
  const lastSubtitleRef = useRef<string>("source");
  useEffect(() => {
    if (subtitleTrack !== "off") lastSubtitleRef.current = subtitleTrack;
  }, [subtitleTrack]);

  useEffect(() => {
    setShortcutsEnabled(arePlayerShortcutsEnabled());
    const syncShortcuts = () => setShortcutsEnabled(arePlayerShortcutsEnabled());
    window.addEventListener(SETTINGS_CHANGED_EVENT, syncShortcuts);
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, syncShortcuts);
  }, []);

  const shortcutHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  shortcutHandlerRef.current = (e: KeyboardEvent) => {
    if (!shortcutsEnabled || e.defaultPrevented) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('[role="dialog"]')) return;

    const target = e.target as HTMLElement | null;
    if (target) {
      if (
        target.isContentEditable ||
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.closest('[role="slider"]')
      ) {
        return;
      }
      if (
        e.key === " " &&
        target.closest(
          'button, a[href], [role="button"], [role="menuitem"], [role="switch"], [role="tab"]',
        )
      ) {
        return;
      }
    }

    const lower = e.key.toLowerCase();
    const currentSeconds = videoRef.current?.currentTime ?? time;

    if (e.key === " " || (!e.shiftKey && lower === "k")) {
      e.preventDefault();
      togglePlay();
      return;
    }
    if (!e.shiftKey && e.key === "ArrowLeft") {
      e.preventDefault();
      seek(currentSeconds - 5);
      return;
    }
    if (!e.shiftKey && e.key === "ArrowRight") {
      e.preventDefault();
      seek(currentSeconds + 5);
      return;
    }
    if (!e.shiftKey && lower === "j") {
      seek(currentSeconds - 10);
      return;
    }
    if (!e.shiftKey && lower === "l") {
      seek(currentSeconds + 10);
      return;
    }
    if (!e.shiftKey && e.key === "ArrowUp") {
      e.preventDefault();
      setMuted(false);
      setVolume((v) => Math.min(1, Number((v + 0.05).toFixed(2))));
      return;
    }
    if (!e.shiftKey && e.key === "ArrowDown") {
      e.preventDefault();
      setVolume((v) => Math.max(0, Number((v - 0.05).toFixed(2))));
      return;
    }
    if (!e.shiftKey && lower === "m") {
      setMuted((m) => !m);
      return;
    }
    if (!e.shiftKey && lower === "c") {
      if (subtitleTrack !== "off") {
        setSubtitleTrack("off");
      } else {
        const candidate =
          resolveBestTrackId(availableTracks, lastSubtitleRef.current) ??
          resolveBestTrackId(availableTracks, spokenCourseLang) ??
          availableTracks.find((t) => t.is_master)?.id ??
          availableTracks[0]?.id;
        if (candidate) {
          setSubtitleTrack(candidate);
          setTranscriptLang(candidate);
        }
      }
      return;
    }
    if (!e.shiftKey && lower === "p") {
      void togglePiP();
      return;
    }
    if (e.shiftKey && lower === "p") {
      goTo(active - 1);
      return;
    }
    if (e.shiftKey && lower === "n") {
      goTo(active + 1);
      return;
    }
    if (!e.shiftKey && lower === "f") {
      toggleFullscreen();
      return;
    }
    if (e.key === "<" || e.key === ">") {
      const speeds = [0.75, 1, 1.25, 1.5, 2] as const;
      const idx = speeds.findIndex((s) => s === speed);
      const currentIdx = idx === -1 ? 1 : idx;
      const nextIdx =
        e.key === ">" ? Math.min(speeds.length - 1, currentIdx + 1) : Math.max(0, currentIdx - 1);
      setSpeed(speeds[nextIdx]!);
      return;
    }
    if (!e.shiftKey && /^[0-9]$/.test(e.key) && effectiveDuration > 0) {
      seek(effectiveDuration * (Number(e.key) / 10));
    }
  };

  const captionFileInputRef = useRef<HTMLInputElement>(null);
  const [smartCaptionData, setSmartCaptionData] = useState<{
    language: string;
    languageName?: string | undefined;
    matches: SmartCaptionMatch[];
  } | null>(null);
  const [transcriptModalState, setTranscriptModalState] = useState<{
    open: boolean;
    mode: "transcribe" | "translate";
    targetLang?: string | undefined;
  }>({ open: false, mode: "transcribe" });
  const [spokenCourseLang, setSpokenCourseLang] = useState<string>(() =>
    (course.language || "en").toLowerCase(),
  );

  useEffect(() => {
    if (course.language) {
      setSpokenCourseLang(course.language.toLowerCase());
    }
  }, [course.language]);

  const handleUploadCaptions = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0 || !currentLesson) return;

    const firstFile = files[0]!;
    const formData = new FormData();
    formData.append("file", firstFile);
    formData.append("caption", firstFile);

    try {
      const res = await fetch(
        apiUrl(`/api/transcripts/${encodeURIComponent(currentLesson.lessonId)}/upload`),
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
        success?: boolean;
        language?: string;
        languageName?: string;
        track?: SubtitleSource;
        detectedMatches?: SmartCaptionMatch[];
      };

      const uploadedLang = data.language || "en";
      const uploadedTrackId = data.track?.id || `${uploadedLang}:uploaded`;
      setSubtitleTrack(uploadedTrackId);
      setTranscriptLang(uploadedTrackId);
      setTranscriptRefreshTick((n) => n + 1);
      await fetchCourseCurriculum(course.id, true);
      window.dispatchEvent(
        new CustomEvent(TRANSCRIPT_UPDATED_EVENT, {
          detail: {
            videoId: currentLesson.lessonId,
            targetLang: uploadedLang,
            trackId: uploadedTrackId,
          },
        }),
      );
      toast.success(`Imported ${firstFile.name}`);

      if (Array.isArray(data.detectedMatches) && data.detectedMatches.length > 0) {
        setSmartCaptionData({
          language: uploadedLang,
          languageName: data.languageName || getLanguageLabel(uploadedLang),
          matches: data.detectedMatches,
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to import subtitles");
    }
  };

  const handleSetTrackMaster = useCallback(
    async (trackId: string) => {
      if (!currentLesson) return;
      try {
        await setSubtitleTrackMaster(currentLesson.lessonId, trackId, String(course.id));
        setTranscriptRefreshTick((n) => n + 1);
        await fetchCourseCurriculum(course.id, true);
        toast.success("Set as master track");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to set master track");
      }
    },
    [course.id, currentLesson],
  );

  const handleSetTrackSource = useCallback(
    async (trackId: string) => {
      if (!currentLesson) return;
      try {
        await setSubtitleTrackSource(currentLesson.lessonId, trackId, String(course.id));
        setTranscriptRefreshTick((n) => n + 1);
        await fetchCourseCurriculum(course.id, true);
        toast.success("Set as source track");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to set source track");
      }
    },
    [course.id, currentLesson],
  );

  const handleDeleteTrack = useCallback(
    async (trackId: string) => {
      if (!currentLesson) return;
      try {
        await deleteSubtitleTrack(currentLesson.lessonId, trackId);
        if (transcriptLang === trackId) {
          setTranscriptLang(null);
        }
        if (subtitleTrack === trackId) {
          setSubtitleTrack("off");
        }
        setTranscriptRefreshTick((n) => n + 1);
        await fetchCourseCurriculum(course.id, true);
        toast.success("Subtitle track removed");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to remove track");
      }
    },
    [course.id, currentLesson, subtitleTrack, transcriptLang],
  );

  const handleDeleteDubTrack = useCallback(
    async (lang: string) => {
      if (!currentLesson) return;
      try {
        const res = await fetch(
          apiUrl(
            `/api/dub/video/${encodeURIComponent(currentLesson.lessonId)}?lang=${encodeURIComponent(lang)}`,
          ),
          { method: "DELETE" },
        );
        if (!res.ok) {
          const errData = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(errData.error || "Failed to remove dub track");
        }
        if (selectedDubLang === lang) {
          lastDubLangRef.current = "original";
          setSelectedDubLang("original");
        }
        setDubLanguages((prev) => prev.filter((l) => l !== lang));
        toast.success("Dub track removed");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to remove dub track");
      }
    },
    [currentLesson, selectedDubLang],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => shortcutHandlerRef.current(e);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="relative flex flex-col gap-5 overflow-x-hidden p-4 sm:p-5 lg:h-dvh lg:flex-row lg:overflow-hidden">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute -inset-6 z-0 rounded-[2rem] opacity-40 blur-3xl transition-opacity dark:opacity-30",
              course.art,
            )}
          />
          <div
            ref={frameRef}
            onDragStart={(e) => e.preventDefault()}
            onMouseEnter={() => {
              isPointerInsidePlayerRef.current = true;
              wakeControls();
            }}
            onMouseMove={() => {
              isPointerInsidePlayerRef.current = true;
              wakeControls();
            }}
            onMouseLeave={() => {
              isPointerInsidePlayerRef.current = false;
              isPointerOverControlsRef.current = false;
              if (!anyMenuOpenRef.current) {
                clearControlsHideTimer();
                setControlsActive(false);
              }
            }}
            className="group relative z-10 min-h-0 w-full flex-1 select-none overflow-hidden rounded-xl bg-player shadow-workspace max-lg:aspect-video"
          >
            {curriculumLoading ? (
              <div className="flex size-full items-center justify-center text-sm text-white/70">
                Loading lesson…
              </div>
            ) : !currentLesson ? (
              <div className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center text-white/80">
                <p className="text-sm">No lessons in this course yet.</p>
                <Button asChild size="sm" variant="secondary">
                  <Link to="/manage/$courseId" params={{ courseId: course.id }}>
                    <ListChecks className="size-4" /> Manage curriculum
                  </Link>
                </Button>
              </div>
            ) : youtubeId ? (
              <iframe
                ref={ytIframeRef}
                id={`yt-player-${currentLesson.lessonId}`}
                key={currentLesson.lessonId}
                src={`https://www.youtube.com/embed/${encodeURIComponent(youtubeId)}?enablejsapi=1&controls=1&modestbranding=1&rel=0${ytStartCacheRef.current.startSec > 2 ? `&start=${ytStartCacheRef.current.startSec}` : ""}&origin=${typeof window !== "undefined" ? encodeURIComponent(window.location.origin) : ""}`}
                title={currentLesson.title}
                className="size-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                onLoad={() => {
                  sendYoutubeListeningHandshake(
                    ytIframeRef.current,
                    `yt-player-${currentLesson.lessonId}`,
                  );
                }}
              />
            ) : driveFileId ? (
              <iframe
                key={driveFileId}
                src={`https://drive.google.com/file/d/${encodeURIComponent(driveFileId)}/preview`}
                title={currentLesson.title}
                className="size-full border-0"
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            ) : isExternalResourceOnly ? (
              <div className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center text-white">
                <p className="max-w-md text-base font-semibold">{currentLesson.title}</p>
                <Button asChild size="sm" variant="secondary">
                  <a
                    href={externalDirectUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      const lid = currentLesson.lessonId;
                      const ldur = currentLesson.durationSec || 0;
                      trackExternalCourseOpen(course.id, {
                        accessType: "player",
                        onCommitted: () => {
                          void updateVideoProgress(lid, 0, ldur, course.id, {
                            recordHistory: true,
                            recordPosition: false,
                          });
                        },
                      });
                    }}
                  >
                    Open link
                  </a>
                </Button>
              </div>
            ) : (
              <video
                ref={videoRef}
                key={currentLesson.lessonId}
                src={isTsVideo ? undefined : resolvedVideoSrc || undefined}
                playsInline
                draggable={false}
                preload="metadata"
                className="size-full select-none object-contain"
                onClick={handleVideoStageClick}
                onPlay={() => {
                  setPlaying(true);
                  if (studySessionRef.current && studySessionRef.current.lastResumedAt === null) {
                    studySessionRef.current.lastResumedAt = Date.now();
                  }
                }}
                onPlaying={() => {
                  if (studySessionRef.current && studySessionRef.current.lastResumedAt === null) {
                    studySessionRef.current.lastResumedAt = Date.now();
                  }
                }}
                onWaiting={() => {
                  pauseActiveSessionSlice(studySessionRef.current);
                }}
                onSeeking={() => {
                  pauseActiveSessionSlice(studySessionRef.current);
                }}
                onSeeked={(e) => {
                  const media = e.currentTarget;
                  const landed = media.currentTime;
                  const guard = seekGuardRef.current;
                  if (guard) {
                    if (landed < guard.floorTime && guard.floorTime - landed <= 0.08) {
                      setTime(guard.floorTime);
                    } else {
                      setTime(landed);
                    }
                    seekGuardRef.current = null;
                  }
                  if (
                    !media.paused &&
                    studySessionRef.current &&
                    studySessionRef.current.lastResumedAt === null
                  ) {
                    studySessionRef.current.lastResumedAt = Date.now();
                  }
                }}
                onPause={(e) => {
                  setPlaying(false);
                  pauseActiveSessionSlice(studySessionRef.current);
                  const pos = e.currentTarget.currentTime;
                  const dur = e.currentTarget.duration || effectiveDuration;
                  recordPlaybackProgress(pos, dur, {
                    forceSave: true,
                    recordPosition: pendingSeekRef.current === null,
                  });
                }}
                onTimeUpdate={(e) => {
                  const media = e.currentTarget;
                  if (media.seeking) return;
                  const rawT = media.currentTime;
                  const guard = seekGuardRef.current;
                  let displayT = rawT;
                  if (guard) {
                    if (rawT >= guard.floorTime || performance.now() >= guard.expiresAt) {
                      seekGuardRef.current = null;
                    } else if (guard.floorTime - rawT <= 0.12) {
                      displayT = guard.floorTime;
                    }
                  }
                  const dur = media.duration || effectiveDuration;
                  setTime(displayT);
                  recordPlaybackProgress(rawT, dur);
                  maybeAutoCompleteLesson(rawT, dur);
                }}
                onLoadedMetadata={(e) => {
                  const media = e.currentTarget;
                  const metaDur = Number.isFinite(media.duration) ? media.duration : 0;
                  if (metaDur > 0) setDuration(metaDur);
                  if (pendingSeekRef.current !== null) {
                    const target = Math.max(
                      0,
                      Math.min(pendingSeekRef.current, metaDur || pendingSeekRef.current),
                    );
                    media.currentTime = target;
                    setTime(target);
                    pendingSeekRef.current = null;
                  }
                  if (
                    metaDur > 0 &&
                    (!currentLesson.durationSec ||
                      Math.abs(metaDur - currentLesson.durationSec) > 3)
                  ) {
                    void updateCourseVideo(currentLesson.lessonId, course.id, {
                      duration: Math.round(metaDur),
                    });
                  }
                }}
                onEnded={(e) => {
                  const endDur = e.currentTarget.duration || effectiveDuration;
                  if (studySessionRef.current && endDur > 0) {
                    studySessionRef.current.latestPosition = endDur;
                  }
                  flushStudySession();
                  if (!currentLesson.isCompleted) {
                    handleToggleLessonDone(active, true);
                  }
                  if (autoplay && active < allLessons.length - 1) goTo(active + 1);
                }}
                onError={() => {
                  if (isTsVideo) return;
                  if (resolvedVideoSrc) {
                    toast.error("Failed to load video stream.");
                  }
                }}
              />
            )}

            {!isEmbeddedPlayer && !isExternalResourceOnly && activeCaptionCue && (
              <div
                dir={activePlayerTrack?.rtl ? "rtl" : "ltr"}
                className="pointer-events-none absolute inset-x-6 bottom-20 flex justify-center"
              >
                <span className="max-w-2xl rounded-md bg-black/75 px-3 py-1.5 text-center text-sm font-medium leading-snug text-white backdrop-blur-sm">
                  {activeCaptionCue.text}
                </span>
              </div>
            )}

            {!isEmbeddedPlayer && !isExternalResourceOnly && currentLesson && !playing && (
              <button
                type="button"
                onClick={handleVideoStageClick}
                aria-label="Play"
                className="absolute left-1/2 top-1/2 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-card/90 text-primary shadow-workspace backdrop-blur transition-transform hover:scale-105"
              >
                <PlayIcon className="size-6" />
              </button>
            )}
            {!isEmbeddedPlayer && !isExternalResourceOnly && currentLesson && (
              <div
                onMouseEnter={() => {
                  isPointerOverControlsRef.current = true;
                  wakeControls();
                }}
                onMouseLeave={() => {
                  isPointerOverControlsRef.current = false;
                  if (playing && !anyMenuOpenRef.current) {
                    scheduleControlsHide(2400);
                  }
                }}
                onFocusCapture={wakeControls}
                className={cn(
                  "absolute inset-x-0 bottom-0 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pb-4 pt-12 text-white transition-opacity duration-200",
                  !playing || anyPlayerMenuOpen || controlsActive
                    ? "opacity-100"
                    : "pointer-events-none opacity-0",
                )}
              >
                {/* Timeline Progress Bar */}
                <div className="group/timeline mb-3">
                  <Slider
                    value={[time]}
                    max={effectiveDuration || 1}
                    step={0.1}
                    onValueChange={([t]) => seek(t ?? 0)}
                    aria-label="Timeline"
                    className="cursor-pointer [&_[role=slider]]:size-3 [&_[role=slider]]:border-0 [&_[role=slider]]:bg-white [&_[role=slider]]:opacity-0 [&_[role=slider]]:transition-opacity group-hover/timeline:[&_[role=slider]]:opacity-100 focus-within:[&_[role=slider]]:opacity-100 [&>span:first-child]:h-1 [&>span:first-child]:bg-white/30 [&>span:first-child>span]:bg-white"
                  />
                </div>

                {/* Controls Bar */}
                <div className="flex min-w-0 items-center justify-between gap-2">
                  {/* Left Side Group */}
                  <div className="flex min-w-0 items-center gap-2">
                    {/* Play / Pause Button */}
                    <button
                      type="button"
                      onClick={togglePlay}
                      aria-label={playing ? "Pause" : "Play"}
                      title={playing ? "Pause (Space)" : "Play (Space)"}
                      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-white backdrop-blur-sm transition-all hover:bg-white/[0.15]"
                    >
                      {playing ? (
                        <PauseIcon className="size-5" />
                      ) : (
                        <PlayIcon className="size-5 translate-x-[0.5px]" />
                      )}
                    </button>

                    {/* Prev / Next Pill */}
                    <div className="flex h-10 shrink-0 items-center gap-3 rounded-full bg-white/[0.08] px-3.5 text-white backdrop-blur-sm transition-all hover:bg-white/[0.12]">
                      <button
                        type="button"
                        onClick={() => goTo(active - 1)}
                        disabled={active === 0}
                        aria-label="Previous lesson"
                        title="Previous lesson (Shift+P)"
                        className="p-1 transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        <PrevIcon className="size-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => goTo(active + 1)}
                        disabled={active === lessonTitles.length - 1}
                        aria-label="Next lesson"
                        title="Next lesson (Shift+N)"
                        className="p-1 transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        <NextIcon className="size-5" />
                      </button>
                    </div>

                    {/* Volume Pill */}
                    <div className="group/volume flex h-10 shrink-0 items-center rounded-full bg-white/[0.08] px-3 text-white backdrop-blur-sm transition-all hover:bg-white/[0.15] focus-within:bg-white/[0.15]">
                      <button
                        type="button"
                        onClick={() => setMuted(!muted)}
                        aria-label={muted ? "Unmute" : "Mute"}
                        title={muted ? "Unmute (M)" : "Mute (M)"}
                        className="p-1 transition-opacity hover:opacity-80"
                      >
                        <VolumeIcon volume={volume} muted={muted} />
                      </button>
                      <div className="w-0 overflow-hidden opacity-0 transition-all duration-200 group-hover/volume:ml-1.5 group-hover/volume:w-20 group-hover/volume:pr-1 group-hover/volume:opacity-100 group-focus-within/volume:ml-1.5 group-focus-within/volume:w-20 group-focus-within/volume:pr-1 group-focus-within/volume:opacity-100">
                        <Slider
                          value={[muted ? 0 : volume]}
                          max={1}
                          step={0.01}
                          onValueChange={([v]) => {
                            setVolume(v ?? 0);
                            setMuted(false);
                          }}
                          aria-label="Volume"
                          className="w-[72px] cursor-pointer [&_[role=slider]]:size-3 [&_[role=slider]]:border-0 [&_[role=slider]]:bg-white [&>span:first-child]:h-1 [&>span:first-child]:bg-white/30 [&>span:first-child>span]:bg-white"
                        />
                      </div>
                    </div>

                    {/* Time Pill */}
                    <button
                      type="button"
                      onClick={() => setRemainingTime(!remainingTime)}
                      aria-label={remainingTime ? "Show elapsed time" : "Show remaining time"}
                      title={remainingTime ? "Show elapsed time" : "Show remaining time"}
                      className="flex h-10 shrink-0 select-none items-center rounded-full bg-white/[0.08] px-4 text-xs font-semibold tabular-nums text-white backdrop-blur-sm transition-all hover:bg-white/[0.15]"
                    >
                      {remainingTime
                        ? `−${fmtTime(Math.max(0, effectiveDuration - time))}`
                        : `${fmtTime(time)} / ${fmtTime(effectiveDuration)}`}
                    </button>
                  </div>

                  {/* Right Side Pill */}
                  <div className="flex h-10 shrink-0 items-center gap-1 rounded-full bg-white/[0.08] px-3 py-1 text-white backdrop-blur-sm transition-all hover:bg-white/[0.12]">
                    <Popover open={tracksMenuOpen} onOpenChange={setTracksMenuOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          aria-label="Audio and subtitles"
                          title="Audio & Subtitles (C)"
                          className="flex items-center justify-center rounded-full p-1.5 text-white opacity-75 transition-all hover:bg-white/15 hover:opacity-100 data-[state=open]:opacity-100 [&_svg]:size-5"
                        >
                          <MessageSquareText />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        side="top"
                        sideOffset={10}
                        align="end"
                        onCloseAutoFocus={(e) => e.preventDefault()}
                        className="w-[340px] max-w-[calc(100vw-1rem)] sm:w-[390px] overflow-hidden rounded-lg border border-border/50 p-0"
                      >
                        <div className="grid grid-cols-2 divide-x divide-border/50">
                          <div className="flex min-w-0 flex-col">
                            <div className="border-b border-border/50 px-3 py-2">
                              <p className="text-xs font-semibold text-muted-foreground">Audio</p>
                            </div>
                            <div
                              role="menu"
                              aria-label="Audio tracks"
                              className="max-h-56 space-y-0.5 overflow-y-auto p-1.5 custom-scrollbar-sm"
                            >
                              <button
                                type="button"
                                role="menuitemradio"
                                aria-checked={selectedDubLang === "original"}
                                onClick={() => {
                                  lastDubLangRef.current = "original";
                                  setSelectedDubLang("original");
                                }}
                                className={cn(
                                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none",
                                  selectedDubLang === "original" && "bg-accent/60 font-medium",
                                )}
                              >
                                <span className="truncate">
                                  Original ({getLanguageName(spokenCourseLang)})
                                </span>
                                {selectedDubLang === "original" && (
                                  <Check className="ml-auto size-4 shrink-0 text-primary" />
                                )}
                              </button>
                              {dubLanguages.map((lang) => {
                                const isSelected = selectedDubLang === lang;
                                return (
                                  <button
                                    key={lang}
                                    type="button"
                                    role="menuitemradio"
                                    aria-checked={isSelected}
                                    onClick={() => {
                                      lastDubLangRef.current = lang;
                                      setSelectedDubLang(lang);
                                    }}
                                    className={cn(
                                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none",
                                      isSelected && "bg-accent/60 font-medium",
                                    )}
                                  >
                                    <span className="truncate">{getLanguageName(lang)}</span>
                                    {isSelected && (
                                      <Check className="ml-auto size-4 shrink-0 text-primary" />
                                    )}
                                  </button>
                                );
                              })}
                              {dubLanguages.length === 0 && (
                                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                                  No dubbed audio
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex min-w-0 flex-col">
                            <div className="border-b border-border/50 px-3 py-2">
                              <p className="text-xs font-semibold text-muted-foreground">
                                Subtitles
                              </p>
                            </div>
                            <div
                              role="menu"
                              aria-label="Subtitle tracks"
                              className="max-h-56 space-y-0.5 overflow-y-auto p-1.5 custom-scrollbar-sm"
                            >
                              <button
                                type="button"
                                role="menuitemradio"
                                aria-checked={subtitleTrack === "off"}
                                onClick={() => setSubtitleTrack("off")}
                                className={cn(
                                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none",
                                  subtitleTrack === "off" && "bg-accent/60 font-medium",
                                )}
                              >
                                <span className="truncate">Off</span>
                                {subtitleTrack === "off" && (
                                  <Check className="ml-auto size-4 shrink-0 text-primary" />
                                )}
                              </button>
                              {availableTracks.map((tr) => {
                                const isSelected = activePlayerTrack?.id === tr.id;
                                return (
                                  <button
                                    key={tr.id}
                                    type="button"
                                    role="menuitemradio"
                                    aria-checked={isSelected}
                                    onClick={() => {
                                      setSubtitleTrack(tr.id);
                                      setTranscriptLang(tr.id);
                                    }}
                                    className={cn(
                                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none",
                                      isSelected && "bg-accent/60 font-medium",
                                    )}
                                  >
                                    <span className="truncate">{tr.label}</span>
                                    {isSelected && (
                                      <Check className="ml-auto size-4 shrink-0 text-primary" />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>

                    <DropdownMenu
                      modal={false}
                      open={settingsMenuOpen}
                      onOpenChange={setSettingsMenuOpen}
                    >
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label="Settings"
                          title="Settings"
                          className="flex items-center justify-center rounded-full p-1.5 text-white opacity-75 transition-all hover:bg-white/15 hover:opacity-100 data-[state=open]:opacity-100 [&_svg]:size-5"
                        >
                          <Settings />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        side="top"
                        sideOffset={10}
                        align="end"
                        onCloseAutoFocus={(e) => e.preventDefault()}
                        className="w-52 rounded-lg p-1.5"
                      >
                        <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                          Playback speed
                        </p>
                        {[0.75, 1, 1.25, 1.5, 2].map((s) => (
                          <DropdownMenuItem
                            key={s}
                            className="rounded-md"
                            onClick={() => setSpeed(s)}
                          >
                            <Gauge />
                            {s}×{speed === s && <Check className="ml-auto" />}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="rounded-md"
                          onSelect={(event) => {
                            event.preventDefault();
                            setAutoplay(!autoplay);
                          }}
                        >
                          Autoplay next{autoplay && <Check className="ml-auto" />}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <PlayerBtn label="Picture-in-Picture (P)" onClick={togglePiP} active={isPiP}>
                      <PictureInPicture />
                    </PlayerBtn>

                    <PlayerBtn
                      label={isFullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)"}
                      onClick={toggleFullscreen}
                    >
                      {isFullscreen ? <Minimize /> : <Maximize />}
                    </PlayerBtn>

                    <PlayerBtn
                      label={panelOpen ? "Hide sidebar" : "Show sidebar"}
                      onClick={() => setPanelOpen(!panelOpen)}
                    >
                      {panelOpen ? <PanelRightClose /> : <PanelRightOpen />}
                    </PlayerBtn>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="relative flex shrink-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <nav
              aria-label="Breadcrumb"
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              <Link to="/" className="truncate hover:text-foreground">
                {course.title}
              </Link>
              {currentLesson && (
                <>
                  <ChevronRight className="size-3 shrink-0" />
                  <span className="truncate">{currentLesson.moduleTitle}</span>
                  <ChevronRight className="size-3 shrink-0" />
                  <span className="shrink-0 font-medium text-foreground">
                    Lesson {String(active + 1).padStart(2, "0")}
                  </span>
                </>
              )}
            </nav>
            <h1
              className="mt-1.5 truncate text-xl font-semibold sm:text-2xl"
              title={currentLesson?.title ?? course.title}
            >
              {currentLesson?.title ?? course.title}
            </h1>
            {course.instructor.trim() ? (
              <div className="mt-1.5">
                <Link
                  to="/instructors"
                  search={{ instructor: normalizeInstructorSlug(course.instructor) }}
                  className="inline-flex items-center gap-2 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  title={`View ${course.instructor}`}
                >
                  <InstructorAvatar name={course.instructor} course={course} size="sm" />
                  <span>{course.instructor}</span>
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {panelOpen && (
        <aside className="relative z-10 flex h-[640px] w-full shrink-0 flex-col overflow-hidden rounded-xl bg-card shadow-card lg:h-full lg:w-[380px]">
          <div className="border-b border-border/50 p-3">
            <div role="tablist" className="grid grid-cols-3 gap-1 rounded-lg bg-secondary/75 p-1">
              {(
                [
                  ["playlist", BookOpen, "Playlist"],
                  ["notes", NotebookPen, "Notes"],
                  ["transcript", Zap, "Transcript"],
                ] as const
              ).map(([id, Icon, label]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-sm px-2 py-2 text-xs font-semibold text-muted-foreground transition-all",
                    tab === id && "bg-card text-foreground shadow-card",
                  )}
                >
                  <Icon className={cn("size-3.5", tab === id && "text-primary")} /> {label}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1">
            {tab === "playlist" && (
              <PlaylistTab
                courseId={String(course.id)}
                courseModules={courseModules}
                allLessons={allLessons}
                active={active}
                done={done}
                setDone={setDone}
                onToggleLessonDone={handleToggleLessonDone}
                onCommitBulkDone={handleCommitBulkDone}
                onSelect={goTo}
              />
            )}
            {tab === "notes" && (
              <NotesTab
                courseId={String(course.id)}
                lessonId={currentLesson?.lessonId}
                lessonIdx={active}
                lessonTitle={currentLesson?.title ?? course.title}
                transcriptCues={transcriptCues}
                time={time}
                seek={seek}
                onCaptureFrame={captureVideoFrame}
                onPlay={playVideo}
                onPause={pauseVideo}
                getPlaybackState={getPlaybackState}
              />
            )}
            {tab === "transcript" && (
              <TranscriptTab
                videoId={currentLesson?.lessonId}
                youtubeId={youtubeId}
                availableTracks={availableTracks}
                selectedLang={transcriptLang}
                onSelectLang={(nextTrackId) => {
                  setTranscriptLang(nextTrackId);
                  setSubtitleTrack(nextTrackId);
                }}
                dubLanguages={dubLanguages}
                selectedDubLang={selectedDubLang}
                onSelectDubLang={(nextDubLang) => {
                  lastDubLangRef.current = nextDubLang;
                  setSelectedDubLang(nextDubLang);
                }}
                onDeleteDubTrack={(lang) => void handleDeleteDubTrack(lang)}
                cues={transcriptCues}
                cuesLoading={cuesLoading}
                time={time}
                seek={seek}
                onImportSubtitles={() => captionFileInputRef.current?.click()}
                onOpenAiModal={(mode, targetLang) =>
                  setTranscriptModalState({ open: true, mode, targetLang })
                }
                onSetMaster={(trackId) => void handleSetTrackMaster(trackId)}
                onSetSource={(trackId) => void handleSetTrackSource(trackId)}
                onDeleteTrack={(trackId) => void handleDeleteTrack(trackId)}
                onTranscriptReload={() => setTranscriptRefreshTick((n) => n + 1)}
                aiPanel={
                  currentLesson ? (
                    <TranscriptTranslateModal
                      variant="inline"
                      isOpen={transcriptModalState.open}
                      onClose={() => setTranscriptModalState((prev) => ({ ...prev, open: false }))}
                      courseId={String(course.id)}
                      courseLanguage={spokenCourseLang}
                      lessons={[
                        {
                          id: currentLesson.lessonId,
                          title: currentLesson.title,
                          youtubeId: youtubeId ?? undefined,
                          subtitleSources: availableTracks.map((tr) => ({
                            id: tr.id,
                            lang: tr.lang,
                            origin: tr.origin === "generated" ? "generated" : "uploaded",
                            version: tr.version,
                            label: tr.label,
                            fileName: tr.fileName,
                            is_master: tr.is_master,
                            is_ai_source: tr.is_ai_source,
                          })),
                          hasTranscript: availableTracks.length > 0,
                        },
                      ]}
                      defaultMode={transcriptModalState.mode}
                      defaultTargetLang={transcriptModalState.targetLang}
                      onCourseLanguageChanged={(nextLang) => setSpokenCourseLang(nextLang)}
                      onJobQueued={(targetLang, mode) => {
                        const nextId = `${targetLang}:${mode === "translate" || mode === "transcribe" ? "generated" : "uploaded"}`;
                        pendingTrackSelectionRef.current = nextId;
                      }}
                    />
                  ) : null
                }
              />
            )}
          </div>
        </aside>
      )}

      {!isEmbeddedPlayer && currentLesson && (
        <audio ref={dubAudioRef} preload="auto" className="hidden" />
      )}

      <input
        ref={captionFileInputRef}
        type="file"
        accept=".srt,.vtt,.ass,.sub"
        onChange={(e) => void handleUploadCaptions(e)}
        className="hidden"
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
            setTranscriptRefreshTick((n) => n + 1);
            void fetchCourseCurriculum(course.id, true);
          }}
        />
      )}
    </div>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <polygon points="6 3 20 12 6 21 6 3" />
    </svg>
  );
}

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="14" y="4" width="4" height="16" rx="1" />
      <rect x="6" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

function PrevIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <polygon points="19 20 9 12 19 4 19 20" />
      <line x1="5" x2="5" y1="19" y2="5" />
    </svg>
  );
}

function NextIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <polygon points="5 4 15 12 5 20 5 4" />
      <line x1="19" x2="19" y1="5" y2="19" />
    </svg>
  );
}

function VolumeIcon({ volume, muted }: { volume: number; muted: boolean }) {
  const effective = muted ? 0 : volume;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden="true"
    >
      <path
        d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"
        fill="currentColor"
      />
      {effective === 0 ? (
        <>
          <line x1="22" x2="16" y1="9" y2="15" />
          <line x1="16" x2="22" y1="9" y2="15" />
        </>
      ) : (
        <>
          <path d="M16 9a5 5 0 0 1 0 6" />
          {effective >= 0.5 && <path d="M19.364 18.364a9 9 0 0 0 0-12.728" />}
        </>
      )}
    </svg>
  );
}

function PlayerBtn({
  label,
  onClick,
  children,
  active,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full p-1.5 text-white transition-all hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-35 [&_svg]:size-5",
        active ? "opacity-100" : "opacity-75 hover:opacity-100",
      )}
    >
      {children}
    </button>
  );
}

function PlaylistTab({
  courseId,
  courseModules,
  allLessons,
  active,
  done,
  setDone,
  onToggleLessonDone,
  onCommitBulkDone,
  onSelect,
}: {
  courseId: string;
  courseModules: CourseModuleSpec[];
  allLessons: CourseLessonItem[];
  active: number;
  done: boolean[];
  setDone: Dispatch<SetStateAction<boolean[]>>;
  onToggleLessonDone: (idx: number, nextDone: boolean) => void;
  onCommitBulkDone: (updates: Array<{ idx: number; done: boolean }>) => void;
  onSelect: (i: number) => void;
}) {
  const [openMods, setOpenMods] = useState<boolean[]>([]);
  const [dragState, setDragState] = useState<{ startIdx: number; targetValue: boolean } | null>(
    null,
  );
  const dragInitialDoneRef = useRef<boolean[]>([]);
  const doneRef = useRef(done);
  doneRef.current = done;
  const count = done.filter(Boolean).length;
  const allDone = done.length > 0 && count === done.length;
  const [progressMode, setProgressMode] = useState<"videos" | "duration">(
    () => readAppSettings().progressCalculationMode,
  );

  useEffect(() => {
    const syncProgressMode = () => {
      setProgressMode(readAppSettings().progressCalculationMode);
    };
    window.addEventListener(SETTINGS_CHANGED_EVENT, syncProgressMode);
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, syncProgressMode);
  }, []);

  const progressPct = useMemo(
    () =>
      calculateCourseCompletionPercentage(
        done.map((isCompleted, idx) => ({
          isCompleted,
          duration: allLessons[idx] ? getLessonDurationSeconds(allLessons[idx]!) : 0,
        })),
        progressMode,
      ),
    [allLessons, done, progressMode],
  );

  const { totalDurationSecs, remainingDurationSecs } = useMemo(() => {
    let total = 0;
    let remaining = 0;
    for (let i = 0; i < allLessons.length; i += 1) {
      const lesson = allLessons[i];
      if (!lesson) continue;
      const secs = getLessonDurationSeconds(lesson);
      total += secs;
      if (!done[i]) {
        remaining += secs;
      }
    }
    return { totalDurationSecs: total, remainingDurationSecs: remaining };
  }, [allLessons, done]);

  useEffect(() => {
    setOpenMods((prev) =>
      courseModules.map((_, idx) => (prev[idx] !== undefined ? prev[idx]! : idx < 2)),
    );
  }, [courseModules]);

  const activeModIdx = allLessons[active]?.modIdx ?? 0;
  useEffect(() => {
    setOpenMods((prev) =>
      prev[activeModIdx] ? prev : prev.map((open, idx) => (idx === activeModIdx ? true : open)),
    );
  }, [activeModIdx]);

  useEffect(() => {
    if (!dragState) return;

    const handlePointerMove = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const row = el?.closest<HTMLElement>("[data-lesson-idx]");
      if (!row) return;
      const hoverIdx = Number(row.dataset["lessonIdx"]);
      if (Number.isNaN(hoverIdx)) return;

      const min = Math.min(dragState.startIdx, hoverIdx);
      const max = Math.max(dragState.startIdx, hoverIdx);
      setDone((prev) => {
        let changed = false;
        const next = prev.map((val, idx) => {
          if (idx >= min && idx <= max && val !== dragState.targetValue) {
            changed = true;
            return dragState.targetValue;
          }
          return val;
        });
        return changed ? next : prev;
      });
    };

    const stopDrag = () => {
      const initial = dragInitialDoneRef.current;
      const current = doneRef.current;
      const updates: Array<{ idx: number; done: boolean }> = [];
      for (let idx = 0; idx < current.length; idx++) {
        if (current[idx] !== initial[idx]) {
          updates.push({ idx, done: Boolean(current[idx]) });
        }
      }
      if (updates.length > 0) {
        onCommitBulkDone(updates);
      }
      setDragState(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
    };
  }, [dragState, onCommitBulkDone, setDone]);

  const toggleMod = (modIdx: number) => {
    setOpenMods((prev) => prev.map((open, idx) => (idx === modIdx ? !open : open)));
  };

  let globalLessonIdx = 0;

  return (
    <div className={cn("flex h-full flex-col", dragState && "select-none")}>
      <div className="px-3 pb-4 pt-1">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 text-sm font-semibold">
            Progress{" "}
            <span
              className={cn(
                "text-xs font-normal tabular-nums text-muted-foreground",
                allDone && "font-medium text-chart-4",
              )}
            >
              • {count} / {done.length} done
              {totalDurationSecs > 0 && remainingDurationSecs > 0
                ? ` • ${formatDurationLabel(remainingDurationSecs)} left`
                : ""}
            </span>
          </p>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-8 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <Link to="/manage/$courseId" params={{ courseId }}>
              <ListChecks className="size-3.5" /> Manage
            </Link>
          </Button>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              allDone ? "bg-chart-4" : "bg-primary",
            )}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 divide-y divide-border/50 overflow-y-auto px-3 pb-4 custom-scrollbar-sm">
        {courseModules.map((mod, modIdx) => {
          const startIdx = globalLessonIdx;
          globalLessonIdx += mod.lessons.length;
          const modDoneCount = mod.lessons.reduce(
            (acc, _, idx) => acc + (done[startIdx + idx] ? 1 : 0),
            0,
          );
          const modAllDone = mod.lessons.length > 0 && modDoneCount === mod.lessons.length;
          const modTotalSecs = mod.lessons.reduce(
            (acc, l) => acc + (l.durationSec || parseTs(l.duration)),
            0,
          );
          const isOpen = openMods[modIdx] ?? true;

          return (
            <div key={mod.id} className="py-2 first:pt-0 last:pb-0">
              <button
                type="button"
                onClick={() => toggleMod(modIdx)}
                aria-expanded={isOpen}
                className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-secondary/60"
              >
                <ChevronDown
                  className={cn(
                    "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                    !isOpen && "-rotate-90",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-foreground">{mod.title}</h3>
                  <p className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground">
                    <span className={cn(modAllDone && "font-semibold text-chart-4")}>
                      {modDoneCount}/{mod.lessons.length}
                    </span>{" "}
                    videos • {fmtTime(modTotalSecs)}
                  </p>
                </div>
              </button>

              {isOpen && (
                <ol className="mt-1 space-y-1.5">
                  {mod.lessons.map((lesson, lessonIdx) => {
                    const i = startIdx + lessonIdx;
                    const isActive = i === active;
                    return (
                      <li
                        key={lesson.id}
                        data-lesson-idx={i}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-secondary/60",
                          isActive && "bg-primary-soft/75 shadow-brand hover:bg-primary-soft/75",
                        )}
                      >
                        <button
                          type="button"
                          aria-label={done[i] ? "Mark as not done" : "Mark as done"}
                          title="Click or drag to mark lessons"
                          onPointerDown={(e) => {
                            if (e.button !== 0) return;
                            e.preventDefault();
                            dragInitialDoneRef.current = [...done];
                            const targetValue = !done[i];
                            setDragState({ startIdx: i, targetValue });
                            setDone((prev) => prev.map((d, j) => (j === i ? targetValue : d)));
                          }}
                          onKeyDown={(e) => {
                            if (e.key === " " || e.key === "Enter") {
                              e.preventDefault();
                              onToggleLessonDone(i, !done[i]);
                            }
                          }}
                          className={cn(
                            "flex size-5 shrink-0 touch-none items-center justify-center rounded-full border-2 border-border transition-colors hover:border-chart-4/60",
                            done[i] && "border-chart-4 bg-chart-4 text-primary-foreground",
                          )}
                        >
                          {done[i] && <Check className="size-3" strokeWidth={3} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelect(i)}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">
                            {String(lessonIdx + 1).padStart(2, "0")}
                          </span>
                          <span
                            className={cn(
                              "min-w-0 flex-1 truncate text-sm",
                              isActive ? "font-semibold" : done[i] && "text-muted-foreground",
                            )}
                          >
                            {lesson.title}
                          </span>
                          <span className="shrink-0 rounded bg-secondary px-2 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                            {lesson.duration}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type SmartPauseStatus = {
  isSmartPaused: boolean;
  countdownSecs: number | null;
  smartPauseDelay: number;
  resumePlaybackNow: (shouldRewind?: boolean) => void;
};

function getTranscriptSuggestion(
  textBefore: string,
  cues: TranscriptCue[],
): { completion: string; fullPhrase: string } | null {
  if (cues.length === 0) return null;
  const match = /(\S+(?:\s+\S+){0,2})$/.exec(textBefore);
  if (!match) return null;
  const prefix = match[1]!.toLowerCase();
  if (prefix.length < 3) return null;

  for (const cue of cues) {
    const line = cue.text;
    const lower = line.toLowerCase();
    const idx = lower.indexOf(prefix);
    if (idx !== -1 && (idx === 0 || /\s/.test(lower[idx - 1]!))) {
      const rest = line.slice(idx + prefix.length).replace(/[.,;!?]+$/, "");
      if (rest.trim().length >= 2) {
        return { completion: rest, fullPhrase: line };
      }
    }
  }
  return null;
}

function RichNoteEditor({
  courseId,
  content,
  onChange,
  onSubmit,
  onCancel,
  onCaptureScreenshot,
  onOpenImage,
  onPlay,
  onPause,
  getPlaybackState,
  onSeek,
  transcriptCues,
  autocompleteEnabled,
  smartPauseEnabled,
  smartPauseDelay,
  smartPauseRewind,
  placeholder = "Write a note…",
  onSmartPauseChange,
}: {
  courseId: string;
  content: string;
  onChange: (html: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onCaptureScreenshot: () => Promise<string>;
  onOpenImage?: ((src: string) => void) | undefined;
  onPlay: () => void;
  onPause: () => void;
  getPlaybackState: () => { isPlaying: boolean; currentTime: number };
  onSeek: (t: number) => void;
  transcriptCues: TranscriptCue[];
  autocompleteEnabled: boolean;
  smartPauseEnabled: boolean;
  smartPauseDelay: number;
  smartPauseRewind: boolean;
  placeholder?: string;
  onSmartPauseChange?: (state: SmartPauseStatus | null) => void;
}) {
  const [isSmartPaused, setIsSmartPaused] = useState(false);
  const [countdownSecs, setCountdownSecs] = useState<number | null>(null);
  const isSmartPausedRef = useRef(false);
  const wasPlayingWhenStartedRef = useRef(false);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingStartTimeRef = useRef<number>(0);

  const onPlayRef = useRef(onPlay);
  onPlayRef.current = onPlay;
  const onPauseRef = useRef(onPause);
  onPauseRef.current = onPause;
  const onSeekRef = useRef(onSeek);
  onSeekRef.current = onSeek;
  const getPlaybackStateRef = useRef(getPlaybackState);
  getPlaybackStateRef.current = getPlaybackState;
  const smartPauseRewindRef = useRef(smartPauseRewind);
  smartPauseRewindRef.current = smartPauseRewind;

  const cleanupSmartTimers = useCallback(() => {
    if (resumeTimerRef.current) {
      clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setCountdownSecs(null);
  }, []);

  const resumePlaybackNow = useCallback(
    (shouldRewind = true) => {
      cleanupSmartTimers();
      if (isSmartPausedRef.current && wasPlayingWhenStartedRef.current) {
        if (shouldRewind && smartPauseRewindRef.current) {
          const cur = getPlaybackStateRef.current().currentTime;
          if (typeof cur === "number" && cur > 0) {
            onSeekRef.current(Math.max(0, cur - 1.5));
          }
        }
        onPlayRef.current();
      }
      isSmartPausedRef.current = false;
      wasPlayingWhenStartedRef.current = false;
      setIsSmartPaused(false);
    },
    [cleanupSmartTimers],
  );

  const triggerWritingActivity = useCallback(() => {
    if (!smartPauseEnabled) return;
    if (!isSmartPausedRef.current) {
      const pbState = getPlaybackStateRef.current();
      if (pbState.isPlaying) {
        wasPlayingWhenStartedRef.current = true;
        isSmartPausedRef.current = true;
        setIsSmartPaused(true);
        onPauseRef.current();
      } else {
        return;
      }
    }

    if (wasPlayingWhenStartedRef.current) {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

      const delay = Math.max(0.5, smartPauseDelay);
      typingStartTimeRef.current = Date.now();
      setCountdownSecs(Number(delay.toFixed(1)));

      countdownIntervalRef.current = setInterval(() => {
        const elapsed = (Date.now() - typingStartTimeRef.current) / 1000;
        const left = Math.max(0, delay - elapsed);
        setCountdownSecs(Number(left.toFixed(1)));
        if (left <= 0 && countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
      }, 100);

      resumeTimerRef.current = setTimeout(() => {
        resumePlaybackNow(true);
      }, delay * 1000);
    }
  }, [smartPauseEnabled, smartPauseDelay, resumePlaybackNow]);

  useEffect(() => {
    onSmartPauseChange?.({
      isSmartPaused,
      countdownSecs,
      smartPauseDelay,
      resumePlaybackNow,
    });
  }, [isSmartPaused, countdownSecs, smartPauseDelay, resumePlaybackNow, onSmartPauseChange]);

  useEffect(() => {
    return () => {
      onSmartPauseChange?.(null);
      if (isSmartPausedRef.current && wasPlayingWhenStartedRef.current) {
        onPlayRef.current();
      }
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [onSmartPauseChange]);

  const getSuggestionFn = useCallback(
    (textBefore: string) => getTranscriptSuggestion(textBefore, transcriptCues),
    [transcriptCues],
  );

  return (
    <RichNoteSurface
      courseId={courseId}
      content={content}
      onChange={onChange}
      onSubmit={onSubmit}
      onCancel={onCancel}
      onCaptureScreenshot={onCaptureScreenshot}
      onOpenImage={onOpenImage}
      getSuggestion={autocompleteEnabled ? getSuggestionFn : undefined}
      onWritingActivity={triggerWritingActivity}
      onSuspendSmartTimers={cleanupSmartTimers}
      placeholder={placeholder}
    />
  );
}

function NotesTab({
  courseId,
  lessonId,
  lessonIdx,
  lessonTitle,
  transcriptCues,
  time,
  seek,
  onCaptureFrame,
  onPlay,
  onPause,
  getPlaybackState,
}: {
  courseId: string;
  lessonId?: string | undefined;
  lessonIdx: number;
  lessonTitle: string;
  transcriptCues: TranscriptCue[];
  time: number;
  seek: (t: number) => void;
  onCaptureFrame: () => Promise<string>;
  onPlay: () => void;
  onPause: () => void;
  getPlaybackState: () => { isPlaying: boolean; currentTime: number };
}) {
  const [notes, setNotes] = useState<NoteItem[]>(() => getCourseNotes(courseId));
  const [showAddNote, setShowAddNote] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteContent, setNoteContent] = useState("");
  const [noteTimestamp, setNoteTimestamp] = useState<number | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [previewImage, setPreviewImage] = useState<{
    src: string;
    timestamp: number;
    videoTitle: string;
  } | null>(null);

  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [autocompleteEnabled, setAutocompleteEnabled] = useState(true);
  const [smartPauseEnabled, setSmartPauseEnabled] = useState(true);
  const [smartPauseDelay, setSmartPauseDelay] = useState(2.5);
  const [smartPauseRewind, setSmartPauseRewind] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [smartPauseState, setSmartPauseState] = useState<SmartPauseStatus | null>(null);
  const isSavingNoteRef = useRef(false);

  useEffect(() => {
    setNotes(getCourseNotes(courseId));
  }, [courseId]);

  useEffect(() => {
    return subscribeCourseNotesChanged(courseId, (nextNotes) => {
      setNotes(nextNotes);
    });
  }, [courseId]);

  // Reset active editor when switching lessons
  useEffect(() => {
    setShowAddNote(false);
    setEditingNoteId(null);
    setNoteContent("");
    setNoteTimestamp(null);
    setEditorKey((k) => k + 1);
  }, [lessonIdx]);

  // Close screenshot lightbox on Escape
  useEffect(() => {
    if (!previewImage) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewImage(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewImage]);

  const lessonNotes = useMemo(() => {
    const filtered = notes.filter((n) =>
      lessonId && n.videoId ? n.videoId === lessonId : n.lessonIdx === lessonIdx,
    );
    return [...filtered].sort((a, b) => {
      if (sortOrder === "asc") {
        return a.timestamp !== b.timestamp ? a.timestamp - b.timestamp : a.createdAt - b.createdAt;
      }
      return a.timestamp !== b.timestamp ? b.timestamp - a.timestamp : b.createdAt - a.createdAt;
    });
  }, [notes, lessonId, lessonIdx, sortOrder]);

  const openNewNote = (initialHtml = "") => {
    setEditingNoteId(null);
    setNoteContent(initialHtml);
    setNoteTimestamp(time);
    setEditorKey((k) => k + 1);
    setShowAddNote(true);
  };

  const handleSaveNewNote = async () => {
    if (isSavingNoteRef.current || !hasMeaningfulHtmlContent(noteContent)) return;
    isSavingNoteRef.current = true;
    const newNote: NoteItem = {
      id: generateId("note"),
      courseId,
      videoId: lessonId,
      lessonIdx,
      timestamp: noteTimestamp ?? time,
      content: noteContent,
      images: extractImagesFromHtml(noteContent),
      createdAt: Date.now(),
    };
    try {
      await createNoteOnServer(courseId, newNote);
      setNotes(getCourseNotes(courseId));
      setNoteContent("");
      setShowAddNote(false);
      setNoteTimestamp(null);
      setEditorKey((k) => k + 1);
    } catch {
      toast.error("Failed to save note");
    } finally {
      isSavingNoteRef.current = false;
    }
  };

  const handleUpdateNote = () => {
    if (!editingNoteId || !hasMeaningfulHtmlContent(noteContent)) return;
    const updated = updateCourseNoteContent(courseId, editingNoteId, noteContent);
    setNotes(updated);
    setEditingNoteId(null);
    setNoteContent("");
    setEditorKey((k) => k + 1);
  };

  const handleDeleteNote = (id: string) => {
    const updated = deleteCourseNoteById(courseId, id);
    setNotes(updated);
    toast("Note deleted");
  };

  const handleCopyNote = (html: string) => {
    navigator.clipboard?.writeText(noteHtmlToMarkdown(html) || stripHtmlToText(html));
    toast("Note copied");
  };

  const cancelEditor = () => {
    setShowAddNote(false);
    setEditingNoteId(null);
    setNoteContent("");
    setNoteTimestamp(null);
    setEditorKey((k) => k + 1);
  };

  const exportNotes = () => {
    if (lessonNotes.length === 0) return;
    const markdown = lessonNotes
      .map((note) => {
        const ts = fmt(note.timestamp);
        const text = noteHtmlToMarkdown(note.content) || stripHtmlToText(note.content);
        const imgCount = note.images.length;
        const imgSuffix = imgCount > 0 ? `\n[${imgCount} screenshot(s) attached]` : "";
        return `## ${ts}\n${text}${imgSuffix}\n`;
      })
      .join("\n---\n\n");

    const header = `# ${lessonTitle}\n\n`;
    const url = URL.createObjectURL(new Blob([header + markdown], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${lessonTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-notes.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Unified Single-Row Top Action Bar (aligned to 12px px-3) */}
      <div className="px-3 pb-3 pt-1">
        <div className="flex items-center gap-1">
          {/* 1. Primary Add Note Button */}
          <Button
            type="button"
            size="sm"
            onClick={() => openNewNote("")}
            title={`Add note at ${fmt(time)}`}
            className="h-9 min-w-0 flex-1 gap-1.5 rounded-lg px-2.5 text-xs font-semibold"
          >
            <Plus className="size-3.5 shrink-0" />
            <span className="truncate">Add note · {fmt(time)}</span>
          </Button>

          {/* 2. Borderless Sort Order Toggle */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))}
            disabled={lessonNotes.length <= 1}
            aria-label={sortOrder === "asc" ? "Oldest first" : "Latest first"}
            title={sortOrder === "asc" ? "Oldest first" : "Latest first"}
            className="size-9 shrink-0 rounded-md text-muted-foreground hover:text-foreground"
          >
            {sortOrder === "asc" ? <ArrowUpNarrowWide /> : <ArrowDownWideNarrow />}
          </Button>

          {/* 3. Borderless 3-Dots Options Menu */}
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Note options"
                title="Note options"
                className={cn(
                  "size-9 shrink-0 rounded-md text-muted-foreground hover:text-foreground",
                  menuOpen && "bg-accent text-foreground",
                )}
              >
                <MoreVertical />
              </Button>
            </PopoverTrigger>

            <PopoverContent
              align="end"
              sideOffset={6}
              className="w-64 rounded-xl border-0 bg-popover p-1.5 text-xs text-popover-foreground shadow-workspace"
            >
              {/* Actions */}
              <div className="space-y-0.5">
                <button
                  type="button"
                  disabled={lessonNotes.length === 0}
                  onClick={() => {
                    exportNotes();
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40"
                >
                  <Download className="size-3.5 text-muted-foreground" />
                  <span>Export notes</span>
                </button>

                <Link
                  to="/canvas/$courseId"
                  params={{ courseId }}
                  onClick={() => setMenuOpen(false)}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <LayoutGrid className="size-3.5 text-muted-foreground" />
                  <span>Open canvas</span>
                </Link>
              </div>

              <div className="my-1 border-t border-border" />

              {/* While writing (Smart Pause settings) */}
              <div className="px-2.5 py-2">
                <p className="mb-2 text-[11px] font-semibold text-muted-foreground">
                  While writing
                </p>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <label
                      htmlFor="notes-pause-video"
                      className="cursor-pointer select-none text-xs text-foreground"
                    >
                      Pause video
                    </label>
                    <Switch
                      id="notes-pause-video"
                      checked={smartPauseEnabled}
                      onCheckedChange={setSmartPauseEnabled}
                    />
                  </div>

                  <div
                    className={cn(
                      "space-y-3 transition-opacity",
                      !smartPauseEnabled && "pointer-events-none opacity-45",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="select-none text-xs text-foreground">Resume after</span>
                      <div className="flex items-center rounded-lg bg-secondary/75 p-0.5">
                        <button
                          type="button"
                          aria-label="Decrease resume delay"
                          onClick={() =>
                            setSmartPauseDelay((d) => Math.max(0.5, Number((d - 0.5).toFixed(1))))
                          }
                          className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                        >
                          <Minus className="size-3" />
                        </button>
                        <span className="min-w-9 px-1 text-center font-mono text-xs font-semibold tabular-nums text-foreground">
                          {smartPauseDelay}s
                        </span>
                        <button
                          type="button"
                          aria-label="Increase resume delay"
                          onClick={() =>
                            setSmartPauseDelay((d) => Math.min(30, Number((d + 0.5).toFixed(1))))
                          }
                          className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                        >
                          <Plus className="size-3" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <label
                        htmlFor="notes-rewind-resume"
                        className="cursor-pointer select-none text-xs text-foreground"
                      >
                        Rewind on resume
                      </label>
                      <Switch
                        id="notes-rewind-resume"
                        checked={smartPauseRewind}
                        onCheckedChange={setSmartPauseRewind}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="my-1 border-t border-border" />

              {/* Autocomplete toggle */}
              <div className="flex items-center justify-between gap-3 px-2.5 py-2">
                <label
                  htmlFor="notes-autocomplete"
                  className="cursor-pointer select-none text-xs font-medium text-foreground"
                >
                  Autocomplete
                </label>
                <Switch
                  id="notes-autocomplete"
                  checked={autocompleteEnabled}
                  onCheckedChange={setAutocompleteEnabled}
                />
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Scrollable Note Composer + Note Cards List (aligned to 12px px-3) */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-4 custom-scrollbar-sm">
        {/* New Note Composer Card */}
        {showAddNote && !editingNoteId && (
          <div className="overflow-hidden rounded-xl bg-background ring-1 ring-primary/35 shadow-card">
            <div className="flex items-center justify-between bg-secondary/35 px-3 pb-1.5 pt-2.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-0.5 font-mono text-xs font-semibold tabular-nums text-primary">
                <Clock className="size-3" /> {fmt(noteTimestamp ?? time)}
              </span>
              <button
                type="button"
                aria-label="Cancel"
                title="Close (Esc)"
                onClick={cancelEditor}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>

            <RichNoteEditor
              key={`add-${editorKey}`}
              courseId={courseId}
              transcriptCues={transcriptCues}
              content={noteContent}
              onChange={setNoteContent}
              onSubmit={() => void handleSaveNewNote()}
              onCancel={cancelEditor}
              onCaptureScreenshot={onCaptureFrame}
              onOpenImage={(src) =>
                setPreviewImage({
                  src,
                  timestamp: noteTimestamp ?? time,
                  videoTitle: lessonTitle,
                })
              }
              onPlay={onPlay}
              onPause={onPause}
              getPlaybackState={getPlaybackState}
              onSeek={seek}
              autocompleteEnabled={autocompleteEnabled}
              smartPauseEnabled={smartPauseEnabled}
              smartPauseDelay={smartPauseDelay}
              smartPauseRewind={smartPauseRewind}
              onSmartPauseChange={setSmartPauseState}
              placeholder="Write a note… (type # for heading, - for list, or paste an image)"
            />

            <NoteEditorFooter
              smartPauseState={smartPauseState}
              smartPauseDelay={smartPauseDelay}
              onCancel={cancelEditor}
              onSave={() => void handleSaveNewNote()}
              saveLabel="Add note"
              isAdd
            />
          </div>
        )}

        {/* Saved Note Cards */}
        {lessonNotes.length === 0 && !showAddNote ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <p className="text-sm text-muted-foreground">No notes yet.</p>
          </div>
        ) : (
          lessonNotes.map((note) => {
            const isEditing = editingNoteId === note.id;
            return (
              <div
                key={note.id}
                className={cn(
                  "group overflow-hidden rounded-lg bg-secondary/55 transition-colors hover:bg-secondary/75",
                  isEditing &&
                    "rounded-xl bg-background ring-1 ring-primary/35 shadow-card hover:bg-background",
                )}
              >
                {isEditing ? (
                  <>
                    <div className="flex items-center justify-between bg-secondary/35 px-3 pb-1.5 pt-2.5">
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-0.5 font-mono text-xs font-semibold tabular-nums text-primary">
                        <Clock className="size-3" /> {fmt(note.timestamp)}
                      </span>
                      <button
                        type="button"
                        aria-label="Cancel"
                        onClick={cancelEditor}
                        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>

                    <RichNoteEditor
                      key={`edit-${note.id}-${editorKey}`}
                      courseId={courseId}
                      transcriptCues={transcriptCues}
                      content={noteContent}
                      onChange={setNoteContent}
                      onSubmit={handleUpdateNote}
                      onCancel={cancelEditor}
                      onCaptureScreenshot={onCaptureFrame}
                      onOpenImage={(src) =>
                        setPreviewImage({
                          src,
                          timestamp: note.timestamp,
                          videoTitle: lessonTitle,
                        })
                      }
                      onPlay={onPlay}
                      onPause={onPause}
                      getPlaybackState={getPlaybackState}
                      onSeek={seek}
                      autocompleteEnabled={autocompleteEnabled}
                      smartPauseEnabled={smartPauseEnabled}
                      smartPauseDelay={smartPauseDelay}
                      smartPauseRewind={smartPauseRewind}
                      onSmartPauseChange={setSmartPauseState}
                      placeholder="Edit note…"
                    />

                    <NoteEditorFooter
                      smartPauseState={smartPauseState}
                      smartPauseDelay={smartPauseDelay}
                      onCancel={cancelEditor}
                      onSave={handleUpdateNote}
                      saveLabel="Save"
                    />
                  </>
                ) : (
                  <div className="space-y-2 p-3 pb-4.5">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => seek(note.timestamp)}
                        title={`Seek to ${fmt(note.timestamp)}`}
                        className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-0.5 font-mono text-xs font-semibold tabular-nums text-primary transition-colors hover:bg-primary/20"
                      >
                        <Clock className="size-3" />
                        {fmt(note.timestamp)}
                      </button>

                      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        <button
                          type="button"
                          aria-label="Copy note"
                          title="Copy note"
                          onClick={() => handleCopyNote(note.content)}
                          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
                        >
                          <Copy className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="Edit note"
                          title="Edit note"
                          onClick={() => {
                            setShowAddNote(false);
                            setEditingNoteId(note.id);
                            setNoteContent(note.content);
                            setEditorKey((k) => k + 1);
                          }}
                          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="Delete note"
                          title="Delete note"
                          onClick={() => handleDeleteNote(note.id)}
                          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>

                    <RichNoteHtmlContent
                      html={note.content}
                      onHtmlChange={(nextHtml) => {
                        setNotes(updateCourseNoteContent(courseId, note.id, nextHtml));
                      }}
                      onDoubleClick={() => {
                        setShowAddNote(false);
                        setEditingNoteId(note.id);
                        setNoteContent(note.content);
                        setEditorKey((k) => k + 1);
                      }}
                      onImageClick={(src) => {
                        setPreviewImage({
                          src,
                          timestamp: note.timestamp,
                          videoTitle: lessonTitle,
                        });
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Fullscreen Screenshot Lightbox */}
      {previewImage && (
        <ImageLightboxModal
          src={previewImage.src}
          alt="Note screenshot preview"
          downloadName={`screenshot-${fmt(previewImage.timestamp).replace(":", "-")}.png`}
          onClose={() => setPreviewImage(null)}
        />
      )}
    </div>
  );
}

function NoteEditorFooter({
  smartPauseState,
  smartPauseDelay,
  onCancel,
  onSave,
  saveLabel,
  isAdd = false,
}: {
  smartPauseState: SmartPauseStatus | null;
  smartPauseDelay: number;
  onCancel: () => void;
  onSave: () => void;
  saveLabel: string;
  isAdd?: boolean;
}) {
  return (
    <div className="flex min-h-[44px] items-center justify-between border-t border-border/50 bg-secondary/25 px-3 py-2">
      <div className="flex items-center">
        {smartPauseState?.isSmartPaused && (
          <div className="flex items-center gap-2 rounded-lg bg-primary-soft px-2 py-1 text-xs font-medium text-primary">
            <Zap className="size-3.5 fill-current" />
            <div
              className="relative h-1.5 w-14 overflow-hidden rounded-full bg-primary/20"
              title={
                smartPauseState.countdownSecs !== null
                  ? `Resuming in ${smartPauseState.countdownSecs}s`
                  : "Resuming soon"
              }
            >
              <div
                className="h-full rounded-full bg-primary transition-all duration-100 ease-linear"
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(
                      0,
                      ((smartPauseState.countdownSecs ?? smartPauseDelay) /
                        (smartPauseState.smartPauseDelay || smartPauseDelay)) *
                        100,
                    ),
                  )}%`,
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => smartPauseState.resumePlaybackNow(false)}
              className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Resume
            </button>
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 rounded-md px-2.5 text-xs"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button type="button" size="sm" className="h-7 rounded-md px-2.5 text-xs" onClick={onSave}>
          {isAdd ? <Plus className="size-3.5" /> : <Check className="size-3.5" />} {saveLabel}
        </Button>
      </div>
    </div>
  );
}

function TranscriptTab({
  videoId,
  youtubeId,
  availableTracks,
  selectedLang,
  onSelectLang,
  dubLanguages,
  selectedDubLang,
  onSelectDubLang,
  onDeleteDubTrack,
  cues,
  cuesLoading,
  time,
  seek,
  onImportSubtitles,
  onOpenAiModal,
  onSetMaster,
  onSetSource,
  onDeleteTrack,
  onTranscriptReload,
  aiPanel,
}: {
  videoId?: string | undefined;
  youtubeId?: string | null | undefined;
  availableTracks: TranscriptTrack[];
  selectedLang: string | null;
  onSelectLang: (trackId: string) => void;
  dubLanguages: string[];
  selectedDubLang: string;
  onSelectDubLang: (lang: string) => void;
  onDeleteDubTrack: (lang: string) => void;
  cues: TranscriptCue[];
  cuesLoading: boolean;
  time: number;
  seek: (t: number, options?: { minLockTime?: number }) => void;
  onImportSubtitles: () => void;
  onOpenAiModal: (mode: "transcribe" | "translate", targetLang?: string) => void;
  onSetMaster: (trackId: string) => void;
  onSetSource: (trackId: string) => void;
  onDeleteTrack: (trackId: string) => void;
  onTranscriptReload: () => void;
  aiPanel?: ReactNode;
}) {
  const [fetchingYt, setFetchingYt] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);
  const activeJob = useVideoTranscriptJob(videoId);

  const resolvedSelectedId = resolveBestTrackId(availableTracks, selectedLang);
  const currentTrack =
    (resolvedSelectedId ? availableTracks.find((t) => t.id === resolvedSelectedId) : null) ??
    availableTracks[0] ??
    null;

  const effectiveSourceId = useMemo(() => {
    return (
      availableTracks.find((t) => t.is_ai_source)?.id ??
      availableTracks.find((t) => t.is_master)?.id ??
      availableTracks[0]?.id ??
      null
    );
  }, [availableTracks]);

  const activeIdx = useMemo(() => {
    if (cues.length === 0) return -1;
    const exact = findActiveCueIndex(cues, time, false);
    if (exact >= 0) return exact;
    let lastBefore = -1;
    for (let i = 0; i < cues.length; i++) {
      if (cues[i]!.start <= time) lastBefore = i;
      else break;
    }
    return lastBefore;
  }, [cues, time]);

  useEffect(() => {
    if (activeIdx < 0) return;
    const list = listRef.current;
    const el = list?.children[activeIdx] as HTMLElement | undefined;
    if (list && el) {
      list.scrollTo({
        top: el.offsetTop - list.clientHeight / 2 + el.clientHeight / 2,
        behavior: "smooth",
      });
    }
  }, [activeIdx]);

  const handleFetchYoutubeTranscript = async () => {
    if (!youtubeId || !videoId) return;
    setFetchingYt(true);
    try {
      const langParam =
        currentTrack && currentTrack.lang !== "source"
          ? `&lang=${encodeURIComponent(currentTrack.lang)}`
          : "";
      const res = await fetch(
        apiUrl(
          `/api/youtube/transcript?videoId=${encodeURIComponent(youtubeId)}&dbVideoId=${encodeURIComponent(videoId)}${langParam}`,
        ),
      );
      if (!res.ok) throw new Error("YouTube subtitles unavailable");
      const data = (await res.json()) as { chunks?: TranscriptCue[]; lang?: string };
      if (Array.isArray(data.chunks) && data.chunks.length > 0) {
        onTranscriptReload();
        toast.success("Fetched YouTube subtitles");
      } else {
        toast.error("No subtitles returned for this YouTube video");
      }
    } catch {
      toast.error("Could not fetch YouTube subtitles");
    } finally {
      setFetchingYt(false);
    }
  };

  const isJobActive = Boolean(
    activeJob && (activeJob.status === "running" || activeJob.status === "queued"),
  );
  const activeJobTrackLabel = activeJob ? `${getLanguageName(activeJob.targetLanguage)} · AI` : "";

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 px-3 pb-3 pt-1">
        <div className="flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                className={cn(
                  "t-resize relative min-w-0 flex-1 justify-between overflow-hidden rounded-lg bg-secondary/75 hover:bg-secondary",
                  isJobActive && "ai-shimmer-row border border-primary/25",
                )}
              >
                <span className="flex min-w-0 items-center gap-2 truncate">
                  <Subtitles className="shrink-0 text-primary" />
                  <span className={cn("truncate", isJobActive && "ai-shimmer-text font-medium")}>
                    {currentTrack
                      ? currentTrack.label
                      : isJobActive
                        ? activeJobTrackLabel
                        : "No subtitles"}
                  </span>
                  {currentTrack?.is_master && (
                    <span className="rounded-sm bg-chart-4/15 px-1.5 py-0.5 text-[10px] font-semibold text-chart-4">
                      Master
                    </span>
                  )}
                  {currentTrack && currentTrack.id === effectiveSourceId && (
                    <span className="rounded-sm bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                      Source
                    </span>
                  )}
                </span>
                <ChevronDown className="ml-2 shrink-0 text-muted-foreground" />
                {isJobActive && activeJob && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-secondary/60"
                  >
                    <span
                      className="block h-full bg-gradient-to-r from-primary via-chart-2 to-chart-1 transition-all duration-300"
                      style={{ width: `${Math.max(6, activeJob.progress)}%` }}
                    />
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[250px] rounded-lg p-1.5"
            >
              {availableTracks.map((tr) => {
                const isSelected = currentTrack?.id === tr.id;
                const isSource = tr.id === effectiveSourceId;
                return (
                  <DropdownMenuItem
                    key={tr.id}
                    className="rounded-md flex items-center justify-between gap-2 pr-1.5"
                    onClick={() => onSelectLang(tr.id)}
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
                      <Check
                        className={cn("size-3.5 shrink-0 text-primary", !isSelected && "opacity-0")}
                      />
                      <span className="truncate">{tr.label}</span>
                    </span>
                    <div
                      className="ml-auto flex shrink-0 items-center gap-1"
                      onPointerDown={(e) => e.stopPropagation()}
                      onPointerUp={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {tr.is_master ? (
                        <span className="rounded-sm bg-chart-4/15 px-1.5 py-0.5 text-[10px] font-semibold text-chart-4">
                          Master
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onSetMaster(tr.id);
                          }}
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
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onSetSource(tr.id);
                          }}
                          title="Set as translation source"
                          className="rounded-sm border border-dashed border-muted-foreground/35 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/70 transition-colors hover:border-primary/60 hover:bg-primary/10 hover:text-primary"
                        >
                          Source
                        </button>
                      )}
                      {videoId && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onDeleteTrack(tr.id);
                          }}
                          title="Delete track"
                          aria-label="Delete track"
                          className="rounded p-1 text-muted-foreground/75 transition-colors hover:bg-destructive/15 hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </DropdownMenuItem>
                );
              })}

              {isJobActive && activeJob && (
                <DropdownMenuItem
                  className="ai-shimmer-row t-resize relative mt-0.5 flex items-center justify-between gap-2 overflow-hidden rounded-md border border-primary/20 py-2 pr-1.5"
                  onClick={() => onOpenAiModal(activeJob.mode, activeJob.targetLanguage)}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
                    <Check className="size-3.5 shrink-0 opacity-0" />
                    <span className="ai-shimmer-text truncate font-medium">
                      {activeJobTrackLabel}
                    </span>
                  </span>
                  <div
                    className="ml-auto flex shrink-0 items-center gap-1.5"
                    onPointerDown={(e) => e.stopPropagation()}
                    onPointerUp={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="font-mono text-[11px] font-semibold text-primary tabular-nums">
                      {activeJob.status === "queued" ? "Queued" : `${activeJob.progress}%`}
                    </span>
                    {videoId && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          cancelTranscriptJob(videoId);
                        }}
                        title="Cancel"
                        aria-label="Cancel"
                        className="rounded p-1 text-muted-foreground/75 transition-colors hover:bg-destructive/15 hover:text-destructive"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-secondary/60"
                  >
                    <span
                      className="block h-full bg-gradient-to-r from-primary via-chart-2 to-chart-1 transition-all duration-300"
                      style={{ width: `${Math.max(6, activeJob.progress)}%` }}
                    />
                  </span>
                </DropdownMenuItem>
              )}

              {(availableTracks.length > 0 || isJobActive) && <DropdownMenuSeparator />}
              <DropdownMenuItem
                className="rounded-md text-primary focus:text-primary"
                onClick={() =>
                  onOpenAiModal(availableTracks.length > 0 ? "translate" : "transcribe")
                }
              >
                <Sparkles /> Generate / translate…
              </DropdownMenuItem>
              <DropdownMenuItem className="rounded-md" onClick={onImportSubtitles}>
                <Upload /> Import subtitles…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                className="min-w-0 flex-1 justify-between rounded-lg bg-secondary/75 hover:bg-secondary"
              >
                <span className="flex min-w-0 items-center gap-2 truncate">
                  <Mic className="shrink-0 text-primary" />
                  <span className="truncate">
                    {selectedDubLang === "original"
                      ? "Original audio"
                      : `${getLanguageName(selectedDubLang)} · Dub`}
                  </span>
                </span>
                <ChevronDown className="shrink-0 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[250px] rounded-lg p-1.5"
            >
              <DropdownMenuItem
                className="rounded-md flex items-center gap-1.5"
                onClick={() => onSelectDubLang("original")}
              >
                <Check
                  className={cn(
                    "size-3.5 shrink-0 text-primary",
                    selectedDubLang !== "original" && "opacity-0",
                  )}
                />
                <span className="truncate">Original audio</span>
              </DropdownMenuItem>
              {dubLanguages.map((lang) => {
                const isSelected = selectedDubLang === lang;
                return (
                  <DropdownMenuItem
                    key={lang}
                    className="rounded-md flex items-center justify-between gap-2 pr-1.5"
                    onClick={() => onSelectDubLang(lang)}
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
                      <Check
                        className={cn("size-3.5 shrink-0 text-primary", !isSelected && "opacity-0")}
                      />
                      <span className="truncate">{getLanguageName(lang)} · Dub</span>
                    </span>
                    {videoId && (
                      <div
                        className="ml-auto flex shrink-0 items-center"
                        onPointerDown={(e) => e.stopPropagation()}
                        onPointerUp={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onDeleteDubTrack(lang);
                          }}
                          title="Delete dub track"
                          aria-label="Delete dub track"
                          className="rounded p-1 text-muted-foreground/75 transition-colors hover:bg-destructive/15 hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    )}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {aiPanel}
      </div>

      {cuesLoading ? (
        <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
          Loading subtitles…
        </div>
      ) : cues.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          {isJobActive && activeJob ? (
            <div className="t-resize flex flex-col items-center gap-2">
              <div className="space-y-1">
                <p className="ai-shimmer-text text-sm font-medium">{activeJob.message}</p>
                <p className="font-mono text-xs text-muted-foreground tabular-nums">
                  {activeJobTrackLabel} · {activeJob.progress}%
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => videoId && cancelTranscriptJob(videoId)}
                className="mt-1 h-7 rounded-md px-2.5 text-xs text-muted-foreground hover:text-destructive"
              >
                Cancel
              </Button>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">No subtitles yet.</p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onOpenAiModal("transcribe")}
                  className="rounded-md"
                >
                  <Sparkles className="size-3.5" /> Generate AI
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={onImportSubtitles}
                  className="rounded-md"
                >
                  <Upload className="size-3.5" /> Import file
                </Button>
                {youtubeId && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={fetchingYt}
                    onClick={() => void handleFetchYoutubeTranscript()}
                    className="rounded-md"
                  >
                    {fetchingYt ? "Fetching…" : "Fetch YouTube"}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      ) : (
        <ol
          ref={listRef}
          dir={currentTrack?.rtl ? "rtl" : "ltr"}
          className="relative min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-4 custom-scrollbar-sm"
        >
          {cues.map((cue, i) => (
            <li key={`${cue.start}-${i}`}>
              <button
                type="button"
                onClick={() => {
                  const span = Math.max(0, cue.end - cue.start);
                  const nudge = span > 0 ? Math.min(0.035, span * 0.2) : 0.025;
                  seek(cue.start + nudge, { minLockTime: cue.start });
                }}
                className={cn(
                  "flex w-full gap-3 rounded-lg px-3 py-2.5 text-start transition-colors duration-300 hover:bg-secondary/60",
                  i === activeIdx && "bg-primary-soft hover:bg-primary-soft",
                )}
              >
                <span
                  dir="ltr"
                  className={cn(
                    "mt-0.5 h-fit shrink-0 rounded bg-secondary px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-muted-foreground",
                    i === activeIdx && "bg-primary text-primary-foreground",
                  )}
                >
                  {fmt(cue.start)}
                </span>
                <span
                  className={cn(
                    "text-sm leading-6 text-muted-foreground",
                    i === activeIdx && "text-foreground",
                  )}
                >
                  {cue.text}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
