import { useEffect, useState } from "react";
import { courses, type Course } from "./courses";

export type AvatarContrastMode = "balanced" | "high" | "soft" | "manual";
export type AvatarFontWeight = "400" | "500" | "600" | "700";
export type AvatarFontFamily = "sans" | "mono";
export type ThumbnailCoverMode = "generated" | "images" | "mixed";

export const SAMPLE_COVERS = [
  "/thumbnails/thumb-1.jpg",
  "/thumbnails/thumb-2.png",
  "/thumbnails/thumb-3.webp",
  "/thumbnails/thumb-4.jpg",
] as const;

export const SAMPLE_COVER_DETAILS = [
  { url: "/thumbnails/thumb-1.jpg", originalName: "thumbnail (1).jpg", format: "JPG", label: "Cover 1" },
  { url: "/thumbnails/thumb-2.png", originalName: "thumbnail (1).png", format: "PNG", label: "Cover 2" },
  { url: "/thumbnails/thumb-3.webp", originalName: "thumbnail (1).webp", format: "WEBP", label: "Cover 3" },
  { url: "/thumbnails/thumb-4.jpg", originalName: "thumbnail (2).jpg", format: "JPG", label: "Cover 4" },
] as const;

export function getCourseCoverUrl(
  course: Pick<Course, "id"> & { thumbnailUrl?: string },
  coverMode: ThumbnailCoverMode = "generated"
): string | undefined {
  if (coverMode === "generated") {
    // Only generative algorithmic placeholders
    return undefined;
  }
  if (coverMode === "images") {
    // All courses use uploaded sample cover images
    return course.thumbnailUrl || SAMPLE_COVERS[Math.abs(course.id - 1) % SAMPLE_COVERS.length];
  }
  if (coverMode === "mixed") {
    // Realistic mix: ~50% with uploaded cover images, ~50% with generative vector placeholders
    const hasImage = (course.id * 7 + 3) % 2 === 0;
    if (hasImage) {
      return course.thumbnailUrl || SAMPLE_COVERS[Math.abs(course.id - 1) % SAMPLE_COVERS.length];
    }
    return undefined;
  }
  return course.thumbnailUrl;
}

export interface ThumbnailSettings {
  hue: number;
  drift: number;
  density: number;
  variance: number;
  contrast: number;
  spark: number;
  bands: number;
  pattern: "auto" | "0" | "1" | "2" | "3";
  coverMode?: ThumbnailCoverMode;
  previewImageIndex?: number;
  lockHue?: boolean;
  avatarContrastMode?: AvatarContrastMode;
  avatarFontWeight?: AvatarFontWeight;
  avatarFontFamily?: AvatarFontFamily;
  avatarFontSize?: number;
  avatarBgTone?: number;
  avatarFgTone?: number;
}

export const DEFAULT_GENERATOR_SETTINGS: ThumbnailSettings = {
  hue: 150,
  drift: 25,
  density: 36,
  variance: 50,
  contrast: 60,
  spark: 20,
  bands: 3,
  pattern: "auto",
  coverMode: "generated",
  previewImageIndex: 0,
  lockHue: false,
  avatarContrastMode: "manual",
  avatarFontWeight: "500",
  avatarFontFamily: "sans",
  avatarFontSize: 8,
  avatarBgTone: 3, // Tone 4 (4th swatch from left in Tone 1 to 5)
  avatarFgTone: 1, // Tone 2 (2nd swatch from left in Tone 1 to 5)
};

export const HUES = [142, 265, 28, 8, 210, 340, 175, 45] as const;
export const PATTERN_NAMES: Record<string, string> = {
  auto: "Auto (from seed)",
  "0": "Binary ramp",
  "1": "Thin strips",
  "2": "Block rows",
  "3": "Ramp rows",
};

export const SETTINGS_DEFS = [
  { key: "hue", label: "Hue", min: 0, max: 360, step: 1 },
  { key: "drift", label: "Hue drift", min: -60, max: 60, step: 1 },
  { key: "density", label: "Density", min: 8, max: 80, step: 1 },
  { key: "variance", label: "Variance", min: 0, max: 100, step: 1 },
  { key: "contrast", label: "Contrast", min: 0, max: 100, step: 1 },
  { key: "spark", label: "Spark accent", min: 0, max: 100, step: 1 },
  { key: "bands", label: "Bands / rows", min: 2, max: 6, step: 1 },
] as const;

export interface PaletteResult {
  tones: [string, string, string, string, string];
  spark: string;
}

export function rng(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hsl(h: number, s: number, l: number): string {
  const normH = (((h % 360) + 360) % 360).toFixed(0);
  const clampL = Math.max(4, Math.min(96, l)).toFixed(0);
  return `hsl(${normH},${s}%,${clampL}%)`;
}

export function computePalette(hue: number, drift: number, contrast: number): PaletteResult {
  const k = 0.5 + contrast / 100;
  const L = [13, 29, 46, 62, 88] as const;
  const d = drift;
  const h = hue;
  const tones: [string, string, string, string, string] = [
    hsl(h, 42, 50 + (L[0] - 50) * k),
    hsl(h + d * 0.3, 46, 50 + (L[1] - 50) * k),
    hsl(h + d * 0.6, 55, 50 + (L[2] - 50) * k),
    hsl(h + d, 68, 50 + (L[3] - 50) * k),
    hsl(h + d * 0.5, 70, 50 + (L[4] - 50) * k),
  ];
  const spark = hsl(h + 180, 75, 60);
  return { tones, spark };
}

export function hashString(str: string): number {
  let hash = 5381;
  const s = (str || "").toLowerCase().trim();
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) + hash) + s.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function hh(s: number, a: number, b: number): number {
  let h = (s ^ Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 1, 0x85ebca6b)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function getAvatarColors(
  seed: number,
  palette: PaletteResult | { tones: [string, string, string, string, string] },
  settings?: ThumbnailSettings
): { bg: string; fg: string; contrastRating: string } {
  const mode = settings?.avatarContrastMode ?? "balanced";

  if (mode === "manual") {
    const bgIdx = Math.max(0, Math.min(4, settings?.avatarBgTone ?? 2));
    const fgIdx = Math.max(0, Math.min(4, settings?.avatarFgTone ?? 4));
    return {
      bg: palette.tones[bgIdx] ?? palette.tones[2],
      fg: palette.tones[fgIdx] ?? palette.tones[4],
      contrastRating: `Manual: Tone ${bgIdx + 1} / Tone ${fgIdx + 1}`,
    };
  }

  const k = 1 + (Math.floor(hh(seed * 31 + 7, 0, 0) * 3) % 3);
  const bg = palette.tones[k] ?? palette.tones[2];

  let fg: string;
  let rating: string;

  if (mode === "soft") {
    fg = k < 3 ? (palette.tones[3] ?? palette.tones[4]) : (palette.tones[1] ?? palette.tones[0]);
    rating = "Soft (~20% delta)";
  } else if (mode === "high") {
    fg = k < 3 ? palette.tones[4] : palette.tones[0];
    rating = "High (~55% delta)";
  } else {
    // Balanced contrast (default): calm and accessible without harsh glare
    if (k === 1) fg = palette.tones[3];
    else if (k === 2) fg = palette.tones[4];
    else fg = palette.tones[1];
    rating = "Balanced (~35% delta)";
  }

  return { bg, fg, contrastRating: rating };
}

export interface InstructorPalette {
  hue: number;
  bg: string;
  fg: string;
  tones: [string, string, string, string, string];
  spark: string;
}

export function getInstructorPalette(
  nameOrId: string,
  settings: ThumbnailSettings = DEFAULT_GENERATOR_SETTINGS,
  fallbackCourse?: Pick<Course, "id" | "title" | "thumbnailSeed" | "thumbnailHue">
): InstructorPalette {
  const normName = (nameOrId || "").toLowerCase().trim();
  const matchedCourse =
    courses.find((c) => {
      const inst = c.instructor.toLowerCase().trim();
      return inst === normName || inst.includes(normName) || normName.includes(inst);
    }) ?? fallbackCourse;

  const seed = matchedCourse ? getCourseSeed(matchedCourse) : hashString(nameOrId);
  const hue = matchedCourse
    ? getCourseHue(seed, matchedCourse.thumbnailHue, settings)
    : (() => {
        const baseHue = HUES[seed % HUES.length] ?? 142;
        const hueShift = settings.lockHue ? 0 : ((settings.hue - DEFAULT_GENERATOR_SETTINGS.hue) % 360);
        return (((baseHue + hueShift) % 360) + 360) % 360;
      })();

  const palette = computePalette(hue, settings.drift, settings.contrast);
  const { bg, fg } = getAvatarColors(seed, palette, settings);

  return {
    hue,
    bg,
    fg,
    tones: palette.tones,
    spark: palette.spark,
  };
}

const W = 320;
const H = 180;

function rectSvg(x: number, y: number, w: number, h: number, c: string): string {
  return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(Math.max(0.6, w) + 0.8).toFixed(1)}" height="${(Math.max(0.6, h) + 0.8).toFixed(1)}" fill="${c}"/>`;
}

function tn(p: PaletteResult, x: number): string {
  const idx = 1 + (Math.floor(x * 4) % 4);
  return p.tones[idx] ?? p.tones[1];
}

function cutsFor(seed: number, i: number, n: number, mode: "reg" | "blocks" | "ramp", v: number): number[] {
  const R = (a: number, b: number) => hh(seed, a, b);
  const w: number[] = [];
  const g = 1.1 + R(7, i) * 0.25;
  for (let j = 0; j < n; j++) {
    const x = R(10 + i, j);
    w.push(
      mode === "ramp"
        ? Math.pow(g, j)
        : mode === "reg"
        ? 1 + (x - 0.5) * v * 1.2
        : 0.25 + x * R(40 + i, j) * 3 * (0.3 + v)
    );
  }
  if (mode === "ramp" && R(8, i) < 0.5) w.reverse();
  let t = 0;
  for (let k = 0; k < w.length; k++) t += w[k] ?? 0;
  if (t <= 0) t = 1;
  const b: number[] = [0];
  let s = 0;
  for (let k = 0; k < w.length; k++) {
    s += ((w[k] ?? 0) / t) * W;
    b.push(s);
  }
  return b;
}

function rowsGen(k: 0 | 1 | 2, seed: number, settings: ThumbnailSettings, p: PaletteResult): string {
  const R = (a: number, b: number) => hh(seed, a, b);
  let o = "";
  const v = settings.variance / 100;
  const B = settings.bands;
  const hs: number[] = [];
  let tot = 0;
  const mode = (["reg", "blocks", "ramp"] as const)[k];
  for (let i = 0; i < B; i++) {
    const h = 0.5 + R(1, i) * (1 + v * 2);
    hs.push(h);
    tot += h;
  }
  if (tot <= 0) tot = 1;
  const base =
    k === 0
      ? settings.density * 0.8 + 4
      : k === 1
      ? settings.density / 6 + 3
      : settings.density / 4 + 6;
  let shared: number[] | null = null;
  let y = 0;
  for (let i = 0; i < B; i++) {
    const rh = ((hs[i] ?? 1) / tot) * H;
    const n = Math.max(3, Math.round(base * (1 + (R(2, i) - 0.5) * v * 1.6)));
    const cuts: number[] = shared && R(6, i) < 0.55 ? shared : cutsFor(seed, i, n, mode, v);
    if (!shared || R(9, i) < 0.4) shared = cuts;
    const tone = tn(p, R(4, i));
    const tone2 = tn(p, R(5, i));
    const st = R(3, i);
    for (let j = 0; j < cuts.length - 1; j++) {
      let c: string | null = null;
      const q = R(20 + i, j);
      if (st < 0.5) c = j % 2 ? (q < 0.25 ? tn(p, R(50 + i, j)) : tone) : null;
      else if (st < 0.8) c = j % 2 ? tone : tone2;
      else c = q < 0.2 ? null : tn(p, R(50 + i, j));
      if (c && R(30 + i, j) < settings.spark / 450) c = p.spark;
      const x1 = cuts[j] ?? 0;
      const x2 = cuts[j + 1] ?? x1;
      if (c) o += rectSvg(x1, y, x2 - x1, rh, c);
    }
    y += rh;
  }
  return o;
}

function binaryRampGen(seed: number, settings: ThumbnailSettings, p: PaletteResult): string {
  const R = (a: number, b: number) => hh(seed, a, b);
  let o = "";
  const nb = Math.max(3, Math.min(7, settings.bands + 1));
  const bw = W / nb;
  const p0 = (H / settings.density) * 2;
  const v = settings.variance / 100;
  const duty = 0.34 + R(1, 0) * 0.16;
  for (let b = 0; b < nb; b++) {
    const per = p0 * Math.pow(2, b);
    const off = per * (v > 0.5 ? R(2, b) : [0, 0.25, 0.5][Math.floor(R(2, b) * 3)] ?? 0);
    const toneIdx = 2 + (Math.floor(R(4, b) * 3) % 3);
    const c = R(3, b) < v * 0.4 ? (p.tones[toneIdx] ?? p.tones[2]) : p.tones[3];
    for (let y = -off; y < H; y += per) {
      o += rectSvg(b * bw, y, bw, per * duty, c);
    }
  }
  return o;
}

const GENS = [
  binaryRampGen,
  (seed: number, s: ThumbnailSettings, p: PaletteResult) => rowsGen(0, seed, s, p),
  (seed: number, s: ThumbnailSettings, p: PaletteResult) => rowsGen(1, seed, s, p),
  (seed: number, s: ThumbnailSettings, p: PaletteResult) => rowsGen(2, seed, s, p),
];

export function getCourseSeed(course: { id: number | string; title?: string; thumbnailSeed?: number }): number {
  if (course.thumbnailSeed !== undefined) return course.thumbnailSeed;
  if (typeof course.id === "number") {
    return (Math.abs(Math.imul(course.id, 48213) ^ 0x5a17) % 90000) + 10000;
  }
  let h = 0;
  const s = String(course.title || course.id);
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return (Math.abs(h % 90000)) + 10000;
}

export function getCourseHue(
  seed: number,
  customHue?: number,
  globalSettings?: ThumbnailSettings
): number {
  if (customHue !== undefined) return customHue;
  if (globalSettings?.lockHue) return globalSettings.hue;
  const r = rng(seed);
  return HUES[Math.floor(r() * HUES.length)] ?? 150;
}

export function generateThumbnailSvg(
  seed: number,
  settings: ThumbnailSettings = DEFAULT_GENERATOR_SETTINGS,
  courseHue?: number
): { svg: string; palette: PaletteResult; patternIndex: number; isFlipped: boolean } {
  const hue = courseHue !== undefined ? courseHue : getCourseHue(seed, undefined, settings);
  const p = computePalette(hue, settings.drift, settings.contrast);
  const pv = settings.pattern;
  const g = pv === "auto" ? Math.abs(seed % 4) : Math.max(0, Math.min(3, parseInt(pv, 10) || 0));
  const isFlipped = Math.abs((seed >> 3) % 2) === 1;

  const generator = GENS[g] ?? binaryRampGen;
  const innerArt = generator(seed, settings, p);
  const flipGroup = isFlipped ? `<g transform="translate(320,0) scale(-1,1)">${innerArt}</g>` : innerArt;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" shape-rendering="crispEdges" class="size-full">
    ${rectSvg(0, 0, W, H, p.tones[0])}
    ${flipGroup}
  </svg>`;

  return { svg, palette: p, patternIndex: g, isFlipped };
}

// LocalStorage Persistence & Sync
const STORAGE_KEY = "tutin_thumbnail_settings_v3";
const SETTINGS_EVENT = "tutin:thumbnail_settings_changed";

export function getStoredThumbnailSettings(): ThumbnailSettings {
  if (typeof window === "undefined") return DEFAULT_GENERATOR_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_GENERATOR_SETTINGS;
    return { ...DEFAULT_GENERATOR_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_GENERATOR_SETTINGS;
  }
}

export function saveStoredThumbnailSettings(settings: ThumbnailSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: settings }));
  } catch (err) {
    console.error("Failed to save thumbnail settings", err);
  }
}

export function resetStoredThumbnailSettings(): ThumbnailSettings {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: DEFAULT_GENERATOR_SETTINGS }));
    } catch {}
  }
  return DEFAULT_GENERATOR_SETTINGS;
}

export function useThumbnailSettings(): [
  ThumbnailSettings,
  (updater: ThumbnailSettings | ((prev: ThumbnailSettings) => ThumbnailSettings)) => void,
  () => void
] {
  const [settings, setSettings] = useState<ThumbnailSettings>(getStoredThumbnailSettings);

  useEffect(() => {
    // Sync client state with localStorage on mount (resolves SSR hydration gap)
    setSettings(getStoredThumbnailSettings());

    const handler = (e: Event) => {
      const custom = e as CustomEvent<ThumbnailSettings>;
      if (custom.detail) {
        setSettings(custom.detail);
      } else {
        setSettings(getStoredThumbnailSettings());
      }
    };
    window.addEventListener(SETTINGS_EVENT, handler);
    return () => window.removeEventListener(SETTINGS_EVENT, handler);
  }, []);

  const update = (updater: ThumbnailSettings | ((prev: ThumbnailSettings) => ThumbnailSettings)) => {
    setSettings((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveStoredThumbnailSettings(next);
      return next;
    });
  };

  const reset = () => {
    resetStoredThumbnailSettings();
    setSettings(DEFAULT_GENERATOR_SETTINGS);
  };

  return [settings, update, reset];
}
