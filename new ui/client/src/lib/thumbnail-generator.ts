import { apiUrl } from "@/lib/api";
import { getSavedCourses, type Course } from "@/lib/courses";

/**
 * Resolve the cover artwork URL for a course.
 * Real database / uploaded thumbnails always take precedence over generated vector artwork.
 */
export function getCourseCoverUrl(
  course: Pick<Course, "id"> & {
    thumbnailUrl?: string | null | undefined;
    thumbnailData?: string | null | undefined;
  },
): string | undefined {
  const raw = course.thumbnailUrl || course.thumbnailData;
  if (!raw || typeof raw !== "string") return undefined;
  return raw.startsWith("/api/") ? apiUrl(raw) : raw;
}

/**
 * Preserved artwork & avatar configuration (from commit 2f65126).
 */
export const DEFAULT_GENERATOR_SETTINGS = {
  hue: 150,
  drift: 25,
  density: 36,
  variance: 50,
  contrast: 60,
  spark: 20,
  bands: 3,
  pattern: "auto",
  lockHue: false,
  avatarContrastMode: "manual",
  avatarFontWeight: "500",
  avatarFontFamily: "sans",
  avatarFontSize: 8,
  avatarBgTone: 3,
  avatarFgTone: 1,
} as const;

export const HUES = [142, 265, 28, 8, 210, 340, 175, 45] as const;

export interface PaletteResult {
  tones: [string, string, string, string, string];
  spark: string;
}

export interface InstructorPalette {
  hue: number;
  bg: string;
  fg: string;
  tones: [string, string, string, string, string];
  spark: string;
}

function rng(a: number) {
  let state = a | 0;
  return function () {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hsl(h: number, s: number, l: number): string {
  const normH = (((h % 360) + 360) % 360).toFixed(0);
  const clampL = Math.max(4, Math.min(96, l)).toFixed(0);
  return `hsl(${normH},${s}%,${clampL}%)`;
}

export function computePalette(
  hue: number,
  drift: number = DEFAULT_GENERATOR_SETTINGS.drift,
  contrast: number = DEFAULT_GENERATOR_SETTINGS.contrast,
): PaletteResult {
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

function hashString(str: string): number {
  let hash = 5381;
  const s = (str || "").toLowerCase().trim();
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) + hash + s.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function hh(s: number, a: number, b: number): number {
  let h = (s ^ Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 1, 0x85ebca6b)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function getAvatarColors(
  palette: PaletteResult | { tones: [string, string, string, string, string] },
): { bg: string; fg: string } {
  return {
    bg: palette.tones[DEFAULT_GENERATOR_SETTINGS.avatarBgTone],
    fg: palette.tones[DEFAULT_GENERATOR_SETTINGS.avatarFgTone],
  };
}

export function getInstructorPalette(
  nameOrId: string,
  fallbackCourse?: Pick<Course, "id" | "title" | "thumbnailSeed" | "thumbnailHue">,
): InstructorPalette {
  const normName = (nameOrId || "").toLowerCase().trim();
  const savedCourses = getSavedCourses();
  const matchedCourse =
    savedCourses.find((c) => {
      const inst = (c.instructor || "").toLowerCase().trim();
      return (
        Boolean(inst) &&
        (inst === normName || inst.includes(normName) || normName.includes(inst))
      );
    }) ?? fallbackCourse;

  const seed = matchedCourse ? getCourseSeed(matchedCourse) : hashString(nameOrId);
  const hue = matchedCourse
    ? getCourseHue(seed, matchedCourse.thumbnailHue)
    : (HUES[seed % HUES.length] ?? 142);

  const palette = computePalette(hue);
  const { bg, fg } = getAvatarColors(palette);

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

function cutsFor(
  seed: number,
  i: number,
  n: number,
  mode: "reg" | "blocks" | "ramp",
  v: number,
): number[] {
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
          : 0.25 + x * R(40 + i, j) * 3 * (0.3 + v),
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

function rowsGen(k: 0 | 1 | 2, seed: number, p: PaletteResult): string {
  const R = (a: number, b: number) => hh(seed, a, b);
  let o = "";
  const v = DEFAULT_GENERATOR_SETTINGS.variance / 100;
  const B = DEFAULT_GENERATOR_SETTINGS.bands;
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
      ? DEFAULT_GENERATOR_SETTINGS.density * 0.8 + 4
      : k === 1
        ? DEFAULT_GENERATOR_SETTINGS.density / 6 + 3
        : DEFAULT_GENERATOR_SETTINGS.density / 4 + 6;
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
      if (c && R(30 + i, j) < DEFAULT_GENERATOR_SETTINGS.spark / 450) c = p.spark;
      const x1 = cuts[j] ?? 0;
      const x2 = cuts[j + 1] ?? x1;
      if (c) o += rectSvg(x1, y, x2 - x1, rh, c);
    }
    y += rh;
  }
  return o;
}

function binaryRampGen(seed: number, p: PaletteResult): string {
  const R = (a: number, b: number) => hh(seed, a, b);
  let o = "";
  const nb = Math.max(3, Math.min(7, DEFAULT_GENERATOR_SETTINGS.bands + 1));
  const bw = W / nb;
  const p0 = (H / DEFAULT_GENERATOR_SETTINGS.density) * 2;
  const v = DEFAULT_GENERATOR_SETTINGS.variance / 100;
  const duty = 0.34 + R(1, 0) * 0.16;
  for (let b = 0; b < nb; b++) {
    const per = p0 * Math.pow(2, b);
    const off = per * (v > 0.5 ? R(2, b) : ([0, 0.25, 0.5][Math.floor(R(2, b) * 3)] ?? 0));
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
  (seed: number, p: PaletteResult) => rowsGen(0, seed, p),
  (seed: number, p: PaletteResult) => rowsGen(1, seed, p),
  (seed: number, p: PaletteResult) => rowsGen(2, seed, p),
];

export function getCourseSeed(course: {
  id?: number | string | undefined;
  title?: string | undefined;
  thumbnailSeed?: number | undefined;
}): number {
  if (typeof course.thumbnailSeed === "number" && Number.isFinite(course.thumbnailSeed)) {
    return course.thumbnailSeed;
  }
  if (typeof course.id === "number") {
    return (Math.abs(Math.imul(course.id, 48213) ^ 0x5a17) % 90000) + 10000;
  }
  let h = 0;
  const s = String(course.title || course.id || "course");
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h % 90000) + 10000;
}

export function getCourseHue(seed: number, customHue?: number): number {
  if (customHue !== undefined) return customHue;
  const r = rng(seed);
  return HUES[Math.floor(r() * HUES.length)] ?? DEFAULT_GENERATOR_SETTINGS.hue;
}

export function generateThumbnailSvg(
  seed: number,
  courseHue?: number,
): { svg: string; palette: PaletteResult; patternIndex: number; isFlipped: boolean } {
  const hue = courseHue !== undefined ? courseHue : getCourseHue(seed);
  const p = computePalette(hue);
  const g = Math.abs(seed % 4);
  const isFlipped = Math.abs((seed >> 3) % 2) === 1;

  const generator = GENS[g] ?? binaryRampGen;
  const innerArt = generator(seed, p);
  const flipGroup = isFlipped
    ? `<g transform="translate(320,0) scale(-1,1)">${innerArt}</g>`
    : innerArt;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" shape-rendering="crispEdges" class="size-full">
    ${rectSvg(0, 0, W, H, p.tones[0])}
    ${flipGroup}
  </svg>`;

  return { svg, palette: p, patternIndex: g, isFlipped };
}
