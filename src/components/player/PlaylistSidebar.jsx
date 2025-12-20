import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import {
    ChevronDown, ChevronRight, ChevronLeft, Check,
    Pencil, GripVertical
} from 'lucide-react'
import { formatDuration, markVideoComplete, updateModule, updateVideo } from '../../utils/db'
import EditModuleModal from './EditModuleModal'
import NotesPanel from './NotesPanel'
import BulkEditPlaylist from './BulkEditPlaylist'
import AISummaryPanel from './AISummaryPanel'

function PlaylistSidebar({
    course,
    modules,
    currentVideo,
    onVideoSelect,
    isCollapsed,
    onToggle,
    onRefresh,
    // Props for NotesPanel
    courseId,
    currentTime,
    onSeek
}) {
    const [expandedModules, setExpandedModules] = useState(() => {
        // Expand all modules by default
        return modules.reduce((acc, m) => ({ ...acc, [m.id]: true }), {})
    })
    const [editingModule, setEditingModule] = useState(null)
    const [activeTab, setActiveTab] = useState('playlist') // 'playlist' | 'notes' | 'ai'
    const [isBulkEditing, setIsBulkEditing] = useState(false)

    // Resizable panel state
    const [panelWidth, setPanelWidth] = useState(() => {
        const saved = localStorage.getItem('sidebarPanelWidth')
        return saved ? Math.max(280, Math.min(600, parseInt(saved, 10))) : 360
    })
    const isResizing = useRef(false)
    const resizeStartX = useRef(0)
    const resizeStartWidth = useRef(0)

    // Save panel width to localStorage
    useEffect(() => {
        localStorage.setItem('sidebarPanelWidth', panelWidth.toString())
    }, [panelWidth])

    // Resize handlers
    const handleResizeStart = useCallback((e) => {
        e.preventDefault()
        isResizing.current = true
        resizeStartX.current = e.clientX
        resizeStartWidth.current = panelWidth
        document.body.style.cursor = 'ew-resize'
        document.body.style.userSelect = 'none'
    }, [panelWidth])

    useEffect(() => {
        const handleResizeMove = (e) => {
            if (!isResizing.current) return
            const delta = resizeStartX.current - e.clientX
            const newWidth = Math.max(280, Math.min(600, resizeStartWidth.current + delta))
            setPanelWidth(newWidth)
        }

        const handleResizeEnd = () => {
            if (isResizing.current) {
                isResizing.current = false
                document.body.style.cursor = ''
                document.body.style.userSelect = ''
            }
        }

        document.addEventListener('mousemove', handleResizeMove)
        document.addEventListener('mouseup', handleResizeEnd)
        return () => {
            document.removeEventListener('mousemove', handleResizeMove)
            document.removeEventListener('mouseup', handleResizeEnd)
        }
    }, [])

    function toggleModule(moduleId) {
        setExpandedModules(prev => ({
            ...prev,
            [moduleId]: !prev[moduleId]
        }))
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

    async function handleBulkSave(updatedModules) {
        try {
            // Process updates
            for (let mIndex = 0; mIndex < updatedModules.length; mIndex++) {
                const mod = updatedModules[mIndex]
                await updateModule(mod.id, {
                    title: mod.title,
                    order: mIndex
                })

                for (let vIndex = 0; vIndex < mod.videos.length; vIndex++) {
                    const vid = mod.videos[vIndex]
                    await updateVideo(vid.id, {
                        title: vid.title,
                        order: vIndex,
                        moduleId: mod.id
                    })
                }
            }

            setIsBulkEditing(false)
            onRefresh?.()
        } catch (err) {
            console.error('Bulk save failed:', err)
            alert('Failed to save changes')
        }
    }

    // Calculate totals
    const totalVideos = modules.reduce((sum, m) => sum + m.videos.length, 0)
    const completedVideos = modules.reduce((sum, m) =>
        sum + m.videos.filter(v => v.isCompleted).length, 0
    )
    const totalDuration = modules.reduce((sum, m) => sum + m.totalDuration, 0)

    // Calculate remaining time (sum of incomplete video durations)
    const remainingDuration = modules.reduce((sum, m) =>
        sum + m.videos.filter(v => !v.isCompleted).reduce((vSum, v) => vSum + (v.duration || 0), 0), 0
    )

    const sidebarContent = (
        <>
            {/* Sidebar */}
            <div
                className={`
          fixed right-0 top-[64px] bottom-0 
          bg-white dark:bg-dark-surface 
          border-l border-light-border dark:border-dark-border
          flex flex-col
          transition-transform duration-300
          ${isCollapsed ? 'translate-x-full' : 'translate-x-0'}
          z-30
        `}
                style={{ width: `${panelWidth}px`, maxWidth: '100%' }}
            >
                {/* Resize Handle */}
                <div
                    onMouseDown={handleResizeStart}
                    className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-primary/30 active:bg-primary/50 transition-colors z-10 group"
                    title="Drag to resize"
                >
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-light-border dark:bg-dark-border rounded group-hover:bg-primary/50 transition-colors" />
                </div>
                {/* Header Section */}
                <div className="flex flex-col border-b border-light-border dark:border-dark-border bg-white dark:bg-dark-surface z-10">
                    {/* Top Progress Bar */}
                    <div className="px-4 pt-4 pb-2">
                        <div className="flex items-center justify-between text-sm mb-1">
                            <span className="text-light-text-secondary dark:text-dark-text-secondary">
                                {completedVideos}/{totalVideos} videos completed
                            </span>
                            <span className="font-medium text-primary">
                                {Math.round(totalVideos > 0 ? (completedVideos / totalVideos) * 100 : 0)}%
                            </span>
                        </div>
                        {remainingDuration > 0 && (
                            <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary mb-2">
                                {formatDuration(remainingDuration)} remaining
                            </div>
                        )}
                        <div className="progress-bar h-2 w-full bg-light-bg dark:bg-dark-bg rounded-full overflow-hidden">
                            <div
                                className="progress-bar-fill h-full bg-primary rounded-full transition-all duration-300"
                                style={{ width: `${totalVideos > 0 ? (completedVideos / totalVideos) * 100 : 0}%` }}
                            />
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex items-center px-2 mt-2">
                        <button
                            onClick={() => setActiveTab('playlist')}
                            className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'playlist'
                                ? 'border-primary text-primary'
                                : 'border-transparent text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-primary dark:hover:text-dark-text-primary'
                                }`}
                        >
                            Playlist
                        </button>
                        <button
                            onClick={() => setActiveTab('notes')}
                            className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'notes'
                                ? 'border-primary text-primary'
                                : 'border-transparent text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-primary dark:hover:text-dark-text-primary'
                                }`}
                        >
                            Notes
                        </button>
                        <button
                            onClick={() => setActiveTab('ai')}
                            className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'ai'
                                ? 'border-primary text-primary'
                                : 'border-transparent text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-primary dark:hover:text-dark-text-primary'
                                }`}
                        >
                            AI
                        </button>
                    </div>

                    {/* Tab-Specific Toolbar (Playlist only) */}
                    {activeTab === 'playlist' && !isBulkEditing && (
                        <div className="flex items-center justify-between p-3 border-t border-light-border dark:border-dark-border bg-light-surface/50 dark:bg-dark-bg/50">
                            <h3 className="text-sm font-semibold">Playlist</h3>
                            <button
                                onClick={() => setIsBulkEditing(true)}
                                className="flex items-center gap-1 text-sm text-primary hover:text-primary-dark"
                            >
                                <Pencil className="w-3 h-3" />
                                Bulk Edit
                            </button>
                        </div>
                    )}
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-hidden relative">
                    {activeTab === 'playlist' && (
                        isBulkEditing ? (
                            <BulkEditPlaylist
                                modules={modules}
                                onSave={handleBulkSave}
                                onCancel={() => setIsBulkEditing(false)}
                            />
                        ) : (
                            // Regular Playlist View
                            <div className="h-full overflow-y-auto">
                                {modules.map((module) => (
                                    <div key={module.id} className="border-b border-light-border dark:border-dark-border last:border-b-0">
                                        {/* Module Header */}
                                        <div className="flex items-center gap-2 p-3 hover:bg-light-surface dark:hover:bg-dark-bg transition-colors cursor-pointer" onClick={() => toggleModule(module.id)}>
                                            {expandedModules[module.id] ? (
                                                <ChevronDown className="w-4 h-4 flex-shrink-0 text-light-text-secondary dark:text-dark-text-secondary" />
                                            ) : (
                                                <ChevronRight className="w-4 h-4 flex-shrink-0 text-light-text-secondary dark:text-dark-text-secondary" />
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-sm font-medium truncate select-none">
                                                    {module.title}
                                                </h3>
                                                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary select-none">
                                                    {module.videos.filter(v => v.isCompleted).length}/{module.videos.length} • {formatDuration(module.totalDuration)}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Videos */}
                                        {expandedModules[module.id] && (
                                            <div className="pb-1">
                                                {module.videos.map((video) => {
                                                    const isActive = currentVideo?.id === video.id
                                                    const isCompleted = video.isCompleted

                                                    return (
                                                        <div
                                                            key={video.id}
                                                            onClick={() => onVideoSelect(video)}
                                                            className={`
                                                                    w-full flex items-start gap-3 px-4 py-2 text-left cursor-pointer
                                                                    transition-colors group text-sm
                                                                    ${isActive
                                                                    ? 'bg-primary/10 border-l-2 border-primary'
                                                                    : 'hover:bg-light-surface dark:hover:bg-dark-bg border-l-2 border-transparent'
                                                                }
                                                                `}
                                                        >
                                                            {/* Checkbox */}
                                                            <button
                                                                onClick={(e) => handleToggleComplete(e, video)}
                                                                className={`
                                                                        w-4 h-4 rounded border flex-shrink-0 mt-0.5
                                                                        flex items-center justify-center transition-colors
                                                                        ${isCompleted
                                                                        ? 'bg-success border-success text-white'
                                                                        : 'border-gray-400 dark:border-gray-600 hover:border-primary'
                                                                    }
                                                                    `}
                                                            >
                                                                {isCompleted && <Check className="w-3 h-3" />}
                                                            </button>

                                                            {/* Title */}
                                                            <div className="flex-1 min-w-0">
                                                                <div className={`line-clamp-2 ${isCompleted ? 'text-light-text-secondary dark:text-dark-text-secondary line-through' : ''} ${isActive ? 'text-primary font-medium' : ''}`}>
                                                                    {video.title}
                                                                </div>
                                                                <div className="flex items-center gap-2 mt-0.5 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                                                                    <span>{formatDuration(video.duration)}</span>
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
                        )
                    )}

                    {activeTab === 'notes' && (
                        <div className="h-full overflow-y-auto">
                            <NotesPanel
                                video={currentVideo}
                                courseId={courseId}
                                currentTime={currentTime}
                                onSeek={onSeek}
                                isCollapsed={false}
                                hideHeader={true}
                            />
                        </div>
                    )}

                    {activeTab === 'ai' && (
                        <div className="h-full overflow-y-auto">
                            <AISummaryPanel
                                video={currentVideo}
                                courseId={courseId}
                                onSeek={onSeek}
                            />
                        </div>
                    )}
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
          ${isCollapsed ? 'right-0' : ''}
        `}
                style={isCollapsed ? {} : { right: `${panelWidth}px` }}
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
