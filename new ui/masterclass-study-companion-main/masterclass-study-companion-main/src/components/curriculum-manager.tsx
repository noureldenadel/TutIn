import { useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowDown, ArrowLeft, ArrowRightLeft, ArrowUp, Check, ChevronDown, ChevronRight, Clock3, FileText, FolderPlus,
  GripVertical, Layers, MoreHorizontal, MoreVertical, Mic, Pencil, PlayCircle, Plus, RefreshCw, Save, Sparkles, Subtitles,
  Trash2, UserRound, Volume2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub,
  DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Course } from "@/lib/courses";
import { SyncPreviewModal } from "@/components/sync-preview-modal";
import { EditCourseModal } from "@/components/edit-course-modal";

type Lesson = { id: string; title: string; seconds: number; watched: boolean; transcript: boolean; subs: string[]; dub?: string | undefined };
type Module = { id: string; title: string; open: boolean; lessons: Lesson[] };

const seed: [string, [string, number][]][] = [
  ["Foundations & Architecture", [["Welcome & how this course works", 252], ["Seeing like a designer", 570], ["Principles of visual hierarchy", 765], ["Typography that breathes", 605]]],
  ["Color, Space & Rhythm", [["Color with intention", 860], ["Layout and rhythm", 708], ["The 8-point grid", 540], ["Micro-interactions & motion", 675]]],
  ["Designing for People", [["Research without the jargon", 690], ["Designing for real people", 782], ["Your first case study", 990], ["Design critiques & handoff", 640]]],
];

const initialModules = (): Module[] => seed.map(([title, lessons], m) => ({
  id: `m${m}`, title, open: m === 0,
  lessons: lessons.map(([t, s], l) => ({
    id: `m${m}l${l}`, title: t, seconds: s, watched: m === 0 && l < 3,
    transcript: (m + l) % 3 !== 2, subs: l % 2 === 0 ? ["EN", "AR-EG"] : ["EN"], dub: l === 1 ? "AR-EG" : undefined,
  })),
}));

const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const fmtLong = (s: number) => { const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h ? `${h}h ${m}m` : `${m}m`; };
const pad = (n: number) => String(n).padStart(2, "0");
const move = <T,>(arr: T[], from: number, to: number) => { const a = [...arr]; const [x] = a.splice(from, 1); a.splice(to, 0, x as T); return a; };

type Drag = { kind: "module"; m: number } | { kind: "lesson"; m: number; l: number } | null;

export function CurriculumManager({ course }: { course: Course }) {
  const [modules, setModules] = useState<Module[]>(initialModules);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [info, setInfo] = useState({ title: course.title, instructor: course.instructor, language: "English" });
  const [editOpen, setEditOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const drag = useRef<Drag>(null);
  const [over, setOver] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const totals = useMemo(() => {
    const lessons = modules.flatMap((m) => m.lessons);
    return { modules: modules.length, lessons: lessons.length, seconds: lessons.reduce((a, l) => a + l.seconds, 0), missing: lessons.filter((l) => !l.transcript).length };
  }, [modules]);

  const update = (fn: (m: Module[]) => Module[], reorder = false) => { setModules(fn); if (reorder) { setDirty(true); setSaved(false); } };
  const patchLesson = (m: number, l: number, patch: Partial<Lesson>) =>
    update((ms) => ms.map((mod, i) => i !== m ? mod : { ...mod, lessons: mod.lessons.map((ls, j) => j === l ? { ...ls, ...patch } : ls) }));

  const onDrop = (target: Drag) => {
    const src = drag.current; drag.current = null; setOver(null);
    if (!src || !target) return;
    if (src.kind === "module" && target.kind === "module" && src.m !== target.m) update((ms) => move(ms, src.m, target.m), true);
    if (src.kind === "lesson") {
      const toM = target.m, toL = target.kind === "lesson" ? target.l : Infinity;
      update((ms) => {
        const next = ms.map((x) => ({ ...x, lessons: [...x.lessons] }));
        const [lesson] = next[src.m]!.lessons.splice(src.l, 1);
        const list = next[toM]!.lessons; list.splice(Math.min(toL, list.length), 0, lesson!); next[toM]!.open = true;
        return next;
      }, true);
    }
  };

  const moveLessonTo = (m: number, l: number, toM: number) => update((ms) => {
    const next = ms.map((x) => ({ ...x, lessons: [...x.lessons] }));
    const [lesson] = next[m]!.lessons.splice(l, 1); next[toM]!.lessons.push(lesson!); return next;
  }, true);

  return (
    <div className="mx-auto max-w-6xl px-5 pb-36 pt-6 sm:px-8 sm:pt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground">Courses</Link><ChevronRight className="size-3 shrink-0" />
          <Link to="/learn/$courseId" params={{ courseId: String(course.id) }} className="truncate hover:text-foreground">{info.title}</Link><ChevronRight className="size-3 shrink-0" />
          <span className="shrink-0 font-medium text-foreground">Curriculum</span>
        </nav>
         <Button asChild variant="secondary" size="sm" className="rounded-md"><Link to="/learn/$courseId" params={{ courseId: String(course.id) }}><ArrowLeft /> Player</Link></Button>
      </div>

       <section className="mt-6 flex flex-col gap-6 rounded-xl bg-card p-6 shadow-card lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{info.title}</h1>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
             <span className="inline-flex items-center gap-1.5 rounded bg-secondary px-2.5 py-1 font-medium"><UserRound className="size-3.5 text-muted-foreground" />{info.instructor}</span>
             <span className="inline-flex items-center gap-1.5 rounded bg-sky/10 px-2.5 py-1 font-semibold text-sky">{info.language} [{info.language.slice(0, 2).toUpperCase()}]</span>
          </div>
        </div>
        <div className="flex flex-col gap-4 lg:items-end">
          <div className="flex flex-wrap gap-2">
            <Stat icon={<Layers />} label={`${totals.modules} Modules`} />
            <Stat icon={<PlayCircle />} label={`${totals.lessons} Lessons`} />
            <Stat icon={<Clock3 />} label={`${fmtLong(totals.seconds)} Total`} />
          </div>
          <div className="flex flex-wrap gap-2">
             <Button variant="secondary" className="rounded-md" onClick={() => setSyncOpen(true)}><RefreshCw /> Rescan folder</Button>
             <Button variant="secondary" className="rounded-md" onClick={() => setEditOpen(true)}><Pencil /> Edit info</Button>
             <Button className="rounded-md bg-sky text-sky-foreground hover:bg-sky/90" onClick={() => importRef.current?.click()}><FolderPlus /> Import videos</Button>
            <input ref={importRef} type="file" multiple accept="video/*" className="sr-only" onChange={(e) => {
              const files = Array.from(e.target.files ?? []); if (!files.length) return;
              update((ms) => ms.map((m, i) => i !== ms.length - 1 ? m : { ...m, open: true, lessons: [...m.lessons, ...files.map((f, k) => ({ id: `imp${Date.now()}${k}`, title: f.name.replace(/\.[^.]+$/, ""), seconds: 600, watched: false, transcript: false, subs: [] }))] }), true);
              e.target.value = "";
            }} />
          </div>
        </div>
      </section>

      <section className="mt-6 space-y-4" aria-label="Curriculum">
        {modules.map((mod, m) => {
          const secs = mod.lessons.reduce((a, l) => a + l.seconds, 0);
          return (
            <div key={mod.id}
              onDragOver={(e) => { e.preventDefault(); setOver(mod.id); }}
              onDragLeave={() => setOver((o) => o === mod.id ? null : o)}
              onDrop={(e) => { e.preventDefault(); onDrop({ kind: drag.current?.kind === "module" ? "module" : "lesson", m, l: Infinity } as Drag); }}
               className={cn("rounded-xl bg-card shadow-card transition-all", over === mod.id && "ring-2 ring-primary/35")}>
              <div className="flex items-center gap-3 p-4">
                <span draggable onDragStart={() => { drag.current = { kind: "module", m }; }} className="cursor-grab text-muted-foreground active:cursor-grabbing" aria-label="Drag module"><GripVertical className="size-4" /></span>
                <button type="button" aria-label={mod.open ? "Collapse module" : "Expand module"} onClick={() => update((ms) => ms.map((x, i) => i === m ? { ...x, open: !x.open } : x))} className="text-muted-foreground hover:text-foreground">
                  <ChevronDown className={cn("size-4 transition-transform", !mod.open && "-rotate-90")} />
                </button>
                 <span className="shrink-0 rounded bg-primary-soft px-2.5 py-1 text-[11px] font-semibold text-primary">Module {pad(m + 1)}</span>
                {renaming === mod.id ? (
                  <input autoFocus defaultValue={mod.title} onBlur={(e) => { const v = e.target.value.trim(); if (v) update((ms) => ms.map((x, i) => i === m ? { ...x, title: v } : x)); setRenaming(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setRenaming(null); }}
                    className="min-w-0 flex-1 rounded-lg bg-secondary/75 px-2.5 py-1 text-sm font-semibold outline-none focus:bg-background focus:ring-2 focus:ring-ring" />
                ) : (
                  <button type="button" onDoubleClick={() => setRenaming(mod.id)} onClick={() => update((ms) => ms.map((x, i) => i === m ? { ...x, open: !x.open } : x))} className="min-w-0 flex-1 truncate text-left text-sm font-semibold" title="Double-click to rename">
                    {pad(m + 1)} - {mod.title}
                  </button>
                )}
                 <span className="hidden shrink-0 rounded bg-secondary px-2.5 py-1 text-xs text-muted-foreground sm:inline">{mod.lessons.length} lessons • {fmtLong(secs)}</span>
                <DropdownMenu>
                   <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Module actions" className="size-8 rounded-md text-muted-foreground"><MoreVertical /></Button></DropdownMenuTrigger>
                   <DropdownMenuContent align="end" className="w-44 rounded-lg p-1.5">
                     <DropdownMenuItem className="rounded-md" onClick={() => setRenaming(mod.id)}><Pencil /> Rename</DropdownMenuItem>
                     <DropdownMenuItem className="rounded-md" disabled={m === 0} onClick={() => update((ms) => move(ms, m, m - 1), true)}><ArrowUp /> Move up</DropdownMenuItem>
                     <DropdownMenuItem className="rounded-md" disabled={m === modules.length - 1} onClick={() => update((ms) => move(ms, m, m + 1), true)}><ArrowDown /> Move down</DropdownMenuItem>
                    <DropdownMenuSeparator />
                     <DropdownMenuItem className="rounded-md" onClick={() => update((ms) => ms.filter((_, i) => i !== m), true)}><Trash2 /> Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {mod.open && (
                <ol className="space-y-1.5 border-t border-border/50 px-3 pb-3 pt-3">
                   {mod.lessons.length === 0 && <li className="rounded-lg bg-secondary/40 px-4 py-6 text-center text-sm text-muted-foreground">No lessons yet. Import videos to begin.</li>}
                  {mod.lessons.map((ls, l) => (
                    <li key={ls.id} draggable
                      onDragStart={(e) => { e.stopPropagation(); drag.current = { kind: "lesson", m, l }; }}
                      onDragOver={(e) => { e.preventDefault(); }}
                      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (drag.current?.kind === "lesson") onDrop({ kind: "lesson", m, l }); }}
                       className="group flex flex-wrap items-center gap-3 rounded-lg bg-background/60 px-3 py-2.5 transition-colors duration-200 hover:bg-secondary/60 md:flex-nowrap">
                      <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground/60 group-hover:text-muted-foreground" />
                      <button type="button" aria-label={ls.watched ? "Mark unwatched" : "Mark watched"} onClick={() => patchLesson(m, l, { watched: !ls.watched })}
                        className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-border", ls.watched && "border-primary bg-primary text-primary-foreground")}>
                        {ls.watched && <Check className="size-3" strokeWidth={3} />}
                      </button>
                      <span className="w-8 shrink-0 text-xs tabular-nums text-muted-foreground">{pad(m + 1)}.{l + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{ls.title}</span>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {ls.transcript
                           ? <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400"><FileText className="size-3" /> Transcribed</span>
                           : <span className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground"><FileText className="size-3" /> No transcript</span>}
                         {ls.subs.map((s) => <span key={s} className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">{s}</span>)}
                         {ls.dub && <span className="inline-flex items-center gap-1 rounded bg-sky/10 px-2 py-0.5 text-[11px] font-semibold text-sky"><Volume2 className="size-3" /> Dub: {ls.dub}</span>}
                      </div>

                      <span className="ml-auto w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{fmtDur(ls.seconds)}</span>
                      <div className="flex shrink-0 items-center">
                         <Button variant="ghost" size="icon" title="Subtitles" aria-label="Subtitles" className="size-8 rounded-md text-muted-foreground"><Subtitles /></Button>
                         <Button variant="ghost" size="icon" title="Dub" aria-label="Dub" className={cn("size-8 rounded-md text-muted-foreground", ls.dub && "text-sky")} onClick={() => patchLesson(m, l, { dub: ls.dub ? undefined : "AR-EG" })}><Mic /></Button>
                        <DropdownMenu>
                           <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Lesson actions" className="size-8 rounded-md text-muted-foreground"><MoreHorizontal /></Button></DropdownMenuTrigger>
                           <DropdownMenuContent align="end" className="w-48 rounded-lg p-1.5">
                            <DropdownMenuSub>
                               <DropdownMenuSubTrigger className="rounded-md"><ArrowRightLeft className="mr-2 size-4" /> Move to</DropdownMenuSubTrigger>
                               <DropdownMenuSubContent className="rounded-lg p-1.5">
                                 {modules.map((t, ti) => <DropdownMenuItem key={t.id} disabled={ti === m} className="rounded-md" onClick={() => moveLessonTo(m, l, ti)}>Module {pad(ti + 1)} · {t.title}</DropdownMenuItem>)}
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                             <DropdownMenuItem className="rounded-md" onClick={() => { const v = window.prompt("Rename file", ls.title); if (v?.trim()) patchLesson(m, l, { title: v.trim() }); }}><Pencil /> Rename</DropdownMenuItem>
                            <DropdownMenuSeparator />
                             <DropdownMenuItem className="rounded-md" onClick={() => update((ms) => ms.map((x, i) => i !== m ? x : { ...x, lessons: x.lessons.filter((_, j) => j !== l) }), true)}><Trash2 /> Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          );
        })}
      </section>

       <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-lg bg-card/85 px-3 py-2.5 shadow-workspace backdrop-blur-md sm:gap-3 sm:px-5 sm:py-3">
         <Button variant="ghost" size="sm" className="rounded-md" onClick={() => update((ms) => [...ms, { id: `m${Date.now()}`, title: "New module", open: true, lessons: [] }], true)}><Plus /> <span className="hidden sm:inline">Add module</span></Button>
         <Button variant="ghost" size="sm" className="rounded-md" disabled={!totals.missing || transcribing} onClick={() => { setTranscribing(true); setTimeout(() => { update((ms) => ms.map((x) => ({ ...x, lessons: x.lessons.map((ls) => ({ ...ls, transcript: true, subs: ls.subs.length ? ls.subs : ["EN"] })) }))); setTranscribing(false); }, 1500); }}>
          <Sparkles className={cn(transcribing && "animate-spin")} /> <span className="hidden sm:inline">{transcribing ? "Transcribing…" : `Transcribe missing${totals.missing ? ` (${totals.missing})` : ""}`}</span>
        </Button>
         <Button size="sm" disabled={!dirty} className="rounded-md bg-sky text-sky-foreground hover:bg-sky/90" onClick={() => { setDirty(false); setSaved(true); }}>
          {saved ? <><Check /> Saved</> : <><Save /> Save order</>}
        </Button>
      </div>

      <EditCourseModal
        open={editOpen}
        onOpenChange={setEditOpen}
        course={{
          ...course,
          title: info.title,
          instructor: info.instructor,
          language: info.language,
        }}
        onSave={(updated) => {
          setInfo({
            title: updated.title,
            instructor: updated.instructor,
            language: updated.language,
          });
        }}
      />

      <SyncPreviewModal open={syncOpen} onOpenChange={setSyncOpen} course={course} />
    </div>
  );
}

function Stat({ icon, label }: { icon: React.ReactNode; label: string }) {
  return <span className="inline-flex items-center gap-1.5 rounded bg-secondary/70 px-3 py-1.5 text-xs font-semibold [&_svg]:size-3.5 [&_svg]:text-primary">{icon}{label}</span>;
}
