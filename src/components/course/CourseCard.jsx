import { Link } from 'react-router-dom'
import { Play, Clock, Video, MoreVertical, Pencil, Trash2, RefreshCw } from 'lucide-react'
import { formatDuration, deleteCourse, getInstructorAvatar } from '../../utils/db'
import { useState, useEffect } from 'react'
import InstructorProfileModal from './InstructorProfileModal'

function CourseCard({ course, viewMode = 'grid', onRefresh, onEdit }) {
    const [showMenu, setShowMenu] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [showInstructorModal, setShowInstructorModal] = useState(false)
    const [instructorAvatar, setInstructorAvatar] = useState(null)

    // Load instructor avatar
    useEffect(() => {
        if (course.instructor) {
            setInstructorAvatar(getInstructorAvatar(course.instructor))
        }
    }, [course.instructor])

    function handleInstructorClick(e) {
        e.preventDefault()
        e.stopPropagation()
        if (course.instructor) {
            setShowInstructorModal(true)
        }
    }

    function handleAvatarChange() {
        // Reload avatar after change
        if (course.instructor) {
            setInstructorAvatar(getInstructorAvatar(course.instructor))
        }
        onRefresh?.()
    }

    const completionPercentage = course.completionPercentage || 0
    const formattedDuration = formatDuration(course.totalDuration)

    async function handleDelete(e) {
        e.preventDefault()
        e.stopPropagation()

        if (!confirm(`Are you sure you want to delete "${course.title}"? This action cannot be undone.`)) {
            return
        }

        try {
            setIsDeleting(true)
            await deleteCourse(course.id)
            onRefresh?.()
        } catch (err) {
            console.error('Failed to delete course:', err)
            alert('Failed to delete course: ' + err.message)
        } finally {
            setIsDeleting(false)
            setShowMenu(false)
        }
    }

    function handleEdit(e) {
        e.preventDefault()
        e.stopPropagation()
        setShowMenu(false)
        onEdit?.(course)
    }

    if (viewMode === 'list') {
        return (
            <Link
                to={`/course/${course.id}`}
                className="flex items-center gap-4 p-4 glass rounded-2xl hover:bg-white/50 dark:hover:bg-white/5 transition-all group"
            >
                {/* Thumbnail */}
                <div className="w-40 h-24 bg-gray-200 dark:bg-neutral-900 rounded-lg overflow-hidden flex-shrink-0 relative group-hover:ring-1 group-hover:ring-primary/20 dark:group-hover:ring-white/20 transition-all">
                    {course.thumbnailData ? (
                        <img
                            src={course.thumbnailData}
                            alt={course.title}
                            className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center">
                            <Video className="w-10 h-10 text-gray-400 dark:text-neutral-600" />
                        </div>
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Play className="w-8 h-8 text-white" fill="white" />
                    </div>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 dark:text-white truncate text-lg tracking-tight">
                        {course.title}
                    </h3>
                    <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-neutral-400 mt-1">
                        <span className="flex items-center gap-1.5">
                            <Video className="w-4 h-4" />
                            {course.completedVideos}/{course.totalVideos}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <Clock className="w-4 h-4" />
                            {formattedDuration}
                        </span>
                    </div>
                    {/* Progress Bar */}
                    <div className="mt-3 progress-bar h-1.5 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-primary dark:bg-white rounded-full shadow-sm dark:shadow-[0_0_10px_rgba(255,255,255,0.5)] transition-all duration-300"
                            style={{ width: `${completionPercentage}%` }}
                        />
                    </div>
                </div>

                {/* Completion */}
                <div className="text-right flex-shrink-0">
                    <span className="text-xl font-bold text-primary dark:text-white">
                        {Math.round(completionPercentage)}%
                    </span>
                </div>

                {/* Edit Button for List View */}
                <button
                    onClick={handleEdit}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-full transition-colors text-gray-500 dark:text-neutral-400 hover:text-gray-900 dark:hover:text-white"
                    title="Edit course"
                >
                    <Pencil className="w-4 h-4" />
                </button>
            </Link>
        )
    }

    // Grid view (default)
    return (
        <>
            <Link
                to={`/course/${course.id}`}
                className="group glass rounded-2xl overflow-hidden hover:shadow-xl dark:hover:shadow-[0_0_30px_rgba(255,255,255,0.05)] transition-all duration-500 hover:-translate-y-1 relative"
            >
                {/* Thumbnail */}
                <div className="aspect-video bg-gray-200 dark:bg-neutral-900 relative overflow-hidden">
                    {course.thumbnailData ? (
                        <img
                            src={course.thumbnailData}
                            alt={course.title}
                            className="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center">
                            <Video className="w-16 h-16 text-gray-400 dark:text-neutral-700" />
                        </div>
                    )}

                    {/* Gradient Overlay for Text Readability (Dark mode only or subtle in light) */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 dark:opacity-60 group-hover:opacity-40 dark:group-hover:opacity-80 transition-opacity" />

                    {/* Play overlay */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 scale-90 group-hover:scale-100">
                        <div className="w-14 h-14 bg-white/90 dark:bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20 shadow-2xl">
                            <Play className="w-6 h-6 text-primary dark:text-white ml-1" fill="currentColor" />
                        </div>
                    </div>

                    {/* Duration badge */}
                    <div className="absolute bottom-3 right-3 px-2 py-1 bg-black/70 backdrop-blur-md text-white text-[10px] font-medium rounded-md border border-white/10">
                        {formattedDuration}
                    </div>

                    {/* Menu button */}
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="relative">
                            <button
                                onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    setShowMenu(!showMenu)
                                }}
                                className="p-2 bg-white/90 dark:bg-black/40 backdrop-blur-md hover:bg-white dark:hover:bg-black/60 rounded-full text-gray-800 dark:text-white transition-colors border border-gray-200 dark:border-white/10 shadow-sm"
                            >
                                <MoreVertical className="w-4 h-4" />
                            </button>

                            {showMenu && (
                                <div
                                    className="absolute right-0 top-full mt-1 w-40 glass rounded-lg shadow-2xl border border-gray-100 dark:border-white/10 py-1 z-20"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <button
                                        className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-neutral-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 flex items-center gap-2"
                                        onClick={handleEdit}
                                    >
                                        <Pencil className="w-3 h-3" />
                                        Edit
                                    </button>
                                    <button
                                        className="w-full px-3 py-2 text-left text-sm text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 flex items-center gap-2"
                                        onClick={handleDelete}
                                        disabled={isDeleting}
                                    >
                                        <Trash2 className="w-3 h-3" />
                                        {isDeleting ? 'Deleting...' : 'Delete'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="p-5 flex flex-col h-full relative z-10">
                    <h3 className="font-semibold text-gray-900 dark:text-white truncate mb-1 text-lg tracking-tight group-hover:text-primary transition-colors">
                        {course.title}
                    </h3>

                    {/* Instructor */}
                    {course.instructor && (
                        <div
                            className="flex items-center gap-2 mb-4 cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={handleInstructorClick}
                            title={`View ${course.instructor}'s profile`}
                        >
                            <div className="w-5 h-5 rounded-full bg-gray-100 dark:bg-neutral-800 border border-gray-200 dark:border-white/10 flex items-center justify-center text-gray-600 dark:text-white text-[10px] font-medium overflow-hidden">
                                {instructorAvatar ? (
                                    <img src={instructorAvatar} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    course.instructor.charAt(0).toUpperCase()
                                )}
                            </div>
                            <span className="text-xs text-gray-500 dark:text-neutral-400 truncate hover:text-primary dark:hover:text-white transition-colors">
                                {course.instructor}
                            </span>
                        </div>
                    )}

                    {/* Progress Bar */}
                    <div className="progress-bar mb-3 h-1 bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-primary dark:bg-white shadow-sm dark:shadow-[0_0_8px_rgba(255,255,255,0.5)] rounded-full transition-all duration-300"
                            style={{ width: `${completionPercentage}%` }}
                        />
                    </div>

                    {/* Stats */}
                    <div className="flex items-center justify-between text-xs text-gray-500 dark:text-neutral-500 font-medium">
                        <span>{course.completedVideos} / {course.totalVideos} videos</span>
                        <span className="text-primary dark:text-white">{Math.round(completionPercentage)}%</span>
                    </div>
                </div>
            </Link>

            {/* Instructor Profile Modal */}
            {
                showInstructorModal && (
                    <InstructorProfileModal
                        instructor={course.instructor}
                        onClose={() => setShowInstructorModal(false)}
                        onAvatarChange={handleAvatarChange}
                    />
                )
            }
        </>
    )
}

export default CourseCard
