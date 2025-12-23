import { useState, useEffect } from 'react'
import { X, HardDrive, Save, AlertTriangle, Folder, Video, Loader, ExternalLink } from 'lucide-react'
import { parseGoogleDriveUrl, scanDriveFolder, getDriveThumbnailUrl } from '../../utils/googleDrive'
import { formatDuration } from '../../utils/db'

function GoogleDriveImportModal({ isOpen, onClose, onImport }) {
    const [url, setUrl] = useState('')
    const [apiKey, setApiKey] = useState(() => localStorage.getItem('google_drive_api_key') || '')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState(null)
    const [previewData, setPreviewData] = useState(null)
    const [folderName, setFolderName] = useState('')

    // Reset when opened
    useEffect(() => {
        if (isOpen) {
            setUrl('')
            setError(null)
            setPreviewData(null)
            setFolderName('')
        }
    }, [isOpen])

    if (!isOpen) return null

    function handleApiKeyChange(e) {
        const key = e.target.value
        setApiKey(key)
        localStorage.setItem('google_drive_api_key', key)
    }

    async function handleFetchInfo() {
        if (!url || !apiKey) return
        setIsLoading(true)
        setError(null)
        setPreviewData(null)

        try {
            const parsed = parseGoogleDriveUrl(url)
            if (!parsed || parsed.type !== 'folder') {
                throw new Error('Please provide a valid Google Drive folder link')
            }

            const folderId = parsed.id

            // Scan the folder
            const courseData = await scanDriveFolder(folderId, apiKey)

            if (courseData.totalVideos === 0) {
                throw new Error('No video files found in this folder. Make sure the folder contains MP4, WebM, MOV, or other video files.')
            }

            // Try to get folder name (requires additional API call)
            try {
                const metaUrl = `https://www.googleapis.com/drive/v3/files/${folderId}?key=${apiKey}&fields=name`
                const metaRes = await fetch(metaUrl)
                if (metaRes.ok) {
                    const metaData = await metaRes.json()
                    setFolderName(metaData.name || 'Untitled Course')
                }
            } catch (e) {
                console.warn('Could not fetch folder name:', e)
                setFolderName('Untitled Course')
            }

            setPreviewData(courseData)

        } catch (err) {
            console.error(err)
            if (err.message.includes('403')) {
                setError('Access denied. Make sure the folder is shared as "Anyone with the link" and your API key has Drive API enabled.')
            } else if (err.message.includes('404')) {
                setError('Folder not found. Check the URL and make sure the folder is shared publicly.')
            } else {
                setError(err.message)
            }
        } finally {
            setIsLoading(false)
        }
    }

    function handleConfirm() {
        if (!previewData) return

        // Get thumbnail from first video if available
        let thumbnail = null
        if (previewData.modules?.[0]?.videos?.[0]?.driveFileId) {
            thumbnail = getDriveThumbnailUrl(previewData.modules[0].videos[0].driveFileId)
        }

        onImport({
            title: folderName || 'Google Drive Course',
            instructor: '',
            thumbnailData: thumbnail,
            description: 'Imported from Google Drive',
            totalDuration: previewData.totalDuration,
            totalVideos: previewData.totalVideos,
            modules: previewData.modules.map((m, idx) => ({
                title: m.title,
                originalTitle: m.originalTitle,
                order: idx,
                totalDuration: m.totalDuration,
                totalVideos: m.totalVideos,
                videos: m.videos.map((v, vidIdx) => ({
                    title: v.title,
                    originalTitle: v.originalTitle,
                    driveFileId: v.driveFileId,
                    duration: v.duration,
                    order: vidIdx
                }))
            }))
        })
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />

            <div className="relative bg-white dark:bg-dark-surface rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-scale-in">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border">
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                        <HardDrive className="w-6 h-6 text-blue-600" />
                        Import from Google Drive
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-light-surface dark:hover:bg-dark-bg rounded-lg">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* API Key */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-medium">Google API Key</label>
                            <a
                                href="https://console.cloud.google.com/apis/credentials"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline flex items-center gap-1"
                            >
                                Get Key <ExternalLink className="w-3 h-3" />
                            </a>
                        </div>
                        <input
                            type="password"
                            value={apiKey}
                            onChange={handleApiKeyChange}
                            placeholder="Enter your Google API Key..."
                            className="w-full px-3 py-2 rounded-lg border border-light-border dark:border-dark-border bg-white dark:bg-dark-bg focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1">
                            Enable "Google Drive API" in your Google Cloud Console. Key is stored locally.
                        </p>
                    </div>

                    {/* URL Input */}
                    <div>
                        <label className="block text-sm font-medium mb-2">Google Drive Folder URL</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                placeholder="https://drive.google.com/drive/folders/..."
                                className="flex-1 px-3 py-2 rounded-lg border border-light-border dark:border-dark-border bg-white dark:bg-dark-bg focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                            <button
                                onClick={handleFetchInfo}
                                disabled={!url || !apiKey || isLoading}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            >
                                {isLoading ? <Loader className="w-5 h-5 animate-spin" /> : 'Scan'}
                            </button>
                        </div>
                        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1">
                            Folder must be shared as "Anyone with the link can view"
                        </p>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="p-4 bg-error/10 text-error rounded-lg flex items-start gap-2">
                            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Preview */}
                    {previewData && (
                        <div className="border border-light-border dark:border-dark-border rounded-lg overflow-hidden">
                            {/* Course Header */}
                            <div className="p-4 bg-light-surface dark:bg-dark-bg">
                                <input
                                    type="text"
                                    value={folderName}
                                    onChange={(e) => setFolderName(e.target.value)}
                                    className="text-lg font-semibold bg-transparent border-b border-transparent hover:border-light-border dark:hover:border-dark-border focus:border-primary outline-none w-full"
                                    placeholder="Course Title"
                                />
                                <div className="flex items-center gap-4 text-sm text-light-text-secondary dark:text-dark-text-secondary mt-2">
                                    <span className="flex items-center gap-1">
                                        <Video className="w-4 h-4" />
                                        {previewData.totalVideos} videos
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <Folder className="w-4 h-4" />
                                        {previewData.modules.length} modules
                                    </span>
                                    {previewData.totalDuration > 0 && (
                                        <span>{formatDuration(previewData.totalDuration)}</span>
                                    )}
                                </div>
                            </div>

                            {/* Modules List */}
                            <div className="max-h-64 overflow-y-auto divide-y divide-light-border dark:divide-dark-border">
                                {previewData.modules.map((module, idx) => (
                                    <div key={idx} className="p-3">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Folder className="w-4 h-4 text-blue-500" />
                                            <span className="font-medium">{module.title}</span>
                                            <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                                                ({module.videos.length} videos)
                                            </span>
                                        </div>
                                        <div className="ml-6 space-y-1">
                                            {module.videos.slice(0, 3).map((video, vidIdx) => (
                                                <div key={vidIdx} className="text-sm text-light-text-secondary dark:text-dark-text-secondary flex items-center gap-2">
                                                    <Video className="w-3 h-3" />
                                                    <span className="truncate">{video.title}</span>
                                                    {video.duration > 0 && (
                                                        <span className="text-xs">{formatDuration(video.duration)}</span>
                                                    )}
                                                </div>
                                            ))}
                                            {module.videos.length > 3 && (
                                                <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                                                    ... and {module.videos.length - 3} more
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 p-4 border-t border-light-border dark:border-dark-border">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm border border-light-border dark:border-dark-border rounded-lg hover:bg-light-surface dark:hover:bg-dark-bg"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={!previewData}
                        className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                    >
                        <Save className="w-4 h-4" />
                        Import Course
                    </button>
                </div>
            </div>
        </div>
    )
}

export default GoogleDriveImportModal
