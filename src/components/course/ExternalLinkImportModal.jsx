import { useState, useRef, useEffect } from 'react'
import { X, Upload, Link2, Trash2, Folder, Video, Clock, Image, Sparkles, Loader2 } from 'lucide-react'
import { useSettings } from '../../contexts/SettingsContext'
import { fetchPageMetadata, extractCourseStatsWithAI } from '../../utils/aiMetadataParser'

import { sanitizeHTML } from '../../utils/validation'

function ExternalLinkImportModal({ isOpen, onClose, onImport }) {
    const { settings } = useSettings()
    const defaultData = {
        courseUrl: '',
        title: '',
        instructor: '',
        thumbnailData: null,
        totalModules: '',
        totalVideos: '',
        hours: '',
        minutes: ''
    }

    const [formData, setFormData] = useState(defaultData)
    const [errors, setErrors] = useState({})
    const [isDragging, setIsDragging] = useState(false)
    const [isFetching, setIsFetching] = useState(false)
    const [fetchStatus, setFetchStatus] = useState('')
    const fileInputRef = useRef(null)

    useEffect(() => {
        if (isOpen) {
            setFormData(defaultData)
            setErrors({})
            setFetchStatus('')
        }
    }, [isOpen])

    if (!isOpen) return null

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

    function removeThumbnail() {
        setFormData(prev => ({ ...prev, thumbnailData: null }))
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    function validate() {
        const newErrors = {}
        if (!formData.courseUrl.trim()) {
            newErrors.courseUrl = 'URL is required'
        } else {
            try {
                new URL(formData.courseUrl)
            } catch {
                newErrors.courseUrl = 'Invalid URL format'
            }
        }
        
        if (!formData.title.trim()) {
            newErrors.title = 'Title is required'
        }

        setErrors(newErrors)
        return Object.keys(newErrors).length === 0
    }

    async function handleFetchMetadata() {
        const url = formData.courseUrl.trim()
        if (!url) {
            setErrors(prev => ({ ...prev, courseUrl: 'Enter a URL first' }))
            return
        }
        try {
            new URL(url)
        } catch {
            setErrors(prev => ({ ...prev, courseUrl: 'Invalid URL format' }))
            return
        }

        setIsFetching(true)
        setFetchStatus('Fetching page...')
        setErrors(prev => ({ ...prev, courseUrl: null }))

        try {
            // Step 1: Fetch basic metadata
            const meta = await fetchPageMetadata(url)

            // Auto-fill fields (only if currently empty, so we don't overwrite user edits)
            setFormData(prev => ({
                ...prev,
                title: prev.title || meta.title || '',
                instructor: prev.instructor || meta.siteName || '',
                thumbnailData: prev.thumbnailData || meta.thumbnail || null,
            }))

            if (meta.error) {
                setFetchStatus(`⚠ Partial fetch: ${meta.error}`)
                setIsFetching(false)
                return
            }

            // Step 2: AI extraction (if API key available and we got text)
            const apiKey = settings.openRouterApiKey
            if (apiKey && meta.textContent && meta.textContent.length > 100) {
                setFetchStatus('Analyzing with AI...')
                try {
                    const stats = await extractCourseStatsWithAI(
                        meta.textContent,
                        apiKey,
                        settings.openRouterModel
                    )
                    setFormData(prev => ({
                        ...prev,
                        totalModules: prev.totalModules || (stats.totalModules > 0 ? String(stats.totalModules) : ''),
                        totalVideos: prev.totalVideos || (stats.totalVideos > 0 ? String(stats.totalVideos) : ''),
                        hours: prev.hours || (stats.hours > 0 ? String(stats.hours) : ''),
                        minutes: prev.minutes || (stats.minutes > 0 ? String(stats.minutes) : ''),
                    }))
                    setFetchStatus('✓ Auto-filled successfully')
                } catch (aiErr) {
                    console.warn('[ExternalLink] AI extraction failed:', aiErr)
                    setFetchStatus('✓ Metadata filled (AI stats unavailable)')
                }
            } else {
                setFetchStatus(apiKey ? '✓ Metadata filled (page too short for AI)' : '✓ Metadata filled (no AI key)')
            }
        } catch (err) {
            console.error('[ExternalLink] Fetch failed:', err)
            setFetchStatus(`✗ Failed: ${err.message}`)
        } finally {
            setIsFetching(false)
        }
    }

    function handleImport() {
        if (!validate()) return

        const hours = parseInt(formData.hours) || 0
        const minutes = parseInt(formData.minutes) || 0
        const totalDuration = (hours * 3600) + (minutes * 60)

        const courseData = {
            sourceType: 'external-link',
            courseUrl: formData.courseUrl.trim(),
            title: sanitizeHTML(formData.title.trim()),
            instructor: sanitizeHTML(formData.instructor.trim()),
            thumbnailData: formData.thumbnailData,
            totalVideos: parseInt(formData.totalVideos) || 1,
            totalDuration: totalDuration,
            customMetadata: {
                totalModules: parseInt(formData.totalModules) || 1
            }
        }

        onImport(courseData)
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />

            <div className="relative bg-white dark:bg-dark-surface rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-scale-in">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border">
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                        <Link2 className="w-6 h-6 text-blue-500" />
                        Add External Link
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-light-surface dark:hover:bg-dark-bg rounded-lg transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    {/* URL + Fetch button */}
                    <div>
                        <label className="block text-sm font-medium mb-2">Course URL</label>
                        <div className="flex gap-2">
                            <input
                                type="url"
                                value={formData.courseUrl}
                                onChange={(e) => handleChange('courseUrl', e.target.value)}
                                className={`flex-1 px-3 py-2 rounded-lg border ${errors.courseUrl ? 'border-error' : 'border-light-border dark:border-dark-border'} bg-white dark:bg-dark-bg focus:ring-2 focus:ring-primary focus:border-transparent outline-none`}
                                placeholder="https://example.com/course"
                                disabled={isFetching}
                            />
                            <button
                                onClick={handleFetchMetadata}
                                disabled={isFetching || !formData.courseUrl.trim()}
                                className="px-4 py-2 text-sm font-medium bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 flex-shrink-0"
                                title="Auto-fill metadata from URL"
                            >
                                {isFetching ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Sparkles className="w-4 h-4" />
                                )}
                                {isFetching ? 'Fetching...' : 'Fetch'}
                            </button>
                        </div>
                        {errors.courseUrl && <p className="text-error text-sm mt-1">{errors.courseUrl}</p>}
                        {fetchStatus && (
                            <p className={`text-xs mt-1.5 ${fetchStatus.startsWith('✗') ? 'text-error' : fetchStatus.startsWith('⚠') ? 'text-warning' : 'text-light-text-secondary dark:text-dark-text-secondary'}`}>
                                {fetchStatus}
                            </p>
                        )}
                    </div>

                    {/* Title */}
                    <div>
                        <label className="block text-sm font-medium mb-2">Course Name</label>
                        <input
                            type="text"
                            value={formData.title}
                            onChange={(e) => handleChange('title', e.target.value.slice(0, 200))}
                            className={`w-full px-3 py-2 rounded-lg border ${errors.title ? 'border-error' : 'border-light-border dark:border-dark-border'} bg-white dark:bg-dark-bg focus:ring-2 focus:ring-primary focus:border-transparent outline-none`}
                            placeholder="Enter course name"
                            maxLength={200}
                        />
                        <div className="flex items-center justify-between mt-1">
                            <div>
                                {errors.title && <p className="text-error text-sm">{errors.title}</p>}
                            </div>
                            <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                                {formData.title.length}/200
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
                            value={formData.instructor}
                            onChange={(e) => handleChange('instructor', e.target.value.slice(0, 100))}
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
                                {formData.thumbnailData ? (
                                    <img src={formData.thumbnailData} alt="Thumbnail preview" className="w-full h-full object-cover" />
                                ) : (
                                    <Image className="w-8 h-8 text-light-text-secondary dark:text-dark-text-secondary" />
                                )}
                            </div>
                            <div className="flex flex-col gap-2">
                                <input ref={fileInputRef} type="file" accept="image/*" onChange={(e) => handleThumbnailUpload(e.target.files?.[0])} className="hidden" id="ext-thumbnail-upload" />
                                <label htmlFor="ext-thumbnail-upload" className="inline-flex items-center gap-2 px-3 py-1.5 text-sm border border-light-border dark:border-dark-border rounded-lg hover:bg-light-surface dark:hover:bg-dark-bg cursor-pointer transition-colors">
                                    <Upload className="w-4 h-4" />
                                    Upload Image
                                </label>
                                {formData.thumbnailData && (
                                    <button onClick={removeThumbnail} className="text-sm text-error hover:underline text-left">Remove</button>
                                )}
                            </div>
                        </div>
                        {errors.thumbnail && <p className="text-error text-sm mt-1">{errors.thumbnail}</p>}
                    </div>

                    {/* Metadata Inline Tracker */}
                    <label className="block text-sm font-medium mb-2">Course Information</label>
                    <div className="flex items-center gap-6 p-4 bg-light-surface dark:bg-dark-bg/50 border border-light-border dark:border-dark-border rounded-lg flex-wrap">
                        {/* Modules */}
                        <div className="flex items-center gap-2">
                            <Folder className="w-5 h-5 text-primary" />
                            <input 
                                type="number" 
                                min="1"
                                value={formData.totalModules} 
                                onChange={(e) => handleChange('totalModules', e.target.value)}
                                className="no-spinner w-12 bg-white dark:bg-black/20 border border-light-border dark:border-dark-border rounded px-1 py-0.5 focus:border-primary flex-shrink-0 outline-none text-center font-medium transition-colors"
                                placeholder="1"
                            />
                        </div>
                        
                        {/* Videos */}
                        <div className="flex items-center gap-2">
                            <Video className="w-5 h-5 text-primary" />
                            <input 
                                type="number" 
                                min="1"
                                value={formData.totalVideos} 
                                onChange={(e) => handleChange('totalVideos', e.target.value)}
                                className="no-spinner w-12 bg-white dark:bg-black/20 border border-light-border dark:border-dark-border rounded px-1 py-0.5 focus:border-primary flex-shrink-0 outline-none text-center font-medium transition-colors"
                                placeholder="1"
                            />
                        </div>
                        
                        {/* Duration */}
                        <div className="flex items-center gap-2">
                            <Clock className="w-5 h-5 text-primary" />
                            <div className="flex items-center bg-white dark:bg-black/20 border border-light-border dark:border-dark-border rounded px-1 py-0.5 focus-within:border-primary transition-colors">
                                <input 
                                    type="number" 
                                    min="0"
                                    value={formData.hours} 
                                    onChange={(e) => handleChange('hours', e.target.value)}
                                    className="no-spinner w-8 bg-transparent outline-none text-right font-medium"
                                    placeholder="0"
                                />
                                <span className="mx-0.5 font-medium text-gray-400">:</span>
                                <input 
                                    type="number" 
                                    min="0"
                                    max="59"
                                    value={formData.minutes} 
                                    onChange={(e) => handleChange('minutes', e.target.value)}
                                    className="no-spinner w-8 bg-transparent outline-none text-left font-medium"
                                    placeholder="00"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-4 border-t border-light-border dark:border-dark-border">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium border border-light-border dark:border-dark-border rounded-lg hover:bg-light-surface dark:hover:bg-dark-bg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleImport}
                        disabled={!formData.title.trim() || !formData.courseUrl.trim()}
                        className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        <Upload className="w-4 h-4" />
                        Import Course
                    </button>
                </div>
            </div>
        </div>
    )
}

export default ExternalLinkImportModal
