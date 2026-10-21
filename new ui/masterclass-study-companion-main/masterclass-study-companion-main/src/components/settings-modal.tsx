import { useState, type ReactNode } from "react";
import { Cpu, Database, Eye, EyeOff, FolderOpen, Info, KeyRound, Mic, Monitor, Moon, Palette, Sliders, Sun, Zap } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export type ThemeMode = "light" | "dark" | "system";

const tabs = [
  { id: "general", label: "General", icon: Sliders },
  { id: "ai", label: "AI", icon: KeyRound },
  { id: "voice", label: "Voice", icon: Mic },
  { id: "storage", label: "Storage", icon: Database },
  { id: "about", label: "About", icon: Info },
] as const;
type TabId = (typeof tabs)[number]["id"];

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold">{title}</h3>
      {description && <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ToggleRow({ label, defaultChecked = false }: { label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center justify-between gap-4 py-2.5 text-sm">
      <span>{label}</span>
      <Switch defaultChecked={defaultChecked} />
    </label>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-foreground/80"><span className="size-1.5 rounded-full bg-foreground/60" />{children}</span>;
}

function StorageRow({ title, value, action, icon }: { title: string; value: string; action: string; icon?: ReactNode }) {
  return (
     <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0"><p className="text-sm font-semibold">{title}</p><p className="mt-1 truncate font-mono text-xs text-muted-foreground">{value}</p></div>
       <Button variant="outline" size="sm" className="shrink-0 rounded-md">{icon}{action}</Button>
    </div>
  );
}

export function SettingsModal({ open, onOpenChange, theme, onThemeChange }: { open: boolean; onOpenChange: (o: boolean) => void; theme: ThemeMode; onThemeChange: (t: ThemeMode) => void }) {
  const [tab, setTab] = useState<TabId>("general");
  const [speed, setSpeed] = useState(1);
  const [showKey, setShowKey] = useState(false);
  const [conn, setConn] = useState<"idle" | "testing" | "ok">("idle");
  const [device, setDevice] = useState<"gpu" | "cpu">("gpu");
  const active = tabs.find((t) => t.id === tab)!;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
       <DialogContent className="flex h-[min(640px,90dvh)] max-w-4xl flex-col gap-0 overflow-hidden rounded-xl border-border bg-background p-0 shadow-workspace sm:flex-row sm:rounded-xl">
        <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-shell p-3 sm:w-60 sm:flex-col sm:border-b-0 sm:border-r sm:p-4" aria-label="Settings sections">
          <DialogTitle className="hidden px-3 pb-4 pt-1 text-lg sm:block">Settings</DialogTitle>
          {tabs.map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-current={tab === t.id ? "page" : undefined}
               className={cn("flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", tab === t.id && "bg-card font-medium text-foreground shadow-card hover:bg-card")}>
              <t.icon className="size-4 shrink-0" />{t.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1 overflow-y-auto p-6 sm:p-8">
          <h2 className="text-xl font-semibold">{active.label}</h2>
          <DialogDescription className="mt-1">Saved locally.</DialogDescription>
          <div className="mt-6 grid gap-4">
            {tab === "general" && <>
              <Section title="Theme">
                 <div className="inline-flex rounded-lg border border-border bg-secondary/50 p-1">
                  {([["light", Sun, "Light"], ["dark", Moon, "Dark"], ["system", Monitor, "System"]] as const).map(([id, Icon, label]) => (
                    <button key={id} type="button" onClick={() => onThemeChange(id)} aria-pressed={theme === id}
                       className={cn("flex items-center gap-2 rounded-sm px-4 py-1.5 text-sm text-muted-foreground transition-colors", theme === id && "bg-card text-foreground shadow-card")}><Icon className="size-4" />{label}</button>
                  ))}
                </div>
              </Section>
              <Section title="Course artwork">
                <Button variant="outline" size="sm" asChild className="rounded-md">
                  <Link to="/admin" onClick={() => onOpenChange(false)}>
                    <Palette className="mr-2 size-4" /> Open generator
                  </Link>
                </Button>
              </Section>
              <Section title="Subtitle language">
                <Select defaultValue="en">
                   <SelectTrigger className="h-11 rounded-lg sm:w-72"><SelectValue /></SelectTrigger>
                   <SelectContent className="rounded-lg">
                    {[["en", "English"], ["ar-eg", "Egyptian Arabic"], ["ar-gulf", "Gulf Arabic"], ["es", "Spanish"], ["fr", "French"], ["de", "German"]].map(([v, l]) => <SelectItem key={v} value={v!}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Section>
              <Section title="Playback">
                <div className="flex items-center justify-between text-sm"><span>Default speed</span><span className="font-semibold">{speed.toFixed(2)}×</span></div>
                <Slider className="mt-3" min={1} max={2} step={0.25} value={[speed]} onValueChange={([v]) => setSpeed(v ?? 1)} aria-label="Default speed" />
                <div className="mt-4 divide-y divide-border">
                  <ToggleRow label="Autoplay next" defaultChecked />
                  <ToggleRow label="Autoscroll transcript" defaultChecked />
                  <ToggleRow label="Pause in background" />
                </div>
              </Section>
            </>}

            {tab === "ai" && <>
              <Section title="OpenRouter API key" description="Used for dialect translation.">
                <div className="flex flex-col gap-2 sm:flex-row">
                   <div className="flex h-11 flex-1 items-center rounded-lg border border-input bg-background pl-4 pr-1 focus-within:ring-2 focus-within:ring-ring">
                    <input type={showKey ? "text" : "password"} placeholder="sk-or-..." className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" onChange={() => setConn("idle")} />
                    <Button type="button" variant="ghost" size="icon" className="size-9 rounded-lg" aria-label={showKey ? "Hide key" : "Show key"} onClick={() => setShowKey(!showKey)}>{showKey ? <EyeOff /> : <Eye />}</Button>
                  </div>
                   <Button variant="outline" className="h-11 rounded-lg" onClick={() => { setConn("testing"); setTimeout(() => setConn("ok"), 900); }}>{conn === "testing" ? "Testing…" : "Test"}</Button>
                </div>
                {conn === "ok" && <div className="mt-3"><Pill>Connected • gpt-4o-mini</Pill></div>}
              </Section>
              <Section title="Neural punctuation" description="Runs on CPU without VRAM.">
                <Pill>Loaded (CPU On-demand • 35MB)</Pill>
              </Section>
            </>}

            {tab === "voice" && <>
              <Section title="Hardware device">
                <div className="grid gap-3 sm:grid-cols-2">
                  {([["gpu", Zap, "GPU / CUDA Acceleration", "Recommended"], ["cpu", Cpu, "CPU Mode", "Slower, no VRAM needed"]] as const).map(([id, Icon, label, sub]) => (
                    <button key={id} type="button" onClick={() => setDevice(id)} aria-pressed={device === id}
                       className={cn("flex items-start gap-3 rounded-lg border border-border p-4 text-left transition-all hover:bg-accent", device === id && "border-foreground/40 bg-secondary shadow-card")}>
                      <Icon className="mt-0.5 size-5 shrink-0" /><span><span className="block text-sm font-semibold">{label}</span><span className="text-xs text-muted-foreground">{sub}</span></span>
                    </button>
                  ))}
                </div>
                <div className="mt-4"><Pill>GeForce RTX • 8,192 MB VRAM (Free: 5,420 MB)</Pill></div>
              </Section>
              <Section title="Background audio separation"><ToggleRow label="Preserve background music and effects" defaultChecked /></Section>
              <Section title="Memory reaper"><ToggleRow label="Unload XTTS model after 5m idle" defaultChecked /></Section>
            </>}

            {tab === "storage" && <>
              <StorageRow title="Course vault path" value="C:\Users\Learner\TutIn\Courses" action="Browse" icon={<FolderOpen />} />
              <StorageRow title="Transcript cache" value="34.5 MB used" action="Clear cache" />
              <StorageRow title="Dubbed audio storage" value="480 MB audio generated" action="Manage" />
            </>}

            {tab === "about" && <>
              <Section title="TutIn" description="Local-first video study workspace.">
                 <div className="flex flex-wrap items-center gap-3"><Pill>Version 1.0.0 • Up to date</Pill><Button variant="outline" size="sm" className="rounded-md">Check updates</Button></div>
              </Section>
            </>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
