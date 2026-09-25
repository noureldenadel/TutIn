import { useRef, useState, useEffect, useCallback } from 'react'
import { Maximize2, X, Play, Pause } from 'lucide-react'
import mpegts from 'mpegts.js'
import { getVideoUrl, releaseVideoUrl } from '../../utils/fileSystem'
import { useNavigate } from 'react-router-dom'
import { formatDuration } from '../../utils/db'

const MIN_WIDTH = 260
const MAX_WIDTH = 640
const DEFAULT_WIDTH = 340
const MARGIN_X = 32 // Left and right side margins
const MARGIN_Y = 52 // Top and bottom margins (comfortable clearance)

export default function FloatingMiniPlayer({ video, course, courseId, onClose }) {
    const navigate = useNavigate()
    const videoRef = useRef(null)
    const mpegtsPlayerRef = useRef(null)
    const containerRef = useRef(null)

    const [videoUrl, setVideoUrl] = useState(null)
    const [isPlaying, setIsPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [isHovered, setIsHovered] = useState(false)

    // Sizing & Position State
    const [width, setWidth] = useState(() => {
        const saved = localStorage.getItem('tutin_miniplayer_width')
        return saved ? Math.min(Math.max(parseInt(saved, 10), MIN_WIDTH), MAX_WIDTH) : DEFAULT_WIDTH
    })
    const [activeCorner, setActiveCorner] = useState('bottom-right')
    const [pos, setPos] = useState({ x: null, y: null })
    const [isDragging, setIsDragging] = useState(false)
    const [isResizing, setIsResizing] = useState(false)

    const dragInfo = useRef({
        startX: 0,
        startY: 0,
        initialPosX: 0,
        initialPosY: 0,
        hasDragged: false
    })

    const isEmbedded = !!(
        video?.youtubeId ||
        video?.driveFileId ||
        (video?.url && (
            video.url.includes('youtube.com') ||
            video.url.includes('youtu.be') ||
            video.url.includes('drive.google.com')
        ))
    )

    // Load video URL
    useEffect(() => {
        let activeUrl = null
        async function init() {
            if (!video) return
            if (isEmbedded) {
                setVideoUrl(video.url || '')
                return
            }
            try {
                const url = await getVideoUrl(video)
                activeUrl = url
                setVideoUrl(url)
            } catch (err) {
                console.error('Failed to get video URL:', err)
            }
        }
        init()
        return () => {
            if (activeUrl) releaseVideoUrl(activeUrl)
            if (mpegtsPlayerRef.current) {
                mpegtsPlayerRef.current.destroy()
                mpegtsPlayerRef.current = null
            }
        }
    }, [video])

    // Setup native video player — NO AUTO PLAY ON RELOAD
    useEffect(() => {
        if (!videoUrl || isEmbedded) return
        const isTs = videoUrl.toLowerCase().endsWith('.ts')
        if (isTs && mpegts.isSupported()) {
            const player = mpegts.createPlayer({ type: 'mpegts', url: videoUrl, isLive: false })
            player.attachMediaElement(videoRef.current)
            player.load()
            // Do NOT auto-play on initial load/reload
            mpegtsPlayerRef.current = player
        } else if (videoRef.current) {
            videoRef.current.src = videoUrl
            // Do NOT auto-play on initial load/reload
        }
    }, [videoUrl, isEmbedded])

    // Playback event listeners
    useEffect(() => {
        const v = videoRef.current
        if (!v || isEmbedded) return
        const onTime = () => {
            setCurrentTime(v.currentTime)
            if (v.duration) setDuration(v.duration)
        }
        const onPlay = () => setIsPlaying(true)
        const onPause = () => setIsPlaying(false)
        v.addEventListener('timeupdate', onTime)
        v.addEventListener('play', onPlay)
        v.addEventListener('pause', onPause)
        return () => {
            v.removeEventListener('timeupdate', onTime)
            v.removeEventListener('play', onPlay)
            v.removeEventListener('pause', onPause)
        }
    }, [isEmbedded])

    // Helper: calculate 4 corner coordinates with spacious top & bottom margins
    const getCornerCoords = useCallback((currentWidth) => {
        const playerWidth = currentWidth || width
        const playerHeight = containerRef.current?.getBoundingClientRect().height || ((playerWidth * 9) / 16 + 68)
        const winW = window.innerWidth
        const winH = window.innerHeight

        return {
            'top-left': { 
                x: MARGIN_X, 
                y: MARGIN_Y, 
                cx: MARGIN_X + playerWidth / 2, 
                cy: MARGIN_Y + playerHeight / 2 
            },
            'top-right': { 
                x: Math.max(MARGIN_X, winW - playerWidth - MARGIN_X), 
                y: MARGIN_Y, 
                cx: winW - MARGIN_X - playerWidth / 2, 
                cy: MARGIN_Y + playerHeight / 2 
            },
            'bottom-left': { 
                x: MARGIN_X, 
                y: Math.max(MARGIN_Y, winH - playerHeight - MARGIN_Y), 
                cx: MARGIN_X + playerWidth / 2, 
                cy: winH - MARGIN_Y - playerHeight / 2 
            },
            'bottom-right': { 
                x: Math.max(MARGIN_X, winW - playerWidth - MARGIN_X), 
                y: Math.max(MARGIN_Y, winH - playerHeight - MARGIN_Y), 
                cx: winW - MARGIN_X - playerWidth / 2, 
                cy: winH - MARGIN_Y - playerHeight / 2 
            }
        }
    }, [width])

    // Initial position on mount: bottom-right
    useEffect(() => {
        const coords = getCornerCoords(width)
        setPos({ x: coords['bottom-right'].x, y: coords['bottom-right'].y })
        setActiveCorner('bottom-right')
    }, [])

    // Handle Window Resize: keep anchored to active corner
    useEffect(() => {
        function handleWindowResize() {
            if (isDragging || isResizing) return
            const coords = getCornerCoords(width)
            const target = coords[activeCorner] || coords['bottom-right']
            setPos({ x: target.x, y: target.y })
        }
        window.addEventListener('resize', handleWindowResize)
        return () => window.removeEventListener('resize', handleWindowResize)
    }, [activeCorner, width, getCornerCoords, isDragging, isResizing])

    // Find closest corner to current position
    const getClosestCorner = useCallback((currentX, currentY, currentWidth) => {
        const playerWidth = currentWidth || width
        const playerHeight = containerRef.current?.getBoundingClientRect().height || ((playerWidth * 9) / 16 + 68)
        const playerCenterX = currentX + playerWidth / 2
        const playerCenterY = currentY + playerHeight / 2

        const corners = getCornerCoords(playerWidth)
        let closest = 'bottom-right'
        let minDistance = Infinity

        for (const [cornerKey, c] of Object.entries(corners)) {
            const dist = Math.hypot(playerCenterX - c.cx, playerCenterY - c.cy)
            if (dist < minDistance) {
                minDistance = dist
                closest = cornerKey
            }
        }
        return closest
    }, [width, getCornerCoords])

    // ==========================================
    // DRAG LOGIC (Drag anywhere on player)
    // ==========================================
    const handleMouseDown = useCallback((e) => {
        if (e.target.closest('button') || e.target.closest('[data-resize-handle]') || e.target.closest('[data-no-drag]')) return
        if (e.button !== 0) return

        const rect = containerRef.current?.getBoundingClientRect()
        if (!rect) return

        dragInfo.current = {
            startX: e.clientX,
            startY: e.clientY,
            initialPosX: rect.left,
            initialPosY: rect.top,
            hasDragged: false
        }

        const handleMouseMove = (ev) => {
            const deltaX = ev.clientX - dragInfo.current.startX
            const deltaY = ev.clientY - dragInfo.current.startY

            if (!dragInfo.current.hasDragged && Math.hypot(deltaX, deltaY) > 5) {
                dragInfo.current.hasDragged = true
                setIsDragging(true)
            }

            if (dragInfo.current.hasDragged) {
                const playerRect = containerRef.current?.getBoundingClientRect()
                const playerW = playerRect?.width || width
                const playerH = playerRect?.height || 240

                const newX = Math.max(12, Math.min(window.innerWidth - playerW - 12, dragInfo.current.initialPosX + deltaX))
                const newY = Math.max(12, Math.min(window.innerHeight - playerH - 12, dragInfo.current.initialPosY + deltaY))

                setPos({ x: newX, y: newY })
            }
        }

        const handleMouseUp = () => {
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mouseup', handleMouseUp)

            if (dragInfo.current.hasDragged) {
                setIsDragging(false)

                // Snap magnetically to the closest corner
                const playerRect = containerRef.current?.getBoundingClientRect()
                const curX = playerRect?.left ?? pos.x ?? (window.innerWidth - width - PADDING)
                const curY = playerRect?.top ?? pos.y ?? (window.innerHeight - 240 - PADDING)
                const closest = getClosestCorner(curX, curY, playerRect?.width || width)

                setActiveCorner(closest)
                const coords = getCornerCoords(playerRect?.width || width)
                setPos({ x: coords[closest].x, y: coords[closest].y })
            }
        }

        window.addEventListener('mousemove', handleMouseMove)
        window.addEventListener('mouseup', handleMouseUp)
    }, [pos, width, getClosestCorner, getCornerCoords])

    // ==========================================
    // NATIVE-STYLE EDGE & CORNER RESIZE LOGIC
    // ==========================================
    const handleResizeMouseDown = useCallback((e, direction) => {
        e.stopPropagation()
        e.preventDefault()

        const rect = containerRef.current?.getBoundingClientRect()
        if (!rect) return

        setIsResizing(true)
        const startX = e.clientX
        const startY = e.clientY
        const startWidth = rect.width

        const handleResizeMove = (ev) => {
            const deltaX = ev.clientX - startX
            const deltaY = ev.clientY - startY

            let widthDelta = 0

            if (direction.includes('left')) {
                widthDelta = -deltaX
            } else if (direction.includes('right')) {
                widthDelta = deltaX
            } else if (direction === 'top') {
                widthDelta = -deltaY * (16 / 9)
            } else if (direction === 'bottom') {
                widthDelta = deltaY * (16 / 9)
            }

            const newWidth = startWidth + widthDelta
            const maxAllowedWidth = Math.min(MAX_WIDTH, window.innerWidth - MARGIN_X * 2)
            const clampedWidth = Math.round(Math.max(MIN_WIDTH, Math.min(maxAllowedWidth, newWidth)))

            setWidth(clampedWidth)
            localStorage.setItem('tutin_miniplayer_width', clampedWidth.toString())

            // Keep pinned to current active corner
            const coords = getCornerCoords(clampedWidth)
            const target = coords[activeCorner] || coords['bottom-right']
            setPos({ x: target.x, y: target.y })
        }

        const handleResizeUp = () => {
            setIsResizing(false)
            window.removeEventListener('mousemove', handleResizeMove)
            window.removeEventListener('mouseup', handleResizeUp)
        }

        window.addEventListener('mousemove', handleResizeMove)
        window.addEventListener('mouseup', handleResizeUp)
    }, [activeCorner, getCornerCoords])

    const handleExpand = () => {
        const id = course?.id || courseId
        if (id) navigate(`/course/${id}`)
    }

    const togglePlay = () => {
        if (dragInfo.current.hasDragged) return
        if (videoRef.current) {
            if (isPlaying) videoRef.current.pause()
            else videoRef.current.play()
        }
    }

    const handleSeek = (e) => {
        e.stopPropagation()
        if (!videoRef.current || duration <= 0) return
        const bar = e.currentTarget
        const rect = bar.getBoundingClientRect()
        const clickX = e.clientX - rect.left
        const pct = Math.max(0, Math.min(1, clickX / rect.width))
        videoRef.current.currentTime = pct * duration
    }

    const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0

    const youtubeId = video?.youtubeId ||
        videoUrl?.match(/[?&]v=([^&]+)/)?.[1] ||
        videoUrl?.match(/youtu\.be\/([^?]+)/)?.[1]

    const driveId = video?.driveFileId ||
        video?.url?.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1]

    const containerStyle = {
        position: 'fixed',
        left: pos.x !== null ? `${pos.x}px` : 'auto',
        top: pos.y !== null ? `${pos.y}px` : 'auto',
        bottom: pos.x === null ? `${MARGIN_Y}px` : 'auto',
        right: pos.x === null ? `${MARGIN_X}px` : 'auto',
        zIndex: 9999,
        width: `${width}px`,
        cursor: isDragging ? 'grabbing' : 'grab',
        transition: (isDragging || isResizing) ? 'none' : 'left 0.3s cubic-bezier(0.16, 1, 0.3, 1), top 0.3s cubic-bezier(0.16, 1, 0.3, 1), width 0.15s ease-out'
    }

    return (
        <div
            ref={containerRef}
            style={containerStyle}
            onMouseDown={handleMouseDown}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className="select-none group relative"
        >
            {/* =========================================
                INVISIBLE EDGE & CORNER RESIZE HIT AREAS 
                ========================================= */}
            {/* Corner Handles */}
            <div
                data-resize-handle
                onMouseDown={(e) => handleResizeMouseDown(e, 'top-left')}
                className="absolute -top-2 -left-2 w-5 h-5 z-40 cursor-nwse-resize"
            />
            <div
                data-resize-handle
                onMouseDown={(e) => handleResizeMouseDown(e, 'top-right')}
                className="absolute -top-2 -right-2 w-5 h-5 z-40 cursor-nesw-resize"
            />
            <div
                data-resize-handle
                onMouseDown={(e) => handleResizeMouseDown(e, 'bottom-left')}
                className="absolute -bottom-2 -left-2 w-5 h-5 z-40 cursor-nesw-resize"
            />
            <div
                data-resize-handle
                onMouseDown={(e) => handleResizeMouseDown(e, 'bottom-right')}
                className="absolute -bottom-2 -right-2 w-5 h-5 z-40 cursor-nwse-resize"
            />

            {/* Edge Handles */}
            <div
                data-resize-handle
                onMouseDown={(e) => handleResizeMouseDown(e, 'top')}
                className="absolute -top-1.5 left-4 right-4 h-3 z-40 cursor-ns-resize"
            />
            <div
                data-resize-handle
                onMouseDown={(e) => handleResizeMouseDown(e, 'bottom')}
                className="absolute -bottom-1.5 left-4 right-4 h-3 z-40 cursor-ns-resize"
            />
            <div
                data-resize-handle
                onMouseDown={(e) => handleResizeMouseDown(e, 'left')}
                className="absolute top-4 bottom-4 -left-1.5 w-3 z-40 cursor-ew-resize"
            />
            <div
                data-resize-handle
                onMouseDown={(e) => handleResizeMouseDown(e, 'right')}
                className="absolute top-4 bottom-4 -right-1.5 w-3 z-40 cursor-ew-resize"
            />

            {/* Player Body Container */}
            <div
                className="rounded-2xl overflow-hidden shadow-2xl relative border border-white/10 dark:border-white/10 bg-[#161618]"
                style={{
                    boxShadow: isDragging
                        ? '0 32px 72px rgba(0,0,0,0.9), 0 0 0 2px rgba(59,130,246,0.5)'
                        : '0 24px 64px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.08)'
                }}
            >
                {/* Top Controls Bar (Clean transparent without gradient) */}
                <div
                    className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between p-2.5 transition-opacity duration-200"
                    style={{
                        opacity: isHovered || isDragging || isResizing ? 1 : 0
                    }}
                >
                    <div className="flex items-center gap-1.5 pointer-events-auto">
                        <button
                            className="p-1.5 rounded-lg bg-black/50 hover:bg-black/80 text-white transition-colors backdrop-blur-md"
                            title="Expand to Player"
                            onClick={handleExpand}
                            onMouseDown={e => e.stopPropagation()}
                        >
                            <Maximize2 className="w-3.5 h-3.5 -scale-x-100" />
                        </button>
                    </div>
                    <div className="flex items-center gap-1.5 pointer-events-auto">
                        <button
                            className="p-1.5 rounded-lg bg-black/50 hover:bg-black/80 text-white transition-colors backdrop-blur-md"
                            title="Close Mini Player"
                            onClick={onClose}
                            onMouseDown={e => e.stopPropagation()}
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* Video Screen Area */}
                <div
                    className="relative bg-black overflow-hidden group/video"
                    style={{ aspectRatio: '16/9' }}
                    onClick={!isEmbedded ? togglePlay : undefined}
                >
                    {youtubeId ? (
                        <iframe
                            className="absolute inset-0 w-full h-full pointer-events-auto"
                            src={`https://www.youtube.com/embed/${youtubeId}?enablejsapi=1&controls=1&modestbranding=1&rel=0&autoplay=0`}
                            frameBorder="0"
                            allowFullScreen
                        />
                    ) : driveId ? (
                        <iframe
                            className="absolute inset-0 w-full h-full pointer-events-auto"
                            src={`https://drive.google.com/file/d/${driveId}/preview`}
                            frameBorder="0"
                            allowFullScreen
                        />
                    ) : (
                        <>
                            <video
                                ref={videoRef}
                                className="absolute inset-0 w-full h-full object-contain"
                                playsInline
                                preload="metadata"
                            />

                            {/* Hover dark dimming overlay */}
                            <div
                                className={`absolute inset-0 bg-black/35 pointer-events-none transition-opacity duration-200 z-10 ${isHovered ? 'opacity-100' : 'opacity-0'
                                    }`}
                            />

                            {/* Center Play/Pause Overlay */}
                            <div
                                className="absolute inset-0 z-20 flex items-center justify-center transition-opacity duration-150"
                                style={{
                                    opacity: !isPlaying ? 1 : isHovered ? 0.9 : 0,
                                    pointerEvents: !isPlaying ? 'auto' : 'none'
                                }}
                            >
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        togglePlay()
                                    }}
                                    className="w-12 h-12 bg-black/60 hover:bg-primary text-white rounded-full flex items-center justify-center backdrop-blur-md ring-1 ring-white/20 shadow-xl transition-all hover:scale-105 active:scale-95 pointer-events-auto"
                                >
                                    {isPlaying ? (
                                        <Pause className="w-5 h-5 fill-white" />
                                    ) : (
                                        <Play className="w-5 h-5 fill-white ml-0.5" />
                                    )}
                                </button>
                            </div>
                        </>
                    )}
                </div>

                {/* Progress Bar (Clean static height, no hover expansion or dot) */}
                <div
                    data-no-drag
                    onClick={handleSeek}
                    className="h-1 bg-white/10 relative cursor-pointer"
                >
                    <div
                        className="h-full bg-primary"
                        style={{ width: `${progressPct}%` }}
                    />
                </div>

                {/* Title & Info Bar */}
                <div className="px-3.5 pt-2 pb-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                        <p className="text-white text-[13px] font-semibold leading-tight truncate">
                            {video?.title || 'Untitled'}
                        </p>
                        <p className="text-white/50 text-[11px] truncate mt-0.5 flex items-center gap-1.5">
                            <span>{course?.instructor || course?.title || 'Course'}</span>
                            {!isEmbedded && duration > 0 && (
                                <>
                                    <span className="opacity-40">•</span>
                                    <span className="text-white/60 font-mono">
                                        {formatDuration(currentTime)} / {formatDuration(duration)}
                                    </span>
                                </>
                            )}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}
