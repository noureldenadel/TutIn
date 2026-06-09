import * as api from './api.js'

/**
 * File System Manager (v4 Server-Only)
 * 
 * In v4, all file operations are handled by the TutIn Companion Server.
 * Browser-side File System Access API fallbacks have been removed.
 */

// Supported video formats
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'ogg', 'avi', 'mkv', 'ts']

/**
 * Check if a filename is a supported video file
 */
export function isVideoFile(filename) {
    if (!filename) return false
    const ext = filename.split('.').pop().toLowerCase()
    return VIDEO_EXTENSIONS.includes(ext)
}

/**
 * Natural sort for filenames (1, 2, 10 instead of 1, 10, 2)
 */
export function naturalSort(a, b) {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

/**
 * Open folder picker via server (v4)
 */
export async function pickFolder() {
    const result = await api.get('/api/fs/pick-folder')
    if (!result.path) return null // User cancelled
    
    // Return a mock handle that works with server endpoints
    return {
        kind: 'directory',
        name: result.name,
        path: result.path,
        isServerHandle: true
    }
}

/**
 * Scan course folder via server (v4)
 */
export async function scanCourseFolder(directoryHandleOrPath, autoDetectThumbnails = false) {
    const folderPath = typeof directoryHandleOrPath === 'string' 
        ? directoryHandleOrPath 
        : directoryHandleOrPath.path
    
    if (!folderPath) {
        throw new Error('Invalid folder path for scanning')
    }

    return await api.post('/api/fs/scan', { path: folderPath, autoDetectThumbnails })
}

/**
 * Get video streaming URL via server (v4)
 */
export async function getVideoUrl(pathOrHandle) {
    const path = typeof pathOrHandle === 'string' ? pathOrHandle : pathOrHandle.path || pathOrHandle.filePath
    if (!path) {
        throw new Error('No file path provided for video URL')
    }
    return api.videoUrl(path)
}

/**
 * Release video URL (No-op for server streaming)
 */
export function releaseVideoUrl(url) {
    // Server URLs don't need to be revoked like Blob URLs
}

/**
 * Verify permission (v4: always true for server paths)
 */
export async function verifyPermission() {
    return true
}


/**
 * Get a flat list of videos from a scanned course structure
 */
function flattenScannedVideos(modules, parentPath = '') {
    let videos = []
    for (const mod of modules) {
        const currentPath = parentPath ? `${parentPath}/${mod.originalTitle}` : mod.originalTitle
        if (mod.videos) {
            videos.push(...mod.videos.map(v => ({ 
                ...v, 
                moduleTitle: mod.title,
                modulePath: currentPath
            })))
        }
        if (mod.subModules) {
            videos.push(...flattenScannedVideos(mod.subModules, currentPath))
        }
    }
    return videos
}

/**
 * Get a flat list of modules from a scanned course structure preserving hierarchy info
 */
function flattenScannedModules(modules, parentTitle = null, parentPath = '') {
    let result = []
    for (const mod of modules) {
        const currentPath = parentPath ? `${parentPath}/${mod.originalTitle}` : mod.originalTitle
        result.push({
            title: mod.title,
            parentTitle: parentTitle,
            originalTitle: mod.originalTitle,
            order: mod.order,
            totalDuration: mod.totalDuration,
            totalVideos: mod.totalVideos,
            folderPath: mod.folderPath,
            modulePath: currentPath,
            parentPath: parentPath || null
        })
        if (mod.subModules && mod.subModules.length > 0) {
            result.push(...flattenScannedModules(mod.subModules, mod.title, currentPath))
        }
    }
    return result
}

/**
 * Compare scanned filesystem data with database state (v4)
 */
export async function syncCoursePreview(courseId, scannedData) {
    const { getVideosByCourse, getModulesByCourse, getCourse } = await import('./db')
    const existingVideos = await getVideosByCourse(courseId)
    const existingModules = await getModulesByCourse(courseId)
    const course = await getCourse(courseId)

    // Build module path lookup for existing modules
    const existingModuleIdToPath = new Map()
    const buildExistingPath = (modId) => {
        if (existingModuleIdToPath.has(modId)) return existingModuleIdToPath.get(modId)
        const mod = existingModules.find(m => m.id === modId)
        if (!mod) return ''
        const titlePart = mod.originalTitle || mod.title
        if (mod.parentModuleId) {
            const parentPath = buildExistingPath(mod.parentModuleId)
            const fullPath = parentPath ? `${parentPath}/${titlePart}` : titlePart
            existingModuleIdToPath.set(modId, fullPath)
            return fullPath
        } else {
            existingModuleIdToPath.set(modId, titlePart)
            return titlePart
        }
    }
    existingModules.forEach(m => buildExistingPath(m.id))

    const scannedVideos = flattenScannedVideos(scannedData.modules || [])

    const added = []
    const removed = []
    const updated = []
    const moved = []
    const unchanged = []

    // Find new, updated, moved videos
    for (const sv of scannedVideos) {
        const existing = existingVideos.find(ev => ev.filePath === sv.filePath)
        if (!existing) {
            added.push({
                ...sv,
                module: sv.moduleTitle,
                modulePath: sv.modulePath
            })
        } else {
            // Check for metadata changes (duration)
            const isChanged = Math.abs(existing.duration - sv.duration) > 1

            // Check for moved videos (different module)
            const existingModulePath = existingModuleIdToPath.get(existing.moduleId) || ''
            if (existingModulePath !== sv.modulePath) {
                moved.push({
                    ...sv,
                    id: existing.id,
                    title: existing.title,
                    fromModule: existingModulePath,
                    toModule: sv.modulePath,
                    toModuleTitle: sv.moduleTitle
                })
            } else {
                unchanged.push(existing)
            }

            if (isChanged) {
                updated.push({
                    ...existing,
                    newDuration: sv.duration,
                    oldDuration: existing.duration
                })
            }
        }
    }

    // Find removed videos
    for (const ev of existingVideos) {
        const stillExists = scannedVideos.some(sv => sv.filePath === ev.filePath)
        if (!stillExists) {
            const mod = existingModules.find(m => m.id === ev.moduleId)
            removed.push({
                ...ev,
                module: mod ? mod.title : 'Unknown Module'
            })
        }
    }

    // Scanned modules vs existing modules
    const flatScannedModules = scannedData.modules ? flattenScannedModules(scannedData.modules) : []
    const scannedModulePaths = flatScannedModules.map(m => m.modulePath)
    const existingModulePaths = existingModules.map(m => existingModuleIdToPath.get(m.id))
    
    const newModules = scannedModulePaths.filter(p => !existingModulePaths.includes(p))
    const removedModulePaths = existingModulePaths.filter(p => !scannedModulePaths.includes(p))
    const removedModules = existingModules.filter(m => removedModulePaths.includes(existingModuleIdToPath.get(m.id))).map(m => m.id)

    // Check for thumbnail change
    const thumbnailChanged = scannedData.thumbnailData && scannedData.thumbnailData !== course.thumbnailData

    return {
        course,
        added,
        removed,
        updated,
        moved,
        unchanged,
        newModules,
        removedModules,
        flatScannedModules,
        thumbnailChanged,
        totalBefore: existingVideos.length,
        totalAfter: scannedVideos.length,
        scannedData
    }
}

/**
 * Apply sync changes to the database (v4)
 */
export async function applySyncChanges(courseId, preview) {
    const { addVideo, deleteVideo, updateVideo, addModule, getModulesByCourse, deleteModule, updateCourse } = await import('./db')
    const { added, removed, updated, moved, removedModules, flatScannedModules, scannedData } = preview

    // 0. Update course thumbnail and metadata if found during scan
    const courseUpdates = {}
    if (scannedData?.thumbnailData) {
        courseUpdates.thumbnailData = scannedData.thumbnailData
    }
    if (scannedData?.totalDuration !== undefined) {
        courseUpdates.totalDuration = scannedData.totalDuration
    }
    if (scannedData?.totalVideos !== undefined) {
        courseUpdates.totalVideos = scannedData.totalVideos
    }
    
    if (Object.keys(courseUpdates).length > 0) {
        await updateCourse(courseId, courseUpdates)
    }

    // 1. Delete removed videos
    for (const video of removed) {
        await deleteVideo(video.id)
    }

    // 2. Update changed videos
    for (const video of updated) {
        await updateVideo(video.id, { duration: video.newDuration })
    }

    // 3. Sync Modules (Create new ones and update hierarchy)
    const existingModules = await getModulesByCourse(courseId)
    const modulePathToId = new Map()

    const getModPath = (mod) => {
        const titlePart = mod.originalTitle || mod.title
        if (mod.parentModuleId) {
            const parentMod = existingModules.find(m => m.id === mod.parentModuleId)
            const parentPath = parentMod ? getModPath(parentMod) : ''
            return parentPath ? `${parentPath}/${titlePart}` : titlePart
        }
        return titlePart
    }
    existingModules.forEach(m => {
        modulePathToId.set(getModPath(m), m.id)
    })

    if (flatScannedModules) {
        for (const mod of flatScannedModules) {
            if (!modulePathToId.has(mod.modulePath)) {
                // Find parent ID if any
                let parentModuleId = null
                if (mod.parentPath && modulePathToId.has(mod.parentPath)) {
                    parentModuleId = modulePathToId.get(mod.parentPath)
                }
                const newMod = await addModule({
                    courseId,
                    title: mod.title,
                    originalTitle: mod.originalTitle || mod.title,
                    order: mod.order ?? 999,
                    parentModuleId
                })
                modulePathToId.set(mod.modulePath, newMod.id)
                existingModules.push({ id: newMod.id, title: mod.title, originalTitle: mod.originalTitle || mod.title, parentModuleId })
            }
        }
    }

    // 4. Update moved videos
    for (const video of moved) {
        const moduleId = modulePathToId.get(video.toModule)
        if (moduleId) {
            await updateVideo(video.id, { moduleId })
        }
    }

    // 5. Add new videos
    for (const nv of added) {
        const moduleId = modulePathToId.get(nv.modulePath)
        if (moduleId) {
            await addVideo({
                ...nv,
                courseId,
                moduleId,
                title: nv.title,
                originalTitle: nv.originalTitle,
                fileName: nv.fileName,
                filePath: nv.filePath,
                fileSize: nv.fileSize,
                duration: nv.duration,
                order: nv.order !== undefined ? nv.order : 999
            })
        }
    }

    // 6. Remove empty/removed modules
    for (const modId of removedModules) {
        await deleteModule(modId)
    }

    return true
}
