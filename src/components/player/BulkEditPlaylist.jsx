import { useState, useRef, useEffect } from 'react'
import { GripVertical, Folder, Video, ChevronDown, ChevronRight } from 'lucide-react'
import { formatDuration } from '../../utils/db'

function BulkEditPlaylist({ modules: initialModules, onSave, onCancel }) {
    const [items, setItems] = useState(initialModules)
    // Drag state
    const [draggedItem, setDraggedItem] = useState(null) // { type: 'module'|'video', id, parentId (moduleId) }
    const [dragOverItem, setDragOverItem] = useState(null) // ID of item being hovered

    useEffect(() => {
        setItems(initialModules)
    }, [initialModules])

    // -- Helpers --

    function updateItemInTree(tree, itemId, type, updater) {
        return tree.map(item => {
            if (type === 'module' && item.id === itemId) {
                return updater(item)
            }

            // Check if it's a video in this module
            if (type === 'video' && item.videos) {
                const videoIndex = item.videos.findIndex(v => v.id === itemId)
                if (videoIndex !== -1) {
                    const newVideos = [...item.videos]
                    newVideos[videoIndex] = updater(newVideos[videoIndex])
                    return { ...item, videos: newVideos }
                }
            }

            // Recurse into sub-modules
            if (item.subModules && item.subModules.length > 0) {
                return {
                    ...item,
                    subModules: updateItemInTree(item.subModules, itemId, type, updater)
                }
            }

            return item
        })
    }

    // -- Handlers --

    function handleRenameModule(moduleId, newTitle) {
        setItems(prev => updateItemInTree(prev, moduleId, 'module', m => ({ ...m, title: newTitle })))
    }

    function handleRenameVideo(videoId, newTitle) {
        setItems(prev => updateItemInTree(prev, videoId, 'video', v => ({ ...v, title: newTitle })))
    }

    // -- Drag & Drop Logic --

    function handleDragStart(e, item, type, parentId = null) {
        setDraggedItem({ ...item, type, parentId })
        e.dataTransfer.effectAllowed = 'move'
    }

    function handleDragOver(e, targetId, targetType, targetParentId = null) {
        e.preventDefault()
        if (!draggedItem) return
        if (draggedItem.id === targetId) return

        // Only allow reordering within the same parent
        if (draggedItem.parentId !== targetParentId) return
        if (draggedItem.type !== targetType) return

        setDragOverItem(targetId)

        // Perform reorder
        setItems(prev => {
            function reorderInLevel(level) {
                // If the items are at this level
                if (draggedItem.type === 'module') {
                    const oldIndex = level.findIndex(m => m.id === draggedItem.id)
                    const newIndex = level.findIndex(m => m.id === targetId)
                    if (oldIndex !== -1 && newIndex !== -1) {
                        const nextLevel = [...level]
                        const [removed] = nextLevel.splice(oldIndex, 1)
                        nextLevel.splice(newIndex, 0, removed)
                        return nextLevel
                    }
                }

                // If it's videos, they are inside a module's videos array
                // We need to find the module that contains these videos
                return level.map(mod => {
                    if (draggedItem.type === 'video' && mod.id === draggedItem.parentId) {
                        const oldIndex = mod.videos.findIndex(v => v.id === draggedItem.id)
                        const newIndex = mod.videos.findIndex(v => v.id === targetId)
                        if (oldIndex !== -1 && newIndex !== -1) {
                            const nextVideos = [...mod.videos]
                            const [removed] = nextVideos.splice(oldIndex, 1)
                            nextVideos.splice(newIndex, 0, removed)
                            return { ...mod, videos: nextVideos }
                        }
                    }

                    if (mod.subModules && mod.subModules.length > 0) {
                        return { ...mod, subModules: reorderInLevel(mod.subModules) }
                    }
                    return mod
                })
            }

            // Special case: dragging top-level modules
            if (draggedItem.type === 'module' && draggedItem.parentId === null) {
                const oldIndex = prev.findIndex(m => m.id === draggedItem.id)
                const newIndex = prev.findIndex(m => m.id === targetId)
                if (oldIndex !== -1 && newIndex !== -1) {
                    const nextItems = [...prev]
                    const [removed] = nextItems.splice(oldIndex, 1)
                    nextItems.splice(newIndex, 0, removed)
                    return nextItems
                }
            }

            return reorderInLevel(prev)
        })
    }

    function handleDragEnd() {
        setDraggedItem(null)
        setDragOverItem(null)
    }

    function renderModule(module, depth = 0, parentId = null) {
        const hasSubModules = module.subModules && module.subModules.length > 0
        const hasVideos = module.videos && module.videos.length > 0

        return (
            <div
                key={module.id}
                draggable
                onDragStart={(e) => {
                    e.stopPropagation()
                    handleDragStart(e, module, 'module', parentId)
                }}
                onDragOver={(e) => {
                    e.stopPropagation()
                    handleDragOver(e, module.id, 'module', parentId)
                }}
                onDragEnd={handleDragEnd}
                className={`
                    border border-light-border dark:border-dark-border rounded-lg overflow-hidden bg-light-surface dark:bg-dark-bg transition-all
                    ${draggedItem?.id === module.id ? 'opacity-50' : ''}
                    ${dragOverItem === module.id && draggedItem?.type === 'module' ? 'border-primary ring-1 ring-primary' : ''}
                    ${depth > 0 ? 'ml-6 mt-2' : ''}
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

                {/* Module Content */}
                <div className="bg-white dark:bg-dark-surface p-1">
                    {/* Sub-modules */}
                    <div className="space-y-2">
                        {module.subModules?.map(sub => renderModule(sub, depth + 1, module.id))}
                    </div>

                    {/* Videos List */}
                    <div className={hasSubModules && hasVideos ? "mt-2 pt-2 border-t border-light-border dark:border-dark-border" : ""}>
                        {hasVideos ? (
                            module.videos.map((video) => (
                                <div
                                    key={video.id}
                                    draggable
                                    onDragStart={(e) => {
                                        e.stopPropagation()
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
                                        ${dragOverItem === video.id && draggedItem?.type === 'video' ? 'bg-primary/10' : ''}
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
                            ))
                        ) : (
                            !hasSubModules && (
                                <div className="p-2 text-xs text-center text-light-text-secondary dark:text-dark-text-secondary italic">
                                    No videos
                                </div>
                            )
                        )}
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="h-full flex flex-col">
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {items.map((module) => renderModule(module, 0, null))}
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
