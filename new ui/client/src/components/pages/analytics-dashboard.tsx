import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BookOpen, CheckCircle2, Clock, Flame, Loader2 } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { apiJson } from "@/lib/api";
import { useCoursesList, type Course } from "@/lib/courses";
import { formatDurationLabel, formatMinutesLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

interface AnalyticsDayRow {
  date: string;
  watch_time_seconds: number;
  videos_watched: number;
  videos_completed: number;
  sessions_count: number;
}

interface AnalyticsHistoryItem {
  video: {
    id: string;
    duration?: number;
    watchProgress?: number;
    lastWatchedAt?: string | null;
  };
}

function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("min-w-0 rounded-xl bg-card p-6 shadow-card", className)}>{children}</section>;
}

function Metric({
  icon,
  label,
  value,
  children,
  warm,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  children: ReactNode;
  warm?: boolean;
}) {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center gap-2.5">
        <span className={cn("text-muted-foreground [&_svg]:size-5", warm && "text-streak")}>
          {icon}
        </span>
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
      </div>
      <p className="text-2xl font-bold tracking-tight text-foreground">{value}</p>
      <div className="text-xs text-muted-foreground">{children}</div>
    </Card>
  );
}

function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function Heatmap({ byDate }: { byDate: Map<string, { min: number; lessons: number }> }) {
  const [range, setRange] = useState<"1y" | "3m">("1y");
  const currentYear = new Date().getFullYear();

  const days = useMemo(() => {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const total = range === "1y" ? 52 * 7 : 13 * 7;
    const start = new Date(end);
    start.setDate(end.getDate() - total + 1);
    start.setDate(start.getDate() - start.getDay());
    const out: { key: string; date: Date; min: number; lessons: number }[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = toLocalDateKey(d);
      const entry = byDate.get(key);
      out.push({
        key,
        date: new Date(d),
        min: entry?.min ?? 0,
        lessons: entry?.lessons ?? 0,
      });
    }
    return out;
  }, [byDate, range]);

  const weeks: typeof days[] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  const level = (m: number) =>
    m === 0
      ? "bg-secondary"
      : m < 30
        ? "bg-chart-4/25"
        : m < 60
          ? "bg-chart-4/50"
          : m < 100
            ? "bg-chart-4/75"
            : "bg-chart-4";

  return (
    <Card>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Study consistency</h2>
        <div className="flex rounded-lg bg-secondary/75 p-1 text-xs font-medium">
          {(
            [
              ["1y", String(currentYear)],
              ["3m", "Past 3 Months"],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setRange(k)}
              className={cn(
                "rounded-sm px-3 py-1.5 text-muted-foreground transition",
                range === k && "bg-card text-foreground shadow-card",
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="custom-scrollbar-sm overflow-x-auto pb-2">
        <div className="flex w-max gap-[3px]">
          {weeks.map((w, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {w.map((d) => (
                <Tooltip key={d.key}>
                  <TooltipTrigger asChild>
                    <span
                      className={cn(
                        "block size-3 rounded-[2px] transition hover:ring-2 hover:ring-ring/40",
                        level(d.min),
                      )}
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    {d.date.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                    : {formatMinutesLabel(d.min)} • {d.lessons}{" "}
                    {d.lessons === 1 ? "lesson" : "lessons"}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
        Less{" "}
        {[0, 20, 50, 80, 120].map((m) => (
          <span key={m} className={cn("size-3 rounded-[2px]", level(m))} />
        ))}{" "}
        More
      </div>
    </Card>
  );
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function Velocity({ weekdaySeconds }: { weekdaySeconds: number[] }) {
  const hoursList = WEEKDAYS.map((label, idx) => {
    const secs = weekdaySeconds[idx] ?? 0;
    const hrs = Number((secs / 3600).toFixed(1));
    return [label, hrs] as const;
  });
  const max = Math.max(...hoursList.map((v) => v[1]), 0.1);
  const peak = Math.max(...hoursList.map((v) => v[1]));

  return (
    <Card>
      <h2 className="text-base font-semibold">Study velocity</h2>
      <p className="mt-1 text-xs text-muted-foreground">Hours by weekday</p>
      <div className="mt-6 flex h-52 items-end gap-3">
        {hoursList.map(([d, h]) => {
          const pct = peak > 0 ? Math.max(h > 0 ? 8 : 3, (h / max) * 80) : 3;
          return (
            <Tooltip key={d}>
              <TooltipTrigger asChild>
                <div className="group flex h-full flex-1 flex-col items-center justify-end gap-2">
                  <span className="text-[11px] font-semibold text-muted-foreground opacity-0 transition group-hover:opacity-100">
                    {h}h
                  </span>
                  <div
                    className={cn(
                      "w-full max-w-10 rounded-t transition-all",
                      peak > 0 && h === peak
                        ? "bg-chart-2 shadow-xs group-hover:opacity-90"
                        : "bg-secondary hover:bg-foreground/30",
                    )}
                    style={{ height: `${pct}%` }}
                  />
                  <span className="text-xs text-muted-foreground">{d}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {d}: {h} {h === 1 ? "hour" : "hours"}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </Card>
  );
}

interface TagFocus {
  label: string;
  shortLabel: string;
  meta: string;
  pct: number;
  cls: string;
}

const CHART_CLASSES = [
  "stroke-chart-1 bg-chart-1",
  "stroke-chart-2 bg-chart-2",
  "stroke-chart-3 bg-chart-3",
  "stroke-chart-4 bg-chart-4",
] as const;

function LearningFocus({ courses }: { courses: Course[] }) {
  const fields = useMemo<TagFocus[]>(() => {
    if (courses.length === 0) return [];

    const tagStats = new Map<string, { weight: number; courseTitles: string[] }>();

    for (const c of courses) {
      const weight =
        c.totalDuration > 0
          ? Math.max(1, Math.round(c.totalDuration * ((c.completionPercentage || 25) / 100)))
          : Math.max(1, c.completedVideos || c.totalVideos || 1);
      const tags = (c.tags ?? []).map((t) => t.trim()).filter(Boolean);
      const keys = tags.length > 0 ? tags : ["Untagged"];

      for (const key of keys) {
        const prev = tagStats.get(key);
        if (prev) {
          prev.weight += weight / keys.length;
          if (prev.courseTitles.length < 3) prev.courseTitles.push(c.title);
        } else {
          tagStats.set(key, {
            weight: weight / keys.length,
            courseTitles: [c.title],
          });
        }
      }
    }

    const sorted = Array.from(tagStats.entries()).sort((a, b) => b[1].weight - a[1].weight);
    const top = sorted.slice(0, 4);
    const rest = sorted.slice(4);
    if (rest.length > 0) {
      const otherWeight = rest.reduce((acc, [, v]) => acc + v.weight, 0);
      top.push([
        "Other",
        {
          weight: otherWeight,
          courseTitles: rest.map(([k]) => k).slice(0, 3),
        },
      ]);
    }

    const total = top.reduce((acc, [, v]) => acc + v.weight, 0) || 1;
    const rawItems = top.map(([label, data], idx) => ({
      label,
      shortLabel: label.length > 14 ? `${label.slice(0, 12)}…` : label,
      meta: data.courseTitles.join(" · "),
      pct: Math.round((data.weight / total) * 100),
      cls: CHART_CLASSES[idx] ?? "stroke-foreground/40 bg-foreground/40",
    }));

    const sum = rawItems.reduce((acc, item) => acc + item.pct, 0);
    if (rawItems[0] && sum !== 100) {
      rawItems[0].pct = Math.max(0, rawItems[0].pct + (100 - sum));
    }

    return rawItems;
  }, [courses]);

  const r = 52;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const topField = fields[0] ?? { pct: 0, shortLabel: "Tags" };

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Learning focus</h2>
        <span className="shrink-0 text-xs text-muted-foreground">Based on tags</span>
      </div>

      {fields.length === 0 ? (
        <div className="mt-8 flex h-44 items-center justify-center text-sm text-muted-foreground">
          Add courses or tags to see focus breakdown.
        </div>
      ) : (
        <div className="mt-6 flex flex-col items-center gap-8 sm:flex-row">
          <div className="relative size-44 shrink-0">
            <svg viewBox="0 0 128 128" className="size-full -rotate-90">
              {fields.map((u) => {
                const len = (u.pct / 100) * c;
                const el = (
                  <circle
                    key={u.label}
                    cx="64"
                    cy="64"
                    r={r}
                    fill="none"
                    strokeWidth="16"
                    className={u.cls.split(" ")[0]}
                    strokeDasharray={`${Math.max(0, len - 2)} ${c - len + 2}`}
                    strokeDashoffset={-offset}
                  />
                );
                offset += len;
                return el;
              })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center px-2 text-center">
              <span className="text-2xl font-bold">{topField.pct}%</span>
              <span className="max-w-[100px] truncate text-[11px] font-medium text-muted-foreground">
                {topField.shortLabel}
              </span>
            </div>
          </div>
          <ul className="min-w-0 w-full space-y-3 sm:w-auto sm:flex-1">
            {fields.map((u) => (
              <li key={u.label} className="flex items-start gap-3 text-sm">
                <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", u.cls.split(" ")[1])} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-foreground">{u.label}</span>
                    <span className="shrink-0 font-semibold text-foreground/85">{u.pct}%</span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{u.meta}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

export function AnalyticsDashboard() {
  const { courses, isLoading: coursesLoading } = useCoursesList();
  const [analyticsRows, setAnalyticsRows] = useState<AnalyticsDayRow[]>([]);
  const [historyItems, setHistoryItems] = useState<AnalyticsHistoryItem[]>([]);
  const [totalNotes, setTotalNotes] = useState<number>(0);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [rows, hist, notesStats] = await Promise.all([
          apiJson<AnalyticsDayRow[]>("/api/analytics").catch(() => []),
          apiJson<AnalyticsHistoryItem[]>("/api/analytics/history?limit=200").catch(() => []),
          apiJson<{ totalNotes?: number }>("/api/notes/stats").catch(() => ({ totalNotes: 0 })),
        ]);
        if (cancelled) return;
        setAnalyticsRows(Array.isArray(rows) ? rows : []);
        setHistoryItems(Array.isArray(hist) ? hist : []);
        setTotalNotes(Number(notesStats?.totalNotes) || 0);
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const computed = useMemo(() => {
    const byDate = new Map<string, { min: number; lessons: number }>();
    const weekdaySeconds = [0, 0, 0, 0, 0, 0, 0]; // Mon..Sun
    let totalWatchSeconds = 0;
    let weekWatchSeconds = 0;

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 6);

    for (const row of analyticsRows) {
      const secs = Number(row.watch_time_seconds) || 0;
      const lessonsCount = Number(row.videos_completed) || Number(row.sessions_count) || 0;
      totalWatchSeconds += secs;

      if (row.date) {
        const parsed = new Date(`${row.date}T00:00:00`);
        if (!Number.isNaN(parsed.getTime())) {
          if (parsed >= weekAgo) weekWatchSeconds += secs;
          const jsDay = parsed.getDay(); // 0=Sun..6=Sat
          const monIdx = jsDay === 0 ? 6 : jsDay - 1;
          weekdaySeconds[monIdx] = (weekdaySeconds[monIdx] ?? 0) + secs;
        }
        byDate.set(row.date, {
          min: Math.round(secs / 60),
          lessons: lessonsCount,
        });
      }
    }

    // Also include activity days from video watch history so heatmap/streak stay accurate
    for (const item of historyItems) {
      const ts = item.video?.lastWatchedAt;
      if (!ts) continue;
      const d = new Date(ts);
      if (Number.isNaN(d.getTime())) continue;
      d.setHours(0, 0, 0, 0);
      const key = toLocalDateKey(d);
      const estimatedSecs = Math.round((item.video.duration || 0) * (item.video.watchProgress || 0));
      const existing = byDate.get(key);
      if (!existing) {
        byDate.set(key, { min: Math.max(1, Math.round(estimatedSecs / 60)), lessons: 1 });
      }
    }

    // Fallback watch time from video progress if no analytics sessions recorded yet
    if (totalWatchSeconds === 0 && historyItems.length > 0) {
      totalWatchSeconds = historyItems.reduce(
        (sum, item) => sum + Math.round((item.video.duration || 0) * (item.video.watchProgress || 0)),
        0,
      );
    }

    // Current & best consecutive-day streaks
    const activeDates = Array.from(byDate.entries())
      .filter(([, v]) => v.min > 0 || v.lessons > 0)
      .map(([k]) => k)
      .sort();
    const activeSet = new Set(activeDates);

    let currentStreak = 0;
    const cursor = new Date(now);
    if (!activeSet.has(toLocalDateKey(cursor))) {
      cursor.setDate(cursor.getDate() - 1);
    }
    while (activeSet.has(toLocalDateKey(cursor))) {
      currentStreak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    let bestStreak = 0;
    let run = 0;
    let prevTime: number | null = null;
    for (const dateKey of activeDates) {
      const t = new Date(`${dateKey}T00:00:00`).getTime();
      if (prevTime !== null && Math.round((t - prevTime) / 864e5) === 1) {
        run += 1;
      } else {
        run = 1;
      }
      if (run > bestStreak) bestStreak = run;
      prevTime = t;
    }

    const completedCourses = courses.filter((c) => c.completionPercentage === 100 || c.progress === 100).length;
    const completionPct =
      courses.length > 0 ? Math.round((completedCourses / courses.length) * 100) : 0;

    return {
      byDate,
      weekdaySeconds,
      totalWatchSeconds,
      weekWatchSeconds,
      currentStreak,
      bestStreak,
      completedCourses,
      completionPct,
    };
  }, [analyticsRows, historyItems, courses]);

  return (
    <div className="mx-auto w-full max-w-[1440px] px-5 pb-12 pt-6 sm:px-8 sm:pt-8 lg:px-10">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Statistics</h1>
        {(coursesLoading || dataLoading) && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Syncing…
          </span>
        )}
      </header>

      <div className="space-y-6">
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            icon={<Clock className="size-5 text-chart-2" />}
            label="Watch time"
            value={formatDurationLabel(computed.totalWatchSeconds)}
          >
            <span className="rounded bg-chart-4/10 px-2 py-1 font-semibold text-chart-4">
              +{Number((computed.weekWatchSeconds / 3600).toFixed(1))}h this week
            </span>
          </Metric>
          <Metric warm icon={<Flame className="size-5" />} label="Streak" value={`${computed.currentStreak} ${computed.currentStreak === 1 ? "day" : "days"}`}>
            Personal best: {computed.bestStreak} {computed.bestStreak === 1 ? "day" : "days"}
          </Metric>
          <Metric
            icon={<CheckCircle2 className="size-5 text-chart-4" />}
            label="Completed courses"
            value={`${computed.completedCourses} / ${courses.length}`}
          >
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-chart-4"
                style={{ width: `${computed.completionPct}%` }}
              />
            </div>
          </Metric>
          <Metric
            icon={<BookOpen className="size-5 text-chart-1" />}
            label="Notes"
            value={String(totalNotes)}
          >
            Across {courses.length} {courses.length === 1 ? "course" : "courses"}
          </Metric>
        </div>
        <Heatmap byDate={computed.byDate} />
        <div className="grid gap-6 lg:grid-cols-2">
          <Velocity weekdaySeconds={computed.weekdaySeconds} />
          <LearningFocus courses={courses} />
        </div>
      </div>
    </div>
  );
}
