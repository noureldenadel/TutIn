import { useState, type ReactNode } from "react";
import { Check, Cpu, Database, Eye, EyeOff, FolderOpen, Info, KeyRound, Mic, Monitor, Moon, Sliders, Sun, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
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
    <div className="py-5 first:pt-0 last:pb-0">
      <h3 className="text-sm font-semibold">{title}</h3>
      {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      <div className="mt-3.5">{children}</div>
    </div>
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
     <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0"><p className="text-sm font-semibold">{title}</p><p className="mt-1 truncate font-mono text-xs text-muted-foreground">{value}</p></div>
       <Button variant="secondary" size="sm" className="shrink-0 rounded-md gap-1.5">{icon}{action}</Button>
    </div>
  );
}

export function SettingsModal({ open, onOpenChange, theme, onThemeChange }: { open: boolean; onOpenChange: (o: boolean) => void; theme: ThemeMode; onThemeChange: (t: ThemeMode) => void }) {
  const [tab, setTab] = useState<TabId>("general");
  const [showKey, setShowKey] = useState(false);
  const [conn, setConn] = useState<"idle" | "testing" | "ok">("idle");
  const [device, setDevice] = useState<"gpu" | "cpu">("gpu");
  const active = tabs.find((t) => t.id === tab)!;

  const [settings, setSettings] = useState(() => {
    if (typeof window === "undefined") {
      return {
        resumePlayback: true,
        autoMarkCompleteAt: 95,
        progressCalculationMode: "videos" as "videos" | "duration",
      };
    }
    try {
      const saved = localStorage.getItem("tutin_settings");
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          resumePlayback: parsed.resumePlayback !== undefined ? Boolean(parsed.resumePlayback) : true,
          autoMarkCompleteAt: [90, 95, 100].includes(parsed.autoMarkCompleteAt) ? parsed.autoMarkCompleteAt : 95,
          progressCalculationMode: parsed.progressCalculationMode === "duration" ? ("duration" as const) : ("videos" as const),
        };
      }
    } catch {
      // fallback
    }
    return {
      resumePlayback: true,
      autoMarkCompleteAt: 95,
      progressCalculationMode: "videos" as "videos" | "duration",
    };
  });

  const updateSetting = <K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      try {
        const existing = localStorage.getItem("tutin_settings");
        const parsed = existing ? JSON.parse(existing) : {};
        parsed[key] = value;
        localStorage.setItem("tutin_settings", JSON.stringify(parsed));
        window.dispatchEvent(new CustomEvent("tutin:settings_changed", { detail: { key, value } }));
      } catch {
        // ignore
      }
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
       <DialogContent className="flex h-[min(640px,90dvh)] max-w-4xl flex-col gap-0 overflow-hidden rounded-xl border-0 bg-background p-0 shadow-workspace sm:flex-row sm:rounded-xl">
        <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-border/50 bg-shell p-3 sm:w-60 sm:flex-col sm:border-b-0 sm:border-r sm:border-border/50 sm:p-4 scrollbar-none" aria-label="Settings sections">
          <DialogTitle className="hidden px-3 pb-4 pt-1 text-lg sm:block">Settings</DialogTitle>
          {tabs.map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-current={tab === t.id ? "page" : undefined}
               className={cn("flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", tab === t.id && "bg-card font-medium text-foreground shadow-card hover:bg-card")}>
              <t.icon className="size-4 shrink-0" />{t.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1 overflow-y-auto p-6 sm:p-8 custom-scrollbar">
          <h2 className="text-xl font-semibold">{active.label}</h2>
          <DialogDescription className="sr-only">Settings</DialogDescription>
          <div className="mt-4 divide-y divide-border/50">
            {tab === "general" && <>
              <Section title="Theme">
                 <div className="inline-flex rounded-lg bg-secondary/75 p-1">
                  {([["light", Sun, "Light"], ["dark", Moon, "Dark"], ["system", Monitor, "System"]] as const).map(([id, Icon, label]) => (
                    <button key={id} type="button" onClick={() => onThemeChange(id)} aria-pressed={theme === id}
                       className={cn("flex items-center gap-2 rounded-sm px-4 py-1.5 text-sm text-muted-foreground transition-colors", theme === id && "bg-card text-foreground shadow-card")}><Icon className="size-4" />{label}</button>
                  ))}
                </div>
              </Section>
              <Section title="Playback">
                <label className="flex cursor-pointer items-center justify-between gap-4 py-1 text-sm">
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-foreground">Resume playback</span>
                    <p className="mt-0.5 text-xs text-muted-foreground">Continue from where you left off</p>
                  </div>
                  <Switch
                    checked={settings.resumePlayback}
                    onCheckedChange={(checked) => updateSetting("resumePlayback", checked)}
                  />
                </label>
              </Section>
              <Section
                title="Mark complete when watched"
                description="Automatically mark a lesson as completed when reaching this percentage."
              >
                <div className="grid grid-cols-3 gap-2.5 sm:max-w-xs">
                  {([90, 95, 100] as const).map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => updateSetting("autoMarkCompleteAt", val)}
                      aria-pressed={settings.autoMarkCompleteAt === val}
                      className={cn(
                        "flex h-9 items-center justify-center rounded-lg text-sm font-medium transition-colors",
                        settings.autoMarkCompleteAt === val
                          ? "bg-primary-soft font-semibold text-primary ring-1 ring-primary/35 shadow-xs"
                          : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      )}
                    >
                      {val}%
                    </button>
                  ))}
                </div>
              </Section>
              <Section title="Progress calculation">
                <div className="space-y-2">
                  {[
                    {
                      value: "videos" as const,
                      label: "By Videos Completed",
                      description: "Count of completed videos ÷ total videos",
                    },
                    {
                      value: "duration" as const,
                      label: "By Completed Duration",
                      description: "Duration of completed videos ÷ total course duration",
                    },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        updateSetting("progressCalculationMode", opt.value);
                        fetch("/api/courses/recalculate-progress", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ mode: opt.value }),
                        }).catch(() => {});
                      }}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg p-3.5 text-left transition-colors",
                        settings.progressCalculationMode === opt.value
                          ? "bg-primary-soft/75 ring-1 ring-primary/35"
                          : "bg-secondary/50 hover:bg-secondary/80"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-foreground">{opt.label}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">{opt.description}</div>
                      </div>
                      {settings.progressCalculationMode === opt.value && (
                        <Check className="ml-3 size-4 shrink-0 text-primary" />
                      )}
                    </button>
                  ))}
                </div>
              </Section>
            </>}

            {tab === "ai" && <>
              <Section title="OpenRouter API key" description="Used for dialect translation.">
                <div className="flex flex-col gap-2 sm:flex-row">
                   <div className="flex h-11 flex-1 items-center rounded-lg bg-secondary/75 pl-4 pr-1 transition-colors focus-within:bg-card focus-within:ring-2 focus-within:ring-ring">
                    <input type={showKey ? "text" : "password"} placeholder="sk-or-..." className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" onChange={() => setConn("idle")} />
                    <Button type="button" variant="ghost" size="icon" className="size-9 rounded-lg" aria-label={showKey ? "Hide key" : "Show key"} onClick={() => setShowKey(!showKey)}>{showKey ? <EyeOff /> : <Eye />}</Button>
                  </div>
                   <Button variant="secondary" className="h-11 rounded-lg" onClick={() => { setConn("testing"); setTimeout(() => setConn("ok"), 900); }}>{conn === "testing" ? "Testing…" : "Test"}</Button>
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
                       className={cn("flex items-start gap-3 rounded-lg bg-secondary/40 p-3.5 text-left transition-colors hover:bg-secondary", device === id && "bg-secondary ring-1 ring-primary/40")}>
                      <Icon className="mt-0.5 size-5 shrink-0 text-foreground" /><span><span className="block text-sm font-semibold text-foreground">{label}</span><span className="text-xs text-muted-foreground">{sub}</span></span>
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
                 <div className="flex flex-wrap items-center gap-3"><Pill>Version 1.0.0 • Up to date</Pill><Button variant="secondary" size="sm" className="rounded-md">Check updates</Button></div>
              </Section>
            </>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
