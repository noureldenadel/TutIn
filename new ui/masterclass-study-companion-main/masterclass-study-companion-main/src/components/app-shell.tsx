import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  Moon,
  MoreHorizontal,
  Palette,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sun,
  Trash2,
  UploadCloud,
  UsersRound,
  Youtube,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Link, useRouterState } from "@tanstack/react-router";
import { courses, type Course } from "@/lib/courses";
import { SettingsModal, type ThemeMode } from "@/components/settings-modal";
import { DotLogo } from "@/components/dot-logo";
import { CourseThumbnail } from "@/components/course-thumbnail";
import { InstructorAvatar } from "@/components/instructor-avatar";
import { Toaster } from "@/components/ui/sonner";

type Filter = "All" | "In Progress" | "Completed";

const navItems = [
  { label: "Home", icon: Home, to: "/" },
  { label: "Instructors", icon: UsersRound, to: "/instructors" },
  { label: "History", icon: History, to: "/history" },
  { label: "Analytics", icon: BarChart3, to: "/analytics" },
  { label: "Roadmap", icon: Compass, to: "/roadmap" },
  { label: "Admin", icon: Palette, to: "/admin" },
] as const;

function DockButton({ label, active = false, children, onClick, to }: { label: string; active?: boolean; children: ReactNode; onClick?: () => void; to?: any }) {
  const cls = cn("relative size-10 rounded-lg text-muted-foreground shadow-none hover:bg-accent hover:text-accent-foreground", active && "bg-accent text-foreground hover:bg-accent");
  const inner = <>{active && <span className="absolute -left-[13px] h-5 w-1 rounded-full bg-foreground/70" />}{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {to ? (
          <Button asChild variant="ghost" size="icon" className={cls}><Link to={to} aria-label={label} aria-current={active ? "page" : undefined}>{inner}</Link></Button>
        ) : (
          <Button type="button" variant="ghost" size="icon" aria-label={label} aria-pressed={active} onClick={onClick} className={cls}>{inner}</Button>
        )}
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={10}>{label}</TooltipContent>
    </Tooltip>
  );
}

function IconDock({ dark, onThemeToggle, onSettings }: { dark: boolean; onThemeToggle: () => void; onSettings: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <aside className="sticky top-0 flex h-dvh w-16 shrink-0 flex-col items-center py-3 sm:py-4 select-none z-30" aria-label="Main navigation">
      <Link to="/" className="flex size-10 items-center justify-center rounded-lg text-foreground transition-colors hover:text-foreground/70 shrink-0" aria-label="TutIn home"><DotLogo mode={pathname.startsWith("/learn") ? "playing" : "idle"} /></Link>
      <nav className="mt-9 flex flex-col gap-2 shrink-0">
        {navItems.map((item) => { const Icon = item.icon; const to = "to" in item ? item.to : undefined; const active = to === "/" ? pathname === "/" || pathname.startsWith("/learn") || pathname.startsWith("/manage") : to ? pathname.startsWith(to) : false; return <DockButton key={item.label} label={item.label} to={to} active={active}><Icon /></DockButton>; })}
      </nav>
      <div className="mt-auto flex flex-col items-center gap-2 shrink-0 pt-4">
        <DockButton label={dark ? "Light theme" : "Dark theme"} onClick={onThemeToggle}>{dark ? <Sun /> : <Moon />}</DockButton>
        <DockButton label="Settings" onClick={onSettings}><Settings /></DockButton>
        <Tooltip>
          <TooltipTrigger asChild><div className="mt-2 flex size-9 cursor-default items-center justify-center" aria-label="Local storage is healthy"><span className="relative size-2.5 rounded-full bg-muted-foreground shadow-status"><span className="absolute inset-0 animate-ping rounded-full bg-muted-foreground opacity-30 motion-reduce:animate-none" /></span></div></TooltipTrigger>
          <TooltipContent side="right" sideOffset={10}>Stored locally · 12.4 GB free</TooltipContent>
        </Tooltip>
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<CourseSource | null>(null);
  const remoteSource = source && source !== "local" ? courseSources[source] : null;

  return (
    <>
       <div className="flex shrink-0 overflow-hidden rounded-lg shadow-card">
         <Button size="lg" onClick={() => setSource("local")} className="rounded-none rounded-l-lg border-r border-primary-foreground/20 px-4"><Plus /> Add Course</Button>
        <DropdownMenu>
           <DropdownMenuTrigger asChild><Button size="lg" aria-label="Course sources" className="rounded-none rounded-r-lg px-3"><ChevronDown /></Button></DropdownMenuTrigger>
           <DropdownMenuContent align="end" className="w-48 rounded-lg p-1.5 shadow-workspace">
             <DropdownMenuItem onSelect={() => setSource("local")} className="gap-2.5 rounded-md">
               <svg className="size-4 shrink-0 fill-current text-foreground" viewBox="0 0 24 24">
                 <path d="M2 6a2 2 0 0 1 2-2h4.586a1 1 0 0 1 .707.293L11.414 6H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6z" />
               </svg>
               Course folder
             </DropdownMenuItem>
             <DropdownMenuItem onSelect={() => setSource("youtube")} className="gap-2.5 rounded-md">
               <svg className="size-4 shrink-0 fill-current text-foreground" viewBox="0 0 24 24">
                 <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" fillRule="evenodd" />
               </svg>
               YouTube
             </DropdownMenuItem>
             <DropdownMenuItem onSelect={() => setSource("drive")} className="gap-2.5 rounded-md">
               <svg className="size-4 shrink-0 fill-current text-foreground" viewBox="0 0 192 192">
                 <mask id="a" width="168" height="154" x="12" y="18" maskUnits="userSpaceOnUse" style={{ maskType: "alpha" }}>
                   <path fill="#fff" d="M63.09 37c14.626-25.333 51.193-25.334 65.819 0l45.033 78c14.626 25.334-3.657 57.001-32.91 57.001H50.967c-29.253 0-47.536-31.667-32.91-57.001z" />
                 </mask>
                 <g mask="url(#a)">
                   <path fill="currentColor" opacity="0.9" d="M206.905 172.02h-91.888l-19.015-32.934 45.944-79.578z" />
                   <path fill="currentColor" opacity="0.65" d="M-14.919 172.006 50.04 59.494v.002L31.032 92.422h38.02L115 172.004l-129.918.001z" />
                   <path fill="currentColor" d="M96.007-20.085 141.954 59.5l-19.011 32.928H31.048z" />
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

      <Dialog open={source !== null} onOpenChange={(open) => { if (!open) setSource(null); }}>
         <DialogContent className="max-w-xl rounded-xl border-border bg-card p-7 shadow-workspace sm:rounded-xl">
          {source === "local" ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl">Add local course</DialogTitle>
                <DialogDescription className="leading-6">Files stay on this device.</DialogDescription>
              </DialogHeader>
               <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} className="mt-3 flex min-h-52 h-auto w-full flex-col rounded-lg border-dashed bg-secondary/50 px-6 text-center shadow-none hover:bg-secondary">
                <UploadCloud className="size-9 text-muted-foreground" />
                <span className="mt-3 font-semibold">Choose folder</span>
                <span className="mt-1 text-sm font-normal text-muted-foreground">Videos, audio, subtitles, or PDFs</span>
              </Button>
              <input ref={inputRef} type="file" multiple accept="video/*,audio/*,.srt,.vtt,.pdf" className="sr-only" />
            </>
          ) : remoteSource ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-xl"><remoteSource.icon className="size-5" /> Import {remoteSource.label}</DialogTitle>
                <DialogDescription className="leading-6">Import lessons from URL.</DialogDescription>
              </DialogHeader>
               <label className="mt-3 grid gap-2 text-sm font-medium">Course link<input type="url" autoFocus placeholder={remoteSource.placeholder} className="h-12 rounded-lg border border-input bg-background px-4 font-normal outline-none transition-shadow placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" /></label>
              <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setSource(null)}>Cancel</Button><Button>Import course</Button></div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
function CourseMenu({ course }: { course: Course }) {
  const isDirectLink = course.sourceType === "link" || Boolean(course.courseUrl);

  return (
    <DropdownMenu>
       <DropdownMenuTrigger asChild>
         <Button
           variant="ghost"
           size="icon"
           aria-label="Course actions"
           className="size-8 shrink-0 rounded-md border border-border/40 bg-card/85 text-foreground backdrop-blur-md shadow-sm transition-colors hover:bg-card hover:text-foreground"
         >
           <MoreHorizontal className="size-4" />
         </Button>
       </DropdownMenuTrigger>
       <DropdownMenuContent align="end" className="w-48 rounded-lg p-1.5 shadow-workspace">
         {isDirectLink ? (
           <>
             {course.courseUrl && (
               <DropdownMenuItem asChild className="rounded-md">
                 <a href={course.courseUrl} target="_blank" rel="noopener noreferrer">
                   <ExternalLink /> Open link
                 </a>
               </DropdownMenuItem>
             )}
             <DropdownMenuItem className="rounded-md text-destructive focus:text-destructive">
               <Trash2 /> Delete
             </DropdownMenuItem>
           </>
         ) : (
           <>
             <DropdownMenuItem asChild className="rounded-md">
               <Link to="/manage/$courseId" params={{ courseId: String(course.id) }}>
                 <Edit3 /> Curriculum
               </Link>
             </DropdownMenuItem>
             <DropdownMenuItem className="rounded-md"><RefreshCw /> Rescan folder</DropdownMenuItem>
             <DropdownMenuItem className="rounded-md"><FolderOpen /> Show in Explorer</DropdownMenuItem>
             <DropdownMenuItem className="rounded-md text-destructive focus:text-destructive">
               <Trash2 /> Delete
             </DropdownMenuItem>
           </>
         )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function CourseCard({ course }: { course: Course }) {
  const completed = Math.round((course.lessons * course.progress) / 100);
  const isDirectLink = course.sourceType === "link" || Boolean(course.courseUrl);

  return (
     <article className="group relative min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-card transition-transform duration-300 hover:-translate-y-1">
       {isDirectLink ? (
         <a
           href={course.courseUrl}
           target="_blank"
           rel="noopener noreferrer"
           className="absolute inset-0 z-10 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
           aria-label={`Open ${course.title} in new tab`}
           title={course.title}
         />
       ) : (
         <Link
           className="absolute inset-0 z-10 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
           to="/learn/$courseId"
           params={{ courseId: String(course.id) }}
           aria-label={`Open ${course.title}`}
           title={course.title}
         />
       )}
      <div className="relative aspect-video overflow-hidden">
        {/* Thumbnail with smooth 700ms hover zoom */}
        <div className="size-full transition-transform duration-700 ease-out group-hover:scale-105">
          <CourseThumbnail course={course} />
        </div>

        {/* Gradient Overlay for Depth */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 dark:opacity-60 transition-opacity duration-300 group-hover:opacity-40 dark:group-hover:opacity-80" />

        {/* Soft Dimming Overlay on Hover */}
        <div className="pointer-events-none absolute inset-0 bg-black/30 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

        {/* Play/Open Floating Overlay (Clean glassmorphic button with zero hard shadows) */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="size-14 rounded-full flex items-center justify-center bg-card/85 dark:bg-white/10 border border-border/40 dark:border-white/20 opacity-0 scale-90 backdrop-blur-md transition-all duration-200 ease-out group-hover:scale-100 group-hover:opacity-100">
            {isDirectLink ? (
              <Link2 className="size-6 text-foreground dark:text-white" />
            ) : (
              <Play className="size-6 text-foreground dark:text-white ml-1" fill="currentColor" />
            )}
          </div>
        </div>

        {isDirectLink && (
          <span className="absolute bottom-3 left-3 z-20 flex items-center gap-1 rounded bg-black/70 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur-md border border-white/10">
            <Link2 className="size-3" />
            Link
          </span>
        )}

        <span className="absolute bottom-3 right-3 z-20 rounded bg-black/70 px-2 py-0.5 font-mono text-[10px] font-medium tabular-nums text-white backdrop-blur-md border border-white/10">{course.duration}</span>
        <div className="absolute right-3 top-3 z-20 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <CourseMenu course={course} />
        </div>
      </div>
      <div className="p-5">
        <h2 className="truncate text-lg font-semibold leading-7 text-foreground transition-colors duration-200 group-hover:text-foreground/80 dark:group-hover:text-white" title={course.title}>{course.title}</h2>
        <div className="mt-3 flex items-center gap-2.5">
          <InstructorAvatar name={course.instructor} course={course} size="sm" />
          <span className="truncate text-sm text-muted-foreground">{course.instructor}</span>
        </div>
         <div className="mt-5 h-1.5 overflow-hidden rounded-sm bg-secondary"><div className="h-full bg-foreground/55" style={{ width: `${course.progress}%` }} /></div>
        <div className="mt-2.5 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{completed} / {course.lessons} lessons</span>
          <span className="font-semibold text-foreground/75">{course.progress}%</span>
        </div>
      </div>
    </article>
  );
}

function EmptyState({ clear }: { clear: () => void }) {
  return (
     <div className="col-span-full flex min-h-96 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
      <Library className="size-10 text-muted-foreground" strokeWidth={1.5} />
      <h2 className="mt-5 text-lg font-semibold">No courses found</h2>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">No courses match this view.</p>
       <Button variant="outline" className="mt-6 rounded-md" onClick={clear}>Clear filters</Button>
    </div>
  );
}

export function AppShell({ children }: { children?: ReactNode }) {
  const [dark, setDark] = useState(false);
  const [mode, setMode] = useState<ThemeMode>("system");
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("tutin-theme");
    const shouldUseDark = stored === "dark" || stored === "light" ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    setMode(stored === "dark" || stored === "light" ? stored : "system");
    setDark(shouldUseDark);
    document.documentElement.classList.toggle("dark", shouldUseDark);
  }, []);

  const applyMode = (next: ThemeMode) => {
    const isDark = next === "system" ? window.matchMedia("(prefers-color-scheme: dark)").matches : next === "dark";
    setMode(next); setDark(isDark); document.documentElement.classList.toggle("dark", isDark);
    if (next === "system") window.localStorage.removeItem("tutin-theme"); else window.localStorage.setItem("tutin-theme", next);
  };
  const toggleTheme = () => applyMode(dark ? "light" : "dark");

  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex h-dvh overflow-hidden bg-shell text-foreground">
        <IconDock dark={dark} onThemeToggle={toggleTheme} onSettings={() => setSettingsOpen(true)} />
        <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} theme={mode} onThemeChange={applyMode} />
        <div className="flex-1 min-w-0 h-dvh overflow-y-auto custom-scrollbar">
          <main className="my-2 mr-2 min-w-0 rounded-2xl border border-border bg-background shadow-workspace sm:my-3 sm:mr-3 min-h-[calc(100dvh-1rem)] sm:min-h-[calc(100dvh-1.5rem)]">
            {children ?? <HomePage />}
          </main>
        </div>
        <Toaster />
      </div>
    </TooltipProvider>
  );
}

function HomePage() {
  const [filter, setFilter] = useState<Filter>("All");
  const [sort, setSort] = useState("Recently opened");
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  const visibleCourses = useMemo(() => {
    const filtered = courses.filter((course) => {
      const matchesFilter = filter === "All" || (filter === "Completed" ? course.progress === 100 : course.progress < 100);
      const matchesQuery = `${course.title} ${course.instructor}`.toLowerCase().includes(query.toLowerCase());
      return matchesFilter && matchesQuery;
    });
    return [...filtered].sort((a, b) => sort === "Progress" ? b.progress - a.progress : sort === "Course title" ? a.title.localeCompare(b.title) : a.id - b.id);
  }, [filter, query, sort]);

  return (
          <div className="mx-auto max-w-[1440px] px-5 pb-12 pt-6 sm:px-8 sm:pt-8 lg:px-10">
            <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex h-11 shrink-0 items-center gap-1 rounded-lg border border-border bg-secondary/50 p-1">
                {(["All", "In Progress", "Completed"] as Filter[]).map((item) => (
                  <Button
                    key={item}
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setFilter(item)}
                    className={cn(
                      "h-9 rounded-sm px-3.5 text-xs font-normal text-muted-foreground shadow-none sm:px-4 sm:text-sm",
                      filter === item && "bg-card font-medium text-foreground shadow-card hover:bg-card"
                    )}
                  >
                    {item}
                  </Button>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <label className="flex h-11 min-w-0 items-center gap-2 rounded-lg border border-border bg-card px-3 shadow-card sm:w-64 lg:w-80">
                  <Search className="size-4 shrink-0 text-muted-foreground" />
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    placeholder="Search courses"
                  />
                  <kbd className="hidden shrink-0 rounded border border-border bg-secondary px-1.5 py-1 text-[10px] font-semibold text-muted-foreground sm:inline">
                    ⌘K / Ctrl+K
                  </kbd>
                </label>
                <AddCourseControl />
              </div>
            </header>

            <div className="mt-6 flex items-center justify-end border-b border-border pb-3.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="rounded-md text-muted-foreground hover:text-foreground">
                    Sort: {sort} <ChevronDown className="size-4 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded-lg p-1.5 shadow-workspace">
                  {["Recently opened", "Progress", "Course title"].map((item) => (
                    <DropdownMenuItem key={item} onClick={() => setSort(item)} className="rounded-md">
                      {item}
                      {sort === item && <Check className="ml-auto" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <section className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4" aria-label="Course library">
              {visibleCourses.length ? visibleCourses.map((course) => <CourseCard key={course.id} course={course} />) : <EmptyState clear={() => { setQuery(""); setFilter("All"); }} />}
            </section>
          </div>
  );
}