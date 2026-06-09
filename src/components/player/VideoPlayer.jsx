import { useRef, useState, useEffect, useCallback, forwardRef, useImperativeHandle, useMemo } from 'react'
import {
    Play, Pause, Volume2, VolumeX, Maximize, Minimize,
    SkipBack, SkipForward, Settings, PictureInPicture, FolderOpen, X, Repeat, Captions, CaptionsOff, Globe, Headphones,
    Sparkles, FileText, Languages, Upload, Gauge, ChevronRight, ChevronLeft, Check
} from 'lucide-react'
// YouTube videos use native iframe embed
import { getVideoUrl, releaseVideoUrl } from '../../utils/fileSystem'
import { updateVideoProgress, markVideoComplete, formatDuration, getCourse, updateVideo, updateCourse, getVideosByCourse } from '../../utils/db'
import { useSettings } from '../../contexts/SettingsContext'
import { SERVER_URL } from '../../utils/api'
import CaptionOverlay from './CaptionOverlay'
import TranslateModal from './TranslateModal'
import DubModal from './DubModal'
import mpegts from 'mpegts.js'


const VideoPlayer = forwardRef(function VideoPlayer({ video, onComplete, onNext, onPrevious, courseId, onTimeUpdate, autoPlay, onAspectRatioChange }, ref) {
    const { settings, updateSettings } = useSettings()
    const videoRef = useRef(null)
    const containerRef = useRef(null)
    const progressRef = useRef(null)
    const [videoUrl, setVideoUrl] = useState(null)
    const [isPlaying, setIsPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [volume, setVolume] = useState(() => settings.volume)
    const [isMuted, setIsMuted] = useState(false)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [showControls, setShowControls] = useState(true)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState(null)
    const [playbackSpeed, setPlaybackSpeed] = useState(() => settings.playbackSpeed)
    const [showSpeedMenu, setShowSpeedMenu] = useState(false)
    const [isPiP, setIsPiP] = useState(false)
    const [showAutoPlayCountdown, setShowAutoPlayCountdown] = useState(false)
    const [autoPlayCountdown, setAutoPlayCountdown] = useState(3)
    const [localAutoPlay, setLocalAutoPlay] = useState(() => settings.autoPlayNext)
    const [resumePosition, setResumePosition] = useState(0)
    const [captionsEnabled, setCaptionsEnabled] = useState(() => settings.captionsEnabled)
    const [captionPosition, setCaptionPosition] = useState(() => settings.captionPosition)
    const [captionLanguages, setCaptionLanguages] = useState({ sourceExists: false, translatedLangs: [], existingLangs: [] })
    const [selectedCaptionLang, setSelectedCaptionLang] = useState(() => settings.captionLanguage || 'source')
    const [captionChunks, setCaptionChunks] = useState([])
    const [showCCMenu, setShowCCMenu] = useState(false)
    const [isSpeedBoosting, setIsSpeedBoosting] = useState(false)
    const [isTransitioning, setIsTransitioning] = useState(false)
    const [speedBeforeBoost, setSpeedBeforeBoost] = useState(1)
    const speedBoostTimeoutRef = useRef(null)
    const wasSpeedBoostingRef = useRef(false)
    const pendingAutoPlayRef = useRef(false) // Track autoplay intent during video transitions
    const [showTranslateModal, setShowTranslateModal] = useState(false)
    const dubAudioRef = useRef(null)
    const [dubLanguages, setDubLanguages] = useState([])
    const [selectedDubLang, setSelectedDubLang] = useState('none')
    const [showAudioMenu, setShowAudioMenu] = useState(false)
    const [showDubModal, setShowDubModal] = useState(false)
    const [showSettingsMenu, setShowSettingsMenu] = useState(false)
    const [settingsSubMenu, setSettingsSubMenu] = useState('main')

    const progressIntervalRef = useRef(null)
    const controlsTimeoutRef = useRef(null)
    const mpegtsPlayerRef = useRef(null)

    const isTs = useMemo(() => {
        if (!videoUrl) return false
        const path = video?.filePath || videoUrl
        return path.toLowerCase().endsWith('.ts') || path.toLowerCase().includes('.ts?')
    }, [videoUrl, video])

    // Handle mpegts.js for .ts files
    useEffect(() => {
        // Clean up existing player
        if (mpegtsPlayerRef.current) {
            try {
                mpegtsPlayerRef.current.unload()
                mpegtsPlayerRef.current.detachMediaElement()
                mpegtsPlayerRef.current.destroy()
            } catch (e) {
                console.error('Error destroying mpegts player:', e)
            }
            mpegtsPlayerRef.current = null
        }

        if (isTs && videoRef.current && videoUrl) {
            // Silence verbose console logs (pts overlaps, frame drops)
            if (mpegts.LoggingControl) {
                mpegts.LoggingControl.enableLog = false
                mpegts.LoggingControl.enableWarn = false
                mpegts.LoggingControl.enableDebug = false
            }

            if (mpegts.isSupported()) {
                const player = mpegts.createPlayer({
                    type: 'mpegts',
                    url: videoUrl,
                    isLive: false,
                }, {
                    enableWorker: true,
                    lazyLoadMaxDuration: 3 * 60, // seconds
                    seekType: 'range',
                })
                player.attachMediaElement(videoRef.current)
                player.load()
                mpegtsPlayerRef.current = player

                player.on(mpegts.Events.ERROR, (type, detail, info) => {
                    // Only treat truly fatal errors as blocking.
                    // Many MediaMSE errors (buffer full, segment overlap) are
                    // transient and playback continues after mpegts.js self-heals.
                    const isFatal = info?.fatal === true
                    if (isFatal) {
                        console.error('mpegts fatal error:', type, detail, info)
                        setError(`Playback error: ${type} (${detail})`)
                        setIsLoading(false)
                    } else {
                        // Non-fatal — log once quietly but keep playing
                        console.warn('mpegts recoverable error:', type, detail)
                    }
                })

                if (isPlaying) {
                    player.play().catch(err => console.log('mpegts play error:', err))
                }
            } else {
                setError('mpegts.js is not supported in this browser.')
            }
        }

        return () => {
            if (mpegtsPlayerRef.current) {
                try {
                    mpegtsPlayerRef.current.unload()
                    mpegtsPlayerRef.current.detachMediaElement()
                    mpegtsPlayerRef.current.destroy()
                } catch (e) {
                    console.error('Error destroying mpegts player:', e)
                }
                mpegtsPlayerRef.current = null
            }
        }
    }, [videoUrl, isTs])

    // Load dub audio when selectedDubLang changes
    useEffect(() => {
        if (selectedDubLang === 'none' || !video?.id) {
            if (dubAudioRef.current) {
                dubAudioRef.current.pause()
                dubAudioRef.current.src = ''
            }
            if (videoRef.current) videoRef.current.muted = false
            return
        }
        if (dubAudioRef.current) {
            dubAudioRef.current.src = `${SERVER_URL}/api/dub/audio/${video.id}?lang=${selectedDubLang}`
            dubAudioRef.current.currentTime = videoRef.current?.currentTime || 0
            dubAudioRef.current.playbackRate = videoRef.current?.playbackRate || 1
            if (videoRef.current) videoRef.current.muted = true
            if (isPlaying) {
                dubAudioRef.current.play().catch(e => console.error('Dub play err:', e))
            }
        }
    }, [selectedDubLang, video?.id])

    // Load video when video prop changes
    useEffect(() => {
        // Reset to 16:9 when switching videos — YouTube/Drive iframes can't report
        // their actual dimensions cross-origin, so 16:9 is the correct safe default.
        // Local file videos will update this via handleLoadedMetadata below.
        onAspectRatioChange?.(16, 9)

        // Reset auto-play countdown if active
        setShowAutoPlayCountdown(false)
        setAutoPlayCountdown(3)
        if (countdownRef.current) {
            clearTimeout(countdownRef.current)
            countdownRef.current = null
        }

        // Clear old video URL immediately to prevent play/pause sync from acting on stale source
        if (videoUrl) {
            releaseVideoUrl(videoUrl)
            setVideoUrl(null)
        }
        setIsPlaying(false)
        setIsLoading(true)

        // Store autoplay intent — actual play() deferred to handleLoadedMetadata
        pendingAutoPlayRef.current = !!(video?.id && autoPlay)

        loadVideo()

        if (video?.id && autoPlay) {
            // Keep transition overlay for a bit to cover the load
            const timer = setTimeout(() => setIsTransitioning(false), 600)
            return () => clearTimeout(timer)
        } else {
            setIsTransitioning(false)
        }
        return () => {
            if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current)
            }
        }
    }, [video?.id, autoPlay])

    async function loadVideo() {
        if (!video) {
            setError('No video selected')
            return
        }

        // Check if it's a YouTube video (has youtubeId or URL points to youtube.com/youtu.be)
        const isYouTube = video.youtubeId ||
            (video.url && (video.url.includes('youtube.com') || video.url.includes('youtu.be')))

        // Handle YouTube videos
        if (isYouTube) {
            const url = video.url || `https://www.youtube.com/watch?v=${video.youtubeId}`
            setVideoUrl(url)
            setIsLoading(true) // Wait for onReady
            setDuration(video.duration || 0) // Try to trust duration if saved

            // Auto-restore last watched position (will be applied when player loads)
            if (video.lastWatchedAt && video.watchProgress > 0 && video.watchProgress < 0.95) {
                setResumePosition(video.watchProgress) // Store percentage for YouTube
            } else {
                setResumePosition(0)
            }
            return
        }

        // Handle Google Drive videos  
        if (video.driveFileId || video.url?.includes('drive.google.com')) {
            const url = video.url || `https://drive.google.com/uc?export=download&id=${video.driveFileId}`
            setVideoUrl(url)
            setIsLoading(true)
            setDuration(video.duration || 0)

            // Auto-restore last watched position
            if (settings.resumePlayback && video.lastWatchedPosition > 5 && video.watchProgress < 0.95) {
                setResumePosition(video.lastWatchedPosition)
            } else {
                setResumePosition(0)
            }
            return
        }

        try {
            setIsLoading(true)
            setError(null)

            // Server mode: use filePath for streaming
            if (video.filePath) {
                const url = await getVideoUrl(video.filePath)
                setVideoUrl(url)
            } else {
                // No file path available — video needs path repair
                setError('Video file path not found. Please re-import this course or restart the server.')
                setIsLoading(false)
                return
            }

            // Auto-restore last watched position
            if (settings.resumePlayback && video.lastWatchedPosition > 5 && video.watchProgress < 0.95) {
                setResumePosition(video.lastWatchedPosition)
            } else {
                setResumePosition(0)
            }
        } catch (err) {
            console.error('Failed to load video:', err)
            setError('Failed to load video: ' + err.message)
        } finally {
            setIsLoading(false)
        }
    }


    // Handle video events
    function handleLoadedMetadata() {
        if (videoRef.current) {
            const detectedDuration = videoRef.current.duration
            setDuration(detectedDuration)
            setIsLoading(false)

            // Report actual video dimensions so the parent can size the container
            // correctly for any aspect ratio (4:3, 21:9, portrait, etc.)
            const vw = videoRef.current.videoWidth
            const vh = videoRef.current.videoHeight
            if (vw > 0 && vh > 0) {
                onAspectRatioChange?.(vw, vh)
            }

            // Persist detected duration if the stored value is 0/missing
            if (video?.id && detectedDuration > 0 && (!video.duration || video.duration < 1)) {
                const roundedDuration = Math.floor(detectedDuration)
                updateVideo(video.id, { duration: roundedDuration }).then(() => {
                    // Recalculate the parent course's total duration
                    if (courseId) {
                        getVideosByCourse(courseId).then(videos => {
                            const totalDuration = videos.reduce((sum, v) => {
                                return sum + (v.id === video.id ? roundedDuration : (v.duration || 0))
                            }, 0)
                            updateCourse(courseId, { totalDuration })
                        }).catch(err => console.warn('Failed to update course duration:', err))
                    }
                }).catch(err => console.warn('Failed to persist video duration:', err))
            }

            // Ensure playback speed is applied to new source
            const isYt = video?.youtubeId || video?.url?.startsWith('http')
            if (!isYt) {
                videoRef.current.playbackRate = isSpeedBoosting ? 2 : playbackSpeed
            }

            // Auto-resume from last watched position
            if (resumePosition > 0) {
                videoRef.current.currentTime = resumePosition
            }

            // Fulfill pending autoplay intent now that video is ready
            if (pendingAutoPlayRef.current) {
                pendingAutoPlayRef.current = false
                setIsPlaying(true)
            }
        }
    }

    function handleTimeUpdate() {
        if (videoRef.current) {
            setCurrentTime(videoRef.current.currentTime)
            onTimeUpdate?.(videoRef.current.currentTime)
            
            // Sync dub audio
            if (selectedDubLang !== 'none' && dubAudioRef.current) {
                const diff = Math.abs(videoRef.current.currentTime - dubAudioRef.current.currentTime)
                // If out of sync by more than 300ms, snap dub to video
                if (diff > 0.3) {
                    dubAudioRef.current.currentTime = videoRef.current.currentTime
                }
            }
        }
    }

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
        },
        getInternalVideo: () => {
            return videoRef.current
        }
    }), [])

    function handlePlay() {
        if (videoRef.current && videoRef.current.paused) return // Ignore if not actually playing
        setIsPlaying(true)
        startProgressTracking()
    }

    function handlePause() {
        if (videoRef.current && !videoRef.current.paused) return // Ignore if not actually paused
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
            // Start fade out before switching
            setIsTransitioning(true)
            setTimeout(() => {
                setShowAutoPlayCountdown(false)
                onNext?.()
            }, 300) // Match fade duration
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
        const isYt = video?.youtubeId || video?.url?.startsWith('http')

        if (isYt) {
            setIsPlaying(prev => !prev)
            return
        }

        if (videoRef.current) {
            setIsPlaying(prev => !prev)
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
        updateSettings({ volume: newVolume })
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
        updateSettings({ playbackSpeed: speed })
        
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
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return
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
                case 'c':
                    e.preventDefault()
                    setCaptionsEnabled(prev => !prev)
                    break
                case 'escape':
                    e.preventDefault()
                    setShowSpeedMenu(false)
                    setShowCCMenu(false)
                    setShowSettingsMenu(false)
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
            if (selectedDubLang !== 'none') {
                videoRef.current.muted = true
                if (dubAudioRef.current) {
                    dubAudioRef.current.volume = isMuted ? 0 : volume
                }
            } else {
                videoRef.current.muted = isMuted
                videoRef.current.volume = isMuted ? 0 : volume
            }
        }
    }, [volume, isMuted, selectedDubLang])

    // Sync internal video state with props/state
    useEffect(() => {
        if (!videoRef.current || !videoUrl) return
        
        // Skip for YouTube/Drive (they handle autoplay via URL params)
        const isYt = video?.youtubeId || (video?.url && (video.url.includes('youtube.com') || video.url.includes('youtu.be')))
        const isDrive = video?.driveFileId || video?.url?.includes('drive.google.com')
        if (isYt || isDrive) return

        if (isPlaying) {
            const playPromise = videoRef.current.play()
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    if (error.name !== 'AbortError') {
                        console.log('Auto-play was prevented:', error)
                        setIsPlaying(false)
                    }
                })
            }
            if (selectedDubLang !== 'none' && dubAudioRef.current) {
                dubAudioRef.current.play().catch(e => console.error("Dub play err:", e))
            }
        } else {
            videoRef.current.pause()
            if (dubAudioRef.current) dubAudioRef.current.pause()
        }
    }, [isPlaying, videoUrl, selectedDubLang])

    // Sync playback speed with video element
    useEffect(() => {
        const isYt = video?.youtubeId || video?.url?.startsWith('http')
        if (!isYt) {
            const rate = isSpeedBoosting ? 2 : playbackSpeed
            if (videoRef.current) videoRef.current.playbackRate = rate
            if (dubAudioRef.current) dubAudioRef.current.playbackRate = rate
        }
    }, [playbackSpeed, isSpeedBoosting, videoUrl])

    // Fetch caption languages
    useEffect(() => {
        if (!video?.id) return
        
        // Skip for external links for now
        if (video.youtubeId || video.url?.startsWith('http')) return

        fetch(`${SERVER_URL}/api/transcripts/${video.id}/languages`)
            .then(res => res.json())
            .then(data => setCaptionLanguages(data))
            .catch(err => console.error('Failed to fetch caption languages:', err))
            
        // Fetch dub languages
        fetch(`${SERVER_URL}/api/dub/video/${video.id}/languages`)
            .then(res => res.json())
            .then(data => setDubLanguages(data || []))
            .catch(err => console.error('Failed to fetch dub languages:', err))
            
    }, [video?.id, showCCMenu, showAudioMenu]) // Re-fetch when menus open

    // Sync selected language with settings
    useEffect(() => {
        if (settings.captionLanguage && settings.captionLanguage !== selectedCaptionLang) {
            setSelectedCaptionLang(settings.captionLanguage)
            setCaptionsEnabled(true)
        }
    }, [settings.captionLanguage])

    // Fetch caption chunks
    useEffect(() => {
        if (!video?.id) return
        
        // Skip for external links
        if (video.youtubeId || video.url?.startsWith('http')) return

        if (!captionsEnabled) return

        fetch(`${SERVER_URL}/api/transcripts/${video.id}/chunks?lang=${selectedCaptionLang}`)
            .then(res => {
                if (!res.ok) {
                    console.warn(`Caption chunks fetch failed: ${res.status} ${res.statusText}`)
                    return []
                }
                return res.json()
            })
            .then(data => setCaptionChunks(Array.isArray(data) ? data : []))
            .catch(err => console.error('Failed to fetch caption chunks:', err))
            
        updateSettings({ captionLanguage: selectedCaptionLang })
    }, [video?.id, selectedCaptionLang, captionsEnabled])

    // Handle caption upload
    const fileInputRef = useRef(null)
    function handleUploadCaptions(e) {
        const file = e.target.files?.[0]
        if (!file || !video?.id) return

        const formData = new FormData()
        formData.append('file', file)

        fetch(`${SERVER_URL}/api/transcripts/${video.id}/upload`, {
            method: 'POST',
            body: formData
        })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setSelectedCaptionLang(data.language)
                    setCaptionsEnabled(true)
                    setShowCCMenu(false)
                }
            })
            .catch(err => console.error('Failed to upload captions:', err))
    }

    function toggleCaptions() {
        setCaptionsEnabled(prev => !prev)
    }

    // Whether the control bar is currently visible
    const controlsVisible = showControls || !isPlaying

    // Speed boost handlers (hold to 2x speed)
    function handleSpeedBoostStart(e) {
        // Don't trigger on controls area or if clicking on interactive elements
        if (e.target.closest('button') || e.target.closest('input') || e.target.closest('[data-no-speed-boost]')) {
            return
        }

        // Start timer for long press
        speedBoostTimeoutRef.current = setTimeout(() => {
            if (isPlaying) {
                setSpeedBeforeBoost(playbackSpeed)
                setPlaybackSpeed(2)
                setIsSpeedBoosting(true)
                if (videoRef.current && !(video?.youtubeId || video?.url?.startsWith('http'))) {
                    videoRef.current.playbackRate = 2
                }
            }
        }, 500) // 500ms hold to activate
    }

    function handleSpeedBoostEnd() {
        // Clear the timeout if released before activation
        if (speedBoostTimeoutRef.current) {
            clearTimeout(speedBoostTimeoutRef.current)
            speedBoostTimeoutRef.current = null
        }

        // Restore original speed if we were boosting
        if (isSpeedBoosting) {
            setPlaybackSpeed(speedBeforeBoost)
            setIsSpeedBoosting(false)
            // Set flag to prevent click from pausing video
            wasSpeedBoostingRef.current = true
            if (videoRef.current && !(video?.youtubeId || video?.url?.startsWith('http'))) {
                videoRef.current.playbackRate = speedBeforeBoost
            }
        }
    }

    // Handle video click - don't toggle play if we just finished speed boosting
    function handleVideoClick() {
        if (wasSpeedBoostingRef.current) {
            wasSpeedBoostingRef.current = false
            return // Don't toggle play/pause after speed boost
        }
        togglePlay()
    }

    const speedOptions = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

    return (
        <div
            ref={containerRef}
            className="video-container bg-black relative group"
            onMouseDown={handleSpeedBoostStart}
            onMouseUp={handleSpeedBoostEnd}
            onMouseLeave={handleSpeedBoostEnd}
            onTouchStart={handleSpeedBoostStart}
            onTouchEnd={handleSpeedBoostEnd}
        >
            {/* YouTube iframe */}
            {(video?.youtubeId || (video?.url && (video.url.includes('youtube.com') || video.url.includes('youtu.be')))) ? (
                <div className="w-full h-full">
                    {/* YouTube Embed using native iframe with YouTube's built-in controls */}
                    <iframe
                        ref={videoRef}
                        src={`https://www.youtube.com/embed/${video.youtubeId || videoUrl?.match(/[?&]v=([^&]+)/)?.[1] || videoUrl?.match(/youtu\.be\/([^?]+)/)?.[1]}?enablejsapi=1&modestbranding=1&rel=0&origin=${window.location.origin}&autoplay=${autoPlay ? 1 : 0}&mute=0`}
                        className="w-full h-full"
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                        onLoad={() => {
                            console.log('YouTube iframe loaded')
                            setIsLoading(false)
                            setError(null)
                        }}
                        onError={(e) => {
                            console.error('YouTube iframe error:', e)
                            setError("Failed to load YouTube video.")
                            setIsLoading(false)
                        }}
                    />
                </div>
            ) : (video?.driveFileId || video?.url?.includes('drive.google.com')) ? (
                <div className="w-full h-full">
                    {/* Google Drive Embed using native iframe with Drive's built-in player */}
                    <iframe
                        ref={videoRef}
                        src={`https://drive.google.com/file/d/${video.driveFileId || video.url?.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1]}/preview${autoPlay ? '?autoplay=1' : ''}`}
                        className="w-full h-full"
                        frameBorder="0"
                        allow="autoplay; encrypted-media; picture-in-picture"
                        allowFullScreen
                        onLoad={() => {
                            console.log('Google Drive iframe loaded')
                            setIsLoading(false)
                            setError(null)
                        }}
                        onError={(e) => {
                            console.error('Google Drive iframe error:', e)
                            setError("Failed to load Google Drive video. Make sure the file is shared publicly.")
                            setIsLoading(false)
                        }}
                    />
                </div>
            ) : (
                <video
                    ref={videoRef}
                    src={isTs ? undefined : videoUrl}
                    className="w-full h-full"
                    onLoadedMetadata={handleLoadedMetadata}
                    onTimeUpdate={handleTimeUpdate}
                    onPlay={handlePlay}
                    onPause={handlePause}
                    onEnded={handleEnded}
                    onClick={handleVideoClick}
                    onError={(e) => {
                        // For .ts files, mpegts.js manages playback via MSE —
                        // the native <video> error is expected and should be ignored.
                        if (isTs) return

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
                >
                </video>
            )}

            {/* Speed Boost Indicator */}
            {isSpeedBoosting && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-1.5 bg-black/60 backdrop-blur-md text-white rounded-full font-semibold text-sm shadow-md flex items-center gap-1.5 select-none pointer-events-none transition-all">
                    <span>2x</span>
                    <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                        <path d="M4 6l8.5 6L4 18V6zm9 0l8.5 6-8.5 6V6z" />
                    </svg>
                </div>
            )}

            {/* Loading Overlay */}
            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin" />
                </div>
            )}


            {/* Error Overlay */}
            {error && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-white text-center p-4">
                    <div>
                        <p className="mb-4">{error}</p>
                        <button
                            onClick={loadVideo}
                            className="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors border border-white/10"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            )}

            {/* Caption Overlay */}
            <CaptionOverlay
                chunks={captionChunks}
                currentTime={currentTime}
                enabled={captionsEnabled}
                position={captionPosition}
                onPositionChange={(pos) => {
                    setCaptionPosition(pos)
                    updateSettings({ captionPosition: pos })
                }}
                fontSize={settings.captionFontSize}
                showBackground={settings.captionBackground}
                controlsVisible={controlsVisible}
            />

            {/* Controls Overlay - Hidden for YouTube videos (they use native controls) */}
            {!(video?.youtubeId || video?.url?.startsWith('http')) && (
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
                            className="absolute inset-y-0 left-0 bg-[var(--primary-fg)]"
                            style={{ width: `${(currentTime / duration) * 100}%` }}
                        />
                        <div
                            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-[var(--primary-fg)] rounded-full opacity-0 group-hover/progress:opacity-100 transition-opacity"
                            style={{ left: `${(currentTime / duration) * 100}%`, marginLeft: '-6px' }}
                        />
                    </div>

                    {/* Controls Bar */}
                    <div className="relative flex items-center justify-between px-4 pb-4 text-white pointer-events-auto">
                        
                        {/* Left Side Group */}
                        <div className="flex items-center gap-2">
                            {/* Play/Pause */}
                            <button
                                onClick={togglePlay}
                                className="w-10 h-10 rounded-full flex items-center justify-center bg-white/15 hover:bg-white/25 backdrop-blur-sm transition-all text-white shadow-sm"
                                title={isPlaying ? "Pause (Space)" : "Play (Space)"}
                            >
                                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                            </button>

                            {/* Prev/Next Pill */}
                            <div className="h-10 px-3.5 rounded-full flex items-center bg-white/15 backdrop-blur-sm transition-all text-white gap-3 shadow-sm">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (onPrevious) onPrevious();
                                    }}
                                    className={`p-1 hover:text-[var(--primary-fg)] transition-colors ${!onPrevious ? 'opacity-40 cursor-not-allowed' : ''}`}
                                    title="Previous Video"
                                    disabled={!onPrevious}
                                >
                                    <SkipBack className="w-4.5 h-4.5 fill-current" />
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (onNext) onNext();
                                    }}
                                    className={`p-1 hover:text-[var(--primary-fg)] transition-colors ${!onNext ? 'opacity-40 cursor-not-allowed' : ''}`}
                                    title="Next Video (Shift+N)"
                                    disabled={!onNext}
                                >
                                    <SkipForward className="w-4.5 h-4.5 fill-current" />
                                </button>
                            </div>

                            {/* Volume Pill with Expanding Slider */}
                            <div className="flex items-center gap-1 group/volume h-10 px-3 bg-white/15 hover:bg-white/25 backdrop-blur-sm rounded-full transition-all text-white shadow-sm">
                                <button
                                    onClick={toggleMute}
                                    className="p-1 hover:text-[var(--primary-fg)] transition-colors"
                                    title="Mute (M)"
                                >
                                    {isMuted || volume === 0 ? <VolumeX className="w-4.5 h-4.5" /> : <Volume2 className="w-4.5 h-4.5" />}
                                </button>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={isMuted ? 0 : volume}
                                    onChange={handleVolumeChange}
                                    className="w-0 overflow-hidden group-hover/volume:w-20 group-hover/volume:ml-1.5 transition-all duration-200 accent-white cursor-pointer"
                                />
                            </div>

                            {/* Time Pill */}
                            <div className="h-10 px-4 flex items-center bg-black/40 backdrop-blur-sm rounded-full text-white text-xs font-semibold select-none shadow-sm tabular-nums">
                                {formatDuration(currentTime)} / {formatDuration(duration)}
                            </div>
                        </div>

                        {/* Right Side Pill */}
                        <div className="flex items-center gap-1 px-3 py-1 bg-white/15 backdrop-blur-sm rounded-full transition-all text-white shadow-sm relative">
                            
                            {/* CC/Captions Toggle and Menu */}
                            {(captionLanguages.existingLangs.length > 0 || captionLanguages.translatedLangs.length > 0 || captionLanguages.sourceExists || video?.id) && (
                                <div className="relative flex items-center">
                                    <button
                                        onClick={() => {
                                            setShowCCMenu(!showCCMenu);
                                            setShowSettingsMenu(false);
                                        }}
                                        className={`p-1.5 hover:bg-white/15 rounded-full transition-all ${captionsEnabled ? 'text-[var(--primary-fg)]' : 'opacity-70 hover:opacity-100'}`}
                                        title="Captions Menu (C)"
                                    >
                                        <Captions className="w-4.5 h-4.5" />
                                    </button>

                                    {showCCMenu && (
                                        <div className="absolute bottom-full right-0 mb-3 bg-black/90 backdrop-blur-md rounded-xl py-2 min-w-[200px] shadow-2xl border border-white/10 text-white text-sm z-50">
                                            <div className="px-3 py-2 border-b border-white/10 flex justify-between items-center">
                                                <span className="font-bold text-xs uppercase tracking-wider opacity-60">Captions</span>
                                                <button 
                                                    onClick={() => {
                                                        setCaptionsEnabled(!captionsEnabled)
                                                    }}
                                                    className="text-xs bg-white/10 hover:bg-white/20 px-2 py-0.5 rounded"
                                                >
                                                    {captionsEnabled ? 'Turn Off' : 'Turn On'}
                                                </button>
                                            </div>
                                            
                                            <div className="max-h-[180px] overflow-y-auto mt-1">
                                                {/* Source/Generated */}
                                                {captionLanguages.sourceExists && (
                                                    <button
                                                        onClick={() => { setSelectedCaptionLang('source'); setCaptionsEnabled(true); setShowCCMenu(false) }}
                                                        className={`w-full px-3 py-2 text-xs text-left hover:bg-white/10 flex items-center justify-between ${selectedCaptionLang === 'source' ? 'text-[var(--primary-fg)] font-bold bg-white/5' : ''}`}
                                                    >
                                                        <span>Source / Generated</span>
                                                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                                                    </button>
                                                )}

                                                {/* Pre-existing files */}
                                                {captionLanguages.existingLangs.map(lang => (
                                                    <button
                                                        key={`exist-${lang}`}
                                                        onClick={() => { setSelectedCaptionLang(lang); setCaptionsEnabled(true); setShowCCMenu(false) }}
                                                        className={`w-full px-3 py-2 text-xs text-left hover:bg-white/10 flex items-center justify-between ${selectedCaptionLang === lang ? 'text-[var(--primary-fg)] font-bold bg-white/5' : ''}`}
                                                    >
                                                        <span>{lang === 'source' ? 'Original File' : lang}</span>
                                                        <FileText className="w-3.5 h-3.5 opacity-70" />
                                                    </button>
                                                ))}

                                                {/* Translated */}
                                                {captionLanguages.translatedLangs.map(lang => (
                                                    <button
                                                        key={`trans-${lang}`}
                                                        onClick={() => { setSelectedCaptionLang(lang); setCaptionsEnabled(true); setShowCCMenu(false) }}
                                                        className={`w-full px-3 py-2 text-xs text-left hover:bg-white/10 flex items-center justify-between ${selectedCaptionLang === lang ? 'text-[var(--primary-fg)] font-bold bg-white/5' : ''}`}
                                                    >
                                                        <span>{lang.toUpperCase()}</span>
                                                        <Languages className="w-3.5 h-3.5 opacity-70" />
                                                    </button>
                                                ))}
                                                
                                                {(!captionLanguages.sourceExists && captionLanguages.existingLangs.length === 0 && captionLanguages.translatedLangs.length === 0) && (
                                                    <div className="px-3 py-2 text-xs opacity-50">No captions available</div>
                                                )}
                                            </div>

                                            <div className="border-t border-white/10 mt-1 pt-1">
                                                <label className="w-full px-3 py-1.5 text-xs text-left hover:bg-white/10 cursor-pointer flex items-center gap-2">
                                                    <Upload className="w-3.5 h-3.5 opacity-70" />
                                                    <span>Upload captions...</span>
                                                    <input 
                                                        type="file" 
                                                        accept=".srt,.vtt,.ass,.lrc"
                                                        className="hidden"
                                                        ref={fileInputRef}
                                                        onChange={handleUploadCaptions}
                                                    />
                                                </label>
                                                <button
                                                    onClick={() => {
                                                        setShowCCMenu(false)
                                                        setShowTranslateModal(true)
                                                    }}
                                                    className="w-full px-3 py-1.5 text-xs text-left hover:bg-white/10 flex items-center justify-between"
                                                >
                                                    <span className="flex items-center gap-2">
                                                        <Languages className="w-3.5 h-3.5 opacity-70" /> Translate to...
                                                    </span>
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Unified Settings Gear Button */}
                            <div className="relative flex items-center">
                                <button
                                    onClick={() => {
                                        setShowSettingsMenu(!showSettingsMenu);
                                        setSettingsSubMenu('main');
                                        setShowCCMenu(false);
                                    }}
                                    className={`p-1.5 hover:bg-white/15 rounded-full transition-all ${showSettingsMenu ? 'text-[var(--primary-fg)]' : 'opacity-70 hover:opacity-100'}`}
                                    title="Settings"
                                >
                                    <Settings className={`w-4.5 h-4.5 transition-transform duration-300 ${showSettingsMenu ? 'rotate-45' : ''}`} />
                                </button>

                                {showSettingsMenu && (
                                    <div className="absolute bottom-full right-0 mb-3 bg-black/90 backdrop-blur-md text-white rounded-xl py-2 min-w-[220px] shadow-2xl border border-white/10 z-50 animate-scale-in text-sm">
                                        {settingsSubMenu === 'main' && (
                                            <div className="flex flex-col py-1">
                                                {/* Playback Speed */}
                                                <button
                                                    onClick={() => setSettingsSubMenu('speed')}
                                                    className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-white/10 transition-colors"
                                                >
                                                    <span className="flex items-center gap-2">
                                                        <Gauge className="w-4 h-4 opacity-75" /> Playback speed
                                                    </span>
                                                    <span className="text-xs text-white/50 flex items-center gap-1">
                                                        {playbackSpeed === 1 ? 'Normal' : `${playbackSpeed}x`}
                                                        <ChevronRight className="w-3 h-3 opacity-55" />
                                                    </span>
                                                </button>

                                                {/* Audio Track */}
                                                <button
                                                    onClick={() => setSettingsSubMenu('audio')}
                                                    className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-white/10 transition-colors"
                                                >
                                                    <span className="flex items-center gap-2">
                                                        <Headphones className="w-4 h-4 opacity-75" /> Audio track
                                                    </span>
                                                    <span className="text-xs text-white/50 flex items-center gap-1">
                                                        {selectedDubLang === 'none' ? 'Original' : selectedDubLang.toUpperCase()}
                                                        <ChevronRight className="w-3 h-3 opacity-55" />
                                                    </span>
                                                </button>

                                                {/* Auto-play */}
                                                <div className="w-full px-4 py-2.5 flex items-center justify-between border-t border-white/5 mt-1 pt-2">
                                                    <span className="flex items-center gap-2">
                                                        <Repeat className="w-4 h-4 opacity-75" /> Auto-play next
                                                    </span>
                                                    <button
                                                        onClick={() => {
                                                            const nextVal = !localAutoPlay
                                                            setLocalAutoPlay(nextVal)
                                                            updateSettings({ autoPlayNext: nextVal })
                                                        }}
                                                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${localAutoPlay ? 'bg-[var(--primary-fg)]' : 'bg-white/20'}`}
                                                    >
                                                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform duration-200 ${localAutoPlay ? 'translate-x-[18px]' : 'translate-x-1'}`} />
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {settingsSubMenu === 'speed' && (
                                            <div className="flex flex-col">
                                                <button
                                                    onClick={() => setSettingsSubMenu('main')}
                                                    className="px-4 py-2 border-b border-white/10 flex items-center gap-2 font-bold text-left hover:bg-white/5 w-full text-xs uppercase tracking-wider opacity-85"
                                                >
                                                    <ChevronLeft className="w-4 h-4" /> Playback speed
                                                </button>
                                                <div className="max-h-[200px] overflow-y-auto py-1">
                                                    {speedOptions.map(speed => (
                                                        <button
                                                            key={speed}
                                                            onClick={() => {
                                                                changeSpeed(speed)
                                                                setShowSettingsMenu(false)
                                                            }}
                                                            className={`w-full px-8 py-2 text-left hover:bg-white/10 flex items-center justify-between text-xs ${playbackSpeed === speed ? 'text-[var(--primary-fg)] font-bold bg-white/5' : ''}`}
                                                        >
                                                            <span>{speed === 1 ? 'Normal' : `${speed}x`}</span>
                                                            {playbackSpeed === speed && <Check className="w-3.5 h-3.5 text-[var(--primary-fg)]" />}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {settingsSubMenu === 'audio' && (
                                            <div className="flex flex-col">
                                                <button
                                                    onClick={() => setSettingsSubMenu('main')}
                                                    className="px-4 py-2 border-b border-white/10 flex items-center gap-2 font-bold text-left hover:bg-white/5 w-full text-xs uppercase tracking-wider opacity-85"
                                                >
                                                    <ChevronLeft className="w-4 h-4" /> Audio track
                                                </button>
                                                <div className="max-h-[180px] overflow-y-auto py-1">
                                                    <button
                                                        onClick={() => {
                                                            setSelectedDubLang('none')
                                                            setShowSettingsMenu(false)
                                                        }}
                                                        className={`w-full px-8 py-2 text-left hover:bg-white/10 flex items-center justify-between text-xs ${selectedDubLang === 'none' ? 'text-[var(--primary-fg)] font-bold bg-white/5' : ''}`}
                                                    >
                                                        <span>Original Audio</span>
                                                        {selectedDubLang === 'none' && <Check className="w-3.5 h-3.5 text-[var(--primary-fg)]" />}
                                                    </button>
                                                    {dubLanguages.map(lang => (
                                                        <button
                                                            key={`dub-${lang}`}
                                                            onClick={() => {
                                                                setSelectedDubLang(lang)
                                                                setShowSettingsMenu(false)
                                                            }}
                                                            className={`w-full px-8 py-2 text-left hover:bg-white/10 flex items-center justify-between text-xs ${selectedDubLang === lang ? 'text-[var(--primary-fg)] font-bold bg-white/5' : ''}`}
                                                        >
                                                            <span>{lang.toUpperCase()} (Dubbed)</span>
                                                            {selectedDubLang === lang && <Check className="w-3.5 h-3.5 text-[var(--primary-fg)]" />}
                                                        </button>
                                                    ))}
                                                </div>
                                                <div className="border-t border-white/10 mt-1 pt-1">
                                                    <button
                                                        onClick={() => {
                                                            setShowSettingsMenu(false)
                                                            setShowDubModal(true)
                                                        }}
                                                        className="w-full px-4 py-2 text-left hover:bg-white/10 flex items-center justify-between text-xs text-white/70"
                                                    >
                                                        <span>+ Generate dub...</span>
                                                        <Headphones className="w-3.5 h-3.5 opacity-70" />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* PiP */}
                            <button
                                onClick={togglePiP}
                                className={`p-1.5 hover:bg-white/15 rounded-full transition-all ${isPiP ? 'text-[var(--primary-fg)]' : 'opacity-70 hover:opacity-100'}`}
                                title="Picture-in-Picture (P)"
                            >
                                <PictureInPicture className="w-4.5 h-4.5" />
                            </button>

                            {/* Fullscreen */}
                            <button
                                onClick={toggleFullscreen}
                                className="p-1.5 hover:bg-white/15 rounded-full transition-all opacity-70 hover:opacity-100"
                                title="Fullscreen (F)"
                            >
                                {isFullscreen ? <Minimize className="w-4.5 h-4.5" /> : <Maximize className="w-4.5 h-4.5" />}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Auto-play Countdown Overlay */}
            {showAutoPlayCountdown && (
                <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-40">
                    <div className="text-center text-white">
                        <p className="text-lg mb-2">Next video in</p>
                        {/* Circular Countdown with "Trim Path" animation */}
                        <div className="relative w-24 h-24 mb-6 mx-auto flex items-center justify-center">
                            <svg className="w-full h-full -rotate-90">
                                <circle
                                    cx="48"
                                    cy="48"
                                    r="42"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                    fill="none"
                                    className="text-white/10"
                                />
                                <circle
                                    cx="48"
                                    cy="48"
                                    r="42"
                                    stroke="currentColor"
                                    strokeWidth="6"
                                    fill="none"
                                    strokeDasharray="263.89"
                                    strokeDashoffset="0"
                                    strokeLinecap="round"
                                    className="text-[var(--primary-fg)] animate-countdown-fill"
                                />
                            </svg>
                            <div className="absolute text-4xl font-bold tabular-nums animate-pulse">
                                {autoPlayCountdown}
                            </div>
                        </div>
                        <div className="flex items-center justify-center gap-4 mx-auto">
                            <button
                                onClick={cancelAutoPlay}
                                className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors flex items-center gap-2"
                            >
                                <X className="w-4 h-4" />
                                Stop
                            </button>
                            <button
                                onClick={() => {
                                    setShowAutoPlayCountdown(false)
                                    onNext?.()
                                }}
                                className="px-4 py-2 bg-[var(--primary-fg)] text-black font-semibold hover:brightness-110 rounded-lg transition-colors flex items-center gap-2 shadow-md"
                            >
                                <SkipForward className="w-4 h-4" />
                                Play Next
                            </button>
                        </div>
                    </div>
                </div>
            )}
 
            {/* Video Switch Transition Overlay */}
            <div
                className={`absolute inset-0 bg-black z-[60] transition-opacity duration-500 pointer-events-none ${isTransitioning ? 'opacity-100' : 'opacity-0'}`}
            />

             {/* PiP Active Indicator */}
            {isPiP && (
                <div className="absolute top-4 left-4 px-3 py-1.5 bg-primary text-white text-sm rounded-lg z-30 flex items-center gap-2">
                    <PictureInPicture className="w-4 h-4" />
                    Picture-in-Picture Active
                </div>
            )}

            <TranslateModal
                isOpen={showTranslateModal}
                onClose={() => setShowTranslateModal(false)}
                video={video}
                chunkCount={captionChunks.length}
                onSuccess={(lang) => {
                    // Update state to select new language and force refresh
                    setSelectedCaptionLang(lang)
                    setCaptionsEnabled(true)
                    // The effect will trigger a fetch for the new chunks
                }}
            />

            <DubModal
                isOpen={showDubModal}
                onClose={() => setShowDubModal(false)}
                video={video}
                onSuccess={(lang) => {
                    setDubLanguages(prev => [...new Set([...prev, lang])])
                    setSelectedDubLang(lang)
                }}
            />

            {/* Hidden audio element for dubbed audio playback */}
            <audio ref={dubAudioRef} preload="auto" />
        </div>
    )
})

export default VideoPlayer
