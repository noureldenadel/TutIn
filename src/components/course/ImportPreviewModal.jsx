import { useState, useRef, useEffect } from 'react'
import {
    X, Upload, Folder, FolderOpen, Video, Clock, AlertTriangle,
    ChevronDown, ChevronRight, Image
} from 'lucide-react'
import { formatDuration } from '../../utils/db'
import { useNotification } from '../../contexts/NotificationContext'

/**
 * Count total videos recursively including sub-modules
 */
function countAllVideos(modules) {
    return modules.reduce((sum, m) => {
        const ownVideos = m.videos?.length || 0
        const childVideos = m.subModules ? countAllVideos(m.subModules) : 0
        return sum + ownVideos + childVideos
    }, 0)
}

/**
 * Count total sub-modules recursively
 */
function countAllSubModules(modules) {
    return modules.reduce((sum, m) => {
        const childCount = m.subModules ? m.subModules.length + countAllSubModules(m.subModules) : 0
        return sum + childCount
    }, 0)
}

/**
 * Sum total duration recursively
 */
function sumAllDuration(modules) {
    return modules.reduce((sum, m) => sum + (m.totalDuration || 0), 0)
}

function ImportPreviewModal({
    courseStructure,
    onConfirm,
    onCancel,
    isImporting,
    existingCourseNames = []
}) {
    const [courseName, setCourseName] = useState(courseStructure?.title || '')
    const [instructor, setInstructor] = useState('')
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
    const { showNotification } = useNotification()

    // Sync courseStructure prop changes to state
    useEffect(() => {
        if (courseStructure) {
            setCourseName(courseStructure.title || '')
            setInstructor('')
            setThumbnail(courseStructure.thumbnailData || null)
            setThumbnailPreview(courseStructure.thumbnailData || null)
            setModules(
                courseStructure.modules?.map(m => ({
                    ...m,
                    isEditing: false,
                    editedTitle: m.title
                })) || []
            )
        }
    }, [courseStructure])

    // Check for duplicate course name
    const isDuplicate = existingCourseNames.some(
        name => name.toLowerCase() === courseName.toLowerCase()
    )

    function toggleModule(moduleKey) {
        setExpandedModules(prev => ({
            ...prev,
            [moduleKey]: !prev[moduleKey]
        }))
    }

    function handleThumbnailUpload(e) {
        const file = e.target.files?.[0]
        if (!file) return

        if (!file.type.startsWith('image/')) {
            showNotification('Please select an image file', 'warning')
            return
        }

        if (file.size > 2 * 1024 * 1024) {
            showNotification('Image must be less than 2MB', 'warning')
            return
        }

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
            instructor: instructor,
            thumbnailData: thumbnail,
            modules: modules.map(m => ({
                ...m,
                title: m.title
            }))
        })
    }

    const totalVideos = countAllVideos(modules)
    const totalSubModules = countAllSubModules(modules)
    const totalDuration = sumAllDuration(modules)

    if (!courseStructure) return null

    /**
     * Render a module and its children recursively
     */
    function renderModule(module, key, depth = 0) {
        const moduleKey = `${depth}-${key}`
        const isExpanded = expandedModules[moduleKey]
        const hasChildren = (module.subModules && module.subModules.length > 0) || (module.videos && module.videos.length > 0)
        const hasSubModules = module.subModules && module.subModules.length > 0
        const videoCount = module.videos?.length || 0
        const isSubModule = depth > 0

        return (
            <div
                key={moduleKey}
                className={depth === 0 ? 'border-b border-light-border dark:border-dark-border last:border-b-0' : ''}
            >
                {/* Module Header */}
                <div
                    className={`flex items-center gap-2 p-2.5 group cursor-pointer hover:bg-light-surface/50 dark:hover:bg-dark-bg/50 transition-colors ${
                        depth === 0 ? 'bg-light-surface dark:bg-dark-bg' : ''
                    }`}
                    style={{ paddingLeft: `${12 + depth * 20}px` }}
                    onClick={() => toggleModule(moduleKey)}
                >
                    {hasChildren ? (
                        <button className="p-0.5 hover:bg-light-bg dark:hover:bg-dark-surface rounded transition-colors">
                            {isExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5" />
                            ) : (
                                <ChevronRight className="w-3.5 h-3.5" />
                            )}
                        </button>
                    ) : (
                        <span className="w-4.5" />
                    )}

                    {isSubModule ? (
                        <FolderOpen className="w-4 h-4 text-primary/70 flex-shrink-0" />
                    ) : (
                        <Folder className="w-4 h-4 text-primary flex-shrink-0" />
                    )}

                    <span className={`flex-1 truncate text-sm ${depth === 0 ? 'font-medium' : ''}`}>
                        {module.title}
                    </span>

                    <div className="flex items-center gap-2 flex-shrink-0">
                        {hasSubModules && (
                            <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary px-1.5 py-0.5 bg-light-bg dark:bg-dark-surface rounded">
                                {module.subModules.length} sub
                            </span>
                        )}
                        {videoCount > 0 && (
                            <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary px-1.5 py-0.5 bg-light-bg dark:bg-dark-surface rounded">
                                {videoCount} video{videoCount !== 1 ? 's' : ''}
                            </span>
                        )}
                    </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                    <div>
                        {/* Sub-modules first */}
                        {module.subModules?.map((subModule, subIndex) =>
                            renderModule(subModule, subIndex, depth + 1)
                        )}

                        {/* Direct videos */}
                        {module.videos && module.videos.length > 0 && (
                            <div className="py-1" style={{ paddingLeft: `${32 + depth * 20}px` }}>
                                {module.videos.map((video, videoIndex) => (
                                    <div
                                        key={videoIndex}
                                        className="flex items-center gap-2 py-1 pr-3 text-sm"
                                    >
                                        <Video className="w-3 h-3 text-light-text-secondary dark:text-dark-text-secondary flex-shrink-0" />
                                        <span className="flex-1 truncate text-light-text-secondary dark:text-dark-text-secondary">
                                            {video.title}
                                        </span>
                                        <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary flex-shrink-0">
                                            {formatDuration(video.duration)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        )
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50" onClick={onCancel} />

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
                        <label className="block text-sm font-medium mb-2">Course Name</label>
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
                                        <span>A course with this name already exists.</span>
                                    </div>
                                )}
                            </div>
                            <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                                {courseName.length}/200
                            </span>
                        </div>
                    </div>

                    {/* Instructor */}
                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Instructor <span className="text-light-text-secondary dark:text-dark-text-secondary font-normal">(optional)</span>
                        </label>
                        <input
                            type="text"
                            value={instructor}
                            onChange={(e) => setInstructor(e.target.value.slice(0, 100))}
                            className="w-full px-3 py-2 rounded-lg border border-light-border dark:border-dark-border bg-white dark:bg-dark-bg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                            placeholder="Enter instructor name"
                            maxLength={100}
                        />
                    </div>

                    {/* Thumbnail */}
                    <div>
                        <label className="block text-sm font-medium mb-2">Thumbnail (optional)</label>
                        <div className="flex items-start gap-4">
                            <div className="w-32 h-20 rounded-lg border-2 border-dashed border-light-border dark:border-dark-border overflow-hidden flex items-center justify-center bg-light-surface dark:bg-dark-bg">
                                {thumbnailPreview ? (
                                    <img src={thumbnailPreview} alt="Thumbnail preview" className="w-full h-full object-cover" />
                                ) : (
                                    <Image className="w-8 h-8 text-light-text-secondary dark:text-dark-text-secondary" />
                                )}
                            </div>
                            <div className="flex flex-col gap-2">
                                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleThumbnailUpload} className="hidden" id="thumbnail-upload" />
                                <label htmlFor="thumbnail-upload" className="inline-flex items-center gap-2 px-3 py-1.5 text-sm border border-light-border dark:border-dark-border rounded-lg hover:bg-light-surface dark:hover:bg-dark-bg cursor-pointer transition-colors">
                                    <Upload className="w-4 h-4" />
                                    Upload Image
                                </label>
                                {thumbnail && (
                                    <button onClick={removeThumbnail} className="text-sm text-error hover:underline text-left">Remove</button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Course Summary */}
                    <div className="flex items-center gap-6 p-4 bg-light-surface dark:bg-dark-bg rounded-lg flex-wrap">
                        <div className="flex items-center gap-2">
                            <Folder className="w-5 h-5 text-primary" />
                            <span className="font-medium">{modules.length}</span>
                            <span className="text-light-text-secondary dark:text-dark-text-secondary">
                                module{modules.length !== 1 ? 's' : ''}
                            </span>
                        </div>
                        {totalSubModules > 0 && (
                            <div className="flex items-center gap-2">
                                <FolderOpen className="w-5 h-5 text-primary/70" />
                                <span className="font-medium">{totalSubModules}</span>
                                <span className="text-light-text-secondary dark:text-dark-text-secondary">
                                    sub-module{totalSubModules !== 1 ? 's' : ''}
                                </span>
                            </div>
                        )}
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
                            <span className="text-light-text-secondary dark:text-dark-text-secondary">total</span>
                        </div>
                    </div>

                    {/* Module List */}
                    <div>
                        <label className="block text-sm font-medium mb-2">Detected Structure</label>
                        <div className="border border-light-border dark:border-dark-border rounded-lg overflow-hidden">
                            {modules.map((module, moduleIndex) =>
                                renderModule(module, moduleIndex, 0)
                            )}
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
