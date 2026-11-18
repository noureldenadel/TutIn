import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  BarChart3,
  Check,
  ChevronDown,
  Cloud,
  Compass,
  Edit3,
  ExternalLink,
  Folder,
  FolderOpen,
  GraduationCap,
  HardDrive,
  History,
  Home,
  Library,
  Link2,
  MoreVertical,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  UploadCloud,
  UsersRound,
  X,
  Youtube,
} from "lucide-react";

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
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Link, useRouterState } from "@tanstack/react-router";
import { cancelAllTranscriptJobs, useTranscriptJobs } from "@/lib/transcript-ai";
import { AiJobTraceCard } from "@/components/shared/ai-job-trace";
import { getLanguageLabel } from "@/lib/languages";
import {
  COURSE_SORT_OPTIONS,
  deleteCourse,
  isDirectLinkCourse,
  openFolderInExplorer,
  sortCourses,
  useCoursesList,
  type Course,
  type CourseSortOption,
} from "@/lib/courses";
import { SettingsModal, type ThemeMode } from "@/components/modals/settings-modal";
import { WelcomeGuideModal } from "@/components/modals/welcome-guide-modal";
import {
  DEFAULT_APP_SETTINGS,
  SETTINGS_CHANGED_EVENT,
  THEME_PRESET_STORAGE_KEY,
  hydrateAppSettingsFromServer,
  isThemePreset,
  isWelcomeGuideSeen,
  readAppSettings,
  readSessionFilters,
  readSessionScroll,
  updateSessionFilters,
  writeAppSettings,
  writeSessionScroll,
  type ThemePreset,
} from "@/lib/app-settings";
import { SyncPreviewModal } from "@/components/modals/sync-preview-modal";
import { EditCourseModal } from "@/components/modals/edit-course-modal";
import { AddCourseModal, type AddCourseSource } from "@/components/modals/add-course-modal";
import { DotLogo } from "@/components/layout/dot-logo";
import { CourseThumbnail } from "@/components/layout/course-thumbnail";
import { InstructorAvatar, normalizeInstructorSlug } from "@/components/layout/instructor-avatar";
import { Toaster, toast } from "sonner";
import { trackExternalCourseOpen } from "@/lib/watch-history";

type StatusFilter = "All" | "In Progress" | "Completed";
const STATUS_FILTERS: readonly StatusFilter[] = ["All", "In Progress", "Completed"];

const navItems = [
  { label: "Home", icon: Home, to: "/" },
  { label: "Instructors", icon: UsersRound, to: "/instructors" },
  { label: "History", icon: History, to: "/history" },
  { label: "Statistics", icon: BarChart3, to: "/analytics" },
  { label: "Roadmap", icon: Compass, to: "/roadmap" },
] as const;

type AppNavRoute = (typeof navItems)[number]["to"];

function getActiveNavIndex(pathname: string): number {
  const idx = navItems.findIndex((item) =>
    item.to === "/"
      ? pathname === "/" ||
        pathname.startsWith("/learn") ||
        pathname.startsWith("/manage") ||
        pathname.startsWith("/canvas")
      : pathname.startsWith(item.to),
  );
  return idx >= 0 ? idx : 0;
}

function DockButton({
  label,
  active = false,
  children,
  onClick,
  to,
}: {
  label: string;
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
  to?: AppNavRoute | undefined;
}) {
  const cls = cn(
    "group/dock relative z-10 size-10 rounded-lg text-muted-foreground shadow-none transition-[color,background-color,transform] duration-150 active:scale-95 [&_svg]:transition-transform [&_svg]:duration-150 group-hover/dock:[&_svg]:scale-105",
    active
      ? "text-foreground max-md:bg-accent hover:bg-transparent max-md:hover:bg-accent hover:text-foreground"
      : "hover:bg-accent/60 hover:text-accent-foreground",
  );
  const mobileActivePill = active ? (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute -bottom-1 left-1/2 h-1 w-4 -translate-x-1/2 rounded-full bg-foreground/70 md:hidden"
    />
  ) : null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {to ? (
          <Button asChild variant="ghost" size="icon" className={cls}>
            <Link to={to} aria-label={label} aria-current={active ? "page" : undefined}>
              {children}
              {mobileActivePill}
            </Link>
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={label}
            aria-pressed={active}
            onClick={onClick}
            className={cls}
          >
            {children}
            {mobileActivePill}
          </Button>
        )}
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={10} className="hidden md:block">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function IconDock({ activeIndex, onSettings }: { activeIndex: number; onSettings: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const jobsMap = useTranscriptJobs();
  const activeJobs = useMemo(
    () => Object.values(jobsMap).filter((j) => j.status === "running" || j.status === "queued"),
    [jobsMap],
  );
  const [celebrating, setCelebrating] = useState(false);
  const [jobsPopoverOpen, setJobsPopoverOpen] = useState(false);
  const prevActiveCountRef = useRef(0);
  const hoverCloseTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const prev = prevActiveCountRef.current;
    const curr = activeJobs.length;
    prevActiveCountRef.current = curr;

    if (prev > 0 && curr === 0) {
      setJobsPopoverOpen(false);
      setCelebrating(true);
      const id = window.setTimeout(() => setCelebrating(false), 2400);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [activeJobs.length]);

  const logoMode =
    activeJobs.length > 0
      ? "thinking"
      : celebrating
        ? "celebrate"
        : pathname.startsWith("/learn")
          ? "playing"
          : "idle";

  const openJobsHover = () => {
    if (hoverCloseTimerRef.current !== null) {
      window.clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
    if (activeJobs.length > 0) {
      setJobsPopoverOpen(true);
    }
  };

  const closeJobsHover = () => {
    if (hoverCloseTimerRef.current !== null) {
      window.clearTimeout(hoverCloseTimerRef.current);
    }
    hoverCloseTimerRef.current = window.setTimeout(() => {
      setJobsPopoverOpen(false);
    }, 180);
  };

  const indicatorStyle = {
    transform: `translate3d(0, calc(${activeIndex} * 3rem), 0)`,
  };

  return (
    <aside
      className="order-2 z-30 flex h-14 w-full shrink-0 select-none flex-row items-center justify-around border-t border-border/50 bg-shell px-2 pb-[env(safe-area-inset-bottom)] md:order-1 md:sticky md:top-0 md:h-dvh md:w-16 md:flex-col md:justify-start md:border-t-0 md:px-0 md:py-4"
      aria-label="Main navigation"
    >
      {activeJobs.length > 0 ? (
        <Popover open={jobsPopoverOpen} onOpenChange={setJobsPopoverOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              onMouseEnter={openJobsHover}
              onMouseLeave={closeJobsHover}
              className="relative flex size-10 shrink-0 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-accent/60"
              aria-label={`Generating subtitles (${activeJobs.length})`}
            >
              <DotLogo mode={logoMode} />
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="right"
            align="start"
            sideOffset={12}
            collisionPadding={12}
            onMouseEnter={openJobsHover}
            onMouseLeave={closeJobsHover}
            className="w-72 rounded-xl border border-border/50 bg-card p-3 shadow-workspace"
          >
            <div className="flex items-center justify-between gap-2 pb-2">
              <span className="ai-shimmer-text truncate text-xs font-semibold">
                AI Tasks ({activeJobs.length})
              </span>
              {activeJobs.length > 1 && (
                <button
                  type="button"
                  onClick={() => cancelAllTranscriptJobs()}
                  className="text-[11px] font-medium text-muted-foreground transition-colors hover:text-destructive"
                >
                  Cancel all
                </button>
              )}
            </div>
            <div className="max-h-64 space-y-1.5 overflow-y-auto custom-scrollbar-sm">
              {activeJobs.map((job) => (
                <AiJobTraceCard
                  key={job.videoId}
                  job={job}
                  compact
                  headerTitle={
                    <div className="min-w-0">
                      <Link
                        to="/learn/$courseId"
                        params={{ courseId: job.courseId }}
                        onClick={() => setJobsPopoverOpen(false)}
                        className="block truncate text-xs font-medium text-foreground hover:text-primary"
                      >
                        {job.videoTitle}
                      </Link>
                      <span className="block truncate text-[10.5px] text-muted-foreground">
                        {job.mode === "transcribe"
                          ? "Transcribe"
                          : job.mode === "dub"
                            ? "Dub"
                            : "Translate"}{" "}
                        · {getLanguageLabel(job.targetLanguage)} ·{" "}
                        {job.mode === "dub" ? "Voice" : "AI"}
                      </span>
                    </div>
                  }
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>
      ) : (
        <Link
          to="/"
          className="hidden size-10 shrink-0 items-center justify-center rounded-lg text-foreground transition-colors hover:text-foreground/70 md:flex"
          aria-label="TutIn home"
        >
          <DotLogo mode={logoMode} />
        </Link>
      )}
      <nav className="contents md:relative md:mt-9 md:flex md:shrink-0 md:flex-col md:gap-2">
        <span
          aria-hidden="true"
          style={indicatorStyle}
          className="pointer-events-none absolute left-0 top-0 hidden size-10 rounded-lg bg-accent transition-transform duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none md:block"
        />
        <span
          aria-hidden="true"
          style={indicatorStyle}
          className="pointer-events-none absolute -left-[13px] top-2.5 hidden h-5 w-1 rounded-full bg-foreground/70 transition-transform duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none md:block"
        />
        {navItems.map((item, idx) => {
          const Icon = item.icon;
          return (
            <DockButton
              key={item.label}
              label={item.label}
              to={item.to}
              active={idx === activeIndex}
            >
              <Icon />
            </DockButton>
          );
        })}
      </nav>
      <div className="contents md:mt-auto md:flex md:shrink-0 md:flex-col md:items-center md:gap-2 md:pt-4">
        <DockButton label="Settings" onClick={onSettings}>
          <Settings />
        </DockButton>
      </div>
    </aside>
  );
}

type CourseSource = "local" | "youtube" | "drive" | "link";

const courseSources = {
  youtube: { label: "YouTube", icon: Youtube, placeholder: "YouTube video or playlist URL" },
  drive: { label: "Google Drive", icon: Cloud, placeholder: "Google Drive folder URL" },
  link: { label: "External link", icon: Link2, placeholder: "Course or video URL" },
} as const;

function AddCourseControl() {
  const [source, setSource] = useState<AddCourseSource | null>(null);

  return (
    <>
      <div className="flex shrink-0 overflow-hidden rounded-lg shadow-card">
        <Button
          size="lg"
          onClick={() => setSource("local")}
          className="rounded-none rounded-l-lg border-r border-primary-foreground/20 px-4"
        >
          <Plus /> Add Course
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="lg"
              aria-label="Course sources"
              className="rounded-none rounded-r-lg px-3"
            >
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 rounded-lg p-1.5 shadow-workspace">
            <DropdownMenuItem onSelect={() => setSource("local")} className="gap-2.5 rounded-md">
              <svg className="size-4 shrink-0 fill-current text-foreground" viewBox="0 0 24 24">
                <path d="M2 6a2 2 0 0 1 2-2h4.586a1 1 0 0 1 .707.293L11.414 6H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6z" />
              </svg>
              Course folder
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setSource("youtube")} className="gap-2.5 rounded-md">
              <svg className="size-4 shrink-0 fill-current text-foreground" viewBox="0 0 24 24">
                <path
                  d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"
                  fillRule="evenodd"
                />
              </svg>
              YouTube
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setSource("drive")} className="gap-2.5 rounded-md">
              <svg className="size-4 shrink-0 fill-current text-foreground" viewBox="0 0 192 192">
                <mask
                  id="a"
                  width="168"
                  height="154"
                  x="12"
                  y="18"
                  maskUnits="userSpaceOnUse"
                  style={{ maskType: "alpha" }}
                >
                  <path
                    fill="#fff"
                    d="M63.09 37c14.626-25.333 51.193-25.334 65.819 0l45.033 78c14.626 25.334-3.657 57.001-32.91 57.001H50.967c-29.253 0-47.536-31.667-32.91-57.001z"
                  />
                </mask>
                <g mask="url(#a)">
                  <path
                    fill="currentColor"
                    opacity="0.9"
                    d="M206.905 172.02h-91.888l-19.015-32.934 45.944-79.578z"
                  />
                  <path
                    fill="currentColor"
                    opacity="0.65"
                    d="M-14.919 172.006 50.04 59.494v.002L31.032 92.422h38.02L115 172.004l-129.918.001z"
                  />
                  <path
                    fill="currentColor"
                    d="M96.007-20.085 141.954 59.5l-19.011 32.928H31.048z"
                  />
                </g>
              </svg>
              Google Drive
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setSource("link")} className="gap-2.5 rounded-md">
              <svg className="size-4 shrink-0 fill-current text-foreground" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
              </svg>
              Direct link
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AddCourseModal
        open={source !== null}
        initialSource={source ?? "local"}
        onOpenChange={(isOpen) => {
          if (!isOpen) setSource(null);
        }}
      />
    </>
  );
}

function CourseMenu({
  course,
  open,
  onOpenChange,
  onRescan,
  onEdit,
}: {
  course: Course;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRescan?: ((course: Course) => void) | undefined;
  onEdit?: ((course: Course) => void) | undefined;
}) {
  const isDirectLink = isDirectLinkCourse(course);
  const isLocal = course.sourceType === "local";
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleRescan = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRescan) {
      onRescan(course);
    } else {
      window.dispatchEvent(new CustomEvent("tutin:rescan_course", { detail: { course } }));
    }
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onEdit) {
      onEdit(course);
    } else {
      window.dispatchEvent(new CustomEvent("tutin:edit_course", { detail: { course } }));
    }
  };

  const handleShowInExplorer = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!course.folderPath) {
      toast.error("Course folder path is unavailable");
      return;
    }
    const ok = await openFolderInExplorer(course.folderPath);
    if (!ok) {
      toast.error("Folder not found on disk");
    }
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteCourse(course.id);
      toast.success("Course deleted");
      setConfirmDeleteOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete course");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <DropdownMenu open={open} onOpenChange={onOpenChange} modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Course actions"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg bg-card/85 text-foreground backdrop-blur-md opacity-0 transition-[opacity,background-color,transform] duration-200 hover:bg-card active:scale-95 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 group-data-[menu-open=true]:opacity-100 data-[state=open]:bg-card data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100 dark:bg-white/15 dark:text-white dark:hover:bg-white/25 dark:data-[state=open]:bg-white/25 [&_svg]:size-4"
          >
            <MoreVertical />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={6}
          onClick={(e) => e.stopPropagation()}
          className="w-48 rounded-lg p-1.5 shadow-workspace"
        >
          {isDirectLink ? (
            <>
              {course.courseUrl && (
                <DropdownMenuItem asChild className="rounded-md">
                  <a
                    href={course.courseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => trackExternalCourseOpen(String(course.id))}
                  >
                    <ExternalLink className="size-4" /> Open link
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem className="rounded-md cursor-pointer" onClick={handleEdit}>
                <Pencil className="size-4" /> Edit details
              </DropdownMenuItem>
              <DropdownMenuItem
                className="rounded-md text-destructive focus:text-destructive cursor-pointer"
                onClick={handleDeleteClick}
              >
                <Trash2 className="size-4" /> Delete
              </DropdownMenuItem>
            </>
          ) : (
            <>
              <DropdownMenuItem asChild className="rounded-md">
                <Link to="/manage/$courseId" params={{ courseId: String(course.id) }}>
                  <Edit3 className="size-4" /> Curriculum
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem className="rounded-md cursor-pointer" onClick={handleEdit}>
                <Pencil className="size-4" /> Edit details
              </DropdownMenuItem>
              {isLocal && (
                <DropdownMenuItem className="rounded-md cursor-pointer" onClick={handleRescan}>
                  <RefreshCw className="size-4" /> Rescan folder
                </DropdownMenuItem>
              )}
              {course.folderPath && (
                <DropdownMenuItem
                  className="rounded-md cursor-pointer"
                  onClick={handleShowInExplorer}
                >
                  <FolderOpen className="size-4" /> Show in Explorer
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                className="rounded-md text-destructive focus:text-destructive cursor-pointer"
                onClick={handleDeleteClick}
              >
                <Trash2 className="size-4" /> Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{course.title}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              Course and local study data will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmDelete();
              }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function CourseCard({
  course,
  onRescan,
  onEdit,
}: {
  course: Course;
  onRescan?: ((course: Course) => void) | undefined;
  onEdit?: ((course: Course) => void) | undefined;
}) {
  const completed = course.completedVideos ?? Math.round((course.lessons * course.progress) / 100);
  const isComplete = course.completionPercentage >= 100;
  const isDirectLink = isDirectLinkCourse(course);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuGrace, setMenuGrace] = useState(false);
  const menuTimerRef = useRef<number | null>(null);

  const handleMenuOpenChange = (nextOpen: boolean) => {
    if (menuTimerRef.current !== null) {
      window.clearTimeout(menuTimerRef.current);
      menuTimerRef.current = null;
    }
    setMenuOpen(nextOpen);
    if (nextOpen) {
      setMenuGrace(true);
    } else {
      // Keep hovered state through menu exit animation so Escape does not drop & re-hover
      menuTimerRef.current = window.setTimeout(() => {
        setMenuGrace(false);
        menuTimerRef.current = null;
      }, 170);
    }
  };

  useEffect(() => {
    return () => {
      if (menuTimerRef.current !== null) {
        window.clearTimeout(menuTimerRef.current);
      }
    };
  }, []);

  return (
    <article
      data-menu-open={menuGrace ? "true" : undefined}
      onDragStart={(e) => e.preventDefault()}
      className="group relative flex h-full min-w-0 select-none flex-col overflow-hidden rounded-xl bg-card shadow-card transition-transform duration-300 hover:-translate-y-1 data-[menu-open=true]:-translate-y-1"
    >
      {isDirectLink ? (
        <a
          href={course.courseUrl}
          target="_blank"
          rel="noopener noreferrer"
          draggable={false}
          onClick={() => trackExternalCourseOpen(String(course.id))}
          className="absolute inset-0 z-10 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label={`Open ${course.title} in new tab`}
          title={course.title}
        />
      ) : (
        <Link
          draggable={false}
          className="absolute inset-0 z-10 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          to="/learn/$courseId"
          params={{ courseId: String(course.id) }}
          aria-label={`Open ${course.title}`}
          title={course.title}
        />
      )}
      <div className="relative aspect-video overflow-hidden">
        {/* Thumbnail with smooth 700ms hover zoom */}
        <div className="size-full transition-transform duration-700 ease-out group-hover:scale-105 group-data-[menu-open=true]:scale-105">
          <CourseThumbnail course={course} />
        </div>

        {/* Soft Dimming Overlay on Hover */}
        <div className="pointer-events-none absolute inset-0 bg-black/30 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-data-[menu-open=true]:opacity-100" />

        {/* Play/Open Floating Overlay (Clean glassmorphic button with zero hard shadows) */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="size-14 rounded-full flex items-center justify-center bg-card/85 dark:bg-white/10 opacity-0 scale-90 backdrop-blur-md transition-all duration-200 ease-out group-hover:scale-100 group-hover:opacity-100 group-data-[menu-open=true]:scale-100 group-data-[menu-open=true]:opacity-100">
            {isDirectLink ? (
              <Link2 className="size-6 text-foreground dark:text-white" />
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-6 translate-x-[0.5px] text-foreground dark:text-white"
                aria-hidden="true"
              >
                <polygon points="6 3 20 12 6 21 6 3" />
              </svg>
            )}
          </div>
        </div>

        <div className="absolute right-3 top-3 z-20">
          <CourseMenu
            course={course}
            open={menuOpen}
            onOpenChange={handleMenuOpenChange}
            onRescan={onRescan}
            onEdit={onEdit}
          />
        </div>

        <span className="duration-badge-text pointer-events-none absolute bottom-3 right-3 z-20 inline-flex h-5 items-center justify-center rounded-sm bg-black/70 px-1.5 font-mono text-[10px] font-medium tabular-nums text-white backdrop-blur-md">
          {course.duration}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <h2
          className="truncate text-base font-semibold leading-6 text-foreground transition-colors duration-200 group-hover:text-foreground/80 group-data-[menu-open=true]:text-foreground/80 dark:group-hover:text-white dark:group-data-[menu-open=true]:text-white sm:text-lg sm:leading-7"
          title={course.title}
        >
          {course.title}
        </h2>
        {course.instructor.trim() ? (
          <div className="mt-2.5 flex items-center sm:mt-3">
            <Link
              to="/instructors"
              search={{ instructor: normalizeInstructorSlug(course.instructor) }}
              onClick={(e) => e.stopPropagation()}
              className="relative z-20 inline-flex min-w-0 max-w-full items-center gap-2.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title={`View ${course.instructor}`}
            >
              <InstructorAvatar name={course.instructor} course={course} size="sm" />
              <span className="truncate">{course.instructor}</span>
            </Link>
          </div>
        ) : null}
        <div className="mt-auto pt-4 sm:pt-5">
          <div className="h-1.5 overflow-hidden rounded-sm bg-secondary">
            <div
              className={cn(
                "h-full transition-colors",
                isComplete ? "bg-chart-4" : "bg-foreground/55",
              )}
              style={{ width: `${course.progress}%` }}
            />
          </div>
          <div className="mt-2.5 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {completed} / {course.lessons} lessons
            </span>
            <span
              className={cn("font-semibold", isComplete ? "text-chart-4" : "text-foreground/75")}
            >
              {course.progress}%
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

function EmptyState({ clear }: { clear: () => void }) {
  return (
    <div className="col-span-full flex min-h-96 flex-col items-center justify-center rounded-xl bg-secondary/40 px-6 py-14 text-center">
      <Library className="size-10 text-muted-foreground" strokeWidth={1.5} />
      <h2 className="mt-5 text-lg font-semibold">No courses found</h2>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
        No courses match this view.
      </p>
      <Button variant="secondary" className="mt-6 rounded-md" onClick={clear}>
        Clear filters
      </Button>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeNavIndex = getActiveNavIndex(pathname);
  const fixedViewport =
    pathname === "/roadmap" || pathname.startsWith("/roadmap/") || pathname.startsWith("/canvas/");
  const mainRef = useRef<HTMLElement>(null);
  const [navMotion, setNavMotion] = useState({
    pathname,
    navIndex: activeNavIndex,
    transitionClass: "",
  });

  if (navMotion.pathname !== pathname) {
    const transitionClass = fixedViewport
      ? "animate-page-fade"
      : activeNavIndex > navMotion.navIndex
        ? "animate-page-enter-down"
        : activeNavIndex < navMotion.navIndex
          ? "animate-page-enter-up"
          : "animate-page-fade";
    setNavMotion({ pathname, navIndex: activeNavIndex, transitionClass });
  }

  useLayoutEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    if (fixedViewport || pathname.startsWith("/learn/")) {
      el.scrollTo({ top: 0 });
      return;
    }
    const saved = readSessionScroll(`page:${pathname}`);
    el.scrollTo({ top: saved ?? 0 });
  }, [fixedViewport, pathname]);

  const [dark, setDark] = useState(false);
  const [mode, setMode] = useState<ThemeMode>("system");
  const [themePreset, setThemePreset] = useState<ThemePreset>(DEFAULT_APP_SETTINGS.themePreset);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [rescanCourse, setRescanCourse] = useState<Course | null>(null);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const themeTimerRef = useRef<number | null>(null);

  const triggerThemeTransition = () => {
    const root = document.documentElement;
    if (themeTimerRef.current !== null) {
      window.clearTimeout(themeTimerRef.current);
    }
    root.classList.add("theme-transitioning");
    themeTimerRef.current = window.setTimeout(() => {
      root.classList.remove("theme-transitioning");
      themeTimerRef.current = null;
    }, 320);
  };

  useEffect(() => {
    const syncThemeDom = (themeMode: ThemeMode, preset: ThemePreset) => {
      const isDark =
        themeMode === "system"
          ? window.matchMedia("(prefers-color-scheme: dark)").matches
          : themeMode === "dark";
      setMode(themeMode);
      setDark(isDark);
      setThemePreset(preset);
      document.documentElement.classList.toggle("dark", isDark);
      document.documentElement.dataset["themePreset"] = preset;
    };

    const currentSettings = readAppSettings();
    const stored = window.localStorage.getItem("tutin-theme");
    const initialMode: ThemeMode =
      stored === "dark" || stored === "light" ? stored : currentSettings.theme;
    const storedPreset = window.localStorage.getItem(THEME_PRESET_STORAGE_KEY);
    const initialPreset: ThemePreset = isThemePreset(storedPreset)
      ? storedPreset
      : currentSettings.themePreset;
    syncThemeDom(initialMode, initialPreset);

    if (!isWelcomeGuideSeen()) {
      setWelcomeOpen(true);
    }

    void hydrateAppSettingsFromServer().then((hydrated) => {
      syncThemeDom(hydrated.theme, hydrated.themePreset);
      setWelcomeOpen(!isWelcomeGuideSeen());
    });
  }, []);

  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemThemeChange = (e: MediaQueryListEvent) => {
      const root = document.documentElement;
      if (root.classList.contains("dark") !== e.matches) {
        triggerThemeTransition();
      }
      setDark(e.matches);
      root.classList.toggle("dark", e.matches);
    };
    mq.addEventListener("change", onSystemThemeChange);
    return () => mq.removeEventListener("change", onSystemThemeChange);
  }, [mode]);

  useEffect(() => {
    const onRescanEvent = (e: Event) => {
      const custom = e as CustomEvent<{ course: Course }>;
      if (custom.detail?.course) {
        setRescanCourse(custom.detail.course);
      }
    };
    const onEditEvent = (e: Event) => {
      const custom = e as CustomEvent<{ course: Course }>;
      if (custom.detail?.course) {
        setEditingCourse(custom.detail.course);
      }
    };
    window.addEventListener("tutin:rescan_course", onRescanEvent);
    window.addEventListener("tutin:edit_course", onEditEvent);
    return () => {
      window.removeEventListener("tutin:rescan_course", onRescanEvent);
      window.removeEventListener("tutin:edit_course", onEditEvent);
    };
  }, []);

  const applyMode = (next: ThemeMode) => {
    const isDark =
      next === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
        : next === "dark";
    const root = document.documentElement;
    if (root.classList.contains("dark") !== isDark) {
      triggerThemeTransition();
    }

    setMode(next);
    setDark(isDark);
    root.classList.toggle("dark", isDark);
    if (next === "system") window.localStorage.removeItem("tutin-theme");
    else window.localStorage.setItem("tutin-theme", next);
    writeAppSettings({ ...readAppSettings(), theme: next });
  };

  const applyThemePreset = (next: ThemePreset) => {
    const root = document.documentElement;
    if (root.dataset["themePreset"] !== next) {
      triggerThemeTransition();
    }
    setThemePreset(next);
    root.dataset["themePreset"] = next;
    window.localStorage.setItem(THEME_PRESET_STORAGE_KEY, next);
    writeAppSettings({ ...readAppSettings(), themePreset: next });
  };

  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex h-dvh flex-col overflow-hidden bg-shell text-foreground md:flex-row">
        <IconDock activeIndex={activeNavIndex} onSettings={() => setSettingsOpen(true)} />
        <SettingsModal
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          theme={mode}
          isDark={dark}
          onThemeChange={applyMode}
          themePreset={themePreset}
          onThemePresetChange={applyThemePreset}
          onOpenWelcomeGuide={() => setWelcomeOpen(true)}
        />
        <WelcomeGuideModal open={welcomeOpen} onOpenChange={setWelcomeOpen} />
        <SyncPreviewModal
          open={Boolean(rescanCourse)}
          onOpenChange={(isOpen) => !isOpen && setRescanCourse(null)}
          course={rescanCourse}
        />
        <EditCourseModal
          open={Boolean(editingCourse)}
          onOpenChange={(isOpen) => !isOpen && setEditingCourse(null)}
          course={editingCourse}
        />
        <main
          ref={mainRef}
          onScroll={(e) => {
            if (fixedViewport || pathname.startsWith("/learn/")) return;
            writeSessionScroll(`page:${pathname}`, e.currentTarget.scrollTop);
          }}
          className={cn(
            "order-1 min-h-0 min-w-0 flex-1 bg-background md:order-2 md:h-dvh md:border-l md:border-border/50",
            fixedViewport
              ? "overflow-hidden"
              : "overflow-y-auto overflow-x-hidden custom-scrollbar",
          )}
        >
          <div
            key={pathname}
            className={cn(fixedViewport ? "h-full" : "min-h-full", navMotion.transitionClass)}
          >
            {children}
          </div>
        </main>
        <Toaster />
      </div>
    </TooltipProvider>
  );
}

export function CourseSortDropdown({
  sort,
  onSortChange,
}: {
  sort: CourseSortOption;
  onSortChange: (next: CourseSortOption) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="rounded-md text-muted-foreground hover:text-foreground"
        >
          {sort} <ChevronDown className="ml-1 size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="rounded-lg p-1.5 shadow-workspace">
        {COURSE_SORT_OPTIONS.map((item) => (
          <DropdownMenuItem key={item} onClick={() => onSortChange(item)} className="rounded-md">
            {item}
            {sort === item && <Check className="ml-auto" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function HomePage() {
  const [filter, setFilter] = useState<string>(() => readSessionFilters().homeFilter || "All");
  const [sort, setSort] = useState<CourseSortOption>(() => readAppSettings().librarySort);
  const [query, setQuery] = useState(() => readSessionFilters().homeQuery ?? "");
  const searchRef = useRef<HTMLInputElement>(null);
  const filterScrollRef = useRef<HTMLDivElement>(null);
  const filterTrackRef = useRef<HTMLDivElement>(null);
  const tabButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const filterDragRef = useRef<{ startX: number; startScrollLeft: number; moved: boolean } | null>(
    null,
  );
  const suppressFilterClickRef = useRef(false);
  const didMountFilterRef = useRef(false);
  const [isDraggingFilters, setIsDraggingFilters] = useState(false);
  const [filterScrollEdges, setFilterScrollEdges] = useState({ left: false, right: false });
  const [tabIndicator, setTabIndicator] = useState({ left: 0, width: 0, ready: false });
  const { courses: allCourses, isLoading, error } = useCoursesList();

  useEffect(() => {
    const syncLibrarySort = () => {
      setSort(readAppSettings().librarySort);
    };
    window.addEventListener(SETTINGS_CHANGED_EVENT, syncLibrarySort);
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, syncLibrarySort);
  }, []);

  useEffect(() => {
    updateSessionFilters({ homeFilter: filter, homeQuery: query });
  }, [filter, query]);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const course of allCourses) {
      for (const tag of course.tags ?? []) {
        const trimmed = tag.trim();
        if (trimmed) tagSet.add(trimmed);
      }
    }
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
  }, [allCourses]);

  useEffect(() => {
    if (
      !isLoading &&
      allCourses.length > 0 &&
      !(STATUS_FILTERS as readonly string[]).includes(filter) &&
      !allTags.includes(filter)
    ) {
      setFilter("All");
    }
  }, [allCourses.length, allTags, filter, isLoading]);

  const updateFilterScrollEdges = useCallback(() => {
    const el = filterScrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    const left = el.scrollLeft > 4;
    const right = maxScroll > 4 && el.scrollLeft < maxScroll - 4;
    setFilterScrollEdges((prev) =>
      prev.left === left && prev.right === right ? prev : { left, right },
    );
  }, []);

  const measureActiveTab = useCallback(() => {
    const btn = tabButtonRefs.current.get(filter);
    if (!btn) {
      setTabIndicator((prev) =>
        prev.width === 0 ? prev : { left: 0, width: 0, ready: prev.ready },
      );
      return;
    }
    const left = btn.offsetLeft;
    const width = btn.offsetWidth;
    setTabIndicator((prev) => {
      if (prev.left === left && prev.width === width && prev.ready) return prev;
      return { left, width, ready: prev.width > 0 ? true : prev.ready };
    });
  }, [filter]);

  useLayoutEffect(() => {
    measureActiveTab();
    updateFilterScrollEdges();

    if (!didMountFilterRef.current) {
      didMountFilterRef.current = true;
      const rafId = window.requestAnimationFrame(() => {
        setTabIndicator((prev) =>
          prev.ready || prev.width === 0 ? prev : { ...prev, ready: true },
        );
      });
      return () => window.cancelAnimationFrame(rafId);
    }

    const scrollEl = filterScrollRef.current;
    const activeBtn = tabButtonRefs.current.get(filter);
    if (scrollEl && activeBtn && scrollEl.scrollWidth > scrollEl.clientWidth + 2) {
      const btnLeft = activeBtn.offsetLeft;
      const btnRight = btnLeft + activeBtn.offsetWidth;
      const viewLeft = scrollEl.scrollLeft;
      const viewRight = viewLeft + scrollEl.clientWidth;
      const edgePad = 36;
      if (btnLeft < viewLeft + edgePad) {
        scrollEl.scrollTo({ left: Math.max(0, btnLeft - edgePad), behavior: "smooth" });
      } else if (btnRight > viewRight - edgePad) {
        scrollEl.scrollTo({
          left: btnRight - scrollEl.clientWidth + edgePad,
          behavior: "smooth",
        });
      }
    }
    return undefined;
  }, [filter, allTags, measureActiveTab, updateFilterScrollEdges]);

  useEffect(() => {
    const scrollEl = filterScrollRef.current;
    const trackEl = filterTrackRef.current;
    if (!scrollEl || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      updateFilterScrollEdges();
      measureActiveTab();
    });
    ro.observe(scrollEl);
    if (trackEl) ro.observe(trackEl);
    return () => ro.disconnect();
  }, [updateFilterScrollEdges, measureActiveTab]);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const drag = filterDragRef.current;
      const el = filterScrollRef.current;
      if (!drag || !el) return;
      const dx = e.clientX - drag.startX;
      if (!drag.moved && Math.abs(dx) > 4) {
        drag.moved = true;
        suppressFilterClickRef.current = true;
        setIsDraggingFilters(true);
      }
      if (drag.moved) {
        el.scrollLeft = drag.startScrollLeft - dx;
      }
    };

    const onPointerUp = () => {
      if (!filterDragRef.current) return;
      const wasMoved = filterDragRef.current.moved;
      filterDragRef.current = null;
      setIsDraggingFilters(false);
      if (wasMoved) {
        window.setTimeout(() => {
          suppressFilterClickRef.current = false;
        }, 0);
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, []);

  const canScrollFilters = filterScrollEdges.left || filterScrollEdges.right;
  const filterMaskImage =
    filterScrollEdges.left && filterScrollEdges.right
      ? "linear-gradient(to right, transparent 0, #000 32px, #000 calc(100% - 32px), transparent 100%)"
      : filterScrollEdges.left
        ? "linear-gradient(to right, transparent 0, #000 32px, #000 100%)"
        : filterScrollEdges.right
          ? "linear-gradient(to right, #000 0, #000 calc(100% - 32px), transparent 100%)"
          : undefined;

  const visibleCourses = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = allCourses.filter((course) => {
      const isCompleted = course.completionPercentage >= 100;
      const isInProgress =
        !isCompleted && (course.completionPercentage > 0 || course.completedVideos > 0);
      const matchesFilter =
        filter === "All"
          ? true
          : filter === "Completed"
            ? isCompleted
            : filter === "In Progress"
              ? isInProgress
              : Boolean(course.tags?.some((t) => t.trim() === filter));
      const matchesQuery =
        !q ||
        `${course.title} ${course.instructor} ${(course.tags ?? []).join(" ")}`
          .toLowerCase()
          .includes(q);
      return matchesFilter && matchesQuery;
    });
    return sortCourses(filtered, sort);
  }, [allCourses, filter, query, sort]);

  return (
    <div className="mx-auto max-w-[1440px] px-4 pb-8 pt-4 sm:px-8 sm:pb-12 sm:pt-8 lg:px-10">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg bg-secondary/75 px-3 transition-colors focus-within:bg-card focus-within:ring-2 focus-within:ring-ring/30 sm:h-11 sm:w-64 lg:w-80">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Search courses"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </label>
          <AddCourseControl />
        </div>
      </header>

      <div className="mt-4 flex items-center justify-between gap-2 border-b border-border/50 pb-3 sm:mt-5 sm:gap-3">
        <div
          ref={filterScrollRef}
          onScroll={updateFilterScrollEdges}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            const el = filterScrollRef.current;
            if (!el || el.scrollWidth <= el.clientWidth + 2) return;
            filterDragRef.current = {
              startX: e.clientX,
              startScrollLeft: el.scrollLeft,
              moved: false,
            };
          }}
          onClickCapture={(e) => {
            if (!suppressFilterClickRef.current) return;
            e.preventDefault();
            e.stopPropagation();
            suppressFilterClickRef.current = false;
          }}
          className={cn(
            "min-w-0 flex-1 overflow-x-auto scrollbar-none",
            canScrollFilters && (isDraggingFilters ? "cursor-grabbing select-none" : "cursor-grab"),
          )}
          style={
            filterMaskImage
              ? { WebkitMaskImage: filterMaskImage, maskImage: filterMaskImage }
              : undefined
          }
        >
          <div
            ref={filterTrackRef}
            role="tablist"
            aria-label="Course filters"
            className="relative inline-flex h-11 select-none items-center gap-1 rounded-lg bg-secondary/75 p-1"
          >
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute top-1 bottom-1 left-0 rounded-sm bg-card dark:bg-accent",
                tabIndicator.ready &&
                  "transition-[transform,width] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
              )}
              style={{
                width: `${tabIndicator.width}px`,
                transform: `translate3d(${tabIndicator.left}px, 0, 0)`,
                opacity: tabIndicator.width > 0 ? 1 : 0,
              }}
            />
            {STATUS_FILTERS.map((item) => (
              <button
                key={item}
                ref={(el) => {
                  if (el) tabButtonRefs.current.set(item, el);
                  else tabButtonRefs.current.delete(item);
                }}
                type="button"
                role="tab"
                aria-selected={filter === item}
                onClick={() => setFilter(item)}
                className={cn(
                  "relative z-10 inline-flex h-9 shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-sm px-3.5 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-4 sm:text-sm",
                  filter === item
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item}
              </button>
            ))}
            {allTags.length > 0 && (
              <span
                className="relative z-10 mx-1 h-4 w-px shrink-0 bg-border/60"
                aria-hidden="true"
              />
            )}
            {allTags.map((tag) => (
              <button
                key={tag}
                ref={(el) => {
                  if (el) tabButtonRefs.current.set(tag, el);
                  else tabButtonRefs.current.delete(tag);
                }}
                type="button"
                role="tab"
                aria-selected={filter === tag}
                onClick={() => setFilter(filter === tag ? "All" : tag)}
                className={cn(
                  "relative z-10 inline-flex h-9 shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-sm px-3.5 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-4 sm:text-sm",
                  filter === tag
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end">
          <CourseSortDropdown
            sort={sort}
            onSortChange={(nextSort) => {
              setSort(nextSort);
              writeAppSettings({ ...readAppSettings(), librarySort: nextSort });
            }}
          />
        </div>
      </div>

      {error ? (
        <div className="mt-8 rounded-xl bg-destructive/10 p-6 text-sm text-destructive">
          Failed to connect to TutIn server: {error}
        </div>
      ) : isLoading && allCourses.length === 0 ? (
        <div className="mt-16 flex items-center justify-center text-sm text-muted-foreground">
          Loading courses…
        </div>
      ) : (
        <section
          className="mt-5 grid gap-4 sm:mt-8 sm:gap-5 md:grid-cols-2 xl:grid-cols-4"
          aria-label="Course library"
        >
          {visibleCourses.length ? (
            visibleCourses.map((course) => <CourseCard key={course.id} course={course} />)
          ) : (
            <EmptyState
              clear={() => {
                setQuery("");
                setFilter("All");
              }}
            />
          )}
        </section>
      )}
    </div>
  );
}
