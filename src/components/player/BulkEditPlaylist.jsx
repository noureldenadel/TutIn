import { useState, useRef, useEffect } from 'react'
import { GripVertical, Folder, Video, ChevronDown, ChevronRight } from 'lucide-react'
import { formatDuration } from '../../utils/db'

function BulkEditPlaylist({ modules: initialModules, onSave, onCancel }) {
    const [items, setItems] = useState(initialModules)
    // Drag state
    const [draggedItem, setDraggedItem] = useState(null) // { type: 'module'|'video', id, moduleId (if video) }
    const [dragOverItem, setDragOverItem] = useState(null) // ID of item being hovered

    useEffect(() => {
        setItems(initialModules)
    }, [initialModules])

    // -- Handlers --

    function handleRenameModule(moduleId, newTitle) {
        setItems(prev => prev.map(m =>
            m.id === moduleId ? { ...m, title: newTitle } : m
        ))
    }

    function handleRenameVideo(videoId, newTitle) {
        setItems(prev => prev.map(m => ({
            ...m,
            videos: m.videos.map(v =>
                v.id === videoId ? { ...v, title: newTitle } : v
            )
        })))
    }

    // -- Drag & Drop Logic --

    function handleDragStart(e, item, type, moduleId = null) {
        setDraggedItem({ ...item, type, moduleId })
        e.dataTransfer.effectAllowed = 'move'
        // Create ghost image if needed, or rely on browser default (which usually works well for simple rows)
    }

    function handleDragOver(e, targetId, targetType, targetModuleId = null) {
        e.preventDefault() // Allow drop
        if (!draggedItem) return

        // Prevent dragging video into module list level or vice versa if we want strict typing
        // For simplicity: Modules can only swap with Modules. Videos with Videos (within same module?? or across?)
        // User asked for "similar to EditModuleModal" which was reorder WITHIN a list.
        // Let's support:
        // 1. Module Reordering
        // 2. Video Reordering (within same module preferrably, or global if we want)

        if (draggedItem.id === targetId) return
        setDragOverItem(targetId)

        // Reorder Logic on Hover (like EditModuleModal)
        if (draggedItem.type === 'module' && targetType === 'module') {
            const oldIndex = items.findIndex(m => m.id === draggedItem.id)
            const newIndex = items.findIndex(m => m.id === targetId)
            if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
                const newItems = [...items]
                const [removed] = newItems.splice(oldIndex, 1)
                newItems.splice(newIndex, 0, removed)
                setItems(newItems)
            }
        } else if (draggedItem.type === 'video' && targetType === 'video') {
            // Find modules
            const sourceModuleIndex = items.findIndex(m => m.id === draggedItem.moduleId)
            const targetModuleIndex = items.findIndex(m => m.id === targetModuleId)

            // For now, restrict to SAME MODULE reordering to avoid complexity of moving videos between modules
            // unless we want that feature. EditModuleModal was single list.
            if (sourceModuleIndex !== -1 && sourceModuleIndex === targetModuleIndex) {
                const module = items[sourceModuleIndex]
                const oldIndex = module.videos.findIndex(v => v.id === draggedItem.id)
                const newIndex = module.videos.findIndex(v => v.id === targetId)

                if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
                    const newVideos = [...module.videos]
                    const [removed] = newVideos.splice(oldIndex, 1)
                    newVideos.splice(newIndex, 0, removed)

                    const newItems = [...items]
                    newItems[sourceModuleIndex] = { ...module, videos: newVideos }
                    setItems(newItems)
                }
            }
        }
    }

    function handleDragEnd() {
        setDraggedItem(null)
        setDragOverItem(null)
    }

    return (
        <div className="h-full flex flex-col">
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {items.map((module) => (
                    <div
                        key={module.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, module, 'module')}
                        onDragOver={(e) => handleDragOver(e, module.id, 'module')}
                        onDragEnd={handleDragEnd}
                        className={`
                            border border-light-border dark:border-dark-border rounded-lg overflow-hidden bg-light-surface dark:bg-dark-bg
                            ${draggedItem?.id === module.id ? 'opacity-50' : ''}
                            ${dragOverItem === module.id && draggedItem?.type === 'module' ? 'border-primary' : ''}
                        `}
                    >
                        {/* Module Header */}
                        <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-white/5 border-b border-light-border dark:border-dark-border">
                            <div className="cursor-grab hover:text-primary text-light-text-secondary dark:text-dark-text-secondary">
                                <GripVertical className="w-5 h-5" />
                            </div>
                            <Folder className="w-4 h-4 text-primary flex-shrink-0" />
                            <input
                                type="text"
                                value={module.title}
                                onChange={(e) => handleRenameModule(module.id, e.target.value)}
                                className="flex-1 bg-transparent border-none focus:ring-0 p-0 font-medium text-sm"
                                placeholder="Module Title"
                            />
                        </div>

                        {/* Videos List */}
                        <div className="bg-white dark:bg-dark-surface p-1">
                            {module.videos.length === 0 && (
                                <div className="p-2 text-xs text-center text-light-text-secondary dark:text-dark-text-secondary italic">
                                    No videos
                                </div>
                            )}
                            {module.videos.map((video) => (
                                <div
                                    key={video.id}
                                    draggable
                                    onDragStart={(e) => {
                                        e.stopPropagation() // Prevent dragging module
                                        handleDragStart(e, video, 'video', module.id)
                                    }}
                                    onDragOver={(e) => {
                                        e.stopPropagation()
                                        handleDragOver(e, video.id, 'video', module.id)
                                    }}
                                    onDragEnd={handleDragEnd}
                                    className={`
                                        flex items-center gap-2 py-2 pl-2 pr-2 rounded
                                        hover:bg-light-surface dark:hover:bg-dark-bg
                                        ${draggedItem?.id === video.id ? 'opacity-50' : ''}
                                    `}
                                >
                                    <div className="cursor-grab text-light-text-secondary dark:text-dark-text-secondary hover:text-primary">
                                        <GripVertical className="w-4 h-4" />
                                    </div>
                                    <Video className="w-3 h-3 text-light-text-secondary dark:text-dark-text-secondary flex-shrink-0" />
                                    <input
                                        type="text"
                                        value={video.title}
                                        onChange={(e) => handleRenameVideo(video.id, e.target.value)}
                                        className="flex-1 bg-transparent border-none focus:ring-0 p-0 text-sm"
                                        placeholder="Video Title"
                                    />
                                    <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary w-12 text-right">
                                        {formatDuration(video.duration)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* Footer Actions */}
            <div className="p-4 border-t border-light-border dark:border-dark-border flex gap-2 bg-light-surface dark:bg-dark-surface">
                <button
                    onClick={onCancel}
                    className="flex-1 py-2 border border-light-border dark:border-dark-border rounded-lg hover:bg-light-surface dark:hover:bg-dark-bg text-sm font-medium transition-colors"
                >
                    Cancel
                </button>
                <button
                    onClick={() => onSave(items)}
                    className="flex-1 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm font-medium transition-colors"
                >
                    Save Changes
                </button>
            </div>
        </div>
    )
}

export default BulkEditPlaylist
