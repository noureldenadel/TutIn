import { useState, useEffect, useRef } from "react";
import { Clock, Globe, Image as ImageIcon, Plus, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { CourseThumbnail } from "@/components/layout/course-thumbnail";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isDirectLinkCourse, updateCourse, type Course } from "@/lib/courses";
import { SUPPORTED_LANGUAGES, normalizeLanguageCode } from "@/lib/languages";
import { compressImageFileToBlob } from "@/lib/media-store";
import { parseDurationToSeconds } from "@/lib/course-lessons";
import { cn } from "@/lib/utils";

export interface EditCourseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course: Course | null;
  onSave?: ((updatedCourse: Course) => void) | undefined;
}

export function EditCourseModal({ open, onOpenChange, course, onSave }: EditCourseModalProps) {
  // Single unified edit state
  const [title, setTitle] = useState("");
  const [instructor, setInstructor] = useState("");
  const [language, setLanguage] = useState("en");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [thumbnailChanged, setThumbnailChanged] = useState(false);
  const [courseUrl, setCourseUrl] = useState("");
  const [lessons, setLessons] = useState(1);
  const [completedLessons, setCompletedLessons] = useState(0);
  const [duration, setDuration] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (course && open) {
      setTitle(course.title ?? "");
      setInstructor(course.instructor ?? "");
      setLanguage(normalizeLanguageCode(course.language));
      setTags(course.tags ? [...course.tags] : []);
      setThumbnailUrl(course.thumbnailUrl ?? null);
      setThumbnailChanged(false);
      setCourseUrl(course.courseUrl ?? "");
      setLessons(course.lessons ?? 1);
      const completed =
        course.completedVideos ??
        Math.round(((course.lessons ?? 1) * (course.progress ?? 0)) / 100);
      setCompletedLessons(completed);
      setDuration(course.duration ?? "1h 00m");
    }
  }, [course, open]);

  if (!course) return null;

  const isLinkCourse = isDirectLinkCourse(course);

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }
    try {
      const compressed = await compressImageFileToBlob(file, 800, 0.82);
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        setThumbnailUrl(dataUrl);
        setThumbnailChanged(true);
        toast.success("Cover image ready");
      };
      reader.readAsDataURL(compressed);
    } catch {
      toast.error("Failed to load image");
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Course title is required");
      return;
    }

    setIsSaving(true);
    try {
      const safeLessons = Math.max(1, lessons);
      const calculatedProgress =
        safeLessons > 0
          ? Math.min(100, Math.max(0, Math.round((completedLessons / safeLessons) * 100)))
          : course.progress;

      const payload: Record<string, unknown> = {
        title: title.trim(),
        instructor: instructor.trim() || course.instructor,
        language: normalizeLanguageCode(language),
        tags,
      };

      if (thumbnailChanged) {
        payload["thumbnailData"] = thumbnailUrl;
      }

      if (isLinkCourse) {
        const parsedSec = parseDurationToSeconds(duration);
        payload["courseUrl"] = courseUrl.trim() || course.courseUrl;
        payload["totalVideos"] = safeLessons;
        payload["completedVideos"] = completedLessons;
        payload["completionPercentage"] = calculatedProgress;
        if (parsedSec > 0) payload["totalDuration"] = parsedSec;
      }

      await updateCourse(course.id, payload);

      const updated: Course = {
        ...course,
        title: title.trim(),
        instructor: instructor.trim() || course.instructor,
        language: normalizeLanguageCode(language),
        tags,
        thumbnailUrl: thumbnailUrl ?? undefined,
        courseUrl: isLinkCourse ? courseUrl.trim() : course.courseUrl,
        lessons: isLinkCourse ? safeLessons : course.lessons,
        totalVideos: isLinkCourse ? safeLessons : course.totalVideos,
        completedVideos: isLinkCourse ? completedLessons : course.completedVideos,
        progress: isLinkCourse ? calculatedProgress : course.progress,
        duration: isLinkCourse ? duration.trim() || course.duration : course.duration,
      };

      onSave?.(updated);
      onOpenChange(false);
      toast.success("Course details saved", { description: updated.title });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88dvh] max-w-2xl flex-col gap-0 overflow-hidden rounded-xl border-0 bg-card p-0 shadow-workspace sm:rounded-xl">
        {/* Header (pr-12 ensures space for built-in X button) */}
        <div className="flex items-center justify-between border-b border-border/50 px-4 py-3.5 pr-12 sm:px-6 sm:py-4">
          <DialogTitle className="truncate text-base font-semibold tracking-tight text-foreground">
            Edit course
          </DialogTitle>
          <DialogDescription className="sr-only">
            Modify course metadata and settings
          </DialogDescription>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar sm:p-6">
          <div className="space-y-6">
            {/* Cover preview & actions */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="relative aspect-video w-full max-w-[200px] shrink-0 overflow-hidden rounded-xl bg-secondary shadow-card">
                {thumbnailUrl ? (
                  <img src={thumbnailUrl} alt={title} className="size-full object-cover" />
                ) : (
                  <CourseThumbnail
                    course={{ ...course, thumbnailUrl: undefined, thumbnailData: null }}
                  />
                )}
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">Cover</p>
                  <p className="text-xs text-muted-foreground">
                    {thumbnailUrl ? "Custom uploaded image" : "Generated course artwork"}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="gap-1.5 rounded-md"
                  >
                    <Upload className="size-3.5" /> Upload image
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="sr-only"
                  />

                  {thumbnailUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setThumbnailUrl(null);
                        setThumbnailChanged(true);
                      }}
                      className="gap-1.5 rounded-md text-destructive hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" /> Revert artwork
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Course details */}
            <div className="space-y-5 border-t border-border/50 pt-5">
              <div className="space-y-2.5">
                <Label htmlFor="course-title" className="block text-xs font-medium text-foreground">
                  Course title
                </Label>
                <Input
                  id="course-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Design Systems"
                  className="rounded-lg border-0 bg-secondary/75 text-sm focus-visible:bg-background"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2.5">
                  <Label
                    htmlFor="course-instructor"
                    className="block text-xs font-medium text-foreground"
                  >
                    Instructor
                  </Label>
                  <Input
                    id="course-instructor"
                    value={instructor}
                    onChange={(e) => setInstructor(e.target.value)}
                    placeholder="e.g. Maya Chen"
                    className="rounded-lg border-0 bg-secondary/75 text-sm focus-visible:bg-background"
                  />
                </div>

                <div className="space-y-2.5">
                  <Label
                    htmlFor="course-language"
                    className="block text-xs font-medium text-foreground"
                  >
                    Language
                  </Label>
                  <select
                    id="course-language"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="h-10 w-full rounded-lg border-0 bg-secondary/75 px-3 text-sm text-foreground focus-visible:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2.5">
                <Label className="block text-xs font-medium text-foreground">
                  Tags &amp; topics
                </Label>
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
                    className="shrink-0 rounded-md"
                  >
                    <Plus className="mr-1 size-4" /> Add
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
            </div>

            {isLinkCourse && (
              <div className="space-y-5 border-t border-border/50 pt-5">
                <div className="space-y-2.5">
                  <Label htmlFor="course-url" className="block text-xs font-medium text-foreground">
                    Course or playlist URL
                  </Label>
                  <Input
                    id="course-url"
                    value={courseUrl}
                    onChange={(e) => setCourseUrl(e.target.value)}
                    placeholder="https://..."
                    className="rounded-lg border-0 bg-secondary/75 text-sm focus-visible:bg-background"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="space-y-2.5">
                    <Label
                      htmlFor="total-lessons"
                      className="block text-xs font-medium text-foreground"
                    >
                      Total lessons
                    </Label>
                    <Input
                      id="total-lessons"
                      type="number"
                      min={1}
                      value={lessons}
                      onChange={(e) => setLessons(Math.max(1, parseInt(e.target.value) || 1))}
                      className="rounded-lg border-0 bg-secondary/75 text-sm focus-visible:bg-background"
                    />
                  </div>

                  <div className="space-y-2.5">
                    <Label
                      htmlFor="completed-lessons"
                      className="block text-xs font-medium text-foreground"
                    >
                      Completed lessons
                    </Label>
                    <Input
                      id="completed-lessons"
                      type="number"
                      min={0}
                      max={lessons}
                      value={completedLessons}
                      onChange={(e) =>
                        setCompletedLessons(
                          Math.max(0, Math.min(lessons, parseInt(e.target.value) || 0)),
                        )
                      }
                      className="rounded-lg border-0 bg-secondary/75 text-sm focus-visible:bg-background"
                    />
                  </div>

                  <div className="space-y-2.5">
                    <Label
                      htmlFor="course-duration"
                      className="block text-xs font-medium text-foreground"
                    >
                      Duration
                    </Label>
                    <Input
                      id="course-duration"
                      value={duration}
                      onChange={(e) => setDuration(e.target.value)}
                      placeholder="e.g. 5h 30m"
                      className="rounded-lg border-0 bg-secondary/75 text-sm focus-visible:bg-background"
                    />
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Progress:{" "}
                  <span className="font-semibold text-foreground">
                    {lessons > 0 ? Math.round((completedLessons / lessons) * 100) : 0}%
                  </span>{" "}
                  ({completedLessons}/{lessons})
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-border/50 bg-card px-4 py-3.5 sm:px-6 sm:py-4">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
              className="rounded-md"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
              className="rounded-md"
            >
              {isSaving ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
