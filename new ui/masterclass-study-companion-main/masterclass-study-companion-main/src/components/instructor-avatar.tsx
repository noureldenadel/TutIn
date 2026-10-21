import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  getInstructorPalette,
  getAvatarColors,
  getCourseSeed,
  getCourseHue,
  computePalette,
  useThumbnailSettings,
  type ThumbnailSettings,
  type PaletteResult,
} from "@/lib/thumbnail-generator";
import type { Course } from "@/lib/courses";

export interface InstructorAvatarProps {
  name: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  imageUrl?: string | undefined;
  showSpark?: boolean;
  className?: string;
  customSettings?: ThumbnailSettings;
  course?: Pick<Course, "id" | "title" | "thumbnailSeed" | "thumbnailHue">;
  palette?: PaletteResult | { tones: [string, string, string, string, string]; spark?: string };
  seed?: number;
}

const sizeClasses = {
  xs: "size-5",
  sm: "size-7",
  md: "size-9",
  lg: "size-12",
  xl: "size-16",
} as const;

function getInitials(name: string): string {
  if (!name) return "";
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function InstructorAvatar({
  name,
  size = "md",
  imageUrl,
  showSpark = false,
  className,
  customSettings,
  course,
  palette: customPalette,
  seed,
}: InstructorAvatarProps) {
  const [globalSettings] = useThumbnailSettings();
  const settings = customSettings ?? globalSettings;

  const { colors, sparkColor } = useMemo(() => {
    if (customPalette) {
      const effSeed = seed ?? (course ? getCourseSeed(course) : 48213);
      const c = getAvatarColors(effSeed, customPalette, settings);
      return { colors: c, sparkColor: customPalette.spark ?? c.bg };
    }

    const instPalette = getInstructorPalette(name, settings, course);
    return {
      colors: { bg: instPalette.bg, fg: instPalette.fg },
      sparkColor: instPalette.spark,
    };
  }, [name, course, customPalette, seed, settings]);

  const initials = useMemo(() => getInitials(name), [name]);

  const fontFamily = settings.avatarFontFamily === "mono"
    ? "ui-monospace, Consolas, monospace"
    : "var(--font-sans), 'Plus Jakarta Sans', system-ui, sans-serif";

  const fontWeight = settings.avatarFontWeight ?? "600";
  const fontSize = settings.avatarFontSize ?? 9.5;

  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center select-none",
        sizeClasses[size],
        className
      )}
    >
      <div className="size-full overflow-hidden rounded-full">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            className="size-full object-cover"
          />
        ) : (
          <svg
            viewBox="0 0 24 24"
            className="size-full block"
            aria-hidden="true"
          >
            <rect width="24" height="24" fill={colors.bg} />
            <text
              x="12"
              y="12"
              dy=".35em"
              textAnchor="middle"
              fill={colors.fg}
              fontFamily={fontFamily}
              fontSize={fontSize}
              fontWeight={fontWeight}
            >
              {initials}
            </text>
          </svg>
        )}
      </div>

      {showSpark && (
        <span
          className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-card"
          style={{ backgroundColor: sparkColor }}
        />
      )}
    </div>
  );
}
