import { useRef, useState, useEffect } from 'react'
import { Maximize, X, Play, Pause } from 'lucide-react'
import mpegts from 'mpegts.js'
import { getVideoUrl, releaseVideoUrl } from '../../utils/fileSystem'
import { useNavigate } from 'react-router-dom'
import { updateVideoProgress, formatDuration } from '../../utils/db'

export default function MiniVideoPlayer({ video, course, courseId, onClose }) {
    const navigate = useNavigate()
    const videoRef = useRef(null)
    const mpegtsPlayerRef = useRef(null)
    const [videoUrl, setVideoUrl] = useState(null)
    const [isPlaying, setIsPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)

    const isEmbeddedPlayer = !!(video?.youtubeId || video?.driveFileId || 
        (video?.url && (video.url.includes('youtube.com') || video.url.includes('youtu.be') || video.url.includes('drive.google.com'))))

    useEffect(() => {
        let activeUrl = null
        async function init() {
            if (!video) return
            if (isEmbeddedPlayer) {
                setVideoUrl(video.url || '')
                return
            }
            try {
                const url = await getVideoUrl(video)
                activeUrl = url
                setVideoUrl(url)
            } catch (err) {
                console.error(err)
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

    useEffect(() => {
        if (!videoUrl || isEmbeddedPlayer) return
        
        const isTs = videoUrl.toLowerCase().endsWith('.ts')
        
        if (isTs && mpegts.isSupported()) {
            const player = mpegts.createPlayer({
                type: 'mpegts',
                url: videoUrl,
                isLive: false,
            })
            player.attachMediaElement(videoRef.current)
            player.load()
            player.play().catch(() => {})
            mpegtsPlayerRef.current = player
        } else if (videoRef.current) {
            videoRef.current.src = videoUrl
            videoRef.current.play().catch(() => {})
        }
    }, [videoUrl, isEmbeddedPlayer])

    useEffect(() => {
        const v = videoRef.current
        if (!v || isEmbeddedPlayer) return
        
        const handleTimeUpdate = () => {
            setCurrentTime(v.currentTime)
            if (v.duration) setDuration(v.duration)
        }
        const handlePlay = () => setIsPlaying(true)
        const handlePause = () => setIsPlaying(false)
        
        v.addEventListener('timeupdate', handleTimeUpdate)
        v.addEventListener('play', handlePlay)
        v.addEventListener('pause', handlePause)
        
        return () => {
            v.removeEventListener('timeupdate', handleTimeUpdate)
            v.removeEventListener('play', handlePlay)
            v.removeEventListener('pause', handlePause)
        }
    }, [isEmbeddedPlayer])

    const handleExpand = () => {
        const targetId = course?.id || courseId
        if (targetId) {
            navigate(`/course/${targetId}`)
        }
    }

    const togglePlay = () => {
        if (videoRef.current) {
            if (isPlaying) videoRef.current.pause()
            else videoRef.current.play()
        }
    }

    return (
        <div className="w-full h-full flex flex-col bg-[#212121] relative overflow-hidden group">
            {/* Top overlay controls */}
            <div className="absolute top-0 left-0 right-0 h-12 bg-gradient-to-b from-black/80 to-transparent z-50 flex items-start justify-between p-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <button 
                    onClick={handleExpand}
                    className="p-1.5 hover:bg-white/20 rounded text-white pointer-events-auto"
                    title="Expand"
                >
                    <Maximize className="w-4 h-4" />
                </button>
                <button 
                    onClick={onClose}
                    className="p-1.5 hover:bg-white/20 rounded text-white pointer-events-auto"
                    title="Close"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Video Frame */}
            <div className="flex-1 relative bg-black cursor-pointer" onClick={!isEmbeddedPlayer ? togglePlay : undefined}>
                {video?.youtubeId || (video?.url && (video.url.includes('youtube.com') || video.url.includes('youtu.be'))) ? (
                    <iframe
                        className="w-full h-full"
                        src={`https://www.youtube.com/embed/${video.youtubeId || videoUrl?.match(/[?&]v=([^&]+)/)?.[1] || videoUrl?.match(/youtu\.be\/([^?]+)/)?.[1]}?enablejsapi=1&controls=1&modestbranding=1&rel=0&autoplay=1&mute=0`}
                        frameBorder="0"
                        allowFullScreen
                    />
                ) : (video?.driveFileId || video?.url?.includes('drive.google.com')) ? (
                    <iframe
                        className="w-full h-full"
                        src={`https://drive.google.com/file/d/${video.driveFileId || video.url?.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1]}/preview?autoplay=1`}
                        frameBorder="0"
                        allowFullScreen
                    />
                ) : (
                    <>
                        <video
                            ref={videoRef}
                            className="w-full h-full object-contain"
                            playsInline
                        />
                        {/* Custom Center Play Button (only for native video) */}
                        {!isPlaying && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="w-14 h-14 bg-black/50 rounded-full flex items-center justify-center backdrop-blur-sm">
                                    <Play className="w-7 h-7 text-white ml-1 fill-white" />
                                </div>
                            </div>
                        )}
                        {/* Time display (bottom left) */}
                        <div className="absolute bottom-1 left-2 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                            {formatDuration(currentTime)} / {formatDuration(duration)}
                        </div>
                    </>
                )}
            </div>

            {/* Bottom Title Bar */}
            <div className="h-16 shrink-0 flex flex-col justify-center px-4 relative bg-[#212121]">
                {/* Progress bar line (only works for native video) */}
                {!isEmbeddedPlayer && duration > 0 && (
                    <div className="absolute top-0 left-0 right-0 h-[2px] bg-white/20">
                        <div 
                            className="h-full bg-red-600 transition-all duration-200" 
                            style={{ width: `${(currentTime / duration) * 100}%` }}
                        />
                    </div>
                )}
                <div className="text-white text-sm font-medium truncate mt-1">{video?.title}</div>
                <div className="text-gray-400 text-xs truncate mt-0.5">{course?.instructor || course?.title || 'Tutorial'}</div>
            </div>
        </div>
    )
}
