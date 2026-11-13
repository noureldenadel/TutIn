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
  Globe2,
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
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import mayaAvatar from "@/assets/maya-chen-avatar.jpg";
import { RichNoteHtmlContent, RichNoteSurface } from "@/components/rich-note-surface";
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
import { getCourseLessons, getCourseModules } from "@/lib/course-lessons";
import {
  extractImagesFromHtml,
  getCourseNotes,
  hasMeaningfulHtmlContent,
  saveCourseNotes,
  stripHtmlToText,
  subscribeCourseNotesChanged,
  type NoteItem,
} from "@/lib/course-notes";
import { cn } from "@/lib/utils";
import type { Course } from "@/lib/courses";
import { InstructorAvatar } from "@/components/instructor-avatar";

const VIDEO_SRC =
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";

const courseModules = getCourseModules();
const allLessons = getCourseLessons().map((lesson, idx) => ({
  id: lesson.lessonId,
  title: lesson.title,
  duration: lesson.duration,
  modIdx: lesson.modIdx,
  modTitle: lesson.moduleTitle,
  lessonInMod: lesson.lessonInModule,
  lessonIdx: idx,
}));
const lessonTitles = allLessons.map((l) => l.title);
const durations = allLessons.map((l) => l.duration);

type Lang = "en" | "eg" | "sa";
const languages: { id: Lang; label: string; short: string; rtl?: boolean }[] = [
  { id: "en", label: "English (Original)", short: "English" },
  { id: "eg", label: "Arabic (Egyptian العامية)", short: "العامية المصرية", rtl: true },
  { id: "sa", label: "Arabic (Saudi الخليجية)", short: "الخليجية", rtl: true },
];

const cueText: Record<Lang, string[]> = {
  en: [
    "Welcome back. Today we're slowing down and looking closely.",
    "Good design starts with noticing what people actually need.",
    "Hierarchy tells the eye where to go first, and where to rest.",
    "Notice how size and weight create a natural reading order.",
    "Space isn't empty — it's what gives every element room to speak.",
    "Try squinting at your layout. What stands out immediately?",
    "Color should support meaning, never compete with it.",
    "Keep your palette small; let one accent do the heavy lifting.",
    "Alignment creates calm. Misalignment creates quiet tension.",
    "Let's apply this to a real screen, step by step.",
    "First, remove anything that doesn't serve the goal.",
    "Then group related things, and separate the rest.",
    "Finally, check it again with fresh eyes tomorrow.",
    "That's the whole loop: notice, simplify, refine.",
  ],
  eg: [
    "أهلاً بيك تاني. النهارده هنهدى شوية ونبص بتركيز.",
    "التصميم الحلو بيبدأ لما تاخد بالك الناس محتاجة إيه فعلاً.",
    "الترتيب بيقول للعين تبص فين الأول، وترتاح فين.",
    "شوف الحجم والتقل بيعملوا ترتيب قراءة طبيعي إزاي.",
    "المساحة الفاضية مش فاضية — هي اللي بتدي كل حاجة مكانها.",
    "جرّب تضيّق عينك على التصميم. إيه اللي باين على طول؟",
    "اللون لازم يخدم المعنى، مش ينافسه.",
    "خلّي الألوان قليلة؛ ولون واحد مميز يشيل الشغل.",
    "المحاذاة بتدي هدوء. واللخبطة بتعمل توتر خفيف.",
    "يلا نطبّق ده على شاشة حقيقية، خطوة بخطوة.",
    "الأول، شيل أي حاجة مش بتخدم الهدف.",
    "بعدين، جمّع الحاجات اللي شبه بعض، وافصل الباقي.",
    "وفي الآخر، بصّ عليه تاني بكرة بعين جديدة.",
    "دي كل الحكاية: لاحظ، بسّط، وحسّن.",
  ],
  sa: [
    "هلا فيك من جديد. اليوم بنهدّي شوي ونطالع بتمعّن.",
    "التصميم الزين يبدأ لما تنتبه وش يحتاج الناس صدق.",
    "الترتيب يقول للعين وين تروح أول، ووين ترتاح.",
    "لاحظ كيف الحجم والسماكة يسوون ترتيب قراءة طبيعي.",
    "المساحة مو فاضية — هي اللي تعطي كل عنصر مجاله.",
    "جرّب تصغّر عيونك على التصميم. وش اللي يبان على طول؟",
    "اللون لازم يخدم المعنى، مو ينافسه.",
    "خلّ ألوانك قليلة؛ ولون واحد مميز يشيل الحمل.",
    "المحاذاة تعطي هدوء. وعدمها يسوي توتر خفيف.",
    "يلا نطبّق هذا على شاشة حقيقية، خطوة خطوة.",
    "أول شي، شيل أي شي ما يخدم الهدف.",
    "بعدين، اجمع الأشياء المتشابهة، وافصل الباقي.",
    "وآخر شي، طالعه مرة ثانية بكرة بعين جديدة.",
    "هذي السالفة كلها: لاحظ، بسّط، وحسّن.",
  ],
};
const CUE_LEN = 7;

const fmt = (s: number) => {
  if (!Number.isFinite(s)) return "00:00";
  const m = Math.floor(s / 60),
    sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};
const fmtTime = (s: number) => {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60),
    sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
};
const parseTs = (t: string) => {
  const [m, s] = t.split(":").map(Number);
  return (m ?? 0) * 60 + (s ?? 0);
};

type Tab = "playlist" | "notes" | "transcript";

export function CoursePlayer({
  course,
  initialLessonIdx,
  initialTime,
  initialTab,
}: {
  course: Course;
  initialLessonIdx?: number | undefined;
  initialTime?: number | undefined;
  initialTab?: Tab | undefined;
}) {
  const clampedInitialLesson =
    typeof initialLessonIdx === "number" && Number.isFinite(initialLessonIdx)
      ? Math.max(0, Math.min(allLessons.length - 1, Math.floor(initialLessonIdx)))
      : 0;

  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
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
  const [audioTrack, setAudioTrack] = useState<"original" | "dubbed">("original");
  const [subtitleTrack, setSubtitleTrack] = useState<"en" | "ar" | "off">("en");
  const [isPiP, setIsPiP] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [tab, setTab] = useState<Tab>(initialTab ?? "playlist");
  const [active, setActive] = useState(clampedInitialLesson);
  const [done, setDone] = useState<boolean[]>(() => allLessons.map((_, i) => i < 8 && i !== 3));

  useEffect(() => {
    if (typeof initialLessonIdx === "number" && Number.isFinite(initialLessonIdx)) {
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
  }, [initialLessonIdx, initialTime, initialTab]);

  const currentLesson = allLessons[active] ?? allLessons[0]!;
  const effectiveDuration = duration || parseTs(durations[active] ?? "04:12");

  const seek = useCallback(
    (t: number) => {
      const v = videoRef.current;
      if (!v) return;
      v.currentTime = Math.max(0, Math.min(t, v.duration || effectiveDuration || t));
      setTime(v.currentTime);
    },
    [effectiveDuration],
  );
  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
    } else {
      v.pause();
    }
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
      ctx.fillText(currentLesson.title, 48, 215);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = "500 15px ui-monospace, monospace";
      ctx.fillText(`${course.title} • ${fmt(v?.currentTime ?? time)}`, 48, 250);
    }
    return canvas.toDataURL("image/jpeg", 0.88);
  }, [course.title, currentLesson.title, time]);

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
    const v = videoRef.current;
    if (v) {
      v.volume = volume;
      v.muted = muted;
    }
  }, [volume, muted]);
  useEffect(() => {
    const v = videoRef.current;
    if (v) v.playbackRate = speed;
  }, [speed]);

  const goTo = (i: number) => {
    if (i < 0 || i >= lessonTitles.length) return;
    setActive(i);
    seek(0);
  };

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-5 lg:h-[calc(100dvh-1.5rem-2px)] lg:flex-row lg:overflow-hidden">
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
            className="group relative z-10 min-h-0 w-full flex-1 overflow-hidden rounded-xl bg-player shadow-workspace max-lg:aspect-video"
          >
            <video
              ref={videoRef}
              src={VIDEO_SRC}
              playsInline
              preload="metadata"
              className="size-full object-contain"
              onClick={togglePlay}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
              onLoadedMetadata={(e) => {
                const media = e.currentTarget;
                setDuration(media.duration);
                if (pendingSeekRef.current !== null) {
                  const target = Math.max(
                    0,
                    Math.min(pendingSeekRef.current, media.duration || pendingSeekRef.current),
                  );
                  media.currentTime = target;
                  setTime(target);
                  pendingSeekRef.current = null;
                }
              }}
              onEnded={() => {
                if (autoplay && active < lessonTitles.length - 1) goTo(active + 1);
              }}
            />
            {!playing && (
              <button
                type="button"
                onClick={togglePlay}
                aria-label="Play"
                className="absolute left-1/2 top-1/2 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-card/90 text-primary shadow-workspace backdrop-blur transition-transform hover:scale-105"
              >
                <PlayIcon className="size-6" />
              </button>
            )}
            <div
              className={cn(
                "absolute inset-x-0 bottom-0 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pb-4 pt-12 text-white transition-opacity duration-200",
                playing
                  ? "opacity-0 group-hover:opacity-100 focus-within:opacity-100"
                  : "opacity-100",
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
                      title="Previous lesson"
                      className="p-1 transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      <PrevIcon className="size-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => goTo(active + 1)}
                      disabled={active === lessonTitles.length - 1}
                      aria-label="Next lesson"
                      title="Next lesson"
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
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label="Audio and subtitles"
                        title="Audio & Subtitles (C)"
                        className="flex items-center justify-center rounded-full p-1.5 text-white opacity-75 transition-all hover:bg-white/15 hover:opacity-100 data-[state=open]:opacity-100 [&_svg]:size-5"
                      >
                        <MessageSquareText />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      side="top"
                      sideOffset={10}
                      align="end"
                      className="w-56 rounded-lg p-1.5"
                    >
                      <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                        Audio
                      </p>
                      <DropdownMenuItem
                        className="rounded-md"
                        onClick={() => setAudioTrack("original")}
                      >
                        Original {audioTrack === "original" && <Check className="ml-auto" />}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="rounded-md"
                        onClick={() => setAudioTrack("dubbed")}
                      >
                        Dubbed {audioTrack === "dubbed" && <Check className="ml-auto" />}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                        Subtitles
                      </p>
                      <DropdownMenuItem
                        className="rounded-md"
                        onClick={() => setSubtitleTrack("en")}
                      >
                        English {subtitleTrack === "en" && <Check className="ml-auto" />}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="rounded-md"
                        onClick={() => setSubtitleTrack("ar")}
                      >
                        Arabic {subtitleTrack === "ar" && <Check className="ml-auto" />}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="rounded-md"
                        onClick={() => setSubtitleTrack("off")}
                      >
                        Off {subtitleTrack === "off" && <Check className="ml-auto" />}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <DropdownMenu>
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
              <ChevronRight className="size-3 shrink-0" />
              <span className="truncate">{currentLesson.modTitle}</span>
              <ChevronRight className="size-3 shrink-0" />
              <span className="shrink-0 font-medium text-foreground">
                Lesson {String(active + 1).padStart(2, "0")}
              </span>
            </nav>
            <h1
              className="mt-1.5 truncate text-xl font-semibold sm:text-2xl"
              title={lessonTitles[active]}
            >
              {lessonTitles[active]}
            </h1>
            <div className="mt-1.5 flex items-center gap-2 text-sm text-muted-foreground">
              <InstructorAvatar
                name={course.instructor}
                course={course}
                size="sm"
                imageUrl={course.instructor === "Maya Chen" ? mayaAvatar : undefined}
              />
              <span>{course.instructor}</span>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button asChild variant="ghost" className="rounded-md text-muted-foreground">
              <Link to="/manage/$courseId" params={{ courseId: String(course.id) }}>
                <ListChecks /> Manage
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {panelOpen && (
        <aside className="relative z-10 flex h-[640px] w-full shrink-0 flex-col overflow-hidden rounded-xl bg-card shadow-card lg:h-full lg:w-[380px]">
          <div className="border-b border-border/50 p-3">
            <div
              role="tablist"
              className="grid grid-cols-3 gap-1 rounded-lg bg-secondary/75 p-1"
            >
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
              <PlaylistTab active={active} done={done} setDone={setDone} onSelect={goTo} />
            )}
            {tab === "notes" && (
              <NotesTab
                courseId={String(course.id)}
                lessonIdx={active}
                lessonTitle={currentLesson.title}
                time={time}
                seek={seek}
                onCaptureFrame={captureVideoFrame}
                onPlay={playVideo}
                onPause={pauseVideo}
                getPlaybackState={getPlaybackState}
              />
            )}
            {tab === "transcript" && <TranscriptTab time={time} seek={seek} />}
          </div>
        </aside>
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
  active,
  done,
  setDone,
  onSelect,
}: {
  active: number;
  done: boolean[];
  setDone: Dispatch<SetStateAction<boolean[]>>;
  onSelect: (i: number) => void;
}) {
  const [manage, setManage] = useState(false);
  const [openMods, setOpenMods] = useState<boolean[]>(() => courseModules.map((_, idx) => idx < 2));
  const [dragState, setDragState] = useState<{ startIdx: number; targetValue: boolean } | null>(
    null,
  );
  const count = done.filter(Boolean).length;

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

    const stopDrag = () => setDragState(null);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
    };
  }, [dragState, setDone]);

  const toggleMod = (modIdx: number) => {
    setOpenMods((prev) => prev.map((open, idx) => (idx === modIdx ? !open : open)));
  };

  let globalLessonIdx = 0;

  return (
    <div className={cn("flex h-full flex-col", dragState && "select-none")}>
      <div className="px-3 pb-4 pt-1">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">
            Progress{" "}
            <span className="font-normal text-muted-foreground">
              • {count} / {done.length} done
            </span>
          </p>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Manage lessons"
            aria-pressed={manage}
            onClick={() => setManage(!manage)}
            className={cn(
              "size-8 rounded-md text-muted-foreground",
              manage && "bg-primary-soft text-primary",
            )}
          >
            <ListChecks />
          </Button>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${(count / done.length) * 100}%` }}
          />
        </div>
        {manage && (
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="flex-1 rounded-md"
              onClick={() => setDone(done.map(() => true))}
            >
              Mark done
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="flex-1 rounded-md"
              onClick={() => setDone(done.map(() => false))}
            >
              Reset
            </Button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 divide-y divide-border/50 overflow-y-auto px-3 pb-4 custom-scrollbar-sm">
        {courseModules.map((mod, modIdx) => {
          const startIdx = globalLessonIdx;
          globalLessonIdx += mod.lessons.length;
          const modDoneCount = mod.lessons.reduce(
            (acc, _, idx) => acc + (done[startIdx + idx] ? 1 : 0),
            0,
          );
          const modTotalSecs = mod.lessons.reduce((acc, l) => acc + parseTs(l.duration), 0);
          const isOpen = openMods[modIdx] ?? true;

          return (
            <div key={mod.title} className="py-2 first:pt-0 last:pb-0">
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
                    {modDoneCount}/{mod.lessons.length} videos • {fmtTime(modTotalSecs)}
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
                        key={lesson.title}
                        data-lesson-idx={i}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-secondary/60",
                          isActive &&
                            "bg-primary-soft/75 shadow-brand hover:bg-primary-soft/75",
                        )}
                      >
                        <button
                          type="button"
                          aria-label={done[i] ? "Mark as not done" : "Mark as done"}
                          title="Click or drag to mark lessons"
                          onPointerDown={(e) => {
                            if (e.button !== 0) return;
                            e.preventDefault();
                            const targetValue = !done[i];
                            setDragState({ startIdx: i, targetValue });
                            setDone((prev) => prev.map((d, j) => (j === i ? targetValue : d)));
                          }}
                          onKeyDown={(e) => {
                            if (e.key === " " || e.key === "Enter") {
                              e.preventDefault();
                              setDone((prev) => prev.map((d, j) => (j === i ? !d : d)));
                            }
                          }}
                          className={cn(
                            "flex size-5 shrink-0 touch-none items-center justify-center rounded-full border-2 border-border transition-colors hover:border-primary/60",
                            done[i] && "border-primary bg-primary text-primary-foreground",
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
): { completion: string; fullPhrase: string } | null {
  const match = /(\S+(?:\s+\S+){0,2})$/.exec(textBefore);
  if (!match) return null;
  const prefix = match[1]!.toLowerCase();
  if (prefix.length < 3) return null;

  for (const line of cueText.en) {
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
  content,
  onChange,
  onSubmit,
  onCancel,
  onCaptureScreenshot,
  onPlay,
  onPause,
  getPlaybackState,
  onSeek,
  autocompleteEnabled,
  smartPauseEnabled,
  smartPauseDelay,
  smartPauseRewind,
  placeholder = "Write a note…",
  onSmartPauseChange,
}: {
  content: string;
  onChange: (html: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onCaptureScreenshot: () => Promise<string>;
  onPlay: () => void;
  onPause: () => void;
  getPlaybackState: () => { isPlaying: boolean; currentTime: number };
  onSeek: (t: number) => void;
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

  return (
    <RichNoteSurface
      content={content}
      onChange={onChange}
      onSubmit={onSubmit}
      onCancel={onCancel}
      onCaptureScreenshot={onCaptureScreenshot}
      getSuggestion={autocompleteEnabled ? getTranscriptSuggestion : undefined}
      onWritingActivity={triggerWritingActivity}
      onSuspendSmartTimers={cleanupSmartTimers}
      placeholder={placeholder}
    />
  );
}

function NotesTab({
  courseId,
  lessonIdx,
  lessonTitle,
  time,
  seek,
  onCaptureFrame,
  onPlay,
  onPause,
  getPlaybackState,
}: {
  courseId: string;
  lessonIdx: number;
  lessonTitle: string;
  time: number;
  seek: (t: number) => void;
  onCaptureFrame: () => Promise<string>;
  onPlay: () => void;
  onPause: () => void;
  getPlaybackState: () => { isPlaying: boolean; currentTime: number };
}) {
  const [notes, setNotes] = useState<NoteItem[]>(() => getCourseNotes(courseId));
  const lastRevisionRef = useRef(0);
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

  useEffect(() => {
    setNotes(getCourseNotes(courseId));
  }, [courseId]);

  useEffect(() => {
    return subscribeCourseNotesChanged(courseId, (detail) => {
      if (detail.source === "player" && detail.revision <= lastRevisionRef.current) return;
      lastRevisionRef.current = detail.revision;
      setNotes(detail.notes);
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
    const filtered = notes.filter((n) => n.lessonIdx === lessonIdx);
    return [...filtered].sort((a, b) => {
      if (sortOrder === "asc") {
        return a.timestamp !== b.timestamp ? a.timestamp - b.timestamp : a.createdAt - b.createdAt;
      }
      return a.timestamp !== b.timestamp ? b.timestamp - a.timestamp : b.createdAt - a.createdAt;
    });
  }, [notes, lessonIdx, sortOrder]);

  const commitNotes = useCallback(
    (next: NoteItem[]) => {
      setNotes(next);
      lastRevisionRef.current = saveCourseNotes(courseId, next, "player");
    },
    [courseId],
  );

  const openNewNote = (initialHtml = "") => {
    setEditingNoteId(null);
    setNoteContent(initialHtml);
    setNoteTimestamp(time);
    setEditorKey((k) => k + 1);
    setShowAddNote(true);
  };

  const handleSaveNewNote = () => {
    if (!hasMeaningfulHtmlContent(noteContent)) return;
    const newNote: NoteItem = {
      id: `note-${Date.now()}`,
      courseId,
      videoId: allLessons[lessonIdx]?.id,
      lessonIdx,
      timestamp: noteTimestamp ?? time,
      content: noteContent,
      images: extractImagesFromHtml(noteContent),
      createdAt: Date.now(),
    };
    commitNotes([...notes, newNote]);
    setNoteContent("");
    setShowAddNote(false);
    setNoteTimestamp(null);
    setEditorKey((k) => k + 1);
  };

  const handleUpdateNote = () => {
    if (!editingNoteId || !hasMeaningfulHtmlContent(noteContent)) return;
    const next = notes.map((n) =>
      n.id === editingNoteId
        ? {
            ...n,
            content: noteContent,
            images: extractImagesFromHtml(noteContent),
            updatedAt: Date.now(),
          }
        : n,
    );
    commitNotes(next);
    setEditingNoteId(null);
    setNoteContent("");
    setEditorKey((k) => k + 1);
  };

  const handleDeleteNote = (id: string) => {
    commitNotes(notes.filter((n) => n.id !== id));
    toast("Note deleted");
  };

  const handleCopyNote = (html: string) => {
    navigator.clipboard?.writeText(stripHtmlToText(html));
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
        const tmp = document.createElement("div");
        tmp.innerHTML = note.content;
        const text = (tmp.textContent || tmp.innerText || "").trim();
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
            aria-label={sortOrder === "asc" ? "Sort: Oldest first" : "Sort: Latest first"}
            title={sortOrder === "asc" ? "Sort: Oldest first" : "Sort: Latest first"}
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
              content={noteContent}
              onChange={setNoteContent}
              onSubmit={handleSaveNewNote}
              onCancel={cancelEditor}
              onCaptureScreenshot={onCaptureFrame}
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
              onSave={handleSaveNewNote}
              saveLabel="Add note"
              isAdd
            />
          </div>
        )}

        {/* Saved Note Cards */}
        {lessonNotes.length === 0 && !showAddNote ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <p className="text-sm text-muted-foreground">No notes yet.</p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="mt-3 rounded-md"
              onClick={() => openNewNote("")}
            >
              <Plus className="size-3.5" /> Add note
            </Button>
          </div>
        ) : (
          lessonNotes.map((note) => {
            const isEditing = editingNoteId === note.id;
            return (
              <div
                key={note.id}
                className={cn(
                  "group overflow-hidden rounded-lg bg-secondary/55 transition-colors hover:bg-secondary/75",
                  isEditing && "rounded-xl bg-background ring-1 ring-primary/35 shadow-card hover:bg-background",
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
                      content={noteContent}
                      onChange={setNoteContent}
                      onSubmit={handleUpdateNote}
                      onCancel={cancelEditor}
                      onCaptureScreenshot={onCaptureFrame}
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="flex max-h-[90dvh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-card shadow-workspace"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                <Camera className="size-4 shrink-0 text-primary" />
                <span className="truncate">{previewImage.videoTitle}</span>
                <span className="shrink-0 rounded-full bg-secondary px-2.5 py-0.5 font-mono text-xs tabular-nums text-muted-foreground">
                  {fmt(previewImage.timestamp)}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <a
                  href={previewImage.src}
                  download={`screenshot-${fmt(previewImage.timestamp).replace(":", "-")}.jpg`}
                  aria-label="Download screenshot"
                  title="Download screenshot"
                  className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <Download className="size-4" />
                </a>
                <button
                  type="button"
                  aria-label="Close preview"
                  title="Close (Esc)"
                  onClick={() => setPreviewImage(null)}
                  className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
            <div className="flex min-h-[220px] flex-1 items-center justify-center overflow-auto bg-player p-4">
              <img
                src={previewImage.src}
                alt="Note screenshot preview"
                className="max-h-[75dvh] max-w-full rounded-lg object-contain"
              />
            </div>
          </div>
        </div>
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

function TranscriptTab({ time, seek }: { time: number; seek: (t: number) => void }) {
  const [lang, setLang] = useState<Lang>("en");
  const [dub, setDub] = useState(false);
  const [summary, setSummary] = useState<"idle" | "loading" | "ready">("idle");
  const listRef = useRef<HTMLOListElement>(null);
  const current = languages.find((l) => l.id === lang)!;
  const cues = useMemo(
    () => cueText[lang].map((text, i) => ({ start: i * CUE_LEN, text })),
    [lang],
  );
  const activeIdx = Math.min(Math.floor(time / CUE_LEN), cues.length - 1);

  useEffect(() => {
    const list = listRef.current;
    const el = list?.children[activeIdx] as HTMLElement | undefined;
    if (list && el)
      list.scrollTo({
        top: el.offsetTop - list.clientHeight / 2 + el.clientHeight / 2,
        behavior: "smooth",
      });
  }, [activeIdx]);

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 px-3 pb-3 pt-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" className="w-full justify-between rounded-lg bg-secondary/75 hover:bg-secondary">
              <span className="flex items-center gap-2">
                <Globe2 className="text-primary" />
                {current.short}
                {lang === "en" && <span className="text-muted-foreground">(Source)</span>}
              </span>
              <ChevronDown className="text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-[var(--radix-dropdown-menu-trigger-width)] rounded-lg p-1.5"
          >
            {languages.map((l) => (
              <DropdownMenuItem key={l.id} className="rounded-md" onClick={() => setLang(l.id)}>
                {l.label}
                {lang === l.id && <Check className="ml-auto text-primary" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="rounded-md text-primary focus:text-primary">
              <Plus /> Add language…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex gap-2">
          <button
            type="button"
            aria-pressed={dub}
            onClick={() => setDub(!dub)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md bg-secondary/75 px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
              dub && "bg-primary-soft text-primary ring-1 ring-primary/30 hover:bg-primary-soft hover:text-primary",
            )}
          >
            <Mic className="size-3.5" /> Voice dub{dub && " · On"}
          </button>
          <button
            type="button"
            disabled={summary === "loading"}
            onClick={() => {
              setSummary("loading");
              setTimeout(() => setSummary("ready"), 1200);
            }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-secondary/75 px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-60"
          >
            <Sparkles className={cn("size-3.5", summary === "loading" && "animate-spin")} />{" "}
            {summary === "loading" ? "Summarizing…" : "Summary"}
          </button>
        </div>
        {summary === "ready" && (
          <div className="rounded-lg bg-primary-soft/60 p-3 text-xs leading-5">
            <p className="mb-1 flex items-center gap-1.5 font-semibold text-primary">
              <Sparkles className="size-3.5" /> Summary
            </p>
            Good design comes from noticing needs, building clear hierarchy, using space and a small
            palette, then refining with fresh eyes.
          </div>
        )}
      </div>
      <ol
        ref={listRef}
        dir={current.rtl ? "rtl" : "ltr"}
        className="relative min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-4 custom-scrollbar-sm"
      >
        {cues.map((cue, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => seek(cue.start)}
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
    </div>
  );
}
