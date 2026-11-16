import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock, History, Loader2, Search, Trash2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CourseThumbnail } from "@/components/layout/course-thumbnail";
import { apiRequest } from "@/lib/api";
import {
  COURSES_CHANGED_EVENT,
  COURSE_DELETED_EVENT,
  useCoursesList,
  type Course,
} from "@/lib/courses";
import { formatClockShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import { trackExternalCourseOpen } from "@/lib/watch-history";

interface HistoryApiItem {
  video: {
    id: string;
    title: string;
    duration: number;
    watchProgress: number;
    lastWatchedPosition: number;
    lastWatchedAt: string | null;
  };
  course: {
    id: string;
    title: string;
    thumbnailData?: string | null;
    instructor?: string;
    sourceType: string;
    courseUrl?: string | null;
  };
  module: {
    id: string;
    title: string;
  } | null;
}

interface HistoryEntry {
  id: string;
  courseId: string;
  courseTitle: string;
  lesson: string;
  module: string;
  percent: number;
  durationLabel: string;
  lastWatchedAt: string | null;
  timestampMs: number;
  group: string;
  sourceType: string;
  courseUrl?: string | null | undefined;
  thumbnailData?: string | null | undefined;
  instructor?: string | undefined;
}

type DateFilter = "All Time" | "This Week" | "This Month";

const dateFilters: DateFilter[] = ["All Time", "This Week", "This Month"];
const MS_PER_DAY = 86_400_000;

function formatHistoryDateGroup(iso: string | null): string {
  if (!iso) return "Earlier";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "Earlier";

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const entryStart = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).getTime();

  const dayDiff = Math.round((todayStart - entryStart) / MS_PER_DAY);
  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Yesterday";

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

function mapHistoryItem(item: HistoryApiItem): HistoryEntry {
  const isExternal =
    item.course.sourceType === "external-link" || item.course.sourceType === "link";
  const rawProgress = Number(item.video.watchProgress) || 0;
  const percent = Math.round(Math.min(1, Math.max(0, rawProgress)) * 100);
  const lastWatchedAt = item.video.lastWatchedAt ?? null;
  const parsedTime = lastWatchedAt ? new Date(lastWatchedAt).getTime() : 0;

  return {
    id: item.video.id,
    courseId: item.course.id,
    courseTitle: item.course.title,
    lesson: item.video.title,
    module: item.module?.title ?? "",
    percent,
    durationLabel:
      item.video.duration > 0
        ? formatClockShort(item.video.duration)
        : isExternal
          ? "Link"
          : "0:00",
    lastWatchedAt,
    timestampMs: Number.isFinite(parsedTime) ? parsedTime : 0,
    group: formatHistoryDateGroup(lastWatchedAt),
    sourceType: item.course.sourceType,
    courseUrl: item.course.courseUrl,
    thumbnailData: item.course.thumbnailData,
    instructor: item.course.instructor,
  };
}

export function HistoryPage() {
  const { courses } = useCoursesList();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("All Time");

  const courseMap = useMemo(() => {
    const map = new Map<string, Course>();
    for (const c of courses) {
      map.set(c.id, c);
    }
    return map;
  }, [courses]);

  const loadHistory = useCallback(async (signal?: AbortSignal) => {
    const res = await apiRequest<HistoryApiItem[]>(
      "/api/analytics/history?limit=100",
      signal ? { signal } : undefined,
    );
    if (signal?.aborted) return;
    if (res.ok && Array.isArray(res.data)) {
      setEntries(res.data.map(mapHistoryItem));
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadHistory(controller.signal);

    const onRefresh = () => {
      void loadHistory();
    };
    window.addEventListener(COURSES_CHANGED_EVENT, onRefresh);
    window.addEventListener(COURSE_DELETED_EVENT, onRefresh);

    return () => {
      controller.abort();
      window.removeEventListener(COURSES_CHANGED_EVENT, onRefresh);
      window.removeEventListener(COURSE_DELETED_EVENT, onRefresh);
    };
  }, [loadHistory]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const now = new Date();
    const todayStartMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekCutoffMs = todayStartMs - 6 * MS_PER_DAY;
    const monthCutoffMs = todayStartMs - 29 * MS_PER_DAY;

    return entries.filter((entry) => {
      const matchesQuery =
        !q || `${entry.lesson} ${entry.courseTitle} ${entry.module}`.toLowerCase().includes(q);
      const matchesDate =
        dateFilter === "All Time" ||
        (dateFilter === "This Week"
          ? entry.timestampMs >= weekCutoffMs
          : entry.timestampMs >= monthCutoffMs);
      return matchesQuery && matchesDate;
    });
  }, [entries, query, dateFilter]);

  const groups = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const item of visible) {
      if (!seen.has(item.group)) {
        seen.add(item.group);
        list.push(item.group);
      }
    }
    return list;
  }, [visible]);

  const removeEntry = async (id: string) => {
    const prev = entries;
    setEntries((list) => list.filter((entry) => entry.id !== id));
    const res = await apiRequest(`/api/analytics/history/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setEntries(prev);
      toast.error(res.error || "Failed to remove history item");
    }
  };

  const clearHistory = async () => {
    const res = await apiRequest("/api/analytics/history", { method: "DELETE" });
    if (res.ok) {
      setEntries([]);
      toast.success("Watch history cleared");
    } else {
      toast.error(res.error || "Failed to clear history");
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1440px] px-5 pb-12 pt-6 sm:px-8 sm:pt-8 lg:px-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">History</h1>
        <label className="flex h-11 min-w-0 items-center gap-2 rounded-lg bg-secondary/75 px-3 transition-colors focus-within:bg-card focus-within:ring-2 focus-within:ring-ring/30 sm:w-80 lg:w-96">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder="Search history"
          />
        </label>
      </header>

      <div className="mt-7 flex flex-col gap-4 border-b border-border/50 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-fit max-w-full flex-wrap items-center gap-1 rounded-lg bg-secondary/75 p-1">
          {dateFilters.map((item) => (
            <Button
              key={item}
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setDateFilter(item)}
              className={cn(
                "rounded-sm px-4 text-muted-foreground shadow-none",
                dateFilter === item &&
                  "bg-card font-medium text-foreground shadow-card hover:bg-card dark:bg-accent dark:hover:bg-accent",
              )}
            >
              {item}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {entries.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Trash2 className="size-3.5" /> Clear
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-xl border-0 shadow-workspace">
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear watch history?</AlertDialogTitle>
                  <AlertDialogDescription>Course progress is kept.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-md">Cancel</AlertDialogCancel>
                  <AlertDialogAction className="rounded-md" onClick={() => void clearHistory()}>
                    Clear history
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="mt-16 flex items-center justify-center py-16 text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" />
          Loading history…
        </div>
      ) : visible.length === 0 ? (
        <div className="mt-16 flex flex-col items-center rounded-xl bg-secondary/40 px-6 py-16 text-center">
          <History className="size-10 text-muted-foreground" strokeWidth={1.5} />
          <p className="mt-4 text-base font-semibold text-foreground">
            {entries.length === 0 ? "No watch history yet" : "No history found"}
          </p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {entries.length === 0
              ? "Lessons you watch appear here."
              : "No watched lessons match this view."}
          </p>
          {entries.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              className="mt-4 rounded-md"
              onClick={() => {
                setQuery("");
                setDateFilter("All Time");
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-6">
          {groups.map((group) => {
            const items = visible.filter((entry) => entry.group === group);
            if (!items.length) return null;
            return (
              <section key={group} aria-label={group}>
                <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group}
                </h2>
                <div className="mt-2 flex flex-col gap-1">
                  {items.map((entry) => (
                    <HistoryRow
                      key={entry.id}
                      entry={entry}
                      course={courseMap.get(entry.courseId)}
                      onRemove={() => void removeEntry(entry.id)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HistoryRow({
  entry,
  course,
  onRemove,
}: {
  entry: HistoryEntry;
  course?: Course | undefined;
  onRemove: () => void;
}) {
  const instructor = course?.instructor || entry.instructor;
  const thumbnailCourse = course ?? {
    id: entry.courseId,
    title: entry.courseTitle,
    thumbnailData: entry.thumbnailData ?? null,
    ...(entry.instructor ? { instructor: entry.instructor } : {}),
  };
  const isExternalLink =
    (entry.sourceType === "external-link" || entry.sourceType === "link") &&
    Boolean(entry.courseUrl);

  const content = (
    <>
      <div className="relative aspect-video w-36 shrink-0 overflow-hidden rounded-lg sm:w-44">
        <CourseThumbnail course={thumbnailCourse} className="size-full" />
        <span className="duration-badge-text absolute bottom-1.5 right-1.5 z-10 inline-flex h-5 items-center justify-center rounded-sm bg-black/75 px-1.5 font-mono text-[10px] font-semibold tabular-nums text-white backdrop-blur-sm">
          {entry.durationLabel}
        </span>
        {!isExternalLink && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
            <div className="h-full bg-foreground" style={{ width: `${entry.percent}%` }} />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold text-foreground transition-colors group-hover:text-foreground sm:text-base">
          {entry.lesson}
        </h3>
        <p className="mt-0.5 truncate text-xs text-muted-foreground transition-colors group-hover:text-foreground/90 sm:text-sm">
          {entry.courseTitle}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {instructor && <span className="font-medium text-foreground/80">{instructor}</span>}
          <span className="flex items-center gap-1">
            <Clock className="size-3.5 shrink-0 text-muted-foreground" />
            {isExternalLink ? "Opened link" : `${entry.percent}% watched`}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onRemove();
        }}
        title="Remove from history"
        aria-label="Remove from history"
        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Trash2 className="size-4" />
      </button>
    </>
  );

  const rowClassName =
    "group flex w-full items-center gap-4 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-4 sm:py-3.5";

  if (isExternalLink && entry.courseUrl) {
    return (
      <a
        href={entry.courseUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackExternalCourseOpen(entry.courseId)}
        className={rowClassName}
      >
        {content}
      </a>
    );
  }

  return (
    <Link
      to="/learn/$courseId"
      params={{ courseId: entry.courseId }}
      search={{ videoId: entry.id }}
      className={rowClassName}
    >
      {content}
    </Link>
  );
}
