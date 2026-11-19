import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
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

export function CourseThumbnail({ course, className }: CourseThumbnailProps) {
  const coverUrl = useMemo(() => {
    return getCourseCoverUrl(course);
  }, [course]);

  const imgRef = useRef<HTMLImageElement>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [erroredUrl, setErroredUrl] = useState<string | null>(null);

  const isLoaded = Boolean(coverUrl && loadedUrl === coverUrl);
  const isErrored = Boolean(coverUrl && erroredUrl === coverUrl);

  useLayoutEffect(() => {
    if (!coverUrl) return;
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) {
      setLoadedUrl(coverUrl);
    }
  }, [coverUrl]);

  const seed = useMemo(() => getCourseSeed(course), [course]);

  const hue = useMemo(() => getCourseHue(seed, course.thumbnailHue), [seed, course.thumbnailHue]);

  const { svg } = useMemo(() => generateThumbnailSvg(seed, hue), [seed, hue]);

  if (coverUrl && !isErrored) {
    return (
      <div className={cn("relative size-full select-none overflow-hidden bg-muted", className)}>
        {!isLoaded && <Skeleton className="absolute inset-0 rounded-none" />}
        <img
          ref={imgRef}
          src={coverUrl}
          alt={course.title}
          draggable={false}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoadedUrl(coverUrl)}
          onError={() => setErroredUrl(coverUrl)}
          className={cn(
            "size-full select-none object-cover transition-opacity duration-200",
            isLoaded ? "opacity-100" : "opacity-0",
          )}
        />
      </div>
    );
  }

  return (
    <div className={cn("relative size-full overflow-hidden bg-card select-none", className)}>
      <div
        className="size-full [&>svg]:size-full [&>svg]:block"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}
