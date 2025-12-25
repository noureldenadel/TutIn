import { useState, useEffect, useMemo } from 'react'
import { BarChart3, Clock, BookOpen, CheckCircle, Trophy, Flame, TrendingUp, Calendar } from 'lucide-react'
import { getAllCourses, getRecentlyWatchedVideos, getInstructorAvatarAsync } from '../utils/db'
import LoadingSpinner from '../components/common/LoadingSpinner'
import { formatDuration } from '../utils/db'

function StatisticsPage() {
    const [courses, setCourses] = useState([])
    const [recentlyWatched, setRecentlyWatched] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [instructorAvatars, setInstructorAvatars] = useState({})

    useEffect(() => {
        loadData()
    }, [])

    async function loadData() {
        try {
            setIsLoading(true)
            const [allCourses, recent] = await Promise.all([
                getAllCourses(),
                getRecentlyWatchedVideos(100)
            ])
            setCourses(allCourses)
            setRecentlyWatched(recent)

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
            console.error('Failed to load statistics:', err)
        } finally {
            setIsLoading(false)
        }
    }

    // Calculate statistics
    const stats = useMemo(() => {
        const totalCourses = courses.length
        const completedCourses = courses.filter(c => c.completionPercentage === 100).length
        const inProgressCourses = courses.filter(c => c.completionPercentage > 0 && c.completionPercentage < 100).length

        const totalVideos = courses.reduce((sum, c) => sum + (c.totalVideos || 0), 0)
        const completedVideos = courses.reduce((sum, c) => sum + (c.completedVideos || 0), 0)

        const totalDurationSeconds = courses.reduce((sum, c) => sum + (c.totalDuration || 0), 0)
        const watchedDurationSeconds = recentlyWatched.reduce((sum, item) => {
            return sum + ((item.video.duration || 0) * (item.video.watchProgress || 0))
        }, 0)

        // Get instructor stats
        const instructorMap = new Map()
        courses.forEach(course => {
            if (!course.instructor) return
            if (!instructorMap.has(course.instructor)) {
                instructorMap.set(course.instructor, {
                    name: course.instructor,
                    avatar: instructorAvatars[course.instructor] || null,
                    courses: 0,
                    videos: 0,
                    completedVideos: 0
                })
            }
            const inst = instructorMap.get(course.instructor)
            inst.courses++
            inst.videos += course.totalVideos || 0
            inst.completedVideos += course.completedVideos || 0
        })
        const topInstructors = Array.from(instructorMap.values())
            .sort((a, b) => b.completedVideos - a.completedVideos)
            .slice(0, 5)

        // Calculate learning streak (days with activity)
        const activityDays = new Set()
        recentlyWatched.forEach(item => {
            if (item.video.lastWatchedAt) {
                const date = new Date(item.video.lastWatchedAt).toDateString()
                activityDays.add(date)
            }
        })

        // Calculate streak
        let streak = 0
        const today = new Date()
        for (let i = 0; i < 365; i++) {
            const checkDate = new Date(today)
            checkDate.setDate(checkDate.getDate() - i)
            if (activityDays.has(checkDate.toDateString())) {
                streak++
            } else if (i > 0) { // Allow missing today
                break
            }
        }

        // Activity this week
        const weekStart = new Date(today)
        weekStart.setDate(weekStart.getDate() - weekStart.getDay())
        const weekActivity = Array.from({ length: 7 }, (_, i) => {
            const date = new Date(weekStart)
            date.setDate(date.getDate() + i)
            const dateStr = date.toDateString()
            const dayVideos = recentlyWatched.filter(item => {
                if (!item.video.lastWatchedAt) return false
                return new Date(item.video.lastWatchedAt).toDateString() === dateStr
            })
            return {
                day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i],
                count: dayVideos.length,
                isToday: date.toDateString() === today.toDateString()
            }
        })

        return {
            totalCourses,
            completedCourses,
            inProgressCourses,
            totalVideos,
            completedVideos,
            totalDurationSeconds,
            watchedDurationSeconds,
            topInstructors,
            streak,
            weekActivity,
            completionRate: totalVideos > 0 ? (completedVideos / totalVideos) * 100 : 0
        }
    }, [courses, recentlyWatched, instructorAvatars])

    if (isLoading) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <LoadingSpinner message="Calculating statistics..." />
            </div>
        )
    }

    return (
        <div className="py-6">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-light-text-primary dark:text-dark-text-primary flex items-center gap-3">
                    <BarChart3 className="w-7 h-7 text-blue-600 dark:text-white" />
                    Learning Statistics
                </h1>
                <p className="text-light-text-secondary dark:text-dark-text-secondary mt-1">
                    Track your learning progress and achievements
                </p>
            </div>

            {/* Main Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {/* Total Watch Time */}
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-5 text-white">
                    <Clock className="w-8 h-8 mb-3 opacity-80" />
                    <div className="text-2xl font-bold">
                        {Math.floor(stats.watchedDurationSeconds / 3600)}h {Math.floor((stats.watchedDurationSeconds % 3600) / 60)}m
                    </div>
                    <div className="text-sm opacity-80">Watch Time</div>
                </div>

                {/* Videos Completed */}
                <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-5 text-white">
                    <CheckCircle className="w-8 h-8 mb-3 opacity-80" />
                    <div className="text-2xl font-bold">{stats.completedVideos}</div>
                    <div className="text-sm opacity-80">Videos Completed</div>
                </div>

                {/* Courses Completed */}
                <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-5 text-white">
                    <Trophy className="w-8 h-8 mb-3 opacity-80" />
                    <div className="text-2xl font-bold">{stats.completedCourses}</div>
                    <div className="text-sm opacity-80">Courses Completed</div>
                </div>

                {/* Learning Streak */}
                <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-5 text-white">
                    <Flame className="w-8 h-8 mb-3 opacity-80" />
                    <div className="text-2xl font-bold">{stats.streak} days</div>
                    <div className="text-sm opacity-80">Learning Streak</div>
                </div>
            </div>

            {/* Weekly Activity & Progress */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Weekly Activity Chart */}
                <div className="bg-white dark:bg-dark-surface rounded-xl border border-light-border dark:border-dark-border p-6">
                    <h3 className="font-semibold text-light-text-primary dark:text-dark-text-primary mb-4 flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-blue-600 dark:text-white" />
                        This Week's Activity
                    </h3>
                    <div className="flex items-end justify-between gap-2 h-40">
                        {stats.weekActivity.map((day, index) => {
                            const maxCount = Math.max(...stats.weekActivity.map(d => d.count), 1)
                            const height = (day.count / maxCount) * 100
                            return (
                                <div key={index} className="flex-1 flex flex-col items-center">
                                    <div className="w-full flex flex-col items-center justify-end h-28">
                                        <div
                                            className={`w-full max-w-8 rounded-t-lg transition-all ${day.isToday
                                                ? 'bg-blue-600 dark:bg-white'
                                                : 'bg-blue-600/40 dark:bg-white/40'
                                                }`}
                                            style={{ height: `${Math.max(height, 4)}%` }}
                                        />
                                    </div>
                                    <span className={`text-xs mt-2 ${day.isToday
                                        ? 'text-blue-600 dark:text-white font-semibold'
                                        : 'text-light-text-secondary dark:text-dark-text-secondary'
                                        }`}>
                                        {day.day}
                                    </span>
                                    <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                                        {day.count}
                                    </span>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Overall Progress */}
                <div className="bg-white dark:bg-dark-surface rounded-xl border border-light-border dark:border-dark-border p-6">
                    <h3 className="font-semibold text-light-text-primary dark:text-dark-text-primary mb-4 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-blue-600 dark:text-white" />
                        Overall Progress
                    </h3>
                    <div className="space-y-4">
                        {/* Videos Progress */}
                        <div>
                            <div className="flex justify-between text-sm mb-2">
                                <span className="text-light-text-secondary dark:text-dark-text-secondary">
                                    Videos Completed
                                </span>
                                <span className="font-medium text-light-text-primary dark:text-dark-text-primary">
                                    {stats.completedVideos} / {stats.totalVideos}
                                </span>
                            </div>
                            <div className="h-3 bg-light-surface dark:bg-dark-bg rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-green-400 to-green-500 rounded-full transition-all"
                                    style={{ width: `${stats.completionRate}%` }}
                                />
                            </div>
                        </div>

                        {/* Courses Progress */}
                        <div>
                            <div className="flex justify-between text-sm mb-2">
                                <span className="text-light-text-secondary dark:text-dark-text-secondary">
                                    Courses Completed
                                </span>
                                <span className="font-medium text-light-text-primary dark:text-dark-text-primary">
                                    {stats.completedCourses} / {stats.totalCourses}
                                </span>
                            </div>
                            <div className="h-3 bg-light-surface dark:bg-dark-bg rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-purple-400 to-purple-500 rounded-full transition-all"
                                    style={{ width: `${stats.totalCourses > 0 ? (stats.completedCourses / stats.totalCourses) * 100 : 0}%` }}
                                />
                            </div>
                        </div>

                        {/* Time Progress */}
                        <div>
                            <div className="flex justify-between text-sm mb-2">
                                <span className="text-light-text-secondary dark:text-dark-text-secondary">
                                    Total Content Duration
                                </span>
                                <span className="font-medium text-light-text-primary dark:text-dark-text-primary">
                                    {formatDuration(stats.totalDurationSeconds)}
                                </span>
                            </div>
                            <div className="h-3 bg-light-surface dark:bg-dark-bg rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-blue-400 to-blue-500 rounded-full transition-all"
                                    style={{ width: `${stats.totalDurationSeconds > 0 ? (stats.watchedDurationSeconds / stats.totalDurationSeconds) * 100 : 0}%` }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Top Instructors */}
            {stats.topInstructors.length > 0 && (
                <div className="bg-white dark:bg-dark-surface rounded-xl border border-light-border dark:border-dark-border p-6">
                    <h3 className="font-semibold text-light-text-primary dark:text-dark-text-primary mb-4 flex items-center gap-2">
                        <BookOpen className="w-5 h-5 text-blue-600 dark:text-white" />
                        Most Watched Instructors
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                        {stats.topInstructors.map((instructor, index) => (
                            <div
                                key={instructor.name}
                                className="flex items-center gap-3 p-3 rounded-lg bg-light-surface dark:bg-dark-bg"
                            >
                                <div className="relative">
                                    {instructor.avatar ? (
                                        <img
                                            src={instructor.avatar}
                                            alt={instructor.name}
                                            className="w-12 h-12 rounded-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center">
                                            <span className="text-lg font-bold text-blue-600 dark:text-white">
                                                {instructor.name.charAt(0).toUpperCase()}
                                            </span>
                                        </div>
                                    )}
                                    {/* Rank badge */}
                                    <div className={`absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-yellow-400 text-yellow-900' :
                                        index === 1 ? 'bg-gray-300 text-gray-700' :
                                            index === 2 ? 'bg-orange-400 text-orange-900' :
                                                'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-white'
                                        }`}>
                                        {index + 1}
                                    </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-sm truncate text-light-text-primary dark:text-dark-text-primary">
                                        {instructor.name}
                                    </div>
                                    <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                                        {instructor.completedVideos} videos watched
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Empty State */}
            {courses.length === 0 && (
                <div className="text-center py-16">
                    <BarChart3 className="w-16 h-16 mx-auto mb-4 text-light-text-secondary dark:text-dark-text-secondary opacity-50" />
                    <h2 className="text-xl font-semibold mb-2">No statistics yet</h2>
                    <p className="text-light-text-secondary dark:text-dark-text-secondary">
                        Import courses and start learning to see your statistics
                    </p>
                </div>
            )}
        </div>
    )
}

export default StatisticsPage
