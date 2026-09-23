import { useMemo, memo } from 'react'
import { X } from 'lucide-react'

/**
 * Compute the optimal connection point on a node's bounding rectangle
 * in the direction of the target point/node.
 */
export function getNodeEdgePoint(fromNode, toNode) {
    if (!fromNode || !toNode) {
        return { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } }
    }

    const fromCenter = {
        x: fromNode.x + (fromNode.width || 300) / 2,
        y: fromNode.y + (fromNode.height || 180) / 2
    }
    const toCenter = {
        x: toNode.x + (toNode.width || 300) / 2,
        y: toNode.y + (toNode.height || 180) / 2
    }

    const dx = toCenter.x - fromCenter.x
    const dy = toCenter.y - fromCenter.y
    const angle = Math.atan2(dy, dx)

    function getEdgePoint(node, isSource) {
        const w = node.width || 300
        const h = node.height || 180
        const cx = node.x + w / 2
        const cy = node.y + h / 2
        const hw = w / 2
        const hh = h / 2

        const a = isSource ? angle : angle + Math.PI
        const cosA = Math.cos(a)
        const sinA = Math.sin(a)
        const tanA = Math.tan(a)

        let px, py
        if (Math.abs(cosA) * hh > Math.abs(sinA) * hw) {
            px = cosA > 0 ? cx + hw : cx - hw
            py = cy + (px - cx) * tanA
        } else {
            py = sinA > 0 ? cy + hh : cy - hh
            px = cx + (py - cy) / (tanA || 0.0001)
        }

        return { x: px, y: py }
    }

    return {
        from: getEdgePoint(fromNode, true),
        to: getEdgePoint(toNode, false)
    }
}

/**
 * Compute smooth cubic bezier control points for the curve
 */
export function getBezierControlPoints(from, to) {
    const dx = to.x - from.x
    const dy = to.y - from.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    const offset = Math.min(distance * 0.45, 120)

    const isHorizontal = Math.abs(dx) > Math.abs(dy)

    if (isHorizontal) {
        return {
            cp1: { x: from.x + (dx > 0 ? offset : -offset), y: from.y },
            cp2: { x: to.x - (dx > 0 ? offset : -offset), y: to.y }
        }
    } else {
        return {
            cp1: { x: from.x, y: from.y + (dy > 0 ? offset : -offset) },
            cp2: { x: to.x, y: to.y - (dy > 0 ? offset : -offset) }
        }
    }
}

function CanvasEdge({
    edge,
    fromNode,
    toNode,
    isSelected = false,
    onSelect,
    onDelete
}) {
    const { pathString, midPoint } = useMemo(() => {
        if (!fromNode || !toNode) {
            return { pathString: '', midPoint: { x: 0, y: 0 } }
        }

        const { from, to } = getNodeEdgePoint(fromNode, toNode)
        const { cp1, cp2 } = getBezierControlPoints(from, to)

        const path = `M ${from.x} ${from.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${to.x} ${to.y}`

        // Calculate midpoint on cubic bezier curve at t = 0.5
        const t = 0.5
        const mt = 1 - t
        const mx = mt * mt * mt * from.x + 3 * mt * mt * t * cp1.x + 3 * mt * t * t * cp2.x + t * t * t * to.x
        const my = mt * mt * mt * from.y + 3 * mt * mt * t * cp1.y + 3 * mt * t * t * cp2.y + t * t * t * to.y

        return { pathString: path, midPoint: { x: mx, y: my } }
    }, [fromNode, toNode])

    if (!fromNode || !toNode || !pathString) return null

    return (
        <g className="canvas-edge-group group cursor-pointer">
            {/* Invisible wide hover / click hit area */}
            <path
                d={pathString}
                fill="none"
                stroke="transparent"
                strokeWidth="24"
                className="pointer-events-auto"
                onClick={(e) => {
                    e.stopPropagation()
                    onSelect?.(edge.id)
                }}
            />

            {/* Visual Bezier Curve Path */}
            <path
                d={pathString}
                fill="none"
                stroke={isSelected ? '#3b82f6' : '#94a3b8'}
                strokeWidth={isSelected ? '2.5' : '2'}
                opacity={isSelected ? 1 : 0.8}
                markerEnd={isSelected ? 'url(#canvas-arrow-selected)' : 'url(#canvas-arrow)'}
                filter={isSelected ? 'drop-shadow(0 0 3px rgba(59,130,246,0.6))' : undefined}
                className="transition-all duration-150"
                onClick={(e) => {
                    e.stopPropagation()
                    onSelect?.(edge.id)
                }}
            />

            {/* Delete button shown when selected or hovered */}
            {isSelected && (
                <foreignObject
                    x={midPoint.x - 12}
                    y={midPoint.y - 12}
                    width="24"
                    height="24"
                    className="overflow-visible pointer-events-auto"
                >
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation()
                            onDelete?.(edge.id)
                        }}
                        className="w-6 h-6 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg transition-transform hover:scale-110 active:scale-95 cursor-pointer border border-white"
                        title="Delete connection"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </foreignObject>
            )}
        </g>
    )
}

export default memo(CanvasEdge)
