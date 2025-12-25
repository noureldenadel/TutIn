import { useState, useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Users, Search, BookOpen, Play, X } from 'lucide-react'
import { getAllCourses, getInstructorAvatarAsync } from '../utils/db'
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
                <h1 className="text-2xl font-bold text-light-text-primary dark:text-dark-text-primary flex items-center gap-3">
                    <Users className="w-7 h-7 text-primary" />
                    Instructors
                </h1>
                <p className="text-light-text-secondary dark:text-dark-text-secondary mt-1">
                    {instructors.length} instructor{instructors.length !== 1 ? 's' : ''} across your courses
                </p>
            </div>

            {/* Active Filter Banner */}
            {filterInstructor && selectedInstructor && (
                <div className="mb-6 p-4 bg-primary/10 rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {selectedInstructor.avatar ? (
                            <img
                                src={selectedInstructor.avatar}
                                alt={selectedInstructor.name}
                                className="w-12 h-12 rounded-full object-cover"
                            />
                        ) : (
                            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                                <span className="text-lg font-bold text-primary">
                                    {selectedInstructor.name.charAt(0).toUpperCase()}
                                </span>
                            </div>
                        )}
                        <div>
                            <h2 className="font-semibold text-light-text-primary dark:text-dark-text-primary">
                                {selectedInstructor.name}
                            </h2>
                            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                                {selectedInstructor.courses.length} course{selectedInstructor.courses.length !== 1 ? 's' : ''}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={clearFilter}
                        className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                        title="Clear filter"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
            )}

            {/* Show filtered courses if instructor selected */}
            {filterInstructor && selectedInstructor ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {selectedInstructor.courses.map(course => (
                        <Link
                            key={course.id}
                            to={`/course/${course.id}`}
                            className="bg-white dark:bg-dark-surface rounded-lg overflow-hidden border border-light-border dark:border-dark-border hover:shadow-lg transition-shadow"
                        >
                            {/* Thumbnail */}
                            <div className="aspect-video bg-light-surface dark:bg-dark-bg relative">
                                {course.thumbnailData ? (
                                    <img
                                        src={course.thumbnailData}
                                        alt={course.title}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <BookOpen className="w-12 h-12 text-light-text-secondary dark:text-dark-text-secondary opacity-50" />
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
                            </div>
                            {/* Info */}
                            <div className="p-4">
                                <h3 className="font-medium truncate">{course.title}</h3>
                                <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mt-1">
                                    {course.totalVideos} videos • {Math.round(course.completionPercentage || 0)}% complete
                                </p>
                            </div>
                        </Link>
                    ))}
                </div>
            ) : (
                <>
                    {/* Search */}
                    <div className="relative mb-6">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-light-text-secondary dark:text-dark-text-secondary" />
                        <input
                            type="text"
                            placeholder="Search instructors..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full max-w-md pl-10 pr-4 py-2.5 rounded-lg border border-light-border dark:border-dark-border bg-white dark:bg-dark-surface focus:ring-2 focus:ring-primary outline-none"
                        />
                    </div>

                    {/* Instructors Grid */}
                    {instructors.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {instructors.map(instructor => (
                                <Link
                                    key={instructor.name}
                                    to={`/instructors?filter=${encodeURIComponent(instructor.name)}`}
                                    className="bg-white dark:bg-dark-surface rounded-xl p-6 border border-light-border dark:border-dark-border hover:shadow-lg hover:border-primary/50 transition-all group"
                                >
                                    {/* Avatar */}
                                    <div className="flex justify-center mb-4">
                                        {instructor.avatar ? (
                                            <img
                                                src={instructor.avatar}
                                                alt={instructor.name}
                                                className="w-24 h-24 rounded-full object-cover ring-4 ring-light-surface dark:ring-dark-bg group-hover:ring-primary/20 transition-all"
                                            />
                                        ) : (
                                            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center ring-4 ring-light-surface dark:ring-dark-bg group-hover:ring-primary/20 transition-all">
                                                <span className="text-3xl font-bold text-white">
                                                    {instructor.name.charAt(0).toUpperCase()}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Name */}
                                    <h3 className="text-lg font-semibold text-center text-light-text-primary dark:text-dark-text-primary mb-2">
                                        {instructor.name}
                                    </h3>

                                    {/* Stats */}
                                    <div className="flex justify-center gap-4 text-sm text-light-text-secondary dark:text-dark-text-secondary">
                                        <span className="flex items-center gap-1">
                                            <BookOpen className="w-4 h-4" />
                                            {instructor.courses.length} courses
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <Play className="w-4 h-4" />
                                            {instructor.totalVideos} videos
                                        </span>
                                    </div>

                                    {/* Progress */}
                                    {instructor.totalVideos > 0 && (
                                        <div className="mt-4">
                                            <div className="flex justify-between text-xs text-light-text-secondary dark:text-dark-text-secondary mb-1">
                                                <span>Progress</span>
                                                <span>{Math.round((instructor.completedVideos / instructor.totalVideos) * 100)}%</span>
                                            </div>
                                            <div className="h-2 bg-light-surface dark:bg-dark-bg rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-blue-600 dark:bg-white rounded-full transition-all"
                                                    style={{ width: `${(instructor.completedVideos / instructor.totalVideos) * 100}%` }}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-16">
                            <Users className="w-16 h-16 mx-auto mb-4 text-light-text-secondary dark:text-dark-text-secondary opacity-50" />
                            <h2 className="text-xl font-semibold mb-2">No instructors found</h2>
                            <p className="text-light-text-secondary dark:text-dark-text-secondary">
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
