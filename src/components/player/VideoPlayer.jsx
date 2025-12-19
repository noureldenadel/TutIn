import { useRef, useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import {
    Play, Pause, Volume2, VolumeX, Maximize, Minimize,
    SkipForward, Settings, PictureInPicture, FolderOpen, X, Repeat
} from 'lucide-react'
import ReactPlayer from 'react-player'
import { getVideoUrl, releaseVideoUrl, verifyPermission, findFileByPath, findFileByFileName, pickFolderFallback, cacheFallbackFiles, isFileSystemAccessSupported, hasRootFolderAccess, findCourseFolderInRoot, getRootFolderHandle } from '../../utils/fileSystem'
import { updateVideoProgress, markVideoComplete, formatDuration, getCourse } from '../../utils/db'
import { useSettings } from '../../contexts/SettingsContext'

const VideoPlayer = forwardRef(function VideoPlayer({ video, onComplete, onNext, courseId, onTimeUpdate }, ref) {
    const videoRef = useRef(null)
    const containerRef = useRef(null)
    const progressRef = useRef(null)
    const [videoUrl, setVideoUrl] = useState(null)
    const [isPlaying, setIsPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [volume, setVolume] = useState(() => {
        const saved = localStorage.getItem('mearn_volume')
        return saved ? parseFloat(saved) : 0.75
    })
    const [isMuted, setIsMuted] = useState(false)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [showControls, setShowControls] = useState(true)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState(null)
    const [needsFolderAccess, setNeedsFolderAccess] = useState(false)
    const [playbackSpeed, setPlaybackSpeed] = useState(1)
    const [showSpeedMenu, setShowSpeedMenu] = useState(false)
    const [isPiP, setIsPiP] = useState(false)
    const [showAutoPlayCountdown, setShowAutoPlayCountdown] = useState(false)
    const [autoPlayCountdown, setAutoPlayCountdown] = useState(3)
    const [localAutoPlay, setLocalAutoPlay] = useState(true)
    const [showResumePrompt, setShowResumePrompt] = useState(false)
    const [resumePosition, setResumePosition] = useState(0)

    const { settings } = useSettings()
    const controlsTimeoutRef = useRef(null)
    const progressIntervalRef = useRef(null)

    // Load video when video prop changes
    useEffect(() => {
        loadVideo()
        return () => {
            if (videoUrl) {
                releaseVideoUrl(videoUrl)
            }
            if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current)
            }
        }
    }, [video?.id])

    async function loadVideo() {
        if (!video) {
            setError('No video selected')
            return
        }

        // Handle YouTube videos
        if (video.youtubeId || video.url?.startsWith('http')) {
            const url = video.url || `https://www.youtube.com/watch?v=${video.youtubeId}`
            setVideoUrl(url)
            setIsLoading(false)
            setNeedsFolderAccess(false)
            setDuration(video.duration || 0) // Try to trust duration if saved

            // Restore last watched position
            if (video.lastWatchedAt && video.watchProgress > 0 && video.watchProgress < 0.95) {
                const percentage = video.watchProgress
                // Note: We can't know absolute duration yet for YouTube until it loads
                // So we'll trust the player's onReady or just let it start from 0 and user seeks?
                // ReactPlayer has onStart. But let's check if we saved duration.
                setResumePosition(percentage) // We'll store percentage for now
                setShowResumePrompt(true)
            }
            return
        }

        try {
            setIsLoading(true)
            setError(null)
            setNeedsFolderAccess(false)

            let fileSource = null

            // Modern API: use fileHandle
            if (video.fileHandle) {
                // Verify permission for FileHandle
                if (typeof video.fileHandle.queryPermission === 'function') {
                    const hasPermission = await verifyPermission(video.fileHandle)
                    if (!hasPermission) {
                        setError('Permission denied. Please click the video again to grant access.')
                        return
                    }
                }
                fileSource = video.fileHandle
            }
            // Fallback mode: look up file from cache using relativePath
            else if (video.relativePath) {
                // Get course to find folder name
                const course = courseId ? await getCourse(courseId) : null
                const folderName = course?.originalTitle || video.relativePath.split('/')[0]

                const cachedFile = findFileByPath(folderName, video.relativePath)
                if (cachedFile) {
                    fileSource = cachedFile
                } else if (hasRootFolderAccess()) {
                    // Try to access file through root folder
                    try {
                        const courseFolderHandle = await findCourseFolderInRoot(folderName)
                        if (courseFolderHandle) {
                            // Navigate to the file within the course folder
                            const pathParts = video.relativePath.split('/').slice(1) // Remove folder name
                            let currentHandle = courseFolderHandle

                            // Navigate through subdirectories
                            for (let i = 0; i < pathParts.length - 1; i++) {
                                currentHandle = await currentHandle.getDirectoryHandle(pathParts[i])
                            }

                            // Get the file
                            const fileName = pathParts[pathParts.length - 1]
                            const fileHandle = await currentHandle.getFileHandle(fileName)
                            fileSource = fileHandle
                        }
                    } catch (e) {
                        console.log('Could not access file through root folder:', e)
                    }
                }

                if (!fileSource) {
                    // File not in cache and not accessible via root - need to re-select folder
                    setNeedsFolderAccess(true)
                    setIsLoading(false)
                    return
                }
            }
            // Legacy fallback: old imports without relativePath - match by fileName
            else if (video.fileName) {
                // Get course to find folder name
                const course = courseId ? await getCourse(courseId) : null
                const folderName = course?.originalTitle

                if (folderName) {
                    const cachedFile = findFileByFileName(folderName, video.fileName)
                    if (cachedFile) {
                        fileSource = cachedFile
                    } else {
                        // File not in cache - need to re-select folder
                        setNeedsFolderAccess(true)
                        setIsLoading(false)
                        return
                    }
                } else {
                    // No folder name available - show folder prompt
                    setNeedsFolderAccess(true)
                    setIsLoading(false)
                    return
                }
            }

            if (!fileSource) {
                // No file source found - show folder access prompt as final fallback
                setNeedsFolderAccess(true)
                setIsLoading(false)
                return
            }

            // Get video URL
            const url = await getVideoUrl(fileSource)
            setVideoUrl(url)

            // Show resume prompt if there's a saved position
            if (settings.resumePlayback && video.lastWatchedPosition > 5 && video.lastWatchedPosition < (video.duration - 10)) {
                setResumePosition(video.lastWatchedPosition)
                setShowResumePrompt(true)
            } else {
                setShowResumePrompt(false)
                setResumePosition(0)
            }
        } catch (err) {
            console.error('Failed to load video:', err)
            setError('Failed to load video: ' + err.message)
        } finally {
            setIsLoading(false)
        }
    }

    async function handleReselectFolder() {
        try {
            setIsLoading(true)
            const result = await pickFolderFallback()
            if (result) {
                cacheFallbackFiles(result.files, result.folderName)
                // Try loading video again
                await loadVideo()
            }
        } catch (err) {
            setError('Failed to select folder: ' + err.message)
        } finally {
            setIsLoading(false)
        }
    }

    // Handle video events
    function handleLoadedMetadata() {
        if (videoRef.current) {
            setDuration(videoRef.current.duration)
            setIsLoading(false)
        }
    }

    function handleTimeUpdate() {
        if (videoRef.current) {
            setCurrentTime(videoRef.current.currentTime)
            onTimeUpdate?.(videoRef.current.currentTime)
        }
    }

    // Expose seekTo method via ref
    // Expose seekTo method via ref
    useImperativeHandle(ref, () => ({
        seekTo: (time) => {
            if (videoRef.current) {
                if (videoRef.current.seekTo) {
                    videoRef.current.seekTo(time)
                } else {
                    videoRef.current.currentTime = time
                }
            }
        },
        getCurrentTime: () => {
            if (videoRef.current?.getCurrentTime) {
                return videoRef.current.getCurrentTime()
            }
            return videoRef.current?.currentTime || 0
        }
    }), [])

    function handlePlay() {
        setIsPlaying(true)
        startProgressTracking()
    }

    function handlePause() {
        setIsPlaying(false)
        stopProgressTracking()
        saveProgress()
    }

    function handleEnded() {
        setIsPlaying(false)
        stopProgressTracking()

        // Mark as complete if threshold reached
        const watchPercentage = (currentTime / duration) * 100
        if (watchPercentage >= settings.autoMarkCompleteAt) {
            markVideoComplete(video.id, true)
            onComplete?.(video.id)
        }

        // Auto-play next if enabled - show countdown
        if (localAutoPlay) {
            setShowAutoPlayCountdown(true)
            setAutoPlayCountdown(3)
        }
    }

    // Auto-play countdown effect
    const countdownRef = useRef(null)
    useEffect(() => {
        if (showAutoPlayCountdown && autoPlayCountdown > 0) {
            countdownRef.current = setTimeout(() => {
                setAutoPlayCountdown(autoPlayCountdown - 1)
            }, 1000)
        } else if (showAutoPlayCountdown && autoPlayCountdown === 0) {
            setShowAutoPlayCountdown(false)
            onNext?.()
        }

        return () => {
            if (countdownRef.current) {
                clearTimeout(countdownRef.current)
            }
        }
    }, [showAutoPlayCountdown, autoPlayCountdown, onNext])

    function cancelAutoPlay() {
        setShowAutoPlayCountdown(false)
        setAutoPlayCountdown(3)
        if (countdownRef.current) {
            clearTimeout(countdownRef.current)
        }
    }

    function startProgressTracking() {
        if (progressIntervalRef.current) return

        progressIntervalRef.current = setInterval(() => {
            saveProgress()
        }, 5000) // Save every 5 seconds
    }

    function stopProgressTracking() {
        if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current)
            progressIntervalRef.current = null
        }
    }

    async function saveProgress() {
        if (!videoRef.current || !video) return

        try {
            await updateVideoProgress(
                video.id,
                videoRef.current.currentTime,
                videoRef.current.duration
            )

            // Check if should auto-complete
            const watchPercentage = (videoRef.current.currentTime / videoRef.current.duration) * 100
            if (watchPercentage >= settings.autoMarkCompleteAt && !video.isCompleted) {
                await markVideoComplete(video.id, true)
                onComplete?.(video.id)
            }
        } catch (err) {
            console.error('Failed to save progress:', err)
        }
    }

    // Controls
    function togglePlay() {
        if (videoRef.current) {
            const isYt = video?.youtubeId || video?.url?.startsWith('http')

            if (isPlaying) {
                if (!isYt) videoRef.current.pause()
                setIsPlaying(false)
            } else {
                if (!isYt) videoRef.current.play()
                setIsPlaying(true)
            }
        }
    }

    function handleSeek(e) {
        if (!progressRef.current || !videoRef.current) return

        const rect = progressRef.current.getBoundingClientRect()
        const percent = (e.clientX - rect.left) / rect.width
        const newTime = percent * duration

        const isYt = video?.youtubeId || video?.url?.startsWith('http')

        if (isYt) {
            videoRef.current.seekTo(newTime)
        } else {
            videoRef.current.currentTime = newTime
        }
        setCurrentTime(newTime)
    }

    function handleVolumeChange(e) {
        const newVolume = parseFloat(e.target.value)
        setVolume(newVolume)
        setIsMuted(newVolume === 0)

        const isYt = video?.youtubeId || video?.url?.startsWith('http')
        if (videoRef.current && !isYt) {
            videoRef.current.volume = newVolume
        }
        localStorage.setItem('mearn_volume', newVolume.toString())
    }

    function toggleMute() {
        if (videoRef.current) {
            const isYt = video?.youtubeId || video?.url?.startsWith('http')

            if (isMuted) {
                if (!isYt) videoRef.current.volume = volume || 0.75
                setIsMuted(false)
            } else {
                if (!isYt) videoRef.current.volume = 0
                setIsMuted(true)
            }
        }
    }

    function toggleFullscreen() {
        if (!containerRef.current) return

        if (document.fullscreenElement) {
            document.exitFullscreen()
            setIsFullscreen(false)
        } else {
            containerRef.current.requestFullscreen()
            setIsFullscreen(true)
        }
    }

    function changeSpeed(speed) {
        setPlaybackSpeed(speed)
        const isYt = video?.youtubeId || video?.url?.startsWith('http')
        if (videoRef.current && !isYt) {
            videoRef.current.playbackRate = speed
        }
        setShowSpeedMenu(false)
    }

    async function togglePiP() {
        if (!videoRef.current) return

        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture()
                setIsPiP(false)
            } else {
                await videoRef.current.requestPictureInPicture()
                setIsPiP(true)
            }
        } catch (err) {
            console.error('PiP error:', err)
        }
    }

    // PiP event listeners to track state
    useEffect(() => {
        const videoEl = videoRef.current
        if (!videoEl) return

        function handleEnterPiP() { setIsPiP(true) }
        function handleLeavePiP() { setIsPiP(false) }

        videoEl.addEventListener('enterpictureinpicture', handleEnterPiP)
        videoEl.addEventListener('leavepictureinpicture', handleLeavePiP)

        return () => {
            videoEl.removeEventListener('enterpictureinpicture', handleEnterPiP)
            videoEl.removeEventListener('leavepictureinpicture', handleLeavePiP)
        }
    }, [videoUrl])

    // Keyboard shortcuts
    useEffect(() => {
        function handleKeyDown(e) {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
            if (!settings.keyboardShortcuts) return

            const key = e.key.toLowerCase()
            const speedOptions = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

            // Handle number keys 0-9 for percentage jump
            if (!e.shiftKey && !e.ctrlKey && key >= '0' && key <= '9') {
                e.preventDefault()
                const percent = parseInt(key) * 10
                if (videoRef.current && duration) {
                    videoRef.current.currentTime = (percent / 100) * duration
                }
                return
            }

            switch (key) {
                case ' ':
                case 'k':
                    e.preventDefault()
                    togglePlay()
                    break
                case 'arrowleft':
                    e.preventDefault()
                    if (videoRef.current) {
                        videoRef.current.currentTime = Math.max(0, currentTime - 5)
                    }
                    break
                case 'arrowright':
                    e.preventDefault()
                    if (videoRef.current) {
                        videoRef.current.currentTime = Math.min(duration, currentTime + 5)
                    }
                    break
                case 'j':
                    e.preventDefault()
                    if (videoRef.current) {
                        videoRef.current.currentTime = Math.max(0, currentTime - 10)
                    }
                    break
                case 'l':
                    e.preventDefault()
                    if (videoRef.current) {
                        videoRef.current.currentTime = Math.min(duration, currentTime + 10)
                    }
                    break
                case 'arrowup':
                    e.preventDefault()
                    setVolume(v => Math.min(1, v + 0.05))
                    break
                case 'arrowdown':
                    e.preventDefault()
                    setVolume(v => Math.max(0, v - 0.05))
                    break
                case 'm':
                    e.preventDefault()
                    toggleMute()
                    break
                case 'f':
                    e.preventDefault()
                    toggleFullscreen()
                    break
                case 'p':
                    e.preventDefault()
                    togglePiP()
                    break
                case ',':
                case '<':
                    e.preventDefault()
                    // Decrease speed
                    const currentIdx = speedOptions.indexOf(playbackSpeed)
                    if (currentIdx > 0) {
                        changeSpeed(speedOptions[currentIdx - 1])
                    }
                    break
                case '.':
                case '>':
                    e.preventDefault()
                    // Increase speed
                    const currentSpeedIdx = speedOptions.indexOf(playbackSpeed)
                    if (currentSpeedIdx < speedOptions.length - 1) {
                        changeSpeed(speedOptions[currentSpeedIdx + 1])
                    }
                    break
                case 'n':
                    if (e.shiftKey) {
                        e.preventDefault()
                        onNext?.()
                    }
                    break
                case 'a':
                    e.preventDefault()
                    setLocalAutoPlay(prev => !prev)
                    break
                case 'escape':
                    e.preventDefault()
                    setShowSpeedMenu(false)
                    break
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [currentTime, duration, settings.keyboardShortcuts])

    // Auto-hide controls
    useEffect(() => {
        function handleMouseMove() {
            setShowControls(true)

            if (controlsTimeoutRef.current) {
                clearTimeout(controlsTimeoutRef.current)
            }

            if (isPlaying) {
                controlsTimeoutRef.current = setTimeout(() => {
                    setShowControls(false)
                }, 3000)
            }
        }

        const container = containerRef.current
        if (container) {
            container.addEventListener('mousemove', handleMouseMove)
            container.addEventListener('mouseleave', () => setShowControls(false))
        }

        return () => {
            if (container) {
                container.removeEventListener('mousemove', handleMouseMove)
            }
            if (controlsTimeoutRef.current) {
                clearTimeout(controlsTimeoutRef.current)
            }
        }
    }, [isPlaying])

    // Update volume when it changes
    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.volume = isMuted ? 0 : volume
        }
    }, [volume, isMuted])

    const speedOptions = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

    return (
        <div
            ref={containerRef}
            className="video-container bg-black relative group"
        >
            {/* Video Element or ReactPlayer */}
            {video?.youtubeId || video?.url?.startsWith('http') ? (
                <div className="w-full h-full relative" onClick={togglePlay}>
                    <ReactPlayer
                        ref={videoRef}
                        url={videoUrl}
                        width="100%"
                        height="100%"
                        playing={isPlaying}
                        volume={volume}
                        muted={isMuted}
                        playbackRate={playbackSpeed}
                        onProgress={(state) => {
                            setCurrentTime(state.playedSeconds)
                            setDuration(state.loadedSeconds) // Approx
                            handleTimeUpdate()
                            onTimeUpdate?.(state.playedSeconds, state.loadedSeconds)
                        }}
                        onDuration={(d) => setDuration(d)}
                        onEnded={handleEnded}
                        onReady={() => setIsLoading(false)}
                        onError={(e) => setError("YouTube playback error: " + e)}
                        controls={false}
                        config={{
                            youtube: {
                                playerVars: { showinfo: 0, controls: 0 }
                            }
                        }}
                    />
                </div>
            ) : (
                <video
                    ref={videoRef}
                    src={videoUrl}
                    className="w-full h-full"
                    onLoadedMetadata={handleLoadedMetadata}
                    onTimeUpdate={handleTimeUpdate}
                    onPlay={handlePlay}
                    onPause={handlePause}
                    onEnded={handleEnded}
                    onClick={togglePlay}
                    onError={(e) => {
                        const videoError = e.target.error
                        let errorMessage = 'Failed to load video.'

                        if (videoError) {
                            switch (videoError.code) {
                                case 1: // MEDIA_ERR_ABORTED
                                    errorMessage = 'Video loading was aborted.'
                                    break
                                case 2: // MEDIA_ERR_NETWORK
                                    errorMessage = 'Network error while loading video. Please check your connection.'
                                    break
                                case 3: // MEDIA_ERR_DECODE
                                    errorMessage = 'Video codec not supported. Try converting to MP4 (H.264) format using HandBrake or FFmpeg.'
                                    break
                                case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
                                    errorMessage = 'Video format not supported. Try converting to MP4 (H.264) or WebM format.'
                                    break
                                default:
                                    errorMessage = 'Unknown video error occurred.'
                            }
                        }

                        setError(errorMessage)
                        setIsLoading(false)
                    }}
                />
            )}

            {/* Loading Overlay */}
            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin" />
                </div>
            )}

            {/* Resume Prompt Overlay */}
            {showResumePrompt && !isLoading && !isPlaying && (
                <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 text-white text-center p-4">
                    <div className="max-w-md">
                        <Play className="w-16 h-16 mx-auto mb-4 text-primary" />
                        <h3 className="text-xl font-semibold mb-2">Resume Watching?</h3>
                        <p className="text-gray-400 mb-6">
                            You left off at {formatDuration(resumePosition)}
                        </p>
                        <div className="flex gap-4 justify-center">
                            <button
                                onClick={() => {
                                    if (videoRef.current) {
                                        videoRef.current.currentTime = resumePosition
                                    }
                                    setShowResumePrompt(false)
                                    togglePlay()
                                }}
                                className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors flex items-center gap-2"
                            >
                                <Play className="w-5 h-5" />
                                Resume
                            </button>
                            <button
                                onClick={() => {
                                    if (videoRef.current) {
                                        videoRef.current.currentTime = 0
                                    }
                                    setShowResumePrompt(false)
                                    togglePlay()
                                }}
                                className="px-6 py-3 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors"
                            >
                                Start Over
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Folder Access Required Overlay (Fallback mode) */}
            {needsFolderAccess && !isLoading && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 text-white text-center p-4">
                    <div className="max-w-md">
                        <FolderOpen className="w-16 h-16 mx-auto mb-4 text-primary" />
                        <h3 className="text-xl font-semibold mb-2">Folder Access Required</h3>
                        <p className="text-gray-400 mb-6">
                            To play videos, please select the course folder again.
                            This is required because your browser doesn't support persistent file access.
                        </p>
                        <button
                            onClick={handleReselectFolder}
                            className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors flex items-center gap-2 mx-auto cursor-pointer"
                        >
                            <FolderOpen className="w-5 h-5" />
                            Select Course Folder
                        </button>
                    </div>
                </div>
            )}

            {/* Error Overlay */}
            {error && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-white text-center p-4">
                    <div>
                        <p className="mb-4">{error}</p>
                        <button
                            onClick={loadVideo}
                            className="px-4 py-2 bg-primary rounded hover:bg-primary-dark transition-colors"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            )}

            {/* Controls Overlay */}
            <div
                className={`absolute inset-0 flex flex-col justify-end transition-opacity duration-200 pointer-events-none ${showControls || !isPlaying ? 'opacity-100' : 'opacity-0'
                    }`}
            >
                {/* Gradient */}
                <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />

                {/* Progress Bar */}
                <div
                    ref={progressRef}
                    className="relative h-1 bg-white/30 cursor-pointer mx-4 mb-2 group/progress pointer-events-auto"
                    onClick={handleSeek}
                >
                    <div
                        className="absolute inset-y-0 left-0 bg-primary"
                        style={{ width: `${(currentTime / duration) * 100}%` }}
                    />
                    <div
                        className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-primary rounded-full opacity-0 group-hover/progress:opacity-100 transition-opacity"
                        style={{ left: `${(currentTime / duration) * 100}%`, marginLeft: '-6px' }}
                    />
                </div>

                {/* Controls Bar */}
                <div className="relative flex items-center gap-2 px-4 pb-4 text-white pointer-events-auto">
                    {/* Play/Pause */}
                    <button
                        onClick={togglePlay}
                        className="p-2 hover:bg-white/20 rounded transition-colors"
                    >
                        {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
                    </button>

                    {/* Next */}
                    <button
                        onClick={onNext}
                        className="p-2 hover:bg-white/20 rounded transition-colors"
                    >
                        <SkipForward className="w-5 h-5" />
                    </button>

                    {/* Time */}
                    <span className="text-sm tabular-nums">
                        {formatDuration(currentTime)} / {formatDuration(duration)}
                    </span>

                    <div className="flex-1" />

                    {/* Speed */}
                    <div className="relative">
                        <button
                            onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                            className="px-2 py-1 hover:bg-white/20 rounded transition-colors text-sm"
                        >
                            {playbackSpeed}x
                        </button>

                        {showSpeedMenu && (
                            <div className="absolute bottom-full right-0 mb-2 bg-gray-900 rounded-lg py-1 min-w-[80px]">
                                {speedOptions.map(speed => (
                                    <button
                                        key={speed}
                                        onClick={() => changeSpeed(speed)}
                                        className={`w-full px-3 py-1 text-sm text-left hover:bg-white/10 ${playbackSpeed === speed ? 'text-primary' : ''
                                            }`}
                                    >
                                        {speed}x
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Volume */}
                    <div className="flex items-center gap-1 group/volume">
                        <button
                            onClick={toggleMute}
                            className="p-2 hover:bg-white/20 rounded transition-colors"
                        >
                            {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                        </button>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={isMuted ? 0 : volume}
                            onChange={handleVolumeChange}
                            className="w-0 overflow-hidden group-hover/volume:w-20 transition-all duration-200 accent-primary"
                        />
                    </div>

                    {/* Auto-play Toggle */}
                    <button
                        onClick={() => setLocalAutoPlay(!localAutoPlay)}
                        className={`p-2 hover:bg-white/20 rounded transition-colors flex items-center gap-1 ${localAutoPlay ? 'text-primary' : 'opacity-60'}`}
                        title={localAutoPlay ? 'Auto-play on' : 'Auto-play off'}
                    >
                        <Repeat className="w-5 h-5" />
                    </button>

                    {/* PiP */}
                    <button
                        onClick={togglePiP}
                        className={`p-2 hover:bg-white/20 rounded transition-colors ${isPiP ? 'text-primary' : ''}`}
                        title="Picture-in-Picture (P)"
                    >
                        <PictureInPicture className="w-5 h-5" />
                    </button>

                    {/* Fullscreen */}
                    <button
                        onClick={toggleFullscreen}
                        className="p-2 hover:bg-white/20 rounded transition-colors"
                        title="Fullscreen (F)"
                    >
                        {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                    </button>
                </div>
            </div>

            {/* Auto-play Countdown Overlay */}
            {showAutoPlayCountdown && (
                <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-40">
                    <div className="text-center text-white">
                        <p className="text-lg mb-2">Next video in</p>
                        <div className="text-6xl font-bold text-primary mb-4">{autoPlayCountdown}</div>
                        <button
                            onClick={cancelAutoPlay}
                            className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors flex items-center gap-2 mx-auto"
                        >
                            <X className="w-4 h-4" />
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* PiP Active Indicator */}
            {isPiP && (
                <div className="absolute top-4 left-4 px-3 py-1.5 bg-primary text-white text-sm rounded-lg z-30 flex items-center gap-2">
                    <PictureInPicture className="w-4 h-4" />
                    Picture-in-Picture Active
                </div>
            )}
        </div>
    )
})

export default VideoPlayer
