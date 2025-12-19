import { useState, useEffect, useRef } from 'react'
import { X, Folder, GripVertical, Check, Video, Clock, Pencil } from 'lucide-react'
import { updateModule, updateVideo, formatDuration } from '../../utils/db'
import { validateModuleTitle, sanitizeHTML } from '../../utils/validation'

function EditModuleModal({ module, isOpen, onClose, onSave }) {
    const [moduleName, setModuleName] = useState('')
    const [videos, setVideos] = useState([])
    const [editingVideoId, setEditingVideoId] = useState(null)
    const [editingVideoTitle, setEditingVideoTitle] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState(null)
    const [draggedIndex, setDraggedIndex] = useState(null)
    const editInputRef = useRef(null)

    useEffect(() => {
        if (module && isOpen) {
            setModuleName(module.title || '')
            setVideos(module.videos?.map((v, i) => ({ ...v, order: v.order ?? i })) || [])
            setError(null)
            setEditingVideoId(null)
        }
    }, [module, isOpen])

    useEffect(() => {
        if (editingVideoId && editInputRef.current) {
            editInputRef.current.focus()
            editInputRef.current.select()
        }
    }, [editingVideoId])

    if (!isOpen || !module) return null

    function startEditVideo(video) {
        setEditingVideoId(video.id)
        setEditingVideoTitle(video.title)
    }

    function cancelEditVideo() {
        setEditingVideoId(null)
        setEditingVideoTitle('')
    }

    function saveVideoTitle(videoId) {
        if (!editingVideoTitle.trim()) {
            cancelEditVideo()
            return
        }
        setVideos(prev => prev.map(v =>
            v.id === videoId ? { ...v, title: sanitizeHTML(editingVideoTitle.trim()) } : v
        ))
        cancelEditVideo()
    }

    function handleVideoKeyDown(e, videoId) {
        if (e.key === 'Enter') {
            e.preventDefault()
            saveVideoTitle(videoId)
        } else if (e.key === 'Escape') {
            cancelEditVideo()
        }
    }

    // Drag and drop handlers
    function handleDragStart(e, index) {
        setDraggedIndex(index)
        e.dataTransfer.effectAllowed = 'move'
    }

    function handleDragOver(e, index) {
        e.preventDefault()
        if (draggedIndex === null || draggedIndex === index) return

        const newVideos = [...videos]
        const [draggedVideo] = newVideos.splice(draggedIndex, 1)
        newVideos.splice(index, 0, draggedVideo)

        // Update order values
        newVideos.forEach((v, i) => { v.order = i })

        setVideos(newVideos)
        setDraggedIndex(index)
    }

    function handleDragEnd() {
        setDraggedIndex(null)
    }

    async function handleSave() {
        const titleValidation = validateModuleTitle(moduleName)
        if (!titleValidation.valid) {
            setError(titleValidation.error)
            return
        }

        try {
            setIsSaving(true)

            // Save module name
            await updateModule(module.id, {
                title: titleValidation.sanitized,
                updatedAt: new Date().toISOString()
            })

            // Save video changes (titles and order)
            for (const video of videos) {
                const originalVideo = module.videos?.find(v => v.id === video.id)
                if (originalVideo && (originalVideo.title !== video.title || originalVideo.order !== video.order)) {
                    await updateVideo(video.id, {
                        title: video.title,
                        order: video.order,
                        updatedAt: new Date().toISOString()
                    })
                }
            }

            onSave?.()
            onClose()
        } catch (err) {
            console.error('Failed to save module:', err)
            setError('Failed to save. Please try again.')
        } finally {
            setIsSaving(false)
        }
    }

    const hasChanges = moduleName !== module.title ||
        videos.some((v, i) => {
            const original = module.videos?.[i]
            return original && (original.title !== v.title || original.order !== v.order)
        })

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />

            <div className="relative bg-white dark:bg-dark-surface rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col animate-scale-in">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <Folder className="w-5 h-5 text-primary" />
                        Edit Module
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-light-surface dark:hover:bg-dark-bg rounded-lg">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {error && (
                        <div className="p-3 bg-error/10 text-error rounded-lg text-sm">{error}</div>
                    )}

                    {/* Module Name */}
                    <div>
                        <label className="block text-sm font-medium mb-2">Module Name</label>
                        <input
                            type="text"
                            value={moduleName}
                            onChange={(e) => setModuleName(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-light-border dark:border-dark-border bg-white dark:bg-dark-bg focus:ring-2 focus:ring-primary outline-none"
                            placeholder="Module name"
                            maxLength={200}
                        />
                    </div>

                    {/* Videos List */}
                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Videos ({videos.length})
                            <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary ml-2">
                                Drag to reorder • Click to rename
                            </span>
                        </label>
                        <div className="space-y-1 max-h-64 overflow-y-auto border border-light-border dark:border-dark-border rounded-lg">
                            {videos.map((video, index) => (
                                <div
                                    key={video.id}
                                    draggable={editingVideoId !== video.id}
                                    onDragStart={(e) => handleDragStart(e, index)}
                                    onDragOver={(e) => handleDragOver(e, index)}
                                    onDragEnd={handleDragEnd}
                                    className={`flex items-center gap-2 p-2 ${draggedIndex === index ? 'bg-primary/10' : 'hover:bg-light-surface dark:hover:bg-dark-bg'
                                        } ${index > 0 ? 'border-t border-light-border dark:border-dark-border' : ''}`}
                                >
                                    {/* Drag Handle */}
                                    <div className="cursor-grab text-light-text-secondary dark:text-dark-text-secondary">
                                        <GripVertical className="w-4 h-4" />
                                    </div>

                                    {/* Video Icon & Completion */}
                                    <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${video.isCompleted ? 'bg-success text-white' : 'bg-light-surface dark:bg-dark-bg'
                                        }`}>
                                        {video.isCompleted ? <Check className="w-3 h-3" /> : <Video className="w-3 h-3 text-light-text-secondary" />}
                                    </div>

                                    {/* Title (editable) */}
                                    <div className="flex-1 min-w-0">
                                        {editingVideoId === video.id ? (
                                            <input
                                                ref={editInputRef}
                                                type="text"
                                                value={editingVideoTitle}
                                                onChange={(e) => setEditingVideoTitle(e.target.value)}
                                                onBlur={() => saveVideoTitle(video.id)}
                                                onKeyDown={(e) => handleVideoKeyDown(e, video.id)}
                                                className="w-full px-2 py-1 text-sm rounded border border-primary bg-white dark:bg-dark-bg outline-none"
                                                maxLength={200}
                                            />
                                        ) : (
                                            <button
                                                onClick={() => startEditVideo(video)}
                                                className="w-full text-left text-sm truncate hover:text-primary flex items-center gap-1 group"
                                            >
                                                <span className="truncate">{video.title}</span>
                                                <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-50 flex-shrink-0" />
                                            </button>
                                        )}
                                    </div>

                                    {/* Duration */}
                                    <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary flex items-center gap-1 flex-shrink-0">
                                        <Clock className="w-3 h-3" />
                                        {formatDuration(video.duration)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Module Info */}
                    <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                        Original: {module.originalTitle}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 p-4 border-t border-light-border dark:border-dark-border">
                    <button onClick={onClose} className="px-4 py-2 text-sm border border-light-border dark:border-dark-border rounded-lg hover:bg-light-surface dark:hover:bg-dark-bg" disabled={isSaving}>
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving || !moduleName.trim()}
                        className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50 flex items-center gap-2"
                    >
                        {isSaving ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving...</> : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default EditModuleModal
