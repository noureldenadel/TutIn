import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  generateThumbnailSvg,
  getCourseHue,
  getCourseSeed,
  getCourseCoverUrl,
  useThumbnailSettings,
  type ThumbnailSettings,
} from "@/lib/thumbnail-generator";
import type { Course } from "@/lib/courses";

interface CourseThumbnailProps {
  course: Pick<Course, "id" | "title"> & Partial<Course>;
  settings?: ThumbnailSettings;
  className?: string;
  showOverlay?: boolean;
}

export function CourseThumbnail({
  course,
  settings: customSettings,
  className,
  showOverlay = true,
}: CourseThumbnailProps) {
  const [globalSettings] = useThumbnailSettings();
  const effectiveSettings = customSettings || globalSettings;

  const coverUrl = useMemo(() => {
    return getCourseCoverUrl(course, effectiveSettings.coverMode ?? "generated");
  }, [course, effectiveSettings.coverMode]);

  const seed = useMemo(() => getCourseSeed(course), [course.id, course.title, course.thumbnailSeed]);

  const hue = useMemo(
    () => getCourseHue(seed, course.thumbnailHue, effectiveSettings),
    [seed, course.thumbnailHue, effectiveSettings]
  );

  const { svg } = useMemo(
    () => generateThumbnailSvg(seed, effectiveSettings, hue),
    [seed, effectiveSettings, hue]
  );

  if (coverUrl) {
    return (
      <div className={cn("relative size-full overflow-hidden bg-muted", className)}>
        <img
          src={coverUrl}
          alt={course.title}
          className="size-full object-cover"
          loading="lazy"
        />
        {showOverlay && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative size-full overflow-hidden bg-card select-none",
        className
      )}
    >
      <div
        className="size-full [&>svg]:size-full [&>svg]:block"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {showOverlay && (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />
      )}
    </div>
  );
}
