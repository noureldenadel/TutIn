import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bug,
  CheckCircle2,
  Database,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  Info,
  KeyRound,
  Keyboard,
  Lightbulb,
  MessageSquare,
  Mic,
  NotebookPen,
  RotateCcw,
  Send,
  Sliders,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/api";
import {
  COURSES_CHANGED_EVENT,
  COURSE_UPDATED_EVENT,
  fetchCourses,
  openFolderInExplorer,
  useCoursesList,
} from "@/lib/courses";
import { hydrateInstructorAvatars } from "@/components/layout/instructor-avatar";
import {
  clearAllSessionUiState,
  DEFAULT_APP_SETTINGS,
  DEFAULT_OPENROUTER_MODEL,
  THEME_PRESETS,
  hydrateAppSettingsFromServer,
  readAppSettings,
  writeAppSettings,
  type AppSettings,
  type ComputeDevice,
  type DubBackgroundMode,
  type DubVoiceEngine,
  type DubVoiceGender,
  type ThemeMode,
  type ThemePreset,
  type WhisperModelPreset,
} from "@/lib/app-settings";

export type { ThemeMode };
type FeedbackCategory = "Bug" | "Feature" | "General";

interface WorkspaceDataStats {
  coursesCount: number;
  notesCount: number | null;
}

interface DubHardwareInfo {
  service_running?: boolean;
  gpu_available?: boolean;
  gpu_name?: string | null;
  models?: {
    modelsDir?: string;
    totalMb?: number;
  };
}

const tabs = [
  { id: "general", label: "General", icon: Sliders },
  { id: "shortcuts", label: "Shortcuts", icon: Keyboard },
  { id: "ai", label: "AI & APIs", icon: KeyRound },
  { id: "voice", label: "Voice", icon: Mic },
  { id: "data", label: "Data", icon: Database },
  { id: "feedback", label: "Feedback", icon: MessageSquare },
  { id: "about", label: "About", icon: Info },
] as const;

type TabId = (typeof tabs)[number]["id"];

interface ShortcutGroup {
  title: string;
  items: { action: string; keys: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Player",
    items: [
      { action: "Play or pause", keys: "Space / K" },
      { action: "Temporary 2× speed", keys: "Hold Space / Video" },
      { action: "Seek back or forward 5s", keys: "Left / Right" },
      { action: "Seek back or forward 10s", keys: "J / L" },
      { action: "Step 1 frame (when paused)", keys: ", / ." },
      { action: "Volume up or down 5%", keys: "Up / Down" },
      { action: "Mute or unmute", keys: "M" },
      { action: "Toggle subtitles", keys: "C" },
      { action: "Toggle sidebar (Theater view)", keys: "T" },
      { action: "Picture-in-Picture", keys: "P / I" },
      { action: "Toggle fullscreen", keys: "F / Double-click" },
      { action: "Next or previous lesson", keys: "Shift+N / Shift+P" },
      { action: "Playback speed", keys: "< / >" },
      { action: "Jump to start, end, or 0%–90%", keys: "Home / End / 0–9" },
    ],
  },
  {
    title: "Course canvas",
    items: [
      { action: "Select or pan tool", keys: "V / H" },
      { action: "Temporary hand pan", keys: "Space + Drag" },
      { action: "Zoom in or out", keys: "Alt+Scroll / Alt+Middle-Drag" },
      { action: "Fit entire board to view", keys: "0" },
      { action: "New note or text card", keys: "N / T" },
      { action: "Edit selected card", keys: "Click / Enter" },
      { action: "Exit card edit (auto-saved)", keys: "Esc / Click away" },
      { action: "Connect cards", keys: "A" },
      { action: "Pen, highlighter, or eraser", keys: "P / M / E" },
      { action: "Upload image or new artboard", keys: "I / G" },
      { action: "Copy / Paste selection", keys: "Ctrl+C / Ctrl+V" },
      { action: "Duplicate selection", keys: "Alt + Drag" },
      { action: "Undo / Redo", keys: "Ctrl+Z / Ctrl+Shift+Z" },
      { action: "Delete selected item", keys: "Del / Backspace" },
      { action: "Reset tool or cancel link", keys: "Esc" },
    ],
  },
  {
    title: "Notes editor",
    items: [
      { action: "Save note", keys: "Ctrl + Enter" },
      { action: "Bold / Italic", keys: "Ctrl + B / I" },
      { action: "Code / Strikethrough / Highlight", keys: "Ctrl + E / Shift + X / H" },
      { action: "Toggle task checkbox", keys: "Ctrl + L" },
      { action: "Indent / Outdent list item", keys: "Tab / Shift + Tab" },
      { action: "Undo / Redo", keys: "Ctrl + Z / Shift + Z" },
      { action: "Move selected image", keys: "Alt + Up / Down" },
      { action: "Remove selected image", keys: "Del / Backspace" },
      { action: "Cancel editing", keys: "Esc" },
    ],
  },
  {
    title: "Navigation",
    items: [
      { action: "Focus library search", keys: "Ctrl + K" },
      { action: "Close open modal or lightbox", keys: "Esc" },
    ],
  },
];

function SegmentedControl<T extends string | number>({
  value,
  options,
  onChange,
  disabled = false,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center rounded-lg bg-secondary/75 p-1">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed",
            value === opt.value
              ? "bg-card text-foreground shadow-card dark:bg-accent"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function SettingsModal({
  open,
  onOpenChange,
  theme,
  isDark = false,
  onThemeChange,
  themePreset,
  onThemePresetChange,
  onOpenWelcomeGuide,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  theme: ThemeMode;
  isDark?: boolean;
  onThemeChange: (theme: ThemeMode) => void;
  themePreset: ThemePreset;
  onThemePresetChange: (preset: ThemePreset) => void;
  onOpenWelcomeGuide?: () => void;
}) {
  const { courses, refresh: refreshCourses } = useCoursesList();
  const [activeTab, setActiveTab] = useState<TabId>("general");
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [dataStats, setDataStats] = useState<WorkspaceDataStats>({
    coursesCount: courses.length,
    notesCount: null,
  });

  const [feedbackCategory, setFeedbackCategory] = useState<FeedbackCategory>("Bug");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackEmail, setFeedbackEmail] = useState("");
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);

  const [confirmResetAll, setConfirmResetAll] = useState(false);
  const [dataBusy, setDataBusy] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showGoogleApiKey, setShowGoogleApiKey] = useState(false);
  const [dubHardwareInfo, setDubHardwareInfo] = useState<DubHardwareInfo | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const loadDubHardwareInfo = useCallback(async (signal?: AbortSignal) => {
    const res = await apiRequest<DubHardwareInfo>(
      "/api/dub/gpu-info",
      signal ? { signal } : undefined,
    );
    if (signal?.aborted || res.aborted) return;
    if (res.ok && res.data) {
      setDubHardwareInfo(res.data);
    }
  }, []);

  const loadDataStats = useCallback(
    async (signal?: AbortSignal) => {
      const res = await apiRequest<{ totalNotes?: number }>(
        "/api/notes/stats",
        signal ? { signal } : undefined,
      );
      if (signal?.aborted || res.aborted) return;
      setDataStats({
        coursesCount: courses.length,
        notesCount: res.ok && typeof res.data?.totalNotes === "number" ? res.data.totalNotes : null,
      });
    },
    [courses.length],
  );

  useEffect(() => {
    if (!open) return;
    setSettings(readAppSettings());
    void hydrateAppSettingsFromServer().then(setSettings);
  }, [open]);

  useEffect(() => {
    setDataStats((prev) => ({ ...prev, coursesCount: courses.length }));
  }, [courses.length]);

  useEffect(() => {
    if (!open || activeTab !== "data") return;
    const controller = new AbortController();
    void loadDataStats(controller.signal);
    return () => controller.abort();
  }, [open, activeTab, loadDataStats]);

  useEffect(() => {
    if (!open || (activeTab !== "voice" && activeTab !== "data")) return;
    const controller = new AbortController();
    void loadDubHardwareInfo(controller.signal);
    return () => controller.abort();
  }, [open, activeTab, loadDubHardwareInfo]);

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    writeAppSettings(next);

    if (key === "dubComputingDevice" || key === "dubUnloadIdleModel") {
      void apiRequest("/api/dub/set-device", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device: next.dubComputingDevice,
          unloadIdleModel: next.dubUnloadIdleModel,
        }),
      });
    }

    if (key === "progressCalculationMode") {
      void apiRequest("/api/courses/recalculate-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: value }),
      }).then((res) => {
        if (!res.ok) return;
        window.dispatchEvent(new CustomEvent(COURSE_UPDATED_EVENT));
        void refreshCourses();
      });
    }
  };

  const handleExportBackup = async () => {
    setDataBusy(true);
    try {
      const res = await apiRequest<Record<string, unknown>>("/api/data/export");
      if (!res.ok || !res.data) {
        toast.error(res.error || "Failed to export workspace backup");
        return;
      }

      const payload = {
        app: "tutin",
        version: res.data["version"] ?? 5,
        exportedAt: new Date().toISOString(),
        serverBackup: res.data,
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `tutin_backup_${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Workspace backup exported");
    } finally {
      setDataBusy(false);
    }
  };

  const handleImportBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setDataBusy(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (!parsed || typeof parsed !== "object") {
        toast.error("Invalid backup format");
        return;
      }

      const rawBackup =
        parsed["serverBackup"] && typeof parsed["serverBackup"] === "object"
          ? (parsed["serverBackup"] as Record<string, unknown>)
          : parsed;

      const hasDatabaseTables =
        Array.isArray(rawBackup["courses"]) ||
        Array.isArray(rawBackup["notes"]) ||
        Array.isArray(rawBackup["roadmaps"]) ||
        Array.isArray(rawBackup["settings"]) ||
        Array.isArray(rawBackup["canvas_nodes"]);

      if (!hasDatabaseTables) {
        toast.error("Unrecognized backup file");
        return;
      }

      const res = await apiRequest("/api/data/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rawBackup),
      });

      if (!res.ok) {
        toast.error(res.error || "Failed to import backup");
        return;
      }

      const [nextSettings] = await Promise.all([
        hydrateAppSettingsFromServer(true),
        hydrateInstructorAvatars(true),
        fetchCourses(true),
      ]);
      setSettings(nextSettings);
      if (
        nextSettings.theme === "light" ||
        nextSettings.theme === "dark" ||
        nextSettings.theme === "system"
      ) {
        onThemeChange(nextSettings.theme);
      }
      onThemePresetChange(nextSettings.themePreset);

      window.dispatchEvent(new CustomEvent(COURSES_CHANGED_EVENT));
      window.dispatchEvent(new CustomEvent(COURSE_UPDATED_EVENT));
      await loadDataStats();
      toast.success("Workspace backup restored");
    } catch {
      toast.error("Failed to parse backup file");
    } finally {
      setDataBusy(false);
    }
  };

  const handleResetAllData = async () => {
    setDataBusy(true);
    try {
      const res = await apiRequest("/api/data/reset", { method: "DELETE" });
      if (!res.ok) {
        toast.error(res.error || "Could not clear workspace data");
        return;
      }

      const keysToRemove: string[] = [];
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith("tutin")) keysToRemove.push(key);
      }
      keysToRemove.forEach((key) => window.localStorage.removeItem(key));
      clearAllSessionUiState();

      writeAppSettings(DEFAULT_APP_SETTINGS, { skipServerSync: true });
      setSettings(DEFAULT_APP_SETTINGS);
      onThemeChange("system");
      onThemePresetChange(DEFAULT_APP_SETTINGS.themePreset);

      await Promise.all([hydrateInstructorAvatars(true), fetchCourses(true)]);
      window.dispatchEvent(new CustomEvent(COURSES_CHANGED_EVENT));
      window.dispatchEvent(new CustomEvent(COURSE_UPDATED_EVENT));
      setDataStats({ coursesCount: 0, notesCount: 0 });
      setConfirmResetAll(false);
      onOpenChange(false);
      toast.success("Workspace data cleared");
    } catch {
      setConfirmResetAll(false);
      toast.error("Could not clear all data");
    } finally {
      setDataBusy(false);
    }
  };

  const handleResetDefaults = () => {
    setSettings(DEFAULT_APP_SETTINGS);
    writeAppSettings(DEFAULT_APP_SETTINGS);
    onThemeChange("system");
    onThemePresetChange(DEFAULT_APP_SETTINGS.themePreset);
    toast.success("Preferences reset to defaults");
  };

  const handleSendFeedback = async () => {
    if (!feedbackMessage.trim() || sendingFeedback) return;
    setSendingFeedback(true);
    try {
      const res = await fetch("https://formspree.io/f/xojownzg", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          category: feedbackCategory,
          message: feedbackMessage,
          email: feedbackEmail.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Request failed");
      setFeedbackSent(true);
      toast.success("Feedback sent");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send feedback");
    } finally {
      setSendingFeedback(false);
    }
  };

  const currentTabMeta = tabs.find((t) => t.id === activeTab) ?? tabs[0];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[min(640px,90dvh)] max-w-4xl flex-col gap-0 overflow-hidden rounded-xl border-0 bg-background p-0 shadow-workspace sm:flex-row sm:rounded-xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>
              Manage preferences, shortcuts, AI, voice, and data.
            </DialogDescription>
          </DialogHeader>

          <aside className="flex shrink-0 flex-row gap-1 overflow-x-auto border-b border-border/50 bg-shell p-3 pr-12 scrollbar-none sm:w-56 sm:flex-col sm:border-b-0 sm:border-r sm:p-4">
            <p className="hidden px-2.5 pb-2 pt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:block">
              Settings
            </p>
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors sm:gap-2.5 sm:px-3 sm:text-sm",
                    isActive
                      ? "bg-card text-foreground shadow-card"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </aside>

          <div className="flex min-h-0 flex-1 flex-col">
            <header className="shrink-0 border-b border-border/50 px-4 py-3.5 sm:px-7 sm:py-4 sm:pr-12">
              <h2 className="text-base font-semibold">{currentTabMeta.label}</h2>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 custom-scrollbar sm:px-7 sm:py-5">
              {activeTab === "general" && (
                <div className="divide-y divide-border/50">
                  <div className="flex flex-col gap-2.5 pb-5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <Label className="text-sm font-medium">Appearance</Label>
                    <SegmentedControl<ThemeMode>
                      value={theme}
                      onChange={onThemeChange}
                      options={[
                        { value: "light", label: "Light" },
                        { value: "dark", label: "Dark" },
                        { value: "system", label: "System" },
                      ]}
                    />
                  </div>

                  <div className="space-y-3 py-5">
                    <Label className="text-sm font-medium">Theme</Label>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {THEME_PRESETS.map((preset) => {
                        const selected = themePreset === preset.id;
                        const swatch = isDark ? preset.darkSwatch : preset.lightSwatch;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => onThemePresetChange(preset.id)}
                            aria-pressed={selected}
                            className={cn(
                              "flex flex-col gap-2 rounded-lg px-3 py-2.5 text-left transition-all",
                              selected
                                ? "bg-card text-foreground shadow-card ring-1 ring-foreground/25 dark:bg-accent"
                                : "bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground",
                            )}
                          >
                            <span
                              className="flex h-4 w-full overflow-hidden rounded-[4px] ring-1 ring-border/70"
                              aria-hidden="true"
                            >
                              <span className="flex-1" style={{ backgroundColor: swatch[0] }} />
                              <span className="flex-1" style={{ backgroundColor: swatch[1] }} />
                              <span className="flex-1" style={{ backgroundColor: swatch[2] }} />
                            </span>
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-xs font-semibold text-foreground">
                                {preset.label}
                              </span>
                              <span className="truncate text-[10.5px] text-muted-foreground">
                                {preset.hint.split(" · ")[1] ?? preset.hint}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 py-5">
                    <div className="space-y-0.5">
                      <Label htmlFor="resume-playback" className="text-sm font-medium">
                        Resume playback
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Start videos from your last saved timestamp
                      </p>
                    </div>
                    <Switch
                      id="resume-playback"
                      checked={settings.resumePlayback}
                      onCheckedChange={(v) => updateSetting("resumePlayback", v)}
                    />
                  </div>

                  <div className="flex flex-col gap-2.5 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Auto-mark complete</Label>
                      <p className="text-xs text-muted-foreground">
                        Mark lesson done after threshold
                      </p>
                    </div>
                    <SegmentedControl<90 | 95 | 100>
                      value={settings.autoMarkCompleteAt}
                      onChange={(v) => updateSetting("autoMarkCompleteAt", v)}
                      options={[
                        { value: 90, label: "90%" },
                        { value: 95, label: "95%" },
                        { value: 100, label: "100%" },
                      ]}
                    />
                  </div>

                  <div className="flex flex-col gap-2.5 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Progress mode</Label>
                      <p className="text-xs text-muted-foreground">
                        Calculate course progress by lessons or total duration
                      </p>
                    </div>
                    <SegmentedControl<"videos" | "duration">
                      value={settings.progressCalculationMode}
                      onChange={(v) => updateSetting("progressCalculationMode", v)}
                      options={[
                        { value: "videos", label: "Videos" },
                        { value: "duration", label: "Duration" },
                      ]}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-4 pt-5">
                    <div className="space-y-0.5">
                      <Label htmlFor="auto-thumbs" className="text-sm font-medium">
                        Auto-detect covers
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Match folder artwork during course scans
                      </p>
                    </div>
                    <Switch
                      id="auto-thumbs"
                      checked={settings.autoDetectThumbnails}
                      onCheckedChange={(v) => updateSetting("autoDetectThumbnails", v)}
                    />
                  </div>
                </div>
              )}

              {activeTab === "shortcuts" && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between gap-4 border-b border-border/50 pb-5">
                    <div className="space-y-0.5">
                      <Label htmlFor="player-shortcuts" className="text-sm font-medium">
                        Playback keyboard shortcuts
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Disables single-key video controls when turned off
                      </p>
                    </div>
                    <Switch
                      id="player-shortcuts"
                      checked={settings.playerShortcutsEnabled}
                      onCheckedChange={(v) => updateSetting("playerShortcutsEnabled", v)}
                    />
                  </div>

                  <div className="space-y-5">
                    {SHORTCUT_GROUPS.map((group) => (
                      <section key={group.title} className="space-y-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {group.title}
                        </h3>
                        <div className="divide-y divide-border/50 rounded-lg border border-border/50 bg-secondary/20">
                          {group.items.map((item) => (
                            <div
                              key={item.action}
                              className="flex items-center justify-between gap-4 px-3.5 py-2.5 text-sm"
                            >
                              <span className="text-foreground/90">{item.action}</span>
                              <kbd className="shrink-0 rounded bg-secondary px-2 py-0.5 font-mono text-[11px] font-medium text-foreground">
                                {item.keys}
                              </kbd>
                            </div>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "ai" && (
                <div className="divide-y divide-border/50">
                  <div className="flex flex-col gap-2.5 pb-5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Transcription device</Label>
                      <p className="text-xs text-muted-foreground">
                        Hardware used for Whisper speech recognition
                      </p>
                    </div>
                    <SegmentedControl<ComputeDevice>
                      value={settings.computeDevice}
                      onChange={(v) => updateSetting("computeDevice", v)}
                      options={[
                        { value: "auto", label: "Auto" },
                        { value: "gpu", label: "GPU" },
                        { value: "cpu", label: "CPU" },
                      ]}
                    />
                  </div>

                  <div className="flex flex-col gap-2.5 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Whisper model</Label>
                      <p className="text-xs text-muted-foreground">
                        Balance transcription speed and accuracy
                      </p>
                    </div>
                    <SegmentedControl<WhisperModelPreset>
                      value={settings.whisperModel}
                      onChange={(v) => updateSetting("whisperModel", v)}
                      options={[
                        { value: "whisper-base", label: "Balanced" },
                        { value: "whisper-small", label: "Enhanced" },
                        { value: "faster-whisper-large-v3-turbo", label: "Studio" },
                      ]}
                    />
                  </div>

                  <div className="space-y-2 py-5">
                    <Label htmlFor="openrouter-model" className="text-sm font-medium">
                      OpenRouter model
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Used for regional Arabic dialect translations (Egyptian &amp; Saudi)
                    </p>
                    <div className="flex gap-2">
                      <Input
                        id="openrouter-model"
                        value={settings.openRouterModel}
                        onChange={(e) => updateSetting("openRouterModel", e.target.value)}
                        placeholder={DEFAULT_OPENROUTER_MODEL}
                        className="font-mono text-xs"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => updateSetting("openRouterModel", DEFAULT_OPENROUTER_MODEL)}
                      >
                        Reset
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2 py-5">
                    <Label htmlFor="openrouter-key" className="text-sm font-medium">
                      OpenRouter API key
                    </Label>
                    <div className="relative">
                      <Input
                        id="openrouter-key"
                        type={showApiKey ? "text" : "password"}
                        value={settings.openRouterApiKey}
                        onChange={(e) => updateSetting("openRouterApiKey", e.target.value)}
                        placeholder="sk-or-v1-..."
                        className="pr-9 font-mono text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey((s) => !s)}
                        aria-label={showApiKey ? "Hide API key" : "Show API key"}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 pt-5">
                    <Label htmlFor="google-api-key" className="text-sm font-medium">
                      Google API key
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Used for YouTube playlists and Google Drive folder scans
                    </p>
                    <div className="relative">
                      <Input
                        id="google-api-key"
                        type={showGoogleApiKey ? "text" : "password"}
                        value={settings.googleApiKey}
                        onChange={(e) => updateSetting("googleApiKey", e.target.value)}
                        placeholder="AIza..."
                        className="pr-9 font-mono text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setShowGoogleApiKey((s) => !s)}
                        aria-label={showGoogleApiKey ? "Hide API key" : "Show API key"}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showGoogleApiKey ? (
                          <EyeOff className="size-4" />
                        ) : (
                          <Eye className="size-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "voice" && (
                <div className="divide-y divide-border/50">
                  <div className="flex flex-col gap-2.5 pb-5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Voice engine</Label>
                      <p className="text-xs text-muted-foreground">
                        Fast neural voices or local instructor voice cloning
                      </p>
                    </div>
                    <SegmentedControl<DubVoiceEngine>
                      value={settings.dubVoiceEngine}
                      onChange={(v) => updateSetting("dubVoiceEngine", v)}
                      options={[
                        { value: "neural", label: "Neural · Fast" },
                        { value: "clone", label: "Clone" },
                      ]}
                    />
                  </div>

                  <div className="flex flex-col gap-2.5 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Neural voice</Label>
                      <p className="text-xs text-muted-foreground">
                        Default voice profile when using Neural engine
                      </p>
                    </div>
                    <SegmentedControl<DubVoiceGender>
                      value={settings.dubVoiceGender}
                      onChange={(v) => updateSetting("dubVoiceGender", v)}
                      options={[
                        { value: "male", label: "Male" },
                        { value: "female", label: "Female" },
                      ]}
                    />
                  </div>

                  <div className="flex flex-col gap-2.5 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Background audio</Label>
                      <p className="text-xs text-muted-foreground">
                        Mute original track or preserve music &amp; SFX
                      </p>
                    </div>
                    <SegmentedControl<DubBackgroundMode>
                      value={settings.dubBgMode}
                      onChange={(v) => updateSetting("dubBgMode", v)}
                      options={[
                        { value: "none", label: "Off" },
                        { value: "demucs", label: "Music & SFX" },
                      ]}
                    />
                  </div>

                  <div className="flex flex-col gap-2.5 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Cloning device</Label>
                      <p className="text-xs text-muted-foreground">
                        {dubHardwareInfo?.gpu_name
                          ? `Detected: ${dubHardwareInfo.gpu_name}`
                          : "Hardware used for voice cloning & music separation"}
                      </p>
                    </div>
                    <SegmentedControl<ComputeDevice>
                      value={settings.dubComputingDevice}
                      onChange={(v) => updateSetting("dubComputingDevice", v)}
                      options={[
                        { value: "auto", label: "Auto" },
                        { value: "gpu", label: "GPU" },
                        { value: "cpu", label: "CPU" },
                      ]}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-4 py-5">
                    <div className="space-y-0.5">
                      <Label htmlFor="unload-xtts" className="text-sm font-medium">
                        Unload idle voice model
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Release GPU memory automatically after dubbing finishes
                      </p>
                    </div>
                    <Switch
                      id="unload-xtts"
                      checked={settings.dubUnloadIdleModel}
                      onCheckedChange={(v) => updateSetting("dubUnloadIdleModel", v)}
                    />
                  </div>

                  {dubHardwareInfo?.models && (
                    <div className="flex items-center justify-between gap-4 pt-5">
                      <div className="space-y-0.5">
                        <span className="text-sm font-medium">Local AI models</span>
                        <p className="font-mono text-xs tabular-nums text-muted-foreground">
                          {(dubHardwareInfo.models.totalMb ?? 0) >= 1024
                            ? `${((dubHardwareInfo.models.totalMb ?? 0) / 1024).toFixed(2)} GB used`
                            : `${Math.round(dubHardwareInfo.models.totalMb ?? 0)} MB used`}
                        </p>
                      </div>
                      {dubHardwareInfo.models.modelsDir && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            void openFolderInExplorer(dubHardwareInfo.models!.modelsDir!)
                          }
                        >
                          <FolderOpen className="size-3.5" />
                          Open folder
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "data" && (
                <div className="space-y-6">
                  <div className="divide-y divide-border/50">
                    <div className="flex items-center justify-between pb-4">
                      <div className="flex items-center gap-2.5 text-sm">
                        <FolderOpen className="size-4 text-muted-foreground" />
                        <span>Courses</span>
                      </div>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {dataStats.coursesCount}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-4">
                      <div className="flex items-center gap-2.5 text-sm">
                        <NotebookPen className="size-4 text-muted-foreground" />
                        <span>Notes</span>
                      </div>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {dataStats.notesCount ?? "—"}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2.5 border-t border-border/50 pt-5">
                    <span className="text-sm font-medium">Workspace backup</span>
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={dataBusy}
                        onClick={() => void handleExportBackup()}
                        className="justify-start gap-2"
                      >
                        <Download className="size-4" />
                        Export JSON
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={dataBusy}
                        onClick={() => importInputRef.current?.click()}
                        className="justify-start gap-2"
                      >
                        <Upload className="size-4" />
                        Import JSON
                      </Button>
                      <input
                        ref={importInputRef}
                        type="file"
                        accept=".json,application/json"
                        onChange={(e) => void handleImportBackup(e)}
                        className="hidden"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/25 bg-destructive/5 p-4">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium text-destructive">Reset workspace</p>
                      <p className="text-xs text-muted-foreground">
                        Delete courses, notes, canvases, and preferences
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={dataBusy}
                      onClick={() => setConfirmResetAll(true)}
                    >
                      Reset data
                    </Button>
                  </div>
                </div>
              )}

              {activeTab === "feedback" &&
                (feedbackSent ? (
                  <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 text-center">
                    <CheckCircle2 className="size-8 text-chart-4" />
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">Feedback sent</p>
                      <p className="text-xs text-muted-foreground">
                        Thank you for helping improve TutIn.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setFeedbackSent(false);
                        setFeedbackMessage("");
                      }}
                    >
                      Send another
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Category</Label>
                      <div className="grid grid-cols-3 gap-2">
                        {(
                          [
                            { value: "Bug", icon: Bug },
                            { value: "Feature", icon: Lightbulb },
                            { value: "General", icon: MessageSquare },
                          ] as const
                        ).map((cat) => {
                          const Icon = cat.icon;
                          const selected = feedbackCategory === cat.value;
                          return (
                            <button
                              key={cat.value}
                              type="button"
                              onClick={() => setFeedbackCategory(cat.value)}
                              className={cn(
                                "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                                selected
                                  ? "border-foreground/30 bg-card text-foreground shadow-card"
                                  : "border-border/60 bg-secondary/30 text-muted-foreground hover:text-foreground",
                              )}
                            >
                              <Icon className="size-3.5" />
                              <span>{cat.value}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="feedback-message" className="text-sm font-medium">
                        Message
                      </Label>
                      <Textarea
                        id="feedback-message"
                        rows={5}
                        value={feedbackMessage}
                        onChange={(e) => setFeedbackMessage(e.target.value)}
                        placeholder={
                          feedbackCategory === "Bug"
                            ? "What happened and what did you expect?"
                            : feedbackCategory === "Feature"
                              ? "What would make TutIn more useful?"
                              : "Share a thought or question..."
                        }
                        className="resize-none text-sm"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="feedback-email" className="text-sm font-medium">
                        Email
                      </Label>
                      <Input
                        id="feedback-email"
                        type="email"
                        value={feedbackEmail}
                        onChange={(e) => setFeedbackEmail(e.target.value)}
                        placeholder="Optional reply address"
                      />
                    </div>

                    <Button
                      type="button"
                      disabled={!feedbackMessage.trim() || sendingFeedback}
                      onClick={() => void handleSendFeedback()}
                      className="w-full gap-2"
                    >
                      <Send className="size-4" />
                      {sendingFeedback ? "Sending..." : "Send feedback"}
                    </Button>
                  </div>
                ))}

              {activeTab === "about" && (
                <div className="divide-y divide-border/50">
                  <div className="space-y-1 pb-5">
                    <p className="text-sm font-semibold">TutIn v8.0 Beta</p>
                    <p className="text-xs text-muted-foreground">
                      Offline-first course library, player, rich notes, and visual canvas workspace.
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-4 py-5">
                    <div className="space-y-0.5">
                      <span className="text-sm font-medium">Welcome guide</span>
                      <p className="text-xs text-muted-foreground">
                        Replay the 4-step workspace tour
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        onOpenChange(false);
                        onOpenWelcomeGuide?.();
                      }}
                    >
                      Open guide
                    </Button>
                  </div>

                  <div className="flex items-center justify-between gap-4 pt-5">
                    <div className="space-y-0.5">
                      <span className="text-sm font-medium">App updates</span>
                      <p className="text-xs text-muted-foreground">Current build: 8.0.0-beta</p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => toast.info("TutIn v8.0 Beta is up to date.")}
                    >
                      Check updates
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <footer className="flex shrink-0 items-center justify-between border-t border-border/50 bg-shell/40 px-6 py-3 sm:px-7">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleResetDefaults}
                className="gap-1.5 text-muted-foreground"
              >
                <RotateCcw className="size-3.5" />
                Reset defaults
              </Button>
              <Button type="button" size="sm" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </footer>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmResetAll} onOpenChange={setConfirmResetAll}>
        <AlertDialogContent className="rounded-xl border-0 shadow-workspace">
          <AlertDialogHeader>
            <AlertDialogTitle>Reset workspace data?</AlertDialogTitle>
            <AlertDialogDescription>
              Courses, notes, canvases, roadmaps, and preferences will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleResetAllData()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Reset data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
