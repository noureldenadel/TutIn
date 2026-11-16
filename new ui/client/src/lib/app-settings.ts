import { apiRequest } from "@/lib/api";

export type ThemeMode = "light" | "dark" | "system";
export type ThemePreset = "obsidian" | "zinc" | "neutral" | "stone" | "graphite" | "classic";
export type ComputeDevice = "auto" | "gpu" | "cpu";
export type WhisperModelPreset = "whisper-base" | "whisper-small" | "faster-whisper-large-v3-turbo";
export type CaptionFontSize = "small" | "medium" | "large";

export interface CaptionPosition {
  x: number;
  y: number;
}

export interface ThemePresetOption {
  id: ThemePreset;
  label: string;
  hint: string;
  lightSwatch: readonly [string, string, string];
  darkSwatch: readonly [string, string, string];
}

export const THEME_PRESETS: readonly ThemePresetOption[] = [
  {
    id: "obsidian",
    label: "Obsidian",
    hint: "Cool slate · Linear style",
    lightSwatch: ["#e7eaed", "#f1f3f6", "#fcfdfe"],
    darkSwatch: ["#0c0d10", "#14161a", "#e7eaed"],
  },
  {
    id: "zinc",
    label: "Zinc",
    hint: "Cool metal · shadcn style",
    lightSwatch: ["#ebebee", "#f5f5f6", "#fdfdfe"],
    darkSwatch: ["#0f0f11", "#18181b", "#eaeaed"],
  },
  {
    id: "neutral",
    label: "Neutral",
    hint: "Pure grey · Vercel style",
    lightSwatch: ["#ebebeb", "#f4f4f4", "#fdfdfd"],
    darkSwatch: ["#0e0e0e", "#171717", "#e9e9e9"],
  },
  {
    id: "stone",
    label: "Stone",
    hint: "Warm paper · Notion style",
    lightSwatch: ["#eceae6", "#f5f3f0", "#fdfcfa"],
    darkSwatch: ["#161513", "#201e1c", "#e8e6e2"],
  },
  {
    id: "graphite",
    label: "Graphite",
    hint: "Studio charcoal · macOS style",
    lightSwatch: ["#e8eaec", "#f1f2f4", "#fcfcfd"],
    darkSwatch: ["#18191b", "#212325", "#e9ebed"],
  },
  {
    id: "classic",
    label: "Classic",
    hint: "Previous TutIn greyscale",
    lightSwatch: ["#f0f1f2", "#fafafb", "#fdfefe"],
    darkSwatch: ["#131416", "#1c1d20", "#bbbec2"],
  },
];

export const THEME_PRESET_STORAGE_KEY = "tutin-theme-preset";

export function isThemePreset(value: unknown): value is ThemePreset {
  return (
    value === "obsidian" ||
    value === "zinc" ||
    value === "neutral" ||
    value === "stone" ||
    value === "graphite" ||
    value === "classic"
  );
}

export interface AppSettings {
  theme: ThemeMode;
  themePreset: ThemePreset;
  autoPlay: boolean;
  resumePlayback: boolean;
  autoMarkCompleteAt: 90 | 95 | 100;
  progressCalculationMode: "videos" | "duration";
  autoDetectThumbnails: boolean;
  playbackSpeed: number;
  skipDuration: number;
  autoPauseOnNotes: boolean;
  notesSmartPauseEnabled: boolean;
  notesSmartPauseDelay: number;
  notesSmartPauseRewind: boolean;
  notesAutocompleteEnabled: boolean;
  playerShortcutsEnabled: boolean;
  openRouterApiKey: string;
  openRouterModel: string;
  googleApiKey: string;
  computeDevice: ComputeDevice;
  whisperModel: WhisperModelPreset;
  captionFontSize: CaptionFontSize;
  captionBackground: boolean;
  captionPosition: CaptionPosition | null;
}

export const SETTINGS_STORAGE_KEY = "tutin_settings";
export const SETTINGS_CHANGED_EVENT = "tutin:settings_changed";
export const WELCOME_SEEN_KEY = "tutin_welcome_seen";
export const GOOGLE_API_KEY_STORAGE = "tutin_google_api_key";
export const YT_API_KEY_STORAGE = "tutin_yt_api_key";
export const GDRIVE_API_KEY_STORAGE = "tutin_gdrive_api_key";
export const DEFAULT_OPENROUTER_MODEL = "openai/gpt-4o-mini";

export const DEFAULT_APP_SETTINGS: AppSettings = {
  theme: "system",
  themePreset: "obsidian",
  autoPlay: true,
  resumePlayback: true,
  autoMarkCompleteAt: 95,
  progressCalculationMode: "videos",
  autoDetectThumbnails: true,
  playbackSpeed: 1,
  skipDuration: 10,
  autoPauseOnNotes: false,
  notesSmartPauseEnabled: true,
  notesSmartPauseDelay: 2.5,
  notesSmartPauseRewind: true,
  notesAutocompleteEnabled: true,
  playerShortcutsEnabled: true,
  openRouterApiKey: "",
  openRouterModel: DEFAULT_OPENROUTER_MODEL,
  googleApiKey: "",
  computeDevice: "auto",
  whisperModel: "whisper-base",
  captionFontSize: "medium",
  captionBackground: true,
  captionPosition: null,
};

function sanitizeCaptionPosition(raw: unknown): CaptionPosition | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as { x?: unknown; y?: unknown };
  if (
    typeof candidate.x === "number" &&
    Number.isFinite(candidate.x) &&
    typeof candidate.y === "number" &&
    Number.isFinite(candidate.y)
  ) {
    return {
      x: Math.max(5, Math.min(95, candidate.x)),
      y: Math.max(5, Math.min(95, candidate.y)),
    };
  }
  return null;
}

let pendingSyncTimer: number | null = null;
let pendingSyncSnapshot: AppSettings | null = null;
let hydrationPromise: Promise<AppSettings> | null = null;
let pageHideListenerRegistered = false;

function sanitizeSettings(raw: Partial<AppSettings> | null | undefined): AppSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_APP_SETTINGS };

  const theme: ThemeMode =
    raw.theme === "light" || raw.theme === "dark" || raw.theme === "system"
      ? raw.theme
      : DEFAULT_APP_SETTINGS.theme;

  const themePreset: ThemePreset = isThemePreset(raw.themePreset)
    ? raw.themePreset
    : DEFAULT_APP_SETTINGS.themePreset;

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
  const notesSmartPauseDelay = Number(raw.notesSmartPauseDelay);

  return {
    theme,
    themePreset,
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
    notesSmartPauseEnabled:
      typeof raw.notesSmartPauseEnabled === "boolean"
        ? raw.notesSmartPauseEnabled
        : DEFAULT_APP_SETTINGS.notesSmartPauseEnabled,
    notesSmartPauseDelay:
      Number.isFinite(notesSmartPauseDelay) &&
      notesSmartPauseDelay >= 0.5 &&
      notesSmartPauseDelay <= 30
        ? Math.round(notesSmartPauseDelay * 10) / 10
        : DEFAULT_APP_SETTINGS.notesSmartPauseDelay,
    notesSmartPauseRewind:
      typeof raw.notesSmartPauseRewind === "boolean"
        ? raw.notesSmartPauseRewind
        : DEFAULT_APP_SETTINGS.notesSmartPauseRewind,
    notesAutocompleteEnabled:
      typeof raw.notesAutocompleteEnabled === "boolean"
        ? raw.notesAutocompleteEnabled
        : DEFAULT_APP_SETTINGS.notesAutocompleteEnabled,
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
    googleApiKey: (() => {
      const legacy = raw as Partial<{ youtubeApiKey?: string; googleDriveApiKey?: string }>;
      if (typeof raw.googleApiKey === "string" && raw.googleApiKey) return raw.googleApiKey;
      if (typeof legacy.youtubeApiKey === "string" && legacy.youtubeApiKey) {
        return legacy.youtubeApiKey;
      }
      if (typeof legacy.googleDriveApiKey === "string" && legacy.googleDriveApiKey) {
        return legacy.googleDriveApiKey;
      }
      return DEFAULT_APP_SETTINGS.googleApiKey;
    })(),
    computeDevice,
    whisperModel,
    captionFontSize:
      raw.captionFontSize === "small" ||
      raw.captionFontSize === "medium" ||
      raw.captionFontSize === "large"
        ? raw.captionFontSize
        : DEFAULT_APP_SETTINGS.captionFontSize,
    captionBackground:
      typeof raw.captionBackground === "boolean"
        ? raw.captionBackground
        : DEFAULT_APP_SETTINGS.captionBackground,
    captionPosition: sanitizeCaptionPosition(raw.captionPosition),
  };
}

export function readAppSettings(): AppSettings {
  if (typeof window === "undefined") return { ...DEFAULT_APP_SETTINGS };
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<AppSettings>) : {};
    const sanitized = sanitizeSettings(parsed);
    if (!parsed.themePreset) {
      const storedPreset = window.localStorage.getItem(THEME_PRESET_STORAGE_KEY);
      if (isThemePreset(storedPreset)) sanitized.themePreset = storedPreset;
    }
    // Migrate legacy standalone Google/YouTube/Drive keys written before consolidation
    if (!sanitized.googleApiKey) {
      const legacyKey =
        window.localStorage.getItem(GOOGLE_API_KEY_STORAGE)?.trim() ||
        window.localStorage.getItem(YT_API_KEY_STORAGE)?.trim() ||
        window.localStorage.getItem(GDRIVE_API_KEY_STORAGE)?.trim();
      if (legacyKey) sanitized.googleApiKey = legacyKey;
    }
    return sanitized;
  } catch {
    return { ...DEFAULT_APP_SETTINGS };
  }
}

function flushPendingServerSettingsSync(): void {
  if (typeof window === "undefined") return;
  if (pendingSyncTimer !== null) {
    window.clearTimeout(pendingSyncTimer);
    pendingSyncTimer = null;
  }
  const snapshot = pendingSyncSnapshot;
  pendingSyncSnapshot = null;
  if (!snapshot) return;
  void apiRequest("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      appSettings: snapshot,
      ...snapshot,
    }),
  });
}

function scheduleServerSettingsSync(next: AppSettings): void {
  if (typeof window === "undefined") return;
  pendingSyncSnapshot = next;
  if (!pageHideListenerRegistered) {
    pageHideListenerRegistered = true;
    window.addEventListener("pagehide", flushPendingServerSettingsSync);
  }
  if (pendingSyncTimer !== null) {
    window.clearTimeout(pendingSyncTimer);
  }
  pendingSyncTimer = window.setTimeout(() => {
    flushPendingServerSettingsSync();
  }, 180);
}

export function writeAppSettings(next: AppSettings, options?: { skipServerSync?: boolean }): void {
  const sanitized = sanitizeSettings(next);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(sanitized));
    window.localStorage.setItem(THEME_PRESET_STORAGE_KEY, sanitized.themePreset);
    const trimmedGoogleKey = sanitized.googleApiKey.trim();
    if (trimmedGoogleKey) {
      window.localStorage.setItem(GOOGLE_API_KEY_STORAGE, trimmedGoogleKey);
      window.localStorage.setItem(YT_API_KEY_STORAGE, trimmedGoogleKey);
      window.localStorage.setItem(GDRIVE_API_KEY_STORAGE, trimmedGoogleKey);
    } else {
      window.localStorage.removeItem(GOOGLE_API_KEY_STORAGE);
      window.localStorage.removeItem(YT_API_KEY_STORAGE);
      window.localStorage.removeItem(GDRIVE_API_KEY_STORAGE);
    }
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
        ...(isThemePreset(serverData["themePreset"])
          ? { themePreset: serverData["themePreset"] }
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
        ...(typeof serverData["notesSmartPauseEnabled"] === "boolean"
          ? { notesSmartPauseEnabled: serverData["notesSmartPauseEnabled"] }
          : {}),
        ...(typeof serverData["notesSmartPauseDelay"] === "number"
          ? { notesSmartPauseDelay: serverData["notesSmartPauseDelay"] }
          : {}),
        ...(typeof serverData["notesSmartPauseRewind"] === "boolean"
          ? { notesSmartPauseRewind: serverData["notesSmartPauseRewind"] }
          : {}),
        ...(typeof serverData["notesAutocompleteEnabled"] === "boolean"
          ? { notesAutocompleteEnabled: serverData["notesAutocompleteEnabled"] }
          : {}),
        ...(typeof serverData["playerShortcutsEnabled"] === "boolean"
          ? { playerShortcutsEnabled: serverData["playerShortcutsEnabled"] }
          : {}),
        ...(serverData["captionFontSize"] === "small" ||
        serverData["captionFontSize"] === "medium" ||
        serverData["captionFontSize"] === "large"
          ? { captionFontSize: serverData["captionFontSize"] as CaptionFontSize }
          : {}),
        ...(typeof serverData["captionBackground"] === "boolean"
          ? { captionBackground: serverData["captionBackground"] }
          : {}),
        ...("captionPosition" in serverData
          ? { captionPosition: sanitizeCaptionPosition(serverData["captionPosition"]) }
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
