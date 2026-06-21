import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, Menu } from 'lucide-react'
import { getCourse, getModulesByCourse, getVideosByModule, updateCourse, getInstructorAvatarAsync, buildModuleTree } from '../utils/db'
import { useSettings } from '../contexts/SettingsContext'
import LoadingSpinner from '../components/common/LoadingSpinner'
import VideoPlayer from '../components/player/VideoPlayer'
import PlaylistSidebar from '../components/player/PlaylistSidebar'
function findModulePath(modules, targetModuleId) {
    if (!modules || !targetModuleId) return []

    for (const mod of modules) {
        if (mod.id === targetModuleId) {
            return [mod]
        }
        if (mod.subModules && mod.subModules.length > 0) {
            const path = findModulePath(mod.subModules, targetModuleId)
            if (path.length > 0) {
                return [mod, ...path]
            }
        }
    }
    return []
}

function CoursePlayerPage() {
    const { courseId } = useParams()
    const navigate = useNavigate()
    const { settings } = useSettings()
    const [course, setCourse] = useState(null)
    const [modules, setModules] = useState([])
    const [currentVideo, setCurrentVideo] = useState(null)
    const [autoPlay, setAutoPlay] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState(null)
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.innerWidth < 1024)
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        const saved = localStorage.getItem('sidebarPanelWidth')
        return saved ? Math.max(280, Math.min(600, parseInt(saved, 10))) : 360
    })
    const [currentTime, setCurrentTime] = useState(0)
    const [instructorAvatar, setInstructorAvatar] = useState(null)
    const videoRef = useRef(null)
    const ambientCanvasRef = useRef(null)

    // ── Adaptive player sizing (YouTube-style JS-driven height) ──────────────
    // videoAspect: actual pixel dimensions reported by VideoPlayer after load.
    // Falls back to 16:9 (correct for YouTube/Drive iframes, which can't be
    // read cross-origin; local file videos report their real ratio).
    const [videoAspect, setVideoAspect] = useState({ w: 16, h: 9 })
    // playerWrapperEl: callback ref — needed because the wrapper is conditionally
    // rendered (only when currentVideo exists), so a regular useRef would miss mount.
    const [playerWrapperEl, setPlayerWrapperEl] = useState(null)
    const [playerWrapperWidth, setPlayerWrapperWidth] = useState(0)
    const [windowHeight, setWindowHeight] = useState(window.innerHeight)

    // Keep sidebar width in sync so primary column can compute padding-right
    const handleSidebarWidthChange = useCallback((w) => setSidebarWidth(w), [])

    // ResizeObserver on the player wrapper — fires automatically when:
    //  • sidebar opens / closes  (paddingRight on primary column changes)
    //  • user drags sidebar resize handle
    //  • browser window is resized
    useEffect(() => {
        if (!playerWrapperEl) return
        const ro = new ResizeObserver(entries => {
            if (entries[0]) setPlayerWrapperWidth(entries[0].contentRect.width)
        })
        ro.observe(playerWrapperEl)
        return () => ro.disconnect()
    }, [playerWrapperEl])

    // Track window height for the viewport-height cap on the player
    useEffect(() => {
        const handler = () => setWindowHeight(window.innerHeight)
        window.addEventListener('resize', handler)
        return () => window.removeEventListener('resize', handler)
    }, [])

    // Compute player height exactly like YouTube:
    //   height = wrapperWidth × (videoHeight / videoWidth),  capped at (100vh − 136px)
    // Falls back to a 16:9 estimate based on the current viewport if not yet measured.
    const playerHeight = useMemo(() => {
        const w = playerWrapperWidth > 0
            ? playerWrapperWidth
            : Math.max(0, window.innerWidth - (sidebarCollapsed ? 32 : sidebarWidth + 32))
        const natural = Math.round(w * videoAspect.h / videoAspect.w)
        return Math.min(natural, windowHeight - 136)
    }, [playerWrapperWidth, windowHeight, videoAspect, sidebarCollapsed, sidebarWidth])

    const sidebarOnLeft = false // Default to right side for video playlist

    // Load course data (reload when progress calculation mode changes)
    useEffect(() => {
        loadCourseData()
    }, [courseId])

    // Refresh only course progress when calculation mode changes (don't interrupt video)
    const prevProgressModeRef = useRef(settings.progressCalculationMode)
    useEffect(() => {
        // Skip on initial mount, only respond to actual changes
        if (prevProgressModeRef.current !== settings.progressCalculationMode) {
            prevProgressModeRef.current = settings.progressCalculationMode
            // Wait for recalculation to complete in Settings, then refresh
            // Small delay ensures SQLite has been updated by recalculateAllCoursesProgress
            const timer = setTimeout(() => {
                refreshCourseProgressOnly()
            }, 500)
            return () => clearTimeout(timer)
        }
    }, [settings.progressCalculationMode])

    // Lightweight refresh - only updates course progress without affecting video
    async function refreshCourseProgressOnly() {
        try {
            const courseData = await getCourse(courseId)
            if (courseData) {
                setCourse(courseData)
            }
        } catch (err) {
            console.error('Failed to refresh course progress:', err)
        }
    }

    // Update document title when course loads; reset on unmount
    useEffect(() => {
        if (course?.title) {
            document.title = course.title
        }
        return () => {
            document.title = 'TutIn'
        }
    }, [course?.title])

    // Load instructor avatar
    useEffect(() => {
        if (course?.instructor) {
            getInstructorAvatarAsync(course.instructor).then(avatar => {
                setInstructorAvatar(avatar)
            })
        }
    }, [course?.instructor])

    async function loadCourseData() {
        try {
            setIsLoading(true)

            // Get course
            const courseData = await getCourse(courseId)
            if (!courseData) {
                setError('Course not found')
                return
            }
            setCourse(courseData)

            // Update last accessed
            await updateCourse(courseId, { lastAccessed: new Date().toISOString() })

            // Get modules with videos
            const modulesData = await getModulesByCourse(courseId)
            const modulesWithVideos = await Promise.all(
                modulesData.map(async (module) => {
                    const videos = await getVideosByModule(module.id)
                    return { ...module, videos }
                })
            )
            setModules(buildModuleTree(modulesWithVideos))

            // Only set first video if no video is currently selected
            if (!currentVideo && modulesWithVideos.length > 0) {
                let videoToPlay = null

                // Get a flat list of all videos to easily find the next one
                const allVideos = []
                for (const module of modulesWithVideos) {
                    if (module.videos?.length > 0) {
                        allVideos.push(...module.videos)
                    }
                }

                if (allVideos.length > 0) {
                    // Find the most recently watched video
                    let mostRecentVideo = null
                    for (const video of allVideos) {
                        if (video.lastWatchedAt) {
                            if (!mostRecentVideo || new Date(video.lastWatchedAt) > new Date(mostRecentVideo.lastWatchedAt)) {
                                mostRecentVideo = video
                            }
                        }
                    }

                    if (mostRecentVideo) {
                        // If it's in progress, resume it
                        if (!mostRecentVideo.isCompleted && (mostRecentVideo.watchProgress || 0) < 0.95) {
                            videoToPlay = mostRecentVideo
                        } else {
                            // If it's completed, play the next video in the course
                            const currentIndex = allVideos.findIndex(v => v.id === mostRecentVideo.id)
                            if (currentIndex !== -1 && currentIndex < allVideos.length - 1) {
                                videoToPlay = allVideos[currentIndex + 1]
                            }
                        }
                    }

                    // Fallback to first unwatched video
                    if (!videoToPlay) {
                        videoToPlay = allVideos.find(v => !v.isCompleted)
                    }

                    // Final fallback to the very first video
                    if (!videoToPlay) {
                        videoToPlay = allVideos[0]
                    }
                }

                if (videoToPlay) {
                    setCurrentVideo(videoToPlay)
                    setAutoPlay(false) // Don't autoplay on initial load/reload
                }
            }
        } catch (err) {
            console.error('Failed to load course:', err)
            setError('Failed to load course: ' + err.message)
        } finally {
            setIsLoading(false)
        }
    }

    function handleVideoSelect(video) {
        setAutoPlay(true) // Autoplay when manually selecting from playlist
        setCurrentVideo(video)
    }

    // Lightweight refresh - only updates modules/videos data without reloading video player
    async function refreshModulesOnly() {
        try {
            // Get updated modules with videos
            const modulesData = await getModulesByCourse(courseId)
            const modulesWithVideos = await Promise.all(
                modulesData.map(async (module) => {
                    const videos = await getVideosByModule(module.id)
                    return { ...module, videos }
                })
            )
            setModules(buildModuleTree(modulesWithVideos))

            // Update course data (for progress stats) without affecting loading state
            const courseData = await getCourse(courseId)
            if (courseData) {
                setCourse(courseData)
            }

            // Update currentVideo with fresh data if it exists
            if (currentVideo) {
                for (const module of modulesWithVideos) {
                    const updatedVideo = module.videos.find(v => v.id === currentVideo.id)
                    if (updatedVideo) {
                        setCurrentVideo(updatedVideo)
                        break
                    }
                }
            }
        } catch (err) {
            console.error('Failed to refresh modules:', err)
        }
    }

    // Refresh only the current video's data (used after AI transcription)
    async function refreshCurrentVideoOnly() {
        if (!currentVideo) return
        try {
            const { getVideo } = await import('../utils/db')
            const updatedVideo = await getVideo(currentVideo.id)
            if (updatedVideo) {
                setCurrentVideo(prev => ({ ...prev, ...updatedVideo }))
            }
        } catch (err) {
            console.error('Failed to refresh video data:', err)
        }
    }

    // Auto-fetch YouTube transcripts
    useEffect(() => {
        if (!currentVideo) return
        const isYouTube = currentVideo.youtubeId ||
            (currentVideo.url && (currentVideo.url.includes('youtube.com') || currentVideo.url.includes('youtu.be')))

        if (isYouTube && !currentVideo.hasTranscript) {
            const videoIdOrUrl = currentVideo.youtubeId || currentVideo.url
            import('../utils/api').then(({ fetchYoutubeTranscript, put }) => {
                fetchYoutubeTranscript(videoIdOrUrl)
                    .then(async (data) => {
                        if (data.chunks && data.chunks.length > 0) {
                            await put(`/api/transcripts/${currentVideo.id}`, { chunks: data.chunks })
                            refreshCurrentVideoOnly()
                        }
                    })
                    .catch(err => console.log('Notice: Could not auto-fetch YouTube transcript:', err.message))
            })
        }
    }, [currentVideo?.id, currentVideo?.hasTranscript])

    function handleVideoComplete(videoId) {
        // Lightweight refresh - only updates sidebar, doesn't reload video player
        refreshModulesOnly()
    }

    function handleNextVideo() {
        if (!currentVideo || modules.length === 0) return

        // Get a flat list of all videos in the course for easy navigation
        function getAllVideosFlat(mods) {
            const list = []
            for (const mod of mods) {
                list.push(...(mod.videos || []))
                if (mod.subModules?.length > 0) {
                    list.push(...getAllVideosFlat(mod.subModules))
                }
            }
            return list
        }

        const allVideos = getAllVideosFlat(modules)
        const currentIndex = allVideos.findIndex(v => v.id === currentVideo.id)

        if (currentIndex !== -1 && currentIndex < allVideos.length - 1) {
            setAutoPlay(true)
            setCurrentVideo(allVideos[currentIndex + 1])
        }
    }

    function handlePreviousVideo() {
        if (!currentVideo || modules.length === 0) return

        function getAllVideosFlat(mods) {
            const list = []
            for (const mod of mods) {
                list.push(...(mod.videos || []))
                if (mod.subModules?.length > 0) {
                    list.push(...getAllVideosFlat(mod.subModules))
                }
            }
            return list
        }

        const allVideos = getAllVideosFlat(modules)
        const currentIndex = allVideos.findIndex(v => v.id === currentVideo.id)

        if (currentIndex > 0) {
            setAutoPlay(true)
            setCurrentVideo(allVideos[currentIndex - 1])
        }
    }

    // Ambient Mode Effect
    const innerAmbientCanvasRef = useRef(null)

    useEffect(() => {
        let animationFrameId
        let originalWidth = 0
        let originalHeight = 0

        const drawAmbient = () => {
            const canvas = ambientCanvasRef.current
            const video = videoRef.current?.getInternalVideo?.()

            // Note: YouTube/Drive iframes will be skipped as they don't have nodeName === 'VIDEO'
            // We draw even if paused so that the glow stays when video is paused
            if (canvas && video && video.nodeName === 'VIDEO' && video.readyState >= 2) {
                const ctx = canvas.getContext('2d')

                // Set low resolution canvas but maintain aspect ratio for performance
                if (video.videoWidth > 0 && video.videoHeight > 0 && (originalWidth !== video.videoWidth || originalHeight !== video.videoHeight)) {
                    originalWidth = video.videoWidth
                    originalHeight = video.videoHeight

                    // Cap at ~64x36 for extreme blur performance
                    const ratio = originalWidth / originalHeight
                    canvas.height = 36
                    canvas.width = Math.floor(36 * ratio)
                }

                if (canvas.width > 0 && canvas.height > 0) {
                    try {
                        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

                        // Duplicate to inner canvas for letterboxes
                        if (innerAmbientCanvasRef.current) {
                            const innerCtx = innerAmbientCanvasRef.current.getContext('2d')
                            if (innerAmbientCanvasRef.current.width !== canvas.width) {
                                innerAmbientCanvasRef.current.width = canvas.width
                                innerAmbientCanvasRef.current.height = canvas.height
                            }
                            innerCtx.drawImage(canvas, 0, 0)
                        }
                    } catch (err) {
                        // Ignore cross-origin errors if any
                    }
                }
            }

            animationFrameId = requestAnimationFrame(drawAmbient)
        }

        drawAmbient()

        return () => {
            if (animationFrameId) cancelAnimationFrame(animationFrameId)
        }
    }, [])

    if (isLoading) {
        return <LoadingSpinner message="Loading course..." />
    }

    if (error) {
        return (
            <div className="text-center py-16">
                <p className="text-error mb-4">{error}</p>
                <Link
                    to="/"
                    className="inline-flex items-center gap-2 text-primary-fg hover:underline"
                >
                    <ChevronLeft className="w-4 h-4" />
                    Back to courses
                </Link>
            </div>
        )
    }

    return (
        <div className="animate-fade-in -mx-4 -my-6 relative overflow-hidden">
            {/* Ambient Mode Background Wrapper */}
            <div className="absolute inset-0 z-0 pointer-events-none opacity-10 dark:opacity-10 transition-opacity duration-1000">
                <canvas
                    ref={ambientCanvasRef}
                    className="absolute top-1/2 left-1/2 w-[110%] h-[110%] object-cover"
                    style={{
                        filter: 'blur(90px) saturate(150%)',
                        transform: 'translate(-50%, -50%) scale(1.05)'
                    }}
                />
                {/* Edge Fading Overlays */}
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-light-bg dark:to-dark-bg" />
            </div>

            {/* Main Content */}
            <div className={`relative z-10 flex h-[calc(100vh-64px)] ${sidebarOnLeft ? 'flex-row-reverse' : ''}`}>
                {/* Video Player Area — padding-right tracks sidebar width exactly */}
                <div
                    className="flex-1 flex flex-col overflow-y-auto min-w-0"
                    style={{
                        paddingRight: sidebarCollapsed ? 0 : sidebarWidth,
                        transition: 'padding-right 0.3s ease'
                    }}
                >
                    {currentVideo ? (
                        <>
                            {/* Player wrapper */}
                            <div
                                ref={setPlayerWrapperEl}
                                className="bg-transparent relative sticky top-0 z-20 mx-4 mt-4 rounded-xl overflow-hidden"
                                style={{ height: playerHeight }}
                            >
                                {/* Inner Ambient for Letterboxes */}
                                <div className="absolute inset-0 z-0 pointer-events-none transition-opacity duration-1000">
                                    <canvas
                                        ref={innerAmbientCanvasRef}
                                        className="w-full h-full object-cover"
                                        style={{
                                            filter: 'blur(30px) saturate(200%)',
                                            transform: 'scale(1.05)',
                                            opacity: 0.05
                                        }}
                                    />
                                </div>

                                <div className="relative z-10 w-full h-full">
                                    <VideoPlayer
                                        ref={videoRef}
                                        video={currentVideo}
                                        courseId={courseId}
                                        onComplete={handleVideoComplete}
                                        onNext={handleNextVideo}
                                        onPrevious={handlePreviousVideo}
                                        autoPlay={autoPlay}
                                        onTimeUpdate={setCurrentTime}
                                        onAspectRatioChange={(w, h) => setVideoAspect({ w, h })}
                                    />
                                </div>
                            </div>

                            {/* Video Info Section */}
                            <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
                                <div>
                                    {course?.title && (
                                        <div className="flex items-center flex-wrap gap-1.5 text-xs font-semibold text-primary-fg dark:text-neutral-400 uppercase tracking-wider mb-2 select-none">
                                            <span className="truncate max-w-[200px] sm:max-w-[300px]" title={course.title}>
                                                {course.title}
                                            </span>
                                            {findModulePath(modules, currentVideo.moduleId).map(mod => (
                                                <span key={mod.id} className="flex items-center gap-1.5">
                                                    <span className="text-light-text-secondary dark:text-dark-text-secondary font-normal">/</span>
                                                    <span
                                                        className="text-light-text-secondary dark:text-dark-text-secondary font-medium truncate max-w-[150px] sm:max-w-[250px]"
                                                        title={mod.title}
                                                    >
                                                        {mod.title}
                                                    </span>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    <h2 className="text-lg sm:text-2xl font-bold mb-2">{currentVideo.title}</h2>
                                </div>

                                <div className="pt-6 border-t border-light-border dark:border-dark-border">
                                    <div
                                        className="inline-flex items-center gap-4 cursor-pointer hover:opacity-80 transition-opacity"
                                        onClick={() => course?.instructor && navigate(`/instructors?filter=${encodeURIComponent(course.instructor)}`)}
                                        title={course?.instructor ? `View ${course.instructor}'s profile` : ''}
                                    >
                                        <div className="w-12 h-12 rounded-full bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border flex items-center justify-center overflow-hidden flex-shrink-0">
                                            {instructorAvatar ? (
                                                <img src={instructorAvatar} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <span className="text-lg font-bold text-primary-fg">
                                                    {course?.instructor ? course.instructor.charAt(0).toUpperCase() : 'I'}
                                                </span>
                                            )}
                                        </div>
                                        <div>
                                            <p className="font-semibold hover:text-gray-700 dark:hover:text-white transition-colors">{course?.instructor || 'Instructor'}</p>
                                            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                                                Course Instructor
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center bg-black text-white">
                            <p>No video selected</p>
                        </div>
                    )}
                </div>

                {/* Playlist Sidebar */}
                <PlaylistSidebar
                    course={course}
                    modules={modules}
                    currentVideo={currentVideo}
                    onVideoSelect={handleVideoSelect}
                    isCollapsed={sidebarCollapsed}
                    onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
                    onRefresh={refreshModulesOnly}
                    onVideoDataChange={refreshCurrentVideoOnly}
                    courseId={courseId}
                    currentTime={currentTime}
                    onSeek={(time) => videoRef.current?.seekTo?.(time)}
                    onWidthChange={handleSidebarWidthChange}
                />
            </div>

        </div>
    )
}

export default CoursePlayerPage
