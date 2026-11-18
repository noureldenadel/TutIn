import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
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
import { VideoCaptionOverlay } from "@/components/player/video-caption-overlay";
import {
  arePlayerShortcutsEnabled,
  COURSE_UI_PREFS_CHANGED_EVENT,
  readAppSettings,
  readCourseUiPrefs,
  readSessionNoteDraft,
  readSessionScroll,
  SETTINGS_CHANGED_EVENT,
  updateCourseUiPrefs,
  writeAppSettings,
  writeSessionNoteDraft,
  writeSessionScroll,
  type CaptionFontSize,
  type CaptionPosition,
  type NotesSortOrder,
} from "@/lib/app-settings";
import { formatTrackDisplayLabel, getLanguageLabel, getLanguageName } from "@/lib/languages";
import {
  DUB_UPDATED_EVENT,
  TRANSCRIPT_UPDATED_EVENT,
  deleteSubtitleTrack,
  setSubtitleTrackMaster,
  setSubtitleTrackSource,
  useVideoTranscriptJob,
  type DubTrackMeta,
} from "@/lib/transcript-ai";
import { TranscriptTranslateModal } from "@/components/modals/transcript-translate-modal";
import { AiJobTraceCard } from "@/components/shared/ai-job-trace";
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

const HOLD_SPEED_RATE = 2;
const SPACE_HOLD_DELAY_MS = 220;
const POINTER_HOLD_DELAY_MS = 500;
const AUTOPLAY_COUNTDOWN_MS = 3000;
const CURTAIN_FADE_OUT_MS = 160;
const CURTAIN_MAX_HOLD_MS = 900;
const COUNTDOWN_RING_RADIUS = 26;
const COUNTDOWN_RING_CIRCUMFERENCE = 2 * Math.PI * COUNTDOWN_RING_RADIUS;
const PLAYER_SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 2] as const;

interface AutoplayCountdownTarget {
  lessonIdx: number;
  lessonId: string;
  title: string;
}

function matchesDigitShortcut(e: KeyboardEvent): number | null {
  if (e.shiftKey) return null;
  if (/^[0-9]$/.test(e.key)) return Number(e.key);
  if (/^Digit[0-9]$/.test(e.code)) return Number(e.code.slice(5));
  return null;
}

function isPlayerEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.closest('[contenteditable="true"]'),
  );
}

function isPlayerSliderTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('[role="slider"]'));
}

function matchesShortcutKey(e: KeyboardEvent, char: string, code: string): boolean {
  return e.key.toLowerCase() === char || (!/^[a-z]$/i.test(e.key) && e.code === code);
}

function isSliderOwnedNavigationKey(e: KeyboardEvent): boolean {
  return (
    e.key === "ArrowLeft" ||
    e.key === "ArrowRight" ||
    e.key === "ArrowUp" ||
    e.key === "ArrowDown" ||
    e.key === "Home" ||
    e.key === "End"
  );
}

type ShortcutHudIcon =
  | "play"
  | "pause"
  | "captions-on"
  | "captions-off"
  | "mute"
  | "volume"
  | "speed"
  | "seek-back"
  | "seek-forward"
  | "sidebar-hide"
  | "sidebar-show"
  | "pip";

type CenterFeedback =
  | { type: "play"; id: number }
  | { type: "pause"; id: number }
  | { type: "captions"; state: "on" | "off" | "none"; label: string; id: number };

type SideSeekState = {
  direction: "left" | "right";
  seconds: number;
  id: number;
};

function isPlayerInteractiveChildTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      'button, a[href], input, select, textarea, [role="slider"], [role="button"], [role="menuitem"], [role="menuitemradio"], [role="switch"], [role="tab"], [data-no-speed-boost="true"]',
    ),
  );
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
  const [volume, setVolume] = useState(() => readAppSettings().playerVolume);
  const [muted, setMuted] = useState(() => readAppSettings().playerMuted);
  const [speed, setSpeed] = useState(() => readAppSettings().playbackSpeed);
  const [speedBoostActive, setSpeedBoostActive] = useState(false);
  const effectiveSpeed = speedBoostActive ? HOLD_SPEED_RATE : speed;
  const [autoplay, setAutoplay] = useState(() => readAppSettings().autoPlay);
  const [remainingTime, setRemainingTime] = useState(() => readAppSettings().playerRemainingTime);
  const [subtitleTrack, setSubtitleTrack] = useState<string>(() => {
    const pref = readCourseUiPrefs(String(course.id)).subtitleTrack;
    return pref || "off";
  });
  const captionsExplicitlyOffRef = useRef<boolean>(
    readCourseUiPrefs(String(course.id)).subtitleTrack === "off",
  );
  const [transcriptLang, setTranscriptLang] = useState<string | null>(
    () => readCourseUiPrefs(String(course.id)).transcriptLang ?? null,
  );
  const [availableTracks, setAvailableTracks] = useState<TranscriptTrack[]>([]);
  const pendingTrackSelectionRef = useRef<string | null>(null);
  const dubAudioRef = useRef<HTMLAudioElement>(null);
  const lastDubLangRef = useRef<string>(readCourseUiPrefs(String(course.id)).dubLang || "original");
  const volumeRef = useRef(volume);
  const mutedRef = useRef(muted);
  const speedRef = useRef(speed);
  const effectiveSpeedRef = useRef(effectiveSpeed);
  volumeRef.current = volume;
  mutedRef.current = muted;
  speedRef.current = speed;
  effectiveSpeedRef.current = effectiveSpeed;
  const spaceHoldTimerRef = useRef<number | null>(null);
  const spacePressPendingRef = useRef(false);
  const spaceBoostActiveRef = useRef(false);
  const pointerHoldTimerRef = useRef<number | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const activePointerTypeRef = useRef<string>("");
  const pointerBoostActiveRef = useRef(false);
  const suppressNextVideoClickUntilRef = useRef(0);
  const [dubLanguages, setDubLanguages] = useState<string[]>([]);
  const [dubTracksMeta, setDubTracksMeta] = useState<DubTrackMeta[]>([]);
  const [dubRefreshTick, setDubRefreshTick] = useState(0);
  const [selectedDubLang, setSelectedDubLang] = useState<string>(
    () => readCourseUiPrefs(String(course.id)).dubLang || "original",
  );
  const [transcriptCues, setTranscriptCues] = useState<TranscriptCue[]>([]);
  const [cuesLoading, setCuesLoading] = useState(false);
  const [savedSummary, setSavedSummary] = useState("");
  const [transcriptRefreshTick, setTranscriptRefreshTick] = useState(0);
  const [isPiP, setIsPiP] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [tracksMenuOpen, setTracksMenuOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [controlsActive, setControlsActive] = useState(false);
  const controlsContentRef = useRef<HTMLDivElement>(null);
  const [controlsBarHeight, setControlsBarHeight] = useState(84);
  const [captionFontSize, setCaptionFontSize] = useState<CaptionFontSize>(
    () => readAppSettings().captionFontSize,
  );
  const [captionBackground, setCaptionBackground] = useState<boolean>(
    () => readAppSettings().captionBackground,
  );
  const [captionPosition, setCaptionPosition] = useState<CaptionPosition | null>(
    () => readAppSettings().captionPosition,
  );
  const anyPlayerMenuOpen = tracksMenuOpen || settingsMenuOpen;
  const playerControlsVisible = !playing || anyPlayerMenuOpen || controlsActive;
  const anyMenuOpenRef = useRef(false);
  anyMenuOpenRef.current = anyPlayerMenuOpen;
  const isPointerInsidePlayerRef = useRef(false);
  const isPointerOverControlsRef = useRef(false);
  const controlsHideTimerRef = useRef<number | null>(null);
  const [shortcutHud, setShortcutHud] = useState<{
    icon: ShortcutHudIcon;
    label: string;
    id: number;
  } | null>(null);
  const shortcutHudTimerRef = useRef<number | null>(null);
  const [centerFeedback, setCenterFeedback] = useState<CenterFeedback | null>(null);
  const centerFeedbackTimerRef = useRef<number | null>(null);
  const [sideSeek, setSideSeek] = useState<SideSeekState | null>(null);
  const sideSeekTimerRef = useRef<number | null>(null);
  const accumulatedSeekRef = useRef<{ direction: "left" | "right"; seconds: number } | null>(null);
  const lastMenuDismissAtRef = useRef(0);
  const seekGuardRef = useRef<{ floorTime: number; expiresAt: number } | null>(null);
  const [panelOpen, setPanelOpen] = useState(() =>
    initialTab ? true : readAppSettings().playerSidebarOpen,
  );
  const [tab, setTab] = useState<Tab>(
    () => initialTab ?? readCourseUiPrefs(String(course.id)).activeTab ?? "playlist",
  );
  const [active, setActive] = useState(
    typeof initialLessonIdx === "number" &&
      Number.isFinite(initialLessonIdx) &&
      initialLessonIdx >= 0
      ? Math.floor(initialLessonIdx)
      : 0,
  );
  const [done, setDone] = useState<boolean[]>([]);
  const [autoplayCountdownTarget, setAutoplayCountdownTarget] =
    useState<AutoplayCountdownTarget | null>(null);
  const autoplayCountdownActiveRef = useRef(false);
  autoplayCountdownActiveRef.current = Boolean(autoplayCountdownTarget);
  const [lessonCurtainVisible, setLessonCurtainVisible] = useState(false);
  const lessonCurtainVisibleRef = useRef(false);
  lessonCurtainVisibleRef.current = lessonCurtainVisible;
  const pendingTransitionIdxRef = useRef<number | null>(null);
  const pendingCurtainLessonIdRef = useRef<string | null>(null);
  const pendingAutoStartLessonIdRef = useRef<string | null>(null);
  const transitionOutTimerRef = useRef<number | null>(null);
  const curtainFallbackTimerRef = useRef<number | null>(null);

  // Sync per-course persisted UI prefs when switching courses
  useEffect(() => {
    const prefs = readCourseUiPrefs(String(course.id));
    setTab(initialTab ?? prefs.activeTab ?? "playlist");
    if (initialTab) {
      setPanelOpen(true);
    }
    captionsExplicitlyOffRef.current = prefs.subtitleTrack === "off";
    if (prefs.subtitleTrack && prefs.subtitleTrack !== "off") {
      lastSubtitleRef.current = prefs.subtitleTrack;
    }
    setTranscriptLang(prefs.transcriptLang ?? null);
    setSubtitleTrack(prefs.subtitleTrack || "off");
    const savedDub = prefs.dubLang || "original";
    lastDubLangRef.current = savedDub;
    setSelectedDubLang(savedDub);
  }, [course.id, initialTab]);

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
          const savedLastVideoId = readCourseUiPrefs(String(course.id)).lastVideoId;
          const savedVideoIdx = savedLastVideoId
            ? lessons.findIndex((l) => l.lessonId === savedLastVideoId)
            : -1;
          if (savedVideoIdx >= 0) {
            setActive(savedVideoIdx);
          } else {
            const resumeIdx = lessons.findIndex((l) => !l.isCompleted);
            setActive(resumeIdx >= 0 ? resumeIdx : 0);
          }
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
      updateCourseUiPrefs(String(course.id), { activeTab: initialTab });
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

  useEffect(() => {
    if (!initialSelectionDoneRef.current || !currentLesson?.lessonId) return;
    updateCourseUiPrefs(String(course.id), { lastVideoId: currentLesson.lessonId });
  }, [course.id, currentLesson?.lessonId]);
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
  const canHoldBoostVideo =
    !curriculumLoading && Boolean(currentLesson) && !isEmbeddedPlayer && !isExternalResourceOnly;
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

    let disposed = false;

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
      // Blob WebWorkers cannot resolve root-relative URLs without an explicit origin.
      const mpegtsUrl =
        typeof window !== "undefined"
          ? new URL(resolvedVideoSrc, window.location.href).href
          : resolvedVideoSrc;
      const player = mpegts.createPlayer(
        { type: "mpegts", url: mpegtsUrl, isLive: false },
        { enableWorker: true, lazyLoadMaxDuration: 180, seekType: "range" },
      );
      player.on(mpegts.Events.ERROR, (errorType, errorDetail) => {
        if (disposed) return;
        console.error("mpegts playback error:", errorType, errorDetail);
        toast.error("Failed to load video stream.");
      });
      player.attachMediaElement(videoRef.current);
      player.load();
      mpegtsPlayerRef.current = player;
    }

    return () => {
      disposed = true;
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
  const ytStartCacheRef = useRef<{ lessonId: string; startSec: number; autoPlay: boolean }>({
    lessonId: "",
    startSec: 0,
    autoPlay: false,
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
      autoPlay: pendingAutoStartLessonIdRef.current === currentLesson.lessonId,
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
          captionsExplicitlyOffRef.current = false;
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

  useEffect(() => {
    const onDubUpdated = (e: Event) => {
      const detail = (
        e as CustomEvent<{ videoId?: string; targetLang?: string; track?: DubTrackMeta | null }>
      ).detail;
      if (!detail?.videoId || detail.videoId === currentLesson?.lessonId) {
        if (detail?.targetLang) {
          const nextDub = detail.targetLang.toLowerCase();
          lastDubLangRef.current = nextDub;
          setSelectedDubLang(nextDub);
          updateCourseUiPrefs(String(course.id), { dubLang: nextDub });
        }
        setDubRefreshTick((n) => n + 1);
      }
    };
    window.addEventListener(DUB_UPDATED_EVENT, onDubUpdated);
    return () => window.removeEventListener(DUB_UPDATED_EVENT, onDubUpdated);
  }, [course.id, currentLesson?.lessonId]);

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
          const coursePrefs = readCourseUiPrefs(String(course.id));

          setTranscriptLang((prev) => {
            if (resolvedPending) return resolvedPending;
            const kept = resolveBestTrackId(tracks, prev);
            if (kept) return kept;
            const fromPref = resolveBestTrackId(tracks, coursePrefs.transcriptLang);
            if (fromPref) return fromPref;
            const fromPrimary = resolveBestTrackId(tracks, currentLesson.primaryTranscript);
            if (fromPrimary) return fromPrimary;
            const fromSpoken = resolveBestTrackId(tracks, course.language || "en");
            if (fromSpoken) return fromSpoken;
            return tracks[0]?.id ?? null;
          });

          setSubtitleTrack((prev) => {
            if (resolvedPending) {
              captionsExplicitlyOffRef.current = false;
              return resolvedPending;
            }
            if (captionsExplicitlyOffRef.current || coursePrefs.subtitleTrack === "off") {
              captionsExplicitlyOffRef.current = true;
              return "off";
            }
            const kept = resolveBestTrackId(tracks, prev !== "off" ? prev : null);
            if (kept) return kept;
            const fromPref = resolveBestTrackId(tracks, coursePrefs.subtitleTrack);
            if (fromPref) return fromPref;
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
    course.id,
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
      if (autoplayCountdownActiveRef.current) {
        setAutoplayCountdownTarget(null);
      }
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
  const syncMediaPlaybackRate = useCallback((rate: number) => {
    const v = videoRef.current;
    if (v && v.playbackRate !== rate) v.playbackRate = rate;
    const a = dubAudioRef.current;
    if (a && a.playbackRate !== rate) a.playbackRate = rate;
  }, []);

  const updateBoostState = useCallback(
    (source: "space" | "pointer", active: boolean) => {
      if (source === "space") {
        spaceBoostActiveRef.current = active;
      } else {
        pointerBoostActiveRef.current = active;
      }
      const nextActive = spaceBoostActiveRef.current || pointerBoostActiveRef.current;
      const nextRate = nextActive ? HOLD_SPEED_RATE : speedRef.current;
      effectiveSpeedRef.current = nextRate;
      syncMediaPlaybackRate(nextRate);
      setSpeedBoostActive(nextActive);
    },
    [syncMediaPlaybackRate],
  );

  const clearSpaceHold = useCallback(
    (restoreRate = true) => {
      if (spaceHoldTimerRef.current !== null) {
        window.clearTimeout(spaceHoldTimerRef.current);
        spaceHoldTimerRef.current = null;
      }
      spacePressPendingRef.current = false;
      if (spaceBoostActiveRef.current) {
        if (restoreRate) {
          updateBoostState("space", false);
        } else {
          spaceBoostActiveRef.current = false;
        }
      }
    },
    [updateBoostState],
  );

  const clearPointerHold = useCallback(
    (restoreRate = true) => {
      if (pointerHoldTimerRef.current !== null) {
        window.clearTimeout(pointerHoldTimerRef.current);
        pointerHoldTimerRef.current = null;
      }
      activePointerIdRef.current = null;
      activePointerTypeRef.current = "";
      if (pointerBoostActiveRef.current) {
        if (restoreRate) {
          updateBoostState("pointer", false);
        } else {
          pointerBoostActiveRef.current = false;
        }
      }
    },
    [updateBoostState],
  );

  const clearAllSpeedBoosts = useCallback(() => {
    clearSpaceHold(true);
    clearPointerHold(true);
  }, [clearPointerHold, clearSpaceHold]);

  const endPointerHold = useCallback(
    (pointerId?: number) => {
      if (pointerId !== undefined && activePointerIdRef.current !== pointerId) return;
      if (pointerBoostActiveRef.current) {
        suppressNextVideoClickUntilRef.current = performance.now() + 180;
      }
      clearPointerHold(true);
    },
    [clearPointerHold],
  );

  const focusVideoViewport = useCallback(() => {
    frameRef.current?.focus({ preventScroll: true });
  }, []);

  const clearShortcutHud = useCallback(() => {
    if (shortcutHudTimerRef.current !== null) {
      window.clearTimeout(shortcutHudTimerRef.current);
      shortcutHudTimerRef.current = null;
    }
    setShortcutHud(null);
  }, []);

  const showShortcutHud = useCallback((icon: ShortcutHudIcon, label: string) => {
    if (shortcutHudTimerRef.current !== null) {
      window.clearTimeout(shortcutHudTimerRef.current);
    }
    setShortcutHud({ icon, label, id: Date.now() });
    shortcutHudTimerRef.current = window.setTimeout(() => {
      shortcutHudTimerRef.current = null;
      setShortcutHud(null);
    }, 900);
  }, []);

  const clearCenterFeedback = useCallback(() => {
    if (centerFeedbackTimerRef.current !== null) {
      window.clearTimeout(centerFeedbackTimerRef.current);
      centerFeedbackTimerRef.current = null;
    }
    setCenterFeedback(null);
  }, []);

  const triggerCenterFeedback = useCallback((type: "play" | "pause") => {
    if (centerFeedbackTimerRef.current !== null) {
      window.clearTimeout(centerFeedbackTimerRef.current);
    }
    setCenterFeedback({ type, id: Date.now() });
    centerFeedbackTimerRef.current = window.setTimeout(() => {
      centerFeedbackTimerRef.current = null;
      setCenterFeedback(null);
    }, 500);
  }, []);

  const triggerCenterCaptionsFeedback = useCallback(
    (state: "on" | "off" | "none", label?: string) => {
      if (centerFeedbackTimerRef.current !== null) {
        window.clearTimeout(centerFeedbackTimerRef.current);
      }
      const resolvedLabel =
        state === "off"
          ? "Subtitles off"
          : state === "none"
            ? "No subtitles"
            : label
              ? `Subtitles · ${label}`
              : "Subtitles on";
      setCenterFeedback({ type: "captions", state, label: resolvedLabel, id: Date.now() });
      centerFeedbackTimerRef.current = window.setTimeout(() => {
        centerFeedbackTimerRef.current = null;
        setCenterFeedback(null);
      }, 750);
    },
    [],
  );

  const clearSideSeek = useCallback(() => {
    if (sideSeekTimerRef.current !== null) {
      window.clearTimeout(sideSeekTimerRef.current);
      sideSeekTimerRef.current = null;
    }
    accumulatedSeekRef.current = null;
    setSideSeek(null);
  }, []);

  const triggerSideSeek = useCallback((direction: "left" | "right", deltaSeconds: number) => {
    if (sideSeekTimerRef.current !== null) {
      window.clearTimeout(sideSeekTimerRef.current);
    }
    const currentAcc = accumulatedSeekRef.current;
    const nextSeconds =
      currentAcc && currentAcc.direction === direction
        ? currentAcc.seconds + deltaSeconds
        : deltaSeconds;
    accumulatedSeekRef.current = { direction, seconds: nextSeconds };
    setSideSeek({ direction, seconds: nextSeconds, id: Date.now() });
    sideSeekTimerRef.current = window.setTimeout(() => {
      sideSeekTimerRef.current = null;
      accumulatedSeekRef.current = null;
      setSideSeek(null);
    }, 650);
  }, []);

  useEffect(
    () => () => {
      clearShortcutHud();
      clearCenterFeedback();
      clearSideSeek();
    },
    [clearShortcutHud, clearCenterFeedback, clearSideSeek],
  );

  const handleVideoStagePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (!isPlayerInteractiveChildTarget(e.target)) {
        focusVideoViewport();
      }
      if (!canHoldBoostVideo || activePointerIdRef.current !== null) return;
      const v = videoRef.current;
      if (!v || v.paused || v.ended) return;
      if (anyMenuOpenRef.current || performance.now() - lastMenuDismissAtRef.current < 220) {
        return;
      }
      if (isPlayerInteractiveChildTarget(e.target)) return;

      const pointerId = e.pointerId;
      activePointerIdRef.current = pointerId;
      activePointerTypeRef.current = e.pointerType;
      if (pointerHoldTimerRef.current !== null) {
        window.clearTimeout(pointerHoldTimerRef.current);
      }
      pointerHoldTimerRef.current = window.setTimeout(() => {
        pointerHoldTimerRef.current = null;
        const media = videoRef.current;
        if (
          activePointerIdRef.current !== pointerId ||
          !media ||
          media.paused ||
          media.ended ||
          anyMenuOpenRef.current ||
          document.querySelector('[role="dialog"]')
        ) {
          if (activePointerIdRef.current === pointerId) {
            activePointerIdRef.current = null;
            activePointerTypeRef.current = "";
          }
          return;
        }
        updateBoostState("pointer", true);
      }, POINTER_HOLD_DELAY_MS);
    },
    [canHoldBoostVideo, focusVideoViewport, updateBoostState],
  );

  const togglePlay = () => {
    if (autoplayCountdownActiveRef.current) {
      setAutoplayCountdownTarget(null);
    }
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play();
    } else {
      v.pause();
    }
  };
  const togglePlayWithHud = () => {
    const v = videoRef.current;
    if (!v) return;
    const willPlay = v.paused;
    togglePlay();
    triggerCenterFeedback(willPlay ? "play" : "pause");
  };
  const handleVideoStageClick = () => {
    if (performance.now() < suppressNextVideoClickUntilRef.current) {
      suppressNextVideoClickUntilRef.current = 0;
      return;
    }
    if (anyMenuOpenRef.current || performance.now() - lastMenuDismissAtRef.current < 220) {
      return;
    }
    const v = videoRef.current;
    if (!v) return;
    const willPlay = v.paused;
    togglePlay();
    triggerCenterFeedback(willPlay ? "play" : "pause");
  };
  const toggleCaptions = () => {
    if (subtitleTrack !== "off") {
      captionsExplicitlyOffRef.current = true;
      setSubtitleTrack("off");
      updateCourseUiPrefs(String(course.id), { subtitleTrack: "off" });
      triggerCenterCaptionsFeedback("off");
      return;
    }
    const candidate =
      resolveBestTrackId(availableTracks, lastSubtitleRef.current) ??
      resolveBestTrackId(availableTracks, spokenCourseLang) ??
      availableTracks.find((t) => t.is_master)?.id ??
      availableTracks[0]?.id;
    if (!candidate) {
      triggerCenterCaptionsFeedback("none");
      return;
    }
    captionsExplicitlyOffRef.current = false;
    setSubtitleTrack(candidate);
    setTranscriptLang(candidate);
    updateCourseUiPrefs(String(course.id), {
      subtitleTrack: candidate,
      transcriptLang: candidate,
    });
    const chosen = availableTracks.find((t) => t.id === candidate);
    triggerCenterCaptionsFeedback("on", chosen ? chosen.label || chosen.short : undefined);
  };
  const toggleMute = () => {
    const nextMuted = !mutedRef.current;
    setMuted(nextMuted);
    writeAppSettings({ ...readAppSettings(), playerMuted: nextMuted });
    showShortcutHud(
      nextMuted ? "mute" : "volume",
      nextMuted ? "Muted" : `${Math.round(volumeRef.current * 100)}%`,
    );
  };
  const toggleSidebarPanel = () => {
    setPanelOpen((prev) => {
      const next = !prev;
      writeAppSettings({ ...readAppSettings(), playerSidebarOpen: next });
      showShortcutHud(
        next ? "sidebar-show" : "sidebar-hide",
        next ? "Default view" : "Theater view",
      );
      return next;
    });
  };
  const stepFrame = (direction: -1 | 1) => {
    const v = videoRef.current;
    if (!v || !v.paused) return;
    seek((v.currentTime || time) + direction * (1 / 30));
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

  const togglePiP = async (withHud = false) => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPiP(false);
        if (withHud) showShortcutHud("pip", "Exit PiP");
      } else if (document.pictureInPictureEnabled) {
        await v.requestPictureInPicture();
        setIsPiP(true);
        if (withHud) showShortcutHud("pip", "Picture-in-Picture");
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

  const handleVideoStageDoubleClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (curriculumLoading || !currentLesson || isEmbeddedPlayer || isExternalResourceOnly) return;
    if (anyMenuOpenRef.current || performance.now() - lastMenuDismissAtRef.current < 220) return;
    if (document.querySelector('[role="dialog"]')) return;
    const target = e.target;
    if (
      target instanceof Element &&
      !target.closest('[data-stage-play-overlay="true"]') &&
      isPlayerInteractiveChildTarget(target)
    ) {
      return;
    }
    toggleFullscreen();
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
  }, [curriculumLoading, isEmbeddedPlayer, isExternalResourceOnly, currentLesson?.lessonId]);

  const activeDubTrackMeta = useMemo(
    () =>
      selectedDubLang === "original"
        ? null
        : (dubTracksMeta.find((t) => t.language.toLowerCase() === selectedDubLang.toLowerCase()) ??
          null),
    [dubTracksMeta, selectedDubLang],
  );
  const activeDubTrackMetaRef = useRef<DubTrackMeta | null>(null);
  activeDubTrackMetaRef.current = activeDubTrackMeta;

  const applyVideoDubVolumeAndDucking = useCallback((v: HTMLVideoElement, isDubActive: boolean) => {
    if (!isDubActive) {
      v.muted = mutedRef.current;
      v.volume = volumeRef.current;
      return;
    }
    if (mutedRef.current) {
      v.muted = true;
      return;
    }
    const meta = activeDubTrackMetaRef.current;
    const intervals = meta?.speechIntervals;
    // If Demucs music separation was baked into the MP3, or no speech intervals exist, mute original video completely
    if (meta?.bgMode === "demucs" || !Array.isArray(intervals) || intervals.length === 0) {
      v.muted = true;
      return;
    }
    // Smart Live Auto-Ducking: mute original video while dubbed voice speaks so voices never overlap;
    // un-duck softly during non-speech tutorial pauses so demos, clicks, and music breaks remain audible
    const t = v.currentTime || 0;
    let isSpeaking = false;
    for (let i = 0; i < intervals.length; i++) {
      const pair = intervals[i];
      if (!pair) continue;
      if (t >= pair[0] - 0.12 && t <= pair[1] + 0.22) {
        isSpeaking = true;
        break;
      }
      if (pair[0] - 0.12 > t) break;
    }
    if (isSpeaking) {
      v.muted = true;
    } else {
      v.muted = false;
      v.volume = Math.max(0, Math.min(1, volumeRef.current * 0.45));
    }
  }, []);

  useEffect(() => {
    const isDubActive = !isEmbeddedPlayer && selectedDubLang !== "original";
    const v = videoRef.current;
    if (v) {
      applyVideoDubVolumeAndDucking(v, isDubActive);
    }
    const a = dubAudioRef.current;
    if (a) {
      a.volume = volume;
      a.muted = muted;
    }
  }, [
    volume,
    muted,
    selectedDubLang,
    activeDubTrackMeta,
    isEmbeddedPlayer,
    isExternalResourceOnly,
    curriculumLoading,
    currentLesson?.lessonId,
    applyVideoDubVolumeAndDucking,
  ]);
  useEffect(() => {
    syncMediaPlaybackRate(effectiveSpeed);
  }, [effectiveSpeed, selectedDubLang, currentLesson?.lessonId, syncMediaPlaybackRate]);

  useEffect(() => {
    const lessonId = currentLesson?.lessonId;
    if (!lessonId || isEmbeddedPlayer) {
      setSelectedDubLang("original");
      setDubLanguages([]);
      setDubTracksMeta([]);
      return;
    }

    let cancelled = false;
    fetch(apiUrl(`/api/dub/video/${encodeURIComponent(lessonId)}/languages`))
      .then((res) => (res.ok ? res.json() : { languages: [], tracks: [] }))
      .then((data: { languages?: string[]; tracks?: DubTrackMeta[] }) => {
        if (cancelled) return;
        const list = Array.isArray(data.languages)
          ? data.languages.map((l) => String(l).trim().toLowerCase()).filter(Boolean)
          : [];
        setDubLanguages(list);
        setDubTracksMeta(Array.isArray(data.tracks) ? data.tracks : []);
        if (lastDubLangRef.current !== "original" && list.includes(lastDubLangRef.current)) {
          setSelectedDubLang(lastDubLangRef.current);
        } else {
          setSelectedDubLang("original");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDubLanguages([]);
          setDubTracksMeta([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentLesson?.lessonId, isEmbeddedPlayer, dubRefreshTick]);

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
    applyVideoDubVolumeAndDucking(v, true);
    a.volume = volumeRef.current;
    a.muted = mutedRef.current;
    a.playbackRate = v.playbackRate || effectiveSpeedRef.current;
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
      applyVideoDubVolumeAndDucking(v, true);
      a.playbackRate = v.playbackRate || effectiveSpeedRef.current;
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
      applyVideoDubVolumeAndDucking(v, true);
      syncTimeFromVideo();
    };

    const handleRateChange = () => {
      a.playbackRate = v.playbackRate || effectiveSpeedRef.current;
    };

    const handleTimeUpdate = () => {
      applyVideoDubVolumeAndDucking(v, true);
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
      a.playbackRate = v.playbackRate || effectiveSpeedRef.current;
      syncTimeFromVideo();
      if (!v.paused && !v.ended && v.currentTime < (a.duration || Infinity) - 0.15) {
        void a.play().catch(() => {});
      }
    };

    const handleVideoLoadedMetadata = () => {
      applyVideoDubVolumeAndDucking(v, true);
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
  }, [currentLesson?.lessonId, isEmbeddedPlayer, selectedDubLang, applyVideoDubVolumeAndDucking]);

  const clearLessonTransitionTimers = useCallback(() => {
    if (transitionOutTimerRef.current !== null) {
      window.clearTimeout(transitionOutTimerRef.current);
      transitionOutTimerRef.current = null;
    }
    if (curtainFallbackTimerRef.current !== null) {
      window.clearTimeout(curtainFallbackTimerRef.current);
      curtainFallbackTimerRef.current = null;
    }
  }, []);

  const revealLessonCurtain = useCallback((lessonId?: string) => {
    if (
      lessonId &&
      pendingCurtainLessonIdRef.current &&
      pendingCurtainLessonIdRef.current !== lessonId
    ) {
      return;
    }
    pendingCurtainLessonIdRef.current = null;
    if (curtainFallbackTimerRef.current !== null) {
      window.clearTimeout(curtainFallbackTimerRef.current);
      curtainFallbackTimerRef.current = null;
    }
    setLessonCurtainVisible(false);
  }, []);

  const consumePendingAutoStart = useCallback(
    (media: HTMLVideoElement, lessonId: string) => {
      if (pendingAutoStartLessonIdRef.current !== lessonId) return;
      if (pendingSeekRef.current !== null || media.seeking) return;
      pendingAutoStartLessonIdRef.current = null;
      syncMediaPlaybackRate(effectiveSpeedRef.current);
      if (media.paused && !media.ended) {
        void media.play().catch(() => {});
      }
    },
    [syncMediaPlaybackRate],
  );

  const cancelAutoplayCountdown = useCallback(() => {
    setAutoplayCountdownTarget(null);
  }, []);

  const startAutoplayCountdown = useCallback(() => {
    const nextIdx = active + 1;
    const nextLesson = allLessons[nextIdx];
    if (!autoplay || nextIdx >= allLessons.length || !nextLesson) return;
    clearCenterFeedback();
    clearSideSeek();
    setPlaying(false);
    setAutoplayCountdownTarget({
      lessonIdx: nextIdx,
      lessonId: nextLesson.lessonId,
      title: nextLesson.title,
    });
  }, [active, allLessons, autoplay, clearCenterFeedback, clearSideSeek]);

  const transitionToLesson = useCallback(
    (targetIdx: number, options: { autoStart?: boolean } = {}) => {
      if (targetIdx < 0 || targetIdx >= allLessons.length) return;
      const targetLesson = allLessons[targetIdx];
      if (!targetLesson) return;

      const autoStart = options.autoStart ?? true;
      setAutoplayCountdownTarget(null);
      clearAllSpeedBoosts();
      clearCenterFeedback();
      clearSideSeek();

      const activeTransitionTarget = pendingTransitionIdxRef.current;
      if (targetIdx === active && activeTransitionTarget === null) {
        return;
      }
      if (activeTransitionTarget === targetIdx) {
        return;
      }
      if (targetIdx === active && activeTransitionTarget !== null) {
        clearLessonTransitionTimers();
        pendingTransitionIdxRef.current = null;
        pendingCurtainLessonIdRef.current = null;
        pendingAutoStartLessonIdRef.current = null;
        setLessonCurtainVisible(false);
        if (autoStart) {
          const v = videoRef.current;
          if (v && v.paused) {
            void v.play().catch(() => {});
          }
        }
        return;
      }

      clearLessonTransitionTimers();
      pendingTransitionIdxRef.current = targetIdx;

      const reducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const wasAlreadyCurtained = lessonCurtainVisibleRef.current;

      const commitLessonSwitch = () => {
        transitionOutTimerRef.current = null;
        pendingTransitionIdxRef.current = null;
        pendingSeekRef.current = null;
        pendingCurtainLessonIdRef.current = reducedMotion ? null : targetLesson.lessonId;
        pendingAutoStartLessonIdRef.current = autoStart ? targetLesson.lessonId : null;
        flushStudySession();
        setActive(targetIdx);

        if (!reducedMotion) {
          curtainFallbackTimerRef.current = window.setTimeout(() => {
            curtainFallbackTimerRef.current = null;
            pendingCurtainLessonIdRef.current = null;
            setLessonCurtainVisible(false);
          }, CURTAIN_MAX_HOLD_MS);
        }
      };

      if (reducedMotion || wasAlreadyCurtained) {
        setLessonCurtainVisible(!reducedMotion);
        commitLessonSwitch();
        return;
      }

      setLessonCurtainVisible(true);
      transitionOutTimerRef.current = window.setTimeout(commitLessonSwitch, CURTAIN_FADE_OUT_MS);
    },
    [
      active,
      allLessons,
      clearAllSpeedBoosts,
      clearCenterFeedback,
      clearLessonTransitionTimers,
      clearSideSeek,
      flushStudySession,
    ],
  );

  const stepLesson = useCallback(
    (delta: -1 | 1, options: { autoStart?: boolean } = {}) => {
      const baseIdx = pendingTransitionIdxRef.current ?? active;
      transitionToLesson(baseIdx + delta, options);
    },
    [active, transitionToLesson],
  );

  useEffect(() => {
    if (!autoplay && autoplayCountdownTarget) {
      setAutoplayCountdownTarget(null);
    }
  }, [autoplay, autoplayCountdownTarget]);

  useEffect(() => {
    if (!currentLesson) {
      revealLessonCurtain();
      return;
    }
    if (isExternalResourceOnly || (!youtubeId && !driveFileId && !resolvedVideoSrc && !isTsVideo)) {
      revealLessonCurtain(currentLesson.lessonId);
    }
  }, [
    currentLesson,
    driveFileId,
    isExternalResourceOnly,
    isTsVideo,
    resolvedVideoSrc,
    revealLessonCurtain,
    youtubeId,
  ]);

  useEffect(() => {
    return () => {
      clearLessonTransitionTimers();
      pendingTransitionIdxRef.current = null;
      pendingCurtainLessonIdRef.current = null;
      pendingAutoStartLessonIdRef.current = null;
      setAutoplayCountdownTarget(null);
      setLessonCurtainVisible(false);
    };
  }, [course.id, clearLessonTransitionTimers]);

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

    if (pendingAutoStartLessonIdRef.current === vid) {
      pendingAutoStartLessonIdRef.current = null;
    }

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
        startAutoplayCountdown();
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
    startAutoplayCountdown,
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

  const updateCaptionAppearance = useCallback(
    (
      patch: Partial<{
        captionFontSize: CaptionFontSize;
        captionBackground: boolean;
        captionPosition: CaptionPosition | null;
      }>,
    ) => {
      if (patch.captionFontSize !== undefined) {
        setCaptionFontSize(patch.captionFontSize);
      }
      if (patch.captionBackground !== undefined) {
        setCaptionBackground(patch.captionBackground);
      }
      if (patch.captionPosition !== undefined) {
        setCaptionPosition(patch.captionPosition);
      }
      writeAppSettings({ ...readAppSettings(), ...patch });
    },
    [],
  );

  const hasNativeVideoControls = Boolean(
    !isEmbeddedPlayer && !isExternalResourceOnly && currentLesson,
  );

  useEffect(() => {
    const syncAppSettings = () => {
      setShortcutsEnabled(arePlayerShortcutsEnabled());
      const next = readAppSettings();
      setCaptionFontSize(next.captionFontSize);
      setCaptionBackground(next.captionBackground);
      setCaptionPosition(next.captionPosition);
      setSpeed(next.playbackSpeed);
      setAutoplay(next.autoPlay);
      setVolume(next.playerVolume);
      setMuted(next.playerMuted);
      setRemainingTime(next.playerRemainingTime);
    };
    syncAppSettings();
    window.addEventListener(SETTINGS_CHANGED_EVENT, syncAppSettings);
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, syncAppSettings);
  }, []);

  useEffect(() => {
    const el = controlsContentRef.current;
    if (!hasNativeVideoControls || !el) return;

    const measure = () => {
      const nextHeight = Math.round(el.getBoundingClientRect().height);
      if (nextHeight > 0) {
        setControlsBarHeight((prev) => (prev === nextHeight ? prev : nextHeight));
      }
    };

    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNativeVideoControls]);

  const shortcutHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  const shortcutKeyUpHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  shortcutHandlerRef.current = (e: KeyboardEvent) => {
    if (!shortcutsEnabled || e.defaultPrevented) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('[role="dialog"]')) return;

    const target = e.target;
    if (isPlayerEditableTarget(target)) return;
    if (isPlayerSliderTarget(target) && isSliderOwnedNavigationKey(e)) return;

    const currentSeconds = videoRef.current?.currentTime ?? time;

    if (!e.shiftKey && matchesShortcutKey(e, "t", "KeyT")) {
      e.preventDefault();
      toggleSidebarPanel();
      return;
    }
    if (!e.shiftKey && matchesShortcutKey(e, "f", "KeyF")) {
      e.preventDefault();
      toggleFullscreen();
      return;
    }
    if (e.shiftKey && matchesShortcutKey(e, "p", "KeyP")) {
      e.preventDefault();
      stepLesson(-1, { autoStart: true });
      return;
    }
    if (e.shiftKey && matchesShortcutKey(e, "n", "KeyN")) {
      e.preventDefault();
      stepLesson(1, { autoStart: true });
      return;
    }
    if (e.key === "Escape" && autoplayCountdownActiveRef.current && !anyMenuOpenRef.current) {
      e.preventDefault();
      cancelAutoplayCountdown();
      focusVideoViewport();
      return;
    }

    if (!hasNativeVideoControls) return;

    if (e.key === " " || e.code === "Space") {
      if (
        anyMenuOpenRef.current ||
        (target instanceof Element &&
          target.closest(
            'button, a[href], [role="button"], [role="menuitem"], [role="menuitemradio"], [role="switch"], [role="tab"], [role="menu"], [data-radix-popper-content-wrapper]',
          ))
      ) {
        return;
      }
      e.preventDefault();
      if (e.repeat) return;

      if (!canHoldBoostVideo) {
        togglePlayWithHud();
        return;
      }

      spacePressPendingRef.current = true;
      if (spaceHoldTimerRef.current !== null) {
        window.clearTimeout(spaceHoldTimerRef.current);
      }
      spaceHoldTimerRef.current = window.setTimeout(() => {
        spaceHoldTimerRef.current = null;
        spacePressPendingRef.current = false;
        const v = videoRef.current;
        if (
          !v ||
          !shortcutsEnabled ||
          anyMenuOpenRef.current ||
          document.querySelector('[role="dialog"]') ||
          isPlayerEditableTarget(document.activeElement)
        ) {
          return;
        }
        updateBoostState("space", true);
        if (v.paused && !v.ended) {
          void v.play().catch(() => {});
        }
      }, SPACE_HOLD_DELAY_MS);
      return;
    }
    if (!e.shiftKey && matchesShortcutKey(e, "k", "KeyK")) {
      e.preventDefault();
      togglePlayWithHud();
      return;
    }
    if (!e.shiftKey && matchesShortcutKey(e, "c", "KeyC")) {
      e.preventDefault();
      toggleCaptions();
      return;
    }
    if (!e.shiftKey && matchesShortcutKey(e, "m", "KeyM")) {
      e.preventDefault();
      toggleMute();
      return;
    }
    if (!e.shiftKey && (matchesShortcutKey(e, "p", "KeyP") || matchesShortcutKey(e, "i", "KeyI"))) {
      e.preventDefault();
      void togglePiP(true);
      return;
    }
    if (!e.shiftKey && e.key === "ArrowLeft") {
      e.preventDefault();
      seek(currentSeconds - 5);
      triggerSideSeek("left", 5);
      return;
    }
    if (!e.shiftKey && e.key === "ArrowRight") {
      e.preventDefault();
      seek(currentSeconds + 5);
      triggerSideSeek("right", 5);
      return;
    }
    if (!e.shiftKey && matchesShortcutKey(e, "j", "KeyJ")) {
      e.preventDefault();
      seek(currentSeconds - 10);
      triggerSideSeek("left", 10);
      return;
    }
    if (!e.shiftKey && matchesShortcutKey(e, "l", "KeyL")) {
      e.preventDefault();
      seek(currentSeconds + 10);
      triggerSideSeek("right", 10);
      return;
    }
    if (!e.shiftKey && e.key === "ArrowUp") {
      e.preventDefault();
      const nextVol = Math.min(1, Number((volumeRef.current + 0.05).toFixed(2)));
      setMuted(false);
      setVolume(nextVol);
      writeAppSettings({ ...readAppSettings(), playerVolume: nextVol, playerMuted: false });
      showShortcutHud("volume", `${Math.round(nextVol * 100)}%`);
      return;
    }
    if (!e.shiftKey && e.key === "ArrowDown") {
      e.preventDefault();
      const nextVol = Math.max(0, Number((volumeRef.current - 0.05).toFixed(2)));
      setVolume(nextVol);
      writeAppSettings({ ...readAppSettings(), playerVolume: nextVol });
      showShortcutHud(nextVol === 0 ? "mute" : "volume", `${Math.round(nextVol * 100)}%`);
      return;
    }
    if (
      e.key === "<" ||
      e.key === ">" ||
      (e.shiftKey && (e.code === "Comma" || e.code === "Period"))
    ) {
      e.preventDefault();
      const isFaster = e.key === ">" || e.code === "Period";
      const idx = PLAYER_SPEED_OPTIONS.findIndex((s) => s === speed);
      const currentIdx = idx === -1 ? 1 : idx;
      const nextIdx = isFaster
        ? Math.min(PLAYER_SPEED_OPTIONS.length - 1, currentIdx + 1)
        : Math.max(0, currentIdx - 1);
      const nextSpeed = PLAYER_SPEED_OPTIONS[nextIdx]!;
      setSpeed(nextSpeed);
      writeAppSettings({ ...readAppSettings(), playbackSpeed: nextSpeed });
      showShortcutHud("speed", `${nextSpeed}×`);
      return;
    }
    if (!e.shiftKey && (e.key === "," || e.code === "Comma")) {
      e.preventDefault();
      stepFrame(-1);
      return;
    }
    if (!e.shiftKey && (e.key === "." || e.code === "Period")) {
      e.preventDefault();
      stepFrame(1);
      return;
    }
    if (!e.shiftKey && e.key === "Home" && effectiveDuration > 0) {
      e.preventDefault();
      seek(0);
      showShortcutHud("seek-back", "0%");
      return;
    }
    if (!e.shiftKey && e.key === "End" && effectiveDuration > 0) {
      e.preventDefault();
      seek(effectiveDuration);
      showShortcutHud("seek-forward", "100%");
      return;
    }
    const digit = matchesDigitShortcut(e);
    if (digit !== null && effectiveDuration > 0) {
      e.preventDefault();
      seek(effectiveDuration * (digit / 10));
      showShortcutHud(digit === 0 ? "seek-back" : "seek-forward", `${digit * 10}%`);
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
    mode: "transcribe" | "translate" | "dub";
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
      captionsExplicitlyOffRef.current = false;
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
          updateCourseUiPrefs(String(course.id), { dubLang: "original" });
        }
        setDubLanguages((prev) => prev.filter((l) => l !== lang));
        setDubTracksMeta((prev) => prev.filter((t) => t.language !== lang));
        toast.success("Dub track removed");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to remove dub track");
      }
    },
    [course.id, currentLesson, selectedDubLang],
  );

  shortcutKeyUpHandlerRef.current = (e: KeyboardEvent) => {
    if (e.key !== " " && e.code !== "Space") return;
    const wasPending = spacePressPendingRef.current;
    const wasBoosting = spaceBoostActiveRef.current;
    if (!wasPending && !wasBoosting) return;

    e.preventDefault();
    clearSpaceHold(true);

    if (!wasBoosting && shortcutsEnabled && !document.querySelector('[role="dialog"]')) {
      if (!isPlayerEditableTarget(document.activeElement)) {
        togglePlayWithHud();
      }
    }
  };

  useEffect(() => {
    if (!shortcutsEnabled) clearSpaceHold(true);
  }, [shortcutsEnabled, clearSpaceHold]);

  useEffect(() => {
    clearAllSpeedBoosts();
    clearShortcutHud();
    clearCenterFeedback();
    clearSideSeek();
  }, [
    currentLesson?.lessonId,
    canHoldBoostVideo,
    clearAllSpeedBoosts,
    clearShortcutHud,
    clearCenterFeedback,
    clearSideSeek,
  ]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => shortcutHandlerRef.current(e);
    const onKeyUp = (e: KeyboardEvent) => shortcutKeyUpHandlerRef.current(e);
    const onPointerUp = (e: PointerEvent) => {
      endPointerHold(e.pointerId);
      if (
        e.pointerType === "mouse" &&
        document.activeElement instanceof HTMLElement &&
        isPlayerSliderTarget(document.activeElement)
      ) {
        requestAnimationFrame(() => {
          if (
            document.activeElement instanceof HTMLElement &&
            isPlayerSliderTarget(document.activeElement)
          ) {
            focusVideoViewport();
          }
        });
      }
    };
    const onPointerCancel = (e: PointerEvent) => endPointerHold(e.pointerId);
    const onPointerMove = (e: PointerEvent) => {
      if (
        e.pointerType === "mouse" &&
        activePointerIdRef.current === e.pointerId &&
        (e.buttons & 1) === 0
      ) {
        endPointerHold(e.pointerId);
      }
    };
    const onWindowBlur = () => clearAllSpeedBoosts();
    const onVisibilityChange = () => {
      if (document.hidden) clearAllSpeedBoosts();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("blur", onWindowBlur);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("blur", onWindowBlur);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearAllSpeedBoosts();
    };
  }, [clearAllSpeedBoosts, endPointerHold, focusVideoViewport]);

  return (
    <div className="relative flex flex-col gap-4 overflow-x-hidden p-3.5 sm:gap-5 sm:p-5 lg:h-dvh lg:flex-row lg:overflow-hidden">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3.5 sm:gap-4">
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
            tabIndex={-1}
            onDragStart={(e) => e.preventDefault()}
            onPointerDown={handleVideoStagePointerDown}
            onDoubleClick={handleVideoStageDoubleClick}
            onPointerLeave={() => {
              if (!pointerBoostActiveRef.current) {
                clearPointerHold(false);
              }
            }}
            onContextMenu={(e) => {
              if (pointerBoostActiveRef.current && activePointerTypeRef.current === "touch") {
                e.preventDefault();
              } else {
                clearPointerHold(true);
              }
            }}
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
            className="group relative z-10 min-h-0 w-full flex-1 select-none overflow-hidden rounded-xl bg-player shadow-workspace outline-none focus:outline-none max-lg:aspect-video"
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
                key={`yt-${currentLesson.lessonId}`}
                src={`https://www.youtube.com/embed/${encodeURIComponent(youtubeId)}?enablejsapi=1&controls=1&modestbranding=1&rel=0${ytStartCacheRef.current.autoPlay ? "&autoplay=1" : ""}${ytStartCacheRef.current.startSec > 2 ? `&start=${ytStartCacheRef.current.startSec}` : ""}&origin=${typeof window !== "undefined" ? encodeURIComponent(window.location.origin) : ""}`}
                title={currentLesson.title}
                className="size-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                onLoad={() => {
                  revealLessonCurtain(currentLesson.lessonId);
                  sendYoutubeListeningHandshake(
                    ytIframeRef.current,
                    `yt-player-${currentLesson.lessonId}`,
                  );
                }}
              />
            ) : driveFileId ? (
              <iframe
                key={`drive-${driveFileId}`}
                src={`https://drive.google.com/file/d/${encodeURIComponent(driveFileId)}/preview`}
                title={currentLesson.title}
                className="size-full border-0"
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                onLoad={() => {
                  revealLessonCurtain(currentLesson.lessonId);
                }}
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
                key={`video-${currentLesson.lessonId}`}
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
                  if (pendingCurtainLessonIdRef.current === currentLesson.lessonId) {
                    revealLessonCurtain(currentLesson.lessonId);
                  }
                  consumePendingAutoStart(media, currentLesson.lessonId);
                  if (
                    !media.paused &&
                    studySessionRef.current &&
                    studySessionRef.current.lastResumedAt === null
                  ) {
                    studySessionRef.current.lastResumedAt = Date.now();
                  }
                }}
                onPause={(e) => {
                  clearAllSpeedBoosts();
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
                  syncMediaPlaybackRate(effectiveSpeedRef.current);
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
                onLoadedData={(e) => {
                  const media = e.currentTarget;
                  if (!media.seeking && pendingSeekRef.current === null) {
                    revealLessonCurtain(currentLesson.lessonId);
                    consumePendingAutoStart(media, currentLesson.lessonId);
                  }
                }}
                onCanPlay={(e) => {
                  const media = e.currentTarget;
                  if (!media.seeking && pendingSeekRef.current === null) {
                    revealLessonCurtain(currentLesson.lessonId);
                    consumePendingAutoStart(media, currentLesson.lessonId);
                  }
                }}
                onEnded={(e) => {
                  clearAllSpeedBoosts();
                  setPlaying(false);
                  const endDur = e.currentTarget.duration || effectiveDuration;
                  if (studySessionRef.current && endDur > 0) {
                    studySessionRef.current.latestPosition = endDur;
                  }
                  flushStudySession();
                  if (!currentLesson.isCompleted) {
                    handleToggleLessonDone(active, true);
                  }
                  startAutoplayCountdown();
                }}
                onError={() => {
                  if (isTsVideo) return;
                  revealLessonCurtain(currentLesson.lessonId);
                  if (resolvedVideoSrc) {
                    toast.error("Failed to load video stream.");
                  }
                }}
              />
            )}

            {canHoldBoostVideo && speedBoostActive && (
              <div
                aria-live="polite"
                className="pointer-events-none absolute left-1/2 top-4 z-30 flex -translate-x-1/2 select-none items-center gap-1.5 rounded-full bg-black/80 px-3.5 py-1.5 text-xs font-semibold tabular-nums text-white"
              >
                <span>2×</span>
                <FastForwardIcon className="size-3.5" />
              </div>
            )}

            {shortcutHud && !(canHoldBoostVideo && speedBoostActive) && (
              <div
                key={shortcutHud.id}
                aria-live="polite"
                className="pointer-events-none absolute left-1/2 top-4 z-30 flex -translate-x-1/2 select-none items-center gap-1.5 rounded-full bg-black/80 px-3.5 py-1.5 text-xs font-semibold tabular-nums text-white"
              >
                {renderShortcutHudIcon(shortcutHud.icon, volume)}
                <span>{shortcutHud.label}</span>
              </div>
            )}

            {hasNativeVideoControls && (
              <VideoCaptionOverlay
                key={`captions-${currentLesson?.lessonId ?? "none"}`}
                text={activeCaptionCue?.text ?? null}
                rtl={Boolean(activePlayerTrack?.rtl)}
                enabled={subtitleTrack !== "off" && Boolean(activePlayerTrack)}
                controlsVisible={playerControlsVisible}
                controlsHeight={controlsBarHeight}
                fontSize={captionFontSize}
                showBackground={captionBackground}
                position={captionPosition}
                onPositionChange={(nextPos) =>
                  updateCaptionAppearance({ captionPosition: nextPos })
                }
              />
            )}

            {/* YouTube-standard animated center play / pause / captions feedback overlay */}
            {centerFeedback && !(canHoldBoostVideo && speedBoostActive) && (
              <div
                key={centerFeedback.id}
                aria-live="polite"
                className={cn(
                  "pointer-events-none absolute left-1/2 top-1/2 z-30 select-none",
                  centerFeedback.type === "captions"
                    ? "animate-player-center-badge flex items-center gap-2.5 rounded-full bg-black/75 px-5 py-2.5 text-sm font-semibold tabular-nums text-white"
                    : "animate-player-center-pulse flex size-18 sm:size-20 items-center justify-center rounded-full bg-black/60 text-white",
                )}
              >
                {centerFeedback.type === "play" && (
                  <PlayIcon className="size-8 sm:size-9 translate-x-[2px]" />
                )}
                {centerFeedback.type === "pause" && <PauseIcon className="size-8 sm:size-9" />}
                {centerFeedback.type === "captions" && (
                  <>
                    <Subtitles
                      className={cn(
                        "size-5",
                        centerFeedback.state === "off"
                          ? "opacity-60"
                          : centerFeedback.state === "none"
                            ? "opacity-40"
                            : "opacity-100",
                      )}
                    />
                    <span>{centerFeedback.label}</span>
                  </>
                )}
              </div>
            )}

            {/* Animated left/right side seek interval indicator (containerless, bold arrow + time) */}
            {sideSeek && !(canHoldBoostVideo && speedBoostActive) && (
              <div
                key={sideSeek.id}
                aria-live="polite"
                className={cn(
                  "animate-player-side-seek pointer-events-none absolute top-1/2 -translate-y-1/2 z-30 select-none",
                  sideSeek.direction === "left"
                    ? "left-6 sm:left-10 md:left-14"
                    : "right-6 sm:right-10 md:right-14",
                )}
              >
                {sideSeek.direction === "left" ? (
                  <div className="flex items-center gap-1 text-lg sm:text-xl font-bold tracking-tight tabular-nums text-white">
                    <ChevronLeft className="size-5 sm:size-6 stroke-[2.5] shrink-0" />
                    <span>-{sideSeek.seconds}s</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-lg sm:text-xl font-bold tracking-tight tabular-nums text-white">
                    <span>+{sideSeek.seconds}s</span>
                    <ChevronRight className="size-5 sm:size-6 stroke-[2.5] shrink-0" />
                  </div>
                )}
              </div>
            )}
            {autoplayCountdownTarget && currentLesson && (
              <AutoplayCountdownOverlay
                key={`countdown-${currentLesson.lessonId}-${autoplayCountdownTarget.lessonId}`}
                nextTitle={autoplayCountdownTarget.title}
                hasBottomControls={hasNativeVideoControls}
                onCancel={() => {
                  cancelAutoplayCountdown();
                  focusVideoViewport();
                }}
                onPlayNow={() => {
                  transitionToLesson(autoplayCountdownTarget.lessonIdx, { autoStart: true });
                }}
              />
            )}

            {/* Smooth lesson-switch transition curtain aligned with player surface token */}
            <div
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute inset-0 z-[35] bg-player transition-opacity duration-200 ease-out motion-reduce:transition-none",
                lessonCurtainVisible ? "opacity-100" : "opacity-0",
              )}
            />

            {hasNativeVideoControls && (
              <div
                data-no-speed-boost="true"
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
                  "absolute inset-x-0 bottom-0 z-20 flex flex-col justify-end bg-gradient-to-t from-black/20 to-transparent px-2.5 pt-2 text-white transition-opacity duration-200 sm:px-4 sm:pt-3",
                  playerControlsVisible ? "opacity-100" : "pointer-events-none opacity-0",
                )}
              >
                <div ref={controlsContentRef} className="pb-2.5 sm:pb-4">
                  {/* Timeline Progress Bar */}
                  <div className="group/timeline mb-2 sm:mb-3">
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
                  <div className="flex min-w-0 items-center justify-between gap-1.5 sm:gap-2">
                    {/* Left Side Group */}
                    <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                      {/* Play / Pause Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          if (e.detail > 0) e.currentTarget.blur();
                          const v = videoRef.current;
                          if (!v) return;
                          const willPlay = v.paused;
                          togglePlay();
                          triggerCenterFeedback(willPlay ? "play" : "pause");
                        }}
                        aria-label={playing ? "Pause" : "Play"}
                        title={playing ? "Pause (Space)" : "Play (Space)"}
                        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-white transition-all hover:bg-white/[0.15] sm:size-10"
                      >
                        {playing ? (
                          <PauseIcon className="size-4 sm:size-5" />
                        ) : (
                          <PlayIcon className="size-4 translate-x-[0.5px] sm:size-5" />
                        )}
                      </button>

                      {/* Prev / Next Pill */}
                      <div className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-white/[0.08] px-2.5 text-white transition-all hover:bg-white/[0.12] sm:h-10 sm:gap-3 sm:px-3.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            if (e.detail > 0) e.currentTarget.blur();
                            stepLesson(-1, { autoStart: true });
                          }}
                          disabled={active === 0}
                          aria-label="Previous lesson"
                          title="Previous lesson (Shift+P)"
                          className="p-0.5 transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-35 sm:p-1"
                        >
                          <PrevIcon className="size-4 sm:size-5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            if (e.detail > 0) e.currentTarget.blur();
                            stepLesson(1, { autoStart: true });
                          }}
                          disabled={active === lessonTitles.length - 1}
                          aria-label="Next lesson"
                          title="Next lesson (Shift+N)"
                          className="p-0.5 transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-35 sm:p-1"
                        >
                          <NextIcon className="size-4 sm:size-5" />
                        </button>
                      </div>

                      {/* Volume Pill */}
                      <div className="group/volume flex h-8 shrink-0 items-center rounded-full bg-white/[0.08] px-2 text-white transition-all hover:bg-white/[0.15] focus-within:bg-white/[0.15] sm:h-10 sm:px-3">
                        <button
                          type="button"
                          onClick={(e) => {
                            if (e.detail > 0) e.currentTarget.blur();
                            const nextMuted = !muted;
                            setMuted(nextMuted);
                            writeAppSettings({ ...readAppSettings(), playerMuted: nextMuted });
                          }}
                          aria-label={muted ? "Unmute" : "Mute"}
                          title={muted ? "Unmute (M)" : "Mute (M)"}
                          className="p-0.5 transition-opacity hover:opacity-80 sm:p-1"
                        >
                          <VolumeIcon volume={volume} muted={muted} />
                        </button>
                        <div className="hidden w-0 overflow-hidden opacity-0 transition-all duration-200 group-hover/volume:ml-1.5 group-hover/volume:w-20 group-hover/volume:pr-1 group-hover/volume:opacity-100 group-focus-within/volume:ml-1.5 group-focus-within/volume:w-20 group-focus-within/volume:pr-1 group-focus-within/volume:opacity-100 sm:block">
                          <Slider
                            value={[muted ? 0 : volume]}
                            max={1}
                            step={0.01}
                            onValueChange={([v]) => {
                              const nextVol = v ?? 0;
                              setVolume(nextVol);
                              setMuted(false);
                              writeAppSettings({
                                ...readAppSettings(),
                                playerVolume: nextVol,
                                playerMuted: false,
                              });
                            }}
                            aria-label="Volume"
                            className="w-[72px] cursor-pointer [&_[role=slider]]:size-3 [&_[role=slider]]:border-0 [&_[role=slider]]:bg-white [&>span:first-child]:h-1 [&>span:first-child]:bg-white/30 [&>span:first-child>span]:bg-white"
                          />
                        </div>
                      </div>

                      {/* Time Pill */}
                      <button
                        type="button"
                        onClick={(e) => {
                          if (e.detail > 0) e.currentTarget.blur();
                          const nextRemaining = !remainingTime;
                          setRemainingTime(nextRemaining);
                          writeAppSettings({
                            ...readAppSettings(),
                            playerRemainingTime: nextRemaining,
                          });
                        }}
                        aria-label={remainingTime ? "Show elapsed time" : "Show remaining time"}
                        title={remainingTime ? "Show elapsed time" : "Show remaining time"}
                        className="flex h-8 shrink-0 select-none items-center rounded-full bg-white/[0.08] px-2.5 text-[11px] font-semibold tabular-nums text-white transition-all hover:bg-white/[0.15] sm:h-10 sm:px-4 sm:text-xs"
                      >
                        {remainingTime
                          ? `−${fmtTime(Math.max(0, effectiveDuration - time))}`
                          : `${fmtTime(time)} / ${fmtTime(effectiveDuration)}`}
                      </button>
                    </div>

                    {/* Right Side Pill */}
                    <div className="flex h-8 shrink-0 items-center gap-0.5 rounded-full bg-white/[0.08] px-2 py-1 text-white transition-all hover:bg-white/[0.12] sm:h-10 sm:gap-1 sm:px-3">
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
                                    updateCourseUiPrefs(String(course.id), {
                                      dubLang: "original",
                                    });
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
                                        updateCourseUiPrefs(String(course.id), { dubLang: lang });
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
                                  onClick={() => {
                                    captionsExplicitlyOffRef.current = true;
                                    setSubtitleTrack("off");
                                    updateCourseUiPrefs(String(course.id), {
                                      subtitleTrack: "off",
                                    });
                                    triggerCenterCaptionsFeedback("off");
                                  }}
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
                                        captionsExplicitlyOffRef.current = false;
                                        setSubtitleTrack(tr.id);
                                        setTranscriptLang(tr.id);
                                        updateCourseUiPrefs(String(course.id), {
                                          subtitleTrack: tr.id,
                                          transcriptLang: tr.id,
                                        });
                                        triggerCenterCaptionsFeedback("on", tr.label || tr.short);
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
                          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 bg-secondary/25 px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-muted-foreground">
                                Size
                              </span>
                              <div
                                role="radiogroup"
                                aria-label="Caption size"
                                className="inline-flex items-center rounded-md bg-secondary/70 p-0.5"
                              >
                                {(
                                  [
                                    { id: "small", label: "S", name: "Small" },
                                    { id: "medium", label: "M", name: "Medium" },
                                    { id: "large", label: "L", name: "Large" },
                                  ] as const
                                ).map((opt) => {
                                  const activeOption = captionFontSize === opt.id;
                                  return (
                                    <button
                                      key={opt.id}
                                      type="button"
                                      role="radio"
                                      aria-checked={activeOption}
                                      aria-label={opt.name}
                                      onClick={() =>
                                        updateCaptionAppearance({ captionFontSize: opt.id })
                                      }
                                      className={cn(
                                        "rounded-sm px-2 py-0.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                                        activeOption
                                          ? "bg-card text-foreground shadow-xs dark:bg-accent"
                                          : "text-muted-foreground hover:text-foreground",
                                      )}
                                    >
                                      {opt.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <div
                                role="radiogroup"
                                aria-label="Caption backdrop"
                                className="inline-flex items-center rounded-md bg-secondary/70 p-0.5"
                              >
                                {(
                                  [
                                    { id: true, label: "Box" },
                                    { id: false, label: "Outline" },
                                  ] as const
                                ).map((opt) => {
                                  const activeOption = captionBackground === opt.id;
                                  return (
                                    <button
                                      key={opt.label}
                                      type="button"
                                      role="radio"
                                      aria-checked={activeOption}
                                      onClick={() =>
                                        updateCaptionAppearance({ captionBackground: opt.id })
                                      }
                                      className={cn(
                                        "rounded-sm px-2 py-0.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                                        activeOption
                                          ? "bg-card text-foreground shadow-xs dark:bg-accent"
                                          : "text-muted-foreground hover:text-foreground",
                                      )}
                                    >
                                      {opt.label}
                                    </button>
                                  );
                                })}
                              </div>

                              {captionPosition && (
                                <button
                                  type="button"
                                  onClick={() => updateCaptionAppearance({ captionPosition: null })}
                                  className="rounded-sm px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                >
                                  Reset
                                </button>
                              )}
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
                          {PLAYER_SPEED_OPTIONS.map((s) => (
                            <DropdownMenuItem
                              key={s}
                              className="rounded-md"
                              onClick={() => {
                                setSpeed(s);
                                writeAppSettings({ ...readAppSettings(), playbackSpeed: s });
                              }}
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
                              const nextAutoplay = !autoplay;
                              setAutoplay(nextAutoplay);
                              writeAppSettings({ ...readAppSettings(), autoPlay: nextAutoplay });
                            }}
                          >
                            Autoplay next{autoplay && <Check className="ml-auto" />}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      <div className="hidden sm:flex">
                        <PlayerBtn
                          label="Picture-in-Picture (P / I)"
                          onClick={() => void togglePiP()}
                          active={isPiP}
                        >
                          <PictureInPicture />
                        </PlayerBtn>
                      </div>

                      <PlayerBtn
                        label={isFullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)"}
                        onClick={toggleFullscreen}
                      >
                        {isFullscreen ? <Minimize /> : <Maximize />}
                      </PlayerBtn>

                      <div className="hidden lg:flex">
                        <PlayerBtn
                          label={panelOpen ? "Hide sidebar (T)" : "Show sidebar (T)"}
                          onClick={() =>
                            setPanelOpen((prev) => {
                              const next = !prev;
                              writeAppSettings({ ...readAppSettings(), playerSidebarOpen: next });
                              return next;
                            })
                          }
                        >
                          {panelOpen ? <PanelRightClose /> : <PanelRightOpen />}
                        </PlayerBtn>
                      </div>
                    </div>
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
              {currentLesson?.moduleTitle && (
                <>
                  <ChevronRight className="size-3 shrink-0" />
                  <span className="truncate font-medium text-foreground">
                    {currentLesson.moduleTitle}
                  </span>
                </>
              )}
            </nav>
            <h1
              className="mt-1 truncate text-lg font-semibold sm:mt-1.5 sm:text-2xl"
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

      <aside
        className={cn(
          "relative z-10 flex h-[min(520px,68dvh)] w-full shrink-0 flex-col overflow-hidden rounded-xl bg-card shadow-card sm:h-[580px] lg:h-full lg:w-[380px]",
          !panelOpen && "lg:hidden",
        )}
      >
        <div className="border-b border-border/50 p-3">
          <div
            role="tablist"
            className="relative grid grid-cols-3 rounded-lg bg-secondary/75 p-1 select-none"
          >
            <span
              aria-hidden="true"
              style={{
                width: "calc((100% - 8px) / 3)",
                transform: `translate3d(${(tab === "playlist" ? 0 : tab === "notes" ? 1 : 2) * 100}%, 0, 0)`,
              }}
              className="pointer-events-none absolute top-1 bottom-1 left-1 rounded-sm bg-card shadow-card transition-transform duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none dark:bg-accent"
            />
            {(
              [
                ["playlist", "Playlist"],
                ["notes", "Notes"],
                ["transcript", "Transcript"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => {
                  setTab(id);
                  updateCourseUiPrefs(String(course.id), { activeTab: id });
                }}
                className={cn(
                  "relative z-10 flex items-center justify-center rounded-sm px-2 py-2 text-xs font-semibold transition-colors duration-150",
                  tab === id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <div
            role="tabpanel"
            aria-hidden={tab !== "playlist"}
            className={cn("h-full", tab !== "playlist" && "hidden")}
          >
            <PlaylistTab
              courseId={String(course.id)}
              courseModules={courseModules}
              allLessons={allLessons}
              active={active}
              done={done}
              setDone={setDone}
              onToggleLessonDone={handleToggleLessonDone}
              onCommitBulkDone={handleCommitBulkDone}
              onSelect={(idx) => transitionToLesson(idx, { autoStart: true })}
              isVisible={
                (panelOpen || (typeof window !== "undefined" && window.innerWidth < 1024)) &&
                tab === "playlist"
              }
            />
          </div>
          <div
            role="tabpanel"
            aria-hidden={tab !== "notes"}
            className={cn("h-full", tab !== "notes" && "hidden")}
          >
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
              isVisible={
                (panelOpen || (typeof window !== "undefined" && window.innerWidth < 1024)) &&
                tab === "notes"
              }
            />
          </div>
          <div
            role="tabpanel"
            aria-hidden={tab !== "transcript"}
            className={cn("h-full", tab !== "transcript" && "hidden")}
          >
            <TranscriptTab
              courseId={String(course.id)}
              videoId={currentLesson?.lessonId}
              youtubeId={youtubeId}
              availableTracks={availableTracks}
              selectedLang={transcriptLang}
              onSelectLang={(nextTrackId) => {
                captionsExplicitlyOffRef.current = false;
                setTranscriptLang(nextTrackId);
                setSubtitleTrack(nextTrackId);
                updateCourseUiPrefs(String(course.id), {
                  subtitleTrack: nextTrackId,
                  transcriptLang: nextTrackId,
                });
              }}
              dubLanguages={dubLanguages}
              dubTracksMeta={dubTracksMeta}
              selectedDubLang={selectedDubLang}
              onSelectDubLang={(nextDubLang) => {
                lastDubLangRef.current = nextDubLang;
                setSelectedDubLang(nextDubLang);
                updateCourseUiPrefs(String(course.id), { dubLang: nextDubLang });
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
              isVisible={
                (panelOpen || (typeof window !== "undefined" && window.innerWidth < 1024)) &&
                tab === "transcript"
              }
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
                        dubLanguages,
                        hasTranscript: availableTracks.length > 0,
                      },
                    ]}
                    defaultMode={transcriptModalState.mode}
                    defaultTargetLang={transcriptModalState.targetLang}
                    onCourseLanguageChanged={(nextLang) => setSpokenCourseLang(nextLang)}
                    onJobQueued={(targetLang, mode) => {
                      if (mode === "dub") {
                        lastDubLangRef.current = targetLang.toLowerCase();
                        pendingTrackSelectionRef.current = `${targetLang}:generated`;
                      } else {
                        const nextId = `${targetLang}:${mode === "translate" || mode === "transcribe" ? "generated" : "uploaded"}`;
                        pendingTrackSelectionRef.current = nextId;
                      }
                    }}
                  />
                ) : null
              }
            />
          </div>
        </div>
      </aside>

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

function AutoplayCountdownOverlay({
  nextTitle,
  durationMs = AUTOPLAY_COUNTDOWN_MS,
  hasBottomControls,
  onCancel,
  onPlayNow,
}: {
  nextTitle: string;
  durationMs?: number;
  hasBottomControls: boolean;
  onCancel: () => void;
  onPlayNow: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState(() => Math.max(1, Math.ceil(durationMs / 1000)));
  const progressCircleRef = useRef<SVGCircleElement>(null);
  const onPlayNowRef = useRef(onPlayNow);
  onPlayNowRef.current = onPlayNow;

  useEffect(() => {
    const startAt = performance.now();
    let rafId = 0;
    let completed = false;

    const tick = (now: number) => {
      const elapsed = Math.max(0, now - startAt);
      const progress = Math.min(1, elapsed / durationMs);
      if (progressCircleRef.current) {
        progressCircleRef.current.style.strokeDashoffset = String(
          COUNTDOWN_RING_CIRCUMFERENCE * progress,
        );
      }
      const remainingSeconds = Math.max(1, Math.ceil((durationMs - elapsed) / 1000));
      setSecondsLeft((prev) => (prev === remainingSeconds ? prev : remainingSeconds));

      if (progress >= 1) {
        if (!completed) {
          completed = true;
          onPlayNowRef.current();
        }
        return;
      }
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [durationMs]);

  return (
    <div
      data-no-speed-boost="true"
      role="region"
      aria-label="Up next autoplay countdown"
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className={cn(
        "animate-in fade-in duration-200 absolute inset-0 z-[18] flex flex-col items-center justify-center bg-black/65 px-4 text-center text-white select-none",
        hasBottomControls ? "pb-14 sm:pb-20" : "pb-4",
      )}
    >
      <p className="text-[11px] font-medium tracking-wide text-white/65 sm:text-xs">Up next</p>
      <p
        title={nextTitle}
        className="mt-1 max-w-[260px] truncate text-xs font-semibold text-white sm:max-w-md sm:text-base"
      >
        {nextTitle}
      </p>

      <div className="relative my-3 flex size-12 items-center justify-center sm:my-5 sm:size-16">
        <svg viewBox="0 0 64 64" className="size-full -rotate-90" aria-hidden="true">
          <circle
            cx="32"
            cy="32"
            r={COUNTDOWN_RING_RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className="text-white/20"
          />
          <circle
            ref={progressCircleRef}
            cx="32"
            cy="32"
            r={COUNTDOWN_RING_RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={COUNTDOWN_RING_CIRCUMFERENCE}
            strokeDashoffset={0}
            className="text-white"
          />
        </svg>
        <span
          aria-live="polite"
          className="absolute text-base font-bold tabular-nums text-white sm:text-2xl"
        >
          {secondsLeft}
        </span>
      </div>

      <div className="flex items-center gap-2 sm:gap-2.5">
        <button
          type="button"
          onClick={onCancel}
          className="flex h-7 items-center justify-center rounded-md bg-white/15 px-3 text-xs font-medium text-white transition-colors hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 sm:h-9 sm:px-4 sm:text-sm"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onPlayNow}
          className="flex h-7 items-center justify-center gap-1.5 rounded-md bg-white/95 px-3.5 text-xs font-semibold text-[oklch(0.16_0.007_260)] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:h-9 sm:px-4 sm:text-sm"
        >
          <PlayIcon className="size-3 sm:size-3.5" />
          <span>Play now</span>
        </button>
      </div>
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

function FastForwardIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 6l8.5 6L4 18V6zm9 0l8.5 6-8.5 6V6z" />
    </svg>
  );
}

function VolumeIcon({
  volume,
  muted,
  className = "size-5",
}: {
  volume: number;
  muted: boolean;
  className?: string;
}) {
  const effective = muted ? 0 : volume;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
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

function renderShortcutHudIcon(icon: ShortcutHudIcon, volume: number): ReactNode {
  switch (icon) {
    case "play":
      return <PlayIcon className="size-3.5" />;
    case "pause":
      return <PauseIcon className="size-3.5" />;
    case "captions-on":
      return <Subtitles className="size-3.5" />;
    case "captions-off":
      return <Subtitles className="size-3.5 opacity-55" />;
    case "mute":
      return <VolumeIcon volume={0} muted className="size-3.5" />;
    case "volume":
      return <VolumeIcon volume={Math.max(0.2, volume)} muted={false} className="size-3.5" />;
    case "speed":
      return <Gauge className="size-3.5" />;
    case "seek-back":
      return <FastForwardIcon className="size-3.5 rotate-180" />;
    case "seek-forward":
      return <FastForwardIcon className="size-3.5" />;
    case "sidebar-hide":
      return <PanelRightClose className="size-3.5" />;
    case "sidebar-show":
      return <PanelRightOpen className="size-3.5" />;
    case "pip":
      return <PictureInPicture className="size-3.5" />;
  }
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
      onClick={(e) => {
        if (e.detail > 0) e.currentTarget.blur();
        onClick();
      }}
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
  isVisible,
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
  isVisible: boolean;
}) {
  const [openModulesMap, setOpenModulesMap] = useState<Record<string, boolean>>(
    () => readCourseUiPrefs(courseId).openModules ?? {},
  );
  const [dragState, setDragState] = useState<{ startIdx: number; targetValue: boolean } | null>(
    null,
  );
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollKey = `playlist:${courseId}`;
  const lastScrollTopRef = useRef<number | null>(readSessionScroll(scrollKey));
  const initialScrollRestoredForCourseRef = useRef<string>("");
  const prevActiveLessonKeyRef = useRef<string>("");
  const dragInitialDoneRef = useRef<boolean[]>([]);
  const doneRef = useRef(done);
  doneRef.current = done;
  const count = done.filter(Boolean).length;
  const allDone = done.length > 0 && count === done.length;
  const [progressMode, setProgressMode] = useState<"videos" | "duration">(
    () => readAppSettings().progressCalculationMode,
  );

  useEffect(() => {
    setOpenModulesMap(readCourseUiPrefs(courseId).openModules ?? {});
    lastScrollTopRef.current = readSessionScroll(`playlist:${courseId}`);
  }, [courseId]);

  useEffect(() => {
    const onCoursePrefsChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ courseId?: string }>).detail;
      if (!detail?.courseId || detail.courseId === courseId) {
        setOpenModulesMap(readCourseUiPrefs(courseId).openModules ?? {});
      }
    };
    window.addEventListener(COURSE_UI_PREFS_CHANGED_EVENT, onCoursePrefsChanged);
    return () => window.removeEventListener(COURSE_UI_PREFS_CHANGED_EVENT, onCoursePrefsChanged);
  }, [courseId]);

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

  const activeModIdx = allLessons[active]?.modIdx ?? 0;
  const activeLesson = allLessons[active];
  const activeModId = courseModules[activeModIdx]?.id ?? activeLesson?.moduleId ?? "";

  const isModuleOpen = useCallback(
    (modId: string, modIdx: number): boolean => {
      if (openModulesMap[modId] !== undefined) {
        return openModulesMap[modId]!;
      }
      return modIdx < 2 || modIdx === activeModIdx;
    },
    [openModulesMap, activeModIdx],
  );

  // Auto-open the active lesson's module only when the active lesson actually changes
  useEffect(() => {
    if (!activeLesson || !activeModId) return;
    const lessonKey = `${courseId}:${activeLesson.lessonId}`;
    const prevKey = prevActiveLessonKeyRef.current;
    prevActiveLessonKeyRef.current = lessonKey;

    if (prevKey && prevKey !== lessonKey && openModulesMap[activeModId] === false) {
      setOpenModulesMap((prev) => ({ ...prev, [activeModId]: true }));
      updateCourseUiPrefs(courseId, { openModules: { [activeModId]: true } });
    }
  }, [activeLesson, activeModId, courseId, openModulesMap]);

  // Restore saved playlist scroll position (or center active lesson on first open in session)
  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || courseModules.length === 0 || !isVisible) return;

    if (initialScrollRestoredForCourseRef.current !== courseId) {
      initialScrollRestoredForCourseRef.current = courseId;
      const saved = readSessionScroll(scrollKey);
      if (saved !== null) {
        container.scrollTop = saved;
        lastScrollTopRef.current = saved;
        return;
      }
      const activeRow = container.querySelector<HTMLElement>(`[data-lesson-idx="${active}"]`);
      if (activeRow) {
        const targetTop = Math.max(
          0,
          activeRow.offsetTop - container.clientHeight / 2 + activeRow.clientHeight / 2,
        );
        container.scrollTop = targetTop;
        lastScrollTopRef.current = targetTop;
        writeSessionScroll(scrollKey, targetTop);
        return;
      }
    }

    if (lastScrollTopRef.current !== null) {
      container.scrollTop = lastScrollTopRef.current;
    }
  }, [active, courseId, courseModules.length, isVisible, scrollKey]);

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

  const toggleMod = (modId: string, modIdx: number) => {
    const currentlyOpen = isModuleOpen(modId, modIdx);
    const nextOpen = !currentlyOpen;
    setOpenModulesMap((prev) => ({ ...prev, [modId]: nextOpen }));
    updateCourseUiPrefs(courseId, { openModules: { [modId]: nextOpen } });
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

      <div
        ref={scrollContainerRef}
        onScroll={(e) => {
          if (!isVisible) return;
          const top = e.currentTarget.scrollTop;
          lastScrollTopRef.current = top;
          writeSessionScroll(scrollKey, top);
        }}
        className="min-h-0 flex-1 divide-y divide-border/50 overflow-y-auto px-3 pb-4 custom-scrollbar-sm"
      >
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
          const isOpen = isModuleOpen(mod.id, modIdx);

          return (
            <div key={mod.id} className="py-2 first:pt-0 last:pb-0">
              <button
                type="button"
                onClick={() => toggleMod(mod.id, modIdx)}
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
                          "flex items-stretch rounded-lg transition-colors hover:bg-secondary/60",
                          isActive && "bg-primary-soft/75 shadow-brand hover:bg-primary-soft/75",
                        )}
                      >
                        <div className="flex shrink-0 items-center py-3 pl-3">
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
                        </div>
                        <button
                          type="button"
                          onClick={() => onSelect(i)}
                          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-3 pl-3 pr-3 text-left"
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
      wrapperPaddingClassName="px-4 pt-3.5 pb-5"
      editorClassName="min-h-0"
      minHeightClassName=""
      maxHeightClassName=""
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
  isVisible,
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
  isVisible: boolean;
}) {
  const lessonKey = lessonId || `idx-${lessonIdx}`;
  const scrollKey = `notes:${courseId}:${lessonKey}`;
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollTopRef = useRef<number>(readSessionScroll(scrollKey) ?? 0);
  const draftHydratedKeyRef = useRef<string>("");

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

  const [sortOrder, setSortOrder] = useState<NotesSortOrder>(
    () => readAppSettings().notesSortOrder,
  );
  const [autocompleteEnabled, setAutocompleteEnabled] = useState(
    () => readAppSettings().notesAutocompleteEnabled,
  );
  const [smartPauseEnabled, setSmartPauseEnabled] = useState(
    () => readAppSettings().notesSmartPauseEnabled,
  );
  const [smartPauseDelay, setSmartPauseDelay] = useState(
    () => readAppSettings().notesSmartPauseDelay,
  );
  const [smartPauseRewind, setSmartPauseRewind] = useState(
    () => readAppSettings().notesSmartPauseRewind,
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [smartPauseState, setSmartPauseState] = useState<SmartPauseStatus | null>(null);
  const isSavingNoteRef = useRef(false);

  const updateNotesPreferences = useCallback(
    (
      patch: Partial<{
        notesSortOrder: NotesSortOrder;
        notesAutocompleteEnabled: boolean;
        notesSmartPauseEnabled: boolean;
        notesSmartPauseDelay: number;
        notesSmartPauseRewind: boolean;
      }>,
    ) => {
      writeAppSettings({ ...readAppSettings(), ...patch });
      const next = readAppSettings();
      setSortOrder(next.notesSortOrder);
      setAutocompleteEnabled(next.notesAutocompleteEnabled);
      setSmartPauseEnabled(next.notesSmartPauseEnabled);
      setSmartPauseDelay(next.notesSmartPauseDelay);
      setSmartPauseRewind(next.notesSmartPauseRewind);
    },
    [],
  );

  useEffect(() => {
    const syncNotesSettings = () => {
      const next = readAppSettings();
      setSortOrder(next.notesSortOrder);
      setAutocompleteEnabled(next.notesAutocompleteEnabled);
      setSmartPauseEnabled(next.notesSmartPauseEnabled);
      setSmartPauseDelay(next.notesSmartPauseDelay);
      setSmartPauseRewind(next.notesSmartPauseRewind);
    };
    syncNotesSettings();
    window.addEventListener(SETTINGS_CHANGED_EVENT, syncNotesSettings);
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, syncNotesSettings);
  }, []);

  useEffect(() => {
    setNotes(getCourseNotes(courseId));
  }, [courseId]);

  useEffect(() => {
    return subscribeCourseNotesChanged(courseId, (nextNotes) => {
      setNotes(nextNotes);
    });
  }, [courseId]);

  // Restore or reset active editor draft when switching lessons or courses
  useEffect(() => {
    const compositeKey = `${courseId}:${lessonKey}`;
    draftHydratedKeyRef.current = compositeKey;
    const savedDraft = readSessionNoteDraft(courseId, lessonKey);
    if (savedDraft) {
      setShowAddNote(savedDraft.mode === "add");
      setEditingNoteId(savedDraft.mode === "edit" ? savedDraft.editingNoteId : null);
      setNoteContent(savedDraft.content);
      setNoteTimestamp(savedDraft.timestamp);
    } else {
      setShowAddNote(false);
      setEditingNoteId(null);
      setNoteContent("");
      setNoteTimestamp(null);
    }
    setEditorKey((k) => k + 1);
  }, [courseId, lessonKey]);

  // Sync active editor draft to sessionStorage so navigating away and returning preserves drafts
  useEffect(() => {
    const compositeKey = `${courseId}:${lessonKey}`;
    if (draftHydratedKeyRef.current !== compositeKey) return;
    if (showAddNote && !editingNoteId) {
      writeSessionNoteDraft(courseId, lessonKey, {
        mode: "add",
        editingNoteId: null,
        content: noteContent,
        timestamp: noteTimestamp,
      });
    } else if (editingNoteId) {
      writeSessionNoteDraft(courseId, lessonKey, {
        mode: "edit",
        editingNoteId,
        content: noteContent,
        timestamp: noteTimestamp,
      });
    } else {
      writeSessionNoteDraft(courseId, lessonKey, null);
    }
  }, [courseId, lessonKey, showAddNote, editingNoteId, noteContent, noteTimestamp]);

  // Restore scroll position on lesson switch or tab visibility restore
  useEffect(() => {
    const saved = readSessionScroll(scrollKey) ?? 0;
    lastScrollTopRef.current = saved;
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = saved;
    }
  }, [scrollKey]);

  useLayoutEffect(() => {
    if (isVisible && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = lastScrollTopRef.current;
    }
  }, [isVisible, scrollKey]);

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
      writeSessionNoteDraft(courseId, lessonKey, null);
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
    writeSessionNoteDraft(courseId, lessonKey, null);
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
    writeSessionNoteDraft(courseId, lessonKey, null);
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
      <div className="px-3 pb-2.5 pt-3">
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
            onClick={() =>
              updateNotesPreferences({
                notesSortOrder: sortOrder === "asc" ? "desc" : "asc",
              })
            }
            aria-label={sortOrder === "asc" ? "Oldest first" : "Latest first"}
            title={sortOrder === "asc" ? "Oldest first" : "Latest first"}
            className="size-9 shrink-0 rounded-md text-muted-foreground hover:text-foreground"
          >
            {sortOrder === "asc" ? <ArrowDownWideNarrow /> : <ArrowUpNarrowWide />}
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
                      onCheckedChange={(checked) =>
                        updateNotesPreferences({ notesSmartPauseEnabled: checked })
                      }
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
                            updateNotesPreferences({
                              notesSmartPauseDelay: Math.max(
                                0.5,
                                Number((smartPauseDelay - 0.5).toFixed(1)),
                              ),
                            })
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
                            updateNotesPreferences({
                              notesSmartPauseDelay: Math.min(
                                30,
                                Number((smartPauseDelay + 0.5).toFixed(1)),
                              ),
                            })
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
                        onCheckedChange={(checked) =>
                          updateNotesPreferences({ notesSmartPauseRewind: checked })
                        }
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
                  onCheckedChange={(checked) =>
                    updateNotesPreferences({ notesAutocompleteEnabled: checked })
                  }
                />
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Scrollable Note Composer + Note Cards List (aligned to 12px px-3) */}
      <div
        ref={scrollContainerRef}
        onScroll={(e) => {
          if (!isVisible) return;
          const top = e.currentTarget.scrollTop;
          lastScrollTopRef.current = top;
          writeSessionScroll(scrollKey, top);
        }}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pt-1.5 pb-4 custom-scrollbar-sm"
      >
        {/* New Note Composer Card */}
        {showAddNote && !editingNoteId && (
          <div className="overflow-hidden rounded-xl bg-background ring-1 ring-primary/35 shadow-card">
            <div className="flex items-center justify-between bg-secondary/35 px-4 pb-2 pt-3">
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
              placeholder="Write a note…"
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
                    <div className="flex items-center justify-between bg-secondary/35 px-4 pb-2 pt-3">
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
                  <div className="space-y-2.5 px-4 pt-3.5 pb-4.5">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          if (e.detail > 0) e.currentTarget.blur();
                          seek(note.timestamp);
                        }}
                        title={`Seek to ${fmt(note.timestamp)}`}
                        className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-0.5 font-mono text-xs font-semibold tabular-nums text-primary transition-colors hover:bg-primary/20"
                      >
                        <Clock className="size-3" />
                        {fmt(note.timestamp)}
                      </button>

                      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
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
    <div className="flex min-h-[44px] items-center justify-between border-t border-border/50 bg-secondary/25 px-4 py-2">
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
  courseId,
  videoId,
  youtubeId,
  availableTracks,
  selectedLang,
  onSelectLang,
  dubLanguages,
  dubTracksMeta,
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
  isVisible,
  aiPanel,
}: {
  courseId: string;
  videoId?: string | undefined;
  youtubeId?: string | null | undefined;
  availableTracks: TranscriptTrack[];
  selectedLang: string | null;
  onSelectLang: (trackId: string) => void;
  dubLanguages: string[];
  dubTracksMeta: DubTrackMeta[];
  selectedDubLang: string;
  onSelectDubLang: (lang: string) => void;
  onDeleteDubTrack: (lang: string) => void;
  cues: TranscriptCue[];
  cuesLoading: boolean;
  time: number;
  seek: (t: number, options?: { minLockTime?: number }) => void;
  onImportSubtitles: () => void;
  onOpenAiModal: (mode: "transcribe" | "translate" | "dub", targetLang?: string) => void;
  onSetMaster: (trackId: string) => void;
  onSetSource: (trackId: string) => void;
  onDeleteTrack: (trackId: string) => void;
  onTranscriptReload: () => void;
  isVisible: boolean;
  aiPanel?: ReactNode;
}) {
  const [fetchingYt, setFetchingYt] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);
  const scrollKey = `transcript:${courseId}:${videoId || "none"}`;
  const lastScrollTopRef = useRef<number | null>(readSessionScroll(scrollKey));
  const lastAutoScrolledIdxRef = useRef<number>(-1);
  const restoredForScrollKeyRef = useRef<string>("");
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

  useLayoutEffect(() => {
    if (cuesLoading || cues.length === 0 || !isVisible) return;
    const list = listRef.current;
    if (!list) return;

    if (restoredForScrollKeyRef.current !== scrollKey) {
      restoredForScrollKeyRef.current = scrollKey;
      const saved = readSessionScroll(scrollKey);
      if (saved !== null) {
        list.scrollTop = saved;
        lastScrollTopRef.current = saved;
        lastAutoScrolledIdxRef.current = activeIdx;
        return;
      }
      lastScrollTopRef.current = null;
      lastAutoScrolledIdxRef.current = -1;
    }

    if (lastScrollTopRef.current !== null && activeIdx === lastAutoScrolledIdxRef.current) {
      list.scrollTop = lastScrollTopRef.current;
    }
  }, [activeIdx, cues.length, cuesLoading, isVisible, scrollKey]);

  useEffect(() => {
    if (!isVisible || activeIdx < 0 || cues.length === 0) return;
    if (activeIdx === lastAutoScrolledIdxRef.current) return;
    lastAutoScrolledIdxRef.current = activeIdx;
    const list = listRef.current;
    const el = list?.children[activeIdx] as HTMLElement | undefined;
    if (list && el) {
      const targetTop = Math.max(0, el.offsetTop - list.clientHeight / 2 + el.clientHeight / 2);
      list.scrollTo({
        top: targetTop,
        behavior: "smooth",
      });
      lastScrollTopRef.current = targetTop;
      writeSessionScroll(scrollKey, targetTop);
    }
  }, [activeIdx, cues.length, isVisible, scrollKey]);

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
  const isSubtitleJobActive = Boolean(isJobActive && activeJob?.mode !== "dub");
  const isDubJobActive = Boolean(isJobActive && activeJob?.mode === "dub");
  const activeJobTrackLabel = activeJob
    ? `${getLanguageName(activeJob.targetLanguage)} · ${activeJob.mode === "dub" ? "Dub" : "AI"}`
    : "";

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
                  isSubtitleJobActive && "ai-shimmer-row border border-primary/25",
                )}
              >
                <span className="flex min-w-0 items-center gap-2 truncate">
                  <Subtitles className="shrink-0 text-primary" />
                  <span
                    className={cn("truncate", isSubtitleJobActive && "ai-shimmer-text font-medium")}
                  >
                    {currentTrack
                      ? currentTrack.label
                      : isSubtitleJobActive
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
                {isSubtitleJobActive && activeJob && (
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

              {isSubtitleJobActive && activeJob && (
                <AiJobTraceCard job={activeJob} compact className="mt-0.5" />
              )}

              {(availableTracks.length > 0 || isSubtitleJobActive) && <DropdownMenuSeparator />}
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
              {youtubeId && (
                <DropdownMenuItem
                  className="rounded-md"
                  disabled={fetchingYt}
                  onClick={() => void handleFetchYoutubeTranscript()}
                >
                  <Subtitles /> {fetchingYt ? "Fetching YouTube…" : "Fetch YouTube"}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                className={cn(
                  "t-resize relative min-w-0 flex-1 justify-between overflow-hidden rounded-lg bg-secondary/75 hover:bg-secondary",
                  isDubJobActive && "ai-shimmer-row border border-primary/25",
                )}
              >
                <span className="flex min-w-0 items-center gap-2 truncate">
                  <Mic className="shrink-0 text-primary" />
                  <span className={cn("truncate", isDubJobActive && "ai-shimmer-text font-medium")}>
                    {isDubJobActive
                      ? activeJobTrackLabel
                      : selectedDubLang === "original"
                        ? "Original audio"
                        : `${getLanguageName(selectedDubLang)} · Dub`}
                  </span>
                </span>
                <ChevronDown className="ml-2 shrink-0 text-muted-foreground" />
                {isDubJobActive && activeJob && (
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
                const trackMeta = dubTracksMeta.find(
                  (t) => t.language.toLowerCase() === lang.toLowerCase(),
                );
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
                      {trackMeta?.engine && (
                        <span className="rounded-sm bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {trackMeta.engine === "clone" ? "Cloned" : "Neural"}
                        </span>
                      )}
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

              {isDubJobActive && activeJob && (
                <AiJobTraceCard job={activeJob} compact className="mt-0.5" />
              )}

              {!youtubeId && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="rounded-md text-primary focus:text-primary"
                    onClick={() => onOpenAiModal("dub")}
                  >
                    <Sparkles /> Generate dub…
                  </DropdownMenuItem>
                </>
              )}
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
            <AiJobTraceCard job={activeJob} className="w-full max-w-xs text-left" />
          ) : (
            <p className="text-sm text-muted-foreground">No subtitles yet.</p>
          )}
        </div>
      ) : (
        <ol
          ref={listRef}
          onScroll={(e) => {
            if (!isVisible) return;
            const top = e.currentTarget.scrollTop;
            lastScrollTopRef.current = top;
            writeSessionScroll(scrollKey, top);
          }}
          dir={currentTrack?.rtl ? "rtl" : "ltr"}
          className="relative min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-4 custom-scrollbar-sm"
        >
          {cues.map((cue, i) => (
            <li key={`${cue.start}-${i}`}>
              <button
                type="button"
                onClick={(e) => {
                  if (e.detail > 0) e.currentTarget.blur();
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
