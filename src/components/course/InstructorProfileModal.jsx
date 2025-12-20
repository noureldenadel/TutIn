import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { X, Camera, BookOpen, Clock, Trash2 } from 'lucide-react'
import { getCoursesByInstructor, getInstructorAvatarAsync, setInstructorAvatar, removeInstructorAvatar, formatDuration } from '../../utils/db'

function InstructorProfileModal({ instructor, onClose, onAvatarChange }) {
    const [courses, setCourses] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [avatar, setAvatar] = useState(null)
    const fileInputRef = useRef(null)

    // Load instructor courses and avatar on mount
    useEffect(() => {
        if (instructor) {
            loadData()
        }
    }, [instructor])

    async function loadData() {
        setIsLoading(true)
        try {
            // Load courses
            const instructorCourses = await getCoursesByInstructor(instructor)
            setCourses(instructorCourses)

            // Load avatar (async from IndexedDB)
            const savedAvatar = await getInstructorAvatarAsync(instructor)
            setAvatar(savedAvatar)
        } catch (err) {
            console.error('Failed to load instructor data:', err)
        } finally {
            setIsLoading(false)
        }
    }

    function handleAvatarClick() {
        fileInputRef.current?.click()
    }

    async function handleAvatarChange(e) {
        const file = e.target.files?.[0]
        if (!file) return

        // Validate file type
        if (!file.type.startsWith('image/')) {
            alert('Please select an image file')
            return
        }

        // Validate file size (max 2MB)
        if (file.size > 2 * 1024 * 1024) {
            alert('Image must be less than 2MB')
            return
        }

        try {
            // Read file as base64
            const reader = new FileReader()
            reader.onload = async (event) => {
                const base64 = event.target?.result
                if (base64 && typeof base64 === 'string') {
                    // Save to IndexedDB
                    const success = await setInstructorAvatar(instructor, base64)
                    if (success) {
                        setAvatar(base64)
                        onAvatarChange?.()
                    }
                }
            }
            reader.readAsDataURL(file)
        } catch (err) {
            console.error('Failed to process avatar:', err)
            alert('Failed to update avatar')
        }
    }

    async function handleRemoveAvatar() {
        if (confirm('Remove instructor avatar?')) {
            await removeInstructorAvatar(instructor)
            setAvatar(null)
            onAvatarChange?.()
        }
    }

    // Calculate totals
    const totalCourses = courses.length
    const totalDuration = courses.reduce((sum, c) => sum + (c.totalDuration || 0), 0)
    const totalVideos = courses.reduce((sum, c) => sum + (c.totalVideos || 0), 0)

    if (!instructor) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
            <div
                className="bg-white dark:bg-dark-surface rounded-xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-hidden animate-scale-in"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="relative p-6 pb-4 border-b border-light-border dark:border-dark-border">
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-2 rounded-lg hover:bg-light-surface dark:hover:bg-dark-bg transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>

                    <div className="flex items-center gap-4">
                        {/* Avatar */}
                        <div className="relative group">
                            <div
                                className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center text-white text-2xl font-bold overflow-hidden cursor-pointer"
                                onClick={handleAvatarClick}
                            >
                                {avatar ? (
                                    <img src={avatar} alt={instructor} className="w-full h-full object-cover" />
                                ) : (
                                    instructor.charAt(0).toUpperCase()
                                )}
                            </div>
                            <div
                                className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                onClick={handleAvatarClick}
                            >
                                <Camera className="w-6 h-6 text-white" />
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleAvatarChange}
                            />
                        </div>

                        {/* Info */}
                        <div className="flex-1">
                            <h2 className="text-xl font-bold">{instructor}</h2>
                            <p className="text-light-text-secondary dark:text-dark-text-secondary text-sm">
                                Instructor
                            </p>
                            <div className="flex items-center gap-4 mt-2 text-sm text-light-text-secondary dark:text-dark-text-secondary">
                                <span className="flex items-center gap-1">
                                    <BookOpen className="w-4 h-4" />
                                    {totalCourses} courses
                                </span>
                                <span className="flex items-center gap-1">
                                    <Clock className="w-4 h-4" />
                                    {formatDuration(totalDuration)}
                                </span>
                            </div>
                        </div>

                        {/* Remove avatar button */}
                        {avatar && (
                            <button
                                onClick={handleRemoveAvatar}
                                className="p-2 text-light-text-secondary dark:text-dark-text-secondary hover:text-error transition-colors"
                                title="Remove avatar"
                            >
                                <Trash2 className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Courses List */}
                <div className="p-4 overflow-y-auto max-h-[50vh]">
                    <h3 className="font-medium mb-3">Courses by {instructor}</h3>

                    {isLoading ? (
                        <div className="text-center py-8 text-light-text-secondary dark:text-dark-text-secondary">
                            Loading courses...
                        </div>
                    ) : courses.length === 0 ? (
                        <div className="text-center py-8 text-light-text-secondary dark:text-dark-text-secondary">
                            No courses found
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {courses.map(course => (
                                <Link
                                    key={course.id}
                                    to={`/course/${course.id}`}
                                    onClick={onClose}
                                    className="flex items-center gap-3 p-3 rounded-lg border border-light-border dark:border-dark-border hover:bg-light-surface dark:hover:bg-dark-bg transition-colors"
                                >
                                    {/* Thumbnail */}
                                    <div className="w-16 h-12 rounded bg-light-surface dark:bg-dark-bg flex items-center justify-center overflow-hidden flex-shrink-0">
                                        {course.thumbnailData ? (
                                            <img src={course.thumbnailData} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <BookOpen className="w-6 h-6 text-light-text-secondary dark:text-dark-text-secondary" />
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-medium truncate">{course.title}</h4>
                                        <div className="flex items-center gap-2 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                                            <span>{course.totalVideos || 0} videos</span>
                                            <span>•</span>
                                            <span>{formatDuration(course.totalDuration || 0)}</span>
                                        </div>
                                    </div>

                                    {/* Progress */}
                                    <div className="text-right flex-shrink-0">
                                        <span className={`text-sm font-medium ${course.completionPercentage === 100 ? 'text-success' :
                                            course.completionPercentage > 0 ? 'text-primary' : ''
                                            }`}>
                                            {course.completionPercentage || 0}%
                                        </span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default InstructorProfileModal
