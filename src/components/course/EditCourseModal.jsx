import { useState, useRef, useEffect } from 'react'
import { X, Upload, Image, BookOpen, User, FileText, Trash2, Tag } from 'lucide-react'
import { updateCourse, formatDuration } from '../../utils/db'
import { validateCourseTitle, sanitizeHTML } from '../../utils/validation'

function EditCourseModal({ course, isOpen, onClose, onSave }) {
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        instructor: '',
        tags: [],
        thumbnailData: null
    })
    const [newTag, setNewTag] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [errors, setErrors] = useState({})
    const [isDragging, setIsDragging] = useState(false)
    const fileInputRef = useRef(null)

    useEffect(() => {
        if (course && isOpen) {
            setFormData({
                title: course.title || '',
                description: course.description || '',
                instructor: course.instructor || '',
                tags: course.tags || [],
                thumbnailData: course.thumbnailData || null
            })
            setErrors({})
            setNewTag('')
        }
    }, [course, isOpen])

    if (!isOpen || !course) return null

    function handleChange(field, value) {
        setFormData(prev => ({ ...prev, [field]: value }))
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: null }))
        }
    }

    async function handleThumbnailUpload(file) {
        if (!file) return
        if (!file.type.startsWith('image/')) {
            setErrors(prev => ({ ...prev, thumbnail: 'Please select an image file' }))
            return
        }
        if (file.size > 5 * 1024 * 1024) {
            setErrors(prev => ({ ...prev, thumbnail: 'Image must be less than 5MB' }))
            return
        }

        try {
            const compressed = await compressImage(file, 200 * 1024)
            setFormData(prev => ({ ...prev, thumbnailData: compressed }))
            setErrors(prev => ({ ...prev, thumbnail: null }))
        } catch (err) {
            setErrors(prev => ({ ...prev, thumbnail: 'Failed to process image' }))
        }
    }

    async function compressImage(file, maxSizeBytes) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = (e) => {
                const img = new window.Image()
                img.onload = () => {
                    const canvas = document.createElement('canvas')
                    let width = img.width
                    let height = img.height
                    const maxDimension = 800
                    if (width > maxDimension || height > maxDimension) {
                        if (width > height) {
                            height = (height / width) * maxDimension
                            width = maxDimension
                        } else {
                            width = (width / height) * maxDimension
                            height = maxDimension
                        }
                    }
                    canvas.width = width
                    canvas.height = height
                    const ctx = canvas.getContext('2d')
                    ctx.drawImage(img, 0, 0, width, height)
                    let quality = 0.9
                    let result = canvas.toDataURL('image/jpeg', quality)
                    while (result.length > maxSizeBytes * 1.37 && quality > 0.1) {
                        quality -= 0.1
                        result = canvas.toDataURL('image/jpeg', quality)
                    }
                    resolve(result)
                }
                img.onerror = reject
                img.src = e.target.result
            }
            reader.onerror = reject
            reader.readAsDataURL(file)
        })
    }

    function handleDragOver(e) {
        e.preventDefault()
        setIsDragging(true)
    }

    function handleDragLeave(e) {
        e.preventDefault()
        setIsDragging(false)
    }

    function handleDrop(e) {
        e.preventDefault()
        setIsDragging(false)
        const file = e.dataTransfer.files[0]
        if (file) handleThumbnailUpload(file)
    }

    function handleFileInputChange(e) {
        const file = e.target.files?.[0]
        if (file) handleThumbnailUpload(file)
    }

    function removeThumbnail() {
        setFormData(prev => ({ ...prev, thumbnailData: null }))
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    function handleAddTag() {
        const tag = newTag.trim()
        if (tag && !formData.tags.includes(tag) && formData.tags.length < 10) {
            setFormData(prev => ({ ...prev, tags: [...prev.tags, sanitizeHTML(tag)] }))
            setNewTag('')
        }
    }

    function handleRemoveTag(tagToRemove) {
        setFormData(prev => ({
            ...prev,
            tags: prev.tags.filter(tag => tag !== tagToRemove)
        }))
    }

    function handleTagKeyDown(e) {
        if (e.key === 'Enter') {
            e.preventDefault()
            handleAddTag()
        }
    }

    async function handleSave() {
        const titleValidation = validateCourseTitle(formData.title)
        if (!titleValidation.valid) {
            setErrors({ title: titleValidation.error })
            return
        }

        try {
            setIsSaving(true)
            await updateCourse(course.id, {
                title: titleValidation.sanitized,
                description: sanitizeHTML(formData.description),
                instructor: sanitizeHTML(formData.instructor),
                tags: formData.tags,
                thumbnailData: formData.thumbnailData,
                updatedAt: new Date().toISOString()
            })
            onSave?.()
            onClose()
        } catch (err) {
            console.error('Failed to save course:', err)
            setErrors({ general: 'Failed to save changes.' })
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />

            <div className="relative bg-white dark:bg-dark-surface rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col animate-scale-in">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border">
                    <h2 className="text-xl font-semibold">Edit Course</h2>
                    <button onClick={onClose} className="p-2 hover:bg-light-surface dark:hover:bg-dark-bg rounded-lg">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {errors.general && (
                        <div className="p-3 bg-error/10 text-error rounded-lg text-sm">{errors.general}</div>
                    )}

                    {/* Thumbnail */}
                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Thumbnail
                        </label>
                        <div className="flex items-start gap-4">
                            <div
                                className={`w-40 h-24 rounded-lg border-2 border-dashed overflow-hidden flex items-center justify-center cursor-pointer transition-colors ${isDragging ? 'border-primary bg-primary/10' : 'border-light-border dark:border-dark-border hover:border-primary'
                                    }`}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                {formData.thumbnailData ? (
                                    <img src={formData.thumbnailData} alt="Thumbnail" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="text-center p-2">
                                        <Upload className="w-6 h-6 mx-auto text-light-text-secondary dark:text-dark-text-secondary" />
                                        <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">Drop or click</span>
                                    </div>
                                )}
                            </div>
                            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileInputChange} className="hidden" />
                            {formData.thumbnailData && (
                                <button onClick={removeThumbnail} className="text-sm text-error hover:underline flex items-center gap-1">
                                    <Trash2 className="w-3 h-3" />Remove
                                </button>
                            )}
                        </div>
                        {errors.thumbnail && <p className="text-error text-sm mt-1">{errors.thumbnail}</p>}
                    </div>

                    {/* Title */}
                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Title *
                        </label>
                        <input
                            type="text"
                            value={formData.title}
                            onChange={(e) => handleChange('title', e.target.value)}
                            className={`w-full px-3 py-2 rounded-lg border ${errors.title ? 'border-error' : 'border-light-border dark:border-dark-border'} bg-white dark:bg-dark-bg focus:ring-2 focus:ring-primary outline-none`}
                            placeholder="Course title"
                            maxLength={200}
                        />
                        {errors.title && <p className="text-error text-sm mt-1">{errors.title}</p>}
                    </div>

                    {/* Instructor */}
                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Instructor
                        </label>
                        <input
                            type="text"
                            value={formData.instructor}
                            onChange={(e) => handleChange('instructor', e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-light-border dark:border-dark-border bg-white dark:bg-dark-bg focus:ring-2 focus:ring-primary outline-none"
                            placeholder="Instructor name"
                            maxLength={100}
                        />
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Description
                        </label>
                        <textarea
                            value={formData.description}
                            onChange={(e) => handleChange('description', e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-light-border dark:border-dark-border bg-white dark:bg-dark-bg focus:ring-2 focus:ring-primary outline-none resize-none"
                            placeholder="Course description, notes, URLs..."
                            rows={4}
                            maxLength={2000}
                        />
                    </div>

                    {/* Tags */}
                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Tags
                        </label>
                        <div className="flex gap-2 mb-2">
                            <input
                                type="text"
                                value={newTag}
                                onChange={(e) => setNewTag(e.target.value)}
                                onKeyDown={handleTagKeyDown}
                                className="flex-1 px-3 py-2 rounded-lg border border-light-border dark:border-dark-border bg-white dark:bg-dark-bg focus:ring-2 focus:ring-primary outline-none"
                                placeholder="Add a tag..."
                                maxLength={30}
                            />
                            <button
                                type="button"
                                onClick={handleAddTag}
                                disabled={!newTag.trim() || formData.tags.length >= 10}
                                className="px-4 py-2 bg-white/10 text-primary dark:text-white rounded-lg hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed border border-white/10"
                            >
                                Add
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {formData.tags.map((tag, index) => (
                                <span
                                    key={index}
                                    className="inline-flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary rounded-full text-sm"
                                >
                                    {tag}
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveTag(tag)}
                                        className="hover:bg-primary/20 rounded-full p-0.5"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </span>
                            ))}
                        </div>
                        {formData.tags.length >= 10 && (
                            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-2">
                                Maximum 10 tags reached
                            </p>
                        )}
                    </div>

                    {/* Course Stats */}
                    <div className="p-3 bg-light-surface dark:bg-dark-bg rounded-lg text-sm text-light-text-secondary dark:text-dark-text-secondary">
                        <div className="flex items-center gap-4">
                            <span>{course.totalVideos} videos</span>
                            <span>•</span>
                            <span>{formatDuration(course.totalDuration)}</span>
                            <span>•</span>
                            <span>{Math.round(course.completionPercentage || 0)}% complete</span>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 p-4 border-t border-light-border dark:border-dark-border">
                    <button onClick={onClose} className="px-4 py-2 text-sm border border-light-border dark:border-dark-border rounded-lg hover:bg-light-surface dark:hover:bg-dark-bg" disabled={isSaving}>
                        Cancel
                    </button>
                    <button onClick={handleSave} disabled={isSaving || !formData.title.trim()} className="px-4 py-2 text-sm bg-white/10 text-primary dark:text-white rounded-lg hover:bg-white/20 disabled:opacity-50 flex items-center gap-2 border border-white/10">
                        {isSaving ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving...</> : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default EditCourseModal
