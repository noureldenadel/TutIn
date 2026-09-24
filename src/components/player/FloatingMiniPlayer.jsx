import { useRef, useState, useEffect, useCallback } from 'react'
import { Maximize2, X, Play, Pause } from 'lucide-react'
import mpegts from 'mpegts.js'
import { getVideoUrl, releaseVideoUrl } from '../../utils/fileSystem'
import { useNavigate } from 'react-router-dom'
import { formatDuration } from '../../utils/db'

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

    // Drag state - null means use default CSS bottom-right
    const [pos, setPos] = useState({ x: null, y: null })
    const dragging = useRef(false)
    const dragOffset = useRef({ x: 0, y: 0 })

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
            if (isEmbedded) { setVideoUrl(video.url || ''); return }
            try {
                const url = await getVideoUrl(video)
                activeUrl = url
                setVideoUrl(url)
            } catch (err) { console.error(err) }
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

    // Setup native video player
    useEffect(() => {
        if (!videoUrl || isEmbedded) return
        const isTs = videoUrl.toLowerCase().endsWith('.ts')
        if (isTs && mpegts.isSupported()) {
            const player = mpegts.createPlayer({ type: 'mpegts', url: videoUrl, isLive: false })
            player.attachMediaElement(videoRef.current)
            player.load()
            player.play().catch(() => {})
            mpegtsPlayerRef.current = player
        } else if (videoRef.current) {
            videoRef.current.src = videoUrl
            videoRef.current.play().catch(() => {})
        }
    }, [videoUrl, isEmbedded])

    // Playback event listeners
    useEffect(() => {
        const v = videoRef.current
        if (!v || isEmbedded) return
        const onTime = () => { setCurrentTime(v.currentTime); if (v.duration) setDuration(v.duration) }
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

    const handleExpand = () => {
        const id = course?.id || courseId
        if (id) navigate(`/course/${id}`)
    }

    const togglePlay = () => {
        if (videoRef.current) {
            if (isPlaying) videoRef.current.pause()
            else videoRef.current.play()
        }
    }

    // Drag-to-move logic
    const onMouseDown = useCallback((e) => {
        if (e.button !== 0) return
        e.preventDefault()
        const rect = containerRef.current.getBoundingClientRect()
        dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
        dragging.current = true

        const onMove = (ev) => {
            if (!dragging.current) return
            setPos({
                x: ev.clientX - dragOffset.current.x,
                y: ev.clientY - dragOffset.current.y,
            })
        }
        const onUp = () => {
            dragging.current = false
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
    }, [])

    const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0

    const youtubeId = video?.youtubeId ||
        videoUrl?.match(/[?&]v=([^&]+)/)?.[1] ||
        videoUrl?.match(/youtu\.be\/([^?]+)/)?.[1]

    const driveId = video?.driveFileId ||
        video?.url?.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1]

    const containerStyle = pos.x !== null
        ? { position: 'fixed', left: pos.x, top: pos.y, bottom: 'auto', right: 'auto', zIndex: 9999, width: 320 }
        : { position: 'fixed', bottom: 24, right: 24, zIndex: 9999, width: 320 }

    return (
        <div ref={containerRef} style={containerStyle} className="select-none">
            <div
                className="relative"
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                <div
                    className="rounded-2xl overflow-hidden"
                    style={{
                        background: '#1a1a1a',
                        boxShadow: '0 24px 64px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.07)',
                    }}
                >
                    {/* Hover controls */}
                    <div
                        className="absolute top-0 left-0 right-0 z-20 flex items-start justify-between p-2 transition-opacity duration-200 pointer-events-none"
                        style={{
                            opacity: isHovered ? 1 : 0,
                            background: 'linear-gradient(180deg, rgba(0,0,0,0.7) 0%, transparent 100%)',
                            borderRadius: '16px 16px 0 0',
                        }}
                    >
                        <button
                            className="p-1.5 rounded-lg hover:bg-white/25 text-white transition-colors pointer-events-auto"
                            title="Expand"
                            onClick={handleExpand}
                            onMouseDown={e => e.stopPropagation()}
                        >
                            <Maximize2 className="w-4 h-4" />
                        </button>
                        <button
                            className="p-1.5 rounded-lg hover:bg-white/25 text-white transition-colors pointer-events-auto"
                            title="Close"
                            onClick={onClose}
                            onMouseDown={e => e.stopPropagation()}
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Invisible drag handle on top bar */}
                    <div
                        className="absolute top-0 left-0 right-0 h-10 z-10"
                        style={{ cursor: 'grab' }}
                        onMouseDown={onMouseDown}
                    />

                    {/* Video frame */}
                    <div
                        className="relative bg-black"
                        style={{ aspectRatio: '16/9', cursor: !isEmbedded ? 'pointer' : 'default' }}
                        onClick={!isEmbedded ? togglePlay : undefined}
                    >
                        {youtubeId ? (
                            <iframe
                                className="absolute inset-0 w-full h-full"
                                src={`https://www.youtube.com/embed/${youtubeId}?enablejsapi=1&controls=1&modestbranding=1&rel=0&autoplay=1`}
                                frameBorder="0"
                                allowFullScreen
                            />
                        ) : driveId ? (
                            <iframe
                                className="absolute inset-0 w-full h-full"
                                src={`https://drive.google.com/file/d/${driveId}/preview?autoplay=1`}
                                frameBorder="0"
                                allowFullScreen
                            />
                        ) : (
                            <>
                                <video ref={videoRef} className="absolute inset-0 w-full h-full object-contain" playsInline />
                                <div
                                    className="absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-150"
                                    style={{ opacity: !isPlaying ? 1 : isHovered ? 0.8 : 0 }}
                                >
                                    <div className="w-12 h-12 bg-black/55 rounded-full flex items-center justify-center backdrop-blur-sm ring-1 ring-white/15">
                                        {isPlaying
                                            ? <Pause className="w-5 h-5 text-white fill-white" />
                                            : <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                                        }
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Red progress bar */}
                    <div className="h-[3px] bg-white/10 relative">
                        <div
                            className="h-full bg-red-500 transition-all duration-200"
                            style={{ width: `${progressPct}%` }}
                        />
                        {progressPct > 0 && (
                            <div
                                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 bg-red-500 rounded-full shadow"
                                style={{ left: `${progressPct}%` }}
                            />
                        )}
                    </div>

                    {/* Title area */}
                    <div className="px-3 pt-2.5 pb-3">
                        <p className="text-white text-[13px] font-semibold leading-snug line-clamp-2 mb-0.5">
                            {video?.title || 'Untitled'}
                        </p>
                        <p className="text-white/45 text-[11px] truncate">
                            {course?.instructor || course?.title || 'Course'}
                            {!isEmbedded && duration > 0 && (
                                <span className="ml-2 text-white/30">
                                    {formatDuration(currentTime)} / {formatDuration(duration)}
                                </span>
                            )}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}
