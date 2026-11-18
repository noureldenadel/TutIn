import { useEffect, useMemo, useState } from "react";

import { apiJson, apiRequest } from "@/lib/api";
import type { Course } from "@/lib/courses";
import { DEFAULT_GENERATOR_SETTINGS, getInstructorPalette } from "@/lib/thumbnail-generator";
import { cn } from "@/lib/utils";

export const INSTRUCTOR_AVATAR_CHANGED_EVENT = "tutin:instructor_avatar_changed";

interface DbInstructor {
  id: string;
  name?: string | null;
  displayName?: string | null;
  avatarData?: string | null;
}

const avatarMemoryCache = new Map<string, string>();
let avatarsHydrated = false;
let inFlightAvatars: Promise<void> | null = null;

export function normalizeInstructorDbId(name: string): string {
  return `instructor_${name.toLowerCase().trim().replace(/\s+/g, "_")}`;
}

export function normalizeInstructorSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "instructor"
  );
}

function getCachedAvatarForName(name: string): string | undefined {
  if (!name) return undefined;
  const dbId = normalizeInstructorDbId(name);
  const slug = normalizeInstructorSlug(name);
  const lower = name.toLowerCase().trim();
  return (
    avatarMemoryCache.get(dbId) ||
    avatarMemoryCache.get(lower) ||
    avatarMemoryCache.get(slug) ||
    undefined
  );
}

export async function hydrateInstructorAvatars(force = false): Promise<Map<string, string>> {
  if (avatarsHydrated && !force) return avatarMemoryCache;
  if (inFlightAvatars && !force) {
    await inFlightAvatars;
    return avatarMemoryCache;
  }

  inFlightAvatars = (async () => {
    try {
      const list = await apiJson<DbInstructor[]>("/api/instructors");
      avatarMemoryCache.clear();
      for (const item of list) {
        if (!item.avatarData) continue;
        if (item.id) avatarMemoryCache.set(item.id.toLowerCase(), item.avatarData);
        if (item.name) avatarMemoryCache.set(item.name.toLowerCase().trim(), item.avatarData);
        if (item.displayName) {
          avatarMemoryCache.set(item.displayName.toLowerCase().trim(), item.avatarData);
          avatarMemoryCache.set(normalizeInstructorSlug(item.displayName), item.avatarData);
        }
      }
      avatarsHydrated = true;
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(INSTRUCTOR_AVATAR_CHANGED_EVENT));
      }
    } catch {
      // Keep current memory cache if server is offline
    } finally {
      inFlightAvatars = null;
    }
  })();

  await inFlightAvatars;
  return avatarMemoryCache;
}

export async function saveInstructorAvatar(name: string, avatarData: string): Promise<boolean> {
  const trimmed = name.trim();
  if (!trimmed || !avatarData) return false;
  const id = normalizeInstructorDbId(trimmed);
  const normalizedName = trimmed.toLowerCase().replace(/\s+/g, "_");

  try {
    const res = await fetch(`/api/instructors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        name: normalizedName,
        displayName: trimmed,
        avatarData,
      }),
    });
    if (!res.ok) {
      await apiRequest(`/api/instructors/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarData }),
      });
    }
    avatarMemoryCache.set(id.toLowerCase(), avatarData);
    avatarMemoryCache.set(trimmed.toLowerCase(), avatarData);
    avatarMemoryCache.set(normalizeInstructorSlug(trimmed), avatarData);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(INSTRUCTOR_AVATAR_CHANGED_EVENT));
    }
    return true;
  } catch {
    return false;
  }
}

export interface InstructorAvatarProps {
  name: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  imageUrl?: string | undefined;
  showSpark?: boolean;
  className?: string;
  course?: Pick<Course, "id" | "title" | "thumbnailSeed" | "thumbnailHue">;
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
  course,
}: InstructorAvatarProps) {
  const { colors, sparkColor } = useMemo(() => {
    const instPalette = getInstructorPalette(name || "User", course);
    return {
      colors: { bg: instPalette.bg, fg: instPalette.fg },
      sparkColor: instPalette.spark,
    };
  }, [name, course]);

  const initials = useMemo(() => getInitials(name), [name]);
  const [storedAvatar, setStoredAvatar] = useState<string | undefined>(() =>
    getCachedAvatarForName(name),
  );

  useEffect(() => {
    if (!name) {
      setStoredAvatar(undefined);
      return;
    }
    setStoredAvatar(getCachedAvatarForName(name));
    void hydrateInstructorAvatars().then(() => {
      setStoredAvatar(getCachedAvatarForName(name));
    });

    const handler = () => setStoredAvatar(getCachedAvatarForName(name));
    window.addEventListener(INSTRUCTOR_AVATAR_CHANGED_EVENT, handler);
    return () => {
      window.removeEventListener(INSTRUCTOR_AVATAR_CHANGED_EVENT, handler);
    };
  }, [name]);

  const effectiveImageUrl = imageUrl || storedAvatar;

  const fontFamily = "var(--font-sans), 'Plus Jakarta Sans', system-ui, sans-serif";
  const fontWeight = DEFAULT_GENERATOR_SETTINGS.avatarFontWeight;
  const fontSize = DEFAULT_GENERATOR_SETTINGS.avatarFontSize;

  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center",
        sizeClasses[size],
        className,
      )}
    >
      <div className="size-full overflow-hidden rounded-full">
        {effectiveImageUrl ? (
          <img
            src={effectiveImageUrl}
            alt={name}
            draggable={false}
            className="size-full select-none rounded-full object-cover"
          />
        ) : (
          <svg viewBox="0 0 24 24" className="block size-full" aria-hidden="true">
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
