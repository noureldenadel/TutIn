import { useMemo, useState, type ReactNode } from "react";
import { BookOpen, CheckCircle2, Clock, Flame } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { courses } from "@/lib/courses";
import { cn } from "@/lib/utils";

function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("rounded-xl border border-border/60 bg-card p-6 shadow-card", className)}>{children}</section>;
}

function Metric({ icon, label, value, children, warm }: { icon: ReactNode; label: string; value: string; children: ReactNode; warm?: boolean }) {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center gap-2.5">
        <span className={cn("text-muted-foreground [&_svg]:size-5", warm && "text-streak")}>{icon}</span>
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
      </div>
      <p className="text-2xl font-bold tracking-tight text-foreground">{value}</p>
      <div className="text-xs text-muted-foreground">{children}</div>
    </Card>
  );
}

// deterministic pseudo-random
const rand = (i: number) => { const x = Math.sin(i * 9301 + 49297) * 233280; return x - Math.floor(x); };
const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);

function Heatmap() {
  const [range, setRange] = useState<"2026" | "3m">("2026");
  const days = useMemo(() => {
    const end = new Date(2026, 9, 1);
    const total = range === "2026" ? 52 * 7 : 13 * 7;
    const start = new Date(end); start.setDate(end.getDate() - total + 1);
    start.setDate(start.getDate() - start.getDay()); // align to Sunday
    const out: { date: Date; min: number; lessons: number }[] = [];
    for (let d = new Date(start), i = 0; d <= end; d.setDate(d.getDate() + 1), i++) {
      const r = rand(d.getTime() / 864e5);
      const min = r < 0.3 ? 0 : Math.round(r * r * 150);
      out.push({ date: new Date(d), min, lessons: Math.floor(min / 40) });
    }
    return out;
  }, [range]);
  const weeks: typeof days[] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  const level = (m: number) => (m === 0 ? "bg-secondary" : m < 30 ? "bg-foreground/20" : m < 60 ? "bg-foreground/40" : m < 100 ? "bg-foreground/60" : "bg-foreground/80");

  return (
    <Card>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Study consistency</h2>
        <div className="flex rounded-lg border border-border bg-secondary/50 p-1 text-xs font-medium">
          {([["2026", "2026"], ["3m", "Past 3 Months"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setRange(k)} className={cn("rounded-sm px-3 py-1.5 text-muted-foreground transition", range === k && "bg-card text-foreground shadow-card")}>{l}</button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto pb-2 custom-scrollbar-sm">
        <div className="flex w-max gap-[3px]">
          {weeks.map((w, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {w.map((d) => (
                <Tooltip key={d.date.toISOString()}>
                   <TooltipTrigger asChild><span className={cn("block size-3 rounded-[2px] transition hover:ring-2 hover:ring-ring/40", level(d.min))} /></TooltipTrigger>
                  <TooltipContent>{d.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}: {fmtMin(d.min)} • {d.lessons} lessons</TooltipContent>
                </Tooltip>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
         Less {[0, 20, 50, 80, 120].map((m) => <span key={m} className={cn("size-3 rounded-[2px]", level(m))} />)} More
      </div>
    </Card>
  );
}

const velocity = [["Mon", 6.2], ["Tue", 7.8], ["Wed", 5.4], ["Thu", 8.6], ["Fri", 4.1], ["Sat", 9.3], ["Sun", 4.9]] as const;

function Velocity() {
  const max = Math.max(...velocity.map((v) => v[1]));
  return (
    <Card>
      <h2 className="text-base font-semibold">Study velocity</h2>
      <p className="mt-1 text-xs text-muted-foreground">Hours watched, past year</p>
      <div className="mt-6 flex h-52 items-end gap-3">
        {velocity.map(([d, h]) => (
          <Tooltip key={d}>
            <TooltipTrigger asChild>
              <div className="group flex h-full flex-1 flex-col items-center justify-end gap-2">
                <span className="text-[11px] font-semibold text-muted-foreground opacity-0 transition group-hover:opacity-100">{h}h</span>
                 <div className={cn("w-full max-w-10 rounded-t transition-all group-hover:bg-foreground/70", h === max ? "bg-foreground/75" : "bg-foreground/25")} style={{ height: `${(h / max) * 80}%` }} />
                <span className="text-xs text-muted-foreground">{d}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>{d}: {h} hours</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </Card>
  );
}

interface FieldFocus {
  label: string;
  shortLabel: string;
  tags: string;
  pct: number;
  cls: string;
}

function LearningFocus() {
  const fields = useMemo<FieldFocus[]>(() => {
    const targets = [
      { id: "Design & UI/UX", label: "Design & UI/UX", shortLabel: "Design" },
      { id: "Programming", label: "Programming", shortLabel: "Code" },
      { id: "Motion Graphics", label: "Motion Graphics", shortLabel: "Motion" },
      { id: "AI & Machine Learning", label: "AI & Machine Learning", shortLabel: "AI & ML" },
    ];

    const stats: Record<string, { minutes: number; tags: Set<string> }> = {};
    targets.forEach((t) => {
      stats[t.id] = { minutes: 0, tags: new Set() };
    });

    for (const c of courses) {
      const cat = c.category;
      const entry = cat ? stats[cat] : undefined;
      if (entry) {
        const h = parseInt(c.duration.match(/(\d+)h/)?.[1] ?? "0", 10);
        const m = parseInt(c.duration.match(/(\d+)m/)?.[1] ?? "0", 10);
        const watched = ((h * 60 + m) * (c.progress || 0)) / 100;
        entry.minutes += watched;
        c.tags?.forEach((tag) => entry.tags.add(tag));
      }
    }

    const palette = [
      "stroke-foreground bg-foreground",
      "stroke-foreground/75 bg-foreground/75",
      "stroke-foreground/45 bg-foreground/45",
      "stroke-foreground/20 bg-foreground/20",
    ];

    const totalMin = Object.values(stats).reduce((acc, s) => acc + s.minutes, 0) || 1;

    const list = targets
      .map((t) => {
        const entry = stats[t.id] ?? { minutes: 0, tags: new Set<string>() };
        const pct = Math.round((entry.minutes / totalMin) * 100);
        const tagPreview = Array.from(entry.tags).slice(0, 3).join(" · ") || t.label;
        return {
          label: t.label,
          shortLabel: t.shortLabel,
          tags: tagPreview,
          pct,
          minutes: entry.minutes,
        };
      })
      .sort((a, b) => b.minutes - a.minutes);

    const sum = list.reduce((acc, item) => acc + item.pct, 0);
    if (sum !== 100 && list[0]) {
      list[0].pct += 100 - sum;
    }

    return list.map((item, idx) => ({
      label: item.label,
      shortLabel: item.shortLabel,
      tags: item.tags,
      pct: item.pct,
      cls: palette[idx] || "stroke-foreground/20 bg-foreground/20",
    }));
  }, []);

  const r = 52, c = 2 * Math.PI * r;
  let offset = 0;
  const topField = fields[0] ?? { pct: 0, shortLabel: "Focus" };

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Learning focus</h2>
        <span className="text-xs text-muted-foreground">From course tags</span>
      </div>
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
        <ul className="w-full space-y-3">
          {fields.map((u) => (
            <li key={u.label} className="flex items-start gap-3 text-sm">
              <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", u.cls.split(" ")[1])} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">{u.label}</span>
                  <span className="font-semibold text-foreground/85">{u.pct}%</span>
                </div>
                <p className="truncate text-xs text-muted-foreground">{u.tags}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

export function AnalyticsDashboard() {
  const completedCourses = useMemo(
    () => courses.filter((c) => c.progress === 100).length,
    []
  );

  return (
    <div className="min-h-full">
      <div className="mx-auto max-w-7xl space-y-6 p-5 sm:p-8">
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <Metric icon={<Clock className="size-5" />} label="Watch time" value="46h 20m">
            <span className="rounded bg-secondary px-2 py-1 font-semibold text-foreground/75">+4.2h this week</span>
          </Metric>
          <Metric warm icon={<Flame className="size-5" />} label="Streak" value="12 days">Personal best: 19 days</Metric>
          <Metric icon={<CheckCircle2 className="size-5" />} label="Completed courses" value={`${completedCourses} / ${courses.length}`}>
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-foreground/55"
                style={{ width: `${Math.round((completedCourses / courses.length) * 100)}%` }}
              />
            </div>
          </Metric>
          <Metric icon={<BookOpen className="size-5" />} label="Notes" value="342">Across 8 courses</Metric>
        </div>
        <Heatmap />
        <div className="grid gap-6 lg:grid-cols-2">
          <Velocity />
          <LearningFocus />
        </div>
      </div>
    </div>
  );
}
