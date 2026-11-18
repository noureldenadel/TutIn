import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, X } from "lucide-react";

import { getLanguageName } from "@/lib/languages";
import { cancelTranscriptJob, type TranscriptJobItem } from "@/lib/transcript-ai";
import { cn } from "@/lib/utils";

export interface AiJobTraceCardProps {
  job: TranscriptJobItem;
  /** Optional custom header content (e.g. lesson title link in global popover) */
  headerTitle?: ReactNode | undefined;
  /** Compact density for menu dropdowns */
  compact?: boolean | undefined;
  defaultExpanded?: boolean | undefined;
  className?: string | undefined;
}

/**
 * Expandable shimmering AI job placeholder inspired by agent trace timelines:
 * clicking toggles the live completed/running steps inline with progress and cancel controls
 * without opening the generation modal.
 */
export function AiJobTraceCard({
  job,
  headerTitle,
  compact = false,
  defaultExpanded = false,
  className,
}: AiJobTraceCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const stepsListRef = useRef<HTMLDivElement>(null);
  const [railHeight, setRailHeight] = useState(0);

  const trackLabel = `${getLanguageName(job.targetLanguage)} · ${job.mode === "dub" ? "Dub" : "AI"}`;
  const steps = job.steps.length
    ? job.steps
    : [
        {
          id: "current",
          label: job.message.replace(/…+$/, "").trim() || trackLabel,
          status: "running" as const,
        },
      ];

  useLayoutEffect(() => {
    const el = stepsListRef.current;
    if (!el) return;
    const update = () => setRailHeight(el.offsetHeight);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [expanded, steps.length, job.message, job.progress]);

  return (
    <div
      className={cn(
        "ai-shimmer-row t-resize relative overflow-hidden border border-primary/20 bg-secondary/70",
        compact ? "rounded-md" : "rounded-lg",
        className,
      )}
    >
      <div
        className={cn(
          "flex w-full items-center justify-between gap-2",
          compact ? "px-2 py-1.5" : "px-2.5 py-2",
        )}
      >
        {headerTitle ? (
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <span
              className="size-2.5 shrink-0 rounded-full border-[1.5px] border-primary/30 border-t-primary animate-spin"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1 truncate">{headerTitle}</div>
            <button
              type="button"
              aria-expanded={expanded}
              aria-label={expanded ? "Collapse trace" : "Expand trace"}
              onClick={() => setExpanded((prev) => !prev)}
              className="flex shrink-0 items-center rounded p-0.5 text-muted-foreground transition-colors hover:bg-background/50 hover:text-foreground"
            >
              <ChevronDown
                className={cn(
                  "size-3.5 transition-transform duration-300",
                  expanded && "rotate-180",
                )}
              />
            </button>
          </div>
        ) : (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((prev) => !prev)}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left transition-opacity hover:opacity-90"
          >
            <span
              className="size-2.5 shrink-0 rounded-full border-[1.5px] border-primary/30 border-t-primary animate-spin"
              aria-hidden="true"
            />
            <span
              className={cn(
                "ai-shimmer-text min-w-0 flex-1 truncate font-medium",
                compact ? "text-[13px]" : "text-xs",
              )}
            >
              {trackLabel}
            </span>
            <ChevronDown
              className={cn(
                "size-3.5 shrink-0 text-muted-foreground transition-transform duration-300",
                expanded && "rotate-180",
              )}
            />
          </button>
        )}

        <div
          className="flex shrink-0 items-center gap-1"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="font-mono text-[11px] font-semibold text-primary tabular-nums">
            {job.status === "queued" ? "Queued" : `${job.progress}%`}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              cancelTranscriptJob(job.videoId);
            }}
            title="Cancel task"
            aria-label="Cancel task"
            className="rounded p-1 text-muted-foreground/80 transition-colors hover:bg-destructive/15 hover:text-destructive"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Expandable live step trace */}
      <div
        className="grid transition-[grid-template-rows,opacity] duration-300"
        style={{
          gridTemplateRows: expanded ? "1fr" : "0fr",
          opacity: expanded ? 1 : 0,
          transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div className="overflow-hidden">
          <div
            className={cn(
              "relative border-t border-border/40 bg-background/45",
              compact
                ? "mx-1.5 mb-2 rounded-md pl-4 pr-2 pt-1.5 pb-1.5"
                : "mx-2 mb-2 rounded-md pl-4 pr-2.5 pt-2 pb-2",
            )}
          >
            <span
              aria-hidden="true"
              className="absolute left-[11px] w-px bg-border/80"
              style={{
                top: 8,
                height: railHeight ? Math.max(0, railHeight - 8) : 0,
                transition: "height 360ms cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            />
            <div ref={stepsListRef} className="flex flex-col gap-1">
              {steps.map((step, idx) => {
                const isDone = step.status === "done";
                return (
                  <div
                    key={step.id}
                    className="animate-trace-step flex min-h-5 items-center justify-between gap-2 pl-2"
                    style={{ animationDelay: `${Math.min(idx * 55, 220)}ms` }}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      {isDone ? (
                        <Check className="size-3 shrink-0 text-chart-4" />
                      ) : (
                        <span
                          className="size-2.5 shrink-0 rounded-full border-[1.5px] border-border border-t-primary animate-spin"
                          aria-hidden="true"
                        />
                      )}
                      <span
                        className={cn(
                          "truncate text-[11.5px]",
                          isDone ? "text-muted-foreground" : "ai-shimmer-text font-medium",
                        )}
                      >
                        {step.label}
                      </span>
                    </span>
                    {step.detail && (
                      <span
                        className={cn(
                          "shrink-0 font-mono text-[10.5px] tabular-nums",
                          isDone ? "text-muted-foreground/75" : "text-primary/90",
                        )}
                      >
                        {step.detail}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom progress hairline */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-secondary/60"
      >
        <span
          className="block h-full bg-gradient-to-r from-primary via-chart-2 to-chart-1 transition-all duration-300"
          style={{ width: `${Math.max(6, job.progress)}%` }}
        />
      </span>
    </div>
  );
}
