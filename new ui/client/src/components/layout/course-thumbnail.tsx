import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  generateThumbnailSvg,
  getCourseHue,
  getCourseSeed,
  getCourseCoverUrl,
} from "@/lib/thumbnail-generator";
import type { Course } from "@/lib/courses";

interface CourseThumbnailProps {
  course: Pick<Course, "id" | "title"> & Partial<Course>;
  className?: string;
}

export function CourseThumbnail({
  course,
  className,
}: CourseThumbnailProps) {
  const coverUrl = useMemo(() => {
    return getCourseCoverUrl(course);
  }, [course]);

  const seed = useMemo(() => getCourseSeed(course), [course]);

  const hue = useMemo(
    () => getCourseHue(seed, course.thumbnailHue),
    [seed, course.thumbnailHue],
  );

  const { svg } = useMemo(
    () => generateThumbnailSvg(seed, hue),
    [seed, hue],
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
    </div>
  );
}
