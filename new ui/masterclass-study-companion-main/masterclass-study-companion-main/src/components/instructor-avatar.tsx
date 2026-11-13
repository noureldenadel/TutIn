import { useEffect, useMemo, useState } from "react";
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

  const [storedAvatar, setStoredAvatar] = useState<string | undefined>(() => {
    if (typeof window === "undefined" || !name) return undefined;
    try {
      const raw = localStorage.getItem("tutin_instructor_avatars");
      if (!raw) return undefined;
      const map = JSON.parse(raw);
      const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      return map[key] || map[name] || undefined;
    } catch {
      return undefined;
    }
  });

  useEffect(() => {
    if (!name) return;
    const handler = () => {
      try {
        const raw = localStorage.getItem("tutin_instructor_avatars");
        if (!raw) {
          setStoredAvatar(undefined);
          return;
        }
        const map = JSON.parse(raw);
        const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        setStoredAvatar(map[key] || map[name] || undefined);
      } catch {
        setStoredAvatar(undefined);
      }
    };
    window.addEventListener("tutin:instructor_avatar_changed", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("tutin:instructor_avatar_changed", handler);
      window.removeEventListener("storage", handler);
    };
  }, [name]);

  const effectiveImageUrl = imageUrl || storedAvatar;

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
        {effectiveImageUrl ? (
          <img
            src={effectiveImageUrl}
            alt={name}
            className="size-full object-cover rounded-full"
          />
        ) : (
          <svg
            viewBox="0 0 24 24"
            className="size-full block"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="12" fill={colors.bg} />
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
