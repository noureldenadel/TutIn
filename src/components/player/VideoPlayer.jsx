import { useRef, useState, useEffect, useCallback, forwardRef, useImperativeHandle, useMemo } from 'react'
import {
    Play, Pause, Volume2, VolumeX, Maximize, Minimize,
    SkipBack, SkipForward, Settings, PictureInPicture, FolderOpen, X, Repeat, Captions, CaptionsOff, Globe, Headphones,
    Sparkles, FileText, Languages, Upload, Gauge, ChevronRight, ChevronLeft, Check, MessageSquareText
} from 'lucide-react'
// YouTube videos use native iframe embed
import { getVideoUrl, releaseVideoUrl } from '../../utils/fileSystem'
import { updateVideoProgress, markVideoComplete, formatDuration, getCourse, updateVideo, updateCourse, getVideosByCourse } from '../../utils/db'
import { useSettings } from '../../contexts/SettingsContext'
import { SERVER_URL } from '../../utils/api'
import CaptionOverlay from './CaptionOverlay'
import TranslateModal from './TranslateModal'
import SmartCaptionsModal from './SmartCaptionsModal'
import DubModal from './DubModal'
import mpegts from 'mpegts.js'
import { SUPPORTED_LANGUAGES, getLanguageLabel, getLanguageInfo } from '../../utils/languages'

export const LANGUAGE_LABEL_MAP = {
    source: 'Original',
    en: 'English',
    es: 'Español',
    fr: 'Français',
    de: 'Deutsch',
    it: 'Italiano',
    pt: 'Português',
    ru: 'Русский',
    ar: 'العربية',
    zh: '中文',
    ja: '日本語',
    ko: '한국어',
    hi: 'हिन्दी',
    tr: 'Türkçe',
    nl: 'Nederlands',
    pl: 'Polski',
    vi: 'Tiếng Việt',
    th: 'ไทย',
    cs: 'Čeština',
    hu: 'Magyar',
    uk: 'Українська',
    id: 'Bahasa Indonesia',
    sv: 'Svenska',
    da: 'Dansk',
    no: 'Norsk',
    fi: 'Suomi',
    el: 'Ελληνικά',
    he: 'עברית'
}

export function getLangLabel(code) {
    if (!code) return 'Unknown'
    const clean = code.toLowerCase().trim()
    return LANGUAGE_LABEL_MAP[clean] || code.toUpperCase()
}

const VideoPlayer = forwardRef(function VideoPlayer({ video, onComplete, onNext, onPrevious, courseId, course, onCourseUpdate, onTimeUpdate, autoPlay, onAspectRatioChange, onVideoDataChange }, ref) {
    const { settings, updateSettings } = useSettings()

    // YouTube and Google Drive videos are embedded in cross-origin iframes
    // whose play/pause/seek/volume can't be controlled from outside HTML5 element.
    const isEmbeddedPlayer = !!(video?.youtubeId || video?.driveFileId ||
        (video?.url && (video.url.includes('youtube.com') || video.url.includes('youtu.be') || video.url.includes('drive.google.com'))))

    const videoRef = useRef(null)
    const containerRef = useRef(null)
    const progressRef = useRef(null)
    const [videoUrl, setVideoUrl] = useState(null)
    const [courseData, setCourseData] = useState(course || null)

    useEffect(() => {
        if (course) {
            setCourseData(course)
        } else if (courseId) {
            getCourse(courseId).then(c => {
                if (c) setCourseData(c)
            })
        }
    }, [course, courseId])

    useEffect(() => {
        function handleCourseUpdated(e) {
            const { courseId: updatedId, updates } = e?.detail || {}
            const activeId = course?.id || courseId || courseData?.id
            if (activeId && updatedId === activeId && updates) {
                setCourseData(prev => prev ? ({ ...prev, ...updates }) : { id: activeId, ...updates })
            }
        }
        window.addEventListener('tutin:course-updated', handleCourseUpdated)
        return () => window.removeEventListener('tutin:course-updated', handleCourseUpdated)
    }, [course?.id, courseId, courseData?.id])

    async function handleUpdateCourseLanguage(newLang) {
        const targetId = courseData?.id || course?.id || courseId
        if (!targetId) return
        try {
            await updateCourse(targetId, { language: newLang })
            const updated = { ...(courseData || {}), id: targetId, language: newLang }
            setCourseData(updated)
            onCourseUpdate?.(updated)
        } catch (err) {
            console.error('Failed to update course language:', err)
        }
    }
    const [isPlaying, setIsPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    
    // Refs for accessing latest state in closures (e.g. interval timers and YouTube message handlers)
    const currentTimeRef = useRef(currentTime)
    const durationRef = useRef(duration)
    const isPlayingRef = useRef(isPlaying)
    useEffect(() => { currentTimeRef.current = currentTime }, [currentTime])
    useEffect(() => { durationRef.current = duration }, [duration])
    useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])
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
    const [showAudioSubMenu, setShowAudioSubMenu] = useState(false)
    const [isSpeedBoosting, setIsSpeedBoosting] = useState(false)
    const [isTransitioning, setIsTransitioning] = useState(false)
    const [speedBeforeBoost, setSpeedBeforeBoost] = useState(1)
    const speedBoostTimeoutRef = useRef(null)
    const wasSpeedBoostingRef = useRef(false)
    const pendingAutoPlayRef = useRef(false) // Track autoplay intent during video transitions
    const [showTranslateModal, setShowTranslateModal] = useState(false)
    const [smartCaptionData, setSmartCaptionData] = useState(null)
    const dubAudioRef = useRef(null)
    const [dubLanguages, setDubLanguages] = useState([])
    const [isDubLoading, setIsDubLoading] = useState(true)
    const [selectedDubLang, setSelectedDubLang] = useState('none')
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

    // Helper to fetch available dub languages
    const fetchDubLanguages = useCallback((videoId = video?.id) => {
        if (!videoId) {
            setIsDubLoading(false)
            return
        }
        if (video?.youtubeId || video?.url?.startsWith('http')) {
            setIsDubLoading(false)
            return
        }

        setIsDubLoading(true)
        fetch(`${SERVER_URL}/api/dub/video/${videoId}/languages`)
            .then(res => {
                if (!res.ok) return []
                return res.json()
            })
            .then(langs => {
                if (Array.isArray(langs)) {
                    setDubLanguages(langs)
                }
            })
            .catch(err => console.error('Failed to fetch dub languages:', err))
            .finally(() => setIsDubLoading(false))
    }, [video?.id, video?.youtubeId, video?.url])

    // Fetch dub languages on video change and listen for updates
    useEffect(() => {
        setIsDubLoading(true)
        setDubLanguages([]) // Reset when video changes
        fetchDubLanguages()

        const handleDubUpdated = (e) => {
            if (e.detail?.videoId === video?.id) {
                fetchDubLanguages()
            }
        }
        window.addEventListener('tutin:dub-updated', handleDubUpdated)
        return () => window.removeEventListener('tutin:dub-updated', handleDubUpdated)
    }, [video?.id, fetchDubLanguages])

    // Also populate from video.dubbedTracks if available
    useEffect(() => {
        if (video?.dubbedTracks && Array.isArray(video.dubbedTracks)) {
            const readyLangs = video.dubbedTracks.filter(t => t.status === 'ready').map(t => t.language)
            if (readyLangs.length > 0) {
                setDubLanguages(prev => Array.from(new Set([...prev, ...readyLangs])))
            }
        }
    }, [video?.dubbedTracks, video?.id])

    // Sync with global settings when user clicks dub tracks in other panels
    // Fall back to original sound if the selected dub is not available
    useEffect(() => {
        if (isDubLoading) return // Wait until we finish fetching dubs for this video

        if (settings.isDubbingEnabled && settings.dubLanguage) {
            if (dubLanguages.includes(settings.dubLanguage)) {
                setSelectedDubLang(settings.dubLanguage)
            } else {
                setSelectedDubLang('none')
                // Video doesn't have this dub, disable globally to avoid surprise auto-play when navigating back
                updateSettings({ isDubbingEnabled: false })
            }
        } else {
            setSelectedDubLang('none')
        }
    }, [settings.isDubbingEnabled, settings.dubLanguage, dubLanguages, isDubLoading, updateSettings])

    // Load and sync dub audio when selectedDubLang changes
    useEffect(() => {
        const dubAudio = dubAudioRef.current
        const videoEl = videoRef.current

        console.log('[DUB DEBUG] selectedDubLang changed:', selectedDubLang)

        if (selectedDubLang === 'none' || !video?.id) {
            console.log('[DUB DEBUG] Disabling dub. Muted state returning to:', isMuted)
            if (dubAudio) {
                dubAudio.pause()
                dubAudio.removeAttribute('src')
                dubAudio.load()
            }
            if (videoEl) {
                videoEl.muted = isMuted
                videoEl.volume = isMuted ? 0 : volume
            }
            return
        }

        if (!dubAudio || !videoEl) {
            console.log('[DUB DEBUG] Missing dubAudio or videoEl refs')
            return
        }

        // Always mute the underlying video so only the dubbed audio is heard
        console.log('[DUB DEBUG] Muting underlying video element')
        videoEl.muted = true

        const audioUrl = `${SERVER_URL}/api/dub/audio/${video.id}?lang=${encodeURIComponent(selectedDubLang)}&t=${Date.now()}`
        console.log('[DUB DEBUG] Setting dubAudio src to:', audioUrl)
        dubAudio.src = audioUrl
        dubAudio.playbackRate = videoEl.playbackRate || playbackSpeed || 1
        dubAudio.volume = isMuted ? 0 : volume
        dubAudio.muted = isMuted

        const syncAndPlay = () => {
            if (!dubAudio || !videoRef.current) return
            try {
                console.log('[DUB DEBUG] Syncing dub audio. Video time:', videoRef.current.currentTime)
                dubAudio.currentTime = videoRef.current.currentTime || 0
                dubAudio.playbackRate = videoRef.current.playbackRate || playbackSpeed || 1
                dubAudio.volume = isMuted ? 0 : volume
                dubAudio.muted = isMuted
                if (!videoRef.current.paused) {
                    console.log('[DUB DEBUG] Playing dub audio...')
                    dubAudio.play().then(() => console.log('[DUB DEBUG] Dub audio playing successfully')).catch(e => console.warn('[VideoPlayer] Dub play caught:', e))
                }
            } catch (err) {
                console.warn('[VideoPlayer] Dub sync err:', err)
            }
        }

        dubAudio.addEventListener('loadedmetadata', syncAndPlay, { once: true })
        dubAudio.addEventListener('canplay', syncAndPlay, { once: true })

        if (dubAudio.readyState >= 1) {
            syncAndPlay()
        }

        return () => {
            dubAudio.removeEventListener('loadedmetadata', syncAndPlay)
            dubAudio.removeEventListener('canplay', syncAndPlay)
        }
    }, [selectedDubLang, video?.id]) // Removed volume/isMuted/playbackSpeed to prevent restarting dub on volume change

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
                if (videoRef.current.paused) {
                    videoRef.current.play().catch(err => {
                        if (err.name !== 'AbortError') {
                            console.log('[VideoPlayer] Autoplay prevented:', err)
                            setIsPlaying(false)
                        }
                    })
                }
            }
        }
    }

    function handleTimeUpdate() {
        if (videoRef.current) {
            setCurrentTime(videoRef.current.currentTime)
            onTimeUpdate?.(videoRef.current.currentTime)
            
            // Sync dub audio with drift correction (>0.3s)
            if (selectedDubLang !== 'none' && dubAudioRef.current) {
                const diff = Math.abs(videoRef.current.currentTime - dubAudioRef.current.currentTime)
                if (diff > 0.3) {
                    dubAudioRef.current.currentTime = videoRef.current.currentTime
                }
            }
        }
    }

    // Expose seekTo, getCurrentTime, getInternalVideo, captureFrame, play, pause, and getPlaybackState methods via ref
    useImperativeHandle(ref, () => ({
        play: () => {
            console.log('[VideoPlayer] imperative ref.play() called')
            const isYt = video?.youtubeId || (video?.url && (video.url.includes('youtube.com') || video.url.includes('youtu.be')))
            if (isYt && videoRef.current?.contentWindow) {
                videoRef.current.contentWindow.postMessage(JSON.stringify({
                    event: 'command',
                    func: 'playVideo',
                    args: []
                }), '*')
            } else if (videoRef.current && typeof videoRef.current.play === 'function') {
                videoRef.current.play().catch(err => {
                    console.log('[VideoPlayer] Video play catch:', err)
                })
            }
            if (selectedDubLang !== 'none' && dubAudioRef.current) {
                dubAudioRef.current.play().catch(e => console.log('[VideoPlayer] Dub play catch:', e))
            }
            isPlayingRef.current = true
            setIsPlaying(true)
        },
        pause: () => {
            console.log('[VideoPlayer] imperative ref.pause() called')
            const isYt = video?.youtubeId || (video?.url && (video.url.includes('youtube.com') || video.url.includes('youtu.be')))
            if (isYt && videoRef.current?.contentWindow) {
                videoRef.current.contentWindow.postMessage(JSON.stringify({
                    event: 'command',
                    func: 'pauseVideo',
                    args: []
                }), '*')
            } else if (videoRef.current && typeof videoRef.current.pause === 'function') {
                videoRef.current.pause()
            }
            if (selectedDubLang !== 'none' && dubAudioRef.current) {
                dubAudioRef.current.pause()
            }
            isPlayingRef.current = false
            setIsPlaying(false)
        },
        togglePlay: () => {
            console.log('[VideoPlayer] imperative ref.togglePlay() called')
            togglePlay()
        },
        getPlaybackState: () => {
            const isYt = video?.youtubeId || (video?.url && (video.url.includes('youtube.com') || video.url.includes('youtu.be')))
            let actuallyPlaying = isPlayingRef.current
            let currTime = currentTimeRef.current
            if (!isYt && videoRef.current && videoRef.current.nodeName === 'VIDEO') {
                actuallyPlaying = !videoRef.current.paused
                currTime = videoRef.current.currentTime || currTime
            }
            const state = {
                isPlaying: actuallyPlaying,
                currentTime: currTime,
                duration: durationRef.current
            }
            console.log('[VideoPlayer] imperative ref.getPlaybackState() returning:', state, {
                isYt: !!isYt,
                domPaused: videoRef.current?.paused,
                isPlayingRef: isPlayingRef.current,
                stateIsPlaying: isPlaying
            })
            return state
        },
        seekTo: (time) => {
            if (videoRef.current) {
                const isYt = video?.youtubeId || video?.url?.includes('youtube.com') || video?.url?.includes('youtu.be')
                if (isYt && videoRef.current.contentWindow) {
                    videoRef.current.contentWindow.postMessage(JSON.stringify({
                        event: 'command',
                        func: 'seekTo',
                        args: [time, true]
                    }), '*')
                } else if (videoRef.current.seekTo) {
                    videoRef.current.seekTo(time)
                } else {
                    videoRef.current.currentTime = time
                }
            }
            if (selectedDubLang !== 'none' && dubAudioRef.current) {
                dubAudioRef.current.currentTime = time
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
        },
        captureFrame: ({ maxWidth = 1280, maxHeight = 720, quality = 0.85 } = {}) => {
            const videoEl = videoRef.current
            if (!videoEl || videoEl.nodeName !== 'VIDEO') {
                throw new Error('Screenshot capture is only supported for local and streamed video files.')
            }
            if (videoEl.readyState < 2) {
                throw new Error('Video frame is not ready to capture.')
            }
            const vw = videoEl.videoWidth
            const vh = videoEl.videoHeight
            if (!vw || !vh) {
                throw new Error('Video dimensions unavailable.')
            }

            // Calculate optimized dimensions:
            // For 4K (3840x2160), 2K, or 1080p videos, downscale proportionally to maxWidth x maxHeight
            // so text/code remains crisp while file size stays lightweight (~60-150KB)
            const scale = Math.min(1, maxWidth / vw, maxHeight / vh)
            const targetW = Math.max(1, Math.round(vw * scale))
            const targetH = Math.max(1, Math.round(vh * scale))

            const canvas = document.createElement('canvas')
            canvas.width = targetW
            canvas.height = targetH
            const ctx = canvas.getContext('2d')
            ctx.imageSmoothingEnabled = true
            ctx.imageSmoothingQuality = 'high'
            ctx.drawImage(videoEl, 0, 0, targetW, targetH)

            let currentQuality = quality
            let dataUrl
            try {
                dataUrl = canvas.toDataURL('image/jpeg', currentQuality)
                const MAX_LEN = 1.2 * 1024 * 1024
                while (dataUrl.length > MAX_LEN && currentQuality > 0.35) {
                    currentQuality -= 0.1
                    dataUrl = canvas.toDataURL('image/jpeg', currentQuality)
                }
            } catch (err) {
                console.error('Canvas export error:', err)
                throw new Error('Could not export screenshot from video frame: ' + err.message)
            }

            return {
                dataUrl,
                timestamp: videoEl.currentTime,
                width: targetW,
                height: targetH,
                originalWidth: vw,
                originalHeight: vh
            }
        }
    }), [video?.id, video?.youtubeId, video?.url, video?.driveFileId])

    function handlePlay() {
        console.log('[VideoPlayer] <video> onPlay event fired (video started playing)')
        setIsPlaying(true)
        isPlayingRef.current = true
        startProgressTracking()
        if (selectedDubLang !== 'none' && dubAudioRef.current) {
            if (videoRef.current) {
                const diff = Math.abs(videoRef.current.currentTime - dubAudioRef.current.currentTime)
                if (diff > 0.1) dubAudioRef.current.currentTime = videoRef.current.currentTime
            }
            dubAudioRef.current.play().catch(e => console.log('[VideoPlayer] dub audio play catch:', e))
        }
    }

    function handlePause() {
        // Ignore transient pause events when the video element is seeking (e.g. initial resume position jump or user scrub)
        if (videoRef.current?.seeking) {
            return
        }
        console.log('[VideoPlayer] <video> onPause event fired (video paused)')
        setIsPlaying(false)
        isPlayingRef.current = false
        stopProgressTracking()
        saveProgress()
        if (selectedDubLang !== 'none' && dubAudioRef.current) {
            dubAudioRef.current.pause()
        }
    }

    function handleEnded() {
        setIsPlaying(false)
        stopProgressTracking()

        const currentT = currentTimeRef.current
        const currentD = durationRef.current

        // Mark as complete if threshold reached
        if (currentD > 0) {
            const watchPercentage = (currentT / currentD) * 100
            if (watchPercentage >= settings.autoMarkCompleteAt) {
                markVideoComplete(video.id, true)
                onComplete?.(video.id)
            }
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
            const isEmbedded = video?.youtubeId || video?.driveFileId || 
                (video?.url && (video.url.includes('youtube.com') || video.url.includes('youtu.be') || video.url.includes('drive.google.com')))
            const currentT = isEmbedded ? currentTimeRef.current : videoRef.current.currentTime
            const currentD = isEmbedded ? durationRef.current : videoRef.current.duration

            if (currentT === undefined || currentD === undefined) return

            await updateVideoProgress(
                video.id,
                currentT,
                currentD
            )

            // Check if should auto-complete
            if (currentD > 0) {
                const watchPercentage = (currentT / currentD) * 100
                if (watchPercentage >= settings.autoMarkCompleteAt && !video.isCompleted) {
                    await markVideoComplete(video.id, true)
                    onComplete?.(video.id)
                }
            }
        } catch (err) {
            console.error('Failed to save progress:', err)
        }
    }

    // Controls
    function togglePlay() {
        const isYt = video?.youtubeId || (video?.url && (video.url.includes('youtube.com') || video.url.includes('youtu.be')))
        console.log('[VideoPlayer] togglePlay called, currently isPlaying:', isPlaying, 'isYt:', !!isYt)

        if (isYt && videoRef.current?.contentWindow) {
            const next = !isPlayingRef.current
            videoRef.current.contentWindow.postMessage(JSON.stringify({
                event: 'command',
                func: next ? 'playVideo' : 'pauseVideo',
                args: []
            }), '*')
            setIsPlaying(next)
            isPlayingRef.current = next
            return
        }

        if (videoRef.current) {
            if (videoRef.current.paused) {
                videoRef.current.play().catch(err => {
                    if (err.name !== 'AbortError') console.log('[VideoPlayer] play catch:', err)
                })
                setIsPlaying(true)
                isPlayingRef.current = true
            } else {
                videoRef.current.pause()
                setIsPlaying(false)
                isPlayingRef.current = false
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
        if (selectedDubLang !== 'none' && dubAudioRef.current) {
            dubAudioRef.current.currentTime = newTime
        }
        setCurrentTime(newTime)
    }

    function handleVolumeChange(e) {
        const newVolume = parseFloat(e.target.value)
        setVolume(newVolume)
        setIsMuted(newVolume === 0)

        const isYt = video?.youtubeId || video?.url?.startsWith('http')
        if (selectedDubLang !== 'none') {
            if (videoRef.current && !isYt) videoRef.current.muted = true
            if (dubAudioRef.current) {
                dubAudioRef.current.volume = newVolume
                dubAudioRef.current.muted = newVolume === 0
            }
        } else if (videoRef.current && !isYt) {
            videoRef.current.volume = newVolume
            videoRef.current.muted = newVolume === 0
        }
        updateSettings({ volume: newVolume })
    }

    function toggleMute() {
        const nextMuted = !isMuted
        setIsMuted(nextMuted)
        const isYt = video?.youtubeId || video?.url?.startsWith('http')

        if (selectedDubLang !== 'none') {
            if (videoRef.current && !isYt) videoRef.current.muted = true
            if (dubAudioRef.current) {
                dubAudioRef.current.muted = nextMuted
                dubAudioRef.current.volume = nextMuted ? 0 : (volume || 0.75)
            }
        } else if (videoRef.current && !isYt) {
            if (nextMuted) {
                videoRef.current.volume = 0
                videoRef.current.muted = true
            } else {
                videoRef.current.volume = volume || 0.75
                videoRef.current.muted = false
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
        if (dubAudioRef.current) {
            dubAudioRef.current.playbackRate = speed
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

    // ── YouTube / Drive current-time tracking ──────────────────────────
    // YouTube: uses IFrame Player API (postMessage).  enablejsapi=1 is
    //   already in the embed URL, so the iframe posts 'infoDelivery'
    //   messages that include currentTime when we send a 'listening' cmd.
    // Drive: no JS API available — use a simple elapsed-time counter.
    useEffect(() => {
        const isYouTube = !!(video?.youtubeId ||
            (video?.url && (video.url.includes('youtube.com') || video.url.includes('youtu.be'))))
        const isDrive = !!(video?.driveFileId ||
            (video?.url && video.url.includes('drive.google.com')))

        if (!isYouTube && !isDrive) return

        // ── YouTube: postMessage API ────────────────────────────────
        if (isYouTube) {
            function handleMessage(e) {
                if (!e.origin.includes('youtube.com')) return
                try {
                    const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
                    if (data?.event === 'infoDelivery') {
                        if (data.info?.currentTime != null) {
                            const t = data.info.currentTime
                            setCurrentTime(t)
                            onTimeUpdate?.(t)
                        }
                        // Sync playing state from YouTube's playerState:
                        // 1 = playing, 2 = paused, 0 = ended, 3 = buffering, 5 = cued
                        if (data.info?.playerState != null) {
                            const ps = data.info.playerState
                            if (ps === 1 || ps === 3) {
                                // Playing or buffering — mark as playing
                                isPlayingRef.current = true
                                setIsPlaying(true)
                                startProgressTracking()
                            } else if (ps === 2) {
                                // Paused
                                isPlayingRef.current = false
                                setIsPlaying(false)
                                stopProgressTracking()
                                saveProgress()
                            } else if (ps === 0) {
                                handleEnded()
                            }
                        }
                    }
                } catch { /* non-JSON messages — ignore */ }
            }

            window.addEventListener('message', handleMessage)

            // Poll the iframe to trigger infoDelivery events
            const poll = setInterval(() => {
                try {
                    videoRef.current?.contentWindow?.postMessage(
                        JSON.stringify({ event: 'listening' }),
                        'https://www.youtube.com'
                    )
                } catch { /* iframe not ready */ }
            }, 500)

            return () => {
                window.removeEventListener('message', handleMessage)
                clearInterval(poll)
            }
        }

        // ── Drive: elapsed-time fallback ────────────────────────────
        if (isDrive) {
            let elapsed = 0
            const ticker = setInterval(() => {
                elapsed += 1
                setCurrentTime(elapsed)
                onTimeUpdate?.(elapsed)
                
                if (video?.duration > 0 && elapsed >= video.duration) {
                    handleEnded()
                }
            }, 1000)

            return () => clearInterval(ticker)
        }
    }, [video?.id])

    // Keyboard shortcuts & Space-hold 2x speed boost
    const isHoldingSpaceRef = useRef(false)
    const spaceHoldTimerRef = useRef(null)
    const speedBeforeBoostRef = useRef(1)

    useEffect(() => {
        function isInputTarget(el) {
            if (!el) return false
            const tag = el.tagName?.toUpperCase()
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
            if (el.isContentEditable || el.contentEditable === 'true') return true
            if (el.closest && (el.closest('[contenteditable="true"]') || el.closest('.note-editor') || el.closest('input, textarea'))) return true
            return false
        }

        function handleKeyDown(e) {
            if (isInputTarget(e.target)) return
            if (!settings.keyboardShortcuts) return
            // Don't intercept browser shortcuts (Ctrl+F, Ctrl+C, Cmd+A, Alt+…, etc.)
            if (e.ctrlKey || e.metaKey || e.altKey) return

            const key = e.key.toLowerCase()
            const speedOptions = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

            // Handle space holding for 2x speed boost (like YouTube)
            if (key === ' ' || e.code === 'Space') {
                e.preventDefault()
                if (e.repeat) return

                if (spaceHoldTimerRef.current) clearTimeout(spaceHoldTimerRef.current)
                spaceHoldTimerRef.current = setTimeout(() => {
                    isHoldingSpaceRef.current = true
                    if (videoRef.current && !isEmbeddedPlayer) {
                        setPlaybackSpeed(currentSpeed => {
                            speedBeforeBoostRef.current = videoRef.current.playbackRate || currentSpeed || 1
                            return currentSpeed
                        })
                        videoRef.current.playbackRate = 2
                        setIsSpeedBoosting(true)
                        if (videoRef.current.paused) {
                            videoRef.current.play().catch(() => {})
                        }
                    }
                    if (dubAudioRef.current) {
                        dubAudioRef.current.playbackRate = 2
                    }
                }, 220)
                return
            }

            // Handle number keys 0-9 for percentage jump
            if (!e.shiftKey && !e.ctrlKey && key >= '0' && key <= '9') {
                e.preventDefault()
                const percent = parseInt(key) * 10
                if (videoRef.current && durationRef.current) {
                    const t = (percent / 100) * durationRef.current
                    videoRef.current.currentTime = t
                    if (selectedDubLang !== 'none' && dubAudioRef.current) {
                        dubAudioRef.current.currentTime = t
                    }
                }
                return
            }

            switch (key) {
                case 'k':
                    e.preventDefault()
                    togglePlay()
                    break
                case 'arrowleft':
                    e.preventDefault()
                    if (videoRef.current) {
                        const t = Math.max(0, currentTimeRef.current - 5)
                        videoRef.current.currentTime = t
                        if (selectedDubLang !== 'none' && dubAudioRef.current) {
                            dubAudioRef.current.currentTime = t
                        }
                    }
                    break
                case 'arrowright':
                    e.preventDefault()
                    if (videoRef.current) {
                        const t = Math.min(durationRef.current, currentTimeRef.current + 5)
                        videoRef.current.currentTime = t
                        if (selectedDubLang !== 'none' && dubAudioRef.current) {
                            dubAudioRef.current.currentTime = t
                        }
                    }
                    break
                case 'j':
                    e.preventDefault()
                    if (videoRef.current) {
                        const t = Math.max(0, currentTimeRef.current - 10)
                        videoRef.current.currentTime = t
                        if (selectedDubLang !== 'none' && dubAudioRef.current) {
                            dubAudioRef.current.currentTime = t
                        }
                    }
                    break
                case 'l':
                    e.preventDefault()
                    if (videoRef.current) {
                        const t = Math.min(durationRef.current, currentTimeRef.current + 10)
                        videoRef.current.currentTime = t
                        if (selectedDubLang !== 'none' && dubAudioRef.current) {
                            dubAudioRef.current.currentTime = t
                        }
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
                    setPlaybackSpeed(currentSpeed => {
                        const idx = speedOptions.indexOf(currentSpeed)
                        if (idx > 0) changeSpeed(speedOptions[idx - 1])
                        return currentSpeed // changeSpeed will update it anyway
                    })
                    break
                case '.':
                case '>':
                    e.preventDefault()
                    setPlaybackSpeed(currentSpeed => {
                        const idx = speedOptions.indexOf(currentSpeed)
                        if (idx < speedOptions.length - 1) changeSpeed(speedOptions[idx + 1])
                        return currentSpeed
                    })
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
                    setShowAudioSubMenu(false)
                    setShowSettingsMenu(false)
                    break
            }
        }

        function handleKeyUp(e) {
            if (isInputTarget(e.target)) return
            if (!settings.keyboardShortcuts) return

            const key = e.key.toLowerCase()
            if (key === ' ' || e.code === 'Space') {
                e.preventDefault()
                if (spaceHoldTimerRef.current) {
                    clearTimeout(spaceHoldTimerRef.current)
                    spaceHoldTimerRef.current = null
                }

                if (isHoldingSpaceRef.current) {
                    // Was holding space for 2x boost -> restore original speed
                    isHoldingSpaceRef.current = false
                    setIsSpeedBoosting(false)
                    if (videoRef.current && !isEmbeddedPlayer) {
                        setPlaybackSpeed(currentSpeed => {
                            videoRef.current.playbackRate = speedBeforeBoostRef.current || currentSpeed || 1
                            return currentSpeed
                        })
                    }
                    if (dubAudioRef.current) {
                        setPlaybackSpeed(currentSpeed => {
                            dubAudioRef.current.playbackRate = speedBeforeBoostRef.current || currentSpeed || 1
                            return currentSpeed
                        })
                    }
                } else {
                    // Short tap -> toggle play/pause
                    togglePlay()
                }
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keyup', handleKeyUp)
        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
            if (spaceHoldTimerRef.current) clearTimeout(spaceHoldTimerRef.current)
        }
    }, [settings.keyboardShortcuts, isEmbeddedPlayer, selectedDubLang])

    // Auto-hide controls
    const hasOpenMenu = showSettingsMenu || showAudioSubMenu || showSpeedMenu

    useEffect(() => {
        function handleMouseMove() {
            setShowControls(true)

            if (controlsTimeoutRef.current) {
                clearTimeout(controlsTimeoutRef.current)
            }

            if (isPlaying && !hasOpenMenu) {
                controlsTimeoutRef.current = setTimeout(() => {
                    setShowControls(false)
                }, 3000)
            }
        }

        function handleMouseLeave() {
            // If a menu is open, KEEP controls and menu visible
            if (hasOpenMenu) return
            
            // Otherwise hide instantly like before
            setShowControls(false)
        }

        const container = containerRef.current
        if (container) {
            container.addEventListener('mousemove', handleMouseMove)
            container.addEventListener('mouseleave', handleMouseLeave)
        }

        return () => {
            if (container) {
                container.removeEventListener('mousemove', handleMouseMove)
                container.removeEventListener('mouseleave', handleMouseLeave)
            }
            if (controlsTimeoutRef.current) {
                clearTimeout(controlsTimeoutRef.current)
            }
        }
    }, [isPlaying, hasOpenMenu])

    // Close menu on outside click
    useEffect(() => {
        function handleOutsideClick(e) {
            if (!hasOpenMenu) return

            // Check if click was inside any menu or menu trigger
            if (e.target.closest('.tut-in-menu-container') || e.target.closest('.tut-in-menu-trigger')) {
                return
            }

            // Close all menus
            setShowSettingsMenu(false)
            setShowAudioSubMenu(false)
            setShowSpeedMenu(false)

            // If cursor is NOT on the player viewport (e.g. they clicked outside the player),
            // hide the controls too.
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setShowControls(false)
            }
        }

        document.addEventListener('mousedown', handleOutsideClick)
        return () => document.removeEventListener('mousedown', handleOutsideClick)
    }, [hasOpenMenu])

    // Update volume when it changes
    useEffect(() => {
        if (videoRef.current) {
            if (selectedDubLang !== 'none') {
                console.log('[DUB DEBUG] Volume effect: enforcing muted on video')
                videoRef.current.muted = true
                videoRef.current.volume = 0
                if (dubAudioRef.current) {
                    dubAudioRef.current.muted = isMuted
                    dubAudioRef.current.volume = isMuted ? 0 : volume
                }
            } else {
                videoRef.current.muted = isMuted
                videoRef.current.volume = isMuted ? 0 : volume
            }
        }
    }, [volume, isMuted, selectedDubLang])

    // Sync internal video state with props/state (only when DOM state is mismatched)
    useEffect(() => {
        if (!videoRef.current || !videoUrl) return
        
        // Skip for YouTube/Drive (they handle autoplay via URL params or postMessage)
        const isYt = video?.youtubeId || (video?.url && (video.url.includes('youtube.com') || video.url.includes('youtu.be')))
        const isDrive = video?.driveFileId || video?.url?.includes('drive.google.com')
        if (isYt || isDrive) return

        const isDomPaused = videoRef.current.paused
        if (isPlaying && isDomPaused) {
            const playPromise = videoRef.current.play()
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    if (error.name !== 'AbortError') {
                        console.log('[VideoPlayer] Auto-play was prevented:', error)
                        setIsPlaying(false)
                        isPlayingRef.current = false
                    }
                })
            }
        } else if (!isPlaying && !isDomPaused) {
            videoRef.current.pause()
        }
    }, [isPlaying])

    // Sync playback speed with video element
    useEffect(() => {
        const isYt = video?.youtubeId || video?.url?.startsWith('http')
        if (!isYt) {
            const rate = isSpeedBoosting ? 2 : playbackSpeed
            if (videoRef.current) videoRef.current.playbackRate = rate
            if (dubAudioRef.current) dubAudioRef.current.playbackRate = rate
        }
    }, [playbackSpeed, isSpeedBoosting, videoUrl])

    // Helper to fetch caption languages
    const fetchCaptionLanguages = useCallback((videoId = video?.id) => {
        if (!videoId) return
        if (video?.youtubeId || video?.url?.startsWith('http')) return

        fetch(`${SERVER_URL}/api/transcripts/${videoId}/languages`)
            .then(res => res.json())
            .then(data => setCaptionLanguages(data || { sourceExists: false, translatedLangs: [], existingLangs: [] }))
            .catch(err => console.error('Failed to fetch caption languages:', err))
    }, [video?.id, video?.youtubeId, video?.url])

    // Helper to fetch caption chunks
    const fetchCaptionChunks = useCallback((videoId = video?.id, lang = selectedCaptionLang) => {
        if (!videoId) return
        if (video?.youtubeId || video?.url?.startsWith('http')) return

        fetch(`${SERVER_URL}/api/transcripts/${videoId}/chunks?lang=${lang}`)
            .then(res => {
                if (!res.ok) {
                    console.warn(`Caption chunks fetch failed: ${res.status} ${res.statusText}`)
                    return []
                }
                return res.json()
            })
            .then(data => setCaptionChunks(Array.isArray(data) ? data : []))
            .catch(err => console.error('Failed to fetch caption chunks:', err))
    }, [video?.id, video?.youtubeId, video?.url, selectedCaptionLang])

    // Fetch caption and dub languages when video changes or menu opens
    useEffect(() => {
        fetchCaptionLanguages()
        fetchDubLanguages()
    }, [video?.id, showAudioSubMenu, fetchCaptionLanguages, fetchDubLanguages])

    // Fetch caption chunks when language or enabled state changes
    useEffect(() => {
        if (!video?.id || !captionsEnabled) return
        fetchCaptionChunks(video.id, selectedCaptionLang)
        updateSettings({ captionLanguage: selectedCaptionLang })
    }, [video?.id, selectedCaptionLang, captionsEnabled, fetchCaptionChunks])

    // Listen for global transcript updates
    useEffect(() => {
        function handleTranscriptUpdated(e) {
            const { videoId, lang, updatedVideoIds } = e?.detail || {}
            if (!video?.id) return

            const isTargetVideo = !videoId && !updatedVideoIds 
                ? true 
                : (videoId === video.id || (updatedVideoIds && updatedVideoIds.includes(video.id)))

            if (isTargetVideo) {
                fetchCaptionLanguages(video.id)
                if (lang) {
                    setSelectedCaptionLang(lang)
                    setCaptionsEnabled(true)
                    fetchCaptionChunks(video.id, lang)
                } else if (captionsEnabled) {
                    fetchCaptionChunks(video.id, selectedCaptionLang)
                }
            }
        }
        window.addEventListener('tutin:transcript-updated', handleTranscriptUpdated)
        return () => window.removeEventListener('tutin:transcript-updated', handleTranscriptUpdated)
    }, [video?.id, captionsEnabled, selectedCaptionLang, fetchCaptionLanguages, fetchCaptionChunks])

    // Listen for global dub updates
    useEffect(() => {
        function handleDubUpdated(e) {
            const { videoId, lang } = e?.detail || {}
            if (!video?.id) return
            if (!videoId || videoId === video.id) {
                fetchDubLanguages(video.id)
                if (lang) {
                    setDubLanguages(prev => Array.from(new Set([...prev, lang])))
                    setSelectedDubLang(lang)
                }
            }
        }
        window.addEventListener('tutin:dub-updated', handleDubUpdated)
        return () => window.removeEventListener('tutin:dub-updated', handleDubUpdated)
    }, [video?.id, fetchDubLanguages])

    // Sync selected language with settings
    useEffect(() => {
        if (settings.captionLanguage && settings.captionLanguage !== selectedCaptionLang) {
            setSelectedCaptionLang(settings.captionLanguage)
            setCaptionsEnabled(true)
        }
    }, [settings.captionLanguage])

    // Handle caption upload
    const fileInputRef = useRef(null)
    function handleUploadCaptions(e) {
        const file = e.target.files?.[0]
        if (!file || !video?.id) return

        const currentVideoId = video.id
        const formData = new FormData()
        formData.append('file', file)

        fetch(`${SERVER_URL}/api/transcripts/${currentVideoId}/upload`, {
            method: 'POST',
            body: formData
        })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    const lang = data.language || 'source'
                    setSelectedCaptionLang(lang)
                    updateSettings({ captionLanguage: lang })
                    setCaptionsEnabled(true)
                    setShowAudioSubMenu(false)
                    fetchCaptionLanguages(currentVideoId)
                    fetchCaptionChunks(currentVideoId, lang)
                    onVideoDataChange?.()
                    window.dispatchEvent(new CustomEvent('tutin:transcript-updated', {
                        detail: { videoId: currentVideoId, lang }
                    }))

                    // If same-language matching captions detected for other videos in course, show prompt
                    if (data.detectedMatches && data.detectedMatches.length > 0) {
                        setSmartCaptionData({
                            language: data.language,
                            languageName: data.languageName,
                            matches: data.detectedMatches
                        })
                    }
                }
            })
            .catch(err => console.error('Failed to upload captions:', err))
            .finally(() => {
                if (e.target) e.target.value = ''
            })
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
                if (videoRef.current && !isEmbeddedPlayer) {
                    videoRef.current.playbackRate = 2
                }
                if (dubAudioRef.current) {
                    dubAudioRef.current.playbackRate = 2
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
            if (videoRef.current && !isEmbeddedPlayer) {
                videoRef.current.playbackRate = speedBeforeBoost
            }
            if (dubAudioRef.current) {
                dubAudioRef.current.playbackRate = speedBeforeBoost
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
            className="video-container relative group w-full h-full bg-transparent"
            style={{ backgroundColor: 'transparent' }}
            onMouseDown={handleSpeedBoostStart}
            onMouseUp={handleSpeedBoostEnd}
            onMouseLeave={handleSpeedBoostEnd}
            onTouchStart={handleSpeedBoostStart}
            onTouchEnd={handleSpeedBoostEnd}
        >
            {/* YouTube iframe */}
            {(video?.youtubeId || (video?.url && (video.url.includes('youtube.com') || video.url.includes('youtu.be')))) ? (
                <div className="w-full h-full relative z-10">
                    {/* YouTube Embed using native iframe with YouTube's built-in controls */}
                    <iframe
                        ref={videoRef}
                        src={`https://www.youtube.com/embed/${video.youtubeId || videoUrl?.match(/[?&]v=([^&]+)/)?.[1] || videoUrl?.match(/youtu\.be\/([^?]+)/)?.[1]}?enablejsapi=1&controls=1&modestbranding=1&rel=0&origin=${window.location.origin}&autoplay=${autoPlay ? 1 : 0}&mute=0`}
                        className="w-full h-full"
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                        onLoad={() => {
                            console.log('YouTube iframe loaded')
                            setIsLoading(false)
                            setError(null)
                            // Record in watch history — YouTube iframes can't fire
                            // native play/pause events so saveProgress() never runs.
                            // We record a minimal progress entry so last_watched_at is set.
                            if (video?.id) {
                                updateVideoProgress(video.id, 0, video.duration || 0)
                            }
                        }}
                        onError={(e) => {
                            console.error('YouTube iframe error:', e)
                            setError("Failed to load YouTube video.")
                            setIsLoading(false)
                        }}
                    />
                </div>
            ) : (video?.driveFileId || video?.url?.includes('drive.google.com')) ? (
                <div className="w-full h-full relative z-10">
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
                            // Record in watch history — Drive iframes can't fire
                            // native play/pause events so saveProgress() never runs.
                            if (video?.id) {
                                updateVideoProgress(video.id, 0, video.duration || 0)
                            }
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
                    crossOrigin="anonymous"
                    className="w-full h-full bg-transparent"
                    style={{ backgroundColor: 'transparent' }}
                    onLoadedMetadata={handleLoadedMetadata}
                    onTimeUpdate={handleTimeUpdate}
                    onPlay={handlePlay}
                    onPause={handlePause}
                    onEnded={handleEnded}
                    onClick={handleVideoClick}
                    onSeeking={() => {
                        if (selectedDubLang !== 'none' && dubAudioRef.current && videoRef.current) {
                            dubAudioRef.current.currentTime = videoRef.current.currentTime
                        }
                    }}
                    onSeeked={() => {
                        if (selectedDubLang !== 'none' && dubAudioRef.current && videoRef.current) {
                            dubAudioRef.current.currentTime = videoRef.current.currentTime
                            if (!videoRef.current.paused) {
                                dubAudioRef.current.play().catch(() => {})
                            }
                        }
                    }}
                    onRateChange={() => {
                        if (selectedDubLang !== 'none' && dubAudioRef.current && videoRef.current) {
                            dubAudioRef.current.playbackRate = videoRef.current.playbackRate
                        }
                    }}
                    onWaiting={() => {
                        if (selectedDubLang !== 'none' && dubAudioRef.current) {
                            dubAudioRef.current.pause()
                        }
                    }}
                    onPlaying={() => {
                        if (selectedDubLang !== 'none' && dubAudioRef.current && videoRef.current) {
                            const diff = Math.abs(videoRef.current.currentTime - dubAudioRef.current.currentTime)
                            if (diff > 0.15) dubAudioRef.current.currentTime = videoRef.current.currentTime
                            dubAudioRef.current.playbackRate = videoRef.current.playbackRate
                            dubAudioRef.current.play().catch(() => {})
                        }
                    }}
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

            {/* Caption Overlay — hidden for YouTube/Drive embeds (they handle captions internally) */}
            {!isEmbeddedPlayer && (
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
            )}

            {/* Controls Overlay — hidden for YouTube/Drive embeds (they have their own built-in controls) */}
            {!isEmbeddedPlayer && (
            <div
                className={`absolute inset-0 flex flex-col justify-end transition-opacity duration-200 pointer-events-none ${showControls || !isPlaying ? 'opacity-100' : 'opacity-0'
                    }`}
            >
                    {/* Gradient */}
                    <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />

                    {/* Progress Bar — only for native video, not iframe embeds */}
                    {!isEmbeddedPlayer && (
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
                    )}

                    {/* Controls Bar */}
                    <div className="relative flex items-center justify-between px-4 pb-4 text-white pointer-events-auto">
                        
                        {/* Left Side Group */}
                        <div className="flex items-center gap-2">
                            {/* Play/Pause — only for native video */}
                            {!isEmbeddedPlayer && (
                            <button
                                onClick={togglePlay}
                                className="w-10 h-10 rounded-full flex items-center justify-center bg-white/15 hover:bg-white/25 backdrop-blur-sm transition-all text-white shadow-sm"
                                title={isPlaying ? "Pause (Space)" : "Play (Space)"}
                            >
                                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                            </button>
                            )}

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

                            {/* Volume Pill — only for native video */}
                            {!isEmbeddedPlayer && (
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
                            )}

                            {/* Time Pill — only for native video */}
                            {!isEmbeddedPlayer && (
                            <div className="h-10 px-4 flex items-center bg-black/40 backdrop-blur-sm rounded-full text-white text-xs font-semibold select-none shadow-sm tabular-nums">
                                {formatDuration(currentTime)} / {formatDuration(duration)}
                            </div>
                            )}
                        </div>

                        {/* Right Side Pill */}
                        <div className="flex items-center gap-1 px-3 py-1 bg-white/15 backdrop-blur-sm rounded-full transition-all text-white shadow-sm relative">
                            
                            {/* Audio & Subtitles Combined Toggle and Popover */}
                            {(captionLanguages.existingLangs.length > 0 || captionLanguages.translatedLangs.length > 0 || captionLanguages.sourceExists || dubLanguages.length > 0 || video?.id) && (
                                <div className="relative flex items-center">
                                    <button
                                        onClick={() => {
                                            setShowAudioSubMenu(!showAudioSubMenu);
                                            setShowSettingsMenu(false);
                                        }}
                                        className={`tut-in-menu-trigger p-1.5 hover:bg-white/15 rounded-full transition-all ${
                                            (captionsEnabled || selectedDubLang !== 'none' || showAudioSubMenu)
                                                ? 'text-[var(--primary-fg)]'
                                                : 'opacity-70 hover:opacity-100'
                                        }`}
                                        title="Audio & Subtitles (C)"
                                    >
                                        <MessageSquareText className="w-4.5 h-4.5" />
                                    </button>

                                    {showAudioSubMenu && (
                                        <div className="tut-in-menu-container absolute bottom-full right-0 mb-3 bg-[#141414]/95 backdrop-blur-xl rounded-2xl p-4 min-w-[340px] sm:min-w-[420px] shadow-2xl border border-white/10 text-white text-xs z-50 animate-scale-in">
                                            <div className="grid grid-cols-2 gap-4 divide-x divide-white/10">
                                                
                                                {/* Audio Column */}
                                                <div className="flex flex-col pr-1">
                                                    <div className="text-sm font-bold text-white/90 text-center pb-2.5 mb-1 border-b border-white/10">
                                                        Audio
                                                    </div>
                                                    <div className="max-h-[220px] overflow-y-auto space-y-0.5 py-1">
                                                        {/* Original / No Dub */}
                                                        <button
                                                            onClick={() => {
                                                                setSelectedDubLang('none')
                                                            }}
                                                            className={`w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-white/10 flex items-center justify-between transition-colors ${
                                                                selectedDubLang === 'none'
                                                                    ? 'text-white font-semibold bg-white/5'
                                                                    : 'text-white/75 hover:text-white'
                                                            }`}
                                                        >
                                                            <div className="flex items-center gap-2 truncate">
                                                                {selectedDubLang === 'none' ? (
                                                                    <Check className="w-3.5 h-3.5 text-white flex-shrink-0" />
                                                                ) : (
                                                                    <span className="w-3.5 flex-shrink-0" />
                                                                )}
                                                                <span className="truncate">Original (V.O.)</span>
                                                            </div>
                                                            <span className="text-[10px] text-white/60 bg-white/10 px-1.5 py-0.5 rounded ml-1 flex-shrink-0">
                                                                {getLanguageLabel(courseData?.language || 'en')}
                                                            </span>
                                                        </button>

                                                        {/* Available Dubbed Languages */}
                                                        {dubLanguages.map(lang => (
                                                            <button
                                                                key={`dub-${lang}`}
                                                                onClick={() => {
                                                                    setSelectedDubLang(lang)
                                                                }}
                                                                className={`w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-white/10 flex items-center gap-2 transition-colors ${
                                                                    selectedDubLang === lang
                                                                        ? 'text-white font-semibold bg-white/5'
                                                                        : 'text-white/75 hover:text-white'
                                                                }`}
                                                            >
                                                                {selectedDubLang === lang ? (
                                                                    <Check className="w-3.5 h-3.5 text-white flex-shrink-0" />
                                                                ) : (
                                                                    <span className="w-3.5 flex-shrink-0" />
                                                                )}
                                                                <span className="truncate">{getLangLabel(lang)}</span>
                                                            </button>
                                                        ))}
                                                    </div>

                                                    {/* Audio actions: Generate Dub & Spoken Language Selector */}
                                                    <div className="border-t border-white/10 mt-2 pt-2 space-y-2">
                                                        <button
                                                            onClick={() => {
                                                                setShowAudioSubMenu(false)
                                                                setShowDubModal(true)
                                                            }}
                                                            className="w-full px-2.5 py-1.5 text-xs text-center border border-white/15 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors flex items-center justify-center gap-1.5 font-medium"
                                                        >
                                                            <Headphones className="w-3.5 h-3.5 text-[var(--primary-fg)]" />
                                                            <span>Dub Audio...</span>
                                                        </button>

                                                        <div>
                                                            <label className="text-[10px] uppercase font-semibold text-white/50 block mb-1">
                                                                Language
                                                            </label>
                                                            <select
                                                                value={courseData?.language || 'en'}
                                                                onChange={(e) => handleUpdateCourseLanguage(e.target.value)}
                                                                className="w-full text-xs bg-white/10 text-white rounded px-2 py-1 border border-white/10 outline-none focus:border-[var(--primary-fg)]"
                                                            >
                                                                {SUPPORTED_LANGUAGES.map((l) => (
                                                                    <option key={l.code} value={l.code} className="bg-[#1f1f1f] text-white">
                                                                        {l.nativeName ? `${l.nativeName} (${l.name})` : l.name}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Subtitles Column */}
                                                <div className="flex flex-col pl-4">
                                                    <div className="text-sm font-bold text-white/90 text-center pb-2.5 mb-1 border-b border-white/10">
                                                        Subtitles
                                                    </div>
                                                    <div className="max-h-[220px] overflow-y-auto space-y-0.5 py-1">
                                                        {/* Off */}
                                                        <button
                                                            onClick={() => {
                                                                setCaptionsEnabled(false)
                                                            }}
                                                            className={`w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-white/10 flex items-center gap-2 transition-colors ${
                                                                !captionsEnabled
                                                                    ? 'text-white font-semibold bg-white/5'
                                                                    : 'text-white/75 hover:text-white'
                                                            }`}
                                                        >
                                                            {!captionsEnabled ? (
                                                                <Check className="w-3.5 h-3.5 text-white flex-shrink-0" />
                                                            ) : (
                                                                <span className="w-3.5 flex-shrink-0" />
                                                            )}
                                                            <span className="truncate">Off</span>
                                                        </button>

                                                        {/* Source / Original */}
                                                        {(captionLanguages.sourceExists || captionLanguages.existingLangs.includes('source')) && (
                                                            <button
                                                                onClick={() => {
                                                                    setSelectedCaptionLang('source')
                                                                    setCaptionsEnabled(true)
                                                                }}
                                                                className={`w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-white/10 flex items-center justify-between transition-colors ${
                                                                    captionsEnabled && selectedCaptionLang === 'source'
                                                                        ? 'text-white font-semibold bg-white/5'
                                                                        : 'text-white/75 hover:text-white'
                                                                }`}
                                                            >
                                                                <div className="flex items-center gap-2 truncate">
                                                                    {captionsEnabled && selectedCaptionLang === 'source' ? (
                                                                        <Check className="w-3.5 h-3.5 text-white flex-shrink-0" />
                                                                    ) : (
                                                                        <span className="w-3.5 flex-shrink-0" />
                                                                    )}
                                                                    <span className="truncate">Original</span>
                                                                </div>
                                                                <span className="text-[10px] text-white/60 bg-white/10 px-1.5 py-0.5 rounded ml-1 flex-shrink-0">
                                                                    {getLanguageLabel(courseData?.language || 'en')}
                                                                </span>
                                                            </button>
                                                        )}

                                                        {/* Pre-existing and Translated Subtitle Languages */}
                                                        {Array.from(new Set([
                                                            ...captionLanguages.existingLangs.filter(l => l !== 'source'),
                                                            ...captionLanguages.translatedLangs.filter(l => l !== 'source')
                                                        ])).map(lang => (
                                                            <button
                                                                key={`sub-${lang}`}
                                                                onClick={() => {
                                                                    setSelectedCaptionLang(lang)
                                                                    setCaptionsEnabled(true)
                                                                }}
                                                                className={`w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-white/10 flex items-center gap-2 transition-colors ${
                                                                    captionsEnabled && selectedCaptionLang === lang
                                                                        ? 'text-white font-semibold bg-white/5'
                                                                        : 'text-white/75 hover:text-white'
                                                                }`}
                                                            >
                                                                {captionsEnabled && selectedCaptionLang === lang ? (
                                                                    <Check className="w-3.5 h-3.5 text-white flex-shrink-0" />
                                                                ) : (
                                                                    <span className="w-3.5 flex-shrink-0" />
                                                                )}
                                                                <span className="truncate">{getLangLabel(lang)}</span>
                                                            </button>
                                                        ))}
                                                    </div>

                                                    {/* Subtitles actions: Translate & Upload */}
                                                    <div className="border-t border-white/10 mt-2 pt-2 space-y-1">
                                                        <button
                                                            onClick={() => {
                                                                setShowAudioSubMenu(false)
                                                                setShowTranslateModal(true)
                                                            }}
                                                            className="w-full px-2 py-1 text-xs text-left hover:bg-white/10 rounded-lg text-white/80 hover:text-white flex items-center gap-2 transition-colors"
                                                        >
                                                            <Captions className="w-3.5 h-3.5 opacity-75" />
                                                            <span>Transcript & Translate...</span>
                                                        </button>
                                                        <label className="w-full px-2 py-1 text-xs text-left hover:bg-white/10 rounded-lg text-white/80 hover:text-white cursor-pointer flex items-center gap-2 transition-colors">
                                                            <Upload className="w-3.5 h-3.5 opacity-75" />
                                                            <span>Upload captions...</span>
                                                            <input 
                                                                type="file" 
                                                                accept=".srt,.vtt,.ass,.lrc"
                                                                className="hidden"
                                                                ref={fileInputRef}
                                                                onChange={handleUploadCaptions}
                                                            />
                                                        </label>
                                                    </div>
                                                </div>

                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Streamlined Settings Gear Button */}
                            <div className="relative flex items-center">
                                <button
                                    onClick={() => {
                                        setShowSettingsMenu(!showSettingsMenu);
                                        setSettingsSubMenu('main');
                                        setShowAudioSubMenu(false);
                                    }}
                                    className={`tut-in-menu-trigger p-1.5 hover:bg-white/15 rounded-full transition-all ${showSettingsMenu ? 'text-[var(--primary-fg)]' : 'opacity-70 hover:opacity-100'}`}
                                    title="Settings"
                                >
                                    <Settings className={`w-4.5 h-4.5 transition-transform duration-300 ${showSettingsMenu ? 'rotate-45' : ''}`} />
                                </button>

                                {showSettingsMenu && (
                                    <div className="tut-in-menu-container absolute bottom-full right-0 mb-3 bg-[#141414]/95 backdrop-blur-xl text-white rounded-2xl py-2 min-w-[220px] shadow-2xl border border-white/10 z-50 animate-scale-in text-sm">
                                        {settingsSubMenu === 'main' && (
                                            <div className="flex flex-col py-1">
                                                {/* Playback Speed */}
                                                <button
                                                    onClick={() => setSettingsSubMenu('speed')}
                                                    className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-white/10 transition-colors"
                                                >
                                                    <span className="flex items-center gap-2 text-xs">
                                                        <Gauge className="w-4 h-4 opacity-75" /> Playback speed
                                                    </span>
                                                    <span className="text-xs text-white/50 flex items-center gap-1">
                                                        {playbackSpeed === 1 ? 'Normal' : `${playbackSpeed}x`}
                                                        <ChevronRight className="w-3 h-3 opacity-55" />
                                                    </span>
                                                </button>

                                                {/* Auto-play */}
                                                <div className="w-full px-4 py-2.5 flex items-center justify-between border-t border-white/5 mt-1 pt-2">
                                                    <span className="flex items-center gap-2 text-xs">
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
                                                            className={`w-full px-6 py-2 text-left hover:bg-white/10 flex items-center justify-between text-xs ${playbackSpeed === speed ? 'text-[var(--primary-fg)] font-bold bg-white/5' : ''}`}
                                                        >
                                                            <span>{speed === 1 ? 'Normal' : `${speed}x`}</span>
                                                            {playbackSpeed === speed && <Check className="w-3.5 h-3.5 text-[var(--primary-fg)]" />}
                                                        </button>
                                                    ))}
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
                course={courseData}
                chunkCount={captionChunks.length}
                onSuccess={(lang) => {
                    // Update state to select new language and force refresh
                    setSelectedCaptionLang(lang)
                    setCaptionsEnabled(true)
                    updateSettings({ captionLanguage: lang })
                    fetchCaptionLanguages(video?.id)
                    fetchCaptionChunks(video?.id, lang)
                    onVideoDataChange?.()
                    window.dispatchEvent(new CustomEvent('tutin:transcript-updated', {
                        detail: { videoId: video?.id, lang }
                    }))
                }}
            />

            <SmartCaptionsModal
                isOpen={!!smartCaptionData}
                onClose={() => setSmartCaptionData(null)}
                language={smartCaptionData?.language}
                languageName={smartCaptionData?.languageName}
                matches={smartCaptionData?.matches}
                onBatchImported={() => {
                    if (video?.id) {
                        fetchCaptionLanguages(video.id)
                        fetchCaptionChunks(video.id, selectedCaptionLang)
                    }
                    onVideoDataChange?.()
                }}
            />

            <DubModal
                isOpen={showDubModal}
                onClose={() => setShowDubModal(false)}
                video={video}
                course={courseData}
                onSuccess={(lang) => {
                    setDubLanguages(prev => Array.from(new Set([...prev, lang])))
                    setSelectedDubLang(lang)
                    fetchDubLanguages(video?.id)
                    onVideoDataChange?.()
                    window.dispatchEvent(new CustomEvent('tutin:dub-updated', {
                        detail: { videoId: video?.id, lang }
                    }))
                }}
            />

            {/* Audio element for dubbed audio playback */}
            <audio
                ref={dubAudioRef}
                preload="auto"
                onLoadedMetadata={(e) => {
                    if (videoRef.current) {
                        e.target.currentTime = videoRef.current.currentTime
                        e.target.playbackRate = videoRef.current.playbackRate || playbackSpeed || 1
                        e.target.volume = isMuted ? 0 : volume
                        e.target.muted = isMuted
                        if (!videoRef.current.paused) {
                            e.target.play().catch(() => {})
                        }
                    }
                }}
                onPlay={() => {
                    if (videoRef.current && selectedDubLang !== 'none') {
                        videoRef.current.muted = true
                    }
                }}
                onError={(e) => {
                    console.warn('[VideoPlayer] Dubbed audio load error:', e)
                    // If dubbing is disabled, restore original video volume
                    if (videoRef.current && selectedDubLang === 'none') {
                        videoRef.current.muted = isMuted
                        videoRef.current.volume = isMuted ? 0 : volume
                    }
                }}
            />
        </div>
    )
})

export default VideoPlayer
