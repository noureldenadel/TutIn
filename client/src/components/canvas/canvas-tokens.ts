import type { CanvasStrokeColorToken } from "@/lib/course-canvas";

export type CanvasToolMode =
  "select" | "pan" | "note" | "text" | "pen" | "highlighter" | "eraser" | "connect";

export interface StrokeColorOption {
  token: CanvasStrokeColorToken;
  label: string;
  cssColor: string;
}

export const STROKE_COLOR_OPTIONS: StrokeColorOption[] = [
  { token: "ink", label: "Ink", cssColor: "var(--foreground)" },
  { token: "primary", label: "Accent", cssColor: "var(--primary)" },
  { token: "violet", label: "Violet", cssColor: "var(--chart-1)" },
  { token: "sky", label: "Sky", cssColor: "var(--chart-2)" },
  { token: "amber", label: "Amber", cssColor: "var(--chart-3)" },
  { token: "emerald", label: "Emerald", cssColor: "var(--chart-4)" },
  { token: "rose", label: "Rose", cssColor: "var(--chart-5)" },
];

const COLOR_MAP = new Map(STROKE_COLOR_OPTIONS.map((o) => [o.token, o.cssColor]));

export function getStrokeCssColor(token: CanvasStrokeColorToken): string {
  return COLOR_MAP.get(token) ?? "var(--foreground)";
}

export const ARTBOARD_ACCENT_VARS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

export interface CanvasAccentOption {
  index: number;
  label: string;
  cssColor: string;
}

export const CANVAS_ACCENT_OPTIONS: CanvasAccentOption[] = [
  { index: 0, label: "Violet", cssColor: ARTBOARD_ACCENT_VARS[0] },
  { index: 1, label: "Sky", cssColor: ARTBOARD_ACCENT_VARS[1] },
  { index: 2, label: "Amber", cssColor: ARTBOARD_ACCENT_VARS[2] },
  { index: 3, label: "Emerald", cssColor: ARTBOARD_ACCENT_VARS[3] },
  { index: 4, label: "Rose", cssColor: ARTBOARD_ACCENT_VARS[4] },
];

export function getArtboardAccentVar(tintIndex: number): string {
  const safe =
    ((tintIndex % ARTBOARD_ACCENT_VARS.length) + ARTBOARD_ACCENT_VARS.length) %
    ARTBOARD_ACCENT_VARS.length;
  return ARTBOARD_ACCENT_VARS[safe]!;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function positiveMod(value: number, divisor: number): number {
  const rem = value % divisor;
  return rem < 0 ? rem + divisor : rem;
}

export interface CanvasDotGridMetrics {
  majorPx: number;
  quarterPx: number;
  threeQuarterPx: number;
  patternX: number;
  patternY: number;
  dotRadius: number;
  majorOpacity: number;
  minorOpacity: number;
}

/**
 * Computes C0-continuous power-of-2 octave dot grid metrics aligned to world origin `(0, 0)`:
 * - Keeps rendered spacing smoothly in `[baseStep, baseStep * 2]` screen pixels across every zoom
 *   level (`10%` to `300%`) by crossfading the 3 sub-lattice dots out before each octave wraps,
 *   keeping dots crisp and visible even at `10%` zoom without Moire aliasing.
 */
export function computeCanvasDotGridMetrics(
  x: number,
  y: number,
  zoom: number,
  baseStep = 24,
): CanvasDotGridMetrics {
  const safeZoom = Math.max(0.05, zoom);
  const level = -Math.log2(safeZoom);
  const octave = Math.floor(level);
  const frac = level - octave; // [0, 1)

  const minorWorld = baseStep * Math.pow(2, octave);
  const majorWorld = minorWorld * 2;
  const majorPx = majorWorld * safeZoom; // Always in (baseStep, baseStep * 2]
  const quarterPx = majorPx * 0.25;
  const threeQuarterPx = majorPx * 0.75;

  // Fade intermediate dots completely to 0 before the octave wraps so transitions have zero snap.
  const minorAlpha = 1 - smoothstep(0.12, 0.9, frac);
  const majorOpacity = 0.16;
  const minorOpacity = majorOpacity * minorAlpha;

  // Keep dot radius subtle and crisp in screen pixels without bloating at 300% zoom.
  const dotRadius = Math.max(0.95, Math.min(1.28, 1.02 + Math.max(0, safeZoom - 1) * 0.13));

  const patternX = positiveMod(x - quarterPx, majorPx);
  const patternY = positiveMod(y - quarterPx, majorPx);

  return {
    majorPx,
    quarterPx,
    threeQuarterPx,
    patternX,
    patternY,
    dotRadius,
    majorOpacity,
    minorOpacity,
  };
}

/**
 * Obsidian-inspired zoom compensation multiplier for world-space SVG arrows/edges.
 * - At `zoom >= 1`: stays `1` so arrows scale naturally alongside cards when zoomed in.
 * - At `zoom < 1`: grows smoothly in world space (`(1 / zoom)^0.75`, capped at `5.5x`),
 *   keeping screen-space strokes legible (`~1.1px - 2.0px`) all the way down to `10%` overview zoom.
 */
export function computeCanvasEdgeScale(zoom: number): number {
  const safeZoom = Math.max(0.05, zoom);
  if (safeZoom >= 1) return 1;
  return Math.min(5.5, Math.pow(1 / safeZoom, 0.75));
}

/**
 * Keeps invisible edge click/context-menu hit strips comfortable (`~18px` on screen) at any zoom.
 */
export function computeEdgeHitStrokeWidth(zoom: number, minWorldWidth = 16): number {
  const safeZoom = Math.max(0.1, zoom);
  return Math.max(minWorldWidth, 18 / safeZoom);
}

/**
 * Smoothly adjusts edge opacity when zooming out:
 * - Manual conceptual connections gain slight clarity in overview (`0.65 -> 0.85`).
 * - Internal auto-chrono lecture links soften gently (`0.50 -> 0.28`) to reduce clutter.
 */
export function computeCanvasEdgeOpacity(
  zoom: number,
  isAuto: boolean,
  isSelected: boolean,
): number {
  if (isSelected) return 1;
  const safeZoom = Math.max(0.05, zoom);
  if (isAuto) {
    const t = smoothstep(0.15, 0.45, safeZoom);
    return 0.28 + t * (0.5 - 0.28);
  }
  const overviewBoost = 1 - smoothstep(0.22, 0.65, safeZoom);
  return 0.65 + overviewBoost * 0.2;
}
