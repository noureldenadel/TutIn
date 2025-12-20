import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChevronLeft, Menu } from 'lucide-react'
import { getCourse, getModulesByCourse, getVideosByModule, updateCourse, getInstructorAvatar } from '../utils/db'
import { useSettings } from '../contexts/SettingsContext'
import LoadingSpinner from '../components/common/LoadingSpinner'
import VideoPlayer from '../components/player/VideoPlayer'
import PlaylistSidebar from '../components/player/PlaylistSidebar'
import InstructorProfileModal from '../components/course/InstructorProfileModal'

function CoursePlayerPage() {
    const { courseId } = useParams()
    const { settings } = useSettings()
    const [course, setCourse] = useState(null)
    const [modules, setModules] = useState([])
    const [currentVideo, setCurrentVideo] = useState(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState(null)
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [showInstructorModal, setShowInstructorModal] = useState(false)
    const [instructorAvatar, setInstructorAvatar] = useState(null)
    const videoRef = useRef(null)

    const sidebarOnLeft = settings.sidebarPosition === 'left'

    // Load course data
    useEffect(() => {
        loadCourseData()
    }, [courseId])

    // Load instructor avatar
    useEffect(() => {
        if (course?.instructor) {
            setInstructorAvatar(getInstructorAvatar(course.instructor))
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
            setModules(modulesWithVideos)

            // Set first video as current if none selected
            if (modulesWithVideos.length > 0 && modulesWithVideos[0].videos.length > 0) {
                // Find first unwatched video or last watched video
                let videoToPlay = null
                for (const module of modulesWithVideos) {
                    for (const video of module.videos) {
                        if (!video.isCompleted && !videoToPlay) {
                            videoToPlay = video
                            break
                        }
                    }
                    if (videoToPlay) break
                }
                // Fallback to first video
                if (!videoToPlay) {
                    videoToPlay = modulesWithVideos[0].videos[0]
                }
                setCurrentVideo(videoToPlay)
            }
        } catch (err) {
            console.error('Failed to load course:', err)
            setError('Failed to load course: ' + err.message)
        } finally {
            setIsLoading(false)
        }
    }

    function handleVideoSelect(video) {
        setCurrentVideo(video)
    }

    function handleVideoComplete(videoId) {
        // Refresh modules to update completion status
        loadCourseData()
    }

    function handleNextVideo() {
        if (!currentVideo || modules.length === 0) return

        // Find current video position
        for (let i = 0; i < modules.length; i++) {
            const module = modules[i]
            for (let j = 0; j < module.videos.length; j++) {
                if (module.videos[j].id === currentVideo.id) {
                    // Try next video in same module
                    if (j < module.videos.length - 1) {
                        setCurrentVideo(module.videos[j + 1])
                        return
                    }
                    // Try first video in next module
                    if (i < modules.length - 1 && modules[i + 1].videos.length > 0) {
                        setCurrentVideo(modules[i + 1].videos[0])
                        return
                    }
                }
            }
        }
    }

    if (isLoading) {
        return <LoadingSpinner message="Loading course..." />
    }

    if (error) {
        return (
            <div className="text-center py-16">
                <p className="text-error mb-4">{error}</p>
                <Link
                    to="/"
                    className="inline-flex items-center gap-2 text-primary hover:underline"
                >
                    <ChevronLeft className="w-4 h-4" />
                    Back to courses
                </Link>
            </div>
        )
    }

    return (
        <div className="animate-fade-in -mx-4 -my-6">
            {/* Course Header */}
            <div className="h-12 px-4 bg-light-surface dark:bg-dark-surface border-b border-light-border dark:border-dark-border flex items-center gap-4">
                <Link
                    to="/"
                    className="flex items-center gap-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-primary dark:hover:text-dark-text-primary transition-colors"
                >
                    <ChevronLeft className="w-4 h-4" />
                    <span className="text-sm">Home</span>
                </Link>
                <span className="text-light-border dark:text-dark-border">/</span>
                <h1 className="text-sm font-medium truncate flex-1">
                    {course?.title}
                </h1>
                <button
                    onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                    className="p-2 rounded hover:bg-light-bg dark:hover:bg-dark-bg transition-colors lg:hidden"
                    aria-label="Toggle sidebar"
                >
                    <Menu className="w-5 h-5" />
                </button>
            </div>

            {/* Main Content */}
            <div className={`flex h-[calc(100vh-64px-48px)] ${sidebarOnLeft ? 'flex-row-reverse' : ''}`}>
                {/* Video Player Area */}
                <div className={`flex-1 flex flex-col overflow-y-auto ${sidebarCollapsed ? '' : sidebarOnLeft ? 'lg:ml-[360px]' : 'lg:mr-[360px]'}`}>
                    {currentVideo ? (
                        <>
                            <div className="aspect-video bg-black sticky top-0 z-20">
                                <VideoPlayer
                                    ref={videoRef}
                                    video={currentVideo}
                                    courseId={courseId}
                                    onComplete={handleVideoComplete}
                                    onNext={handleNextVideo}
                                    onTimeUpdate={setCurrentTime}
                                />
                            </div>

                            {/* Video Info Section */}
                            <div className="p-6 space-y-6">
                                <div>
                                    <h2 className="text-2xl font-bold mb-2">{currentVideo.title}</h2>
                                    <h3 className="text-lg text-light-text-secondary dark:text-dark-text-secondary">
                                        {modules.find(m => m.id === currentVideo.moduleId)?.title}
                                    </h3>
                                </div>

                                <div
                                    className="flex items-center gap-4 pt-6 border-t border-light-border dark:border-dark-border cursor-pointer hover:opacity-80 transition-opacity"
                                    onClick={() => course?.instructor && setShowInstructorModal(true)}
                                    title={course?.instructor ? `View ${course.instructor}'s profile` : ''}
                                >
                                    <div className="w-12 h-12 rounded-full bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border flex items-center justify-center overflow-hidden">
                                        {instructorAvatar ? (
                                            <img src={instructorAvatar} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="text-lg font-bold text-primary">
                                                {course?.instructor ? course.instructor.charAt(0).toUpperCase() : 'I'}
                                            </span>
                                        )}
                                    </div>
                                    <div>
                                        <p className="font-semibold hover:text-primary transition-colors">{course?.instructor || 'Instructor'}</p>
                                        <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                                            Course Instructor
                                        </p>
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
                    onRefresh={loadCourseData}
                    courseId={courseId}
                    currentTime={currentTime}
                    onSeek={(time) => videoRef.current?.seekTo?.(time)}
                />
            </div>

            {/* Instructor Profile Modal */}
            {showInstructorModal && course?.instructor && (
                <InstructorProfileModal
                    instructor={course.instructor}
                    onClose={() => setShowInstructorModal(false)}
                    onAvatarChange={() => setInstructorAvatar(getInstructorAvatar(course.instructor))}
                />
            )}
        </div>
    )
}

export default CoursePlayerPage
