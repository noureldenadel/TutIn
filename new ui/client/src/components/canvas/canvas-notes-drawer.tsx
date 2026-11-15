import { useMemo, useState } from "react";
import { LocateFixed, Plus, Search, X } from "lucide-react";

import { formatTimestamp, type CourseLessonItem } from "@/lib/course-lessons";
import { stripHtmlToText, type NoteItem } from "@/lib/course-notes";
import { formatCanvasLessonCode, type CanvasCard } from "@/lib/course-canvas";
import { cn } from "@/lib/utils";

type DrawerFilter = "all" | "detached" | "off";

export function CanvasNotesDrawer({
  open,
  notes,
  cards,
  lessons,
  dismissedNoteIds,
  onFocusCard,
  onRestoreNote,
  onClose,
}: {
  open: boolean;
  notes: NoteItem[];
  cards: CanvasCard[];
  lessons: CourseLessonItem[];
  dismissedNoteIds: string[];
  onFocusCard: (cardId: string) => void;
  onRestoreNote: (noteId: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<DrawerFilter>("all");

  const cardByNoteId = useMemo(() => {
    const map = new Map<string, CanvasCard>();
    for (const c of cards) {
      if (c.noteId) map.set(c.noteId, c);
    }
    return map;
  }, [cards]);

  const dismissedSet = useMemo(() => new Set(dismissedNoteIds), [dismissedNoteIds]);

  const groupedLessons = useMemo(() => {
    const q = query.trim().toLowerCase();
    const groups = new Map<number, { lesson: CourseLessonItem | undefined; items: NoteItem[] }>();

    for (const note of notes) {
      const card = cardByNoteId.get(note.id);
      const isOff = dismissedSet.has(note.id) || !card;
      const isDetached =
        card?.membershipState === "detached" || card?.membershipState === "reassigned";

      if (filter === "detached" && !isDetached) continue;
      if (filter === "off" && !isOff) continue;

      if (q) {
        const plain = stripHtmlToText(note.content).toLowerCase();
        const title = (lessons[note.lessonIdx]?.title ?? "").toLowerCase();
        if (!plain.includes(q) && !title.includes(q)) continue;
      }

      const bucket = groups.get(note.lessonIdx) ?? {
        lesson: lessons[note.lessonIdx],
        items: [],
      };
      bucket.items.push(note);
      groups.set(note.lessonIdx, bucket);
    }

    return Array.from(groups.entries())
      .sort(([a], [b]) => a - b)
      .map(([lessonIdx, group]) => ({
        lessonIdx,
        lesson: group.lesson,
        items: group.items.sort((a, b) => a.timestamp - b.timestamp),
      }));
  }, [notes, cardByNoteId, dismissedSet, filter, query, lessons]);

  if (!open) return null;

  return (
    <aside
      data-canvas-ui="true"
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      className="pointer-events-auto absolute bottom-20 right-4 top-16 z-20 flex w-80 flex-col overflow-hidden rounded-xl border border-border/70 bg-card/95 shadow-workspace backdrop-blur-sm animate-in fade-in slide-in-from-right-2 duration-150 md:bottom-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 px-3.5 py-2.5">
        <span className="text-xs font-semibold text-foreground">Course notes</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close drawer"
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X className="size-3.5 stroke-[1.75]" />
        </button>
      </div>

      {/* Search + Segmented Filter */}
      <div className="space-y-2 border-b border-border/50 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 stroke-[1.75] text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes"
            className="h-8 w-full rounded-lg bg-secondary/75 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="grid grid-cols-3 gap-1 rounded-lg bg-secondary/75 p-0.5 text-[11px] font-medium">
          {(
            [
              ["all", "All"],
              ["detached", "Detached"],
              ["off", "Off canvas"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={cn(
                "rounded-sm py-1 text-muted-foreground transition-colors",
                filter === id && "bg-card text-foreground shadow-card",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Grouped Lesson Notes */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 custom-scrollbar-sm">
        {groupedLessons.length === 0 ? (
          <div className="py-10 text-center text-xs text-muted-foreground">No matching notes.</div>
        ) : (
          groupedLessons.map(({ lessonIdx, lesson, items }) => (
            <div key={lessonIdx} className="space-y-1.5">
              <p
                title={lesson?.moduleTitle}
                className="truncate px-1 text-[11px] font-semibold text-muted-foreground"
              >
                {formatCanvasLessonCode(lessons, lessonIdx)} ·{" "}
                {lesson?.title ?? `Lesson ${lessonIdx + 1}`}
              </p>

              {items.map((note) => {
                const card = cardByNoteId.get(note.id);
                const isOff = dismissedSet.has(note.id) || !card;
                const statusLabel = isOff
                  ? "Off canvas"
                  : card.membershipState === "detached"
                    ? "Detached"
                    : card.membershipState === "reassigned"
                      ? "Moved"
                      : null;

                return (
                  <div
                    key={note.id}
                    className="flex items-start justify-between gap-2 rounded-lg bg-secondary/45 p-2.5 transition-colors hover:bg-secondary/75"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="rounded-sm bg-primary-soft px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-primary">
                          {formatTimestamp(note.timestamp)}
                        </span>
                        {statusLabel && (
                          <span className="rounded-sm bg-card px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {statusLabel}
                          </span>
                        )}
                      </div>
                      <p className="line-clamp-2 text-xs leading-4 text-foreground">
                        {stripHtmlToText(note.content) || "[Screenshot note]"}
                      </p>
                    </div>

                    {isOff ? (
                      <button
                        type="button"
                        onClick={() => onRestoreNote(note.id)}
                        title="Add back to canvas"
                        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-card px-2 text-[11px] font-medium text-foreground shadow-card transition-colors hover:bg-primary hover:text-primary-foreground"
                      >
                        <Plus className="size-3 stroke-[1.75]" />
                        <span>Add</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onFocusCard(card.id)}
                        title="Focus on canvas"
                        aria-label="Focus card"
                        className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-card hover:text-foreground [&_svg]:stroke-[1.75]"
                      >
                        <LocateFixed className="size-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
