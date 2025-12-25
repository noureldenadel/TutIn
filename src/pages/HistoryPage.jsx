import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { History, Play, Clock, Calendar, Trash2, Search, X } from 'lucide-react'
import { getRecentlyWatchedVideos, getAllCourses, updateVideo } from '../utils/db'
import LoadingSpinner from '../components/common/LoadingSpinner'
import { formatDuration } from '../utils/db'

function HistoryPage() {
    const [watchedVideos, setWatchedVideos] = useState([])
    const [courses, setCourses] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')

    useEffect(() => {
        loadHistory()
    }, [])

    async function loadHistory() {
        try {
            setIsLoading(true)
            const [recent, allCourses] = await Promise.all([
                getRecentlyWatchedVideos(100), // Get more for full history
                getAllCourses()
            ])
            setWatchedVideos(recent)
            setCourses(allCourses)
        } catch (err) {
            console.error('Failed to load history:', err)
        } finally {
            setIsLoading(false)
        }
    }

    // Group videos by date section
    const groupedHistory = useMemo(() => {
        const now = new Date()
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
        const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
        const lastMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)

        const groups = {
            today: [],
            yesterday: [],
            thisWeek: [],
            thisMonth: [],
            older: []
        }

        let filtered = watchedVideos
        if (searchQuery) {
            const query = searchQuery.toLowerCase()
            filtered = watchedVideos.filter(item =>
                item.video.title?.toLowerCase().includes(query) ||
                item.course.title?.toLowerCase().includes(query) ||
                item.course.instructor?.toLowerCase().includes(query)
            )
        }

        filtered.forEach(item => {
            const watchedAt = new Date(item.video.lastWatchedAt)
            const watchedDate = new Date(watchedAt.getFullYear(), watchedAt.getMonth(), watchedAt.getDate())

            if (watchedDate.getTime() >= today.getTime()) {
                groups.today.push(item)
            } else if (watchedDate.getTime() >= yesterday.getTime()) {
                groups.yesterday.push(item)
            } else if (watchedDate.getTime() >= lastWeek.getTime()) {
                groups.thisWeek.push(item)
            } else if (watchedDate.getTime() >= lastMonth.getTime()) {
                groups.thisMonth.push(item)
            } else {
                groups.older.push(item)
            }
        })

        return groups
    }, [watchedVideos, searchQuery])

    const sections = [
        { key: 'today', label: 'Today', items: groupedHistory.today },
        { key: 'yesterday', label: 'Yesterday', items: groupedHistory.yesterday },
        { key: 'thisWeek', label: 'This Week', items: groupedHistory.thisWeek },
        { key: 'thisMonth', label: 'This Month', items: groupedHistory.thisMonth },
        { key: 'older', label: 'Older', items: groupedHistory.older },
    ].filter(section => section.items.length > 0)

    async function clearFromHistory(videoId) {
        try {
            // Clear watch progress to remove from history
            await updateVideo(videoId, {
                lastWatchedAt: null,
                watchProgress: 0,
                lastWatchedPosition: 0
            })
            await loadHistory()
        } catch (err) {
            console.error('Failed to clear from history:', err)
        }
    }

    if (isLoading) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <LoadingSpinner message="Loading history..." />
            </div>
        )
    }

    return (
        <div className="py-6">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-light-text-primary dark:text-dark-text-primary flex items-center gap-3">
                    <History className="w-7 h-7 text-primary" />
                    Watch History
                </h1>
                <p className="text-light-text-secondary dark:text-dark-text-secondary mt-1">
                    {watchedVideos.length} video{watchedVideos.length !== 1 ? 's' : ''} in your history
                </p>
            </div>

            {/* Search */}
            {watchedVideos.length > 0 && (
                <div className="relative mb-6">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-light-text-secondary dark:text-dark-text-secondary" />
                    <input
                        type="text"
                        placeholder="Search history..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full max-w-md pl-10 pr-10 py-2.5 rounded-lg border border-light-border dark:border-dark-border bg-white dark:bg-dark-surface focus:ring-2 focus:ring-primary outline-none"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
            )}

            {/* History Sections */}
            {sections.length > 0 ? (
                <div className="space-y-8">
                    {sections.map(section => (
                        <div key={section.key}>
                            <h2 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary mb-4 flex items-center gap-2">
                                <Calendar className="w-5 h-5 text-primary" />
                                {section.label}
                            </h2>
                            <div className="bg-white dark:bg-dark-surface rounded-lg border border-light-border dark:border-dark-border overflow-hidden">
                                {section.items.map((item, index) => (
                                    <div
                                        key={item.video.id}
                                        className={`flex items-center gap-4 p-4 hover:bg-light-surface dark:hover:bg-dark-bg transition-colors group ${index > 0 ? 'border-t border-light-border dark:border-dark-border' : ''
                                            }`}
                                    >
                                        {/* Thumbnail */}
                                        <Link
                                            to={`/course/${item.course.id}`}
                                            className="relative flex-shrink-0 w-40 aspect-video bg-light-surface dark:bg-dark-bg rounded-lg overflow-hidden"
                                        >
                                            {item.course.thumbnailData ? (
                                                <img
                                                    src={item.course.thumbnailData}
                                                    alt={item.video.title}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <Play className="w-8 h-8 text-light-text-secondary dark:text-dark-text-secondary opacity-50" />
                                                </div>
                                            )}
                                            {/* Progress bar */}
                                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30">
                                                <div
                                                    className="h-full bg-primary"
                                                    style={{ width: `${(item.video.watchProgress || 0) * 100}%` }}
                                                />
                                            </div>
                                            {/* Duration badge */}
                                            {item.video.duration > 0 && (
                                                <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/80 text-white text-xs rounded">
                                                    {formatDuration(item.video.duration)}
                                                </div>
                                            )}
                                        </Link>

                                        {/* Info */}
                                        <div className="flex-1 min-w-0">
                                            <Link
                                                to={`/course/${item.course.id}`}
                                                className="block"
                                            >
                                                <h3 className="font-medium text-light-text-primary dark:text-dark-text-primary truncate hover:text-primary transition-colors">
                                                    {item.video.title}
                                                </h3>
                                            </Link>
                                            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mt-1 truncate">
                                                {item.course.title}
                                            </p>
                                            <div className="flex items-center gap-4 mt-2 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                                                {item.course.instructor && (
                                                    <span>{item.course.instructor}</span>
                                                )}
                                                <span className="flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    {Math.round((item.video.watchProgress || 0) * 100)}% watched
                                                </span>
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => clearFromHistory(item.video.id)}
                                                className="p-2 text-light-text-secondary dark:text-dark-text-secondary hover:text-error hover:bg-error/10 rounded-lg transition-colors"
                                                title="Remove from history"
                                            >
                                                <Trash2 className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            ) : watchedVideos.length === 0 ? (
                <div className="text-center py-16">
                    <History className="w-16 h-16 mx-auto mb-4 text-light-text-secondary dark:text-dark-text-secondary opacity-50" />
                    <h2 className="text-xl font-semibold mb-2">No watch history yet</h2>
                    <p className="text-light-text-secondary dark:text-dark-text-secondary mb-6">
                        Videos you watch will appear here
                    </p>
                    <Link
                        to="/"
                        className="btn-primary inline-flex items-center gap-2"
                    >
                        <Play className="w-5 h-5" />
                        Browse Courses
                    </Link>
                </div>
            ) : (
                <div className="text-center py-16">
                    <Search className="w-16 h-16 mx-auto mb-4 text-light-text-secondary dark:text-dark-text-secondary opacity-50" />
                    <h2 className="text-xl font-semibold mb-2">No results found</h2>
                    <p className="text-light-text-secondary dark:text-dark-text-secondary">
                        Try a different search term
                    </p>
                </div>
            )}
        </div>
    )
}

export default HistoryPage
