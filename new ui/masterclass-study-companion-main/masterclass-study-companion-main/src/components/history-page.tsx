import { useMemo, useState } from "react";
import { Clock, History, Search, Trash2 } from "lucide-react";
import { Link } from "@tanstack/react-router";

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
import { CourseThumbnail } from "@/components/course-thumbnail";
import { courses } from "@/lib/courses";
import { cn } from "@/lib/utils";

type HistoryEntry = {
  id: number;
  courseId: number;
  courseTitle: string;
  lesson: string;
  module: string;
  watched: string;
  leftAt: string;
  percent: number;
  duration: string;
  art: string;
  group: "Today" | "Yesterday" | "Last Week";
  completed?: boolean;
};

const initialEntries: HistoryEntry[] = [
  { id: 1, courseId: 1, courseTitle: "Product Design Fundamentals", lesson: "08. Designing with Constraints", module: "Module 2 • Core Principles", watched: "Watched 2 hours ago", leftAt: "12:40", percent: 68, duration: "18:45", art: "course-art-mint", group: "Today" },
  { id: 2, courseId: 2, courseTitle: "Documentary Storytelling", lesson: "03. Finding the Story Arc", module: "Module 1 • Narrative Foundations", watched: "Watched 5 hours ago", leftAt: "09:12", percent: 41, duration: "22:10", art: "course-art-gold", group: "Today" },
  { id: 3, courseId: 4, courseTitle: "The Art of Thoughtful Leadership", lesson: "01. Leading with Calm", module: "Module 1 • Foundations", watched: "Watched yesterday at 21:14", leftAt: "14:03", percent: 87, duration: "16:08", art: "course-art-coral", group: "Yesterday" },
  { id: 4, courseId: 3, courseTitle: "Practical Spanish: Everyday Conversations", lesson: "12. Ordering Food & Small Talk", module: "Module 3 • Daily Life", watched: "Watched yesterday at 08:40", leftAt: "20:00", percent: 100, duration: "20:00", art: "course-art-blue", group: "Yesterday", completed: true },
  { id: 5, courseId: 1, courseTitle: "Product Design Fundamentals", lesson: "07. Typography as Interface", module: "Module 2 • Core Principles", watched: "Watched 3 days ago", leftAt: "11:26", percent: 52, duration: "21:54", art: "course-art-mint", group: "Last Week" },
  { id: 6, courseId: 2, courseTitle: "Documentary Storytelling", lesson: "02. Interviewing with Empathy", module: "Module 1 • Narrative Foundations", watched: "Watched 5 days ago", leftAt: "17:44", percent: 74, duration: "24:31", art: "course-art-gold", group: "Last Week" },
];

type DateFilter = "All Time" | "This Week" | "This Month";

const dateFilters: DateFilter[] = ["All Time", "This Week", "This Month"];
const groups: HistoryEntry["group"][] = ["Today", "Yesterday", "Last Week"];

export function HistoryPage() {
  const [entries, setEntries] = useState(initialEntries);
  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("All Time");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((entry) => {
      const matchesQuery = !q || `${entry.lesson} ${entry.courseTitle} ${entry.module}`.toLowerCase().includes(q);
      const matchesDate = dateFilter === "All Time" || (dateFilter === "This Week" ? true : entry.group !== "Last Week");
      return matchesQuery && matchesDate;
    });
  }, [entries, query, dateFilter]);

  const removeEntry = (id: number) => setEntries((list) => list.filter((entry) => entry.id !== id));

  return (
    <div className="mx-auto w-full max-w-[1440px] px-5 pb-12 pt-6 sm:px-8 sm:pt-8 lg:px-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">History</h1>
        <label className="flex h-11 min-w-0 items-center gap-2 rounded-lg border border-border bg-card px-3 shadow-card sm:w-80 lg:w-96">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder="Search history"
          />
        </label>
      </header>

      <div className="mt-8 flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-fit max-w-full flex-wrap items-center gap-1 rounded-lg border border-border bg-secondary/50 p-1">
          {dateFilters.map((item) => (
            <Button
              key={item}
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setDateFilter(item)}
              className={cn(
                "rounded-sm px-4 text-muted-foreground shadow-none",
                dateFilter === item && "bg-card font-medium text-foreground shadow-card hover:bg-card"
              )}
            >
              {item}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-muted-foreground">
            {visible.length} {visible.length === 1 ? "lesson" : "lessons"}
          </span>
          {entries.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                  <Trash2 className="size-3.5" /> Clear
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-xl">
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear watch history?</AlertDialogTitle>
                  <AlertDialogDescription>Course progress is kept.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-md">Cancel</AlertDialogCancel>
                  <AlertDialogAction className="rounded-md" onClick={() => setEntries([])}>Clear history</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="mt-16 flex flex-col items-center rounded-xl border border-dashed border-border bg-card/60 px-6 py-16 text-center">
          <History className="size-10 text-muted-foreground" strokeWidth={1.5} />
          <p className="mt-4 text-base font-semibold text-foreground">No history found</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            No watched lessons match this view.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 rounded-md"
            onClick={() => {
              setQuery("");
              setDateFilter("All Time");
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-6">
          {groups.map((group) => {
            const items = visible.filter((entry) => entry.group === group);
            if (!items.length) return null;
            return (
              <section key={group} aria-label={group}>
                <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group}</h2>
                <div className="mt-2 flex flex-col gap-1">
                  {items.map((entry) => (
                    <HistoryRow
                      key={entry.id}
                      entry={entry}
                      onRemove={() => removeEntry(entry.id)}
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
  onRemove,
}: {
  entry: HistoryEntry;
  onRemove: () => void;
}) {
  const course = courses.find((c) => c.id === entry.courseId);
  const instructor = course?.instructor;
  const thumbnailCourse = course ?? {
    id: entry.courseId,
    title: entry.courseTitle,
  };

  return (
    <Link
      to="/learn/$courseId"
      params={{ courseId: String(entry.courseId) }}
      className="group flex w-full items-center gap-4 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-4 sm:py-3.5"
    >
      {/* Thumbnail */}
      <div className="relative aspect-video w-36 shrink-0 overflow-hidden rounded-lg sm:w-44">
        <CourseThumbnail course={thumbnailCourse} className="size-full" />
        <span className="absolute bottom-1.5 right-1.5 z-10 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-white backdrop-blur-sm">
          {entry.duration}
        </span>
        <div className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
          <div className="h-full bg-foreground" style={{ width: `${entry.percent}%` }} />
        </div>
      </div>

      {/* Info: Video name -> Course name -> Instructor + Clock icon with watched % */}
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold text-foreground transition-colors group-hover:text-foreground sm:text-base">
          {entry.lesson}
        </h3>
        <p className="mt-0.5 truncate text-xs text-muted-foreground transition-colors group-hover:text-foreground/90 sm:text-sm">
          {entry.courseTitle}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {instructor && (
            <span className="font-medium text-foreground/80">{instructor}</span>
          )}
          <span className="flex items-center gap-1">
            <Clock className="size-3.5 shrink-0 text-muted-foreground" />
            {entry.percent}% watched
          </span>
          {entry.watched && (
            <span className="text-muted-foreground/60">· {entry.watched}</span>
          )}
        </div>
      </div>

      {/* Action: Hover clear button (no 3 dots) */}
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
    </Link>
  );
}
