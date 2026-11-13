import { useState, useMemo } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  FileText,
  FolderOpen,
  FolderSync,
  LayoutGrid,
  Loader2,
  Mic,
  Minus,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { getCanvasSummaryMetrics } from "@/lib/course-canvas";
import type { Course } from "@/lib/courses";
import { cn } from "@/lib/utils";

export interface ProgressStats {
  completedVideos: number;
  totalVideos: number;
  completionPercentage: number;
}

export interface ProgressRecalc {
  before: ProgressStats;
  after: ProgressStats;
  changed: boolean;
  mode?: ("videos" | "duration") | undefined;
}

export interface VaultFileItem {
  fileName: string;
  lang?: string | undefined;
  format?: string | undefined;
  sizeBytes?: number | undefined;
}

export interface VaultStats {
  hasVault: boolean;
  totalSizeBytes: number;
  totalFileCount: number;
  vaultPath?: string | undefined;
  dubs: {
    diskCount: number;
    newCount: number;
    sizeBytes?: number | undefined;
    languages: string[];
    files?: VaultFileItem[] | undefined;
  };
  transcripts: {
    diskCount: number;
    newCount: number;
    generatedCount?: number | undefined;
    uploadedCount?: number | undefined;
    languages: string[];
    files?: VaultFileItem[] | undefined;
  };
  summaries: {
    diskCount: number;
    newCount: number;
    files?: VaultFileItem[] | undefined;
  };
  canvas: {
    exists: boolean;
    nodeCount: number;
    edgeCount: number;
  };
  notes: {
    count: number;
    screenshotsCount: number;
  };
}

export interface VideoChangeItem {
  id?: (string | number) | undefined;
  title: string;
  module?: string | undefined;
  duration?: number | undefined;
  filePath?: string | undefined;
  fileName?: string | undefined;
  isCompleted?: boolean | undefined;
  dubs?: { lang: string }[] | undefined;
  subtitles?: { lang: string }[] | undefined;
  hasSummary?: boolean | undefined;
}

export interface MovedVideoItem {
  title: string;
  fromModule: string;
  toModule: string;
}

export interface UpdatedVideoItem {
  title: string;
  oldDuration?: number | undefined;
  newDuration?: number | undefined;
}

export interface AssetUpdateItem {
  title: string;
  duration?: number | undefined;
  newDubs?: { lang: string }[] | undefined;
  newSubs?: { lang: string; format?: string | undefined }[] | undefined;
  newSummary?: boolean | undefined;
}

export interface ModuleChangeItem {
  id?: string | undefined;
  title: string;
  count?: number | undefined;
}

export interface SyncPreviewData {
  course: {
    id: number;
    title: string;
    instructor?: string | undefined;
    folderPath?: string | undefined;
    completionPercentage?: number | undefined;
    completedVideos?: number | undefined;
    totalVideos?: number | undefined;
  };
  totalBefore: number;
  totalAfter: number;
  thumbnailChanged?: boolean | undefined;
  progressRecalc?: ProgressRecalc | undefined;
  vaultStats?: VaultStats | undefined;
  added?: VideoChangeItem[] | undefined;
  removed?: VideoChangeItem[] | undefined;
  moved?: MovedVideoItem[] | undefined;
  updated?: UpdatedVideoItem[] | undefined;
  newModules?: ModuleChangeItem[] | undefined;
  removedModules?: ModuleChangeItem[] | undefined;
  assetUpdates?: AssetUpdateItem[] | undefined;
}

export function formatBytes(bytes?: number | undefined): string {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatDuration(seconds?: number | undefined): string {
  if (!seconds || seconds < 0) return "0:00";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function generateSyncPreview(course: Course): SyncPreviewData {
  const completed = Math.round((course.lessons * course.progress) / 100);
  const folderPath = `D:/Courses/${course.instructor}/${course.title}`;
  const vaultPath = `${folderPath}/.tutin/`;

  if (course.id === 1) {
    // Maya Chen: Product Design Fundamentals (Has detected changes + new assets)
    return {
      course: {
        id: course.id,
        title: course.title,
        instructor: course.instructor,
        folderPath,
        completionPercentage: course.progress,
        completedVideos: completed,
        totalVideos: course.lessons,
      },
      totalBefore: 12,
      totalAfter: 13,
      thumbnailChanged: false,
      progressRecalc: {
        before: { completedVideos: completed, totalVideos: 12, completionPercentage: course.progress },
        after: { completedVideos: completed, totalVideos: 13, completionPercentage: Math.round((completed / 13) * 100) },
        changed: true,
        mode: "videos",
      },
      vaultStats: {
        hasVault: true,
        totalSizeBytes: 142500000,
        totalFileCount: 42,
        vaultPath,
        dubs: {
          diskCount: 4,
          newCount: 1,
          sizeBytes: 68400000,
          languages: ["EN", "ES", "AR-EG"],
          files: [
            { fileName: "01-01_overview_es.mp3", lang: "ES" },
            { fileName: "01-02_thinking_es.mp3", lang: "ES" },
            { fileName: "01-02_thinking_ar.mp3", lang: "AR-EG" },
            { fileName: "02-01_research_en.mp3", lang: "EN" },
          ],
        },
        transcripts: {
          diskCount: 14,
          newCount: 2,
          generatedCount: 12,
          uploadedCount: 2,
          languages: ["EN", "ES"],
          files: [
            { fileName: "01-01_overview.vtt", lang: "EN", format: "VTT" },
            { fileName: "01-02_thinking.vtt", lang: "EN", format: "VTT" },
            { fileName: "01-02_thinking_es.vtt", lang: "ES", format: "VTT" },
            { fileName: "02-01_research_es.vtt", lang: "ES", format: "VTT" },
            { fileName: "04-03_tokens.vtt", lang: "EN", format: "VTT" },
          ],
        },
        summaries: {
          diskCount: 8,
          newCount: 1,
          files: [
            { fileName: "01-01_overview_summary.md" },
            { fileName: "01-02_design_thinking_summary.md" },
            { fileName: "02-01_user_research_summary.md" },
            { fileName: "03-01_wireframing_summary.md" },
          ],
        },
        canvas: { exists: true, nodeCount: 18, edgeCount: 24 },
        notes: { count: 15, screenshotsCount: 9 },
      },
      added: [
        {
          title: "04-03 Design Token Architecture",
          module: "4. Design Systems",
          duration: 740,
          dubs: [{ lang: "ES" }],
          subtitles: [{ lang: "EN" }, { lang: "ES" }],
          hasSummary: true,
        },
      ],
      removed: [],
      moved: [],
      updated: [],
      newModules: [],
      removedModules: [],
      assetUpdates: [
        {
          title: "01-02 Design Thinking in Practice",
          duration: 860,
          newDubs: [{ lang: "AR-EG" }],
          newSubs: [{ lang: "ES", format: "VTT" }],
          newSummary: true,
        },
        {
          title: "02-01 User Research Methods",
          duration: 620,
          newSubs: [{ lang: "ES", format: "VTT" }],
        },
      ],
    };
  }

  if (course.id === 2) {
    // Oliver Grant: Documentary Storytelling (Moved & updated video)
    return {
      course: {
        id: course.id,
        title: course.title,
        instructor: course.instructor,
        folderPath,
        completionPercentage: course.progress,
        completedVideos: completed,
        totalVideos: course.lessons,
      },
      totalBefore: 18,
      totalAfter: 18,
      thumbnailChanged: false,
      progressRecalc: {
        before: { completedVideos: completed, totalVideos: 18, completionPercentage: course.progress },
        after: { completedVideos: completed, totalVideos: 18, completionPercentage: course.progress },
        changed: false,
        mode: "videos",
      },
      vaultStats: {
        hasVault: true,
        totalSizeBytes: 98200000,
        totalFileCount: 28,
        vaultPath,
        dubs: { diskCount: 2, newCount: 0, sizeBytes: 32000000, languages: ["EN"], files: [] },
        transcripts: { diskCount: 18, newCount: 0, generatedCount: 18, uploadedCount: 0, languages: ["EN"], files: [] },
        summaries: { diskCount: 8, newCount: 0, files: [] },
        canvas: { exists: true, nodeCount: 12, edgeCount: 14 },
        notes: { count: 8, screenshotsCount: 4 },
      },
      added: [],
      removed: [],
      moved: [
        {
          title: "03-02 Interview Lighting Setup",
          fromModule: "3. Production Equipment",
          toModule: "4. Practical Cinematography",
        },
      ],
      updated: [
        {
          title: "04-01 Directing Real Characters",
          oldDuration: 380,
          newDuration: 420,
        },
      ],
      newModules: [],
      removedModules: [],
      assetUpdates: [],
    };
  }

  // Course is fully synchronized by default
  return {
    course: {
      id: course.id,
      title: course.title,
      instructor: course.instructor,
      folderPath,
      completionPercentage: course.progress,
      completedVideos: completed,
      totalVideos: course.lessons,
    },
    totalBefore: course.lessons,
    totalAfter: course.lessons,
    thumbnailChanged: false,
    progressRecalc: {
      before: { completedVideos: completed, totalVideos: course.lessons, completionPercentage: course.progress },
      after: { completedVideos: completed, totalVideos: course.lessons, completionPercentage: course.progress },
      changed: false,
      mode: "videos",
    },
    vaultStats: {
      hasVault: true,
      totalSizeBytes: 76000000,
      totalFileCount: course.lessons * 2,
      vaultPath,
      dubs: { diskCount: 1, newCount: 0, sizeBytes: 18000000, languages: [course.language.slice(0, 2).toUpperCase()], files: [] },
      transcripts: { diskCount: course.lessons, newCount: 0, generatedCount: course.lessons, uploadedCount: 0, languages: [course.language.slice(0, 2).toUpperCase()], files: [] },
      summaries: { diskCount: Math.min(course.lessons, 6), newCount: 0, files: [] },
      canvas: { exists: completed > 0, nodeCount: completed * 2, edgeCount: completed * 2 },
      notes: { count: completed + 2, screenshotsCount: Math.floor(completed / 2) },
    },
    added: [],
    removed: [],
    moved: [],
    updated: [],
    newModules: [],
    removedModules: [],
    assetUpdates: [],
  };
}

export interface SyncPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course: Course | null;
  previewData?: (SyncPreviewData | null) | undefined;
  onSyncApplied?: ((course: Course) => void) | undefined;
}

export function SyncPreviewModal({
  open,
  onOpenChange,
  course,
  previewData: customPreview,
  onSyncApplied,
}: SyncPreviewModalProps) {
  const [activeTab, setActiveTab] = useState<string>("summary");
  const [isApplying, setIsApplying] = useState(false);
  const [applied, setApplied] = useState(false);

  const preview = useMemo(() => {
    if (!course) return null;
    const basePreview = applied
      ? (() => {
          const completed = Math.round((course.lessons * course.progress) / 100);
          const folderPath = `D:/Courses/${course.instructor}/${course.title}`;
          return {
            course: {
              id: course.id,
              title: course.title,
              instructor: course.instructor,
              folderPath,
              completionPercentage: course.progress,
              completedVideos: completed,
              totalVideos: course.lessons,
            },
            totalBefore: course.lessons,
            totalAfter: course.lessons,
            thumbnailChanged: false,
            progressRecalc: {
              before: { completedVideos: completed, totalVideos: course.lessons, completionPercentage: course.progress },
              after: { completedVideos: completed, totalVideos: course.lessons, completionPercentage: course.progress },
              changed: false,
              mode: "videos" as const,
            },
            vaultStats: {
              hasVault: true,
              totalSizeBytes: 148500000,
              totalFileCount: 45,
              vaultPath: `${folderPath}/.tutin/`,
              dubs: { diskCount: 4, newCount: 0, sizeBytes: 68400000, languages: ["EN", "ES", "AR-EG"], files: [] },
              transcripts: { diskCount: course.lessons, newCount: 0, generatedCount: course.lessons, uploadedCount: 0, languages: ["EN", "ES"], files: [] },
              summaries: { diskCount: 9, newCount: 0, files: [] },
              canvas: { exists: true, nodeCount: 18, edgeCount: 24 },
              notes: { count: 15, screenshotsCount: 9 },
            },
            added: [],
            removed: [],
            moved: [],
            updated: [],
            newModules: [],
            removedModules: [],
            assetUpdates: [],
          };
        })()
      : (customPreview ?? generateSyncPreview(course));

    if (!customPreview && open && basePreview.vaultStats) {
      const liveCanvas = getCanvasSummaryMetrics(String(course.id));
      if (liveCanvas.exists) {
        return {
          ...basePreview,
          vaultStats: {
            ...basePreview.vaultStats,
            canvas: {
              exists: true,
              nodeCount: liveCanvas.cardCount,
              edgeCount: liveCanvas.edgeCount,
            },
          },
        };
      }
    }

    return basePreview;
  }, [course, customPreview, applied, open]);

  if (!course || !preview) return null;

  const vaultStats = preview.vaultStats ?? {
    hasVault: false,
    totalSizeBytes: 0,
    totalFileCount: 0,
    dubs: { diskCount: 0, newCount: 0, languages: [] },
    transcripts: { diskCount: 0, newCount: 0, languages: [] },
    summaries: { diskCount: 0, newCount: 0 },
    canvas: { exists: false, nodeCount: 0, edgeCount: 0 },
    notes: { count: 0, screenshotsCount: 0 },
  };

  const hasVideoChanges =
    (preview.added?.length || 0) > 0 ||
    (preview.removed?.length || 0) > 0 ||
    (preview.moved?.length || 0) > 0 ||
    (preview.updated?.length || 0) > 0 ||
    (preview.newModules?.length || 0) > 0 ||
    (preview.removedModules?.length || 0) > 0 ||
    Boolean(preview.thumbnailChanged);

  const hasAssetChanges =
    (preview.assetUpdates?.length || 0) > 0 ||
    (vaultStats.dubs?.newCount || 0) > 0 ||
    (vaultStats.transcripts?.newCount || 0) > 0 ||
    (vaultStats.summaries?.newCount || 0) > 0;

  const hasChanges = hasVideoChanges || hasAssetChanges;

  const progressRecalc = preview.progressRecalc;
  const beforePct = Math.round(progressRecalc?.before?.completionPercentage ?? 0);
  const afterPct = Math.round(progressRecalc?.after?.completionPercentage ?? 0);
  const countsChanged = Boolean(
    progressRecalc &&
      (progressRecalc.before?.completedVideos !== progressRecalc.after?.completedVideos ||
        progressRecalc.before?.totalVideos !== progressRecalc.after?.totalVideos)
  );
  const progressDisplayChanged = Boolean(progressRecalc && (beforePct !== afterPct || countsChanged));

  const tabs = [
    { id: "summary", label: "Summary" },
    (preview.assetUpdates?.length || 0) > 0 && {
      id: "assets",
      label: `New Assets (${preview.assetUpdates?.length})`,
    },
    vaultStats.totalFileCount > 0 && { id: "vault", label: `Vault (${vaultStats.totalFileCount})` },
    (preview.added?.length || 0) > 0 && { id: "added", label: `Added (${preview.added?.length})` },
    (preview.removed?.length || 0) > 0 && { id: "removed", label: `Removed (${preview.removed?.length})` },
    (preview.moved?.length || 0) > 0 && { id: "moved", label: `Moved (${preview.moved?.length})` },
    (preview.updated?.length || 0) > 0 && { id: "updated", label: `Updated (${preview.updated?.length})` },
  ].filter(Boolean) as { id: string; label: string }[];

  const handleApplySync = () => {
    setIsApplying(true);
    setTimeout(() => {
      setIsApplying(false);
      setApplied(true);
      setActiveTab("summary");
      toast.success("Course synchronized with local vault", {
        description: `${course.title} is now up to date.`,
      });
      onSyncApplied?.(course);
    }, 650);
  };

  const handleDialogChange = (isOpen: boolean) => {
    if (!isOpen) {
      setApplied(false);
      setIsApplying(false);
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className="flex h-[min(640px,88dvh)] w-full max-w-2xl flex-col gap-0 overflow-hidden rounded-xl border-0 bg-card p-0 shadow-workspace sm:rounded-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 px-6 py-4 pr-12">
          <DialogTitle className="truncate text-base font-semibold tracking-tight text-foreground">
            Course &amp; Vault Sync
          </DialogTitle>
          <DialogDescription className="sr-only">Course &amp; vault synchronization</DialogDescription>
        </div>

        {/* Vault Status Banner */}
        <div className="flex items-center justify-between gap-4 border-b border-border/50 bg-secondary/30 px-6 py-2.5 text-xs">
          <div className="flex min-w-0 items-center gap-2">
            {vaultStats.hasVault ? (
              <>
                <span className="flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck className="size-3.5" />
                  .tutin Vault Active
                </span>
                <span className="text-muted-foreground/40">•</span>
                <span className="truncate text-muted-foreground font-normal">
                  {vaultStats.totalFileCount} asset files ({formatBytes(vaultStats.totalSizeBytes)})
                </span>
              </>
            ) : (
              <span className="flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400">
                <AlertTriangle className="size-3.5 shrink-0" />
                .tutin Vault will initialize on first asset generation
              </span>
            )}
          </div>
          <div
            className="hidden max-w-[260px] truncate font-mono text-[11px] text-muted-foreground sm:block"
            title={vaultStats.vaultPath || preview.course.folderPath}
          >
            {vaultStats.vaultPath || preview.course.folderPath || "Local Course"}
          </div>
        </div>

        {/* Concentric Segmented Tabs */}
        <div className="border-b border-border/50 bg-card/60 px-6 py-2.5">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none rounded-lg bg-secondary/75 p-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "h-8 shrink-0 rounded-sm px-3 text-xs font-normal text-muted-foreground transition-colors",
                  activeTab === tab.id && "bg-card font-medium text-foreground shadow-card hover:bg-card"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
          {activeTab === "summary" && (
            <div className="space-y-5">
              {/* Recalculated Progress Card */}
              {progressRecalc && (
                <div className="flex items-center justify-between gap-4 rounded-xl bg-secondary/40 p-3.5 transition-colors hover:bg-secondary/60">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <CheckCircle2
                        className={cn(
                          "size-4 shrink-0",
                          progressDisplayChanged ? "text-amber-500" : "text-emerald-500"
                        )}
                      />
                      <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                        Progress
                      </span>
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-[10px] font-medium border",
                          progressDisplayChanged
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                            : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                        )}
                      >
                        {progressDisplayChanged ? "Updated" : "Recalculated"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {progressRecalc.after.completedVideos}/{progressRecalc.after.totalVideos} completed
                      {progressRecalc.mode === "duration" ? " • By duration" : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {progressDisplayChanged ? (
                      <div className="flex items-center justify-end gap-1.5 text-sm font-semibold">
                        <span className="font-normal text-muted-foreground line-through">
                          {beforePct}%
                        </span>
                        <ArrowRight className="size-3.5 text-amber-500" />
                        <span className="text-foreground">{afterPct}%</span>
                      </div>
                    ) : (
                      <div className="text-lg font-semibold text-foreground">{afterPct}%</div>
                    )}
                    {countsChanged && (
                      <div className="text-[11px] text-muted-foreground">
                        {progressRecalc.before.completedVideos}/{progressRecalc.before.totalVideos} →{" "}
                        {progressRecalc.after.completedVideos}/{progressRecalc.after.totalVideos}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 5 Vault Assets Status Cards with Semantic Colors */}
              <div className="space-y-2.5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Vault Assets Status
                </h3>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {/* 1. Voice Dubs (Violet Semantic Color) */}
                  <div className="rounded-xl bg-secondary/40 p-3.5 transition-colors hover:bg-secondary/60">
                    <div className="mb-1.5 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Mic className="size-3.5 text-violet-500" />
                        <span>Voice Dubs</span>
                      </div>
                      {vaultStats.dubs.newCount > 0 && (
                        <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          +{vaultStats.dubs.newCount} new
                        </span>
                      )}
                    </div>
                    <div className="text-base font-semibold text-foreground">
                      {vaultStats.dubs.diskCount}{" "}
                      <span className="text-xs font-normal text-muted-foreground">tracks</span>
                    </div>
                    <div className="mt-1 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                      {vaultStats.dubs.languages?.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1">
                          {vaultStats.dubs.languages.map((l) => (
                            <span
                              key={l}
                              className="rounded bg-violet-500/10 px-1 py-0.2 font-mono text-[9px] font-semibold uppercase text-violet-600 dark:text-violet-400 border border-violet-500/20"
                            >
                              {l}
                            </span>
                          ))}
                          {vaultStats.dubs.sizeBytes ? (
                            <span className="text-[10px] text-muted-foreground/75">
                              ({formatBytes(vaultStats.dubs.sizeBytes)})
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <span>None generated</span>
                      )}
                    </div>
                  </div>

                  {/* 2. Transcripts & CC (Sky Semantic Color) */}
                  <div className="rounded-xl bg-secondary/40 p-3.5 transition-colors hover:bg-secondary/60">
                    <div className="mb-1.5 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <FileText className="size-3.5 text-sky-500" />
                        <span>Transcripts &amp; CC</span>
                      </div>
                      {vaultStats.transcripts.newCount > 0 && (
                        <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          +{vaultStats.transcripts.newCount} new
                        </span>
                      )}
                    </div>
                    <div className="text-base font-semibold text-foreground">
                      {vaultStats.transcripts.diskCount}{" "}
                      <span className="text-xs font-normal text-muted-foreground">files</span>
                    </div>
                    <div className="mt-1 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                      {vaultStats.transcripts.languages?.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1">
                          {vaultStats.transcripts.languages.map((l) => (
                            <span
                              key={l}
                              className="rounded bg-sky-500/10 px-1 py-0.2 font-mono text-[9px] font-semibold uppercase text-sky-600 dark:text-sky-400 border border-sky-500/20"
                            >
                              {l}
                            </span>
                          ))}
                          {vaultStats.transcripts.generatedCount ? (
                            <span className="text-[10px] text-muted-foreground/75">
                              ({vaultStats.transcripts.generatedCount} AI)
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <span>None detected</span>
                      )}
                    </div>
                  </div>

                  {/* 3. AI Summaries (Amber Semantic Color) */}
                  <div className="rounded-xl bg-secondary/40 p-3.5 transition-colors hover:bg-secondary/60">
                    <div className="mb-1.5 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Sparkles className="size-3.5 text-amber-500" />
                        <span>AI Summaries</span>
                      </div>
                      {vaultStats.summaries.newCount > 0 && (
                        <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          +{vaultStats.summaries.newCount} new
                        </span>
                      )}
                    </div>
                    <div className="text-base font-semibold text-foreground">
                      {vaultStats.summaries.diskCount}{" "}
                      <span className="text-xs font-normal text-muted-foreground">summaries</span>
                    </div>
                    <div className="mt-1 truncate text-[11px] text-muted-foreground">
                      {vaultStats.summaries.diskCount > 0 ? ".tutin/summaries/" : "None generated"}
                    </div>
                  </div>

                  {/* 4. Course Canvas (Emerald Semantic Color) */}
                  <div className="rounded-xl bg-secondary/40 p-3.5 transition-colors hover:bg-secondary/60">
                    <div className="mb-1.5 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <LayoutGrid className="size-3.5 text-emerald-500" />
                        <span>Course Canvas</span>
                      </div>
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] font-semibold border",
                          vaultStats.canvas.exists
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                            : "bg-secondary text-muted-foreground border-transparent"
                        )}
                      >
                        {vaultStats.canvas.exists ? "Active" : "Empty"}
                      </span>
                    </div>
                    <div className="text-base font-semibold text-foreground">
                      {vaultStats.canvas.nodeCount}{" "}
                      <span className="text-xs font-normal text-muted-foreground">nodes</span>
                    </div>
                    <div className="mt-1 truncate text-[11px] text-muted-foreground">
                      {vaultStats.canvas.edgeCount} connectors linked
                    </div>
                  </div>

                  {/* 5. Notes & Media Vault (Indigo Semantic Color, Spans 2 cols) */}
                  <div className="col-span-2 rounded-xl bg-secondary/40 p-3.5 transition-colors hover:bg-secondary/60 sm:col-span-2">
                    <div className="mb-1.5 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <BookOpen className="size-3.5 text-indigo-500" />
                        <span>Notes &amp; Media Vault</span>
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground">.tutin/notes/</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-base font-semibold text-foreground">
                        {vaultStats.notes.count}{" "}
                        <span className="text-xs font-normal text-muted-foreground">markdown notes</span>
                      </div>
                      <span className="text-muted-foreground/40">•</span>
                      <div className="text-xs font-medium text-muted-foreground">
                        {vaultStats.notes.screenshotsCount} screenshots
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Video & Structure Changes */}
              <div className="space-y-2.5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Video &amp; Structure Changes
                </h3>

                {!hasChanges ? (
                  <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-5 text-center">
                    <CheckCircle2 className="mx-auto mb-2 size-7 text-emerald-500" />
                    <p className="text-sm font-semibold text-foreground">All in sync</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Progress, video files, and vault assets match.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Database vs Disk Compare */}
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="rounded-xl bg-secondary/40 p-3 text-center">
                        <p className="text-xl font-bold text-foreground">{preview.totalBefore}</p>
                        <p className="text-[11px] text-muted-foreground">Videos in DB</p>
                      </div>
                      <div className="rounded-xl bg-secondary/40 p-3 text-center">
                        <p className="text-xl font-bold text-foreground">{preview.totalAfter}</p>
                        <p className="text-[11px] text-muted-foreground">Videos on Disk</p>
                      </div>
                    </div>

                    {/* Summary Action Rows with Semantic Tints */}
                    {preview.assetUpdates && preview.assetUpdates.length > 0 && (
                      <SummaryRow
                        icon={<Sparkles className="size-4" />}
                        color="text-violet-500"
                        bgColor="bg-violet-500/10 hover:bg-violet-500/15"
                        label="New vault assets to attach"
                        count={preview.assetUpdates.length}
                        detail="dubs / transcripts / summaries"
                        onClick={() => setActiveTab("assets")}
                      />
                    )}
                    {preview.added && preview.added.length > 0 && (
                      <SummaryRow
                        icon={<Plus className="size-4" />}
                        color="text-emerald-500"
                        bgColor="bg-emerald-500/10 hover:bg-emerald-500/15"
                        label="New videos discovered"
                        count={preview.added.length}
                        onClick={() => setActiveTab("added")}
                      />
                    )}
                    {preview.removed && preview.removed.length > 0 && (
                      <SummaryRow
                        icon={<Minus className="size-4" />}
                        color="text-rose-500"
                        bgColor="bg-rose-500/10 hover:bg-rose-500/15"
                        label="Removed videos"
                        count={preview.removed.length}
                        detail={
                          preview.removed.some((v) => v.isCompleted)
                            ? `${preview.removed.filter((v) => v.isCompleted).length} completed`
                            : undefined
                        }
                        onClick={() => setActiveTab("removed")}
                      />
                    )}
                    {preview.moved && preview.moved.length > 0 && (
                      <SummaryRow
                        icon={<ArrowRight className="size-4" />}
                        color="text-sky-500"
                        bgColor="bg-sky-500/10 hover:bg-sky-500/15"
                        label="Moved to different modules"
                        count={preview.moved.length}
                        onClick={() => setActiveTab("moved")}
                      />
                    )}
                    {preview.newModules && preview.newModules.length > 0 && (
                      <SummaryRow
                        icon={<FolderOpen className="size-4" />}
                        color="text-emerald-500"
                        bgColor="bg-emerald-500/10"
                        label="New modules / sections"
                        count={preview.newModules.length}
                      />
                    )}
                    {preview.removedModules && preview.removedModules.length > 0 && (
                      <SummaryRow
                        icon={<FolderOpen className="size-4" />}
                        color="text-rose-500"
                        bgColor="bg-rose-500/10"
                        label="Removed empty modules"
                        count={preview.removedModules.length}
                      />
                    )}
                    {preview.updated && preview.updated.length > 0 && (
                      <SummaryRow
                        icon={<RefreshCw className="size-4" />}
                        color="text-amber-500"
                        bgColor="bg-amber-500/10 hover:bg-amber-500/15"
                        label="Updated metadata / duration"
                        count={preview.updated.length}
                        onClick={() => setActiveTab("updated")}
                      />
                    )}
                    {preview.thumbnailChanged && (
                      <SummaryRow
                        icon={<RefreshCw className="size-4" />}
                        color="text-sky-500"
                        bgColor="bg-sky-500/10"
                        label="New course thumbnail detected"
                        count={1}
                      />
                    )}

                    {preview.removed?.some((v) => v.isCompleted) && (
                      <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-muted-foreground">
                        <AlertTriangle className="size-4 shrink-0 text-amber-500 mt-0.5" />
                        <span>
                          Some completed videos will be removed. Their progress and video-level notes will be cleaned up.
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* New Assets Tab */}
          {activeTab === "assets" && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                The following videos have new Dubs, Transcripts, or Summaries ready to synchronize:
              </p>
              <div className="space-y-2">
                {preview.assetUpdates?.map((v, i) => (
                  <div
                    key={i}
                    className="space-y-2 rounded-xl bg-secondary/40 border border-border/40 p-3.5 transition-colors hover:bg-secondary/60"
                  >
                    <div className="flex items-center justify-between">
                      <p className="truncate text-sm font-semibold text-foreground">{v.title}</p>
                      {v.duration ? (
                        <span className="text-xs text-muted-foreground font-mono">
                          {formatDuration(v.duration)}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {v.newDubs?.map((d, di) => (
                        <span
                          key={di}
                          className="inline-flex items-center gap-1 rounded-md bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 text-[11px] font-medium text-violet-600 dark:text-violet-400"
                        >
                          <Mic className="size-3" />
                          + New Dub [{d.lang?.toUpperCase()}]
                        </span>
                      ))}
                      {v.newSubs?.map((s, si) => (
                        <span
                          key={si}
                          className="inline-flex items-center gap-1 rounded-md bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 text-[11px] font-medium text-sky-600 dark:text-sky-400"
                        >
                          <FileText className="size-3" />
                          + New CC [{s.lang?.toUpperCase()}]
                        </span>
                      ))}
                      {v.newSummary && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                          <Sparkles className="size-3" />
                          + New Summary
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Vault Overview Tab */}
          {activeTab === "vault" && (
            <div className="space-y-4">
              <div className="rounded-xl bg-secondary/40 border border-border/40 p-3.5 text-xs space-y-1">
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  <ShieldCheck className="size-4 text-emerald-500" />
                  Portable Vault Storage (.tutin/)
                </div>
                <p className="text-muted-foreground">
                  All your summaries, whiteboard notes, audio dubs, and transcripts are stored inside this course folder.
                </p>
              </div>

              <div className="space-y-2.5">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Asset Breakdown
                </h4>

                {/* Dubs Breakdown */}
                <div className="rounded-xl bg-secondary/40 border border-border/40 p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="flex items-center gap-1.5 text-violet-600 dark:text-violet-400">
                      <Mic className="size-3.5" />
                      Dubbed Audio Files ({vaultStats.dubs.diskCount})
                    </span>
                    <span className="text-muted-foreground">{formatBytes(vaultStats.dubs.sizeBytes)}</span>
                  </div>
                  {vaultStats.dubs.files && vaultStats.dubs.files.length > 0 ? (
                    <div className="max-h-28 overflow-y-auto space-y-1 text-[11px] text-muted-foreground custom-scrollbar pr-1">
                      {vaultStats.dubs.files.map((f, i) => (
                        <div key={i} className="flex items-center justify-between py-0.5 font-mono truncate">
                          <span className="truncate">{f.fileName}</span>
                          <span className="ml-2 rounded bg-violet-500/10 px-1 py-0.2 text-[10px] font-semibold uppercase text-violet-600 dark:text-violet-400">
                            {f.lang}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">No audio dubs found in .tutin/dubs/</p>
                  )}
                </div>

                {/* Transcripts Breakdown */}
                <div className="rounded-xl bg-secondary/40 border border-border/40 p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="flex items-center gap-1.5 text-sky-600 dark:text-sky-400">
                      <FileText className="size-3.5" />
                      Transcripts &amp; Captions ({vaultStats.transcripts.diskCount})
                    </span>
                    <span className="text-muted-foreground">
                      {vaultStats.transcripts.generatedCount ?? 0} AI, {vaultStats.transcripts.uploadedCount ?? 0} uploaded
                    </span>
                  </div>
                  {vaultStats.transcripts.files && vaultStats.transcripts.files.length > 0 ? (
                    <div className="max-h-28 overflow-y-auto space-y-1 text-[11px] text-muted-foreground custom-scrollbar pr-1">
                      {vaultStats.transcripts.files.map((f, i) => (
                        <div key={i} className="flex items-center justify-between py-0.5 font-mono truncate">
                          <span className="truncate">{f.fileName}</span>
                          <span className="ml-2 rounded bg-sky-500/10 px-1 py-0.2 text-[10px] font-semibold uppercase text-sky-600 dark:text-sky-400">
                            {f.lang} {f.format ? `(${f.format})` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">No transcripts found in .tutin/transcripts/</p>
                  )}
                </div>

                {/* Summaries Breakdown */}
                <div className="rounded-xl bg-secondary/40 border border-border/40 p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                      <Sparkles className="size-3.5" />
                      Video Summaries ({vaultStats.summaries.diskCount})
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">.tutin/summaries/</span>
                  </div>
                  {vaultStats.summaries.files && vaultStats.summaries.files.length > 0 ? (
                    <div className="max-h-28 overflow-y-auto space-y-1 text-[11px] text-muted-foreground custom-scrollbar pr-1">
                      {vaultStats.summaries.files.map((f, i) => (
                        <div key={i} className="flex items-center justify-between py-0.5 font-mono truncate">
                          <span className="truncate">{f.fileName}</span>
                          <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">.md</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">No summary markdown files found</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Added Videos Tab */}
          {activeTab === "added" && (
            <div className="space-y-2">
              {preview.added && preview.added.length > 0 ? (
                preview.added.map((v, i) => (
                  <div
                    key={i}
                    className="space-y-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3.5 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Plus className="size-4 shrink-0 text-emerald-500" />
                      <p className="truncate text-sm font-semibold text-foreground">{v.title}</p>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {v.module} • {formatDuration(v.duration)}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {v.dubs && v.dubs.length > 0 && (
                          <span className="inline-flex items-center gap-1 rounded bg-violet-500/10 border border-violet-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-violet-600 dark:text-violet-400">
                            <Mic className="size-3" /> {v.dubs.length} Dubs
                          </span>
                        )}
                        {v.subtitles && v.subtitles.length > 0 && (
                          <span className="inline-flex items-center gap-1 rounded bg-sky-500/10 border border-sky-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-sky-600 dark:text-sky-400">
                            <FileText className="size-3" /> {v.subtitles.length} CC
                          </span>
                        )}
                        {v.hasSummary && (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                            <Sparkles className="size-3" /> Summary
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-xs text-muted-foreground">No new videos discovered.</div>
              )}
            </div>
          )}

          {/* Removed Videos Tab */}
          {activeTab === "removed" && (
            <div className="space-y-2">
              {preview.removed && preview.removed.length > 0 ? (
                preview.removed.map((v, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-xl bg-rose-500/10 border border-rose-500/20 p-3.5"
                  >
                    <Minus className="size-4 shrink-0 text-rose-500" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{v.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {v.module}
                        {v.isCompleted && (
                          <span className="ml-1.5 font-medium text-emerald-500">Completed</span>
                        )}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-xs text-muted-foreground">No removed videos.</div>
              )}
            </div>
          )}

          {/* Moved Videos Tab */}
          {activeTab === "moved" && (
            <div className="space-y-2">
              {preview.moved && preview.moved.length > 0 ? (
                preview.moved.map((v, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-xl bg-sky-500/10 border border-sky-500/20 p-3.5"
                  >
                    <ArrowRight className="size-4 shrink-0 text-sky-500" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{v.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {v.fromModule} →{" "}
                        <span className="font-medium text-sky-600 dark:text-sky-400">{v.toModule}</span>
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-xs text-muted-foreground">No moved videos.</div>
              )}
            </div>
          )}

          {/* Updated Videos Tab */}
          {activeTab === "updated" && (
            <div className="space-y-2">
              {preview.updated && preview.updated.length > 0 ? (
                preview.updated.map((v, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3.5"
                  >
                    <RefreshCw className="size-4 shrink-0 text-amber-500" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{v.title}</p>
                      <p className="text-xs text-muted-foreground">
                        Duration: {formatDuration(v.oldDuration)} →{" "}
                        <span className="font-semibold text-foreground">
                          {formatDuration(v.newDuration)}
                        </span>
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-xs text-muted-foreground">No updated videos.</div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border/50 bg-card px-6 py-4">
          <div className="text-xs text-muted-foreground">
            {hasChanges ? (
              <span>Review detected changes before applying.</span>
            ) : (
              <span className="flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-3.5 shrink-0" />
                Course is fully up to date.
              </span>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDialogChange(false)}
              disabled={isApplying}
              className="rounded-md"
            >
              {hasChanges ? "Cancel" : "Close"}
            </Button>
            {hasChanges && (
              <Button
                size="sm"
                onClick={handleApplySync}
                disabled={isApplying}
                className="rounded-md gap-1.5"
              >
                {isApplying ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Applying Sync...
                  </>
                ) : (
                  <>
                    <FolderSync className="size-3.5" />
                    Apply Sync
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SummaryRow({
  icon,
  color,
  bgColor,
  label,
  count,
  detail,
  onClick,
}: {
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  label: string;
  count: number;
  detail?: string | undefined;
  onClick?: (() => void) | undefined;
}) {
  const Component = onClick ? "button" : "div";
  return (
    <Component
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between rounded-xl p-2.5 px-3.5 text-left transition-colors border border-transparent",
        bgColor,
        onClick && "cursor-pointer"
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span className={color}>{icon}</span>
        <span className="truncate text-xs font-semibold text-foreground">{label}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {detail && <span className="text-[11px] text-muted-foreground">{detail}</span>}
        <span className={cn("rounded-md px-1.5 py-0.5 text-xs font-bold", color, "bg-background/60")}>
          {count}
        </span>
        {onClick && <ChevronRight className="size-3 text-muted-foreground/60" />}
      </div>
    </Component>
  );
}
