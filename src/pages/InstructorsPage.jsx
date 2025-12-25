import { useState, useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Users, Search, BookOpen, Play, X, Clock } from 'lucide-react'
import { getAllCourses, getInstructorAvatarAsync, formatDuration } from '../utils/db'
import LoadingSpinner from '../components/common/LoadingSpinner'

function InstructorsPage() {
    const [courses, setCourses] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')
    const [searchParams, setSearchParams] = useSearchParams()
    const filterInstructor = searchParams.get('filter')
    const [instructorAvatars, setInstructorAvatars] = useState({})

    useEffect(() => {
        loadCourses()
    }, [])

    async function loadCourses() {
        try {
            setIsLoading(true)
            const allCourses = await getAllCourses()
            setCourses(allCourses)

            // Load avatars for all unique instructors from instructors store
            const uniqueInstructors = [...new Set(allCourses.map(c => c.instructor).filter(Boolean))]
            const avatars = {}
            await Promise.all(
                uniqueInstructors.map(async (name) => {
                    avatars[name] = await getInstructorAvatarAsync(name)
                })
            )
            setInstructorAvatars(avatars)
        } catch (err) {
            console.error('Failed to load courses:', err)
        } finally {
            setIsLoading(false)
        }
    }

    // Get unique instructors with their data
    const instructors = useMemo(() => {
        const instructorMap = new Map()

        courses.forEach(course => {
            if (!course.instructor) return

            if (!instructorMap.has(course.instructor)) {
                instructorMap.set(course.instructor, {
                    name: course.instructor,
                    avatar: instructorAvatars[course.instructor] || null,
                    courses: [],
                    totalVideos: 0,
                    completedVideos: 0
                })
            }

            const instructor = instructorMap.get(course.instructor)
            instructor.courses.push(course)
            instructor.totalVideos += course.totalVideos || 0
            instructor.completedVideos += course.completedVideos || 0
        })

        return Array.from(instructorMap.values())
            .filter(i => !searchQuery || i.name.toLowerCase().includes(searchQuery.toLowerCase()))
            .sort((a, b) => a.name.localeCompare(b.name))
    }, [courses, searchQuery, instructorAvatars])

    // Get selected instructor's courses
    const selectedInstructor = filterInstructor
        ? instructors.find(i => i.name === filterInstructor)
        : null

    const clearFilter = () => {
        setSearchParams({})
    }

    if (isLoading) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <LoadingSpinner message="Loading instructors..." />
            </div>
        )
    }

    return (
        <div className="py-6">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                    <Users className="w-7 h-7 text-blue-600 dark:text-white" />
                    Instructors
                </h1>
                <p className="text-gray-500 dark:text-neutral-400 mt-1">
                    {instructors.length} instructor{instructors.length !== 1 ? 's' : ''} across your courses
                </p>
            </div>

            {/* Active Filter Banner */}
            {filterInstructor && selectedInstructor && (
                <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-500/10 rounded-xl border border-blue-200 dark:border-blue-500/20 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        {selectedInstructor.avatar ? (
                            <img
                                src={selectedInstructor.avatar}
                                alt={selectedInstructor.name}
                                className="w-14 h-14 rounded-full object-cover ring-2 ring-blue-200 dark:ring-blue-500/30"
                            />
                        ) : (
                            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center ring-2 ring-blue-200 dark:ring-blue-500/30">
                                <span className="text-xl font-bold text-white">
                                    {selectedInstructor.name.charAt(0).toUpperCase()}
                                </span>
                            </div>
                        )}
                        <div>
                            <h2 className="font-semibold text-lg text-light-text-primary dark:text-dark-text-primary">
                                {selectedInstructor.name}
                            </h2>
                            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                                {selectedInstructor.courses.length} course{selectedInstructor.courses.length !== 1 ? 's' : ''} • {selectedInstructor.totalVideos} videos
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={clearFilter}
                        className="p-2 bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 rounded-lg transition-colors"
                        title="Clear filter"
                    >
                        <X className="w-5 h-5 text-gray-600 dark:text-white" />
                    </button>
                </div>
            )}

            {/* Show filtered courses if instructor selected */}
            {filterInstructor && selectedInstructor ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                    {selectedInstructor.courses.map(course => (
                        <Link
                            key={course.id}
                            to={`/course/${course.id}`}
                            className="group bg-white dark:bg-dark-surface rounded-xl overflow-hidden border border-gray-200 dark:border-dark-border hover:border-blue-400 dark:hover:border-neutral-500 transition-all hover:-translate-y-1"
                        >
                            {/* Thumbnail */}
                            <div className="aspect-video bg-gray-100 dark:bg-dark-bg relative overflow-hidden">
                                {course.thumbnailData ? (
                                    <img
                                        src={course.thumbnailData}
                                        alt={course.title}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <BookOpen className="w-12 h-12 text-gray-400 dark:text-neutral-600" />
                                    </div>
                                )}
                                {/* Progress overlay */}
                                {course.completionPercentage > 0 && (
                                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30">
                                        <div
                                            className="h-full bg-blue-600 dark:bg-white"
                                            style={{ width: `${course.completionPercentage}%` }}
                                        />
                                    </div>
                                )}
                                {/* Completion badge */}
                                <div className="absolute top-2 right-2 px-2 py-1 bg-black/60 backdrop-blur-sm rounded-md text-xs text-white font-medium">
                                    {Math.round(course.completionPercentage || 0)}%
                                </div>
                            </div>
                            {/* Info */}
                            <div className="p-4">
                                <h3 className="font-semibold text-gray-900 dark:text-white truncate group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                                    {course.title}
                                </h3>
                                <div className="flex items-center gap-3 mt-2 text-sm text-gray-500 dark:text-neutral-400">
                                    <span className="flex items-center gap-1">
                                        <Play className="w-3.5 h-3.5" />
                                        {course.totalVideos} videos
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <Clock className="w-3.5 h-3.5" />
                                        {formatDuration(course.totalDuration)}
                                    </span>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            ) : (
                <>
                    {/* Search */}
                    <div className="relative mb-8 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                        <input
                            type="text"
                            placeholder="Search instructors..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-10 py-2 rounded-full border border-gray-300 dark:border-white/10 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-neutral-400 focus:border-gray-400 dark:focus:border-white/20 outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0 transition-all"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-200 dark:hover:bg-white/10 rounded-full"
                            >
                                <X className="w-4 h-4 text-gray-500 dark:text-neutral-400" />
                            </button>
                        )}
                    </div>

                    {/* Instructors Grid */}
                    {instructors.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                            {instructors.map(instructor => {
                                const progressPercent = instructor.totalVideos > 0
                                    ? Math.round((instructor.completedVideos / instructor.totalVideos) * 100)
                                    : 0

                                return (
                                    <Link
                                        key={instructor.name}
                                        to={`/instructors?filter=${encodeURIComponent(instructor.name)}`}
                                        className="group bg-white dark:bg-dark-surface rounded-2xl p-6 border border-gray-200 dark:border-dark-border hover:border-blue-400 dark:hover:border-neutral-500 transition-all hover:-translate-y-1"
                                    >
                                        {/* Avatar */}
                                        <div className="flex justify-center mb-5">
                                            {instructor.avatar ? (
                                                <img
                                                    src={instructor.avatar}
                                                    alt={instructor.name}
                                                    className="w-20 h-20 rounded-full object-cover ring-4 ring-gray-100 dark:ring-dark-bg group-hover:ring-blue-100 dark:group-hover:ring-blue-500/20 transition-all"
                                                />
                                            ) : (
                                                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center ring-4 ring-gray-100 dark:ring-dark-bg group-hover:ring-blue-100 dark:group-hover:ring-blue-500/20 transition-all">
                                                    <span className="text-2xl font-bold text-white">
                                                        {instructor.name.charAt(0).toUpperCase()}
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Name */}
                                        <h3 className="text-lg font-semibold text-center text-gray-900 dark:text-white mb-3 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                                            {instructor.name}
                                        </h3>

                                        {/* Stats */}
                                        <div className="flex justify-center gap-4 text-sm text-gray-500 dark:text-neutral-400 mb-4">
                                            <span className="flex items-center gap-1.5">
                                                <BookOpen className="w-4 h-4" />
                                                {instructor.courses.length}
                                            </span>
                                            <span className="flex items-center gap-1.5">
                                                <Play className="w-4 h-4" />
                                                {instructor.totalVideos}
                                            </span>
                                        </div>

                                        {/* Progress */}
                                        {instructor.totalVideos > 0 && (
                                            <div className="mt-2">
                                                <div className="flex justify-between items-center text-xs mb-1.5">
                                                    <span className="text-gray-500 dark:text-neutral-400">
                                                        Progress
                                                    </span>
                                                    <span className="font-medium text-blue-600 dark:text-blue-400">{progressPercent}%</span>
                                                </div>
                                                <div className="h-1.5 bg-gray-100 dark:bg-dark-bg rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-gradient-to-r from-blue-500 to-blue-600 dark:from-blue-400 dark:to-blue-500 rounded-full transition-all"
                                                        style={{ width: `${progressPercent}%` }}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </Link>
                                )
                            })}
                        </div>
                    ) : (
                        <div className="text-center py-16">
                            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-dark-surface flex items-center justify-center">
                                <Users className="w-10 h-10 text-gray-400 dark:text-neutral-600" />
                            </div>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No instructors found</h2>
                            <p className="text-gray-500 dark:text-neutral-400">
                                {searchQuery ? 'Try a different search term' : 'Import courses to see instructors here'}
                            </p>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

export default InstructorsPage
