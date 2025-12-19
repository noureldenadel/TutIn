import { useState, useRef } from 'react'
import {
    X, Upload, Folder, Video, Clock, AlertTriangle,
    ChevronDown, ChevronRight, Pencil, Check, Image
} from 'lucide-react'
import { formatDuration } from '../../utils/db'

function ImportPreviewModal({
    courseStructure,
    onConfirm,
    onCancel,
    isImporting,
    existingCourseNames = []
}) {
    const [courseName, setCourseName] = useState(courseStructure?.title || '')
    const [modules, setModules] = useState(
        courseStructure?.modules?.map(m => ({
            ...m,
            isEditing: false,
            editedTitle: m.title
        })) || []
    )
    const [thumbnail, setThumbnail] = useState(null)
    const [thumbnailPreview, setThumbnailPreview] = useState(null)
    const [expandedModules, setExpandedModules] = useState({})
    const fileInputRef = useRef(null)

    // Check for duplicate course name
    const isDuplicate = existingCourseNames.some(
        name => name.toLowerCase() === courseName.toLowerCase()
    )

    function toggleModule(moduleIndex) {
        setExpandedModules(prev => ({
            ...prev,
            [moduleIndex]: !prev[moduleIndex]
        }))
    }

    function startEditingModule(moduleIndex) {
        setModules(prev => prev.map((m, i) => ({
            ...m,
            isEditing: i === moduleIndex,
            editedTitle: i === moduleIndex ? m.title : m.editedTitle
        })))
    }

    function saveModuleEdit(moduleIndex) {
        setModules(prev => prev.map((m, i) => ({
            ...m,
            title: i === moduleIndex ? m.editedTitle : m.title,
            isEditing: false
        })))
    }

    function cancelModuleEdit(moduleIndex) {
        setModules(prev => prev.map((m, i) => ({
            ...m,
            isEditing: false,
            editedTitle: m.title
        })))
    }

    function handleThumbnailUpload(e) {
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

        // Create preview
        const reader = new FileReader()
        reader.onload = (event) => {
            setThumbnailPreview(event.target.result)
            setThumbnail(event.target.result)
        }
        reader.readAsDataURL(file)
    }

    function removeThumbnail() {
        setThumbnail(null)
        setThumbnailPreview(null)
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }

    function handleConfirm() {
        onConfirm({
            title: courseName,
            thumbnailData: thumbnail,
            modules: modules.map(m => ({
                ...m,
                title: m.title
            }))
        })
    }

    const totalVideos = modules.reduce((sum, m) => sum + (m.videos?.length || 0), 0)
    const totalDuration = modules.reduce((sum, m) => sum + (m.totalDuration || 0), 0)

    // Don't render if no course structure
    if (!courseStructure) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50"
                onClick={onCancel}
            />

            {/* Modal */}
            <div className="relative bg-white dark:bg-dark-surface rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-scale-in">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border">
                    <h2 className="text-xl font-semibold text-light-text-primary dark:text-dark-text-primary">
                        Import Course
                    </h2>
                    <button
                        onClick={onCancel}
                        className="p-2 hover:bg-light-surface dark:hover:bg-dark-bg rounded-lg transition-colors"
                        aria-label="Close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    {/* Course Name */}
                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Course Name
                        </label>
                        <input
                            type="text"
                            value={courseName}
                            onChange={(e) => setCourseName(e.target.value.slice(0, 200))}
                            className={`w-full px-3 py-2 rounded-lg border ${courseName.trim().length === 0
                                ? 'border-error'
                                : 'border-light-border dark:border-dark-border'
                                } bg-white dark:bg-dark-bg focus:ring-2 focus:ring-primary focus:border-transparent outline-none`}
                            placeholder="Enter course name"
                            maxLength={200}
                        />
                        <div className="flex items-center justify-between mt-1">
                            <div>
                                {courseName.trim().length === 0 && (
                                    <span className="text-error text-sm">Course name is required</span>
                                )}
                                {isDuplicate && courseName.trim().length > 0 && (
                                    <div className="flex items-center gap-2 text-warning text-sm">
                                        <AlertTriangle className="w-4 h-4" />
                                        <span>A course with this name already exists. It will be imported as a new version.</span>
                                    </div>
                                )}
                            </div>
                            <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                                {courseName.length}/200
                            </span>
                        </div>
                    </div>

                    {/* Thumbnail */}
                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Thumbnail (optional)
                        </label>
                        <div className="flex items-start gap-4">
                            {/* Preview */}
                            <div className="w-32 h-20 rounded-lg border-2 border-dashed border-light-border dark:border-dark-border overflow-hidden flex items-center justify-center bg-light-surface dark:bg-dark-bg">
                                {thumbnailPreview ? (
                                    <img
                                        src={thumbnailPreview}
                                        alt="Thumbnail preview"
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <Image className="w-8 h-8 text-light-text-secondary dark:text-dark-text-secondary" />
                                )}
                            </div>

                            {/* Upload Controls */}
                            <div className="flex flex-col gap-2">
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleThumbnailUpload}
                                    className="hidden"
                                    id="thumbnail-upload"
                                />
                                <label
                                    htmlFor="thumbnail-upload"
                                    className="inline-flex items-center gap-2 px-3 py-1.5 text-sm border border-light-border dark:border-dark-border rounded-lg hover:bg-light-surface dark:hover:bg-dark-bg cursor-pointer transition-colors"
                                >
                                    <Upload className="w-4 h-4" />
                                    Upload Image
                                </label>
                                {thumbnail && (
                                    <button
                                        onClick={removeThumbnail}
                                        className="text-sm text-error hover:underline text-left"
                                    >
                                        Remove
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Course Summary */}
                    <div className="flex items-center gap-6 p-4 bg-light-surface dark:bg-dark-bg rounded-lg">
                        <div className="flex items-center gap-2">
                            <Folder className="w-5 h-5 text-primary" />
                            <span className="font-medium">{modules.length}</span>
                            <span className="text-light-text-secondary dark:text-dark-text-secondary">
                                module{modules.length !== 1 ? 's' : ''}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Video className="w-5 h-5 text-primary" />
                            <span className="font-medium">{totalVideos}</span>
                            <span className="text-light-text-secondary dark:text-dark-text-secondary">
                                video{totalVideos !== 1 ? 's' : ''}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Clock className="w-5 h-5 text-primary" />
                            <span className="font-medium">{formatDuration(totalDuration)}</span>
                            <span className="text-light-text-secondary dark:text-dark-text-secondary">
                                total
                            </span>
                        </div>
                    </div>

                    {/* Module List */}
                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Detected Structure
                        </label>
                        <div className="border border-light-border dark:border-dark-border rounded-lg overflow-hidden">
                            {modules.map((module, moduleIndex) => (
                                <div
                                    key={moduleIndex}
                                    className="border-b border-light-border dark:border-dark-border last:border-b-0"
                                >
                                    {/* Module Header */}
                                    <div className="flex items-center gap-2 p-3 bg-light-surface dark:bg-dark-bg">
                                        <button
                                            onClick={() => toggleModule(moduleIndex)}
                                            className="p-1 hover:bg-light-bg dark:hover:bg-dark-surface rounded transition-colors"
                                        >
                                            {expandedModules[moduleIndex] ? (
                                                <ChevronDown className="w-4 h-4" />
                                            ) : (
                                                <ChevronRight className="w-4 h-4" />
                                            )}
                                        </button>

                                        {module.isEditing ? (
                                            <div className="flex-1 flex items-center gap-2">
                                                <input
                                                    type="text"
                                                    value={module.editedTitle}
                                                    onChange={(e) => setModules(prev =>
                                                        prev.map((m, i) =>
                                                            i === moduleIndex
                                                                ? { ...m, editedTitle: e.target.value }
                                                                : m
                                                        )
                                                    )}
                                                    className="flex-1 px-2 py-1 text-sm rounded border border-primary focus:outline-none bg-white dark:bg-dark-surface"
                                                    autoFocus
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') saveModuleEdit(moduleIndex)
                                                        if (e.key === 'Escape') cancelModuleEdit(moduleIndex)
                                                    }}
                                                />
                                                <button
                                                    onClick={() => saveModuleEdit(moduleIndex)}
                                                    className="p-1 text-success hover:bg-success/10 rounded"
                                                >
                                                    <Check className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => cancelModuleEdit(moduleIndex)}
                                                    className="p-1 text-error hover:bg-error/10 rounded"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <Folder className="w-4 h-4 text-primary" />
                                                <span className="flex-1 font-medium text-sm truncate">
                                                    {module.title}
                                                </span>
                                                <button
                                                    onClick={() => startEditingModule(moduleIndex)}
                                                    className="p-1 opacity-0 group-hover:opacity-100 hover:bg-light-bg dark:hover:bg-dark-surface rounded transition-all"
                                                >
                                                    <Pencil className="w-3 h-3" />
                                                </button>
                                            </>
                                        )}

                                        <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary px-2 py-0.5 bg-light-bg dark:bg-dark-surface rounded">
                                            {module.videos?.length || 0} videos
                                        </span>
                                    </div>

                                    {/* Videos List */}
                                    {expandedModules[moduleIndex] && module.videos && (
                                        <div className="pl-10 pr-3 py-2 space-y-1">
                                            {module.videos.map((video, videoIndex) => (
                                                <div
                                                    key={videoIndex}
                                                    className="flex items-center gap-2 py-1 text-sm"
                                                >
                                                    <Video className="w-3 h-3 text-light-text-secondary dark:text-dark-text-secondary" />
                                                    <span className="flex-1 truncate text-light-text-secondary dark:text-dark-text-secondary">
                                                        {video.title}
                                                    </span>
                                                    <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                                                        {formatDuration(video.duration)}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-4 border-t border-light-border dark:border-dark-border">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm font-medium border border-light-border dark:border-dark-border rounded-lg hover:bg-light-surface dark:hover:bg-dark-bg transition-colors"
                        disabled={isImporting}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={!courseName.trim() || isImporting}
                        className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isImporting ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                Importing...
                            </>
                        ) : (
                            <>
                                <Upload className="w-4 h-4" />
                                Import Course
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default ImportPreviewModal
