/**
 * File System Manager - Handles File System Access API operations
 * 
 * Provides:
 * - Folder picking and permission management
 * - Recursive folder scanning
 * - Video file detection and metadata extraction
 * - Course structure parsing
 */

// Supported video formats
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'ogg', 'avi', 'mkv']

/**
 * Check if File System Access API is supported
 */
export function isFileSystemAccessSupported() {
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

/**
 * Check if browser is Brave
 */
async function isBraveBrowser() {
    try {
        return (navigator.brave && await navigator.brave.isBrave()) || false
    } catch {
        return false
    }
}

/**
 * Open folder picker and get directory handle (modern API)
 */
export async function pickFolder() {
    if (!isFileSystemAccessSupported()) {
        const isBrave = await isBraveBrowser()
        if (isBrave) {
            throw new Error(
                'File System Access API is blocked by Brave Shields. ' +
                'Please click the Brave icon in the address bar and disable Shields for this site, then refresh the page.'
            )
        }
        throw new Error(
            'File System Access API is not supported in this browser. ' +
            'Please use Chrome, Edge, Opera, or Brave (with Shields disabled for this site).'
        )
    }

    try {
        const handle = await window.showDirectoryPicker({
            mode: 'read'
        })
        return handle
    } catch (error) {
        if (error.name === 'AbortError') {
            // User cancelled the picker
            return null
        }
        // Check for security/permission errors that might indicate Brave Shields
        if (error.name === 'SecurityError' || error.message.includes('denied')) {
            const isBrave = await isBraveBrowser()
            if (isBrave) {
                throw new Error(
                    'Permission blocked by Brave Shields. Please disable Shields for this site and try again.'
                )
            }
        }
        throw error
    }
}

/**
 * Fallback folder picker using webkitdirectory input
 * Works in all modern browsers including Brave
 * @returns {Promise<{files: File[], folderName: string}>}
 */
export function pickFolderFallback() {
    return new Promise((resolve, reject) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.webkitdirectory = true
        input.multiple = true

        input.onchange = () => {
            if (!input.files || input.files.length === 0) {
                resolve(null)
                return
            }

            // Get folder name from first file's path
            const firstFile = input.files[0]
            const pathParts = firstFile.webkitRelativePath.split('/')
            const folderName = pathParts[0]

            resolve({
                files: Array.from(input.files),
                folderName
            })
        }

        input.oncancel = () => resolve(null)

        // Trigger the file picker
        input.click()
    })
}

// Store files in memory for current session (fallback mode)
let fallbackFilesCache = new Map()

// Root courses folder handle (session-scoped)
let rootFolderHandle = null
let rootFolderName = null

/**
 * Store files in memory cache for current session
 */
export function cacheFallbackFiles(files, folderName) {
    fallbackFilesCache.set(folderName, files)
}

/**
 * Get cached files for a course folder
 */
export function getCachedFiles(folderName) {
    return fallbackFilesCache.get(folderName) || null
}

/**
 * Clear cached files
 */
export function clearFallbackCache() {
    fallbackFilesCache.clear()
}

/**
 * Set the root courses folder handle
 * This is called once per session when user grants access
 */
export function setRootFolderHandle(handle, name) {
    rootFolderHandle = handle
    rootFolderName = name
    // Store the folder name in localStorage so we can prompt user on next session
    if (name) {
        localStorage.setItem('mearn_root_folder_name', name)
    }
}

/**
 * Get the root courses folder handle
 */
export function getRootFolderHandle() {
    return rootFolderHandle
}

/**
 * Get the stored root folder name (for display)
 */
export function getRootFolderName() {
    return rootFolderName || localStorage.getItem('mearn_root_folder_name')
}

/**
 * Check if root folder access is configured
 */
export function hasRootFolderAccess() {
    return rootFolderHandle !== null
}

/**
 * Clear root folder handle
 */
export function clearRootFolderHandle() {
    rootFolderHandle = null
    rootFolderName = null
    localStorage.removeItem('mearn_root_folder_name')
}

/**
 * Find a course folder within the root folder by folder name
 */
export async function findCourseFolderInRoot(folderName) {
    if (!rootFolderHandle) return null

    try {
        // Try to get the folder directly
        const courseHandle = await rootFolderHandle.getDirectoryHandle(folderName, { create: false })
        return courseHandle
    } catch (err) {
        // Folder not found, try searching subdirectories
        try {
            for await (const entry of rootFolderHandle.values()) {
                if (entry.kind === 'directory' && entry.name === folderName) {
                    return entry
                }
            }
        } catch (e) {
            console.error('Error searching root folder:', e)
        }
        return null
    }
}

/**
 * Pick and set root courses folder
 */
export async function pickRootFolder() {
    const handle = await pickFolder()
    if (handle) {
        setRootFolderHandle(handle, handle.name)
        return { handle, name: handle.name }
    }
    return null
}

/**
 * Find a file in the fallback cache by relative path
 */
export function findFileByPath(folderName, relativePath) {
    const files = fallbackFilesCache.get(folderName)
    if (!files) return null
    return files.find(f => f.webkitRelativePath === relativePath) || null
}

/**
 * Find a file in the fallback cache by file name (for legacy imports without relativePath)
 */
export function findFileByFileName(folderName, fileName) {
    const files = fallbackFilesCache.get(folderName)
    if (!files) return null
    // Find file that ends with the given filename
    return files.find(f => f.name === fileName || f.webkitRelativePath.endsWith('/' + fileName)) || null
}

/**
 * Scan files from fallback picker and build course structure
 * @param {File[]} files - Array of files from input
 * @param {string} folderName - Root folder name
 * @param {Function} onProgress - Progress callback
 */
export async function scanFolderFromFiles(files, folderName, onProgress = () => { }) {
    const videoFiles = files.filter(f => isVideoFile(f.name))

    // Find unsupported media files for better error messages
    const unsupportedFiles = files.filter(f => {
        const ext = f.name.split('.').pop()?.toLowerCase()
        return ['flv', 'wmv', '3gp', 'm4v', 'rmvb', 'ts'].includes(ext)
    })

    if (videoFiles.length === 0) {
        let errorMsg = 'No video files found in the selected folder.\n\n'
        errorMsg += 'Supported formats: MP4, WebM, MOV, OGG, AVI, MKV\n\n'

        if (unsupportedFiles.length > 0) {
            errorMsg += `Found ${unsupportedFiles.length} unsupported file(s):\n`
            errorMsg += unsupportedFiles.slice(0, 5).map(f => `  • ${f.name}`).join('\n')
            if (unsupportedFiles.length > 5) {
                errorMsg += `\n  ... and ${unsupportedFiles.length - 5} more`
            }
            errorMsg += '\n\nTip: Convert these files to MP4 format using HandBrake or FFmpeg.'
        } else {
            errorMsg += 'Folder structure tip:\n'
            errorMsg += '  📁 Course Folder (select this)\n'
            errorMsg += '     ├── 📁 Module 1\n'
            errorMsg += '     │   ├── video1.mp4\n'
            errorMsg += '     │   └── video2.mp4\n'
            errorMsg += '     └── 📁 Module 2\n'
            errorMsg += '         └── video3.mp4'
        }

        throw new Error(errorMsg)
    }

    // Cache files for this session
    cacheFallbackFiles(files, folderName)

    // Group videos by subfolder
    const moduleMap = new Map()

    for (const file of videoFiles) {
        const pathParts = file.webkitRelativePath.split('/')
        // Remove root folder name and filename
        const relativePath = pathParts.slice(1)

        let moduleName = 'Main Content'
        if (relativePath.length > 1) {
            // Has subfolder - use it as module name
            moduleName = relativePath[0]
        }

        if (!moduleMap.has(moduleName)) {
            moduleMap.set(moduleName, [])
        }
        moduleMap.get(moduleName).push(file)
    }

    // Build course structure
    const modules = []
    let totalProcessed = 0
    const totalItems = videoFiles.length

    let moduleOrder = 0
    for (const [moduleName, moduleFiles] of moduleMap.entries()) {
        // Sort files naturally
        moduleFiles.sort((a, b) => naturalSort(a.name, b.name))

        const moduleVideos = []
        let videoOrder = 0

        for (const file of moduleFiles) {
            onProgress(++totalProcessed, totalItems)

            const duration = await getVideoDurationFromFile(file)

            moduleVideos.push({
                title: cleanVideoTitle(file.name),
                originalTitle: file.name,
                fileName: file.name,
                // Store path for persistence instead of File object
                relativePath: file.webkitRelativePath,
                fileSize: file.size,
                duration,
                order: videoOrder++
            })
        }

        modules.push({
            title: cleanModuleTitle(moduleName),
            originalTitle: moduleName,
            order: moduleOrder++,
            totalDuration: moduleVideos.reduce((sum, v) => sum + v.duration, 0),
            totalVideos: moduleVideos.length,
            videos: moduleVideos
        })
    }

    // Sort modules naturally
    modules.sort((a, b) => naturalSort(a.originalTitle, b.originalTitle))

    const totalDuration = modules.reduce((sum, m) => sum + m.totalDuration, 0)

    return {
        title: cleanCourseTitle(folderName),
        originalTitle: folderName,
        totalDuration,
        totalVideos: videoFiles.length,
        modules,
        useFallback: true // Flag to indicate fallback mode
    }
}

/**
 * Get video duration from a File object
 */
async function getVideoDurationFromFile(file) {
    try {
        const url = URL.createObjectURL(file)

        return new Promise((resolve) => {
            const video = document.createElement('video')
            video.preload = 'metadata'

            video.onloadedmetadata = () => {
                URL.revokeObjectURL(url)
                resolve(Math.floor(video.duration) || 0)
            }

            video.onerror = () => {
                URL.revokeObjectURL(url)
                resolve(0)
            }

            setTimeout(() => {
                URL.revokeObjectURL(url)
                resolve(0)
            }, 10000)

            video.src = url
        })
    } catch {
        return 0
    }
}

/**
 * Request persistent permission for a directory handle
 */
export async function requestPersistentPermission(handle) {
    try {
        const permission = await handle.requestPermission({ mode: 'read' })
        return permission === 'granted'
    } catch (error) {
        console.error('Failed to request permission:', error)
        return false
    }
}

/**
 * Verify if we still have permission for a directory handle
 */
export async function verifyPermission(handle) {
    try {
        const permission = await handle.queryPermission({ mode: 'read' })
        if (permission === 'granted') return true

        // Try to request permission again
        const newPermission = await handle.requestPermission({ mode: 'read' })
        return newPermission === 'granted'
    } catch (error) {
        console.error('Failed to verify permission:', error)
        return false
    }
}

/**
 * Check if a filename is a video file
 */
export function isVideoFile(fileName) {
    const ext = fileName.split('.').pop()?.toLowerCase()
    return VIDEO_EXTENSIONS.includes(ext)
}

/**
 * Get video duration from a file
 */
export async function getVideoDuration(fileHandle) {
    try {
        const file = await fileHandle.getFile()
        const url = URL.createObjectURL(file)

        return new Promise((resolve) => {
            const video = document.createElement('video')
            video.preload = 'metadata'

            video.onloadedmetadata = () => {
                URL.revokeObjectURL(url)
                resolve(Math.floor(video.duration) || 0)
            }

            video.onerror = () => {
                URL.revokeObjectURL(url)
                console.warn('Failed to load video metadata for:', file.name)
                resolve(0)
            }

            // Timeout after 10 seconds
            setTimeout(() => {
                URL.revokeObjectURL(url)
                resolve(0)
            }, 10000)

            video.src = url
        })
    } catch (error) {
        console.error('Error getting video duration:', error)
        return 0
    }
}

/**
 * Natural sort comparator for alphanumeric strings
 */
function naturalSort(a, b) {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

/**
 * Scan a directory recursively and build course structure
 * @param {FileSystemDirectoryHandle} directoryHandle - Root directory handle
 * @param {Function} onProgress - Progress callback (current, total)
 * @returns {Object} Course structure with modules and videos
 */
export async function scanCourseFolder(directoryHandle, onProgress = () => { }) {
    const courseName = directoryHandle.name
    const modules = []
    const videos = []

    // First pass: collect all entries
    const entries = []
    for await (const entry of directoryHandle.values()) {
        entries.push(entry)
    }

    // Sort entries naturally
    entries.sort((a, b) => naturalSort(a.name, b.name))

    let totalItems = entries.length
    let processedItems = 0

    // Check for videos directly in root (single-module course)
    const rootVideos = []
    const subfolders = []

    for (const entry of entries) {
        if (entry.kind === 'file' && isVideoFile(entry.name)) {
            rootVideos.push(entry)
        } else if (entry.kind === 'directory') {
            subfolders.push(entry)
        }
    }

    // If there are subfolders, treat them as modules
    if (subfolders.length > 0) {
        let moduleOrder = 0

        for (const folder of subfolders) {
            const moduleVideos = []
            const moduleEntries = []

            // Collect folder contents
            for await (const entry of folder.values()) {
                if (entry.kind === 'file' && isVideoFile(entry.name)) {
                    moduleEntries.push(entry)
                }
            }

            // Sort videos naturally
            moduleEntries.sort((a, b) => naturalSort(a.name, b.name))
            totalItems += moduleEntries.length

            // Process each video in the module
            let videoOrder = 0
            for (const videoEntry of moduleEntries) {
                onProgress(++processedItems, totalItems)

                const file = await videoEntry.getFile()
                const duration = await getVideoDuration(videoEntry)

                const videoData = {
                    title: cleanVideoTitle(videoEntry.name),
                    originalTitle: videoEntry.name,
                    fileName: videoEntry.name,
                    fileHandle: videoEntry,
                    fileSize: file.size,
                    duration,
                    order: videoOrder++
                }

                moduleVideos.push(videoData)
                videos.push(videoData)
            }

            if (moduleVideos.length > 0) {
                const moduleDuration = moduleVideos.reduce((sum, v) => sum + v.duration, 0)

                modules.push({
                    title: cleanModuleTitle(folder.name),
                    originalTitle: folder.name,
                    folderHandle: folder,
                    order: moduleOrder++,
                    totalDuration: moduleDuration,
                    totalVideos: moduleVideos.length,
                    videos: moduleVideos
                })
            }

            processedItems++
            onProgress(processedItems, totalItems)
        }
    }

    // Handle root-level videos (no sub-folders or videos at root)
    if (rootVideos.length > 0) {
        const moduleVideos = []
        let videoOrder = 0

        for (const videoEntry of rootVideos) {
            onProgress(++processedItems, totalItems)

            const file = await videoEntry.getFile()
            const duration = await getVideoDuration(videoEntry)

            const videoData = {
                title: cleanVideoTitle(videoEntry.name),
                originalTitle: videoEntry.name,
                fileName: videoEntry.name,
                fileHandle: videoEntry,
                fileSize: file.size,
                duration,
                order: videoOrder++
            }

            moduleVideos.push(videoData)
            videos.push(videoData)
        }

        // Create a single "Main Content" module for root videos
        modules.push({
            title: 'Main Content',
            originalTitle: courseName,
            folderHandle: directoryHandle,
            order: 0,
            totalDuration: moduleVideos.reduce((sum, v) => sum + v.duration, 0),
            totalVideos: moduleVideos.length,
            videos: moduleVideos
        })
    }

    // Calculate total course duration
    const totalDuration = videos.reduce((sum, v) => sum + v.duration, 0)

    return {
        title: cleanCourseTitle(courseName),
        originalTitle: courseName,
        folderHandle: directoryHandle,
        totalDuration,
        totalVideos: videos.length,
        modules
    }
}

/**
 * Clean a course title from folder name
 */
function cleanCourseTitle(name) {
    if (!name) return 'Untitled Course'
    return name
        // Remove leading numbers and separators
        .replace(/^[\d\s._-]+/, '')
        // Replace underscores and hyphens with spaces
        .replace(/[_-]+/g, ' ')
        .trim() || name
}

/**
 * Clean a module title from folder name
 */
function cleanModuleTitle(name) {
    if (!name) return 'Untitled Module'
    return name
        // Remove leading numbers like "01_", "1.", "01 -", etc.
        .replace(/^[\d]+[\s._-]*/, '')
        // Replace underscores and hyphens with spaces
        .replace(/[_-]+/g, ' ')
        .trim() || name
}

/**
 * Clean a video title from filename
 */
function cleanVideoTitle(name) {
    if (!name) return 'Untitled Video'
    return name
        // Remove file extension
        .replace(/\.[^.]+$/, '')
        // Remove leading numbers like "01_", "1.", "01 -", etc.
        .replace(/^[\d]+[\s._-]*/, '')
        // Replace underscores and hyphens with spaces
        .replace(/[_-]+/g, ' ')
        .trim() || name
}

/**
 * Get a blob URL for a video file
 * @param {FileSystemFileHandle|File} fileHandleOrFile - Either a FileHandle or File object
 */
export async function getVideoUrl(fileHandleOrFile) {
    try {
        let file

        // Check if it's a File object already (fallback mode)
        if (fileHandleOrFile instanceof File) {
            file = fileHandleOrFile
        } else if (fileHandleOrFile && typeof fileHandleOrFile.getFile === 'function') {
            // It's a FileHandle (modern API)
            file = await fileHandleOrFile.getFile()
        } else {
            throw new Error('Invalid file handle or file object')
        }

        return URL.createObjectURL(file)
    } catch (error) {
        console.error('Failed to get video URL:', error)
        throw new Error('Failed to load video file. The file may have been moved or deleted.')
    }
}

/**
 * Release a blob URL to free memory
 */
export function releaseVideoUrl(url) {
    if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url)
    }
}
