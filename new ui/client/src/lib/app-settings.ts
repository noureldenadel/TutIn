import { apiRequest } from "@/lib/api";

export type ThemeMode = "light" | "dark" | "system";
export type ComputeDevice = "auto" | "gpu" | "cpu";
export type WhisperModelPreset = "whisper-base" | "whisper-small" | "faster-whisper-large-v3-turbo";

export interface AppSettings {
  theme: ThemeMode;
  autoPlay: boolean;
  resumePlayback: boolean;
  autoMarkCompleteAt: 90 | 95 | 100;
  progressCalculationMode: "videos" | "duration";
  autoDetectThumbnails: boolean;
  playbackSpeed: number;
  skipDuration: number;
  autoPauseOnNotes: boolean;
  playerShortcutsEnabled: boolean;
  openRouterApiKey: string;
  openRouterModel: string;
  computeDevice: ComputeDevice;
  whisperModel: WhisperModelPreset;
}

export const SETTINGS_STORAGE_KEY = "tutin_settings";
export const SETTINGS_CHANGED_EVENT = "tutin:settings_changed";
export const WELCOME_SEEN_KEY = "tutin_welcome_seen";
export const DEFAULT_OPENROUTER_MODEL = "openai/gpt-4o-mini";

export const DEFAULT_APP_SETTINGS: AppSettings = {
  theme: "system",
  autoPlay: true,
  resumePlayback: true,
  autoMarkCompleteAt: 95,
  progressCalculationMode: "videos",
  autoDetectThumbnails: true,
  playbackSpeed: 1,
  skipDuration: 10,
  autoPauseOnNotes: false,
  playerShortcutsEnabled: true,
  openRouterApiKey: "",
  openRouterModel: DEFAULT_OPENROUTER_MODEL,
  computeDevice: "auto",
  whisperModel: "whisper-base",
};

let pendingSyncTimer: number | null = null;
let hydrationPromise: Promise<AppSettings> | null = null;

function sanitizeSettings(raw: Partial<AppSettings> | null | undefined): AppSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_APP_SETTINGS };

  const theme: ThemeMode =
    raw.theme === "light" || raw.theme === "dark" || raw.theme === "system"
      ? raw.theme
      : DEFAULT_APP_SETTINGS.theme;

  const computeDevice: ComputeDevice =
    raw.computeDevice === "auto" || raw.computeDevice === "gpu" || raw.computeDevice === "cpu"
      ? raw.computeDevice
      : DEFAULT_APP_SETTINGS.computeDevice;

  const whisperModel: WhisperModelPreset =
    raw.whisperModel === "whisper-base" ||
    raw.whisperModel === "whisper-small" ||
    raw.whisperModel === "faster-whisper-large-v3-turbo"
      ? raw.whisperModel
      : DEFAULT_APP_SETTINGS.whisperModel;

  const autoMarkCompleteAt: 90 | 95 | 100 =
    raw.autoMarkCompleteAt === 90 || raw.autoMarkCompleteAt === 95 || raw.autoMarkCompleteAt === 100
      ? raw.autoMarkCompleteAt
      : DEFAULT_APP_SETTINGS.autoMarkCompleteAt;

  const progressCalculationMode: "videos" | "duration" =
    raw.progressCalculationMode === "duration" || raw.progressCalculationMode === "videos"
      ? raw.progressCalculationMode
      : DEFAULT_APP_SETTINGS.progressCalculationMode;

  const speed = Number(raw.playbackSpeed);
  const skip = Number(raw.skipDuration);

  return {
    theme,
    autoPlay: typeof raw.autoPlay === "boolean" ? raw.autoPlay : DEFAULT_APP_SETTINGS.autoPlay,
    resumePlayback:
      typeof raw.resumePlayback === "boolean"
        ? raw.resumePlayback
        : DEFAULT_APP_SETTINGS.resumePlayback,
    autoMarkCompleteAt,
    progressCalculationMode,
    autoDetectThumbnails:
      typeof raw.autoDetectThumbnails === "boolean"
        ? raw.autoDetectThumbnails
        : DEFAULT_APP_SETTINGS.autoDetectThumbnails,
    playbackSpeed:
      Number.isFinite(speed) && speed >= 0.25 && speed <= 4
        ? speed
        : DEFAULT_APP_SETTINGS.playbackSpeed,
    skipDuration:
      Number.isFinite(skip) && skip >= 1 && skip <= 120 ? skip : DEFAULT_APP_SETTINGS.skipDuration,
    autoPauseOnNotes:
      typeof raw.autoPauseOnNotes === "boolean"
        ? raw.autoPauseOnNotes
        : DEFAULT_APP_SETTINGS.autoPauseOnNotes,
    playerShortcutsEnabled:
      typeof raw.playerShortcutsEnabled === "boolean"
        ? raw.playerShortcutsEnabled
        : DEFAULT_APP_SETTINGS.playerShortcutsEnabled,
    openRouterApiKey:
      typeof raw.openRouterApiKey === "string"
        ? raw.openRouterApiKey
        : DEFAULT_APP_SETTINGS.openRouterApiKey,
    openRouterModel:
      typeof raw.openRouterModel === "string" && raw.openRouterModel.trim()
        ? raw.openRouterModel
        : DEFAULT_APP_SETTINGS.openRouterModel,
    computeDevice,
    whisperModel,
  };
}

export function readAppSettings(): AppSettings {
  if (typeof window === "undefined") return { ...DEFAULT_APP_SETTINGS };
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_APP_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return sanitizeSettings(parsed);
  } catch {
    return { ...DEFAULT_APP_SETTINGS };
  }
}

function scheduleServerSettingsSync(next: AppSettings): void {
  if (typeof window === "undefined") return;
  if (pendingSyncTimer !== null) {
    window.clearTimeout(pendingSyncTimer);
  }
  pendingSyncTimer = window.setTimeout(() => {
    pendingSyncTimer = null;
    void apiRequest("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appSettings: next,
        theme: next.theme,
        autoPlay: next.autoPlay,
        resumePlayback: next.resumePlayback,
        autoMarkCompleteAt: next.autoMarkCompleteAt,
        progressCalculationMode: next.progressCalculationMode,
        autoDetectThumbnails: next.autoDetectThumbnails,
        playbackSpeed: next.playbackSpeed,
        skipDuration: next.skipDuration,
        autoPauseOnNotes: next.autoPauseOnNotes,
        playerShortcutsEnabled: next.playerShortcutsEnabled,
        openRouterApiKey: next.openRouterApiKey,
        openRouterModel: next.openRouterModel,
        computeDevice: next.computeDevice,
        whisperModel: next.whisperModel,
      }),
    });
  }, 180);
}

export function writeAppSettings(next: AppSettings, options?: { skipServerSync?: boolean }): void {
  const sanitized = sanitizeSettings(next);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(sanitized));
    window.dispatchEvent(new CustomEvent(SETTINGS_CHANGED_EVENT, { detail: sanitized }));
  } catch {
    // ignore storage failures
  }
  if (!options?.skipServerSync) {
    scheduleServerSettingsSync(sanitized);
  }
}

export async function hydrateAppSettingsFromServer(force = false): Promise<AppSettings> {
  if (typeof window === "undefined") return { ...DEFAULT_APP_SETTINGS };
  if (hydrationPromise && !force) return hydrationPromise;

  hydrationPromise = (async () => {
    const current = readAppSettings();
    try {
      const res = await apiRequest<Record<string, unknown>>("/api/settings");
      if (!res.ok || !res.data) return current;

      const serverData = res.data;
      const serverAppSettings =
        serverData["appSettings"] && typeof serverData["appSettings"] === "object"
          ? (serverData["appSettings"] as Partial<AppSettings>)
          : {};

      const merged = sanitizeSettings({
        ...current,
        ...serverAppSettings,
        ...(typeof serverData["theme"] === "string"
          ? { theme: serverData["theme"] as ThemeMode }
          : {}),
        ...(typeof serverData["autoPlay"] === "boolean"
          ? { autoPlay: serverData["autoPlay"] }
          : {}),
        ...(typeof serverData["resumePlayback"] === "boolean"
          ? { resumePlayback: serverData["resumePlayback"] }
          : {}),
        ...(serverData["autoMarkCompleteAt"] === 90 ||
        serverData["autoMarkCompleteAt"] === 95 ||
        serverData["autoMarkCompleteAt"] === 100
          ? { autoMarkCompleteAt: serverData["autoMarkCompleteAt"] as 90 | 95 | 100 }
          : {}),
        ...(serverData["progressCalculationMode"] === "videos" ||
        serverData["progressCalculationMode"] === "duration"
          ? {
              progressCalculationMode: serverData["progressCalculationMode"] as
                "videos" | "duration",
            }
          : {}),
        ...(typeof serverData["autoDetectThumbnails"] === "boolean"
          ? { autoDetectThumbnails: serverData["autoDetectThumbnails"] }
          : {}),
        ...(typeof serverData["playbackSpeed"] === "number"
          ? { playbackSpeed: serverData["playbackSpeed"] }
          : {}),
        ...(typeof serverData["skipDuration"] === "number"
          ? { skipDuration: serverData["skipDuration"] }
          : {}),
        ...(typeof serverData["autoPauseOnNotes"] === "boolean"
          ? { autoPauseOnNotes: serverData["autoPauseOnNotes"] }
          : {}),
        ...(typeof serverData["playerShortcutsEnabled"] === "boolean"
          ? { playerShortcutsEnabled: serverData["playerShortcutsEnabled"] }
          : {}),
      });

      writeAppSettings(merged, { skipServerSync: true });

      if (typeof serverData["welcomeSeen"] === "boolean" && serverData["welcomeSeen"]) {
        try {
          window.localStorage.setItem(WELCOME_SEEN_KEY, "true");
        } catch {
          // ignore
        }
      }

      return merged;
    } catch {
      return current;
    }
  })().finally(() => {
    hydrationPromise = null;
  });

  return hydrationPromise;
}

export function isWelcomeGuideSeen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(WELCOME_SEEN_KEY) === "true";
  } catch {
    return true;
  }
}

export function markWelcomeGuideSeen(seen = true): void {
  if (typeof window === "undefined") return;
  try {
    if (seen) {
      window.localStorage.setItem(WELCOME_SEEN_KEY, "true");
    } else {
      window.localStorage.removeItem(WELCOME_SEEN_KEY);
    }
  } catch {
    // ignore
  }
  void apiRequest("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ welcomeSeen: seen }),
  });
}

export function arePlayerShortcutsEnabled(): boolean {
  return readAppSettings().playerShortcutsEnabled;
}
