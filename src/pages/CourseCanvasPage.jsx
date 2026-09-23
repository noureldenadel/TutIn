import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
    ChevronLeft, Plus, ImagePlus, LayoutGrid, Sparkles,
    ZoomIn, ZoomOut, RotateCcw, Maximize2, Layers,
    FileText, Video, Folder, Check, AlertCircle, Eye,
    Trash2, X, PanelRightClose, PanelRightOpen, ArrowRight,
    Search, HelpCircle, Move
} from 'lucide-react'
import {
    getCourse, getModulesByCourse, getVideosByModule,
    getNotesByCourse, getCanvasData, saveCanvasData,
    generateId, formatDuration
} from '../utils/db'
import CanvasNode from '../components/canvas/CanvasNode'
import CanvasEdge, { getNodeEdgePoint } from '../components/canvas/CanvasEdge'
import LoadingSpinner from '../components/common/LoadingSpinner'
import { useNotification } from '../contexts/NotificationContext'

const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024 // 2MB

function resizeImageFile(file) {
    return new Promise((resolve, reject) => {
        if (file.size > MAX_IMAGE_SIZE_BYTES * 4) {
            reject(new Error('Image too large (max ~8MB input)'))
            return
        }
        const reader = new FileReader()
        reader.onload = (e) => {
            const img = new Image()
            img.onload = () => {
                const maxWidth = 1000
                const scale = Math.min(1, maxWidth / img.width)
                const canvas = document.createElement('canvas')
                canvas.width = img.width * scale
                canvas.height = img.height * scale
                const ctx = canvas.getContext('2d')
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
                let quality = 0.85
                let result = canvas.toDataURL('image/jpeg', quality)
                while (result.length > MAX_IMAGE_SIZE_BYTES && quality > 0.3) {
                    quality -= 0.1
                    result = canvas.toDataURL('image/jpeg', quality)
                }
                resolve(result)
            }
            img.onerror = () => reject(new Error('Failed to load image'))
            img.src = e.target.result
        }
        reader.onerror = () => reject(new Error('Failed to read file'))
        reader.readAsDataURL(file)
    })
}

function CourseCanvasPage() {
    const { courseId } = useParams()
    const navigate = useNavigate()
    const { showNotification } = useNotification()

    // Data states
    const [course, setCourse] = useState(null)
    const [videos, setVideos] = useState([])
    const [allNotes, setAllNotes] = useState([])
    const [nodes, setNodes] = useState([])
    const [edges, setEdges] = useState([])
    const [pan, setPan] = useState({ x: 0, y: 0 })
    const [zoom, setZoom] = useState(1)

    // UI states
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [saveStatus, setSaveStatus] = useState('saved') // 'saved' | 'saving' | 'unsaved'
    const [selectedNodeId, setSelectedNodeId] = useState(null)
    const [selectedEdgeId, setSelectedEdgeId] = useState(null)
    const [connectingFromId, setConnectingFromId] = useState(null)
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
    const [showSidebar, setShowSidebar] = useState(true)
    const [sidebarSearch, setSidebarSearch] = useState('')
    const [previewImage, setPreviewImage] = useState(null)

    // Canvas Dragging & Pan Refs
    const containerRef = useRef(null)
    const fileInputRef = useRef(null)
    const isPanningRef = useRef(false)
    const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 })
    const draggingNodeRef = useRef(null) // { nodeId, startMouseX, startMouseY, startNodeX, startNodeY }
    const rafIdRef = useRef(null)
    const pendingMoveRef = useRef(null)
    const skipAutoSaveRef = useRef(true)

    // ============================================
    // INITIAL LOAD & AUTO-POPULATION
    // ============================================
    useEffect(() => {
        let isMounted = true

        async function initCanvas() {
            try {
                setIsLoading(true)
                const [courseData, modulesData, notesData, canvasData] = await Promise.all([
                    getCourse(courseId),
                    getModulesByCourse(courseId),
                    getNotesByCourse(courseId),
                    getCanvasData(courseId).catch(() => ({ nodes: [], edges: [], viewport: null }))
                ])

                if (!isMounted) return

                setCourse(courseData)
                setAllNotes(notesData || [])

                // Fetch all videos from modules
                const vids = []
                for (const mod of (modulesData || [])) {
                    const modVideos = await getVideosByModule(mod.id)
                    for (const v of (modVideos || [])) {
                        vids.push({ ...v, moduleTitle: mod.title })
                    }
                }
                setVideos(vids)

                const existingNodes = canvasData?.nodes || []
                const existingEdges = canvasData?.edges || []
                const viewport = canvasData?.viewport || {}

                if (existingNodes.length > 0) {
                    setNodes(existingNodes)
                    setEdges(existingEdges)
                    if (viewport.pan) setPan(viewport.pan)
                    if (viewport.zoom) setZoom(viewport.zoom)
                } else if (notesData && notesData.length > 0) {
                    const populated = autoPopulateNodes(notesData, vids, courseId)
                    setNodes(populated.nodes)
                    setEdges([])
                    setPan({ x: 60, y: 60 })
                    setZoom(0.9)
                } else {
                    setNodes([])
                    setEdges([])
                    setPan({ x: 0, y: 0 })
                    setZoom(1)
                }
            } catch (err) {
                console.error('Failed to initialize canvas:', err)
                showNotification('Failed to load canvas data', 'error')
            } finally {
                if (isMounted) {
                    setIsLoading(false)
                    setTimeout(() => {
                        skipAutoSaveRef.current = false
                    }, 500)
                }
            }
        }

        initCanvas()
        return () => {
            isMounted = false
        }
    }, [courseId])

    /**
     * Auto-populate canvas nodes grouped by video
     */
    function autoPopulateNodes(notes, vids, cId) {
        const videoMap = new Map(vids.map(v => [v.id, v]))
        const notesByVideo = new Map()
        for (const note of notes) {
            const list = notesByVideo.get(note.videoId) || []
            list.push(note)
            notesByVideo.set(note.videoId, list)
        }

        const generatedNodes = []
        let colX = 60
        const cardWidth = 320
        const colGap = 60

        for (const [vId, vNotes] of notesByVideo.entries()) {
            const vid = videoMap.get(vId)
            const videoTitle = vid?.title || 'Video'
            let rowY = 60

            vNotes.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))

            for (const n of vNotes) {
                generatedNodes.push({
                    id: generateId('cnode_'),
                    courseId: cId,
                    noteId: n.id,
                    type: 'note',
                    content: n.content || '',
                    title: '',
                    x: colX,
                    y: rowY,
                    width: cardWidth,
                    height: 200,
                    color: '',
                    videoTitle: videoTitle,
                    videoId: vId,
                    timestamp: n.timestamp,
                    createdAt: n.createdAt || new Date().toISOString()
                })
                rowY += 240
            }

            colX += cardWidth + colGap
        }

        return { nodes: generatedNodes }
    }

    // ============================================
    // AUTO-SAVE ON DEBOUNCE
    // ============================================
    useEffect(() => {
        if (skipAutoSaveRef.current || isLoading) return

        setSaveStatus('unsaved')
        const timer = setTimeout(async () => {
            try {
                setSaveStatus('saving')
                setIsSaving(true)
                await saveCanvasData(courseId, {
                    nodes,
                    edges,
                    viewport: { pan, zoom }
                })
                setSaveStatus('saved')
            } catch (err) {
                console.error('Auto-save error:', err)
                setSaveStatus('unsaved')
            } finally {
                setIsSaving(false)
            }
        }, 800)

        return () => clearTimeout(timer)
    }, [nodes, edges, pan, zoom, courseId, isLoading])

    // ============================================
    // PAN & ZOOM HANDLERS
    // ============================================
    const handleWheel = useCallback((e) => {
        e.preventDefault()
        if (!containerRef.current) return

        const rect = containerRef.current.getBoundingClientRect()
        const mouseScreenX = e.clientX - rect.left
        const mouseScreenY = e.clientY - rect.top

        if (e.ctrlKey || Math.abs(e.deltaY) < 50) {
            const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92
            setZoom(prevZoom => {
                const nextZoom = Math.min(2.5, Math.max(0.2, prevZoom * zoomFactor))
                setPan(prevPan => ({
                    x: mouseScreenX - (mouseScreenX - prevPan.x) * (nextZoom / prevZoom),
                    y: mouseScreenY - (mouseScreenY - prevPan.y) * (nextZoom / prevZoom)
                }))
                return nextZoom
            })
        } else {
            setPan(prev => ({
                x: prev.x - e.deltaX * 0.8,
                y: prev.y - e.deltaY * 0.8
            }))
        }
    }, [])

    const handleMouseDownBackground = (e) => {
        if (e.target.closest('.group\\/card') || e.target.closest('button') || e.target.closest('input')) {
            return
        }

        setSelectedNodeId(null)
        setSelectedEdgeId(null)
        setConnectingFromId(null)

        isPanningRef.current = true
        panStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            panX: pan.x,
            panY: pan.y
        }
    }

    const handleNodeDragStart = useCallback((e, nodeId) => {
        e.stopPropagation()
        setSelectedNodeId(nodeId)
        setSelectedEdgeId(null)

        const targetNode = nodes.find(n => n.id === nodeId)
        if (!targetNode) return

        draggingNodeRef.current = {
            nodeId,
            startMouseX: e.clientX,
            startMouseY: e.clientY,
            startNodeX: targetNode.x,
            startNodeY: targetNode.y
        }
    }, [nodes])

    // Global mouse move & mouse up with 60fps RAF throttling
    useEffect(() => {
        function flushMove() {
            if (!pendingMoveRef.current) return
            const e = pendingMoveRef.current
            pendingMoveRef.current = null

            // 1. Update mouse position for live connecting arrow
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect()
                setMousePos({
                    x: (e.clientX - rect.left - pan.x) / zoom,
                    y: (e.clientY - rect.top - pan.y) / zoom
                })
            }

            // 2. Handle Panning
            if (isPanningRef.current) {
                const dx = e.clientX - panStartRef.current.x
                const dy = e.clientY - panStartRef.current.y
                setPan({
                    x: panStartRef.current.panX + dx,
                    y: panStartRef.current.panY + dy
                })
                return
            }

            // 3. Handle Node Dragging — RAF batch state update (syncs card & arrows simultaneously)
            if (draggingNodeRef.current) {
                const { nodeId, startMouseX, startMouseY, startNodeX, startNodeY } = draggingNodeRef.current
                const dx = (e.clientX - startMouseX) / zoom
                const dy = (e.clientY - startMouseY) / zoom
                const newX = Math.round(startNodeX + dx)
                const newY = Math.round(startNodeY + dy)

                setNodes(prev => prev.map(n =>
                    n.id === nodeId ? { ...n, x: newX, y: newY } : n
                ))
            }
        }

        function onMouseMove(e) {
            pendingMoveRef.current = e
            if (!rafIdRef.current) {
                rafIdRef.current = requestAnimationFrame(() => {
                    rafIdRef.current = null
                    flushMove()
                })
            }
        }

        function onMouseUp() {
            if (rafIdRef.current) {
                cancelAnimationFrame(rafIdRef.current)
                rafIdRef.current = null
            }
            flushMove()
            isPanningRef.current = false
            draggingNodeRef.current = null
        }

        window.addEventListener('mousemove', onMouseMove)
        window.addEventListener('mouseup', onMouseUp)
        return () => {
            window.removeEventListener('mousemove', onMouseMove)
            window.removeEventListener('mouseup', onMouseUp)
            if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current)
        }
    }, [pan.x, pan.y, zoom])

    // Attach wheel listener to container
    useEffect(() => {
        const el = containerRef.current
        if (!el) return
        el.addEventListener('wheel', handleWheel, { passive: false })
        return () => el.removeEventListener('wheel', handleWheel)
    }, [handleWheel])

    // Keyboard shortcuts (Delete, Escape, Space, etc.)
    useEffect(() => {
        function onKeyDown(e) {
            if (['INPUT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable) {
                return
            }

            if (e.key === 'Escape') {
                setConnectingFromId(null)
                setSelectedNodeId(null)
                setSelectedEdgeId(null)
            }

            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectedEdgeId) {
                    deleteEdge(selectedEdgeId)
                } else if (selectedNodeId) {
                    deleteNode(selectedNodeId)
                }
            }
        }

        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [selectedEdgeId, selectedNodeId])

    // ============================================
    // NODE & EDGE ACTIONS
    // ============================================
    function handleUpdateNode(nodeId, updates) {
        setNodes(prev => prev.map(n => (n.id === nodeId ? { ...n, ...updates } : n)))
    }

    function deleteNode(nodeId) {
        setNodes(prev => prev.filter(n => n.id !== nodeId))
        setEdges(prev => prev.filter(e => e.fromNodeId !== nodeId && e.toNodeId !== nodeId))
        if (selectedNodeId === nodeId) setSelectedNodeId(null)
    }

    function deleteEdge(edgeId) {
        setEdges(prev => prev.filter(e => e.id !== edgeId))
        if (selectedEdgeId === edgeId) setSelectedEdgeId(null)
    }

    function handleStartConnect(nodeId) {
        if (connectingFromId === nodeId) {
            setConnectingFromId(null)
        } else if (connectingFromId) {
            handleCompleteConnect(nodeId)
        } else {
            setConnectingFromId(nodeId)
        }
    }

    function handleCompleteConnect(targetNodeId) {
        if (!connectingFromId || connectingFromId === targetNodeId) {
            setConnectingFromId(null)
            return
        }

        const exists = edges.some(e =>
            (e.fromNodeId === connectingFromId && e.toNodeId === targetNodeId) ||
            (e.fromNodeId === targetNodeId && e.toNodeId === connectingFromId)
        )

        if (!exists) {
            const newEdge = {
                id: generateId('cedge_'),
                courseId,
                fromNodeId: connectingFromId,
                toNodeId: targetNodeId,
                createdAt: new Date().toISOString()
            }
            setEdges(prev => [...prev, newEdge])
            showNotification('Connection created', 'success')
        }

        setConnectingFromId(null)
    }

    // Add standalone note
    function handleAddStandaloneNote() {
        if (!containerRef.current) return
        const rect = containerRef.current.getBoundingClientRect()
        const centerX = (-pan.x + rect.width / 2 - 160) / zoom
        const centerY = (-pan.y + rect.height / 2 - 90) / zoom

        const newNode = {
            id: generateId('cnode_'),
            courseId,
            noteId: null,
            type: 'note',
            content: '<p>New note</p>',
            title: 'Note',
            x: Math.round(centerX),
            y: Math.round(centerY),
            width: 320,
            height: 180,
            color: '',
            createdAt: new Date().toISOString()
        }

        setNodes(prev => [...prev, newNode])
        setSelectedNodeId(newNode.id)
    }

    // Add Group container (Obsidian style)
    function handleAddGroup() {
        if (!containerRef.current) return
        const rect = containerRef.current.getBoundingClientRect()
        const centerX = (-pan.x + rect.width / 2 - 240) / zoom
        const centerY = (-pan.y + rect.height / 2 - 160) / zoom

        const newGroup = {
            id: generateId('cnode_group_'),
            courseId,
            noteId: null,
            type: 'group',
            content: '',
            title: 'New Group',
            x: Math.round(centerX),
            y: Math.round(centerY),
            width: 480,
            height: 320,
            color: '',
            createdAt: new Date().toISOString()
        }

        setNodes(prev => [newGroup, ...prev])
        setSelectedNodeId(newGroup.id)
        showNotification('Added group container', 'success')
    }

    // Add image node
    async function handleAddImageFile(e) {
        const file = e.target.files?.[0]
        if (!file) return

        try {
            const dataUrl = await resizeImageFile(file)
            if (!containerRef.current) return
            const rect = containerRef.current.getBoundingClientRect()
            const centerX = (-pan.x + rect.width / 2 - 160) / zoom
            const centerY = (-pan.y + rect.height / 2 - 120) / zoom

            const newNode = {
                id: generateId('cnode_'),
                courseId,
                noteId: null,
                type: 'image',
                content: dataUrl,
                title: file.name.replace(/\.[^/.]+$/, ''),
                x: Math.round(centerX),
                y: Math.round(centerY),
                width: 320,
                height: 240,
                createdAt: new Date().toISOString()
            }

            setNodes(prev => [...prev, newNode])
            setSelectedNodeId(newNode.id)
        } catch (err) {
            console.error('Failed to add image:', err)
            showNotification(err.message || 'Failed to upload image', 'warning')
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    // Add specific video note to canvas from sidebar
    function handleAddVideoNoteToCanvas(note, video) {
        const alreadyExists = nodes.some(n => n.noteId === note.id)
        if (alreadyExists) {
            // Find and focus on existing node
            const existing = nodes.find(n => n.noteId === note.id)
            if (existing && containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect()
                setPan({
                    x: rect.width / 2 - existing.x * zoom - (existing.width * zoom) / 2,
                    y: rect.height / 2 - existing.y * zoom - (existing.height * zoom) / 2
                })
                setSelectedNodeId(existing.id)
            }
            return
        }

        if (!containerRef.current) return
        const rect = containerRef.current.getBoundingClientRect()
        const centerX = (-pan.x + rect.width / 2 - 150) / zoom
        const centerY = (-pan.y + rect.height / 2 - 100) / zoom

        const newNode = {
            id: generateId('cnode_'),
            courseId,
            noteId: note.id,
            type: 'note',
            content: note.content || '',
            title: '',
            x: Math.round(centerX),
            y: Math.round(centerY),
            width: 320,
            height: 180,
            color: '',
            videoTitle: video?.title || 'Video Note',
            videoId: note.videoId,
            timestamp: note.timestamp,
            createdAt: note.createdAt || new Date().toISOString()
        }

        setNodes(prev => [...prev, newNode])
        setSelectedNodeId(newNode.id)
    }

    // Auto Layout (Grid / Columns by video)
    function handleAutoLayout() {
        if (nodes.length === 0) return

        // Group nodes by video or standalone
        const grouped = new Map()
        for (const node of nodes) {
            const key = node.videoId || 'standalone'
            const list = grouped.get(key) || []
            list.push(node)
            grouped.set(key, list)
        }

        let colX = 60
        const cardWidth = 320
        const colGap = 60
        const updated = []

        for (const [, groupNodes] of grouped.entries()) {
            let rowY = 60
            // Sort by timestamp if available
            groupNodes.sort((a, b) => (a.timestamp ?? 999999) - (b.timestamp ?? 999999))
            for (const n of groupNodes) {
                updated.push({
                    ...n,
                    x: colX,
                    y: rowY,
                    width: cardWidth
                })
                rowY += 240
            }
            colX += cardWidth + colGap
        }

        setNodes(updated)
        setPan({ x: 60, y: 60 })
        setZoom(0.9)
        showNotification('Canvas cards arranged', 'success')
    }

    // Auto Group: generate group boxes for each video
    function handleAutoGroup() {
        if (nodes.length === 0) return

        const videoGroups = new Map()
        for (const n of nodes) {
            if (n.type === 'note' && n.videoId) {
                const list = videoGroups.get(n.videoId) || []
                list.push(n)
                videoGroups.set(n.videoId, list)
            }
        }

        const newGroupNodes = []
        for (const [vId, vNodes] of videoGroups.entries()) {
            if (vNodes.length === 0) continue
            // Check if group already exists
            const existingGroup = nodes.find(n => n.type === 'group' && n.title === vNodes[0].videoTitle)
            if (existingGroup) continue

            // Compute bounding box
            const minX = Math.min(...vNodes.map(n => n.x)) - 24
            const minY = Math.min(...vNodes.map(n => n.y)) - 54
            const maxX = Math.max(...vNodes.map(n => n.x + (n.width || 300))) + 24
            const maxY = Math.max(...vNodes.map(n => n.y + (n.height || 180))) + 24

            newGroupNodes.push({
                id: generateId('cnode_group_'),
                courseId,
                noteId: null,
                type: 'group',
                content: '',
                title: vNodes[0].videoTitle || 'Video Group',
                x: Math.round(minX),
                y: Math.round(minY),
                width: Math.max(380, Math.round(maxX - minX)),
                height: Math.max(260, Math.round(maxY - minY)),
                color: '',
                createdAt: new Date().toISOString()
            })
        }

        if (newGroupNodes.length > 0) {
            setNodes(prev => [...newGroupNodes, ...prev])
            showNotification(`Created ${newGroupNodes.length} video group container(s)`, 'success')
        } else {
            showNotification('Video groups are already present', 'info')
        }
    }

    // Reset View / Fit All
    function handleResetView() {
        setPan({ x: 60, y: 60 })
        setZoom(1)
    }

    function handleFitAll() {
        if (nodes.length === 0 || !containerRef.current) {
            handleResetView()
            return
        }

        const minX = Math.min(...nodes.map(n => n.x))
        const minY = Math.min(...nodes.map(n => n.y))
        const maxX = Math.max(...nodes.map(n => n.x + (n.width || 300)))
        const maxY = Math.max(...nodes.map(n => n.y + (n.height || 180)))

        const totalW = maxX - minX + 120
        const totalH = maxY - minY + 120

        const rect = containerRef.current.getBoundingClientRect()
        const fitZoom = Math.min(1.2, Math.max(0.25, Math.min(rect.width / totalW, rect.height / totalH)))

        setZoom(fitZoom)
        setPan({
            x: (rect.width - totalW * fitZoom) / 2 - minX * fitZoom + 60 * fitZoom,
            y: (rect.height - totalH * fitZoom) / 2 - minY * fitZoom + 60 * fitZoom
        })
    }

    // Filtered sidebar videos
    const filteredVideos = useMemo(() => {
        if (!sidebarSearch.trim()) return videos
        const q = sidebarSearch.toLowerCase()
        return videos.filter(v => v.title.toLowerCase().includes(q) || (v.moduleTitle && v.moduleTitle.toLowerCase().includes(q)))
    }, [videos, sidebarSearch])

    if (isLoading) {
        return (
            <div className="h-[calc(100vh-4rem)] flex items-center justify-center">
                <LoadingSpinner message="Opening Canvas..." />
            </div>
        )
    }

    const connectingFromNode = nodes.find(n => n.id === connectingFromId)

    return (
        <div className="relative h-[calc(100vh-4rem)] -mx-4 -my-6 flex flex-col overflow-hidden bg-neutral-50 dark:bg-[#0f1117] text-neutral-900 dark:text-neutral-100 select-none">
            {/* Hidden image input */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAddImageFile}
            />

            {/* ============================================
                TOP TOOLBAR
            ============================================ */}
            <header className="h-14 px-4 bg-white/85 dark:bg-dark-surface/85 backdrop-blur-md border-b border-light-border dark:border-dark-border flex items-center justify-between z-30 shrink-0 shadow-xs">
                {/* Left: Back & Course Title */}
                <div className="flex items-center gap-3 min-w-0">
                    <Link
                        to={`/course/${courseId}`}
                        className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white transition-colors"
                        title="Back to Player"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </Link>

                    <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                            <LayoutGrid className="w-4 h-4 text-primary-fg" />
                        </div>
                        <div className="min-w-0">
                            <h1 className="text-sm font-semibold truncate leading-tight">
                                {course?.title || 'Canvas'}
                            </h1>
                            <div className="flex items-center gap-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                                <span>{nodes.length} cards</span>
                                <span>•</span>
                                <span>{edges.length} connections</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Center: Canvas Action Tools */}
                <div className="flex items-center gap-1.5 bg-neutral-100 dark:bg-dark-bg p-1 rounded-xl border border-light-border dark:border-dark-border shadow-xs">
                    {/* Add Note Button */}
                    <button
                        type="button"
                        onClick={handleAddStandaloneNote}
                        className="px-2.5 py-1.5 bg-white dark:bg-dark-surface hover:bg-neutral-50 dark:hover:bg-neutral-700 rounded-lg text-xs font-medium text-neutral-700 dark:text-neutral-200 border border-light-border dark:border-dark-border shadow-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                        title="Add course note to canvas"
                    >
                        <Plus className="w-3.5 h-3.5 text-primary-fg" />
                        <span>Add Note</span>
                    </button>

                    {/* Add Image Button */}
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-2.5 py-1.5 bg-white dark:bg-dark-surface hover:bg-neutral-50 dark:hover:bg-neutral-700 rounded-lg text-xs font-medium text-neutral-700 dark:text-neutral-200 border border-light-border dark:border-dark-border shadow-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                        title="Add image card"
                    >
                        <ImagePlus className="w-3.5 h-3.5 text-primary-fg" />
                        <span>Add Image</span>
                    </button>

                    {/* Add Group Button (Obsidian Style) */}
                    <button
                        type="button"
                        onClick={handleAddGroup}
                        className="px-2.5 py-1.5 bg-white dark:bg-dark-surface hover:bg-neutral-50 dark:hover:bg-neutral-700 rounded-lg text-xs font-medium text-neutral-700 dark:text-neutral-200 border border-light-border dark:border-dark-border shadow-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                        title="Add group container to organize cards"
                    >
                        <Folder className="w-3.5 h-3.5 text-primary-fg" />
                        <span>Add Group</span>
                    </button>

                    <div className="w-[1px] h-4 bg-neutral-300 dark:bg-neutral-700 mx-0.5" />

                    {/* Auto Group */}
                    <button
                        type="button"
                        onClick={handleAutoGroup}
                        className="p-1.5 hover:bg-white dark:hover:bg-dark-surface rounded-lg text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white transition-all cursor-pointer"
                        title="Auto-group video notes inside boxes"
                    >
                        <Layers className="w-4 h-4 text-primary-fg" />
                    </button>

                    {/* Auto Layout */}
                    <button
                        type="button"
                        onClick={handleAutoLayout}
                        className="p-1.5 hover:bg-white dark:hover:bg-dark-surface rounded-lg text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white transition-all cursor-pointer"
                        title="Auto arrange cards in clean columns"
                    >
                        <Sparkles className="w-4 h-4 text-primary-fg" />
                    </button>
                </div>

                {/* Right: Zoom & Sidebar Toggle */}
                <div className="flex items-center gap-2">
                    {/* Zoom Bar */}
                    <div className="flex items-center gap-1 bg-neutral-100 dark:bg-dark-bg p-1 rounded-xl border border-light-border dark:border-dark-border">
                        <button
                            type="button"
                            onClick={() => setZoom(z => Math.max(0.2, z - 0.15))}
                            className="p-1.5 hover:bg-white dark:hover:bg-dark-surface rounded-lg text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer"
                            title="Zoom out"
                        >
                            <ZoomOut className="w-3.5 h-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={handleResetView}
                            className="px-2 py-1 text-xs font-mono text-neutral-700 dark:text-neutral-300 hover:text-primary transition-colors cursor-pointer min-w-[48px] text-center"
                            title="Reset zoom to 100%"
                        >
                            {Math.round(zoom * 100)}%
                        </button>
                        <button
                            type="button"
                            onClick={() => setZoom(z => Math.min(2.5, z + 0.15))}
                            className="p-1.5 hover:bg-white dark:hover:bg-dark-surface rounded-lg text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer"
                            title="Zoom in"
                        >
                            <ZoomIn className="w-3.5 h-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={handleFitAll}
                            className="p-1.5 hover:bg-white dark:hover:bg-dark-surface rounded-lg text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer"
                            title="Fit all cards in view"
                        >
                            <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    {/* Auto-save status indicator */}
                    <div className="hidden sm:flex items-center gap-1.5 text-xs text-neutral-500 font-medium px-2">
                        {saveStatus === 'saving' ? (
                            <>
                                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                                <span>Saving...</span>
                            </>
                        ) : saveStatus === 'unsaved' ? (
                            <>
                                <span className="w-2 h-2 rounded-full bg-amber-500" />
                                <span>Unsaved</span>
                            </>
                        ) : (
                            <>
                                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                <span>Saved</span>
                            </>
                        )}
                    </div>

                    {/* Sidebar Toggle */}
                    <button
                        type="button"
                        onClick={() => setShowSidebar(!showSidebar)}
                        className={`p-2 rounded-xl border transition-all cursor-pointer ${showSidebar
                            ? 'bg-primary/10 text-primary border-primary/30'
                            : 'bg-white dark:bg-dark-surface border-light-border dark:border-dark-border text-neutral-600 dark:text-neutral-300'
                        }`}
                        title={showSidebar ? 'Collapse video drawer' : 'Open video notes drawer'}
                    >
                        {showSidebar ? <PanelRightClose className="w-4 h-4 text-primary-fg" /> : <PanelRightOpen className="w-4 h-4" />}
                    </button>
                </div>
            </header>

            {/* ============================================
                MAIN VIEWPORT & SIDEBAR
            ============================================ */}
            <div className="flex-1 relative overflow-hidden flex">
                {/* Interactive Canvas Viewport */}
                <div
                    ref={containerRef}
                    onMouseDown={handleMouseDownBackground}
                    className="flex-1 h-full relative overflow-hidden canvas-dot-grid cursor-grab active:cursor-grabbing select-none"
                    style={{
                        backgroundColor: 'var(--color-dark-bg, #0f1117)'
                    }}
                >
                    {/* Transformed World Layer */}
                    <div
                        style={{
                            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                            transformOrigin: '0 0'
                        }}
                        className="absolute top-0 left-0 w-0 h-0 pointer-events-none"
                    >
                    {/* SVG Connection Layer */}
                        <svg className="overflow-visible absolute top-0 left-0 w-1 h-1 z-10" style={{ pointerEvents: 'none' }}>
                            <defs>
                                <marker
                                    id="canvas-arrow"
                                    viewBox="0 0 10 10"
                                    refX="9"
                                    refY="5"
                                    markerWidth="7"
                                    markerHeight="7"
                                    orient="auto-start-reverse"
                                >
                                    <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#9ca3af" />
                                </marker>
                                <marker
                                    id="canvas-arrow-selected"
                                    viewBox="0 0 10 10"
                                    refX="9"
                                    refY="5"
                                    markerWidth="8"
                                    markerHeight="8"
                                    orient="auto-start-reverse"
                                >
                                    <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#3b82f6" />
                                </marker>
                                <marker
                                    id="canvas-arrow-dark"
                                    viewBox="0 0 10 10"
                                    refX="9"
                                    refY="5"
                                    markerWidth="7"
                                    markerHeight="7"
                                    orient="auto-start-reverse"
                                >
                                    <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#6b7280" />
                                </marker>
                            </defs>

                            {/* Render permanent edges — groups rendered first (behind), then cards */}
                            {edges.map(edge => {
                                const fromNode = nodes.find(n => n.id === edge.fromNodeId)
                                const toNode = nodes.find(n => n.id === edge.toNodeId)
                                return (
                                    <CanvasEdge
                                        key={edge.id}
                                        edge={edge}
                                        fromNode={fromNode}
                                        toNode={toNode}
                                        isSelected={selectedEdgeId === edge.id}
                                        onSelect={(id) => {
                                            setSelectedEdgeId(id)
                                            setSelectedNodeId(null)
                                        }}
                                        onDelete={deleteEdge}
                                    />
                                )
                            })}

                            {/* Live Temporary Arrow while connecting */}
                            {connectingFromNode && (
                                <path
                                    d={`M ${connectingFromNode.x + (connectingFromNode.width || 300) / 2} ${connectingFromNode.y + (connectingFromNode.height || 180) / 2} L ${mousePos.x} ${mousePos.y}`}
                                    fill="none"
                                    stroke="#3b82f6"
                                    strokeWidth="2"
                                    strokeDasharray="6,4"
                                    markerEnd="url(#canvas-arrow-selected)"
                                    className="animate-pulse"
                                />
                            )}
                        </svg>

                        {/* Render Nodes — groups first (z-index behind), then cards on top */}
                        {[...nodes].sort((a) => a.type === 'group' ? -1 : 1).map(node => (
                            <CanvasNode
                                key={node.id}
                                node={node}
                                courseId={courseId}
                                isSelected={selectedNodeId === node.id}
                                isConnecting={connectingFromId === node.id}
                                onSelect={(id) => {
                                    if (connectingFromId && connectingFromId !== id) {
                                        handleCompleteConnect(id)
                                    } else {
                                        setSelectedNodeId(id)
                                        setSelectedEdgeId(null)
                                    }
                                }}
                                onDragStart={handleNodeDragStart}
                                onStartConnect={handleStartConnect}
                                onEndConnect={handleCompleteConnect}
                                onUpdateNode={handleUpdateNode}
                                onDeleteNode={deleteNode}
                                onImagePreview={setPreviewImage}
                                onRegisterElement={(el) => {
                                    if (el) nodeElementsRef.current[node.id] = el
                                    else delete nodeElementsRef.current[node.id]
                                }}
                            />
                        ))}
                    </div>

                    {/* Connecting Banner Overlay */}
                    {connectingFromId && (
                        <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-blue-600 text-white rounded-full shadow-2xl z-30 flex items-center gap-2 text-xs font-medium animate-scale-in">
                            <span>Click another card to connect arrow</span>
                            <button
                                type="button"
                                onClick={() => setConnectingFromId(null)}
                                className="p-0.5 hover:bg-white/20 rounded-full cursor-pointer"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    )}
                </div>

                {/* ============================================
                    RIGHT SIDEBAR: COURSE VIDEOS & NOTES
                ============================================ */}
                {showSidebar && (
                    <aside className="w-80 h-full bg-white/95 dark:bg-dark-surface/95 backdrop-blur-md border-l border-light-border dark:border-dark-border flex flex-col z-20 shadow-2xl transition-all animate-fade-in">
                        {/* Drawer Header */}
                        <div className="p-4 border-b border-light-border dark:border-dark-border flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Video className="w-4 h-4 text-primary-fg" />
                                <h3 className="text-sm font-semibold">Course Videos & Notes</h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowSidebar(false)}
                                className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 rounded"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Search in Drawer */}
                        <div className="p-3 border-b border-light-border dark:border-dark-border">
                            <div className="relative">
                                <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    value={sidebarSearch}
                                    onChange={(e) => setSidebarSearch(e.target.value)}
                                    placeholder="Filter videos..."
                                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-neutral-100 dark:bg-dark-bg border border-light-border dark:border-dark-border outline-none focus:border-primary"
                                />
                            </div>
                        </div>

                        {/* Video / Note List */}
                        <div className="flex-1 overflow-y-auto p-3 space-y-3">
                            {filteredVideos.map((vid, idx) => {
                                const videoNotes = allNotes.filter(n => n.videoId === vid.id)
                                const canvasCount = nodes.filter(n => n.noteId && videoNotes.some(vn => vn.id === n.noteId)).length

                                return (
                                    <div
                                        key={vid.id}
                                        className="p-3 rounded-xl bg-neutral-50 dark:bg-dark-bg border border-light-border dark:border-dark-border space-y-2 hover:border-neutral-300 dark:hover:border-neutral-700 transition-all"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <div className="text-[10px] uppercase font-semibold text-neutral-400 truncate">
                                                    {vid.moduleTitle || `Video ${idx + 1}`}
                                                </div>
                                                <h4 className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate mt-0.5">
                                                    {vid.title}
                                                </h4>
                                            </div>
                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 shrink-0">
                                                {videoNotes.length} notes
                                            </span>
                                        </div>

                                        {/* Notes preview inside this video */}
                                        {videoNotes.length > 0 ? (
                                            <div className="space-y-1.5 pt-1">
                                                {videoNotes.map(n => {
                                                    const isOnCanvas = nodes.some(cn => cn.noteId === n.id)
                                                    return (
                                                        <div
                                                            key={n.id}
                                                            onClick={() => handleAddVideoNoteToCanvas(n, vid)}
                                                            className={`p-2 rounded-lg text-xs flex items-center justify-between gap-2 cursor-pointer transition-colors ${isOnCanvas
                                                                ? 'bg-primary/10 text-primary border border-primary/20'
                                                                : 'bg-white dark:bg-dark-surface hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-light-border dark:border-dark-border'
                                                            }`}
                                                            title={isOnCanvas ? "Focus on canvas card" : "Add note card to canvas"}
                                                        >
                                                            <div className="flex items-center gap-1.5 min-w-0">
                                                                <span className="font-mono text-[10px] text-primary-fg shrink-0">
                                                                    {formatDuration(n.timestamp || 0)}
                                                                </span>
                                                                <span className="truncate text-[11px]">
                                                                    {n.content ? n.content.replace(/<[^>]*>/g, '') : 'Note'}
                                                                </span>
                                                            </div>
                                                            <ArrowRight className="w-3 h-3 shrink-0 opacity-60" />
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        ) : (
                                            <p className="text-[11px] text-neutral-400 italic pt-1">
                                                No notes taken yet
                                            </p>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </aside>
                )}
            </div>

            {/* Lightbox Modal for Image preview */}
            {previewImage && (
                <div
                    className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
                    onClick={() => setPreviewImage(null)}
                >
                    <div className="relative max-w-4xl max-h-[85vh] overflow-hidden rounded-2xl bg-black border border-white/20 shadow-2xl">
                        <button
                            type="button"
                            onClick={() => setPreviewImage(null)}
                            className="absolute top-3 right-3 p-1.5 rounded-full bg-black/60 hover:bg-black text-white transition-colors z-10"
                        >
                            <X className="w-5 h-5" />
                        </button>
                        <img
                            src={previewImage}
                            alt="Full canvas preview"
                            className="max-w-full max-h-[80vh] object-contain"
                        />
                    </div>
                </div>
            )}
        </div>
    )
}

export default CourseCanvasPage
