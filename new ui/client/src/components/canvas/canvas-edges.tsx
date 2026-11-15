import { useMemo } from "react";
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
  const cardById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);

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

  return (
    <svg
      className="pointer-events-none absolute inset-0 overflow-visible"
      style={{ width: 1, height: 1 }}
      aria-hidden="true"
    >
      <defs>
        <marker
          id="canvas-arrow-auto"
          markerWidth="8"
          markerHeight="8"
          refX="6.5"
          refY="4"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path
            d="M 1 1 L 7 4 L 1 7"
            fill="none"
            stroke="var(--muted-foreground)"
            strokeOpacity="0.65"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </marker>
        <marker
          id="canvas-arrow-manual"
          markerWidth="9"
          markerHeight="9"
          refX="7"
          refY="4.5"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M 1 1 L 8 4.5 L 1 8 Z" fill="var(--foreground)" fillOpacity="0.72" />
        </marker>
        <marker
          id="canvas-arrow-selected"
          markerWidth="9"
          markerHeight="9"
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

        const midX = 0.125 * fromPoint.x + 0.375 * c1x + 0.375 * c2x + 0.125 * toPoint.x;
        const midY = 0.125 * fromPoint.y + 0.375 * c1y + 0.375 * c2y + 0.125 * toPoint.y;

        return (
          <g key={edge.id}>
            {!isAuto && (
              <path
                d={d}
                fill="none"
                stroke="transparent"
                strokeWidth={16}
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
              strokeOpacity={isSelected ? 1 : isAuto ? 0.5 : 0.65}
              strokeWidth={isSelected ? 2.5 : isAuto ? 1.6 : 2}
              strokeDasharray={edge.style === "dashed" ? "6 5" : undefined}
              markerEnd={
                isSelected
                  ? "url(#canvas-arrow-selected)"
                  : isAuto
                    ? "url(#canvas-arrow-auto)"
                    : "url(#canvas-arrow-manual)"
              }
            />

            {!isAuto && isSelected && interactive && (
              <g
                className="pointer-events-auto cursor-pointer"
                transform={`translate(${midX}, ${midY})`}
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
          strokeWidth={2}
          strokeDasharray="5 4"
          markerEnd="url(#canvas-arrow-selected)"
        />
      )}
    </svg>
  );
}
