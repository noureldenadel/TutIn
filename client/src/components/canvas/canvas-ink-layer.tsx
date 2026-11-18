import { useMemo } from "react";
import { getStroke } from "perfect-freehand";
import type { CanvasStroke } from "@/lib/course-canvas";
import { getStrokeCssColor } from "@/components/canvas/canvas-tokens";

function getSvgPathFromStroke(points: number[][]): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const pt = points[0];
    if (!pt) return "";
    const [x = 0, y = 0] = pt;
    return `M ${x.toFixed(1)} ${y.toFixed(1)} a 1 1 0 1 0 0.1 0 Z`;
  }

  const parts: string[] = [];
  const first = points[0]!;
  parts.push(`M ${first[0]!.toFixed(1)} ${first[1]!.toFixed(1)}`);

  for (let i = 0; i < points.length; i++) {
    const p0 = points[i]!;
    const p1 = points[(i + 1) % points.length]!;
    const midX = ((p0[0]! + p1[0]!) / 2).toFixed(1);
    const midY = ((p0[1]! + p1[1]!) / 2).toFixed(1);
    parts.push(`Q ${p0[0]!.toFixed(1)} ${p0[1]!.toFixed(1)} ${midX} ${midY}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

function buildStrokeSvgPath(stroke: CanvasStroke): string {
  const isHighlighter = stroke.tool === "highlighter";
  const outline = getStroke(stroke.points, {
    size: stroke.size,
    thinning: isHighlighter ? 0.08 : 0.45,
    smoothing: isHighlighter ? 0.65 : 0.5,
    streamline: isHighlighter ? 0.55 : 0.45,
    simulatePressure: true,
    start: { taper: isHighlighter ? 0 : 8, cap: true },
    end: { taper: isHighlighter ? 0 : 12, cap: true },
  });
  return getSvgPathFromStroke(outline);
}

const strokePathCache = new WeakMap<CanvasStroke["points"], string>();

function getCachedStrokePath(stroke: CanvasStroke, isActive: boolean): string {
  if (isActive) {
    return buildStrokeSvgPath(stroke);
  }
  const existing = strokePathCache.get(stroke.points);
  if (existing !== undefined) return existing;
  const computed = buildStrokeSvgPath(stroke);
  strokePathCache.set(stroke.points, computed);
  return computed;
}

export function CanvasInkLayer({
  strokes,
  activeStroke,
}: {
  strokes: CanvasStroke[];
  activeStroke: CanvasStroke | null;
}) {
  const renderedPaths = useMemo(() => {
    return strokes.map((stroke) => ({
      id: stroke.id,
      d: getCachedStrokePath(stroke, false),
      color: getStrokeCssColor(stroke.colorToken),
      opacity: stroke.tool === "highlighter" ? 0.34 : 0.92,
    }));
  }, [strokes]);

  const activePath = activeStroke ? getCachedStrokePath(activeStroke, true) : null;

  return (
    <svg
      className="pointer-events-none absolute inset-0 overflow-visible"
      style={{ width: 1, height: 1 }}
      aria-hidden="true"
    >
      {renderedPaths.map((item) => (
        <path key={item.id} d={item.d} fill={item.color} fillOpacity={item.opacity} />
      ))}
      {activeStroke && activePath && (
        <path
          d={activePath}
          fill={getStrokeCssColor(activeStroke.colorToken)}
          fillOpacity={activeStroke.tool === "highlighter" ? 0.34 : 0.92}
        />
      )}
    </svg>
  );
}
