import { useState, useEffect, useMemo, useRef } from "react";
import { Sparkles, Languages, Mic, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  SUPPORTED_LANGUAGES,
  SPOKEN_COURSE_LANGUAGES,
  getLanguageName,
  formatTrackDisplayLabel,
  isCloneLanguageSupported,
} from "@/lib/languages";
import { updateCourse } from "@/lib/courses";
import {
  readAppSettings,
  writeAppSettings,
  SETTINGS_CHANGED_EVENT,
  type AppSettings,
  type DubBackgroundMode,
  type DubVoiceEngine,
  type DubVoiceGender,
} from "@/lib/app-settings";
import type { SubtitleSource } from "@/lib/course-lessons";
import {
  enqueueTranscriptJobs,
  cancelTranscriptJob,
  useVideoTranscriptJob,
  setSubtitleTrackSource,
} from "@/lib/transcript-ai";
import { toast } from "sonner";

export interface TranscriptModalLessonItem {
  id: string;
  title: string;
  youtubeId?: string | null | undefined;
  subtitleSources?: SubtitleSource[] | undefined;
  availableLanguages?: string[] | undefined;
  dubLanguages?: string[] | undefined;
  hasTranscript?: boolean | undefined;
}

interface TranscriptTranslateModalProps {
  isOpen: boolean;
  onClose: () => void;
  courseId: string;
  courseLanguage?: string | undefined;
  lessons: TranscriptModalLessonItem[];
  defaultMode?: "transcribe" | "translate" | "dub" | undefined;
  defaultTargetLang?: string | undefined;
  variant?: "inline" | "dialog" | undefined;
  onCourseLanguageChanged?: ((newLang: string) => void) | undefined;
  onJobQueued?: (targetLang: string, mode: "transcribe" | "translate" | "dub") => void | undefined;
}

export function TranscriptTranslateModal({
  isOpen,
  onClose,
  courseId,
  courseLanguage = "en",
  lessons,
  defaultMode = "transcribe",
  defaultTargetLang,
  variant = "dialog",
  onCourseLanguageChanged,
  onJobQueued,
}: TranscriptTranslateModalProps) {
  const [settings, setSettings] = useState<AppSettings>(() => readAppSettings());
  const [mode, setMode] = useState<"transcribe" | "translate" | "dub">(defaultMode);
  const [spokenLang, setSpokenLang] = useState<string>((courseLanguage || "en").toLowerCase());
  const [targetLang, setTargetLang] = useState<string>("ar");
  const [batchScope, setBatchScope] = useState<"missing" | "all">("missing");
  const [selectedSourceTrackId, setSelectedSourceTrackId] = useState<string>("auto");
  const [dubEngine, setDubEngine] = useState<DubVoiceEngine>(
    () => readAppSettings().dubVoiceEngine,
  );
  const [dubVoiceGender, setDubVoiceGender] = useState<DubVoiceGender>(
    () => readAppSettings().dubVoiceGender,
  );
  const [dubBgMode, setDubBgMode] = useState<DubBackgroundMode>(() => readAppSettings().dubBgMode);
  const [isSavingLang, setIsSavingLang] = useState(false);

  useEffect(() => {
    const sync = () => {
      const next = readAppSettings();
      setSettings(next);
      setDubEngine(next.dubVoiceEngine);
      setDubVoiceGender(next.dubVoiceGender);
      setDubBgMode(next.dubBgMode);
    };
    window.addEventListener(SETTINGS_CHANGED_EVENT, sync);
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, sync);
  }, []);

  const isSingleLesson = lessons.length === 1;
  const singleLesson = isSingleLesson ? lessons[0] : null;
  const activeJob = useVideoTranscriptJob(singleLesson?.id);
  const sawActiveJobRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      sawActiveJobRef.current = false;
      return;
    }
    if (activeJob && (activeJob.status === "running" || activeJob.status === "queued")) {
      sawActiveJobRef.current = true;
    } else if (sawActiveJobRef.current && !activeJob) {
      sawActiveJobRef.current = false;
      onClose();
    }
  }, [isOpen, activeJob, onClose]);

  useEffect(() => {
    if (isOpen) {
      const nextSettings = readAppSettings();
      setSettings(nextSettings);
      setDubEngine(nextSettings.dubVoiceEngine);
      setDubVoiceGender(nextSettings.dubVoiceGender);
      setDubBgMode(nextSettings.dubBgMode);
      setMode(defaultMode);
      const normalizedCourseLang = (courseLanguage || "en").toLowerCase();
      setSpokenLang(normalizedCourseLang);
      if (
        defaultTargetLang &&
        (defaultMode === "dub" || defaultTargetLang !== normalizedCourseLang)
      ) {
        setTargetLang(defaultTargetLang);
      } else {
        const fallbackTarget = normalizedCourseLang === "ar" ? "en" : "ar";
        setTargetLang(fallbackTarget);
      }
    }
  }, [isOpen, defaultMode, courseLanguage, defaultTargetLang]);

  const singleLessonTracks = useMemo(() => {
    if (!singleLesson) return [];
    return singleLesson.subtitleSources || [];
  }, [singleLesson]);

  useEffect(() => {
    if (!singleLessonTracks.length) {
      setSelectedSourceTrackId("auto");
      return;
    }
    const explicitSource = singleLessonTracks.find((t) => t.is_ai_source && t.id);
    if (explicitSource?.id) {
      setSelectedSourceTrackId(explicitSource.id);
      return;
    }
    const spokenMaster =
      singleLessonTracks.find((t) => (t.lang ?? "").toLowerCase() === spokenLang && t.is_master) ||
      singleLessonTracks.find((t) => (t.lang ?? "").toLowerCase() === spokenLang) ||
      singleLessonTracks[0];
    const resolvedId =
      spokenMaster?.id ||
      (spokenMaster ? `${spokenMaster.lang ?? "en"}:${spokenMaster.origin ?? "uploaded"}` : "auto");
    setSelectedSourceTrackId(resolvedId);
  }, [singleLessonTracks, spokenLang]);

  const selectedSourceTrack = useMemo(() => {
    if (!isSingleLesson || selectedSourceTrackId === "auto") return null;
    return (
      singleLessonTracks.find(
        (t) => (t.id || `${t.lang ?? "en"}:${t.origin ?? "uploaded"}`) === selectedSourceTrackId,
      ) ?? null
    );
  }, [isSingleLesson, selectedSourceTrackId, singleLessonTracks]);

  const effectiveTranslateSourceLang = (selectedSourceTrack?.lang || spokenLang).toLowerCase();

  const availableTargetLanguages = useMemo(() => {
    if (mode === "dub") {
      return SUPPORTED_LANGUAGES;
    }
    return SUPPORTED_LANGUAGES.filter((l) => l.code !== effectiveTranslateSourceLang);
  }, [effectiveTranslateSourceLang, mode]);

  useEffect(() => {
    const firstLang = availableTargetLanguages[0];
    if (mode === "translate" && targetLang === effectiveTranslateSourceLang && firstLang) {
      setTargetLang(firstLang.code);
    }
  }, [effectiveTranslateSourceLang, targetLang, availableTargetLanguages, mode]);

  const cloneSupportedForTarget = useMemo(() => isCloneLanguageSupported(targetLang), [targetLang]);

  const effectiveDubEngine: DubVoiceEngine =
    dubEngine === "clone" && !cloneSupportedForTarget ? "neural" : dubEngine;

  const hasExistingSpokenAiTrack = useMemo(() => {
    if (!singleLesson) return false;
    return singleLessonTracks.some(
      (t) => (t.lang ?? "").toLowerCase() === spokenLang && t.origin === "generated",
    );
  }, [singleLesson, singleLessonTracks, spokenLang]);

  const hasExistingTargetAiTrack = useMemo(() => {
    if (!singleLesson) return false;
    return singleLessonTracks.some(
      (t) => (t.lang ?? "").toLowerCase() === targetLang.toLowerCase() && t.origin === "generated",
    );
  }, [singleLesson, singleLessonTracks, targetLang]);

  const hasExistingTargetSubtitleAny = useMemo(() => {
    if (!singleLesson) return false;
    return singleLessonTracks.some(
      (t) => (t.lang ?? "").toLowerCase() === targetLang.toLowerCase(),
    );
  }, [singleLesson, singleLessonTracks, targetLang]);

  const hasExistingTargetDub = useMemo(() => {
    if (!singleLesson) return false;
    return (singleLesson.dubLanguages ?? []).some(
      (l) => l.toLowerCase() === targetLang.toLowerCase(),
    );
  }, [singleLesson, targetLang]);

  const missingTranscriptLessons = useMemo(() => {
    return lessons.filter((lesson) => {
      const sources = lesson.subtitleSources || [];
      const hasSpoken = sources.some((s) => (s.lang ?? "").toLowerCase() === spokenLang);
      return !hasSpoken && !lesson.hasTranscript;
    });
  }, [lessons, spokenLang]);

  const missingDubLessons = useMemo(() => {
    return lessons.filter((lesson) => {
      const dubs = lesson.dubLanguages || [];
      return !dubs.some((l) => l.toLowerCase() === targetLang.toLowerCase());
    });
  }, [lessons, targetLang]);

  const requiresOpenRouterKey =
    (mode === "translate" || (mode === "dub" && !hasExistingTargetSubtitleAny)) &&
    (targetLang === "ar-eg" || targetLang === "ar-sa") &&
    !settings.openRouterApiKey?.trim();

  const updateDubPreference = (patch: Partial<AppSettings>) => {
    const next = { ...readAppSettings(), ...patch };
    setSettings(next);
    if (patch.dubVoiceEngine) setDubEngine(patch.dubVoiceEngine);
    if (patch.dubVoiceGender) setDubVoiceGender(patch.dubVoiceGender);
    if (patch.dubBgMode) setDubBgMode(patch.dubBgMode);
    writeAppSettings(next);
  };

  const handleSpokenLangChange = async (nextLang: string) => {
    setSpokenLang(nextLang);
    if (!courseId) return;
    setIsSavingLang(true);
    try {
      await updateCourse(courseId, { language: nextLang });
      onCourseLanguageChanged?.(nextLang);
    } catch {
      // Non-fatal
    } finally {
      setIsSavingLang(false);
    }
  };

  const handleStart = async () => {
    if (requiresOpenRouterKey) {
      toast.error("Add an OpenRouter API key in Settings > AI for dialect translation.");
      return;
    }

    const lessonsToProcess = !isSingleLesson
      ? mode === "transcribe" && batchScope === "missing"
        ? missingTranscriptLessons
        : mode === "dub" && batchScope === "missing"
          ? missingDubLessons
          : lessons
      : lessons;

    if (lessonsToProcess.length === 0) {
      toast.info(
        mode === "dub"
          ? "All selected lessons already have this dub track."
          : "All selected lessons already have subtitles.",
      );
      return;
    }

    if (
      isSingleLesson &&
      singleLesson &&
      (mode === "translate" || mode === "dub") &&
      selectedSourceTrackId !== "auto"
    ) {
      try {
        await setSubtitleTrackSource(singleLesson.id, selectedSourceTrackId);
      } catch {
        // Proceed with selectedSourceTrackId
      }
    }

    enqueueTranscriptJobs(
      lessonsToProcess.map((lesson) => ({
        videoId: lesson.id,
        courseId,
        videoTitle: lesson.title,
        youtubeId: lesson.youtubeId,
        mode,
        targetLanguage: mode === "transcribe" ? spokenLang : targetLang,
        sourceLanguage: spokenLang,
        sourceTrackId:
          isSingleLesson &&
          (mode === "translate" || mode === "dub") &&
          selectedSourceTrackId !== "auto"
            ? selectedSourceTrackId
            : undefined,
        ...(mode === "dub"
          ? {
              dubEngine: effectiveDubEngine,
              dubVoiceGender,
              dubBgMode,
            }
          : {}),
      })),
    );

    const outLang = mode === "transcribe" ? spokenLang : targetLang;
    onJobQueued?.(outLang, mode);

    if (!isSingleLesson) {
      toast.success(
        `Queued ${lessonsToProcess.length} ${lessonsToProcess.length === 1 ? "lesson" : "lessons"}`,
      );
    }
    onClose();
  };

  const isInline = variant === "inline";

  const bodyAndFooter = (
    <>
      {/* Body */}
      <div className={cn(isInline ? "space-y-3 p-3.5" : "space-y-4 p-6")}>
        {/* 3-Way Mode Segmented Control */}
        <div className="grid grid-cols-3 gap-1 rounded-lg border border-border/50 bg-secondary/50 p-1">
          <button
            type="button"
            onClick={() => setMode("transcribe")}
            className={cn(
              "flex h-8 items-center justify-center gap-1.5 rounded-sm text-xs font-medium transition-colors",
              mode === "transcribe"
                ? "bg-card text-foreground shadow-sm dark:bg-accent"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Sparkles className="size-3.5 text-primary" />
            <span>Transcribe</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("translate")}
            className={cn(
              "flex h-8 items-center justify-center gap-1.5 rounded-sm text-xs font-medium transition-colors",
              mode === "translate"
                ? "bg-card text-foreground shadow-sm dark:bg-accent"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Languages className="size-3.5 text-primary" />
            <span>Translate</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("dub")}
            className={cn(
              "flex h-8 items-center justify-center gap-1.5 rounded-sm text-xs font-medium transition-colors",
              mode === "dub"
                ? "bg-card text-foreground shadow-sm dark:bg-accent"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Mic className="size-3.5 text-primary" />
            <span>Dub</span>
          </button>
        </div>

        {/* Spoken Course Language */}
        {mode === "transcribe" && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Spoken audio</label>
              {isSavingLang && <span className="text-[11px] text-muted-foreground">Saving…</span>}
            </div>
            <Select value={spokenLang} onValueChange={handleSpokenLangChange}>
              <SelectTrigger className="h-9 w-full rounded-lg border border-border/50 bg-secondary/75 text-[13px] text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[260px] rounded-lg border border-border/50">
                {SPOKEN_COURSE_LANGUAGES.map((lang) => (
                  <SelectItem
                    key={lang.code}
                    value={lang.code}
                    className="cursor-pointer rounded-md text-[13px]"
                  >
                    {lang.label} ({lang.nativeLabel})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {mode === "transcribe" ? (
          <>
            {!isSingleLesson && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Scope</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setBatchScope("missing")}
                    className={cn(
                      "flex h-9 items-center justify-between rounded-lg border px-3 text-xs font-medium transition-colors",
                      batchScope === "missing"
                        ? "border-primary/40 bg-primary-soft text-foreground"
                        : "border-border/50 bg-secondary/40 text-muted-foreground hover:bg-secondary/75 hover:text-foreground",
                    )}
                  >
                    <span>Missing only</span>
                    <span className="font-mono text-[11px] opacity-80">
                      {missingTranscriptLessons.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBatchScope("all")}
                    className={cn(
                      "flex h-9 items-center justify-between rounded-lg border px-3 text-xs font-medium transition-colors",
                      batchScope === "all"
                        ? "border-primary/40 bg-primary-soft text-foreground"
                        : "border-border/50 bg-secondary/40 text-muted-foreground hover:bg-secondary/75 hover:text-foreground",
                    )}
                  >
                    <span>All selected</span>
                    <span className="font-mono text-[11px] opacity-80">{lessons.length}</span>
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg border border-border/50 bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
              <span>Output track</span>
              <span className="font-medium text-foreground">
                {getLanguageName(spokenLang)} · AI
              </span>
            </div>

            {isSingleLesson && hasExistingSpokenAiTrack && (
              <p className="text-[11px] text-muted-foreground">
                Replaces existing {getLanguageName(spokenLang)} · AI track. Uploaded tracks remain
                intact.
              </p>
            )}
          </>
        ) : mode === "translate" ? (
          <>
            {/* Source Track Selection */}
            {isSingleLesson && singleLessonTracks.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Source track</label>
                <Select value={selectedSourceTrackId} onValueChange={setSelectedSourceTrackId}>
                  <SelectTrigger className="h-9 w-full rounded-lg border border-border/50 bg-secondary/75 text-[13px] text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-lg border border-border/50">
                    {singleLessonTracks.map((track) => {
                      const trackId =
                        track.id || `${track.lang ?? "en"}:${track.origin ?? "uploaded"}`;
                      const tags = [
                        track.is_master ? "Master" : null,
                        track.is_ai_source ? "Source" : null,
                      ]
                        .filter(Boolean)
                        .join(", ");
                      return (
                        <SelectItem
                          key={trackId}
                          value={trackId}
                          className="cursor-pointer rounded-md text-[13px]"
                        >
                          {formatTrackDisplayLabel(track)}
                          {tags ? ` (${tags})` : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Target Language Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Target language</label>
              <Select value={targetLang} onValueChange={setTargetLang}>
                <SelectTrigger className="h-9 w-full rounded-lg border border-border/50 bg-secondary/75 text-[13px] text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[260px] rounded-lg border border-border/50">
                  {availableTargetLanguages.map((lang) => (
                    <SelectItem
                      key={lang.code}
                      value={lang.code}
                      className="cursor-pointer rounded-md text-[13px]"
                    >
                      {lang.label} ({lang.nativeLabel})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/50 bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
              <span>Output track</span>
              <span className="font-medium text-foreground">
                {getLanguageName(targetLang)} · AI
              </span>
            </div>

            {isSingleLesson && hasExistingTargetAiTrack && (
              <p className="text-[11px] text-muted-foreground">
                Replaces existing {getLanguageName(targetLang)} · AI track. Uploaded tracks remain
                intact.
              </p>
            )}

            {requiresOpenRouterKey && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-300">
                <AlertCircle className="size-4 shrink-0 text-amber-500 dark:text-amber-400" />
                <span>Requires OpenRouter key in Settings &gt; AI.</span>
              </div>
            )}
          </>
        ) : (
          /* Dub Mode */
          <>
            {/* Target Language Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Target language</label>
              <Select value={targetLang} onValueChange={setTargetLang}>
                <SelectTrigger className="h-9 w-full rounded-lg border border-border/50 bg-secondary/75 text-[13px] text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[260px] rounded-lg border border-border/50">
                  {availableTargetLanguages.map((lang) => (
                    <SelectItem
                      key={lang.code}
                      value={lang.code}
                      className="cursor-pointer rounded-md text-[13px]"
                    >
                      {lang.label} ({lang.nativeLabel})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Voice Engine (Neural vs Clone) */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Voice engine</label>
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-secondary/75 p-1">
                <button
                  type="button"
                  onClick={() => updateDubPreference({ dubVoiceEngine: "neural" })}
                  className={cn(
                    "rounded-sm px-2.5 py-1.5 text-xs font-medium transition-colors",
                    effectiveDubEngine === "neural"
                      ? "bg-card text-foreground shadow-card dark:bg-accent"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Neural · Fast
                </button>
                <button
                  type="button"
                  disabled={!cloneSupportedForTarget}
                  onClick={() => updateDubPreference({ dubVoiceEngine: "clone" })}
                  className={cn(
                    "rounded-sm px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                    effectiveDubEngine === "clone"
                      ? "bg-card text-foreground shadow-card dark:bg-accent"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Clone · Instructor
                </button>
              </div>
            </div>

            {/* Neural Voice Gender (Male vs Female) */}
            {effectiveDubEngine === "neural" && (
              <div className="flex items-center justify-between gap-3">
                <label className="text-xs font-medium text-muted-foreground">Voice</label>
                <div className="flex items-center rounded-lg bg-secondary/75 p-1">
                  {(["male", "female"] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => updateDubPreference({ dubVoiceGender: g })}
                      className={cn(
                        "rounded-sm px-3 py-1 text-xs font-medium capitalize transition-colors",
                        dubVoiceGender === g
                          ? "bg-card text-foreground shadow-card dark:bg-accent"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Background Audio Mode (2 options: Auto-duck vs Separate music) */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Background audio</label>
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-secondary/75 p-1">
                <button
                  type="button"
                  onClick={() => updateDubPreference({ dubBgMode: "ducking" })}
                  className={cn(
                    "rounded-sm px-2.5 py-1.5 text-xs font-medium transition-colors",
                    dubBgMode === "ducking"
                      ? "bg-card text-foreground shadow-card dark:bg-accent"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Auto-duck
                </button>
                <button
                  type="button"
                  onClick={() => updateDubPreference({ dubBgMode: "demucs" })}
                  className={cn(
                    "rounded-sm px-2.5 py-1.5 text-xs font-medium transition-colors",
                    dubBgMode === "demucs"
                      ? "bg-card text-foreground shadow-card dark:bg-accent"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Separate music
                </button>
              </div>
            </div>

            {!isSingleLesson && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Scope</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setBatchScope("missing")}
                    className={cn(
                      "flex h-9 items-center justify-between rounded-lg border px-3 text-xs font-medium transition-colors",
                      batchScope === "missing"
                        ? "border-primary/40 bg-primary-soft text-foreground"
                        : "border-border/50 bg-secondary/40 text-muted-foreground hover:bg-secondary/75 hover:text-foreground",
                    )}
                  >
                    <span>Missing only</span>
                    <span className="font-mono text-[11px] opacity-80">
                      {missingDubLessons.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBatchScope("all")}
                    className={cn(
                      "flex h-9 items-center justify-between rounded-lg border px-3 text-xs font-medium transition-colors",
                      batchScope === "all"
                        ? "border-primary/40 bg-primary-soft text-foreground"
                        : "border-border/50 bg-secondary/40 text-muted-foreground hover:bg-secondary/75 hover:text-foreground",
                    )}
                  >
                    <span>All selected</span>
                    <span className="font-mono text-[11px] opacity-80">{lessons.length}</span>
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg border border-border/50 bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
              <span>Output track</span>
              <span className="font-medium text-foreground">
                {getLanguageName(targetLang)} · Dub (
                {effectiveDubEngine === "clone" ? "Cloned" : "Neural"})
              </span>
            </div>

            {isSingleLesson && !hasExistingTargetSubtitleAny && (
              <p className="text-[11px] text-muted-foreground">
                Auto-translates subtitles to {getLanguageName(targetLang)} first.
              </p>
            )}

            {isSingleLesson && hasExistingTargetDub && (
              <p className="text-[11px] text-muted-foreground">
                Replaces existing {getLanguageName(targetLang)} dub track.
              </p>
            )}

            {requiresOpenRouterKey && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-300">
                <AlertCircle className="size-4 shrink-0 text-amber-500 dark:text-amber-400" />
                <span>Requires OpenRouter key in Settings &gt; AI.</span>
              </div>
            )}
          </>
        )}

        {/* Live Job Progress for Single Lesson */}
        {activeJob && (activeJob.status === "running" || activeJob.status === "queued") && (
          <div className="ai-shimmer-row space-y-2 rounded-lg border border-primary/25 bg-primary-soft/40 p-3">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="ai-shimmer-text truncate pr-2 font-medium">{activeJob.message}</span>
              <span className="shrink-0 font-mono font-semibold text-primary tabular-nums">
                {activeJob.progress}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-gradient-to-r from-primary via-chart-2 to-chart-1 transition-all duration-300"
                style={{ width: `${Math.max(4, activeJob.progress)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer
        className={cn(
          "flex items-center justify-end gap-2 border-t border-border/50 bg-shell/40",
          isInline ? "px-3.5 py-2.5" : "px-6 py-3.5",
        )}
      >
        {activeJob && (activeJob.status === "running" || activeJob.status === "queued") ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => cancelTranscriptJob(activeJob.videoId)}
              className="border-red-500/30 bg-red-500/10 text-red-500 hover:bg-red-500/20 hover:text-red-500"
            >
              Cancel job
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Hide
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-muted-foreground"
            >
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={handleStart} disabled={requiresOpenRouterKey}>
              {mode === "transcribe" ? (
                <>
                  <Sparkles className="size-3.5" />
                  <span>
                    {isSingleLesson && hasExistingSpokenAiTrack ? "Regenerate" : "Generate"}
                  </span>
                </>
              ) : mode === "dub" ? (
                <>
                  <Mic className="size-3.5" />
                  <span>{isSingleLesson && hasExistingTargetDub ? "Redub" : "Generate dub"}</span>
                </>
              ) : (
                <>
                  <Languages className="size-3.5" />
                  <span>Translate</span>
                </>
              )}
            </Button>
          </>
        )}
      </footer>
    </>
  );

  if (isInline) {
    if (!isOpen) return null;
    return (
      <div className="t-resize overflow-hidden rounded-xl border border-border/50 bg-card text-card-foreground shadow-card animate-in fade-in-0 slide-in-from-top-1 duration-200">
        <div className="flex items-center justify-between border-b border-border/50 px-3.5 py-2.5">
          <span className="truncate text-xs font-semibold text-foreground">
            {mode === "dub" ? "Voice dubbing" : "Subtitles"}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
        {bodyAndFooter}
      </div>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[440px] gap-0 overflow-hidden rounded-xl border border-border/50 bg-card p-0 text-card-foreground shadow-workspace sm:rounded-xl">
        <DialogHeader className="border-b border-border/50 px-6 py-4 pr-12 text-left">
          <DialogTitle className="truncate text-base font-semibold">
            {isSingleLesson ? "Subtitles & Dubbing" : `Batch Subtitles & Dub (${lessons.length})`}
          </DialogTitle>
          {singleLesson && (
            <DialogDescription className="truncate pt-0.5 text-xs text-muted-foreground">
              {singleLesson.title}
            </DialogDescription>
          )}
        </DialogHeader>
        {bodyAndFooter}
      </DialogContent>
    </Dialog>
  );
}
