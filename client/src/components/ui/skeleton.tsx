import { cn } from "@/lib/utils";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: "default" | "player";
}

export function Skeleton({ className, tone = "default", ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "skeleton-shimmer rounded-md",
        tone === "player" && "skeleton-shimmer-player",
        className,
      )}
      {...props}
    />
  );
}

export function CourseCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl bg-card shadow-card"
    >
      <Skeleton className="aspect-video w-full rounded-none" />
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <Skeleton className="h-5 w-4/5 rounded-sm sm:h-6" />
        <div className="mt-2.5 flex items-center gap-2.5 sm:mt-3">
          <Skeleton className="size-7 shrink-0 rounded-full" />
          <Skeleton className="h-3.5 w-28 rounded-sm" />
        </div>
        <div className="mt-auto space-y-2.5 pt-4 sm:pt-5">
          <Skeleton className="h-1.5 w-full rounded-full" />
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-3.5 w-24 rounded-sm" />
            <Skeleton className="h-3.5 w-9 rounded-sm" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function CourseGridSkeleton({
  count = 8,
  className,
  reveal = true,
}: {
  count?: number;
  className?: string;
  reveal?: boolean;
}) {
  return (
    <div
      role="status"
      aria-label="Loading courses"
      className={cn(
        "grid gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-4",
        reveal && "skeleton-reveal",
        className,
      )}
    >
      {Array.from({ length: count }, (_, idx) => (
        <CourseCardSkeleton key={idx} />
      ))}
    </div>
  );
}

export function InstructorListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading instructors"
      className="skeleton-reveal mt-6 flex flex-col gap-1"
    >
      {Array.from({ length: count }, (_, idx) => (
        <div key={idx} className="flex items-center gap-4 rounded-xl px-4 py-3 sm:px-5 sm:py-3.5">
          <Skeleton className="size-12 shrink-0 rounded-full" />
          <Skeleton className="h-4 rounded-sm" style={{ width: `${140 + ((idx * 37) % 110)}px` }} />
          <Skeleton className="ml-auto h-3.5 w-16 shrink-0 rounded-sm" />
        </div>
      ))}
    </div>
  );
}

export function InstructorDetailSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading instructor"
      className="skeleton-reveal mx-auto w-full max-w-[1440px] px-4 pb-8 pt-4 sm:px-8 sm:pb-12 sm:pt-8 lg:px-10"
    >
      <Skeleton className="mb-4 h-7 w-28 rounded-md sm:mb-6" />
      <div className="flex flex-col gap-4 border-b border-border/50 pb-5 sm:flex-row sm:items-center sm:gap-6 sm:pb-6">
        <Skeleton className="size-16 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2.5">
          <Skeleton className="h-7 w-52 rounded-sm sm:h-8" />
          <Skeleton className="h-4 w-64 rounded-sm" />
        </div>
      </div>
      <div className="mt-5 sm:mt-6">
        <div className="flex items-center justify-between pb-3 sm:pb-4">
          <Skeleton className="h-6 w-24 rounded-sm" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
        <CourseGridSkeleton count={4} reveal={false} className="mt-4 sm:mt-6" />
      </div>
    </div>
  );
}

export function HistoryRowsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-1">
      {Array.from({ length: count }, (_, idx) => (
        <div
          key={idx}
          className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 sm:gap-4 sm:px-4 sm:py-3.5"
        >
          <Skeleton className="aspect-video w-28 shrink-0 rounded-lg sm:w-44" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton
              className="h-4 rounded-sm sm:h-5"
              style={{ width: `${52 + ((idx * 17) % 34)}%` }}
            />
            <Skeleton
              className="h-3.5 rounded-sm"
              style={{ width: `${32 + ((idx * 13) % 24)}%` }}
            />
            <div className="flex items-center gap-3 pt-0.5">
              <Skeleton className="h-3 w-20 rounded-sm" />
              <Skeleton className="h-3 w-24 rounded-sm" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function HistoryListSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading history"
      className="skeleton-reveal mt-4 flex flex-col gap-6"
    >
      <section>
        <Skeleton className="mx-1 h-3.5 w-16 rounded-sm" />
        <div className="mt-2">
          <HistoryRowsSkeleton count={4} />
        </div>
      </section>
      <section>
        <Skeleton className="mx-1 h-3.5 w-24 rounded-sm" />
        <div className="mt-2">
          <HistoryRowsSkeleton count={3} />
        </div>
      </section>
    </div>
  );
}

export function AnalyticsSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading statistics"
      className="skeleton-reveal space-y-4 sm:space-y-6"
    >
      <div className="grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, idx) => (
          <div
            key={idx}
            className="flex flex-col gap-3 rounded-xl bg-card p-4 shadow-card sm:gap-4 sm:p-6"
          >
            <div className="flex items-center gap-2.5">
              <Skeleton className="size-4 rounded-sm sm:size-5" />
              <Skeleton className="h-3.5 w-24 rounded-sm" />
            </div>
            <Skeleton className="h-7 w-28 rounded-sm sm:h-8" />
            <Skeleton className="h-3 w-32 rounded-sm" />
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-card p-4 shadow-card sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <Skeleton className="h-5 w-36 rounded-sm" />
          <Skeleton className="h-8 w-44 rounded-lg" />
        </div>
        <Skeleton className="h-32 w-full rounded-lg" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl bg-card p-4 shadow-card sm:p-6">
          <Skeleton className="mb-5 h-5 w-32 rounded-sm" />
          <div className="flex h-44 items-end gap-3 pt-4">
            {[42, 68, 52, 90, 62, 34, 74].map((h, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-2">
                <Skeleton className="w-full rounded-md" style={{ height: `${h}%` }} />
                <Skeleton className="h-3 w-6 rounded-sm" />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl bg-card p-4 shadow-card sm:p-6">
          <Skeleton className="mb-5 h-5 w-36 rounded-sm" />
          <div className="flex flex-col items-center gap-6 sm:flex-row">
            <Skeleton className="size-36 shrink-0 rounded-full" />
            <div className="w-full flex-1 space-y-3">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="flex items-center justify-between gap-3">
                  <Skeleton className="h-3.5 w-28 rounded-sm" />
                  <Skeleton className="h-3.5 w-10 rounded-sm" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PlaylistRowsSkeleton({ count = 7 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading playlist"
      className="skeleton-reveal flex flex-1 flex-col px-3 pb-4 pt-1"
    >
      <div className="space-y-2 pb-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-3.5 w-28 rounded-sm" />
          <Skeleton className="h-6 w-16 rounded-md" />
        </div>
        <Skeleton className="h-1.5 w-full rounded-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="mb-2 h-4 w-36 rounded-sm" />
        {Array.from({ length: count }, (_, idx) => (
          <div key={idx} className="flex items-center gap-2.5 rounded-lg px-2 py-2">
            <Skeleton className="size-4 shrink-0 rounded-full" />
            <Skeleton
              className="h-3.5 rounded-sm"
              style={{ width: `${56 + ((idx * 19) % 30)}%` }}
            />
            <Skeleton className="ml-auto h-3 w-9 shrink-0 rounded-sm" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function NotesListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading notes" className="skeleton-reveal space-y-3 pt-1">
      {Array.from({ length: count }, (_, idx) => (
        <div key={idx} className="space-y-2.5 rounded-lg bg-secondary/45 px-4 py-3.5">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-3.5 w-full rounded-sm" />
          <Skeleton className="h-3.5 w-4/5 rounded-sm" />
        </div>
      ))}
    </div>
  );
}

export function TranscriptCuesSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading subtitles"
      className="skeleton-reveal flex-1 space-y-2.5 overflow-hidden px-3 pb-4 pt-1"
    >
      {Array.from({ length: count }, (_, idx) => (
        <div key={idx} className="flex items-start gap-2.5 rounded-lg px-2 py-1.5">
          <Skeleton className="mt-0.5 h-4 w-11 shrink-0 rounded-sm" />
          <div className="flex-1 space-y-1.5">
            <Skeleton
              className="h-3.5 rounded-sm"
              style={{ width: `${74 + ((idx * 13) % 24)}%` }}
            />
            <Skeleton
              className="h-3.5 rounded-sm"
              style={{ width: `${45 + ((idx * 19) % 38)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PlayerSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading course player"
      className="skeleton-reveal flex min-h-dvh flex-col gap-4 px-3 py-3 sm:px-5 sm:py-4 lg:h-dvh lg:flex-row lg:overflow-hidden lg:px-6"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 sm:gap-4">
        <div className="relative min-h-0 w-full flex-1 overflow-hidden rounded-xl bg-player shadow-workspace max-lg:aspect-video">
          <Skeleton tone="player" className="size-full rounded-none" />
        </div>
        <div className="shrink-0 space-y-2.5 pb-1">
          <Skeleton className="h-3.5 w-48 rounded-sm" />
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-6 w-2/5 rounded-sm sm:h-7" />
            <Skeleton className="h-8 w-24 rounded-md" />
          </div>
          <div className="flex items-center gap-2.5 pt-0.5">
            <Skeleton className="size-7 rounded-full" />
            <Skeleton className="h-3.5 w-32 rounded-sm" />
          </div>
        </div>
      </div>

      <aside className="flex h-[min(520px,68dvh)] w-full shrink-0 flex-col overflow-hidden rounded-xl bg-card shadow-card sm:h-[580px] lg:h-full lg:w-[380px]">
        <div className="p-3">
          <Skeleton className="h-9 w-full rounded-lg" />
        </div>
        <PlaylistRowsSkeleton count={7} />
      </aside>
    </div>
  );
}

export function CurriculumSkeleton({
  withHeader = false,
  moduleCount = 3,
}: {
  withHeader?: boolean;
  moduleCount?: number;
}) {
  const inner = (
    <div className="space-y-4">
      {Array.from({ length: moduleCount }, (_, modIdx) => (
        <section key={modIdx} className="overflow-hidden rounded-xl bg-card shadow-card">
          <div className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-3.5">
            <div className="flex items-center gap-2.5">
              <Skeleton className="size-4 rounded-sm" />
              <Skeleton
                className="h-4 rounded-sm"
                style={{ width: `${150 + ((modIdx * 43) % 90)}px` }}
              />
            </div>
            <Skeleton className="h-3.5 w-24 rounded-sm" />
          </div>
          <div className="divide-y divide-border/40 px-4 py-1">
            {Array.from({ length: 4 }, (_, rowIdx) => (
              <div key={rowIdx} className="flex items-center gap-3 py-3">
                <Skeleton className="size-4 shrink-0 rounded-sm" />
                <Skeleton
                  className="h-3.5 rounded-sm"
                  style={{ width: `${38 + (((modIdx + rowIdx) * 17) % 36)}%` }}
                />
                <Skeleton className="ml-auto h-3.5 w-12 shrink-0 rounded-sm" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );

  if (!withHeader) {
    return (
      <div role="status" aria-label="Loading curriculum" className="skeleton-reveal">
        {inner}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-label="Loading course curriculum"
      className="skeleton-reveal mx-auto w-full max-w-[1200px] px-4 pb-10 pt-5 sm:px-8 sm:pt-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5">
        <div className="space-y-2">
          <Skeleton className="h-4 w-28 rounded-sm" />
          <Skeleton className="h-7 w-72 rounded-sm" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-20 rounded-md" />
          <Skeleton className="h-9 w-20 rounded-md" />
          <Skeleton className="h-9 w-24 rounded-md" />
        </div>
      </div>
      {inner}
    </div>
  );
}

export function CanvasSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading canvas"
      style={{
        backgroundImage: "radial-gradient(circle, var(--border) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }}
      className="skeleton-reveal relative h-dvh w-full overflow-hidden bg-shell/65"
    >
      <div className="absolute left-2.5 top-2.5 flex items-center gap-2 rounded-xl border border-border/70 bg-card/95 p-1.5 shadow-card sm:left-4 sm:top-4">
        <Skeleton className="h-7 w-16 rounded-md" />
        <Skeleton className="hidden h-4 w-32 rounded-sm md:block" />
        <Skeleton className="h-7 w-16 rounded-md" />
      </div>

      <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5 rounded-xl border border-border/70 bg-card/95 p-1.5 shadow-card sm:right-4 sm:top-4">
        <Skeleton className="size-7 rounded-md" />
        <Skeleton className="size-7 rounded-md" />
        <Skeleton className="size-7 rounded-md" />
        <Skeleton className="hidden h-7 w-20 rounded-md sm:block" />
      </div>

      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 px-6 pt-24 md:grid-cols-2 lg:grid-cols-3">
        {[3, 2, 3].map((cardCount, colIdx) => (
          <div key={colIdx} className="space-y-3 rounded-xl border border-border/60 bg-card/60 p-4">
            <Skeleton className="h-4 w-40 rounded-sm" />
            {Array.from({ length: cardCount }, (_, cardIdx) => (
              <div key={cardIdx} className="space-y-2 rounded-lg bg-card p-3.5 shadow-card">
                <Skeleton className="h-3 w-20 rounded-sm" />
                <Skeleton className="h-3.5 w-full rounded-sm" />
                <Skeleton className="h-3.5 w-4/5 rounded-sm" />
                {cardIdx === 0 && <Skeleton className="mt-1 h-24 w-full rounded-md" />}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-xl border border-border/70 bg-card/95 p-1.5 shadow-workspace sm:bottom-4">
        <div className="flex items-center gap-1">
          {Array.from({ length: 8 }, (_, idx) => (
            <Skeleton key={idx} className="size-8 rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function RoadmapSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading roadmaps"
      className="skeleton-reveal flex h-full flex-col p-3.5 sm:p-6 lg:p-8"
    >
      <div className="mb-3 flex items-center justify-between gap-2 sm:mb-4">
        <Skeleton className="h-8 w-52 rounded-md" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-8 w-28 rounded-md" />
        </div>
      </div>

      <div
        style={{
          backgroundImage: "radial-gradient(circle, var(--border) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
        className="relative flex flex-1 items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-shell/40 p-6"
      >
        <div className="grid w-full max-w-4xl grid-cols-1 gap-8 md:grid-cols-3">
          {Array.from({ length: 3 }, (_, idx) => (
            <div key={idx} className="overflow-hidden rounded-xl bg-card shadow-card">
              <Skeleton className="aspect-video w-full rounded-none" />
              <div className="space-y-2.5 p-3.5">
                <Skeleton className="h-4 w-4/5 rounded-sm" />
                <Skeleton className="h-1.5 w-full rounded-full" />
                <div className="flex justify-between">
                  <Skeleton className="h-3 w-16 rounded-sm" />
                  <Skeleton className="h-3 w-10 rounded-sm" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SyncPreviewSkeleton() {
  return (
    <div
      role="status"
      aria-label="Scanning course folder"
      className="skeleton-reveal space-y-4 py-2"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, idx) => (
          <div key={idx} className="space-y-2 rounded-lg bg-secondary/50 p-3.5">
            <Skeleton className="h-3 w-16 rounded-sm" />
            <Skeleton className="h-6 w-12 rounded-sm" />
          </div>
        ))}
      </div>
      <div className="space-y-2.5 rounded-lg bg-secondary/35 p-4">
        <Skeleton className="h-4 w-44 rounded-sm" />
        <Skeleton className="h-3.5 w-full rounded-sm" />
        <Skeleton className="h-3.5 w-5/6 rounded-sm" />
        <Skeleton className="h-3.5 w-2/3 rounded-sm" />
      </div>
    </div>
  );
}
