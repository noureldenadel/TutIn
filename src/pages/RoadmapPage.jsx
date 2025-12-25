import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
    Map, Plus, Save, Trash2, ZoomIn, ZoomOut,
    Move, Maximize2, BookOpen, Play, CheckCircle,
    ArrowRight, X, Grid3X3, Edit3, Download
} from 'lucide-react'
import { getAllCourses } from '../utils/db'
import LoadingSpinner from '../components/common/LoadingSpinner'

// Generate unique ID
const generateId = () => `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

function RoadmapPage() {
    const [courses, setCourses] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [roadmaps, setRoadmaps] = useState([])
    const [currentRoadmap, setCurrentRoadmap] = useState(null)
    const [showCoursePanel, setShowCoursePanel] = useState(true)
    const [showNewRoadmapModal, setShowNewRoadmapModal] = useState(false)
    const [newRoadmapTitle, setNewRoadmapTitle] = useState('')

    // Canvas state
    const [nodes, setNodes] = useState([])
    const [connections, setConnections] = useState([])
    const [selectedNode, setSelectedNode] = useState(null)
    const [connectingFrom, setConnectingFrom] = useState(null)
    const [zoom, setZoom] = useState(1)
    const [pan, setPan] = useState({ x: 0, y: 0 })
    const [isDragging, setIsDragging] = useState(false)
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
    const [draggedNode, setDraggedNode] = useState(null)

    const canvasRef = useRef(null)
    const containerRef = useRef(null)

    // Load courses and roadmaps
    useEffect(() => {
        loadData()
    }, [])

    async function loadData() {
        try {
            setIsLoading(true)
            const allCourses = await getAllCourses()
            setCourses(allCourses)

            // Load roadmaps from localStorage
            const saved = localStorage.getItem('learning_roadmaps')
            if (saved) {
                const parsed = JSON.parse(saved)
                setRoadmaps(parsed)
                // Load the last active roadmap
                if (parsed.length > 0) {
                    const lastActive = localStorage.getItem('last_roadmap_id')
                    const roadmap = parsed.find(r => r.id === lastActive) || parsed[0]
                    loadRoadmap(roadmap)
                }
            }
        } catch (err) {
            console.error('Failed to load data:', err)
        } finally {
            setIsLoading(false)
        }
    }

    function loadRoadmap(roadmap) {
        setCurrentRoadmap(roadmap)
        setNodes(roadmap.nodes || [])
        setConnections(roadmap.connections || [])
        setPan(roadmap.pan || { x: 0, y: 0 })
        setZoom(roadmap.zoom || 1)
        localStorage.setItem('last_roadmap_id', roadmap.id)
    }

    function saveRoadmap() {
        if (!currentRoadmap) return

        const updated = {
            ...currentRoadmap,
            nodes,
            connections,
            pan,
            zoom,
            updatedAt: new Date().toISOString()
        }

        const newRoadmaps = roadmaps.map(r => r.id === updated.id ? updated : r)
        setRoadmaps(newRoadmaps)
        setCurrentRoadmap(updated)
        localStorage.setItem('learning_roadmaps', JSON.stringify(newRoadmaps))
    }

    function createNewRoadmap() {
        if (!newRoadmapTitle.trim()) return

        const newRoadmap = {
            id: generateId(),
            title: newRoadmapTitle.trim(),
            nodes: [],
            connections: [],
            pan: { x: 0, y: 0 },
            zoom: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }

        const newRoadmaps = [...roadmaps, newRoadmap]
        setRoadmaps(newRoadmaps)
        localStorage.setItem('learning_roadmaps', JSON.stringify(newRoadmaps))
        loadRoadmap(newRoadmap)
        setShowNewRoadmapModal(false)
        setNewRoadmapTitle('')
    }

    function deleteRoadmap(id) {
        if (!confirm('Are you sure you want to delete this roadmap?')) return

        const newRoadmaps = roadmaps.filter(r => r.id !== id)
        setRoadmaps(newRoadmaps)
        localStorage.setItem('learning_roadmaps', JSON.stringify(newRoadmaps))

        if (currentRoadmap?.id === id) {
            if (newRoadmaps.length > 0) {
                loadRoadmap(newRoadmaps[0])
            } else {
                setCurrentRoadmap(null)
                setNodes([])
                setConnections([])
            }
        }
    }

    // Add course to canvas
    function addCourseToCanvas(course) {
        const container = containerRef.current
        if (!container) return

        const rect = container.getBoundingClientRect()
        const centerX = (rect.width / 2 - pan.x) / zoom
        const centerY = (rect.height / 2 - pan.y) / zoom

        // Offset slightly if there are already nodes
        const offset = nodes.length * 20

        const newNode = {
            id: generateId(),
            courseId: course.id,
            x: centerX + offset,
            y: centerY + offset,
            width: 280,
            height: 160
        }

        setNodes(prev => [...prev, newNode])
    }

    // Remove node
    function removeNode(nodeId) {
        setNodes(prev => prev.filter(n => n.id !== nodeId))
        setConnections(prev => prev.filter(c => c.fromNodeId !== nodeId && c.toNodeId !== nodeId))
        setSelectedNode(null)
    }

    // Handle node dragging
    const handleNodeMouseDown = (e, node) => {
        e.stopPropagation()
        setDraggedNode(node)
        setDragStart({ x: e.clientX - node.x * zoom, y: e.clientY - node.y * zoom })
        setSelectedNode(node.id)
    }

    const handleCanvasMouseDown = (e) => {
        if (draggedNode) return
        if (e.target === canvasRef.current || e.target.closest('.canvas-bg')) {
            setIsDragging(true)
            setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
            setSelectedNode(null)
            setConnectingFrom(null)
        }
    }

    const handleMouseMove = useCallback((e) => {
        if (draggedNode) {
            const newX = (e.clientX - dragStart.x) / zoom
            const newY = (e.clientY - dragStart.y) / zoom
            setNodes(prev => prev.map(n =>
                n.id === draggedNode.id ? { ...n, x: newX, y: newY } : n
            ))
        } else if (isDragging) {
            setPan({
                x: e.clientX - dragStart.x,
                y: e.clientY - dragStart.y
            })
        }
    }, [draggedNode, isDragging, dragStart, zoom])

    const handleMouseUp = () => {
        setDraggedNode(null)
        setIsDragging(false)
    }

    useEffect(() => {
        window.addEventListener('mousemove', handleMouseMove)
        window.addEventListener('mouseup', handleMouseUp)
        return () => {
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mouseup', handleMouseUp)
        }
    }, [handleMouseMove])

    // Connection handling
    function startConnecting(nodeId) {
        if (connectingFrom === nodeId) {
            setConnectingFrom(null)
        } else if (connectingFrom) {
            // Create connection
            if (connectingFrom !== nodeId) {
                const exists = connections.some(c =>
                    c.fromNodeId === connectingFrom && c.toNodeId === nodeId
                )
                if (!exists) {
                    setConnections(prev => [...prev, {
                        id: generateId(),
                        fromNodeId: connectingFrom,
                        toNodeId: nodeId
                    }])
                }
            }
            setConnectingFrom(null)
        } else {
            setConnectingFrom(nodeId)
        }
    }

    function removeConnection(connectionId) {
        setConnections(prev => prev.filter(c => c.id !== connectionId))
    }

    // Zoom controls
    const handleZoom = (delta) => {
        setZoom(prev => Math.min(2, Math.max(0.25, prev + delta)))
    }

    const resetView = () => {
        setZoom(1)
        setPan({ x: 0, y: 0 })
    }

    // Get course data for a node
    const getCourseForNode = (node) => {
        return courses.find(c => c.id === node.courseId)
    }

    // Get optimal connection point on node edge based on target position
    const getNodeEdgePoint = (fromNodeId, toNodeId) => {
        const fromNode = nodes.find(n => n.id === fromNodeId)
        const toNode = nodes.find(n => n.id === toNodeId)
        if (!fromNode || !toNode) return { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } }

        // Calculate centers
        const fromCenter = { x: fromNode.x + fromNode.width / 2, y: fromNode.y + fromNode.height / 2 }
        const toCenter = { x: toNode.x + toNode.width / 2, y: toNode.y + toNode.height / 2 }

        // Calculate angle between nodes
        const dx = toCenter.x - fromCenter.x
        const dy = toCenter.y - fromCenter.y
        const angle = Math.atan2(dy, dx)

        // Determine which edge to connect from/to based on angle
        const getEdgePoint = (node, isSource) => {
            const cx = node.x + node.width / 2
            const cy = node.y + node.height / 2
            const hw = node.width / 2
            const hh = node.height / 2

            // For source, we go in direction of target; for target, opposite
            const a = isSource ? angle : angle + Math.PI

            // Calculate intersection with node rectangle
            const tanA = Math.tan(a)
            const cosA = Math.cos(a)
            const sinA = Math.sin(a)

            // Check horizontal vs vertical edge intersection
            let px, py

            if (Math.abs(cosA) * hh > Math.abs(sinA) * hw) {
                // Intersects left or right edge
                px = cosA > 0 ? cx + hw : cx - hw
                py = cy + (px - cx) * tanA
            } else {
                // Intersects top or bottom edge
                py = sinA > 0 ? cy + hh : cy - hh
                px = cx + (py - cy) / tanA
            }

            return { x: px, y: py }
        }

        return {
            from: getEdgePoint(fromNode, true),
            to: getEdgePoint(toNode, false)
        }
    }

    // Calculate smooth bezier curve control points
    const getBezierControlPoints = (from, to) => {
        const dx = to.x - from.x
        const dy = to.y - from.y
        const distance = Math.sqrt(dx * dx + dy * dy)

        // Control point offset - increases with distance for smoother curves
        const offset = Math.min(distance * 0.4, 100)

        // Determine curve direction based on relative positions
        const isHorizontal = Math.abs(dx) > Math.abs(dy)

        if (isHorizontal) {
            // Horizontal flow - curve horizontally then vertically
            return {
                cp1: { x: from.x + offset, y: from.y },
                cp2: { x: to.x - offset, y: to.y }
            }
        } else {
            // Vertical flow - curve vertically then horizontally  
            return {
                cp1: { x: from.x, y: from.y + (dy > 0 ? offset : -offset) },
                cp2: { x: to.x, y: to.y + (dy > 0 ? -offset : offset) }
            }
        }
    }

    // Auto-save on changes
    useEffect(() => {
        if (currentRoadmap && (nodes.length > 0 || connections.length > 0)) {
            const timeout = setTimeout(saveRoadmap, 1000)
            return () => clearTimeout(timeout)
        }
    }, [nodes, connections, pan, zoom])

    if (isLoading) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <LoadingSpinner message="Loading roadmap..." />
            </div>
        )
    }

    return (
        <div className="h-[calc(100vh-8rem)] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h1 className="text-2xl font-bold text-light-text-primary dark:text-dark-text-primary flex items-center gap-3">
                        <Map className="w-7 h-7 text-primary" />
                        Learning Roadmap
                    </h1>
                    <p className="text-light-text-secondary dark:text-dark-text-secondary mt-1">
                        Plan your learning journey by connecting courses
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    {/* Roadmap Selector */}
                    <select
                        value={currentRoadmap?.id || ''}
                        onChange={(e) => {
                            const roadmap = roadmaps.find(r => r.id === e.target.value)
                            if (roadmap) loadRoadmap(roadmap)
                        }}
                        className="px-3 py-2 rounded-lg border border-light-border dark:border-dark-border bg-white dark:bg-dark-surface text-sm"
                    >
                        {roadmaps.length === 0 && (
                            <option value="">No roadmaps</option>
                        )}
                        {roadmaps.map(r => (
                            <option key={r.id} value={r.id}>{r.title}</option>
                        ))}
                    </select>

                    <button
                        onClick={() => setShowNewRoadmapModal(true)}
                        className="p-2 rounded-lg bg-white/10 text-light-text-primary dark:text-dark-text-primary hover:bg-white/20 transition-colors border border-light-border dark:border-dark-border"
                        title="Create new roadmap"
                    >
                        <Plus className="w-5 h-5" />
                    </button>

                    {currentRoadmap && (
                        <button
                            onClick={() => deleteRoadmap(currentRoadmap.id)}
                            className="p-2 rounded-lg text-light-text-secondary hover:text-error hover:bg-error/10 transition-colors"
                            title="Delete roadmap"
                        >
                            <Trash2 className="w-5 h-5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex gap-4 overflow-hidden">
                {/* Course Panel (Left) */}
                {showCoursePanel && (
                    <div className="w-72 bg-white dark:bg-dark-surface rounded-xl border border-light-border dark:border-dark-border flex flex-col overflow-hidden">
                        <div className="p-4 border-b border-light-border dark:border-dark-border">
                            <h3 className="font-semibold text-light-text-primary dark:text-dark-text-primary flex items-center gap-2">
                                <BookOpen className="w-5 h-5 text-primary" />
                                Courses
                            </h3>
                            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1">
                                Click to add to canvas
                            </p>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2">
                            {courses.map(course => {
                                const isOnCanvas = nodes.some(n => n.courseId === course.id)
                                return (
                                    <button
                                        key={course.id}
                                        onClick={() => !isOnCanvas && addCourseToCanvas(course)}
                                        disabled={isOnCanvas}
                                        className={`w-full p-3 rounded-lg text-left mb-2 transition-colors ${isOnCanvas
                                            ? 'bg-primary/10 cursor-not-allowed opacity-60'
                                            : 'bg-light-surface dark:bg-dark-bg hover:bg-primary/10'
                                            }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            {/* Thumbnail */}
                                            <div className="w-16 h-10 rounded bg-light-border dark:bg-dark-border flex-shrink-0 overflow-hidden">
                                                {course.thumbnailData ? (
                                                    <img
                                                        src={course.thumbnailData}
                                                        alt=""
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center">
                                                        <BookOpen className="w-4 h-4 opacity-50" />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium text-sm truncate text-light-text-primary dark:text-dark-text-primary">
                                                    {course.title}
                                                </div>
                                                <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary flex items-center gap-2 mt-1">
                                                    <span>{Math.round(course.completionPercentage || 0)}%</span>
                                                    {isOnCanvas && (
                                                        <span className="text-primary">Added</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </button>
                                )
                            })}
                            {courses.length === 0 && (
                                <div className="text-center py-8 text-light-text-secondary dark:text-dark-text-secondary text-sm">
                                    No courses yet
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Canvas Area */}
                <div
                    ref={containerRef}
                    className="flex-1 bg-light-surface dark:bg-dark-bg rounded-xl border border-light-border dark:border-dark-border overflow-hidden relative"
                >
                    {/* Toolbar */}
                    <div className="absolute top-4 left-4 z-10 flex gap-2">
                        <button
                            onClick={() => setShowCoursePanel(prev => !prev)}
                            className={`p-2 rounded-lg shadow-md transition-colors border border-light-border dark:border-dark-border ${showCoursePanel
                                ? 'bg-white dark:bg-dark-surface text-blue-600 dark:text-white'
                                : 'bg-white dark:bg-dark-surface text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-surface dark:hover:bg-dark-bg'
                                }`}
                            title="Toggle course panel"
                        >
                            <Grid3X3 className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Zoom Controls */}
                    <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
                        <button
                            onClick={() => handleZoom(0.25)}
                            className="p-2 rounded-lg bg-white dark:bg-dark-surface shadow-md hover:bg-light-surface dark:hover:bg-dark-bg transition-colors"
                            title="Zoom in"
                        >
                            <ZoomIn className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => handleZoom(-0.25)}
                            className="p-2 rounded-lg bg-white dark:bg-dark-surface shadow-md hover:bg-light-surface dark:hover:bg-dark-bg transition-colors"
                            title="Zoom out"
                        >
                            <ZoomOut className="w-5 h-5" />
                        </button>
                        <button
                            onClick={resetView}
                            className="p-2 rounded-lg bg-white dark:bg-dark-surface shadow-md hover:bg-light-surface dark:hover:bg-dark-bg transition-colors"
                            title="Reset view"
                        >
                            <Maximize2 className="w-5 h-5" />
                        </button>
                        <div className="px-2 py-1 bg-white dark:bg-dark-surface rounded-lg shadow-md text-xs text-center">
                            {Math.round(zoom * 100)}%
                        </div>
                    </div>

                    {/* Canvas */}
                    <div
                        ref={canvasRef}
                        className="w-full h-full cursor-grab active:cursor-grabbing canvas-bg"
                        onMouseDown={handleCanvasMouseDown}
                        style={{
                            backgroundImage: `radial-gradient(circle, var(--border) 1px, transparent 1px)`,
                            backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
                            backgroundPosition: `${pan.x}px ${pan.y}px`
                        }}
                    >
                        {/* SVG for connections */}
                        <svg
                            className="absolute inset-0 w-full h-full pointer-events-none"
                            style={{ overflow: 'visible' }}
                        >
                            <g style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
                                {connections.map(conn => {
                                    const points = getNodeEdgePoint(conn.fromNodeId, conn.toNodeId)
                                    const from = points.from
                                    const to = points.to
                                    const { cp1, cp2 } = getBezierControlPoints(from, to)

                                    // Calculate angle at the endpoint for arrow
                                    // Use the control point to determine arrow direction
                                    const arrowAngle = Math.atan2(to.y - cp2.y, to.x - cp2.x)
                                    const arrowLength = 10
                                    const arrowSpread = Math.PI / 7

                                    // Arrow head vertices
                                    const arrow1X = to.x - Math.cos(arrowAngle - arrowSpread) * arrowLength
                                    const arrow1Y = to.y - Math.sin(arrowAngle - arrowSpread) * arrowLength
                                    const arrow2X = to.x - Math.cos(arrowAngle + arrowSpread) * arrowLength
                                    const arrow2Y = to.y - Math.sin(arrowAngle + arrowSpread) * arrowLength

                                    return (
                                        <g key={conn.id} className="cursor-pointer group">
                                            {/* Invisible wider hit area for easier clicking */}
                                            <path
                                                d={`M ${from.x} ${from.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${to.x} ${to.y}`}
                                                fill="none"
                                                stroke="transparent"
                                                strokeWidth="20"
                                                style={{ pointerEvents: 'stroke' }}
                                                onClick={(e) => { e.stopPropagation(); removeConnection(conn.id); }}
                                            />
                                            {/* Connection line - cubic bezier for smooth curves */}
                                            <path
                                                d={`M ${from.x} ${from.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${to.x} ${to.y}`}
                                                fill="none"
                                                stroke="var(--primary)"
                                                strokeWidth="2.5"
                                                strokeLinecap="round"
                                                className="group-hover:stroke-red-500 transition-colors pointer-events-none"
                                            />
                                            {/* Arrow head at endpoint */}
                                            <polygon
                                                points={`${to.x},${to.y} ${arrow1X},${arrow1Y} ${arrow2X},${arrow2Y}`}
                                                fill="var(--primary)"
                                                className="group-hover:fill-red-500 transition-colors pointer-events-none"
                                            />
                                            {/* Delete indicator on hover - shows at midpoint */}
                                            <g
                                                className="opacity-0 group-hover:opacity-100 transition-opacity"
                                                transform={`translate(${(from.x + to.x) / 2}, ${(from.y + to.y) / 2})`}
                                            >
                                                <circle r="12" fill="white" stroke="#ef4444" strokeWidth="2" />
                                                <text x="0" y="1" textAnchor="middle" dominantBaseline="middle" fill="#ef4444" fontSize="14" fontWeight="bold">×</text>
                                            </g>
                                        </g>
                                    )
                                })}
                            </g>
                        </svg>

                        {/* Nodes */}
                        <div
                            className="absolute inset-0"
                            style={{
                                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                                transformOrigin: '0 0'
                            }}
                        >
                            {nodes.map(node => {
                                const course = getCourseForNode(node)
                                if (!course) return null

                                const progress = course.completionPercentage || 0
                                const isSelected = selectedNode === node.id
                                const isConnecting = connectingFrom === node.id

                                return (
                                    <div
                                        key={node.id}
                                        className={`absolute bg-white dark:bg-dark-surface rounded-xl shadow-lg border-2 transition-shadow cursor-move select-none ${isSelected ? 'border-primary shadow-xl ring-2 ring-primary/20' :
                                            isConnecting ? 'border-green-500 shadow-xl' :
                                                'border-light-border dark:border-dark-border hover:shadow-xl'
                                            }`}
                                        style={{
                                            left: node.x,
                                            top: node.y,
                                            width: node.width,
                                            height: node.height
                                        }}
                                        onMouseDown={(e) => handleNodeMouseDown(e, node)}
                                    >
                                        {/* Node Content */}
                                        <div className="p-4 h-full flex flex-col">
                                            {/* Header */}
                                            <div className="flex items-start gap-3 mb-3">
                                                {/* Thumbnail */}
                                                <div className="w-16 h-10 rounded bg-light-surface dark:bg-dark-bg flex-shrink-0 overflow-hidden">
                                                    {course.thumbnailData ? (
                                                        <img
                                                            src={course.thumbnailData}
                                                            alt=""
                                                            className="w-full h-full object-cover"
                                                        />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center">
                                                            <BookOpen className="w-4 h-4 opacity-50" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-medium text-sm truncate text-light-text-primary dark:text-dark-text-primary">
                                                        {course.title}
                                                    </h4>
                                                    {course.instructor && (
                                                        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary truncate">
                                                            {course.instructor}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Progress */}
                                            <div className="mb-3">
                                                <div className="flex justify-between text-xs mb-1">
                                                    <span className="text-light-text-secondary dark:text-dark-text-secondary">
                                                        {course.completedVideos || 0}/{course.totalVideos || 0} videos
                                                    </span>
                                                    <span className={`font-medium ${progress === 100 ? 'text-green-500' : 'text-primary'
                                                        }`}>
                                                        {Math.round(progress)}%
                                                    </span>
                                                </div>
                                                <div className="h-2 bg-light-surface dark:bg-dark-bg rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all ${progress === 100
                                                            ? 'bg-green-500'
                                                            : 'bg-gradient-to-r from-primary to-primary-dark'
                                                            }`}
                                                        style={{ width: `${progress}%` }}
                                                    />
                                                </div>
                                            </div>

                                            {/* Actions */}
                                            <div className="flex items-center gap-2 mt-auto">
                                                <Link
                                                    to={`/course/${course.id}`}
                                                    className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-medium hover:bg-primary/20 transition-colors"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <Play className="w-3 h-3" />
                                                    Open
                                                </Link>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        startConnecting(node.id)
                                                    }}
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isConnecting
                                                        ? 'bg-green-500 text-white'
                                                        : 'bg-light-surface dark:bg-dark-bg hover:bg-primary/10 text-light-text-primary dark:text-dark-text-primary'
                                                        }`}
                                                    title={isConnecting ? 'Click another node to connect' : 'Connect to another course'}
                                                >
                                                    <ArrowRight className="w-3 h-3" />
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        removeNode(node.id)
                                                    }}
                                                    className="p-1.5 rounded-lg text-light-text-secondary hover:text-error hover:bg-error/10 transition-colors"
                                                    title="Remove from roadmap"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Status indicator */}
                                        {progress === 100 && (
                                            <div className="absolute -top-2 -right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                                                <CheckCircle className="w-4 h-4 text-white" />
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>

                        {/* Empty state */}
                        {nodes.length === 0 && currentRoadmap && (
                            <div className="absolute inset-0 flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary">
                                <div className="text-center">
                                    <Map className="w-16 h-16 mx-auto mb-4 opacity-30" />
                                    <p className="text-lg font-medium mb-2">Start building your roadmap</p>
                                    <p className="text-sm">Click courses from the left panel to add them here</p>
                                </div>
                            </div>
                        )}

                        {/* No roadmap selected */}
                        {!currentRoadmap && (
                            <div className="absolute inset-0 flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary">
                                <div className="text-center">
                                    <Map className="w-16 h-16 mx-auto mb-4 opacity-30" />
                                    <p className="text-lg font-medium mb-4">No roadmap selected</p>
                                    <button
                                        onClick={() => setShowNewRoadmapModal(true)}
                                        className="px-6 py-2.5 rounded-full bg-white/10 text-primary dark:text-white hover:bg-white/20 transition-all border border-white/10 flex items-center gap-2"
                                    >
                                        <Plus className="w-5 h-5" />
                                        Create Your First Roadmap
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Connection hint */}
                    {connectingFrom && (
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-green-500 text-white rounded-lg shadow-lg text-sm">
                            Click another course node to create a connection
                        </div>
                    )}
                </div>
            </div>

            {/* New Roadmap Modal */}
            {showNewRoadmapModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-dark-surface rounded-xl p-6 w-full max-w-md shadow-2xl">
                        <h3 className="text-lg font-semibold mb-4 text-light-text-primary dark:text-dark-text-primary">
                            Create New Roadmap
                        </h3>
                        <input
                            type="text"
                            value={newRoadmapTitle}
                            onChange={(e) => setNewRoadmapTitle(e.target.value)}
                            placeholder="Roadmap title..."
                            className="w-full px-4 py-3 rounded-lg border border-light-border dark:border-dark-border bg-white dark:bg-dark-surface focus:ring-2 focus:ring-primary outline-none mb-4"
                            autoFocus
                            onKeyDown={(e) => e.key === 'Enter' && createNewRoadmap()}
                        />
                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setShowNewRoadmapModal(false)
                                    setNewRoadmapTitle('')
                                }}
                                className="flex-1 px-4 py-2 rounded-lg border border-light-border dark:border-dark-border hover:bg-light-surface dark:hover:bg-dark-bg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={createNewRoadmap}
                                disabled={!newRoadmapTitle.trim()}
                                className="flex-1 px-4 py-2 rounded-lg bg-white/10 text-primary dark:text-white hover:bg-white/20 disabled:opacity-50 transition-colors border border-white/10"
                            >
                                Create
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default RoadmapPage
