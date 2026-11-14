import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type LogoMode = "idle" | "playing" | "thinking" | "celebrate";
export type LogoSize = "xs" | "sm" | "md" | "lg";

// 5x5 grid with the four corners removed (21 dots)
const cells = Array.from({ length: 25 }, (_, i) => {
  const r = Math.floor(i / 5);
  const c = i % 5;
  const nx = (c - 2) / 2;
  const ny = (r - 2) / 2;
  const d = Math.hypot(nx, ny);
  const theta = Math.atan2(ny, nx);
  return { r, c, nx, ny, d, theta };
}).filter(({ r, c }) => !((r === 0 || r === 4) && (c === 0 || c === 4)));

const THINKING_COLORS = [
  "var(--primary)",
  "var(--chart-2)",
  "var(--chart-1)",
  "var(--chart-4)",
] as const;

const CELEBRATE_COLORS = ["var(--chart-4)", "var(--chart-2)", "var(--primary)"] as const;

function getDotState(
  mode: LogoMode,
  cell: (typeof cells)[number],
  t: number,
  colorful: boolean,
): { opacity: number; scale: number; fill: string } {
  const { r, c, nx, ny, d, theta } = cell;

  if (mode === "thinking") {
    // Smooth 3D spherical wave + orbital ripple across the 21-dot LED matrix
    const wave = (Math.sin(t * 0.34 - d * 2.2 + theta * 1.5) + 1) / 2;
    const cross = (Math.cos(t * 0.22 + nx * 1.9 - ny * 1.6) + 1) / 2;
    const raw = wave * 0.65 + cross * 0.35;
    const opacity = 0.2 + 0.8 * Math.pow(raw, 1.35);
    const scale = 0.82 + 0.32 * raw;

    if (!colorful) {
      return { opacity, scale, fill: "currentColor" };
    }

    const colorPhase = ((theta + Math.PI) / (2 * Math.PI)) * THINKING_COLORS.length + t * 0.14 + d * 0.6;
    const colorIdx =
      ((Math.floor(colorPhase) % THINKING_COLORS.length) + THINKING_COLORS.length) %
      THINKING_COLORS.length;
    return {
      opacity,
      scale,
      fill: THINKING_COLORS[colorIdx] ?? "var(--primary)",
    };
  }

  if (mode === "celebrate") {
    const ripple = (Math.sin(t * 0.45 - d * 2.4) + 1) / 2;
    const opacity = 0.25 + 0.75 * ripple;
    const scale = 0.88 + 0.24 * ripple;
    if (!colorful) {
      return { opacity, scale, fill: "currentColor" };
    }
    const colorIdx =
      ((Math.floor(d * 2 + t * 0.2) % CELEBRATE_COLORS.length) + CELEBRATE_COLORS.length) %
      CELEBRATE_COLORS.length;
    return {
      opacity,
      scale,
      fill: CELEBRATE_COLORS[colorIdx] ?? "var(--chart-4)",
    };
  }

  if (mode === "playing") {
    const opacity =
      0.25 +
      0.75 *
        ((Math.sin(t / 3 + c) + 1) / 2) *
        (r >= 4 - Math.round(((Math.sin(t / 2 + c * 1.3) + 1) / 2) * 4) ? 1 : 0.3);
    return { opacity, scale: 1, fill: "currentColor" };
  }

  // idle: gentle breathing from the center
  const opacity = 0.35 + 0.65 * ((Math.sin(t / 4 - d * 1.4) + 1) / 2) * (d < 1.1 ? 1 : 0.6);
  return { opacity, scale: 1, fill: "currentColor" };
}

const SIZE_CLASSES: Record<LogoSize, string> = {
  xs: "size-3.5",
  sm: "size-4",
  md: "size-7",
  lg: "size-9",
};

export function DotLogo({
  mode = "idle",
  size = "md",
  colorful = mode === "thinking" || mode === "celebrate",
  className,
}: {
  mode?: LogoMode;
  size?: LogoSize;
  colorful?: boolean;
  className?: string;
}) {
  const [t, setT] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const intervalMs = mode === "thinking" || mode === "celebrate" ? 75 : 120;
    const id = window.setInterval(() => setT((v) => v + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [mode]);

  return (
    <svg
      viewBox="0 0 30 30"
      className={cn("shrink-0 select-none", SIZE_CLASSES[size], className)}
      aria-hidden
    >
      {cells.map((cell) => {
        const { opacity, scale, fill } = getDotState(mode, cell, t, colorful);
        return (
          <circle
            key={`${cell.r}-${cell.c}`}
            cx={3 + cell.c * 6}
            cy={3 + cell.r * 6}
            r={2.15 * scale}
            fill={fill}
            style={{
              opacity,
              transition:
                mode === "thinking" || mode === "celebrate"
                  ? "opacity 140ms linear, r 140ms ease, fill 260ms ease"
                  : "opacity 200ms ease",
            }}
          />
        );
      })}
    </svg>
  );
}
