import { apiRequest } from "@/lib/api";

export type ThemeMode = "light" | "dark" | "system";
export type ThemePreset = "obsidian" | "zinc" | "neutral" | "stone" | "graphite" | "classic";
export type ComputeDevice = "auto" | "gpu" | "cpu";
export type WhisperModelPreset = "whisper-base" | "whisper-small" | "faster-whisper-large-v3-turbo";
export type DubVoiceEngine = "neural" | "clone";
export type DubVoiceGender = "male" | "female";
export type DubBackgroundMode = "none" | "demucs";
export type CaptionFontSize = "small" | "medium" | "large";
export type NotesSortOrder = "asc" | "desc";
export type LibrarySortPreference = "Recent" | "Progress" | "A–Z";
export type AnalyticsRangePreference = "1y" | "3m";
export type CourseSidebarTab = "playlist" | "notes" | "transcript";

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
  playerVolume: number;
  playerMuted: boolean;
  playerRemainingTime: boolean;
  playerSidebarOpen: boolean;
  autoPauseOnNotes: boolean;
  notesSortOrder: NotesSortOrder;
  notesSmartPauseEnabled: boolean;
  notesSmartPauseDelay: number;
  notesSmartPauseRewind: boolean;
  notesAutocompleteEnabled: boolean;
  playerShortcutsEnabled: boolean;
  librarySort: LibrarySortPreference;
  analyticsRange: AnalyticsRangePreference;
  openRouterApiKey: string;
  openRouterModel: string;
  googleApiKey: string;
  computeDevice: ComputeDevice;
  whisperModel: WhisperModelPreset;
  dubVoiceEngine: DubVoiceEngine;
  dubVoiceGender: DubVoiceGender;
  dubBgMode: DubBackgroundMode;
  dubComputingDevice: ComputeDevice;
  dubUnloadIdleModel: boolean;
  captionFontSize: CaptionFontSize;
  captionBackground: boolean;
  captionPosition: CaptionPosition | null;
}

export interface CourseUiPrefs {
  activeTab?: CourseSidebarTab | undefined;
  lastVideoId?: string | undefined;
  openModules?: Record<string, boolean> | undefined;
  subtitleTrack?: string | undefined;
  transcriptLang?: string | undefined;
  dubLang?: string | undefined;
  updatedAt?: number | undefined;
}

export interface SessionNoteDraft {
  mode: "add" | "edit";
  editingNoteId: string | null;
  content: string;
  timestamp: number | null;
}

export interface SessionFilterState {
  homeFilter?: string | undefined;
  homeQuery?: string | undefined;
  instructorsQuery?: string | undefined;
  historyDateFilter?: "All Time" | "This Week" | "This Month" | undefined;
  historyQuery?: string | undefined;
}

export const SETTINGS_STORAGE_KEY = "tutin_settings";
export const SETTINGS_CHANGED_EVENT = "tutin:settings_changed";
export const COURSE_UI_PREFS_STORAGE_KEY = "tutin_course_ui_prefs";
export const COURSE_UI_PREFS_CHANGED_EVENT = "tutin:course_ui_prefs_changed";
export const SESSION_SCROLL_STORAGE_KEY = "tutin_session_scroll";
export const SESSION_NOTE_DRAFTS_STORAGE_KEY = "tutin_session_note_drafts";
export const SESSION_FILTERS_STORAGE_KEY = "tutin_session_filters";
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
  playerVolume: 0.8,
  playerMuted: false,
  playerRemainingTime: false,
  playerSidebarOpen: true,
  autoPauseOnNotes: false,
  notesSortOrder: "asc",
  notesSmartPauseEnabled: true,
  notesSmartPauseDelay: 2.5,
  notesSmartPauseRewind: true,
  notesAutocompleteEnabled: true,
  playerShortcutsEnabled: true,
  librarySort: "Recent",
  analyticsRange: "1y",
  openRouterApiKey: "",
  openRouterModel: DEFAULT_OPENROUTER_MODEL,
  googleApiKey: "",
  computeDevice: "auto",
  whisperModel: "whisper-base",
  dubVoiceEngine: "neural",
  dubVoiceGender: "male",
  dubBgMode: "none",
  dubComputingDevice: "auto",
  dubUnloadIdleModel: true,
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
let pendingCoursePrefsSyncTimer: number | null = null;
let pendingCoursePrefsSnapshot: Record<string, CourseUiPrefs> | null = null;
let hydrationPromise: Promise<AppSettings> | null = null;
let pageHideListenerRegistered = false;
let courseDeletedListenerRegistered = false;

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

  const notesSortOrder: NotesSortOrder =
    raw.notesSortOrder === "asc" || raw.notesSortOrder === "desc"
      ? raw.notesSortOrder
      : DEFAULT_APP_SETTINGS.notesSortOrder;

  const librarySort: LibrarySortPreference =
    raw.librarySort === "Recent" || raw.librarySort === "Progress" || raw.librarySort === "A–Z"
      ? raw.librarySort
      : DEFAULT_APP_SETTINGS.librarySort;

  const analyticsRange: AnalyticsRangePreference =
    raw.analyticsRange === "1y" || raw.analyticsRange === "3m"
      ? raw.analyticsRange
      : DEFAULT_APP_SETTINGS.analyticsRange;

  const speed = Number(raw.playbackSpeed);
  const skip = Number(raw.skipDuration);
  const volume = Number(raw.playerVolume);
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
    playerVolume:
      Number.isFinite(volume) && volume >= 0 && volume <= 1
        ? Math.round(volume * 100) / 100
        : DEFAULT_APP_SETTINGS.playerVolume,
    playerMuted:
      typeof raw.playerMuted === "boolean" ? raw.playerMuted : DEFAULT_APP_SETTINGS.playerMuted,
    playerRemainingTime:
      typeof raw.playerRemainingTime === "boolean"
        ? raw.playerRemainingTime
        : DEFAULT_APP_SETTINGS.playerRemainingTime,
    playerSidebarOpen:
      typeof raw.playerSidebarOpen === "boolean"
        ? raw.playerSidebarOpen
        : DEFAULT_APP_SETTINGS.playerSidebarOpen,
    autoPauseOnNotes:
      typeof raw.autoPauseOnNotes === "boolean"
        ? raw.autoPauseOnNotes
        : DEFAULT_APP_SETTINGS.autoPauseOnNotes,
    notesSortOrder,
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
    librarySort,
    analyticsRange,
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
    dubVoiceEngine:
      raw.dubVoiceEngine === "clone" || raw.dubVoiceEngine === "neural"
        ? raw.dubVoiceEngine
        : DEFAULT_APP_SETTINGS.dubVoiceEngine,
    dubVoiceGender:
      raw.dubVoiceGender === "female" || raw.dubVoiceGender === "male"
        ? raw.dubVoiceGender
        : DEFAULT_APP_SETTINGS.dubVoiceGender,
    dubBgMode:
      raw.dubBgMode === "demucs" || raw.dubBgMode === "none"
        ? raw.dubBgMode
        : DEFAULT_APP_SETTINGS.dubBgMode,
    dubComputingDevice:
      raw.dubComputingDevice === "auto" ||
      raw.dubComputingDevice === "gpu" ||
      raw.dubComputingDevice === "cpu"
        ? raw.dubComputingDevice
        : DEFAULT_APP_SETTINGS.dubComputingDevice,
    dubUnloadIdleModel:
      typeof raw.dubUnloadIdleModel === "boolean"
        ? raw.dubUnloadIdleModel
        : DEFAULT_APP_SETTINGS.dubUnloadIdleModel,
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

function flushPendingCoursePrefsSync(): void {
  if (typeof window === "undefined") return;
  if (pendingCoursePrefsSyncTimer !== null) {
    window.clearTimeout(pendingCoursePrefsSyncTimer);
    pendingCoursePrefsSyncTimer = null;
  }
  const snapshot = pendingCoursePrefsSnapshot;
  pendingCoursePrefsSnapshot = null;
  if (!snapshot) return;
  void apiRequest("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      courseUiPrefs: snapshot,
    }),
  });
}

function registerLifecycleSyncListeners(): void {
  if (typeof window === "undefined") return;
  if (!pageHideListenerRegistered) {
    pageHideListenerRegistered = true;
    window.addEventListener("pagehide", () => {
      flushPendingServerSettingsSync();
      flushPendingCoursePrefsSync();
    });
  }
  if (!courseDeletedListenerRegistered) {
    courseDeletedListenerRegistered = true;
    window.addEventListener("tutin:course_deleted", (e: Event) => {
      const courseId = (e as CustomEvent<{ courseId?: string }>).detail?.courseId;
      if (courseId) {
        removeCourseUiPrefs(String(courseId));
      }
    });
  }
}

function scheduleServerSettingsSync(next: AppSettings): void {
  if (typeof window === "undefined") return;
  pendingSyncSnapshot = next;
  registerLifecycleSyncListeners();
  if (pendingSyncTimer !== null) {
    window.clearTimeout(pendingSyncTimer);
  }
  pendingSyncTimer = window.setTimeout(() => {
    flushPendingServerSettingsSync();
  }, 180);
}

function scheduleCoursePrefsServerSync(nextMap: Record<string, CourseUiPrefs>): void {
  if (typeof window === "undefined") return;
  pendingCoursePrefsSnapshot = nextMap;
  registerLifecycleSyncListeners();
  if (pendingCoursePrefsSyncTimer !== null) {
    window.clearTimeout(pendingCoursePrefsSyncTimer);
  }
  pendingCoursePrefsSyncTimer = window.setTimeout(() => {
    flushPendingCoursePrefsSync();
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

function sanitizeCourseUiPref(raw: unknown): CourseUiPrefs | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Record<string, unknown>;
  const out: CourseUiPrefs = {};

  if (
    candidate["activeTab"] === "playlist" ||
    candidate["activeTab"] === "notes" ||
    candidate["activeTab"] === "transcript"
  ) {
    out.activeTab = candidate["activeTab"];
  }
  if (typeof candidate["lastVideoId"] === "string" && candidate["lastVideoId"].trim()) {
    out.lastVideoId = candidate["lastVideoId"].trim();
  }
  if (candidate["openModules"] && typeof candidate["openModules"] === "object") {
    const map: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(candidate["openModules"] as Record<string, unknown>)) {
      if (k && typeof v === "boolean") {
        map[k] = v;
      }
    }
    out.openModules = map;
  }
  if (typeof candidate["subtitleTrack"] === "string" && candidate["subtitleTrack"].trim()) {
    out.subtitleTrack = candidate["subtitleTrack"].trim();
  }
  if (typeof candidate["transcriptLang"] === "string" && candidate["transcriptLang"].trim()) {
    out.transcriptLang = candidate["transcriptLang"].trim();
  }
  if (typeof candidate["dubLang"] === "string" && candidate["dubLang"].trim()) {
    out.dubLang = candidate["dubLang"].trim();
  }
  if (typeof candidate["updatedAt"] === "number" && Number.isFinite(candidate["updatedAt"])) {
    out.updatedAt = candidate["updatedAt"];
  }
  return out;
}

function readAllCourseUiPrefsMap(): Record<string, CourseUiPrefs> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(COURSE_UI_PREFS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const result: Record<string, CourseUiPrefs> = {};
    for (const [courseId, val] of Object.entries(parsed as Record<string, unknown>)) {
      const clean = sanitizeCourseUiPref(val);
      if (courseId && clean) {
        result[courseId] = clean;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function writeAllCourseUiPrefsMap(
  nextMap: Record<string, CourseUiPrefs>,
  options?: { skipServerSync?: boolean },
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COURSE_UI_PREFS_STORAGE_KEY, JSON.stringify(nextMap));
  } catch {
    // ignore storage failures
  }
  if (!options?.skipServerSync) {
    scheduleCoursePrefsServerSync(nextMap);
  }
}

export function readCourseUiPrefs(courseId: string): CourseUiPrefs {
  if (!courseId) return {};
  const all = readAllCourseUiPrefsMap();
  return all[String(courseId)] ?? {};
}

export function updateCourseUiPrefs(
  courseId: string,
  patch: Partial<CourseUiPrefs>,
): CourseUiPrefs {
  const key = String(courseId);
  if (!key || typeof window === "undefined") return {};
  const all = readAllCourseUiPrefsMap();
  const prev = all[key] ?? {};
  const mergedOpenModules =
    patch.openModules !== undefined
      ? { ...(prev.openModules ?? {}), ...patch.openModules }
      : prev.openModules;
  const nextPref: CourseUiPrefs = {
    ...prev,
    ...patch,
    ...(mergedOpenModules ? { openModules: mergedOpenModules } : {}),
    updatedAt: Date.now(),
  };
  all[key] = nextPref;
  writeAllCourseUiPrefsMap(all);
  window.dispatchEvent(
    new CustomEvent(COURSE_UI_PREFS_CHANGED_EVENT, {
      detail: { courseId: key, prefs: nextPref },
    }),
  );
  return nextPref;
}

export function removeCourseUiPrefs(courseId: string): void {
  const key = String(courseId);
  if (!key || typeof window === "undefined") return;
  const all = readAllCourseUiPrefsMap();
  if (key in all) {
    delete all[key];
    writeAllCourseUiPrefsMap(all);
  }
  clearCourseSessionUiState(key);
}

export async function hydrateAppSettingsFromServer(force = false): Promise<AppSettings> {
  if (typeof window === "undefined") return { ...DEFAULT_APP_SETTINGS };
  registerLifecycleSyncListeners();
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
        ...(typeof serverData["playerVolume"] === "number"
          ? { playerVolume: serverData["playerVolume"] }
          : {}),
        ...(typeof serverData["playerMuted"] === "boolean"
          ? { playerMuted: serverData["playerMuted"] }
          : {}),
        ...(typeof serverData["playerRemainingTime"] === "boolean"
          ? { playerRemainingTime: serverData["playerRemainingTime"] }
          : {}),
        ...(typeof serverData["playerSidebarOpen"] === "boolean"
          ? { playerSidebarOpen: serverData["playerSidebarOpen"] }
          : {}),
        ...(typeof serverData["autoPauseOnNotes"] === "boolean"
          ? { autoPauseOnNotes: serverData["autoPauseOnNotes"] }
          : {}),
        ...(serverData["notesSortOrder"] === "asc" || serverData["notesSortOrder"] === "desc"
          ? { notesSortOrder: serverData["notesSortOrder"] as NotesSortOrder }
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
        ...(serverData["librarySort"] === "Recent" ||
        serverData["librarySort"] === "Progress" ||
        serverData["librarySort"] === "A–Z"
          ? { librarySort: serverData["librarySort"] as LibrarySortPreference }
          : {}),
        ...(serverData["analyticsRange"] === "1y" || serverData["analyticsRange"] === "3m"
          ? { analyticsRange: serverData["analyticsRange"] as AnalyticsRangePreference }
          : {}),
        ...(serverData["captionFontSize"] === "small" ||
        serverData["captionFontSize"] === "medium" ||
        serverData["captionFontSize"] === "large"
          ? { captionFontSize: serverData["captionFontSize"] as CaptionFontSize }
          : {}),
        ...(serverData["dubVoiceEngine"] === "neural" || serverData["dubVoiceEngine"] === "clone"
          ? { dubVoiceEngine: serverData["dubVoiceEngine"] as DubVoiceEngine }
          : {}),
        ...(serverData["dubVoiceGender"] === "male" || serverData["dubVoiceGender"] === "female"
          ? { dubVoiceGender: serverData["dubVoiceGender"] as DubVoiceGender }
          : {}),
        ...(serverData["dubBgMode"] === "none" || serverData["dubBgMode"] === "demucs"
          ? { dubBgMode: serverData["dubBgMode"] as DubBackgroundMode }
          : serverData["dubBgMode"] === "ducking"
            ? { dubBgMode: "none" as DubBackgroundMode }
            : {}),
        ...(serverData["dubComputingDevice"] === "auto" ||
        serverData["dubComputingDevice"] === "gpu" ||
        serverData["dubComputingDevice"] === "cpu"
          ? { dubComputingDevice: serverData["dubComputingDevice"] as ComputeDevice }
          : {}),
        ...(typeof serverData["dubUnloadIdleModel"] === "boolean"
          ? { dubUnloadIdleModel: serverData["dubUnloadIdleModel"] }
          : {}),
        ...(typeof serverData["captionBackground"] === "boolean"
          ? { captionBackground: serverData["captionBackground"] }
          : {}),
        ...("captionPosition" in serverData
          ? { captionPosition: sanitizeCaptionPosition(serverData["captionPosition"]) }
          : {}),
      });

      writeAppSettings(merged, { skipServerSync: true });

      if (serverData["courseUiPrefs"] && typeof serverData["courseUiPrefs"] === "object") {
        const localCoursePrefs = readAllCourseUiPrefsMap();
        const serverCoursePrefs = serverData["courseUiPrefs"] as Record<string, unknown>;
        const mergedCoursePrefs: Record<string, CourseUiPrefs> = { ...localCoursePrefs };
        for (const [cid, rawPref] of Object.entries(serverCoursePrefs)) {
          const cleanServer = sanitizeCourseUiPref(rawPref);
          if (!cid || !cleanServer) continue;
          const existingLocal = localCoursePrefs[cid];
          if (!existingLocal || (cleanServer.updatedAt ?? 0) >= (existingLocal.updatedAt ?? 0)) {
            mergedCoursePrefs[cid] = {
              ...existingLocal,
              ...cleanServer,
              openModules: {
                ...(existingLocal?.openModules ?? {}),
                ...(cleanServer.openModules ?? {}),
              },
            };
          }
        }
        writeAllCourseUiPrefsMap(mergedCoursePrefs, { skipServerSync: true });
      }

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

function readSessionJsonMap<T>(storageKey: string): Record<string, T> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, T>) : {};
  } catch {
    return {};
  }
}

function writeSessionJsonMap<T>(storageKey: string, map: Record<string, T>): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(map));
  } catch {
    // ignore storage failures
  }
}

export function readSessionScroll(key: string): number | null {
  if (!key) return null;
  const map = readSessionJsonMap<number>(SESSION_SCROLL_STORAGE_KEY);
  const val = map[key];
  return typeof val === "number" && Number.isFinite(val) && val >= 0 ? val : null;
}

export function writeSessionScroll(key: string, scrollTop: number): void {
  if (!key || !Number.isFinite(scrollTop) || scrollTop < 0) return;
  const map = readSessionJsonMap<number>(SESSION_SCROLL_STORAGE_KEY);
  const rounded = Math.round(scrollTop);
  if (map[key] === rounded) return;
  map[key] = rounded;
  writeSessionJsonMap(SESSION_SCROLL_STORAGE_KEY, map);
}

export function readSessionNoteDraft(courseId: string, lessonKey: string): SessionNoteDraft | null {
  const compositeKey = `${courseId}:${lessonKey}`;
  const map = readSessionJsonMap<SessionNoteDraft>(SESSION_NOTE_DRAFTS_STORAGE_KEY);
  const draft = map[compositeKey];
  if (!draft || typeof draft !== "object") return null;
  if (draft.mode !== "add" && draft.mode !== "edit") return null;
  return {
    mode: draft.mode,
    editingNoteId: typeof draft.editingNoteId === "string" ? draft.editingNoteId : null,
    content: typeof draft.content === "string" ? draft.content : "",
    timestamp:
      typeof draft.timestamp === "number" && Number.isFinite(draft.timestamp)
        ? draft.timestamp
        : null,
  };
}

export function writeSessionNoteDraft(
  courseId: string,
  lessonKey: string,
  draft: SessionNoteDraft | null,
): void {
  if (!courseId || !lessonKey) return;
  const compositeKey = `${courseId}:${lessonKey}`;
  const map = readSessionJsonMap<SessionNoteDraft>(SESSION_NOTE_DRAFTS_STORAGE_KEY);
  if (!draft) {
    if (!(compositeKey in map)) return;
    delete map[compositeKey];
  } else {
    map[compositeKey] = draft;
  }
  writeSessionJsonMap(SESSION_NOTE_DRAFTS_STORAGE_KEY, map);
}

export function readSessionFilters(): SessionFilterState {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(SESSION_FILTERS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as SessionFilterState) : {};
  } catch {
    return {};
  }
}

export function updateSessionFilters(patch: Partial<SessionFilterState>): void {
  if (typeof window === "undefined") return;
  try {
    const current = readSessionFilters();
    const next: SessionFilterState = { ...current, ...patch };
    window.sessionStorage.setItem(SESSION_FILTERS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function clearCourseSessionUiState(courseId: string): void {
  if (!courseId || typeof window === "undefined") return;
  const scrollMap = readSessionJsonMap<number>(SESSION_SCROLL_STORAGE_KEY);
  let scrollChanged = false;
  for (const k of Object.keys(scrollMap)) {
    if (
      k === `playlist:${courseId}` ||
      k.startsWith(`notes:${courseId}:`) ||
      k.startsWith(`transcript:${courseId}:`)
    ) {
      delete scrollMap[k];
      scrollChanged = true;
    }
  }
  if (scrollChanged) writeSessionJsonMap(SESSION_SCROLL_STORAGE_KEY, scrollMap);

  const draftsMap = readSessionJsonMap<SessionNoteDraft>(SESSION_NOTE_DRAFTS_STORAGE_KEY);
  let draftsChanged = false;
  for (const k of Object.keys(draftsMap)) {
    if (k.startsWith(`${courseId}:`)) {
      delete draftsMap[k];
      draftsChanged = true;
    }
  }
  if (draftsChanged) writeSessionJsonMap(SESSION_NOTE_DRAFTS_STORAGE_KEY, draftsMap);
}

export function clearAllSessionUiState(): void {
  if (typeof window === "undefined") return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i);
      if (key && key.startsWith("tutin")) keysToRemove.push(key);
    }
    keysToRemove.forEach((key) => window.sessionStorage.removeItem(key));
  } catch {
    // ignore
  }
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
