import { useMemo, useState } from "react";
import { Check, ChevronDown, History, MoreHorizontal, Play, Search, Trash2 } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const markCompleted = (id: number) => setEntries((list) => list.map((entry) => (entry.id === id ? { ...entry, percent: 100, completed: true } : entry)));

  return (
    <div className="mx-auto max-w-[1100px] px-5 pb-12 pt-6 sm:px-8 sm:pt-8 lg:px-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Learning History</h1>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3 shadow-card">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Search history"
            />
          </label>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="rounded-lg shadow-card">{dateFilter} <ChevronDown /></Button>
              </DropdownMenuTrigger>
               <DropdownMenuContent align="end" className="rounded-lg p-1.5">
                {(["All Time", "This Week", "This Month"] as DateFilter[]).map((item) => (
                   <DropdownMenuItem key={item} onClick={() => setDateFilter(item)} className="rounded-md">
                    {item}{dateFilter === item && <Check className="ml-auto" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                 <Button variant="outline" className="rounded-lg shadow-card"><Trash2 /> Clear history</Button>
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
          </div>
        </div>
      </header>

      {visible.length === 0 ? (
         <div className="mt-10 flex min-h-80 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <div className="flex size-20 items-center justify-center rounded-full bg-secondary text-foreground"><History className="size-8" /></div>
          <h2 className="mt-5 text-lg font-semibold">No history yet</h2>
          <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">No watched lessons match this view.</p>
           <Button variant="outline" className="mt-6 rounded-md" onClick={() => { setQuery(""); setDateFilter("All Time"); }}>Clear filters</Button>
        </div>
      ) : (
        groups.map((group) => {
          const items = visible.filter((entry) => entry.group === group);
          if (!items.length) return null;
          return (
            <section key={group} className="mt-9" aria-label={group}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group}</h2>
              <div className="mt-3.5 flex flex-col gap-3">
                {items.map((entry) => (
                  <HistoryCard key={entry.id} entry={entry} onRemove={() => removeEntry(entry.id)} onComplete={() => markCompleted(entry.id)} />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

function HistoryCard({ entry, onRemove, onComplete }: { entry: HistoryEntry; onRemove: () => void; onComplete: () => void }) {
  return (
     <article className="group flex flex-col gap-4 rounded-lg border border-border/60 bg-card p-4 shadow-card transition-all hover:shadow-workspace sm:flex-row sm:items-center">
       <Link to="/learn/$courseId" params={{ courseId: String(entry.courseId) }} className="relative block w-full shrink-0 overflow-hidden rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-44" aria-label={`Open ${entry.courseTitle}`}>
        <div className={cn("course-art relative aspect-video", entry.art)}>
          <div className="course-grid absolute inset-0" aria-hidden="true" />
           <span className="absolute bottom-2 right-2 z-10 rounded bg-course-ink/85 px-2 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-progress-foreground backdrop-blur-sm">{entry.duration}</span>
          <div className="absolute inset-x-0 bottom-0 h-1 bg-progress-track/60">
            <div className="h-full bg-progress-foreground/80" style={{ width: `${entry.percent}%` }} />
          </div>
        </div>
      </Link>

      <div className="min-w-0 flex-1">
         <Link to="/learn/$courseId" params={{ courseId: String(entry.courseId) }} className="inline-block max-w-full truncate rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-secondary-foreground transition-colors hover:bg-accent">
          {entry.courseTitle}
        </Link>
        <h3 className="mt-2 truncate text-[15px] font-semibold leading-snug">{entry.lesson}</h3>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{entry.module}</p>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {entry.watched} • {entry.completed ? "Completed" : `Left at ${entry.leftAt} (${entry.percent}%)`}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 self-start sm:self-center">
         <Button asChild className="rounded-md px-5">
          <Link to="/learn/$courseId" params={{ courseId: String(entry.courseId) }}><Play /> Resume</Link>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
             <Button variant="ghost" size="icon" aria-label="More actions" className="rounded-md text-muted-foreground"><MoreHorizontal /></Button>
          </DropdownMenuTrigger>
           <DropdownMenuContent align="end" className="rounded-lg p-1.5">
             <DropdownMenuItem onClick={onComplete} className="rounded-md"><Check /> Mark completed</DropdownMenuItem>
             <DropdownMenuItem onClick={onRemove} className="rounded-md"><Trash2 /> Remove</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  );
}
