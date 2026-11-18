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
