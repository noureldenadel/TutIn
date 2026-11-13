import { useState, useRef, useEffect } from "react";
import {
  Check,
  FolderOpen,
  Link2,
  Upload,
  UploadCloud,
  X,
  Youtube,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Course } from "@/lib/courses";
import { cn } from "@/lib/utils";

export type AddCourseSource = "local" | "youtube" | "drive" | "link";

const SOURCES: { id: AddCourseSource; label: string }[] = [
  { id: "local", label: "Folder" },
  { id: "youtube", label: "YouTube" },
  { id: "drive", label: "Google Drive" },
  { id: "link", label: "Direct Link" },
];

const COMMON_LANGUAGES = [
  "English",
  "Spanish",
  "French",
  "German",
  "Arabic",
  "Japanese",
  "Chinese",
  "Portuguese",
  "Italian",
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
  const [source, setSource] = useState<AddCourseSource>(initialSource);
  const [title, setTitle] = useState("");
  const [instructor, setInstructor] = useState("");
  const [language, setLanguage] = useState("English");
  const [url, setUrl] = useState("");
  const [lessons, setLessons] = useState(12);
  const [duration, setDuration] = useState("4h 30m");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [detectedFolder, setDetectedFolder] = useState<string | null>(null);
  const [detectedFiles, setDetectedFiles] = useState<{ name: string; size: number }[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSource(initialSource);
    }
  }, [open, initialSource]);

  const resetForm = () => {
    setTitle("");
    setInstructor("");
    setLanguage("English");
    setUrl("");
    setLessons(12);
    setDuration("4h 30m");
    setTags([]);
    setTagInput("");
    setThumbnailUrl(null);
    setDetectedFolder(null);
    setDetectedFiles([]);
    setIsSubmitting(false);
  };

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    // Detect folder name from file path
    const sample = files[0];
    const pathParts = (sample?.webkitRelativePath || sample?.name || "").split("/");
    const detectedName = (pathParts.length > 1 ? pathParts[0] : sample?.name.replace(/\.[^.]+$/, "")) || "New Course";

    const videoFiles = files.filter((f) =>
      /\.(mp4|mkv|webm|mov|m4v|avi)$/i.test(f.name)
    );

    const detectedCount = videoFiles.length > 0 ? videoFiles.length : Math.max(1, files.length);

    setDetectedFolder(detectedName);
    setTitle(detectedName);
    setLessons(detectedCount);
    setDuration(`${Math.max(1, Math.round((detectedCount * 15) / 60))}h ${(detectedCount * 15) % 60}m`);
    setDetectedFiles(
      videoFiles.slice(0, 8).map((f) => ({ name: f.name, size: f.size }))
    );

    toast.success("Course folder scanned", {
      description: `Discovered ${detectedCount} videos in ${detectedName}`,
    });
  };

  const handleThumbnailUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setThumbnailUrl(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed) && tags.length < 10) {
      setTags((prev) => [...prev, trimmed]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags((prev) => prev.filter((t) => t !== tagToRemove));
  };

  const handleSubmit = () => {
    if (!title.trim()) {
      toast.error("Please enter a course title");
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      const newCourse: Course = {
        id: Date.now(),
        title: title.trim(),
        instructor: instructor.trim() || "Independent Instructor",
        language,
        lessons: Math.max(1, lessons),
        duration: duration.trim() || "3h 00m",
        progress: 0,
        tags: tags.length ? tags : ["General"],
        sourceType: source,
        courseUrl: source !== "local" ? url.trim() : undefined,
        thumbnailUrl: thumbnailUrl ?? undefined,
        art: "course-art-mint",
      };

      try {
        const stored = localStorage.getItem("tutin_custom_courses");
        const list: Course[] = stored ? JSON.parse(stored) : [];
        list.unshift(newCourse);
        localStorage.setItem("tutin_custom_courses", JSON.stringify(list));
      } catch {
        // ignore
      }

      window.dispatchEvent(new CustomEvent("tutin:course_added", { detail: { course: newCourse } }));
      setIsSubmitting(false);
      onCourseAdded?.(newCourse);
      onOpenChange(false);
      resetForm();
      toast.success("Course added to library", {
        description: newCourse.title,
      });
    }, 500);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) resetForm();
        onOpenChange(isOpen);
      }}
    >
      <DialogContent className="flex h-[min(640px,88dvh)] w-full max-w-2xl flex-col gap-0 overflow-hidden rounded-xl border-0 bg-card p-0 shadow-workspace sm:rounded-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 px-6 py-4 pr-12">
          <DialogTitle className="truncate text-base font-semibold tracking-tight text-foreground">
            Add course
          </DialogTitle>
          <DialogDescription className="sr-only">Add a course from folder or web source</DialogDescription>
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
                    ? "bg-card text-foreground shadow-card"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4.5 custom-scrollbar">
          {source === "local" ? (
            <>
              {!detectedFolder ? (
                <div className="flex flex-col items-center justify-center rounded-xl bg-secondary/40 p-8 text-center transition-colors hover:bg-secondary/60">
                  <UploadCloud className="size-10 text-muted-foreground" />
                  <p className="mt-3 text-sm font-semibold text-foreground">Select course folder</p>
                  <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                    Choose a folder containing masterclass videos, subtitles, or an existing .tutin vault.
                  </p>
                  <Button
                    type="button"
                    onClick={() => folderInputRef.current?.click()}
                    className="mt-5 rounded-md gap-2"
                  >
                    <FolderOpen className="size-4" /> Choose folder
                  </Button>
                  <input
                    ref={folderInputRef}
                    type="file"
                    // @ts-expect-error webkitdirectory attribute is non-standard but supported by modern browsers
                    webkitdirectory=""
                    directory=""
                    multiple
                    onChange={handleFolderSelect}
                    className="sr-only"
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-xl bg-secondary/50 p-3 px-4 text-xs">
                    <div className="flex items-center gap-2 truncate">
                      <FolderOpen className="size-4 text-primary shrink-0" />
                      <span className="font-semibold text-foreground truncate">{detectedFolder}</span>
                      <span className="text-muted-foreground">({lessons} videos detected)</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => folderInputRef.current?.click()}
                      className="rounded-md text-xs shrink-0"
                    >
                      Change
                    </Button>
                    <input
                      ref={folderInputRef}
                      type="file"
                      // @ts-expect-error webkitdirectory attribute
                      webkitdirectory=""
                      directory=""
                      multiple
                      onChange={handleFolderSelect}
                      className="sr-only"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="add-title" className="text-xs font-medium text-foreground">
                      Course title
                    </Label>
                    <Input
                      id="add-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Course name"
                      className="rounded-lg border-0 bg-secondary/75 text-sm focus-visible:bg-background"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="add-instructor" className="text-xs font-medium text-foreground">
                        Instructor
                      </Label>
                      <Input
                        id="add-instructor"
                        value={instructor}
                        onChange={(e) => setInstructor(e.target.value)}
                        placeholder="Instructor name"
                        className="rounded-lg border-0 bg-secondary/75 text-sm focus-visible:bg-background"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="add-language" className="text-xs font-medium text-foreground">
                        Language
                      </Label>
                      <select
                        id="add-language"
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        className="h-10 w-full rounded-lg border-0 bg-secondary/75 px-3 text-sm text-foreground focus-visible:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {COMMON_LANGUAGES.map((lang) => (
                          <option key={lang} value={lang}>
                            {lang}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {detectedFiles.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Detected files sample
                      </span>
                      <div className="max-h-24 overflow-y-auto space-y-1 rounded-lg bg-secondary/30 p-2 text-xs text-muted-foreground font-mono custom-scrollbar">
                        {detectedFiles.map((f, i) => (
                          <div key={i} className="truncate">
                            • {f.name}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="remote-url" className="text-xs font-medium text-foreground">
                  {source === "youtube"
                    ? "YouTube video or playlist link"
                    : source === "drive"
                      ? "Google Drive folder link"
                      : "Direct course link"}
                </Label>
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
                  autoFocus
                  className="rounded-lg border-0 bg-secondary/75 text-sm focus-visible:bg-background"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="remote-title" className="text-xs font-medium text-foreground">
                  Course title
                </Label>
                <Input
                  id="remote-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Fullstack Web Architecture"
                  className="rounded-lg border-0 bg-secondary/75 text-sm focus-visible:bg-background"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="remote-instructor" className="text-xs font-medium text-foreground">
                    Instructor
                  </Label>
                  <Input
                    id="remote-instructor"
                    value={instructor}
                    onChange={(e) => setInstructor(e.target.value)}
                    placeholder="Instructor name"
                    className="rounded-lg border-0 bg-secondary/75 text-sm focus-visible:bg-background"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="remote-language" className="text-xs font-medium text-foreground">
                    Language
                  </Label>
                  <select
                    id="remote-language"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="h-10 w-full rounded-lg border-0 bg-secondary/75 px-3 text-sm text-foreground focus-visible:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {COMMON_LANGUAGES.map((lang) => (
                      <option key={lang} value={lang}>
                        {lang}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="remote-lessons" className="text-xs font-medium text-foreground">
                    Lessons count
                  </Label>
                  <Input
                    id="remote-lessons"
                    type="number"
                    min={1}
                    value={lessons}
                    onChange={(e) => setLessons(Math.max(1, parseInt(e.target.value) || 1))}
                    className="rounded-lg border-0 bg-secondary/75 text-sm focus-visible:bg-background"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="remote-duration" className="text-xs font-medium text-foreground">
                    Duration
                  </Label>
                  <Input
                    id="remote-duration"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    placeholder="e.g. 6h 15m"
                    className="rounded-lg border-0 bg-secondary/75 text-sm focus-visible:bg-background"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Tags */}
          {(detectedFolder || source !== "local") && (
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
                  className="rounded-lg border-0 bg-secondary/75 text-sm focus-visible:bg-background"
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
                        onClick={() => handleRemoveTag(tag)}
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
            {source === "local" ? "Offline storage" : "Remote stream"}
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
              onClick={handleSubmit}
              disabled={isSubmitting || (source === "local" && !detectedFolder && !title.trim())}
              className="rounded-md"
            >
              {isSubmitting ? "Adding..." : "Add course"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
