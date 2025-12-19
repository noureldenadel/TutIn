import { useState, useMemo } from 'react'
import {
    ChevronDown, ChevronRight, ChevronLeft, Check,
    Play, Clock, Pencil, History, Star
} from 'lucide-react'
import { formatDuration, markVideoComplete, toggleVideoFavorite } from '../../utils/db'
import { getRelativeTime } from '../../utils/timeUtils'
import EditModuleModal from './EditModuleModal'

function PlaylistSidebar({
    course,
    modules,
    currentVideo,
    onVideoSelect,
    isCollapsed,
    onToggle,
    onRefresh
}) {
    const [expandedModules, setExpandedModules] = useState(() => {
        // Expand all modules by default
        return modules.reduce((acc, m) => ({ ...acc, [m.id]: true }), {})
    })
    const [editingModule, setEditingModule] = useState(null)
    const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)

    function toggleModule(moduleId) {
        setExpandedModules(prev => ({
            ...prev,
            [moduleId]: !prev[moduleId]
        }))
    }

    function expandAll() {
        setExpandedModules(modules.reduce((acc, m) => ({ ...acc, [m.id]: true }), {}))
    }

    function collapseAll() {
        setExpandedModules({})
    }

    async function handleToggleComplete(e, video) {
        e.stopPropagation()
        try {
            await markVideoComplete(video.id, !video.isCompleted)
            onRefresh?.()
        } catch (err) {
            console.error('Failed to update completion:', err)
        }
    }

    async function handleToggleFavorite(e, video) {
        e.stopPropagation()
        try {
            await toggleVideoFavorite(video.id)
            onRefresh?.()
        } catch (err) {
            console.error('Failed to toggle favorite:', err)
        }
    }

    // Calculate totals
    const totalVideos = modules.reduce((sum, m) => sum + m.videos.length, 0)
    const completedVideos = modules.reduce((sum, m) =>
        sum + m.videos.filter(v => v.isCompleted).length, 0
    )
    const totalDuration = modules.reduce((sum, m) => sum + m.totalDuration, 0)
    const remainingDuration = modules.reduce((sum, m) =>
        sum + m.videos.filter(v => !v.isCompleted).reduce((vs, v) => vs + (v.duration || 0), 0), 0
    )

    // Collect all videos
    const allVideos = modules.flatMap(m => m.videos)

    // Find last watched video
    const lastWatchedVideo = useMemo(() => {
        const watchedVideos = allVideos.filter(v => v.lastWatchedAt)
        if (watchedVideos.length === 0) return null
        return watchedVideos.sort((a, b) =>
            new Date(b.lastWatchedAt) - new Date(a.lastWatchedAt)
        )[0]
    }, [allVideos])

    const sidebarContent = (
        <>
            {/* Sidebar */}
            <div
                className={`
          fixed right-0 top-[112px] bottom-0 
          w-[360px] max-w-full
          bg-white dark:bg-dark-surface 
          border-l border-light-border dark:border-dark-border
          flex flex-col
          transition-transform duration-300
          ${isCollapsed ? 'translate-x-full' : 'translate-x-0'}
          z-30
        `}
            >
                {/* Header */}
                <div className="p-4 border-b border-light-border dark:border-dark-border">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="font-semibold text-light-text-primary dark:text-dark-text-primary">
                            Playlist
                        </h2>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={expandAll}
                                className="p-1 text-xs text-light-text-secondary dark:text-dark-text-secondary hover:text-primary transition-colors"
                            >
                                Expand
                            </button>
                            <span className="text-light-border dark:text-dark-border">|</span>
                            <button
                                onClick={collapseAll}
                                className="p-1 text-xs text-light-text-secondary dark:text-dark-text-secondary hover:text-primary transition-colors"
                            >
                                Collapse
                            </button>
                        </div>
                    </div>

                    {/* Progress Summary */}
                    <div className="flex items-center justify-between text-sm mb-3">
                        <span className="text-light-text-secondary dark:text-dark-text-secondary">
                            {completedVideos}/{totalVideos} videos
                        </span>
                        <div className="flex items-center gap-3 text-light-text-secondary dark:text-dark-text-secondary">
                            {remainingDuration > 0 && (
                                <span className="text-primary font-medium">
                                    {formatDuration(remainingDuration)} left
                                </span>
                            )}
                            <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatDuration(totalDuration)}
                            </span>
                        </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="progress-bar h-2 mb-3">
                        <div
                            className="progress-bar-fill"
                            style={{ width: `${totalVideos > 0 ? (completedVideos / totalVideos) * 100 : 0}%` }}
                        />
                    </div>

                    {/* Favorites Filter */}
                    <button
                        onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                        className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-colors ${showFavoritesOnly
                            ? 'bg-warning/10 text-warning border border-warning/30'
                            : 'hover:bg-light-surface dark:hover:bg-dark-bg border border-light-border dark:border-dark-border'
                            }`}
                    >
                        <Star className={`w-4 h-4 ${showFavoritesOnly ? 'fill-current' : ''}`} />
                        {showFavoritesOnly ? 'Showing Favorites' : 'Show Favorites Only'}
                    </button>
                </div>

                {/* Module List */}
                <div className="flex-1 overflow-y-auto">
                    {modules.map((module, moduleIndex) => (
                        <div key={module.id} className="border-b border-light-border dark:border-dark-border last:border-b-0">
                            {/* Module Header */}
                            <div className="flex items-center gap-2 p-3 hover:bg-light-surface dark:hover:bg-dark-bg transition-colors group">
                                <button
                                    onClick={() => toggleModule(module.id)}
                                    className="flex items-center gap-2 flex-1 min-w-0 text-left"
                                >
                                    {expandedModules[module.id] ? (
                                        <ChevronDown className="w-4 h-4 flex-shrink-0" />
                                    ) : (
                                        <ChevronRight className="w-4 h-4 flex-shrink-0" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-sm font-medium truncate">
                                            {module.title}
                                        </h3>
                                        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                                            {module.videos.filter(v => v.isCompleted).length}/{module.videos.length} • {formatDuration(module.totalDuration)}
                                        </p>
                                    </div>
                                </button>
                                <button
                                    onClick={() => setEditingModule(module)}
                                    className="p-1 opacity-0 group-hover:opacity-100 hover:bg-light-bg dark:hover:bg-dark-surface rounded transition-all"
                                    title="Edit module"
                                >
                                    <Pencil className="w-3 h-3" />
                                </button>
                            </div>

                            {/* Videos */}
                            {expandedModules[module.id] && (
                                <div className="pb-2">
                                    {module.videos
                                        .filter(v => !showFavoritesOnly || v.isFavorite)
                                        .map((video, videoIndex) => {
                                            const isActive = currentVideo?.id === video.id
                                            const isCompleted = video.isCompleted

                                            return (
                                                <div
                                                    key={video.id}
                                                    onClick={() => onVideoSelect(video)}
                                                    role="button"
                                                    tabIndex={0}
                                                    onKeyDown={(e) => e.key === 'Enter' && onVideoSelect(video)}
                                                    className={`
                          w-full flex items-start gap-2 px-4 py-2 text-left cursor-pointer
                          transition-colors group
                          ${isActive
                                                            ? 'bg-primary/10 border-l-2 border-primary'
                                                            : 'hover:bg-light-surface dark:hover:bg-dark-bg border-l-2 border-transparent'
                                                        }
                        `}
                                                >
                                                    {/* Completion Checkbox */}
                                                    <button
                                                        onClick={(e) => handleToggleComplete(e, video)}
                                                        className={`
                            w-5 h-5 rounded border-2 flex-shrink-0 mt-0.5
                            flex items-center justify-center
                            transition-colors
                            ${isCompleted
                                                                ? 'bg-success border-success text-white'
                                                                : 'border-light-border dark:border-dark-border hover:border-primary'
                                                            }
                          `}
                                                    >
                                                        {isCompleted && <Check className="w-3 h-3" />}
                                                    </button>

                                                    {/* Favorite Star */}
                                                    <button
                                                        onClick={(e) => handleToggleFavorite(e, video)}
                                                        className={`flex-shrink-0 mt-0.5 transition-colors ${video.isFavorite
                                                                ? 'text-warning'
                                                                : 'text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 hover:text-warning'
                                                            }`}
                                                        title={video.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                                                    >
                                                        <Star className={`w-4 h-4 ${video.isFavorite ? 'fill-current' : ''}`} />
                                                    </button>

                                                    {/* Video Info */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-start gap-2">
                                                            {isActive && (
                                                                <Play className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" fill="currentColor" />
                                                            )}
                                                            <span className={`text-sm ${isActive
                                                                ? 'text-primary font-medium'
                                                                : isCompleted
                                                                    ? 'text-light-text-secondary dark:text-dark-text-secondary line-through'
                                                                    : ''
                                                                }`}>
                                                                {video.title}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-1 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                                                            <span>{formatDuration(video.duration)}</span>
                                                            {video.watchProgress > 0 && video.watchProgress < 1 && !isCompleted && (
                                                                <span className="text-primary">
                                                                    {Math.round(video.watchProgress * 100)}% watched
                                                                </span>
                                                            )}
                                                            {lastWatchedVideo?.id === video.id && (
                                                                <span className="flex items-center gap-1 text-primary" title={`Last watched ${getRelativeTime(video.lastWatchedAt)}`}>
                                                                    <History className="w-3 h-3" />
                                                                    <span className="hidden sm:inline">{getRelativeTime(video.lastWatchedAt)}</span>
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Collapse Toggle Button */}
            <button
                onClick={onToggle}
                className={`
          fixed right-0 top-1/2 -translate-y-1/2
          w-6 h-12 
          bg-light-surface dark:bg-dark-surface 
          border border-light-border dark:border-dark-border
          rounded-l-lg
          flex items-center justify-center
          hover:bg-light-bg dark:hover:bg-dark-bg
          transition-all
          z-40
          ${isCollapsed ? 'right-0' : 'right-[360px]'}
        `}
            >
                {isCollapsed ? (
                    <ChevronLeft className="w-4 h-4" />
                ) : (
                    <ChevronRight className="w-4 h-4" />
                )}
            </button>
        </>
    )

    return (
        <>
            {sidebarContent}

            {/* Edit Module Modal */}
            <EditModuleModal
                module={editingModule}
                isOpen={!!editingModule}
                onClose={() => setEditingModule(null)}
                onSave={() => {
                    onRefresh?.()
                }}
            />
        </>
    )
}

export default PlaylistSidebar
