import { useEffect, useState } from "react";
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
  Minus,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { Course } from "@/lib/courses";
import {
  applyCourseSync,
  computeSyncPreview,
  pickFolder,
  relocateMovedCourseFolder,
  type SyncPreviewData,
} from "@/lib/file-system";
import { formatClockShort } from "@/lib/format";
import { cn } from "@/lib/utils";

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i] ?? "B"}`;
}

export interface SyncPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course: Course | null;
  onSyncApplied?: ((course: Course) => void) | undefined;
}

export function SyncPreviewModal({
  open,
  onOpenChange,
  course,
  onSyncApplied,
}: SyncPreviewModalProps) {
  const [activeTab, setActiveTab] = useState("summary");
  const [preview, setPreview] = useState<SyncPreviewData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    if (!open || !course) {
      setPreview(null);
      setActiveTab("summary");
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setActiveTab("summary");

    computeSyncPreview(course)
      .then((res) => {
        if (!cancelled) setPreview(res);
      })
      .catch((err) => {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Failed to scan course folder");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, course]);

  if (!course) return null;

  const vaultStats = preview?.vaultStats;
  const hasVideoChanges = Boolean(
    preview &&
    (preview.added.length > 0 ||
      preview.removed.length > 0 ||
      preview.moved.length > 0 ||
      preview.updated.length > 0 ||
      preview.newModules.length > 0 ||
      preview.removedModules.length > 0 ||
      preview.thumbnailChanged),
  );
  const hasAssetChanges = Boolean(
    preview &&
    (preview.assetUpdates.length > 0 ||
      (vaultStats?.transcripts.newCount ?? 0) > 0 ||
      (vaultStats?.summaries.newCount ?? 0) > 0),
  );
  const hasChanges = hasVideoChanges || hasAssetChanges;

  const progressRecalc = preview?.progressRecalc;
  const beforePct = Math.round(progressRecalc?.before.completionPercentage ?? 0);
  const afterPct = Math.round(progressRecalc?.after.completionPercentage ?? 0);
  const countsChanged = Boolean(
    progressRecalc &&
    (progressRecalc.before.completedVideos !== progressRecalc.after.completedVideos ||
      progressRecalc.before.totalVideos !== progressRecalc.after.totalVideos),
  );
  const progressDisplayChanged = Boolean(
    progressRecalc && (beforePct !== afterPct || countsChanged),
  );

  const tabs = preview
    ? ([
        { id: "summary", label: "Summary" },
        preview.assetUpdates.length > 0 && {
          id: "assets",
          label: `New Assets (${preview.assetUpdates.length})`,
        },
        preview.added.length > 0 && { id: "added", label: `Added (${preview.added.length})` },
        preview.removed.length > 0 && {
          id: "removed",
          label: `Removed (${preview.removed.length})`,
        },
        preview.moved.length > 0 && { id: "moved", label: `Moved (${preview.moved.length})` },
        preview.updated.length > 0 && {
          id: "updated",
          label: `Updated (${preview.updated.length})`,
        },
      ].filter(Boolean) as { id: string; label: string }[])
    : [{ id: "summary", label: "Summary" }];

  const handleLocateFolder = async () => {
    try {
      const picked = await pickFolder();
      if (!picked?.path) return;
      setIsLoading(true);
      const refreshed = await relocateMovedCourseFolder(course, picked.path);
      setPreview(refreshed);
      toast.success("Course folder re-linked", { description: picked.path });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to re-link course folder");
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplySync = async () => {
    if (!preview) return;
    setIsApplying(true);
    try {
      const { course: updatedCourse } = await applyCourseSync(preview);
      toast.success("Course synchronized", {
        description: `${course.title} is now up to date.`,
      });
      if (updatedCourse) onSyncApplied?.(updatedCourse);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to apply sync");
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(640px,88dvh)] w-full max-w-2xl flex-col gap-0 overflow-hidden rounded-xl border-0 bg-card p-0 shadow-workspace sm:rounded-xl">
        <div className="flex items-center justify-between border-b border-border/50 px-6 py-4 pr-12">
          <DialogTitle className="truncate text-base font-semibold tracking-tight text-foreground">
            Course &amp; Vault Sync
          </DialogTitle>
          <DialogDescription className="sr-only">
            Synchronize disk folder, missing durations, subtitles, and vault assets
          </DialogDescription>
        </div>

        {/* Vault Banner */}
        <div className="flex items-center justify-between gap-4 border-b border-border/50 bg-secondary/30 px-6 py-2.5 text-xs">
          <div className="flex min-w-0 items-center gap-2">
            {preview?.folderMissing ? (
              <span className="flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400">
                <AlertTriangle className="size-3.5 shrink-0" />
                Course folder missing on disk
              </span>
            ) : vaultStats?.hasVault ? (
              <>
                <span className="flex items-center gap-1.5 font-medium text-chart-4">
                  <ShieldCheck className="size-3.5" />
                  .tutin Vault Active
                </span>
                <span className="text-muted-foreground/40">•</span>
                <span className="truncate text-muted-foreground">
                  {vaultStats.totalFileCount} files ({formatBytes(vaultStats.totalSizeBytes)})
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">
                .tutin Vault initializes when subtitles or canvas notes are saved
              </span>
            )}
          </div>
          <div
            className="hidden max-w-[260px] truncate font-mono text-[11px] text-muted-foreground sm:block"
            title={course.folderPath ?? undefined}
          >
            {course.folderPath || "Local Course"}
          </div>
        </div>

        {/* Segmented Tabs */}
        <div className="border-b border-border/50 bg-card/60 px-6 py-2.5">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none rounded-lg bg-secondary/75 p-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "h-8 shrink-0 rounded-sm px-3 text-xs font-normal text-muted-foreground transition-colors",
                  activeTab === tab.id &&
                    "bg-card font-medium text-foreground shadow-card hover:bg-card",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
          {isLoading ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 py-14 text-sm text-muted-foreground">
              <Loader2 className="size-7 animate-spin text-foreground" />
              <span>Scanning disk &amp; probing video metadata…</span>
            </div>
          ) : !preview ? null : preview.folderMissing ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl bg-secondary/40 p-8 text-center">
              <AlertTriangle className="size-8 text-amber-500" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">Folder not found on disk</p>
                <p className="font-mono text-xs text-muted-foreground break-all">
                  {course.folderPath || "No folder path stored"}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => void handleLocateFolder()}
                className="mt-2 rounded-md gap-1.5"
              >
                <FolderOpen className="size-4" />
                Locate moved folder
              </Button>
            </div>
          ) : (
            <>
              {activeTab === "summary" && (
                <div className="space-y-5">
                  {progressRecalc && (
                    <div className="flex items-center justify-between gap-4 rounded-xl bg-secondary/40 p-3.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <CheckCircle2
                            className={cn(
                              "size-4 shrink-0",
                              progressDisplayChanged ? "text-amber-500" : "text-chart-4",
                            )}
                          />
                          <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                            Progress
                          </span>
                          <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {progressDisplayChanged ? "Updated" : "In sync"}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {progressRecalc.after.completedVideos}/{progressRecalc.after.totalVideos}{" "}
                          completed
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
                      </div>
                    </div>
                  )}

                  {preview.repairedDurationsCount > 0 && (
                    <div className="flex items-center justify-between rounded-xl bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
                      <span className="font-medium">
                        Detected {preview.repairedDurationsCount} video(s) with missing durations
                        ready to repair
                      </span>
                      <button
                        type="button"
                        onClick={() => setActiveTab("updated")}
                        className="font-semibold underline underline-offset-2"
                      >
                        Inspect
                      </button>
                    </div>
                  )}

                  {vaultStats && (
                    <div className="space-y-2.5">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Vault Assets
                      </h3>
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="rounded-xl bg-secondary/40 p-3.5">
                          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                              <FileText className="size-3.5 text-sky-500" />
                              Subtitles
                            </span>
                            {vaultStats.transcripts.newCount > 0 && (
                              <span className="text-[11px] font-semibold text-chart-4">
                                +{vaultStats.transcripts.newCount} new
                              </span>
                            )}
                          </div>
                          <div className="text-base font-semibold text-foreground">
                            {vaultStats.transcripts.diskCount}{" "}
                            <span className="text-xs font-normal text-muted-foreground">files</span>
                          </div>
                        </div>

                        <div className="rounded-xl bg-secondary/40 p-3.5">
                          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                              <Sparkles className="size-3.5 text-amber-500" />
                              Summaries
                            </span>
                            {vaultStats.summaries.newCount > 0 && (
                              <span className="text-[11px] font-semibold text-chart-4">
                                +{vaultStats.summaries.newCount} new
                              </span>
                            )}
                          </div>
                          <div className="text-base font-semibold text-foreground">
                            {vaultStats.summaries.diskCount}{" "}
                            <span className="text-xs font-normal text-muted-foreground">files</span>
                          </div>
                        </div>

                        <div className="rounded-xl bg-secondary/40 p-3.5">
                          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                              <LayoutGrid className="size-3.5 text-chart-4" />
                              Canvas
                            </span>
                          </div>
                          <div className="text-base font-semibold text-foreground">
                            {vaultStats.canvas.cardCount}{" "}
                            <span className="text-xs font-normal text-muted-foreground">cards</span>
                          </div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            {vaultStats.canvas.artboardCount} artboards ·{" "}
                            {vaultStats.canvas.edgeCount} links
                          </div>
                        </div>

                        <div className="rounded-xl bg-secondary/40 p-3.5">
                          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                              <BookOpen className="size-3.5 text-indigo-500" />
                              Notes
                            </span>
                          </div>
                          <div className="text-base font-semibold text-foreground">
                            {vaultStats.notes.count}{" "}
                            <span className="text-xs font-normal text-muted-foreground">notes</span>
                          </div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            {vaultStats.notes.screenshotsCount} screenshots
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {hasChanges && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Detected Changes
                      </h3>
                      {preview.added.length > 0 && (
                        <SummaryRow
                          icon={<Plus className="size-4" />}
                          color="text-chart-4"
                          bgColor="bg-chart-4/10"
                          label="New videos"
                          count={preview.added.length}
                          onClick={() => setActiveTab("added")}
                        />
                      )}
                      {preview.moved.length > 0 && (
                        <SummaryRow
                          icon={<ArrowRight className="size-4" />}
                          color="text-sky-600 dark:text-sky-400"
                          bgColor="bg-sky-500/10"
                          label="Moved videos"
                          count={preview.moved.length}
                          onClick={() => setActiveTab("moved")}
                        />
                      )}
                      {preview.updated.length > 0 && (
                        <SummaryRow
                          icon={<RefreshCw className="size-4" />}
                          color="text-amber-600 dark:text-amber-400"
                          bgColor="bg-amber-500/10"
                          label="Updated / duration repaired"
                          count={preview.updated.length}
                          onClick={() => setActiveTab("updated")}
                        />
                      )}
                      {preview.removed.length > 0 && (
                        <SummaryRow
                          icon={<Minus className="size-4" />}
                          color="text-rose-600 dark:text-rose-400"
                          bgColor="bg-rose-500/10"
                          label="Missing videos"
                          count={preview.removed.length}
                          onClick={() => setActiveTab("removed")}
                        />
                      )}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "assets" && (
                <div className="space-y-2">
                  {preview.assetUpdates.map((item) => (
                    <div key={item.videoId} className="rounded-xl bg-secondary/40 p-3.5 text-xs">
                      <p className="font-semibold text-foreground truncate">{item.title}</p>
                      <p className="mt-1 text-muted-foreground">{item.detail}</p>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "added" && (
                <div className="space-y-2">
                  {preview.added.map((v) => (
                    <div key={v.id} className="rounded-xl bg-chart-4/10 p-3.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-foreground truncate">{v.title}</span>
                        <span className="font-mono text-muted-foreground">
                          {formatClockShort(v.duration)}
                        </span>
                      </div>
                      <p className="mt-1 text-muted-foreground">{v.moduleTitle}</p>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "removed" && (
                <div className="space-y-2">
                  {preview.removed.map((v) => (
                    <div key={v.videoId} className="rounded-xl bg-rose-500/10 p-3.5 text-xs">
                      <p className="font-semibold text-foreground truncate">{v.title}</p>
                      <p className="mt-1 font-mono text-muted-foreground truncate">{v.filePath}</p>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "moved" && (
                <div className="space-y-2">
                  {preview.moved.map((v) => (
                    <div
                      key={v.videoId}
                      className="rounded-xl bg-sky-500/10 p-3.5 text-xs space-y-1"
                    >
                      <p className="font-semibold text-foreground truncate">{v.title}</p>
                      <p className="text-muted-foreground">Moved to {v.newModuleTitle}</p>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "updated" && (
                <div className="space-y-2">
                  {preview.updated.map((v) => (
                    <div
                      key={v.videoId}
                      className="rounded-xl bg-amber-500/10 p-3.5 text-xs space-y-1"
                    >
                      <p className="font-semibold text-foreground truncate">{v.title}</p>
                      <p className="text-muted-foreground">{v.reason}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border/50 bg-card px-6 py-4">
          <div className="text-xs text-muted-foreground">
            {isLoading ? (
              <span>Scanning…</span>
            ) : preview?.folderMissing ? (
              <span>Re-link folder to sync</span>
            ) : hasChanges ? (
              <span>Review detected changes before applying.</span>
            ) : (
              <span className="flex items-center gap-1.5 font-medium text-chart-4">
                <CheckCircle2 className="size-3.5 shrink-0" />
                Course is up to date.
              </span>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isApplying}
              className="rounded-md"
            >
              {hasChanges ? "Cancel" : "Close"}
            </Button>
            {preview && !preview.folderMissing && hasChanges && (
              <Button
                size="sm"
                onClick={() => void handleApplySync()}
                disabled={isApplying || isLoading}
                className="rounded-md gap-1.5"
              >
                {isApplying ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Applying Sync…
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
  onClick,
}: {
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  label: string;
  count: number;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between rounded-xl p-2.5 px-3.5 text-left transition-colors",
        bgColor,
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span className={color}>{icon}</span>
        <span className="truncate text-xs font-semibold text-foreground">{label}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span
          className={cn("rounded-md px-1.5 py-0.5 text-xs font-bold", color, "bg-background/60")}
        >
          {count}
        </span>
        <ChevronRight className="size-3 text-muted-foreground/60" />
      </div>
    </button>
  );
}
