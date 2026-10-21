import { useState, useMemo, useEffect } from "react";
import {
  Palette,
  RefreshCw,
  Sliders,
  Sparkles,
  RotateCcw,
  Check,
  Eye,
  Layers,
  Settings2,
  Lock,
  Unlock,
  Info,
  Save,
  BookOpen,
  UserCheck,
  Copy,
  ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  courses as initialCourses,
  type Course,
} from "@/lib/courses";
import {
  useThumbnailSettings,
  getStoredThumbnailSettings,
  DEFAULT_GENERATOR_SETTINGS,
  HUES,
  PATTERN_NAMES,
  SETTINGS_DEFS,
  generateThumbnailSvg,
  computePalette,
  getAvatarColors,
  rng,
  SAMPLE_COVERS,
  SAMPLE_COVER_DETAILS,
  getCourseCoverUrl,
  type ThumbnailSettings,
  type ThumbnailCoverMode,
} from "@/lib/thumbnail-generator";
import { CourseThumbnail } from "@/components/course-thumbnail";
import { InstructorAvatar } from "@/components/instructor-avatar";

export function AdminDashboard() {
  const [globalSettings, setGlobalSettings, resetGlobalSettings] = useThumbnailSettings();

  // Working draft settings for the playground
  const [draft, setDraft] = useState<ThumbnailSettings>(globalSettings);
  const [previewSeed, setPreviewSeed] = useState<number>(48213);
  const [previewProgress, setPreviewProgress] = useState<number>(65);
  const [isSaved, setIsSaved] = useState<boolean>(true);
  const [testName, setTestName] = useState<string>("Maya Chen");
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  // Synchronize draft with client storage on mount (prevents SSR default overwrite)
  useEffect(() => {
    const stored = getStoredThumbnailSettings();
    setDraft(stored);
  }, []);

  // Per-course preview overrides for experimentation
  const [courseSeeds, setCourseSeeds] = useState<Record<number, number>>({});

  const activePalette = useMemo(() => {
    return computePalette(draft.hue, draft.drift, draft.contrast);
  }, [draft.hue, draft.drift, draft.contrast]);

  const avatarColors = useMemo(() => {
    return getAvatarColors(previewSeed, activePalette, draft);
  }, [previewSeed, activePalette, draft]);

  const activePatternIndex = useMemo(() => {
    if (draft.pattern === "auto") return Math.abs(previewSeed % 4);
    return parseInt(draft.pattern, 10) || 0;
  }, [draft.pattern, previewSeed]);

  const livePreview = useMemo(() => {
    return generateThumbnailSvg(previewSeed, draft, draft.hue);
  }, [previewSeed, draft]);

  const handleSliderChange = (key: keyof ThumbnailSettings, val: number) => {
    setDraft((prev) => ({ ...prev, [key]: val }));
    setIsSaved(false);
  };

  const handleRegenerateSeed = () => {
    const nextSeed = Math.floor(Math.random() * 90000) + 10000;
    setPreviewSeed(nextSeed);
    const r = rng(nextSeed);
    setDraft((prev) => {
      const rolledHue = HUES[Math.floor(r() * HUES.length)];
      const nextHue = prev.lockHue ? prev.hue : (rolledHue ?? prev.hue);
      const nextDrift = Math.round((r() - 0.5) * 80);
      return {
        ...prev,
        hue: nextHue,
        drift: Math.max(-60, Math.min(60, nextDrift)),
      };
    });
    setIsSaved(false);
  };

  const handleCopyCode = async () => {
    const codeSnippet = `export const DEFAULT_GENERATOR_SETTINGS: ThumbnailSettings = ${JSON.stringify(draft, null, 2)};`;
    try {
      await navigator.clipboard.writeText(codeSnippet);
      setCopiedCode(true);
      toast.success("Settings snippet copied to clipboard.");
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      toast.error("Failed to copy snippet.");
    }
  };

  const handleApplyToApp = () => {
    setGlobalSettings(draft);
    setIsSaved(true);
    toast.success("Settings saved! Thumbnails and avatars updated app-wide.");
  };

  const handleResetToDefaults = () => {
    resetGlobalSettings();
    setDraft(DEFAULT_GENERATOR_SETTINGS);
    setPreviewSeed(48213);
    setCourseSeeds({});
    setIsSaved(true);
    toast.info("Thumbnail settings reset to defaults.");
  };

  const randomizeCourseSeed = (courseId: number) => {
    const newSeed = Math.floor(Math.random() * 90000) + 10000;
    setCourseSeeds((prev) => ({ ...prev, [courseId]: newSeed }));
  };

  return (
    <div className="mx-auto max-w-[1440px] px-5 pb-16 pt-6 sm:px-8 sm:pt-8 lg:px-10">
      {/* Top Header */}
      <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <Palette className="size-6 text-foreground" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Artwork Generator
            </h1>
            <Badge variant="secondary" className="hidden sm:inline-flex gap-1.5 font-mono text-xs rounded-full px-2.5">
              <Sparkles className="size-3 text-primary" /> Live Engine
            </Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
            Tune generative vector artwork and avatar palettes.
          </p>
        </div>

        {/* Global Action Bar */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyCode}
            className="gap-1.5"
            title="Copy settings code to paste into DEFAULT_GENERATOR_SETTINGS"
          >
            {copiedCode ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}
            {copiedCode ? "Copied code" : "Copy code"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleResetToDefaults}
            className="gap-1.5"
          >
            <RotateCcw className="size-3.5" />
            Reset defaults
          </Button>

          <Button
            size="sm"
            onClick={handleApplyToApp}
            className="gap-1.5 shadow-sm"
          >
            {isSaved ? <Check className="size-4" /> : <Save className="size-4" />}
            {isSaved ? "Saved" : "Save changes"}
          </Button>
        </div>
      </div>

      {/* Main Split Grid */}
      <div className="mt-8 grid gap-8 lg:grid-cols-12 items-start">
        {/* Left Column: Interactive Playground & Seed Card */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <div className="rounded-xl border border-border bg-card p-5 shadow-card">
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Eye className="size-4 text-primary" />
                <h2 className="text-base font-semibold text-foreground">Interactive Card Preview</h2>
              </div>
              <Badge variant="secondary" className="font-mono text-xs">
                seed {previewSeed}
              </Badge>
            </div>

            {/* Simulated Course Card */}
            <div className="mt-5 overflow-hidden rounded-xl bg-background">
              <div className="relative aspect-video overflow-hidden bg-black/90">
                {draft.coverMode === "images" ? (
                  <img
                    src={SAMPLE_COVERS[draft.previewImageIndex ?? 0]}
                    alt="Sample preview"
                    className="size-full object-cover"
                  />
                ) : draft.coverMode === "mixed" && ((previewSeed * 7 + 3) % 2 === 0) ? (
                  <img
                    src={SAMPLE_COVERS[Math.abs(previewSeed - 1) % SAMPLE_COVERS.length]}
                    alt="Sample preview"
                    className="size-full object-cover"
                  />
                ) : (
                  <div
                    className="size-full [&>svg]:size-full [&>svg]:block"
                    dangerouslySetInnerHTML={{ __html: livePreview.svg }}
                  />
                )}
                <span className="absolute bottom-2.5 right-2.5 z-20 rounded bg-black/75 px-2 py-0.5 font-mono text-[11px] font-semibold text-white backdrop-blur-sm">
                  4h 20m
                </span>
                {draft.coverMode === "images" && (
                  <span className="absolute bottom-2.5 left-2.5 z-20 rounded bg-black/75 px-2 py-0.5 font-mono text-[10px] font-semibold text-white backdrop-blur-sm">
                    {SAMPLE_COVER_DETAILS[draft.previewImageIndex ?? 0]?.format ?? "Cover"} Cover
                  </span>
                )}
                {draft.coverMode === "mixed" && (
                  <span className="absolute bottom-2.5 left-2.5 z-20 rounded bg-black/75 px-2 py-0.5 font-mono text-[10px] font-semibold text-white backdrop-blur-sm">
                    {((previewSeed * 7 + 3) % 2 === 0) ? "Uploaded Cover" : "Vector Art"}
                  </span>
                )}
              </div>
              <div className="p-4">
                <p className="font-serif text-lg font-semibold leading-snug text-foreground">
                  Product Design Fundamentals
                </p>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <InstructorAvatar name="Maya Chen" size="xs" palette={activePalette} seed={previewSeed} customSettings={draft} />
                  Maya Chen
                </div>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${previewProgress}%`,
                      backgroundColor: activePalette.tones[3],
                    }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{Math.round((previewProgress * 12) / 100)} / 12 lessons</span>
                  <span className="font-semibold text-foreground">{previewProgress}%</span>
                </div>
              </div>
            </div>

            {/* Swatch & Seed Details */}
            <div className="mt-5">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                <span>Color Palette Tones & Spark</span>
                <span className="font-mono text-[11px]">
                  {PATTERN_NAMES[String(activePatternIndex)] || "Pattern"}
                </span>
              </div>
              <div className="flex gap-1.5 h-6 rounded-md overflow-hidden p-0.5 bg-secondary/50">
                {activePalette.tones.map((t, idx) => (
                  <div
                    key={idx}
                    className="flex-1 rounded-sm shadow-inner transition-colors"
                    style={{ backgroundColor: t }}
                    title={`Tone ${idx + 1}: ${t}`}
                  />
                ))}
                <div
                  className="w-5 rounded-sm shadow-inner transition-colors border border-white/20"
                  style={{ backgroundColor: activePalette.spark }}
                  title={`Spark: ${activePalette.spark}`}
                />
              </div>
            </div>

            {/* Quick Generator Trigger Buttons */}
            <div className="mt-5 flex items-center gap-3">
              <Button
                type="button"
                className="flex-1 gap-2"
                onClick={handleRegenerateSeed}
              >
                <RefreshCw className="size-4" /> Regenerate
              </Button>
            </div>

            {/* Lock Hue toggle */}
            <div className="mt-4 flex items-center justify-between px-1 pt-2">
              <div className="flex items-center gap-2">
                {draft.lockHue ? (
                  <Lock className="size-4 text-primary" />
                ) : (
                  <Unlock className="size-4 text-muted-foreground" />
                )}
                <span className="text-xs font-medium text-foreground">Lock hue on regenerate</span>
              </div>
              <Switch
                checked={draft.lockHue ?? false}
                onCheckedChange={(checked) => {
                  setDraft((prev) => ({ ...prev, lockHue: checked }));
                  setIsSaved(false);
                }}
              />
            </div>
          </div>
        </div>

        {/* Right Column: Settings Sliders & App-Wide Controls */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          {/* Cover Artwork Source Selector */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-card">
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <div className="flex items-center gap-2">
                <ImageIcon className="size-4 text-primary" />
                <h2 className="text-base font-semibold text-foreground">Thumbnail Cover Source</h2>
              </div>
              <Badge variant="secondary" className="font-mono text-[11px] capitalize">
                {draft.coverMode ?? "generated"}
              </Badge>
            </div>

            <div className="mt-4 space-y-4">
              <p className="text-xs text-muted-foreground">
                Choose whether courses use uploaded thumbnail images or algorithmic SVG vector placeholders.
              </p>

              {/* 3-way Segmented Control */}
              <div className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-secondary/50 p-1">
                {([
                  ["generated", "Generated", "Vector SVG only"],
                  ["images", "Sample images", "All 4 images"],
                  ["mixed", "Mixed (Both)", "Covers + Vector"],
                ] as const).map(([mode, label, sub]) => {
                  const isActive = (draft.coverMode ?? "generated") === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        setDraft((prev) => ({ ...prev, coverMode: mode }));
                        setIsSaved(false);
                      }}
                      className={cn(
                        "flex flex-col items-center justify-center rounded-sm px-2 py-2 text-center transition-all",
                        isActive
                          ? "bg-card text-foreground shadow-card font-medium"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <span className="text-xs font-semibold">{label}</span>
                      <span className="text-[10px] text-muted-foreground">{sub}</span>
                    </button>
                  );
                })}
              </div>

              {/* Sample Images Gallery */}
              {((draft.coverMode ?? "generated") !== "generated") && (
                <div className="mt-4 pt-3 border-t border-border/60">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-foreground">Sample Cover Images</span>
                    {draft.coverMode === "images" && (
                      <span className="text-[11px] text-muted-foreground">Click to select card preview</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {SAMPLE_COVER_DETAILS.map((sample, idx) => {
                      const isSelected = (draft.previewImageIndex ?? 0) === idx && draft.coverMode === "images";
                      return (
                        <button
                          key={sample.url}
                          type="button"
                          onClick={() => {
                            setDraft((prev) => ({ ...prev, previewImageIndex: idx }));
                            setIsSaved(false);
                          }}
                          className={cn(
                            "group relative aspect-video overflow-hidden rounded-lg border text-left transition-all",
                            isSelected
                              ? "border-primary ring-2 ring-primary/40 shadow-sm"
                              : "border-border hover:border-foreground/30"
                          )}
                        >
                          <img
                            src={sample.url}
                            alt={sample.label}
                            className="size-full object-cover transition-transform group-hover:scale-105 duration-200"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent pointer-events-none" />
                          <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between pointer-events-none">
                            <span className="text-[10px] font-semibold text-white drop-shadow-sm truncate">
                              {sample.label}
                            </span>
                            <span className="rounded bg-black/60 px-1 py-0.2 font-mono text-[9px] font-semibold text-white">
                              {sample.format}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Placeholder files: <code className="font-mono">thumbnail (1).jpg</code>, <code className="font-mono">thumbnail (1).png</code>, <code className="font-mono">thumbnail (1).webp</code>, <code className="font-mono">thumbnail (2).jpg</code>
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Settings Control Panel */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-card">
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Sliders className="size-4 text-primary" />
                <h2 className="text-base font-semibold text-foreground">Algorithmic Parameters</h2>
              </div>
              <span className="text-xs text-muted-foreground">App-wide defaults</span>
            </div>

            <div className="mt-6 grid gap-5">
              {/* Pattern Mode Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                <label className="sm:col-span-4 text-xs font-semibold text-foreground">
                  Pattern Algorithm
                </label>
                <div className="sm:col-span-8">
                  <Select
                    value={draft.pattern}
                    onValueChange={(val: any) => {
                      setDraft((prev) => ({ ...prev, pattern: val }));
                      setIsSaved(false);
                    }}
                  >
                    <SelectTrigger className="h-9 rounded-lg">
                      <SelectValue placeholder="Select pattern" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto (Deterministic from seed)</SelectItem>
                      <SelectItem value="0">Binary ramp (Column block grid)</SelectItem>
                      <SelectItem value="1">Thin strips (Horizontal regular)</SelectItem>
                      <SelectItem value="2">Block rows (Asymmetric blocks)</SelectItem>
                      <SelectItem value="3">Ramp rows (Logarithmic stepped rows)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Sliders */}
              {SETTINGS_DEFS.map((def) => {
                const val = draft[def.key as keyof ThumbnailSettings] as number;
                return (
                  <div
                    key={def.key}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center"
                  >
                    <div className="sm:col-span-4 flex items-center justify-between sm:justify-start gap-2">
                      <span className="text-xs font-medium text-foreground">{def.label}</span>
                      {def.key === "hue" && (
                        <span
                          className="inline-block size-3.5 rounded-full border border-border shadow-inner"
                          style={{ backgroundColor: `hsl(${val}, 70%, 50%)` }}
                        />
                      )}
                    </div>
                    <div className="sm:col-span-6">
                      <Slider
                        min={def.min}
                        max={def.max}
                        step={def.step}
                        value={[val]}
                        onValueChange={([v]) => handleSliderChange(def.key as keyof ThumbnailSettings, v ?? def.min)}
                      />
                    </div>
                    <div className="sm:col-span-2 text-right">
                      <span className="font-mono text-xs font-semibold text-muted-foreground">
                        {val}
                        {def.key === "hue" || def.key === "drift" ? "°" : ""}
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Preview Progress Slider */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center pt-2 border-t border-border/60">
                <div className="sm:col-span-4">
                  <span className="text-xs font-medium text-foreground">Sample Progress</span>
                </div>
                <div className="sm:col-span-6">
                  <Slider
                    min={0}
                    max={100}
                    step={1}
                    value={[previewProgress]}
                    onValueChange={([v]) => setPreviewProgress(v ?? 65)}
                  />
                </div>
                <div className="sm:col-span-2 text-right">
                  <span className="font-mono text-xs font-semibold text-muted-foreground">
                    {previewProgress}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Notice Card */}
          <div className="flex gap-3.5 rounded-xl border border-border bg-secondary/30 p-4">
            <Info className="size-5 shrink-0 text-primary mt-0.5" />
            <div className="text-xs leading-relaxed text-muted-foreground">
              <strong className="text-foreground font-semibold">Deterministic & Private: </strong>
              Mathematical seeds run offline with zero network requests.
            </div>
          </div>
        </div>
      </div>

      {/* Avatar Studio & Contrast Lab */}
      <section className="mt-12 rounded-xl border border-border bg-card p-6 shadow-card">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pb-5 border-b border-border">
          <div>
            <div className="flex items-center gap-2">
              <UserCheck className="size-5 text-primary" />
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                Avatar Studio & Contrast Lab
              </h2>
            </div>
          </div>
          <Badge variant="secondary" className="font-mono text-xs w-fit">
            {avatarColors.contrastRating}
          </Badge>
        </div>

        <div className="mt-6 grid gap-8 lg:grid-cols-12 items-start">
          {/* Left Column: Live Visual Showcase */}
          <div className="lg:col-span-6 flex flex-col gap-6">
            {/* Interactive Name Tester */}
            <div className="space-y-2.5">
              <label className="text-xs font-semibold text-foreground block">
                Test Instructor Name / Initials
              </label>
              <div className="flex gap-2">
                <Input
                  value={testName}
                  onChange={(e) => setTestName(e.target.value)}
                  placeholder="Enter name (e.g. Maya Chen)"
                  className="bg-card h-9"
                />
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => {
                    const samples = ["Maya Chen", "Alex Rivera", "David Kim", "Priya Patel", "Marcus Aurelius", "Elena Rostova"];
                    const next = samples[(samples.indexOf(testName) + 1) % samples.length] ?? "Maya Chen";
                    setTestName(next);
                  }}
                  className="shrink-0 text-xs h-9"
                >
                  <RefreshCw className="size-3.5 mr-1" /> Cycle name
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {["Maya Chen", "Alex Rivera", "David Kim", "Priya Patel"].map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => setTestName(sample)}
                    className={cn(
                      "rounded px-2.5 py-1 text-xs transition-colors",
                      testName === sample
                        ? "bg-primary text-primary-foreground font-medium shadow-sm"
                        : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
                    )}
                  >
                    {sample}
                  </button>
                ))}
              </div>
            </div>

            {/* Size Spectrum Showcase */}
            <div className="space-y-2.5">
              <span className="text-xs font-semibold text-foreground block">
                Size Spectrum Preview
              </span>
              <div className="flex items-end justify-between gap-3 py-3.5 px-4 rounded-xl bg-secondary/50">
                {(["xs", "sm", "md", "lg", "xl"] as const).map((s) => (
                  <div key={s} className="flex flex-col items-center gap-2">
                    <InstructorAvatar
                      name={testName}
                      size={s}
                      palette={activePalette}
                      seed={previewSeed}
                      customSettings={draft}
                    />
                    <div className="text-center">
                      <span className="font-mono text-[10px] font-semibold text-muted-foreground block uppercase">
                        {s}
                      </span>
                      <span className="text-[10px] text-muted-foreground/75 block">
                        {s === "xs" ? "20px" : s === "sm" ? "28px" : s === "md" ? "36px" : s === "lg" ? "48px" : "64px"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Multi-Surface Showcase */}
            <div className="space-y-2.5">
              <span className="text-xs font-semibold text-foreground block">
                Surface Contrast Comparison
              </span>
              <div className="grid grid-cols-3 gap-3">
                {/* On canvas */}
                <div className="rounded-lg bg-background p-3 text-center flex flex-col items-center gap-2 shadow-inner">
                  <InstructorAvatar
                    name={testName}
                    size="md"
                    palette={activePalette}
                    seed={previewSeed}
                    customSettings={draft}
                  />
                  <span className="text-[11px] text-muted-foreground font-medium">Canvas</span>
                </div>

                {/* On Card */}
                <div className="rounded-lg bg-card p-3 text-center flex flex-col items-center gap-2 shadow-card">
                  <InstructorAvatar
                    name={testName}
                    size="md"
                    palette={activePalette}
                    seed={previewSeed}
                    customSettings={draft}
                  />
                  <span className="text-[11px] text-muted-foreground font-medium">Card</span>
                </div>

                {/* On Inset Tray */}
                <div className="rounded-lg bg-secondary p-3 text-center flex flex-col items-center gap-2">
                  <InstructorAvatar
                    name={testName}
                    size="md"
                    palette={activePalette}
                    seed={previewSeed}
                    customSettings={draft}
                  />
                  <span className="text-[11px] text-muted-foreground font-medium">Secondary</span>
                </div>
              </div>
            </div>

            {/* Active Color Swatch Info */}
            <div className="flex items-center justify-between rounded-lg bg-secondary/40 p-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className="size-6 rounded-md shadow-inner border border-white/20"
                    style={{ backgroundColor: avatarColors.bg }}
                    title={`Background: ${avatarColors.bg}`}
                  />
                  <div className="text-left">
                    <span className="text-[10px] text-muted-foreground block uppercase font-medium">BG Tone</span>
                    <span className="font-mono text-xs font-semibold text-foreground">{avatarColors.bg}</span>
                  </div>
                </div>
                <span className="text-muted-foreground font-bold">/</span>
                <div className="flex items-center gap-2">
                  <span
                    className="size-6 rounded-md shadow-inner border border-white/20"
                    style={{ backgroundColor: avatarColors.fg }}
                    title={`Text: ${avatarColors.fg}`}
                  />
                  <div className="text-left">
                    <span className="text-[10px] text-muted-foreground block uppercase font-medium">Text Tone</span>
                    <span className="font-mono text-xs font-semibold text-foreground">{avatarColors.fg}</span>
                  </div>
                </div>
              </div>
              <Badge variant="outline" className="font-mono text-[11px]">
                {draft.avatarContrastMode ?? "balanced"}
              </Badge>
            </div>
          </div>

          {/* Right Column: Controls */}
          <div className="lg:col-span-6 flex flex-col gap-5">
            {/* Contrast Mode Selector */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground">
                  Contrast Strategy
                </label>
                <span className="text-[11px] text-muted-foreground font-medium">
                  {draft.avatarContrastMode === "balanced" || !draft.avatarContrastMode
                    ? "Calm contrast (~35% delta)"
                    : draft.avatarContrastMode === "high"
                    ? "Max contrast (~55% delta)"
                    : draft.avatarContrastMode === "soft"
                    ? "Subtle adjacent tones (~20% delta)"
                    : "Custom manual swatch selection"}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: "balanced", label: "Balanced", desc: "Recommended" },
                  { id: "high", label: "High", desc: "Prototype" },
                  { id: "soft", label: "Soft", desc: "Muted" },
                  { id: "manual", label: "Manual", desc: "Pick tones" },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => {
                      setDraft((prev) => ({ ...prev, avatarContrastMode: mode.id as any }));
                      setIsSaved(false);
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center p-2.5 rounded-lg text-center transition-all",
                      draft.avatarContrastMode === mode.id || (!draft.avatarContrastMode && mode.id === "balanced")
                        ? "bg-primary/10 text-foreground ring-1 ring-primary/40 font-semibold"
                        : "bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground"
                    )}
                  >
                    <span className="text-xs font-semibold">{mode.label}</span>
                    <span className="text-[10px] text-muted-foreground mt-0.5">{mode.desc}</span>
                  </button>
                ))}
              </div>

              {/* Manual Swatch Selector (Shown only when in Manual mode) */}
              {draft.avatarContrastMode === "manual" && (
                <div className="mt-4 pt-4 border-t border-border/60 grid gap-3">
                  <div>
                    <span className="text-[11px] font-semibold text-foreground block mb-1.5">
                      Background Tone (Tone 1 to 5)
                    </span>
                    <div className="flex gap-2">
                      {activePalette.tones.map((t, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setDraft((prev) => ({ ...prev, avatarBgTone: idx }));
                            setIsSaved(false);
                          }}
                          className={cn(
                            "flex-1 h-8 rounded-md border-2 transition-transform",
                            (draft.avatarBgTone ?? 2) === idx
                              ? "border-primary scale-105 shadow-sm"
                              : "border-transparent opacity-80 hover:opacity-100"
                          )}
                          style={{ backgroundColor: t }}
                          title={`Tone ${idx + 1}`}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="text-[11px] font-semibold text-foreground block mb-1.5">
                      Text / Initials Tone (Tone 1 to 5)
                    </span>
                    <div className="flex gap-2">
                      {activePalette.tones.map((t, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setDraft((prev) => ({ ...prev, avatarFgTone: idx }));
                            setIsSaved(false);
                          }}
                          className={cn(
                            "flex-1 h-8 rounded-md border-2 transition-transform",
                            (draft.avatarFgTone ?? 4) === idx
                              ? "border-primary scale-105 shadow-sm"
                              : "border-transparent opacity-80 hover:opacity-100"
                          )}
                          style={{ backgroundColor: t }}
                          title={`Tone ${idx + 1}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Typography Controls */}
            <div className="space-y-4 pt-4 border-t border-border/60">
              {/* Font Weight */}
              <div>
                <label className="text-xs font-semibold text-foreground block mb-2">
                  Font Weight
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: "400", label: "400 Regular" },
                    { id: "500", label: "500 Medium" },
                    { id: "600", label: "600 SemiBold" },
                    { id: "700", label: "700 Bold" },
                  ].map((w) => (
                    <Button
                      key={w.id}
                      type="button"
                      variant={(draft.avatarFontWeight ?? "600") === w.id ? "default" : "outline"}
                      size="sm"
                      className="text-xs h-8"
                      onClick={() => {
                        setDraft((prev) => ({ ...prev, avatarFontWeight: w.id as any }));
                        setIsSaved(false);
                      }}
                    >
                      {w.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Font Family */}
              <div>
                <label className="text-xs font-semibold text-foreground block mb-2">
                  Font Family
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "sans", label: "Plus Jakarta Sans", sub: "App Typography" },
                    { id: "mono", label: "Monospace", sub: "Consolas / ui-monospace" },
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        setDraft((prev) => ({ ...prev, avatarFontFamily: f.id as any }));
                        setIsSaved(false);
                      }}
                      className={cn(
                        "flex flex-col items-center justify-center p-2 rounded-lg text-center transition-all",
                        (draft.avatarFontFamily ?? "sans") === f.id
                          ? "bg-primary/10 text-foreground ring-1 ring-primary/40 font-semibold"
                          : "bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      )}
                    >
                      <span className="text-xs font-semibold">{f.label}</span>
                      <span className="text-[10px] text-muted-foreground">{f.sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Font Size Slider */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-foreground">
                    Glyph Font Size
                  </span>
                  <span className="font-mono text-xs font-semibold text-muted-foreground">
                    {draft.avatarFontSize ?? 9.5}px
                  </span>
                </div>
                <Slider
                  min={7.5}
                  max={12}
                  step={0.25}
                  value={[draft.avatarFontSize ?? 9.5]}
                  onValueChange={([v]) => {
                    setDraft((prev) => ({ ...prev, avatarFontSize: v ?? 9.5 }));
                    setIsSaved(false);
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* App-Wide Course Library Live Preview Section */}
      <section className="mt-12 border-t border-border pt-10">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div>
            <div className="flex items-center gap-2">
              <BookOpen className="size-5 text-primary" />
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                Current Library Live Preview
              </h2>
            </div>
          </div>
          <span className="font-mono text-xs text-muted-foreground">
            {initialCourses.length} courses loaded
          </span>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {initialCourses.map((course) => {
            const currentCourseSeed = courseSeeds[course.id];
            const activeCourseData = currentCourseSeed
              ? { ...course, thumbnailSeed: currentCourseSeed }
              : course;

            return (
              <div
                key={course.id}
                className="group relative overflow-hidden rounded-xl border border-border bg-card shadow-card transition-colors duration-200 hover:border-foreground/20"
              >
                <div className="relative aspect-video overflow-hidden">
                  <CourseThumbnail course={activeCourseData} settings={draft} />
                  <span className="absolute bottom-2.5 right-2.5 z-20 rounded bg-black/75 px-2 py-0.5 font-mono text-[11px] font-semibold text-white backdrop-blur-sm">
                    {course.duration}
                  </span>
                </div>

                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="truncate font-semibold text-sm text-foreground" title={course.title}>
                      {course.title}
                    </h3>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground truncate">{course.instructor}</p>

                  <div className="mt-3 flex items-center justify-between pt-2 border-t border-border/60 text-xs">
                    {(() => {
                      const coverUrl = getCourseCoverUrl(activeCourseData, draft.coverMode ?? "generated");
                      if (coverUrl) {
                        const filename = coverUrl.split("/").pop();
                        return (
                          <span className="text-muted-foreground font-mono text-[11px] truncate" title={filename}>
                            cover: {filename}
                          </span>
                        );
                      }
                      return (
                        <span className="text-muted-foreground font-mono text-[11px]">
                          seed: {currentCourseSeed || "default"}
                        </span>
                      );
                    })()}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                      onClick={() => randomizeCourseSeed(course.id)}
                    >
                      <RefreshCw className="size-3" />
                      Reroll
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
