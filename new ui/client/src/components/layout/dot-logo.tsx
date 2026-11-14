import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type LogoMode = "idle" | "playing" | "thinking" | "celebrate";

// 5x5 grid with the four corners removed (21 dots)
const cells = Array.from({ length: 25 }, (_, i) => ({ r: Math.floor(i / 5), c: i % 5 })).filter(
  ({ r, c }) => !((r === 0 || r === 4) && (c === 0 || c === 4)),
);

function level(mode: LogoMode, r: number, c: number, t: number) {
  const d = Math.hypot(r - 2, c - 2);
  if (mode === "playing") return 0.25 + 0.75 * ((Math.sin(t / 3 + c) + 1) / 2) * (r >= 4 - Math.round(((Math.sin(t / 2 + c * 1.3) + 1) / 2) * 4) ? 1 : 0.3);
  if (mode === "thinking") return (Math.floor(t) % cells.length) === cells.findIndex((x) => x.r === r && x.c === c) ? 1 : 0.25;
  if (mode === "celebrate") return (Math.sin(t - d * 1.6) + 1) / 2 * 0.8 + 0.2;
  // idle: gentle breathing from the center
  return 0.35 + 0.65 * ((Math.sin(t / 4 - d) + 1) / 2) * (d < 1.6 ? 1 : 0.6);
}

export function DotLogo({ mode = "idle", className }: { mode?: LogoMode; className?: string }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setT((v) => v + 1), 120);
    return () => window.clearInterval(id);
  }, []);
  return (
    <svg viewBox="0 0 30 30" className={cn("size-7", className)} aria-hidden>
      {cells.map(({ r, c }) => (
        <circle key={`${r}-${c}`} cx={3 + c * 6} cy={3 + r * 6} r={2.2} fill="currentColor" style={{ opacity: level(mode, r, c, t), transition: "opacity 200ms ease" }} />
      ))}
    </svg>
  );
}

