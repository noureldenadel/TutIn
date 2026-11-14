import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Brain,
  ChevronLeft,
  ChevronRight,
  Flame,
  FolderOpen,
  HardDrive,
  HardDriveDownload,
  Languages,
  LayoutGrid,
  Map,
  NotebookPen,
  SlidersHorizontal,
  Sparkles,
  Youtube,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { markWelcomeGuideSeen } from "@/lib/app-settings";

interface GuideItem {
  icon: LucideIcon;
  text: string;
}

interface GuideSlide {
  title: string;
  description: string;
  items: GuideItem[];
}

const SLIDES: GuideSlide[] = [
  {
    title: "Welcome to TutIn",
    description:
      "Offline-first course workspace for watching, annotating, and organizing your library.",
    items: [
      { icon: FolderOpen, text: "Import local folders, YouTube, Google Drive, or links" },
      { icon: Brain, text: "Offline AI transcription, summaries, and voice dubbing" },
      { icon: BarChart3, text: "Local progress tracking, history, and study statistics" },
    ],
  },
  {
    title: "Import & Organize",
    description:
      "Bring courses into one library with automatic module detection and editable structure.",
    items: [
      { icon: FolderOpen, text: "Local folders with module and lesson detection" },
      { icon: Youtube, text: "YouTube playlists with metadata and duration sync" },
      { icon: HardDrive, text: "Google Drive and external course links" },
      { icon: SlidersHorizontal, text: "Editable curriculum modules, covers, and avatars" },
    ],
  },
  {
    title: "Notes & Whiteboard",
    description:
      "Capture timestamped notes in the player and arrange ideas spatially on the canvas.",
    items: [
      { icon: NotebookPen, text: "Rich notes with frame captures, crops, and timestamps" },
      { icon: LayoutGrid, text: "Course Notes Canvas with grouped video artboards" },
      { icon: Sparkles, text: "Transcript search and structured lesson summaries" },
      { icon: Languages, text: "Voice-cloned audio dubbing and subtitle tracks" },
    ],
  },
  {
    title: "Track & Back Up",
    description:
      "Follow weekly study habits, map multi-course paths, and export local backups anytime.",
    items: [
      { icon: Flame, text: "Study streaks and activity heatmaps" },
      { icon: Map, text: "Visual roadmaps for structured learning paths" },
      { icon: HardDriveDownload, text: "Portable JSON backups stored locally" },
    ],
  },
];

export function WelcomeGuideModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [current, setCurrent] = useState(0);
  const [fading, setFading] = useState(false);
  const fadeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (fadeTimerRef.current !== null) window.clearTimeout(fadeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setCurrent(0);
      setFading(false);
    }
  }, [open]);

  const dismissGuide = () => {
    markWelcomeGuideSeen(true);
    onOpenChange(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) dismissGuide();
    else onOpenChange(true);
  };

  const goTo = (index: number) => {
    if (index === current || fading || index < 0 || index >= SLIDES.length) return;
    setFading(true);
    if (fadeTimerRef.current !== null) window.clearTimeout(fadeTimerRef.current);
    fadeTimerRef.current = window.setTimeout(() => {
      setCurrent(index);
      setFading(false);
    }, 110);
  };

  const slide = SLIDES[current] ?? SLIDES[0]!;
  const isLast = current === SLIDES.length - 1;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" && !isLast) {
            e.preventDefault();
            goTo(current + 1);
          } else if (e.key === "ArrowLeft" && current > 0) {
            e.preventDefault();
            goTo(current - 1);
          }
        }}
        className="max-w-lg gap-0 overflow-hidden rounded-xl border-0 bg-background p-0 shadow-workspace sm:rounded-xl"
      >
        <div
          className={cn(
            "min-h-[332px] p-6 pt-7 transition-opacity duration-150 sm:p-7",
            fading ? "opacity-0" : "opacity-100",
          )}
        >
          <div className="mb-5 flex items-center gap-1.5 pr-8">
            {SLIDES.map((s, i) => (
              <button
                key={s.title}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Step ${i + 1}`}
                className={cn(
                  "h-1 rounded-full transition-all duration-200",
                  i === current
                    ? "w-8 bg-foreground"
                    : "w-4 bg-muted-foreground/25 hover:bg-muted-foreground/45",
                )}
              />
            ))}
          </div>

          <DialogHeader className="text-left">
            <DialogTitle className="text-xl font-semibold tracking-tight">{slide.title}</DialogTitle>
            <DialogDescription className="pt-1 text-sm leading-relaxed text-muted-foreground">
              {slide.description}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 space-y-2.5">
            {slide.items.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.text}
                  className="flex items-center gap-3 rounded-lg bg-secondary/45 px-3.5 py-2.5 text-sm text-foreground/90"
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span>{item.text}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border/50 bg-shell/40 px-6 py-3.5">
          {current === 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={dismissGuide}
              className="text-muted-foreground"
            >
              Skip
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => goTo(current - 1)}
              className="text-muted-foreground"
            >
              <ChevronLeft className="size-4" />
              Back
            </Button>
          )}

          <span className="text-xs tabular-nums text-muted-foreground">
            {current + 1} / {SLIDES.length}
          </span>

          {isLast ? (
            <Button type="button" size="sm" onClick={dismissGuide}>
              Get started
              <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button type="button" size="sm" onClick={() => goTo(current + 1)}>
              Next
              <ChevronRight className="size-4" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
