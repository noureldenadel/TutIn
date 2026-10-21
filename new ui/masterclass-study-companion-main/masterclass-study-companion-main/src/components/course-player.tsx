import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Bold, Camera, Check, ChevronDown, ChevronRight, Clock, Code2, Download, Gauge, Globe2,
  List, ListChecks, Maximize, Mic, NotebookPen, Pause, PanelRightClose, PanelRightOpen, Play, Plus,
  Settings, SkipBack, SkipForward, Sparkles, MessageSquareText, Volume2, VolumeX, Zap, BookOpen,
} from "lucide-react";

import mayaAvatar from "@/assets/maya-chen-avatar.jpg";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Course } from "@/lib/courses";
import { InstructorAvatar } from "@/components/instructor-avatar";

const VIDEO_SRC = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";

const lessonTitles = [
  "Welcome & how this course works", "Seeing like a designer", "Principles of visual hierarchy",
  "Typography that breathes", "Color with intention", "Layout and rhythm", "Designing for real people", "Your first case study",
];
const durations = ["04:12", "09:30", "12:45", "10:05", "14:20", "11:48", "13:02", "16:30"];

type Lang = "en" | "eg" | "sa";
const languages: { id: Lang; label: string; short: string; rtl?: boolean }[] = [
  { id: "en", label: "English (Original)", short: "English" },
  { id: "eg", label: "Arabic (Egyptian العامية)", short: "العامية المصرية", rtl: true },
  { id: "sa", label: "Arabic (Saudi الخليجية)", short: "الخليجية", rtl: true },
];

const cueText: Record<Lang, string[]> = {
  en: [
    "Welcome back. Today we're slowing down and looking closely.",
    "Good design starts with noticing what people actually need.",
    "Hierarchy tells the eye where to go first, and where to rest.",
    "Notice how size and weight create a natural reading order.",
    "Space isn't empty — it's what gives every element room to speak.",
    "Try squinting at your layout. What stands out immediately?",
    "Color should support meaning, never compete with it.",
    "Keep your palette small; let one accent do the heavy lifting.",
    "Alignment creates calm. Misalignment creates quiet tension.",
    "Let's apply this to a real screen, step by step.",
    "First, remove anything that doesn't serve the goal.",
    "Then group related things, and separate the rest.",
    "Finally, check it again with fresh eyes tomorrow.",
    "That's the whole loop: notice, simplify, refine.",
  ],
  eg: [
    "أهلاً بيك تاني. النهارده هنهدى شوية ونبص بتركيز.",
    "التصميم الحلو بيبدأ لما تاخد بالك الناس محتاجة إيه فعلاً.",
    "الترتيب بيقول للعين تبص فين الأول، وترتاح فين.",
    "شوف الحجم والتقل بيعملوا ترتيب قراءة طبيعي إزاي.",
    "المساحة الفاضية مش فاضية — هي اللي بتدي كل حاجة مكانها.",
    "جرّب تضيّق عينك على التصميم. إيه اللي باين على طول؟",
    "اللون لازم يخدم المعنى، مش ينافسه.",
    "خلّي الألوان قليلة؛ ولون واحد مميز يشيل الشغل.",
    "المحاذاة بتدي هدوء. واللخبطة بتعمل توتر خفيف.",
    "يلا نطبّق ده على شاشة حقيقية، خطوة بخطوة.",
    "الأول، شيل أي حاجة مش بتخدم الهدف.",
    "بعدين، جمّع الحاجات اللي شبه بعض، وافصل الباقي.",
    "وفي الآخر، بصّ عليه تاني بكرة بعين جديدة.",
    "دي كل الحكاية: لاحظ، بسّط، وحسّن.",
  ],
  sa: [
    "هلا فيك من جديد. اليوم بنهدّي شوي ونطالع بتمعّن.",
    "التصميم الزين يبدأ لما تنتبه وش يحتاج الناس صدق.",
    "الترتيب يقول للعين وين تروح أول، ووين ترتاح.",
    "لاحظ كيف الحجم والسماكة يسوون ترتيب قراءة طبيعي.",
    "المساحة مو فاضية — هي اللي تعطي كل عنصر مجاله.",
    "جرّب تصغّر عيونك على التصميم. وش اللي يبان على طول؟",
    "اللون لازم يخدم المعنى، مو ينافسه.",
    "خلّ ألوانك قليلة؛ ولون واحد مميز يشيل الحمل.",
    "المحاذاة تعطي هدوء. وعدمها يسوي توتر خفيف.",
    "يلا نطبّق هذا على شاشة حقيقية، خطوة خطوة.",
    "أول شي، شيل أي شي ما يخدم الهدف.",
    "بعدين، اجمع الأشياء المتشابهة، وافصل الباقي.",
    "وآخر شي، طالعه مرة ثانية بكرة بعين جديدة.",
    "هذي السالفة كلها: لاحظ، بسّط، وحسّن.",
  ],
};
const CUE_LEN = 7;

const fmt = (s: number) => {
  if (!Number.isFinite(s)) return "00:00";
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};
const parseTs = (t: string) => { const [m, s] = t.split(":").map(Number); return (m ?? 0) * 60 + (s ?? 0); };

type Tab = "playlist" | "notes" | "transcript";

export function CoursePlayer({ course }: { course: Course }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [autoplay, setAutoplay] = useState(true);
  const [remainingTime, setRemainingTime] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [tab, setTab] = useState<Tab>("playlist");
  const [active, setActive] = useState(3);
  const [done, setDone] = useState<boolean[]>(() => lessonTitles.map((_, i) => i < 4 && i !== 3 ? true : i === 1 ? true : false));

  const seek = useCallback((t: number) => {
    const v = videoRef.current; if (!v) return;
    v.currentTime = Math.max(0, Math.min(t, v.duration || t)); setTime(v.currentTime);
  }, []);
  const togglePlay = () => { const v = videoRef.current; if (!v) return; v.paused ? v.play() : v.pause(); };

  useEffect(() => { const v = videoRef.current; if (v) { v.volume = volume; v.muted = muted; } }, [volume, muted]);
  useEffect(() => { const v = videoRef.current; if (v) v.playbackRate = speed; }, [speed]);

  const goTo = (i: number) => { if (i < 0 || i >= lessonTitles.length) return; setActive(i); seek(0); };

  return (
    <div className="flex h-full min-h-[calc(100dvh-1.5rem)] flex-col gap-5 p-4 sm:p-6 lg:flex-row">
      <section className="min-w-0 flex-1">
        <div className="relative">
          <div aria-hidden className={cn("pointer-events-none absolute -inset-6 rounded-[2rem] opacity-40 blur-3xl transition-opacity dark:opacity-30", course.art)} />
          <div ref={frameRef} className="group relative aspect-video overflow-hidden rounded-xl bg-player shadow-workspace">
            <video
              ref={videoRef} src={VIDEO_SRC} playsInline preload="metadata"
              className="size-full object-contain" onClick={togglePlay}
              onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
              onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
              onEnded={() => { if (autoplay && active < lessonTitles.length - 1) goTo(active + 1); }}
            />
            {!playing && (
              <button type="button" onClick={togglePlay} aria-label="Play" className="absolute left-1/2 top-1/2 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-card/90 text-primary shadow-workspace backdrop-blur transition-transform hover:scale-105">
                <Play className="size-6 translate-x-0.5 fill-current" />
              </button>
            )}
            <div className={cn("absolute inset-x-0 bottom-0 bg-gradient-to-t from-player via-player/60 to-transparent px-4 pb-3 pt-10 text-player-foreground transition-opacity", playing ? "opacity-0 group-hover:opacity-100 focus-within:opacity-100" : "opacity-100")}>
              <Slider value={[time]} max={duration || 1} step={0.1} onValueChange={([t]) => seek(t ?? 0)} aria-label="Timeline" className="[&_[role=slider]]:size-3.5 [&_[role=slider]]:border-0 [&_[role=slider]]:bg-player-foreground" />
              <div className="mt-2.5 flex min-w-0 items-center gap-0.5">
                <PlayerBtn label={playing ? "Pause" : "Play"} onClick={togglePlay}>{playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}</PlayerBtn>
                <PlayerBtn label="Next lesson" onClick={() => goTo(active + 1)} disabled={active === lessonTitles.length - 1}><SkipForward className="fill-current" /></PlayerBtn>
                <PlayerBtn label="Previous lesson" onClick={() => goTo(active - 1)} disabled={active === 0}><SkipBack className="fill-current" /></PlayerBtn>
                <div className="group/volume flex h-8 items-center overflow-hidden rounded-full transition-colors hover:bg-player-foreground/15 focus-within:bg-player-foreground/15">
                  <PlayerBtn label={muted ? "Unmute" : "Mute"} onClick={() => setMuted(!muted)}>{muted || volume === 0 ? <VolumeX className="fill-current" /> : <Volume2 className="fill-current" />}</PlayerBtn>
                  <div className="w-0 overflow-hidden opacity-0 transition-all duration-200 group-hover/volume:w-20 group-hover/volume:pr-2 group-hover/volume:opacity-100 group-focus-within/volume:w-20 group-focus-within/volume:pr-2 group-focus-within/volume:opacity-100">
                    <Slider value={[muted ? 0 : volume]} max={1} step={0.01} onValueChange={([v]) => { setVolume(v ?? 0); setMuted(false); }} aria-label="Volume" className="w-16 [&_[role=slider]]:size-3.5 [&_[role=slider]]:border-2 [&_[role=slider]]:border-player [&_[role=slider]]:bg-player-foreground [&_[role=slider]]:shadow-sm" />
                  </div>
                </div>
                <button type="button" onClick={() => setRemainingTime(!remainingTime)} aria-label={remainingTime ? "Show elapsed time" : "Show remaining time"} title={remainingTime ? "Show elapsed time" : "Show remaining time"} className="ml-1 shrink-0 rounded-md px-2 py-1 text-xs tabular-nums text-player-foreground/80 hover:bg-player-foreground/15">
                  {remainingTime ? `−${fmt(Math.max(0, duration - time))}` : `${fmt(time)} / ${fmt(duration)}`}
                </button>
                <div className="ml-auto flex min-w-0 items-center gap-0.5">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><button type="button" aria-label="Audio and subtitles" title="Audio and subtitles" className="flex size-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-player-foreground/15 [&_svg]:size-4"><MessageSquareText /></button></DropdownMenuTrigger>
                    <DropdownMenuContent side="top" sideOffset={10} align="end" className="w-56 rounded-lg p-1.5">
                      <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Audio</p>
                      <DropdownMenuItem className="rounded-md">Original <Check className="ml-auto" /></DropdownMenuItem>
                      <DropdownMenuItem className="rounded-md">Dubbed</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Subtitles</p>
                      <DropdownMenuItem className="rounded-md">English <Check className="ml-auto" /></DropdownMenuItem>
                      <DropdownMenuItem className="rounded-md">Arabic</DropdownMenuItem>
                      <DropdownMenuItem className="rounded-md">Off</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><button type="button" aria-label="Settings" title="Settings" className="flex size-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-player-foreground/15 [&_svg]:size-4"><Settings /></button></DropdownMenuTrigger>
                    <DropdownMenuContent side="top" sideOffset={10} align="end" className="w-52 rounded-lg p-1.5">
                      <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Playback speed</p>
                      {[0.75, 1, 1.25, 1.5, 2].map((s) => <DropdownMenuItem key={s} className="rounded-md" onClick={() => setSpeed(s)}><Gauge />{s}×{speed === s && <Check className="ml-auto" />}</DropdownMenuItem>)}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="rounded-md" onSelect={(event) => { event.preventDefault(); setAutoplay(!autoplay); }}>Autoplay next{autoplay && <Check className="ml-auto" />}</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <PlayerBtn label="Fullscreen" onClick={() => frameRef.current?.requestFullscreen?.()}><Maximize /></PlayerBtn>
                  <PlayerBtn label={panelOpen ? "Hide sidebar" : "Show sidebar"} onClick={() => setPanelOpen(!panelOpen)}>{panelOpen ? <PanelRightClose /> : <PanelRightOpen />}</PlayerBtn>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="relative mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Link to="/" className="hover:text-foreground">{course.title}</Link><ChevronRight className="size-3" />
              <span>Module 1</span><ChevronRight className="size-3" />
              <span className="font-medium text-foreground">Lesson {String(active + 1).padStart(2, "0")}</span>
            </nav>
            <h1 className="mt-2 text-xl font-semibold sm:text-2xl">{lessonTitles[active]}</h1>
            <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <InstructorAvatar name={course.instructor} course={course} size="sm" imageUrl={course.instructor === "Maya Chen" ? mayaAvatar : undefined} />
              <span>{course.instructor}</span>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button asChild variant="ghost" className="rounded-md text-muted-foreground"><Link to="/manage/$courseId" params={{ courseId: String(course.id) }}><ListChecks /> Manage</Link></Button>
          </div>
        </div>
      </section>

      {panelOpen && (
        <aside className="flex h-[640px] w-full shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-card lg:sticky lg:top-6 lg:h-[calc(100dvh-4.5rem)] lg:w-[380px]">
          <div className="p-3">
            <div role="tablist" className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-secondary/50 p-1">
              {([["playlist", BookOpen, "Playlist"], ["notes", NotebookPen, "Notes"], ["transcript", Zap, "Transcript"]] as const).map(([id, Icon, label]) => (
                <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cn("flex items-center justify-center gap-1.5 rounded-sm px-2 py-2 text-xs font-semibold text-muted-foreground transition-all", tab === id && "bg-card text-foreground shadow-card")}>
                  <Icon className={cn("size-3.5", tab === id && "text-primary")} /> {label}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1">
            {tab === "playlist" && <PlaylistTab active={active} done={done} setDone={setDone} onSelect={goTo} />}
            {tab === "notes" && <NotesTab time={time} seek={seek} />}
            {tab === "transcript" && <TranscriptTab time={time} seek={seek} />}
          </div>
        </aside>
      )}
    </div>
  );
}

function PlayerBtn({ label, onClick, children, active, disabled }: { label: string; onClick: () => void; children: ReactNode; active?: boolean; disabled?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className={cn("flex size-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-player-foreground/15 disabled:cursor-not-allowed disabled:opacity-35 [&_svg]:size-4", active && "text-primary")}>
      {children}
    </button>
  );
}

function PlaylistTab({ active, done, setDone, onSelect }: { active: number; done: boolean[]; setDone: (d: boolean[]) => void; onSelect: (i: number) => void }) {
  const [manage, setManage] = useState(false);
  const count = done.filter(Boolean).length;
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-4 pt-1">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Module 1 <span className="font-normal text-muted-foreground">• {count} / {done.length} done</span></p>
          <Button variant="ghost" size="icon" aria-label="Manage lessons" aria-pressed={manage} onClick={() => setManage(!manage)} className={cn("size-8 rounded-md text-muted-foreground", manage && "bg-primary-soft text-primary")}><ListChecks /></Button>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${(count / done.length) * 100}%` }} /></div>
        {manage && (
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="secondary" className="flex-1 rounded-md" onClick={() => setDone(done.map(() => true))}>Mark done</Button>
            <Button size="sm" variant="ghost" className="flex-1 rounded-md" onClick={() => setDone(done.map(() => false))}>Reset</Button>
          </div>
        )}
      </div>
      <ol className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pb-4">
        {lessonTitles.map((title, i) => {
          const isActive = i === active;
          return (
            <li key={title} className={cn("flex items-center gap-3 rounded-lg border border-transparent px-3 py-3 transition-colors hover:bg-secondary/60", isActive && "border-primary/40 bg-primary-soft/60 shadow-brand hover:bg-primary-soft/60")}>
              <button type="button" aria-label={done[i] ? "Mark as not done" : "Mark as done"} onClick={() => setDone(done.map((d, j) => j === i ? !d : d))} className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-border transition-colors", done[i] && "border-primary bg-primary text-primary-foreground")}>
                {done[i] && <Check className="size-3" strokeWidth={3} />}
              </button>
              <button type="button" onClick={() => onSelect(i)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                <span className={cn("min-w-0 flex-1 truncate text-sm", isActive ? "font-semibold" : done[i] && "text-muted-foreground")}>{title}</span>
                {isActive
                  ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-semibold text-primary-foreground"><span className="size-1.5 animate-pulse rounded-full bg-primary-foreground motion-reduce:animate-none" />Playing</span>
                  : <span className="shrink-0 rounded bg-secondary px-2 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">{durations[i]}</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const TS_RE = /\[(\d{1,2}:\d{2})\]/g;

function renderInline(text: string, seek: (t: number) => void, key: string) {
  const parts = text.split(/(\[\d{1,2}:\d{2}\]|\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    const k = `${key}-${i}`;
    if (/^\[\d{1,2}:\d{2}\]$/.test(p)) {
      const ts = p.slice(1, -1);
      return <button key={k} type="button" onClick={() => seek(parseTs(ts))} className="mx-0.5 inline-flex items-center gap-1 rounded bg-primary-soft px-2 py-0.5 align-middle text-[11px] font-semibold tabular-nums text-primary hover:bg-primary/20"><Play className="size-2.5 fill-current" />{ts}</button>;
    }
    if (p.startsWith("**")) return <strong key={k}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("`")) return <code key={k} className="rounded bg-secondary px-1 py-0.5 font-mono text-[12px]">{p.slice(1, -1)}</code>;
    return <span key={k}>{p}</span>;
  });
}

function NotesTab({ time, seek }: { time: number; seek: (t: number) => void }) {
  const [notes, setNotes] = useState("**Hierarchy** guides the eye [00:14]\n- Squint test to find what stands out [00:35]\n- Keep one accent color [00:49]\n\nTry `8px` spacing steps on the case study.");
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  const insert = (before: string, after = "") => {
    setEditing(true);
    requestAnimationFrame(() => {
      const el = ref.current; if (!el) { setNotes((n) => n + before + after); return; }
      const { selectionStart: s, selectionEnd: e } = el;
      const next = notes.slice(0, s) + before + notes.slice(s, e) + after + notes.slice(e);
      setNotes(next);
      requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = e + before.length + after.length; });
    });
  };

  const exportNotes = () => {
    const url = URL.createObjectURL(new Blob([notes], { type: "text/markdown" }));
    const a = document.createElement("a"); a.href = url; a.download = "tutin-notes.md"; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full flex-col px-4 pb-4">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" className="flex-1 rounded-md" onClick={() => { setNotes((n) => `${n}\n\n📷 Snapshot at [${fmt(time)}]`); setEditing(false); }}><Camera /> Screenshot [{fmt(time)}]</Button>
        <Button size="icon" variant="ghost" aria-label="Export notes" title="Export notes" className="size-9 rounded-md text-muted-foreground" onClick={exportNotes}><Download /></Button>
      </div>
      <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background">
        <div className="flex items-center gap-0.5 border-b border-border px-2 py-1.5">
          <ToolBtn label="Bold" onClick={() => insert("**", "**")}><Bold /></ToolBtn>
          <ToolBtn label="Code" onClick={() => insert("`", "`")}><Code2 /></ToolBtn>
          <ToolBtn label="List" onClick={() => insert("\n- ")}><List /></ToolBtn>
          <ToolBtn label="Insert timestamp" onClick={() => insert(`[${fmt(time)}] `)}><Clock /></ToolBtn>
          <button type="button" onClick={() => setEditing(!editing)} className="ml-auto rounded-md px-3 py-1 text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground">{editing ? "Done" : "Edit"}</button>
        </div>
        {editing ? (
          <textarea ref={ref} value={notes} onChange={(e) => setNotes(e.target.value)} autoFocus className="min-h-0 flex-1 resize-none bg-transparent p-4 font-mono text-[13px] leading-6 outline-none" placeholder="Start writing…" />
        ) : (
          <div className="min-h-0 flex-1 cursor-text space-y-1.5 overflow-y-auto p-4 text-sm leading-6" onDoubleClick={() => setEditing(true)}>
            {notes.split("\n").map((line, i) => line.startsWith("- ")
              ? <p key={i} className="flex gap-2 pl-1"><span className="mt-2.5 size-1 shrink-0 rounded-full bg-muted-foreground" /><span>{renderInline(line.slice(2), seek, String(i))}</span></p>
              : line.trim() ? <p key={i}>{renderInline(line, seek, String(i))}</p> : <div key={i} className="h-2" />)}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground [&_svg]:size-4">{children}</button>;
}

function TranscriptTab({ time, seek }: { time: number; seek: (t: number) => void }) {
  const [lang, setLang] = useState<Lang>("en");
  const [dub, setDub] = useState(false);
  const [summary, setSummary] = useState<"idle" | "loading" | "ready">("idle");
  const listRef = useRef<HTMLOListElement>(null);
  const current = languages.find((l) => l.id === lang)!;
  const cues = useMemo(() => cueText[lang].map((text, i) => ({ start: i * CUE_LEN, text })), [lang]);
  const activeIdx = Math.min(Math.floor(time / CUE_LEN), cues.length - 1);

  useEffect(() => {
    const list = listRef.current; const el = list?.children[activeIdx] as HTMLElement | undefined;
    if (list && el) list.scrollTo({ top: el.offsetTop - list.clientHeight / 2 + el.clientHeight / 2, behavior: "smooth" });
  }, [activeIdx]);

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 px-4 pb-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full justify-between rounded-lg"><span className="flex items-center gap-2"><Globe2 className="text-primary" />{current.short}{lang === "en" && <span className="text-muted-foreground">(Source)</span>}</span><ChevronDown className="text-muted-foreground" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] rounded-lg p-1.5">
            {languages.map((l) => <DropdownMenuItem key={l.id} className="rounded-md" onClick={() => setLang(l.id)}>{l.label}{lang === l.id && <Check className="ml-auto text-primary" />}</DropdownMenuItem>)}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="rounded-md text-primary focus:text-primary"><Plus /> Add language…</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex gap-2">
          <button type="button" aria-pressed={dub} onClick={() => setDub(!dub)} className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground", dub && "border-primary/40 bg-primary-soft text-primary hover:text-primary")}><Mic className="size-3.5" /> Voice dub{dub && " · On"}</button>
          <button type="button" disabled={summary === "loading"} onClick={() => { setSummary("loading"); setTimeout(() => setSummary("ready"), 1200); }} className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"><Sparkles className={cn("size-3.5", summary === "loading" && "animate-spin")} /> {summary === "loading" ? "Summarizing…" : "Summary"}</button>
        </div>
        {summary === "ready" && (
          <div className="rounded-lg bg-primary-soft/60 p-3 text-xs leading-5">
            <p className="mb-1 flex items-center gap-1.5 font-semibold text-primary"><Sparkles className="size-3.5" /> Summary</p>
            Good design comes from noticing needs, building clear hierarchy, using space and a small palette, then refining with fresh eyes.
          </div>
        )}
      </div>
      <ol ref={listRef} dir={current.rtl ? "rtl" : "ltr"} className="relative min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {cues.map((cue, i) => (
          <li key={i}>
            <button type="button" onClick={() => seek(cue.start)} className={cn("flex w-full gap-3 rounded-lg px-3 py-2.5 text-start transition-colors duration-300 hover:bg-secondary/60", i === activeIdx && "bg-primary-soft hover:bg-primary-soft")}>
              <span dir="ltr" className={cn("mt-0.5 h-fit shrink-0 rounded bg-secondary px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-muted-foreground", i === activeIdx && "bg-primary text-primary-foreground")}>{fmt(cue.start)}</span>
              <span className={cn("text-sm leading-6 text-muted-foreground", i === activeIdx && "text-foreground")}>{cue.text}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
