import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Captions,
  FolderOpen,
  Globe,
  Loader2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UploadCloud,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { CourseThumbnail } from "@/components/layout/course-thumbnail";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readAppSettings } from "@/lib/app-settings";
import { parseDurationToSeconds } from "@/lib/course-lessons";
import {
  createCourse,
  fetchCourseById,
  generateId,
  useCoursesList,
  type Course,
} from "@/lib/courses";
import {
  fetchExternalPageMetadata,
  fetchYoutubeCourseData,
  importGoogleDriveCourse,
  importScannedLocalCourse,
  importYoutubeCourse,
  pickFolder,
  scanCourseFolder,
  scanGoogleDriveCourseFolder,
  type GoogleDriveImportPreview,
  type ScannedCourseData,
  type ScannedModuleNode,
  type YoutubeImportPreview,
} from "@/lib/file-system";
import { formatClockShort, formatDurationLabel } from "@/lib/format";
import { SUPPORTED_LANGUAGES, normalizeLanguageCode } from "@/lib/languages";
import { compressImageFileToBlob } from "@/lib/media-store";
import { cn } from "@/lib/utils";

export type AddCourseSource = "local" | "youtube" | "drive" | "link";

const SOURCES: { id: AddCourseSource; label: string }[] = [
  { id: "local", label: "Folder" },
  { id: "youtube", label: "YouTube" },
  { id: "drive", label: "Google Drive" },
  { id: "link", label: "Direct Link" },
];

export interface AddCourseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSource?: AddCourseSource | undefined;
  onCourseAdded?: ((course: Course) => void) | undefined;
}

export function AddCourseModal({
  open,
  onOpenChange,
  initialSource = "local",
  onCourseAdded,
}: AddCourseModalProps) {
  const { courses: existingCourses } = useCoursesList();

  const [source, setSource] = useState<AddCourseSource>(initialSource);
  const [title, setTitle] = useState("");
  const [instructor, setInstructor] = useState("");
  const [language, setLanguage] = useState("en");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [lessons, setLessons] = useState(1);
  const [duration, setDuration] = useState("1h 00m");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [thumbnailData, setThumbnailData] = useState<string | null>(null);

  // Local folder scan state
  const [manualPath, setManualPath] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [scannedLocal, setScannedLocal] = useState<ScannedCourseData | null>(null);
  const [restoreVault, setRestoreVault] = useState(true);
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});

  // YouTube & Google Drive scan state
  const [youtubePreview, setYoutubePreview] = useState<YoutubeImportPreview | null>(null);
  const [drivePreview, setDrivePreview] = useState<GoogleDriveImportPreview | null>(null);
  const [isFetchingMeta, setIsFetchingMeta] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSource(initialSource);
    }
  }, [open, initialSource]);

  const duplicateLocalCourse = useMemo(() => {
    if (!scannedLocal?.folderPath) return null;
    const norm = scannedLocal.folderPath.replace(/\\/g, "/").toLowerCase();
    return (
      existingCourses.find(
        (c) => c.folderPath && c.folderPath.replace(/\\/g, "/").toLowerCase() === norm,
      ) ?? null
    );
  }, [existingCourses, scannedLocal]);

  const resetForm = () => {
    setTitle("");
    setInstructor("");
    setLanguage("en");
    setDescription("");
    setUrl("");
    setLessons(1);
    setDuration("1h 00m");
    setTags([]);
    setTagInput("");
    setThumbnailData(null);
    setManualPath("");
    setScannedLocal(null);
    setRestoreVault(true);
    setExpandedModules({});
    setYoutubePreview(null);
    setDrivePreview(null);
    setIsScanning(false);
    setIsFetchingMeta(false);
    setIsSubmitting(false);
  };

  const applyLocalScan = async (folderPath: string) => {
    setIsScanning(true);
    try {
      const result = await scanCourseFolder(folderPath);
      setScannedLocal(result);
      setTitle(result.title || "");
      setInstructor(result.instructor || "");
      setLanguage(normalizeLanguageCode(result.language));
      setDescription(result.vaultData?.metadata?.description || "");
      setTags(result.vaultData?.metadata?.tags ?? []);
      setThumbnailData(result.thumbnailData ?? null);
      setLessons(result.totalVideos);
      setDuration(formatDurationLabel(result.totalDuration));
      setRestoreVault(Boolean(result.vaultData));
      const initialExpand: Record<string, boolean> = {};
      if (result.modules[0]) initialExpand[`0:${result.modules[0].title}`] = true;
      setExpandedModules(initialExpand);
      toast.success("Course folder scanned", {
        description: `Found ${result.totalVideos} videos across ${result.modules.length} module(s)`,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to scan course folder");
    } finally {
      setIsScanning(false);
    }
  };

  const handlePickNativeFolder = async () => {
    try {
      setIsScanning(true);
      const picked = await pickFolder();
      if (!picked?.path) {
        setIsScanning(false);
        return;
      }
      setManualPath(picked.path);
      await applyLocalScan(picked.path);
    } catch (err) {
      setIsScanning(false);
      toast.error(err instanceof Error ? err.message : "Failed to open folder picker");
    }
  };

  const handleFetchYoutube = async () => {
    if (!url.trim()) {
      toast.error("Paste a YouTube video or playlist URL first");
      return;
    }
    const googleApiKey = readAppSettings().googleApiKey.trim();
    setIsFetchingMeta(true);
    try {
      const preview = await fetchYoutubeCourseData(url.trim(), googleApiKey);
      setYoutubePreview(preview);
      setTitle(preview.title);
      setInstructor(preview.instructor);
      setThumbnailData(preview.thumbnailData);
      setLessons(preview.videos.length);
      setDuration(
        preview.totalDuration > 0 ? formatDurationLabel(preview.totalDuration) : "Stream",
      );
      toast.success(`Fetched ${preview.videos.length} YouTube video(s)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to fetch YouTube data");
    } finally {
      setIsFetchingMeta(false);
    }
  };

  const handleScanDrive = async () => {
    const googleApiKey = readAppSettings().googleApiKey.trim();
    if (!url.trim()) {
      toast.error("Enter a Google Drive folder URL");
      return;
    }
    if (!googleApiKey) {
      toast.error("Set Google API key in Settings");
      return;
    }
    setIsFetchingMeta(true);
    try {
      const preview = await scanGoogleDriveCourseFolder(url.trim(), googleApiKey);
      setDrivePreview(preview);
      if (!title.trim()) setTitle("Google Drive Course");
      setLessons(preview.totalVideos);
      setDuration(
        preview.totalDuration > 0 ? formatDurationLabel(preview.totalDuration) : "Drive Stream",
      );
      toast.success(
        `Found ${preview.totalVideos} videos across ${preview.modules.length} folder(s)`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to scan Google Drive folder");
    } finally {
      setIsFetchingMeta(false);
    }
  };

  const handleFetchExternalMeta = async () => {
    if (!url.trim()) {
      toast.error("Enter a course URL first");
      return;
    }
    setIsFetchingMeta(true);
    try {
      const meta = await fetchExternalPageMetadata(url.trim());
      if (meta.title && !title.trim()) setTitle(meta.title);
      else if (meta.title) setTitle(meta.title);
      if (meta.author || meta.siteName) setInstructor(meta.author || meta.siteName || "");
      if (meta.description) setDescription(meta.description);
      if (meta.image) setThumbnailData(meta.image);
      toast.success("Page metadata fetched");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not auto-fetch link metadata");
    } finally {
      setIsFetchingMeta(false);
    }
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const compressed = await compressImageFileToBlob(file, 800, 0.82);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setThumbnailData(ev.target?.result as string);
    };
    reader.readAsDataURL(compressed);
  };

  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed) && tags.length < 10) {
      setTags((prev) => [...prev, trimmed]);
      setTagInput("");
    }
  };

  const handleSubmit = async () => {
    if (source === "local") {
      if (!scannedLocal) {
        toast.error("Scan a course folder before importing");
        return;
      }
      setIsSubmitting(true);
      try {
        const created = await importScannedLocalCourse({
          scanned: scannedLocal,
          title: title.trim() || scannedLocal.title,
          instructor: instructor.trim() || (scannedLocal.instructor || "").trim(),
          language,
          description,
          tags,
          thumbnailData,
          restoreVault,
        });
        if (created) onCourseAdded?.(created);
        onOpenChange(false);
        resetForm();
        toast.success("Course imported to library", {
          description: created?.title ?? title,
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to import local course");
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (!title.trim()) {
      toast.error("Please enter a course title");
      return;
    }

    setIsSubmitting(true);
    try {
      let created: Course | null = null;

      if (source === "youtube") {
        if (youtubePreview) {
          created = await importYoutubeCourse({
            preview: youtubePreview,
            title,
            instructor,
            language,
          });
        } else {
          const id = generateId("course_");
          await createCourse({
            id,
            title: title.trim(),
            sourceType: "youtube",
            instructor: instructor.trim() || "YouTube",
            language: normalizeLanguageCode(language),
            courseUrl: url.trim(),
            tags,
            thumbnailData,
            totalVideos: Math.max(1, lessons),
            totalDuration: parseDurationToSeconds(duration),
          });
          created = await fetchCourseById(id);
        }
      } else if (source === "drive") {
        if (!drivePreview) {
          toast.error("Scan the Google Drive folder before adding");
          setIsSubmitting(false);
          return;
        }
        created = await importGoogleDriveCourse({
          preview: drivePreview,
          title,
          instructor,
          language,
          courseUrl: url.trim(),
        });
      } else {
        const id = generateId("course_");
        await createCourse({
          id,
          title: title.trim(),
          sourceType: "external-link",
          instructor: instructor.trim(),
          language: normalizeLanguageCode(language),
          description,
          courseUrl: url.trim(),
          tags,
          thumbnailData,
          totalVideos: Math.max(1, lessons),
          totalDuration: parseDurationToSeconds(duration),
        });
        created = await fetchCourseById(id);
      }

      if (created) onCourseAdded?.(created);
      onOpenChange(false);
      resetForm();
      toast.success("Course added to library", { description: created?.title ?? title });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add course");
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderModuleTree = (mod: ScannedModuleNode, keyPrefix: string, depth = 0) => {
    const modKey = `${keyPrefix}:${mod.title}`;
    const isExpanded = expandedModules[modKey] ?? depth > 0;
    return (
      <div
        key={modKey}
        className={cn("rounded-lg bg-secondary/35", depth > 0 && "ml-3 bg-secondary/25")}
      >
        <button
          type="button"
          onClick={() => setExpandedModules((prev) => ({ ...prev, [modKey]: !isExpanded }))}
          className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-secondary/55 rounded-lg transition-colors"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {isExpanded ? (
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate">{mod.title}</span>
          </span>
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
            {mod.videos.length} videos • {formatDurationLabel(mod.totalDuration)}
          </span>
        </button>

        {isExpanded && (
          <div className="space-y-1 px-3 pb-2.5 pt-0.5">
            {mod.videos.map((vid, vIdx) => (
              <div
                key={`${modKey}-v-${vIdx}`}
                className="flex items-center justify-between gap-2 rounded-md bg-background/50 px-2.5 py-1.5 text-xs"
              >
                <span className="flex min-w-0 items-center gap-2 text-foreground/90">
                  <Video className="size-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">{vid.title}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                  {vid.subtitleFiles && vid.subtitleFiles.length > 0 && (
                    <span className="inline-flex items-center gap-0.5 rounded bg-secondary px-1 py-0.5 text-[10px]">
                      <Captions className="size-2.5" />
                      {vid.subtitleFiles.length}
                    </span>
                  )}
                  {vid.hasSummary && (
                    <span className="rounded bg-secondary px-1 py-0.5 text-[10px]">MD</span>
                  )}
                  <span>{formatClockShort(vid.duration)}</span>
                </span>
              </div>
            ))}
            {mod.subModules.map((sub, subIdx) =>
              renderModuleTree(sub, `${modKey}-${subIdx}`, depth + 1),
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) resetForm();
        onOpenChange(isOpen);
      }}
    >
      <DialogContent className="flex h-[min(680px,90dvh)] w-full max-w-2xl flex-col gap-0 overflow-hidden rounded-xl border-0 bg-card p-0 shadow-workspace sm:rounded-xl">
        <div className="flex items-center justify-between border-b border-border/50 px-6 py-4 pr-12">
          <DialogTitle className="truncate text-base font-semibold tracking-tight text-foreground">
            Add course
          </DialogTitle>
          <DialogDescription className="sr-only">
            Import a local folder or web course source
          </DialogDescription>
        </div>

        {/* Source Segmented Control */}
        <div className="border-b border-border/50 bg-card/60 px-6 py-2.5">
          <div className="inline-flex rounded-lg bg-secondary/75 p-1 text-xs">
            {SOURCES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSource(s.id)}
                className={cn(
                  "rounded-sm px-3.5 py-1.5 font-medium transition-colors",
                  source === s.id
                    ? "bg-card text-foreground shadow-card dark:bg-accent"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {source === "local" ? (
            !scannedLocal ? (
              <div className="space-y-4">
                <div className="flex flex-col items-center justify-center rounded-xl bg-secondary/40 p-8 text-center">
                  {isScanning ? (
                    <>
                      <Loader2 className="size-9 animate-spin text-foreground" />
                      <p className="mt-3 text-sm font-semibold text-foreground">
                        Scanning folder &amp; probing videos…
                      </p>
                    </>
                  ) : (
                    <>
                      <UploadCloud className="size-10 text-muted-foreground" />
                      <p className="mt-3 text-sm font-semibold text-foreground">
                        Choose course folder
                      </p>
                      <Button
                        type="button"
                        onClick={() => void handlePickNativeFolder()}
                        className="mt-4 rounded-md gap-2"
                      >
                        <FolderOpen className="size-4" /> Browse folder
                      </Button>
                    </>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="manual-folder-path"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Or paste folder path
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="manual-folder-path"
                      value={manualPath}
                      onChange={(e) => setManualPath(e.target.value)}
                      placeholder="D:\Courses\Design Systems"
                      className="rounded-lg border-0 bg-secondary/75 font-mono text-xs focus-visible:bg-background"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!manualPath.trim() || isScanning}
                      onClick={() => void applyLocalScan(manualPath.trim())}
                      className="rounded-md shrink-0"
                    >
                      Scan
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Folder Banner */}
                <div className="flex items-center justify-between rounded-xl bg-secondary/45 px-4 py-2.5 text-xs">
                  <div className="flex min-w-0 items-center gap-2">
                    <FolderOpen className="size-4 shrink-0 text-foreground" />
                    <span
                      className="truncate font-mono text-foreground"
                      title={scannedLocal.folderPath}
                    >
                      {scannedLocal.folderPath}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void handlePickNativeFolder()}
                    disabled={isScanning}
                    className="h-7 rounded-md text-xs shrink-0"
                  >
                    Change
                  </Button>
                </div>

                {duplicateLocalCourse && (
                  <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 px-4 py-2.5 text-xs text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="size-4 shrink-0" />
                    <span>Already imported as &ldquo;{duplicateLocalCourse.title}&rdquo;.</span>
                  </div>
                )}

                {scannedLocal.vaultData && (
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-chart-4/10 px-4 py-2.5 text-xs">
                    <div className="flex items-center gap-2 text-chart-4">
                      <ShieldCheck className="size-4 shrink-0" />
                      <span className="font-medium">.tutin vault detected</span>
                      {scannedLocal.vaultData.summary && (
                        <span className="text-muted-foreground">
                          ({scannedLocal.vaultData.summary.notes?.count ?? 0} notes,{" "}
                          {scannedLocal.vaultData.summary.transcripts?.diskCount ?? 0} subtitles)
                        </span>
                      )}
                    </div>
                    <label className="flex items-center gap-1.5 font-medium text-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={restoreVault}
                        onChange={(e) => setRestoreVault(e.target.checked)}
                        className="rounded"
                      />
                      Restore
                    </label>
                  </div>
                )}

                {/* Cover + Metadata Row */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <div className="space-y-2 sm:w-44 shrink-0">
                    <div className="aspect-video overflow-hidden rounded-lg bg-secondary">
                      {thumbnailData ? (
                        <img src={thumbnailData} alt={title} className="size-full object-cover" />
                      ) : (
                        <CourseThumbnail
                          course={{
                            id: title || "preview",
                            title: title || "Preview",
                            instructor: instructor.trim(),
                          }}
                        />
                      )}
                    </div>
                    <div className="flex gap-1.5">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => coverInputRef.current?.click()}
                        className="h-7 flex-1 rounded-md text-xs"
                      >
                        <Upload className="mr-1 size-3" /> Cover
                      </Button>
                      {thumbnailData && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setThumbnailData(null)}
                          className="h-7 rounded-md px-2 text-destructive"
                          aria-label="Remove cover"
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      )}
                      <input
                        ref={coverInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleCoverUpload}
                        className="sr-only"
                      />
                    </div>
                  </div>

                  <div className="flex-1 space-y-3">
                    <div className="space-y-1">
                      <Label htmlFor="local-title" className="text-xs font-medium">
                        Course title
                      </Label>
                      <Input
                        id="local-title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="rounded-lg border-0 bg-secondary/75 text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor="local-inst" className="text-xs font-medium">
                          Instructor
                        </Label>
                        <Input
                          id="local-inst"
                          value={instructor}
                          onChange={(e) => setInstructor(e.target.value)}
                          placeholder="Instructor"
                          className="rounded-lg border-0 bg-secondary/75 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="local-lang" className="text-xs font-medium">
                          Language
                        </Label>
                        <select
                          id="local-lang"
                          value={language}
                          onChange={(e) => setLanguage(e.target.value)}
                          className="h-10 w-full rounded-lg border-0 bg-secondary/75 px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {SUPPORTED_LANGUAGES.map((l) => (
                            <option key={l.code} value={l.code}>
                              {l.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Module & Video Tree Preview */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold uppercase tracking-wider text-muted-foreground">
                      Curriculum Preview
                    </span>
                    <span className="font-mono text-muted-foreground">
                      {scannedLocal.modules.length} modules · {scannedLocal.totalVideos} videos ·{" "}
                      {formatDurationLabel(scannedLocal.totalDuration)}
                    </span>
                  </div>
                  <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1 custom-scrollbar">
                    {scannedLocal.modules.map((m, idx) => renderModuleTree(m, String(idx)))}
                  </div>
                </div>
              </div>
            )
          ) : (
            <div className="space-y-4">
              {/* Remote URL Row */}
              <div className="space-y-1.5">
                <Label htmlFor="remote-url" className="text-xs font-medium text-foreground">
                  {source === "youtube"
                    ? "YouTube video or playlist URL"
                    : source === "drive"
                      ? "Google Drive shared folder URL"
                      : "Course URL"}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="remote-url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder={
                      source === "youtube"
                        ? "https://www.youtube.com/playlist?list=..."
                        : source === "drive"
                          ? "https://drive.google.com/drive/folders/..."
                          : "https://..."
                    }
                    className="rounded-lg border-0 bg-secondary/75 text-sm"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isFetchingMeta || !url.trim()}
                    onClick={() => {
                      if (source === "youtube") void handleFetchYoutube();
                      else if (source === "drive") void handleScanDrive();
                      else void handleFetchExternalMeta();
                    }}
                    className="rounded-md shrink-0 gap-1.5"
                  >
                    {isFetchingMeta ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : source === "link" ? (
                      <Globe className="size-3.5" />
                    ) : (
                      <Sparkles className="size-3.5" />
                    )}
                    {source === "drive" ? "Scan" : "Fetch"}
                  </Button>
                </div>
              </div>

              {/* Metadata Inputs */}
              <div className="space-y-1.5">
                <Label htmlFor="remote-title" className="text-xs font-medium text-foreground">
                  Course title
                </Label>
                <Input
                  id="remote-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Course name"
                  className="rounded-lg border-0 bg-secondary/75 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="remote-inst" className="text-xs font-medium text-foreground">
                    Instructor
                  </Label>
                  <Input
                    id="remote-inst"
                    value={instructor}
                    onChange={(e) => setInstructor(e.target.value)}
                    placeholder="Instructor"
                    className="rounded-lg border-0 bg-secondary/75 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="remote-lang" className="text-xs font-medium text-foreground">
                    Language
                  </Label>
                  <select
                    id="remote-lang"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="h-10 w-full rounded-lg border-0 bg-secondary/75 px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {SUPPORTED_LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {source === "link" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="link-lessons" className="text-xs font-medium text-foreground">
                      Total lessons
                    </Label>
                    <Input
                      id="link-lessons"
                      type="number"
                      min={1}
                      value={lessons}
                      onChange={(e) => setLessons(Math.max(1, Number(e.target.value) || 1))}
                      className="rounded-lg border-0 bg-secondary/75 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="link-duration" className="text-xs font-medium text-foreground">
                      Duration
                    </Label>
                    <Input
                      id="link-duration"
                      value={duration}
                      onChange={(e) => setDuration(e.target.value)}
                      placeholder="1h 30m"
                      className="rounded-lg border-0 bg-secondary/75 text-sm"
                    />
                  </div>
                </div>
              )}

              {youtubePreview && source === "youtube" && (
                <div className="rounded-xl bg-secondary/40 p-3 text-xs space-y-2">
                  <div className="flex items-center justify-between font-medium">
                    <span>{youtubePreview.videos.length} playlist video(s) ready</span>
                    <span className="font-mono text-muted-foreground">{duration}</span>
                  </div>
                  <div className="max-h-28 space-y-1 overflow-y-auto custom-scrollbar">
                    {youtubePreview.videos.slice(0, 12).map((v) => (
                      <div
                        key={v.youtubeId}
                        className="flex items-center justify-between text-muted-foreground"
                      >
                        <span className="truncate">{v.title}</span>
                        {v.duration > 0 && (
                          <span className="ml-2 shrink-0 font-mono text-[11px]">
                            {formatClockShort(v.duration)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {drivePreview && source === "drive" && (
                <div className="rounded-xl bg-secondary/40 p-3 text-xs space-y-1.5">
                  <div className="flex items-center justify-between font-medium">
                    <span>
                      {drivePreview.modules.length} module(s) · {drivePreview.totalVideos} videos
                    </span>
                    <span className="font-mono text-muted-foreground">{duration}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tags */}
          {(scannedLocal || source !== "local") && (
            <div className="space-y-2 pt-1">
              <Label className="text-xs font-medium text-foreground">Tags &amp; topics</Label>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  placeholder="Type tag and press Enter"
                  className="rounded-lg border-0 bg-secondary/75 text-sm"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleAddTag}
                  className="rounded-md shrink-0"
                >
                  Add
                </Button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1.5 rounded-md bg-secondary/90 px-2.5 py-1 text-xs font-medium text-foreground"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label={`Remove ${tag}`}
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border/50 bg-card px-6 py-4">
          <span className="font-mono text-xs text-muted-foreground">
            {source === "local" ? "SQLite + .tutin vault" : "SQLite library"}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="rounded-md"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void handleSubmit()}
              disabled={
                isSubmitting ||
                isScanning ||
                (source === "local" && !scannedLocal) ||
                (source === "drive" && !drivePreview) ||
                (source !== "local" && !title.trim())
              }
              className="rounded-md gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Importing…
                </>
              ) : (
                <>
                  <Check className="size-3.5" />
                  Add course
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
