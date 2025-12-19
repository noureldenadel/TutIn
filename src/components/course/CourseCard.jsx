import { Link } from 'react-router-dom'
import { Play, Clock, Video, MoreVertical, Pencil, Trash2, RefreshCw } from 'lucide-react'
import { formatDuration, deleteCourse } from '../../utils/db'
import { useState } from 'react'

function CourseCard({ course, viewMode = 'grid', onRefresh, onEdit }) {
    const [showMenu, setShowMenu] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)

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
                className="flex items-center gap-4 p-4 bg-white dark:bg-dark-surface rounded-lg border border-light-border dark:border-dark-border hover:shadow-md transition-all group"
            >
                {/* Thumbnail */}
                <div className="w-40 h-24 bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden flex-shrink-0 relative">
                    {course.thumbnailData ? (
                        <img
                            src={course.thumbnailData}
                            alt={course.title}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center">
                            <Video className="w-10 h-10 text-gray-400" />
                        </div>
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Play className="w-10 h-10 text-white" fill="white" />
                    </div>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-light-text-primary dark:text-dark-text-primary truncate">
                        {course.title}
                    </h3>
                    <div className="flex items-center gap-4 text-sm text-light-text-secondary dark:text-dark-text-secondary mt-1">
                        <span className="flex items-center gap-1">
                            <Video className="w-4 h-4" />
                            {course.completedVideos}/{course.totalVideos} videos
                        </span>
                        <span className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {formattedDuration}
                        </span>
                    </div>
                    {/* Progress Bar */}
                    <div className="mt-2 progress-bar h-2">
                        <div
                            className="progress-bar-fill"
                            style={{ width: `${completionPercentage}%` }}
                        />
                    </div>
                </div>

                {/* Completion */}
                <div className="text-right flex-shrink-0">
                    <span className="text-2xl font-bold text-primary">
                        {Math.round(completionPercentage)}%
                    </span>
                    <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                        Complete
                    </p>
                </div>

                {/* Edit Button for List View */}
                <button
                    onClick={handleEdit}
                    className="p-2 hover:bg-light-surface dark:hover:bg-dark-bg rounded-lg transition-colors"
                    title="Edit course"
                >
                    <Pencil className="w-4 h-4 text-light-text-secondary dark:text-dark-text-secondary" />
                </button>
            </Link>
        )
    }

    // Grid view (default)
    return (
        <Link
            to={`/course/${course.id}`}
            className="group bg-white dark:bg-dark-surface rounded-lg border border-light-border dark:border-dark-border overflow-hidden hover:shadow-lg transition-all hover:-translate-y-1"
        >
            {/* Thumbnail */}
            <div className="aspect-video bg-gray-200 dark:bg-gray-700 relative overflow-hidden">
                {course.thumbnailData ? (
                    <img
                        src={course.thumbnailData}
                        alt={course.title}
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Video className="w-16 h-16 text-gray-400" />
                    </div>
                )}

                {/* Play overlay */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="w-16 h-16 bg-white/90 rounded-full flex items-center justify-center">
                        <Play className="w-8 h-8 text-primary ml-1" fill="currentColor" />
                    </div>
                </div>

                {/* Duration badge */}
                <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/80 text-white text-xs rounded">
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
                            className="p-2 bg-black/60 hover:bg-black/80 rounded-full text-white transition-colors"
                        >
                            <MoreVertical className="w-4 h-4" />
                        </button>

                        {showMenu && (
                            <div
                                className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-dark-surface rounded-lg shadow-lg border border-light-border dark:border-dark-border py-1 z-10"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <button
                                    className="w-full px-3 py-2 text-left text-sm hover:bg-light-surface dark:hover:bg-dark-bg flex items-center gap-2"
                                    onClick={handleEdit}
                                >
                                    <Pencil className="w-4 h-4" />
                                    Edit
                                </button>
                                <button
                                    className="w-full px-3 py-2 text-left text-sm hover:bg-light-surface dark:hover:bg-dark-bg flex items-center gap-2 text-error"
                                    onClick={handleDelete}
                                    disabled={isDeleting}
                                >
                                    <Trash2 className="w-4 h-4" />
                                    {isDeleting ? 'Deleting...' : 'Delete'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="p-4">
                <h3 className="font-semibold text-light-text-primary dark:text-dark-text-primary truncate mb-1">
                    {course.title}
                </h3>

                {/* Instructor */}
                {course.instructor && (
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center text-white text-xs font-medium">
                            {course.instructor.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary truncate">
                            {course.instructor}
                        </span>
                    </div>
                )}

                {/* Progress Bar */}
                <div className="progress-bar mb-2">
                    <div
                        className="progress-bar-fill"
                        style={{ width: `${completionPercentage}%` }}
                    />
                </div>

                {/* Stats */}
                <div className="flex items-center justify-between text-sm text-light-text-secondary dark:text-dark-text-secondary">
                    <span>{course.completedVideos}/{course.totalVideos} videos</span>
                    <span className="font-medium text-primary">{Math.round(completionPercentage)}%</span>
                </div>
            </div>
        </Link>
    )
}

export default CourseCard
