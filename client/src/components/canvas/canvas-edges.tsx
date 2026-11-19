import { useEffect, useMemo, useState } from "react";
import {
  computeCanvasEdgeOpacity,
  computeCanvasEdgeScale,
  computeEdgeHitStrokeWidth,
} from "@/components/canvas/canvas-tokens";
import {
  getDetachedSideAnchors,
  type CanvasCard,
  type CanvasEdge,
  type CanvasSide,
} from "@/lib/course-canvas";

function getBezierPoints(
  from: { x: number; y: number; side: CanvasSide },
  to: { x: number; y: number; side: CanvasSide },
): { c1x: number; c1y: number; c2x: number; c2y: number } {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const offset = Math.max(36, Math.min(130, dist * 0.42));

  const shift = (pt: { x: number; y: number; side: CanvasSide }) => {
    switch (pt.side) {
      case "top":
        return { x: pt.x, y: pt.y - offset };
      case "right":
        return { x: pt.x + offset, y: pt.y };
      case "bottom":
        return { x: pt.x, y: pt.y + offset };
      case "left":
        return { x: pt.x - offset, y: pt.y };
    }
  };

  const c1 = shift(from);
  const c2 = shift(to);
  return { c1x: c1.x, c1y: c1.y, c2x: c2.x, c2y: c2.y };
}

export function CanvasEdgesLayer({
  edges,
  cards,
  zoom,
  selectedEdgeId,
  connectingFrom,
  connectingSnapTarget,
  interactive,
  onSelectEdge,
  onDeleteEdge,
  onContextMenuEdge,
}: {
  edges: CanvasEdge[];
  cards: CanvasCard[];
  zoom: number;
  selectedEdgeId: string | null;
  connectingFrom: {
    cardId: string;
    fromSide?: CanvasSide | undefined;
    pointerWorld: { x: number; y: number };
  } | null;
  connectingSnapTarget?: { cardId: string; toSide: CanvasSide } | null | undefined;
  interactive: boolean;
  onSelectEdge: (edgeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
  onContextMenuEdge?: ((edgeId: string, e: React.MouseEvent) => void) | undefined;
}) {
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const cardById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);

  useEffect(() => {
    if (!interactive) {
      setHoveredEdgeId(null);
    }
  }, [interactive]);

  const previewPath = useMemo(() => {
    if (!connectingFrom) return null;
    const fromCard = cardById.get(connectingFrom.cardId);
    if (!fromCard) return null;

    const snapCard = connectingSnapTarget ? cardById.get(connectingSnapTarget.cardId) : undefined;
    if (snapCard && connectingSnapTarget) {
      const { fromPoint, toPoint } = getDetachedSideAnchors(
        fromCard,
        snapCard,
        connectingFrom.fromSide,
        connectingSnapTarget.toSide,
      );
      const { c1x, c1y, c2x, c2y } = getBezierPoints(fromPoint, toPoint);
      return `M ${fromPoint.x} ${fromPoint.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${toPoint.x} ${toPoint.y}`;
    }

    const targetRect = {
      x: connectingFrom.pointerWorld.x,
      y: connectingFrom.pointerWorld.y,
      width: 1,
      height: 1,
    };
    const { fromPoint, toPoint } = getDetachedSideAnchors(
      fromCard,
      targetRect,
      connectingFrom.fromSide,
    );
    const { c1x, c1y, c2x, c2y } = getBezierPoints(fromPoint, toPoint);
    return `M ${fromPoint.x} ${fromPoint.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${toPoint.x} ${toPoint.y}`;
  }, [connectingFrom, connectingSnapTarget, cardById]);

  const edgeScale = computeCanvasEdgeScale(zoom);
  const hitStrokeWidth = computeEdgeHitStrokeWidth(zoom, 16);
  const autoOpacity = computeCanvasEdgeOpacity(zoom, true, false);
  const manualOpacity = computeCanvasEdgeOpacity(zoom, false, false);
  const deleteBadgeScale = Math.min(3.5, edgeScale);
  const autoMarkerSize = 8 * edgeScale;
  const manualMarkerSize = 9 * edgeScale;
  const manualHoverMarkerSize = 10 * edgeScale;
  const hoverHaloStrokeWidth = 18 * edgeScale;
  const dashedArray = `${6 * edgeScale} ${5 * edgeScale}`;
  const previewDashArray = `${5 * edgeScale} ${4 * edgeScale}`;

  return (
    <svg
      className="pointer-events-none absolute inset-0 overflow-visible"
      style={{ width: 1, height: 1 }}
      aria-hidden="true"
    >
      <defs>
        <marker
          id="canvas-arrow-auto"
          viewBox="0 0 8 8"
          markerWidth={autoMarkerSize}
          markerHeight={autoMarkerSize}
          refX="6.5"
          refY="4"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path
            d="M 1 1 L 7 4 L 1 7"
            fill="none"
            stroke="var(--muted-foreground)"
            strokeOpacity={Math.min(0.85, autoOpacity + 0.15)}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </marker>
        <marker
          id="canvas-arrow-manual"
          viewBox="0 0 9 9"
          markerWidth={manualMarkerSize}
          markerHeight={manualMarkerSize}
          refX="7"
          refY="4.5"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path
            d="M 1 1 L 8 4.5 L 1 8 Z"
            fill="var(--foreground)"
            fillOpacity={Math.min(0.92, manualOpacity + 0.08)}
          />
        </marker>
        <marker
          id="canvas-arrow-manual-hover"
          viewBox="0 0 9 9"
          markerWidth={manualHoverMarkerSize}
          markerHeight={manualHoverMarkerSize}
          refX="7"
          refY="4.5"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M 1 1 L 8 4.5 L 1 8 Z" fill="var(--foreground)" fillOpacity="0.95" />
        </marker>
        <marker
          id="canvas-arrow-selected"
          viewBox="0 0 9 9"
          markerWidth={manualHoverMarkerSize}
          markerHeight={manualHoverMarkerSize}
          refX="7"
          refY="4.5"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M 1 1 L 8 4.5 L 1 8 Z" fill="var(--primary)" />
        </marker>
      </defs>

      {edges.map((edge) => {
        const fromCard = cardById.get(edge.fromId);
        const toCard = cardById.get(edge.toId);
        if (!fromCard || !toCard) return null;

        const { fromPoint, toPoint } = getDetachedSideAnchors(
          fromCard,
          toCard,
          edge.fromSide,
          edge.toSide,
        );
        const { c1x, c1y, c2x, c2y } = getBezierPoints(fromPoint, toPoint);
        const d = `M ${fromPoint.x} ${fromPoint.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${toPoint.x} ${toPoint.y}`;
        const isAuto = edge.edgeKind === "auto-chrono";
        const isSelected = edge.id === selectedEdgeId;
        const isHovered = !isAuto && interactive && hoveredEdgeId === edge.id;

        const midX = 0.125 * fromPoint.x + 0.375 * c1x + 0.375 * c2x + 0.125 * toPoint.x;
        const midY = 0.125 * fromPoint.y + 0.375 * c1y + 0.375 * c2y + 0.125 * toPoint.y;

        return (
          <g
            key={edge.id}
            onPointerEnter={!isAuto && interactive ? () => setHoveredEdgeId(edge.id) : undefined}
            onPointerLeave={
              !isAuto
                ? () => setHoveredEdgeId((curr) => (curr === edge.id ? null : curr))
                : undefined
            }
          >
            {!isAuto && (
              <>
                {/* Obsidian-style translucent interaction halo on hover / selection */}
                <path
                  d={d}
                  fill="none"
                  stroke={isSelected ? "var(--primary)" : "var(--foreground)"}
                  strokeOpacity={isSelected ? (isHovered ? 0.18 : 0.12) : isHovered ? 0.11 : 0}
                  strokeWidth={hoverHaloStrokeWidth}
                  strokeLinecap="round"
                  className="pointer-events-none transition-[stroke-opacity] duration-150 ease-out"
                />
                <path
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={hitStrokeWidth}
                  strokeLinecap="round"
                  className={
                    interactive ? "pointer-events-auto cursor-pointer" : "pointer-events-none"
                  }
                  onClick={(e) => {
                    if (!interactive) return;
                    e.stopPropagation();
                    onSelectEdge(edge.id);
                  }}
                  onContextMenu={(e) => {
                    if (!interactive) return;
                    e.preventDefault();
                    e.stopPropagation();
                    onContextMenuEdge?.(edge.id, e);
                  }}
                />
              </>
            )}

            <path
              d={d}
              fill="none"
              stroke={
                isSelected
                  ? "var(--primary)"
                  : isAuto
                    ? "var(--muted-foreground)"
                    : "var(--foreground)"
              }
              strokeOpacity={
                isSelected ? 1 : isAuto ? autoOpacity : isHovered ? 0.92 : manualOpacity
              }
              strokeWidth={(isSelected ? 2.8 : isAuto ? 1.6 : isHovered ? 3 : 2) * edgeScale}
              strokeDasharray={edge.style === "dashed" ? dashedArray : undefined}
              markerEnd={
                isSelected
                  ? "url(#canvas-arrow-selected)"
                  : isAuto
                    ? "url(#canvas-arrow-auto)"
                    : isHovered
                      ? "url(#canvas-arrow-manual-hover)"
                      : "url(#canvas-arrow-manual)"
              }
              className={
                !isAuto
                  ? "transition-[stroke-opacity,stroke-width] duration-150 ease-out"
                  : undefined
              }
            />

            {!isAuto && isSelected && interactive && (
              <g
                className="pointer-events-auto cursor-pointer"
                transform={`translate(${midX}, ${midY}) scale(${deleteBadgeScale})`}
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteEdge(edge.id);
                }}
              >
                <circle r="10" fill="var(--card)" stroke="var(--border)" strokeWidth="1.2" />
                <path
                  d="M -3.5 -3.5 L 3.5 3.5 M 3.5 -3.5 L -3.5 3.5"
                  stroke="var(--destructive)"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </g>
            )}
          </g>
        );
      })}

      {previewPath && (
        <path
          d={previewPath}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={2 * edgeScale}
          strokeDasharray={previewDashArray}
          markerEnd="url(#canvas-arrow-selected)"
        />
      )}
    </svg>
  );
}
