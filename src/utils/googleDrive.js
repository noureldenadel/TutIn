/**
 * Google Drive API Utilities
 * For importing courses from shared Google Drive folders
 */

const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'ogg', 'm4v']

/**
 * Parse Google Drive URL to extract folder or file ID
 * Supports various Drive URL formats
 */
export function parseGoogleDriveUrl(url) {
    if (!url) return null

    try {
        const urlObj = new URL(url)

        // Format: https://drive.google.com/drive/folders/FOLDER_ID
        if (urlObj.pathname.includes('/folders/')) {
            const match = urlObj.pathname.match(/\/folders\/([a-zA-Z0-9_-]+)/)
            if (match) {
                return { type: 'folder', id: match[1] }
            }
        }

        // Format: https://drive.google.com/file/d/FILE_ID/view
        if (urlObj.pathname.includes('/file/d/')) {
            const match = urlObj.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
            if (match) {
                return { type: 'file', id: match[1] }
            }
        }

        // Format: https://drive.google.com/open?id=ID
        if (urlObj.searchParams.has('id')) {
            return { type: 'unknown', id: urlObj.searchParams.get('id') }
        }

        return null
    } catch (e) {
        console.error('Failed to parse Drive URL:', e)
        return null
    }
}

/**
 * List files in a Google Drive folder
 * @param {string} folderId - The folder ID
 * @param {string} apiKey - Google API key with Drive API enabled
 * @returns {Promise<Array>} List of files/folders
 */
export async function listFilesInFolder(folderId, apiKey) {
    const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&key=${apiKey}&fields=files(id,name,mimeType,size,videoMediaMetadata)`

    const response = await fetch(url)
    if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error?.message || 'Failed to list files')
    }

    const data = await response.json()
    return data.files || []
}

/**
 * Get file metadata
 */
export async function getFileMetadata(fileId, apiKey) {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?key=${apiKey}&fields=id,name,mimeType,size,videoMediaMetadata,parents`

    const response = await fetch(url)
    if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error?.message || 'Failed to get file metadata')
    }

    return response.json()
}

/**
 * Check if a file is a video based on extension or MIME type
 */
export function isVideoFile(file) {
    // Check MIME type
    if (file.mimeType?.startsWith('video/')) {
        return true
    }

    // Check extension
    const ext = file.name?.split('.').pop()?.toLowerCase()
    return VIDEO_EXTENSIONS.includes(ext)
}

/**
 * Recursively scan a Drive folder for modules and videos
 * @param {string} folderId - Root folder ID
 * @param {string} apiKey - Google API key
 * @returns {Promise<Object>} Course structure
 */
export async function scanDriveFolder(folderId, apiKey) {
    const files = await listFilesInFolder(folderId, apiKey)

    const folders = files.filter(f => f.mimeType === 'application/vnd.google-apps.folder')
    const videos = files.filter(f => isVideoFile(f))

    const modules = []
    let totalVideos = 0
    let totalDuration = 0

    // Process subfolders as modules
    for (const folder of folders.sort((a, b) => a.name.localeCompare(b.name))) {
        const moduleFiles = await listFilesInFolder(folder.id, apiKey)
        const moduleVideos = moduleFiles.filter(f => isVideoFile(f))

        if (moduleVideos.length > 0) {
            const moduleVideosList = moduleVideos
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((v, idx) => {
                    const duration = v.videoMediaMetadata?.durationMillis
                        ? Math.round(v.videoMediaMetadata.durationMillis / 1000)
                        : 0
                    totalDuration += duration
                    return {
                        title: cleanVideoTitle(v.name),
                        originalTitle: v.name,
                        driveFileId: v.id,
                        duration: duration,
                        order: idx
                    }
                })

            totalVideos += moduleVideosList.length

            modules.push({
                title: folder.name,
                originalTitle: folder.name,
                videos: moduleVideosList,
                totalVideos: moduleVideosList.length,
                totalDuration: moduleVideosList.reduce((sum, v) => sum + v.duration, 0)
            })
        }
    }

    // Process root-level videos as a separate module
    if (videos.length > 0) {
        const rootVideos = videos
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((v, idx) => {
                const duration = v.videoMediaMetadata?.durationMillis
                    ? Math.round(v.videoMediaMetadata.durationMillis / 1000)
                    : 0
                totalDuration += duration
                return {
                    title: cleanVideoTitle(v.name),
                    originalTitle: v.name,
                    driveFileId: v.id,
                    duration: duration,
                    order: idx
                }
            })

        totalVideos += rootVideos.length

        // Add as first module if there are other modules, otherwise as "Videos"
        modules.unshift({
            title: modules.length > 0 ? 'Introduction' : 'Videos',
            originalTitle: 'Root Videos',
            videos: rootVideos,
            totalVideos: rootVideos.length,
            totalDuration: rootVideos.reduce((sum, v) => sum + v.duration, 0)
        })
    }

    return {
        modules,
        totalVideos,
        totalDuration
    }
}

/**
 * Clean video title by removing extension and common prefixes
 */
function cleanVideoTitle(filename) {
    // Remove extension
    let title = filename.replace(/\.[^/.]+$/, '')

    // Remove leading numbers/ordering (e.g., "01 - ", "1. ", etc.)
    title = title.replace(/^\d+[\s._-]+/, '')

    return title || filename
}

/**
 * Generate a streamable video URL for Google Drive file
 * Note: This works for files shared as "Anyone with the link can view"
 */
export function getDriveVideoUrl(fileId) {
    // This URL format allows streaming for publicly shared files
    return `https://drive.google.com/uc?export=download&id=${fileId}`
}

/**
 * Alternative: Get embed URL (works in iframes but with limitations)
 */
export function getDriveEmbedUrl(fileId) {
    return `https://drive.google.com/file/d/${fileId}/preview`
}

/**
 * Get thumbnail URL for Drive video
 */
export function getDriveThumbnailUrl(fileId) {
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`
}
