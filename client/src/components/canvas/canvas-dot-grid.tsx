import { memo, useId } from "react";
import { computeCanvasDotGridMetrics } from "@/components/canvas/canvas-tokens";

export const CanvasDotGrid = memo(function CanvasDotGrid({
  x,
  y,
  zoom,
  baseStep = 24,
}: {
  x: number;
  y: number;
  zoom: number;
  baseStep?: number;
}) {
  const rawId = useId();
  const patternId = `canvas-dot-grid-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const metrics = computeCanvasDotGridMetrics(x, y, zoom, baseStep);

  return (
    <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
      <defs>
        <pattern
          id={patternId}
          width={metrics.majorPx}
          height={metrics.majorPx}
          x={metrics.patternX}
          y={metrics.patternY}
          patternUnits="userSpaceOnUse"
        >
          <circle
            cx={metrics.quarterPx}
            cy={metrics.quarterPx}
            r={metrics.dotRadius}
            fill="var(--foreground)"
            fillOpacity={metrics.majorOpacity}
          />
          {metrics.minorOpacity > 0.004 && (
            <>
              <circle
                cx={metrics.threeQuarterPx}
                cy={metrics.quarterPx}
                r={metrics.dotRadius}
                fill="var(--foreground)"
                fillOpacity={metrics.minorOpacity}
              />
              <circle
                cx={metrics.quarterPx}
                cy={metrics.threeQuarterPx}
                r={metrics.dotRadius}
                fill="var(--foreground)"
                fillOpacity={metrics.minorOpacity}
              />
              <circle
                cx={metrics.threeQuarterPx}
                cy={metrics.threeQuarterPx}
                r={metrics.dotRadius}
                fill="var(--foreground)"
                fillOpacity={metrics.minorOpacity}
              />
            </>
          )}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
});
