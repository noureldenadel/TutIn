import * as api from './api.js'
import {
    getVideosByCourse, getModulesByCourse, getCourse,
    addVideo, deleteVideo, updateVideo, addModule,
    deleteModule, updateCourse
} from './db.js'

/**
 * File System Manager (v5 Server-Only)
 * 
 * In v5, all file operations are handled by the TutIn Companion Server.
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
    const assetUpdates = []

    // Helper to calculate new dubs/captions/summary for a video
    const checkAssetChanges = (existing, sv) => {
        const existingDubs = existing.dubbedTracks || []
        const existingSubs = existing.subtitleSources || []
        const newDubs = (sv.availableDubs || []).filter(d => !existingDubs.some(ed => ed.lang === d.lang))
        const newSubs = (sv.subtitleFiles || []).filter(s => !existingSubs.some(es => es.filePath === s.filePath || (es.lang === s.lang && es.origin === s.origin)))
        const newSummary = Boolean(sv.hasSummary && !existing.hasSummary)
        return { newDubs, newSubs, newSummary, hasAny: newDubs.length > 0 || newSubs.length > 0 || newSummary }
    }

    // Find new, updated, moved videos
    for (const sv of scannedVideos) {
        const existing = existingVideos.find(ev => ev.filePath === sv.filePath)
        if (!existing) {
            added.push({
                ...sv,
                module: sv.moduleTitle,
                modulePath: sv.modulePath,
                dubs: sv.availableDubs || [],
                subtitles: sv.subtitleFiles || [],
                hasSummary: Boolean(sv.hasSummary)
            })
        } else {
            // Check for metadata changes (duration)
            const isChanged = Math.abs(existing.duration - sv.duration) > 1

            // Check for asset diffs
            const assetDiff = checkAssetChanges(existing, sv)

            // Check for moved videos (different module)
            const existingModulePath = existingModuleIdToPath.get(existing.moduleId) || ''
            if (existingModulePath !== sv.modulePath) {
                moved.push({
                    ...sv,
                    id: existing.id,
                    title: existing.title,
                    fromModule: existingModulePath,
                    toModule: sv.modulePath,
                    toModuleTitle: sv.moduleTitle,
                    dubs: sv.availableDubs || [],
                    subtitles: sv.subtitleFiles || [],
                    hasSummary: Boolean(sv.hasSummary),
                    assetDiff
                })
            } else {
                unchanged.push({
                    ...existing,
                    dubs: sv.availableDubs || [],
                    subtitles: sv.subtitleFiles || [],
                    hasSummary: Boolean(sv.hasSummary),
                    assetDiff
                })
            }

            if (isChanged) {
                updated.push({
                    ...existing,
                    newDuration: sv.duration,
                    oldDuration: existing.duration,
                    dubs: sv.availableDubs || [],
                    subtitles: sv.subtitleFiles || [],
                    hasSummary: Boolean(sv.hasSummary),
                    assetDiff
                })
            }

            if (assetDiff.hasAny) {
                assetUpdates.push({
                    ...existing,
                    title: existing.title,
                    dubs: sv.availableDubs || [],
                    subtitles: sv.subtitleFiles || [],
                    hasSummary: Boolean(sv.hasSummary),
                    newDubs: assetDiff.newDubs,
                    newSubs: assetDiff.newSubs,
                    newSummary: assetDiff.newSummary
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

    // Process Vault Data & Indicators
    const vaultData = scannedData.vaultData || {}
    const vaultSummary = vaultData.vaultSummary || vaultData || {}
    
    // Existing DB counts
    const dbTotalDubs = existingVideos.reduce((acc, v) => acc + (v.dubbedTracks?.length || 0), 0)
    const dbTotalSubs = existingVideos.reduce((acc, v) => acc + (v.subtitleSources?.length || 0), 0)
    const dbTotalSummaries = existingVideos.filter(v => v.hasSummary).length

    // Disk / Vault counts
    const diskDubsCount = vaultSummary.dubs?.count ?? scannedVideos.reduce((acc, v) => acc + (v.availableDubs?.length || 0), 0)
    const diskSubsCount = vaultSummary.transcripts?.count ?? scannedVideos.reduce((acc, v) => acc + (v.subtitleFiles?.length || 0), 0)
    const diskSummariesCount = vaultSummary.summaries?.count ?? scannedVideos.filter(v => v.hasSummary).length

    const newDubsDiscovered = assetUpdates.reduce((acc, v) => acc + v.newDubs.length, 0) +
        added.reduce((acc, v) => acc + (v.dubs?.length || 0), 0)
    const newSubsDiscovered = assetUpdates.reduce((acc, v) => acc + v.newSubs.length, 0) +
        added.reduce((acc, v) => acc + (v.subtitles?.length || 0), 0)
    const newSummariesDiscovered = assetUpdates.filter(v => v.newSummary).length +
        added.filter(v => v.hasSummary).length

    const vaultStats = {
        hasVault: Boolean(vaultSummary.hasVault),
        vaultPath: vaultSummary.vaultPath || null,
        totalSizeBytes: vaultSummary.totalSizeBytes || 0,
        totalFileCount: vaultSummary.totalFileCount || 0,
        dubs: {
            diskCount: diskDubsCount,
            dbCount: dbTotalDubs,
            newCount: newDubsDiscovered,
            languages: vaultSummary.dubs?.languages || [],
            sizeBytes: vaultSummary.dubs?.sizeBytes || 0,
            files: vaultSummary.dubs?.files || []
        },
        transcripts: {
            diskCount: diskSubsCount,
            dbCount: dbTotalSubs,
            newCount: newSubsDiscovered,
            languages: vaultSummary.transcripts?.languages || [],
            generatedCount: vaultSummary.transcripts?.generatedCount || 0,
            uploadedCount: vaultSummary.transcripts?.uploadedCount || 0,
            files: vaultSummary.transcripts?.files || []
        },
        summaries: {
            diskCount: diskSummariesCount,
            dbCount: dbTotalSummaries,
            newCount: newSummariesDiscovered,
            files: vaultSummary.summaries?.files || []
        },
        canvas: {
            exists: Boolean(vaultSummary.canvas?.exists),
            nodeCount: vaultSummary.canvas?.nodeCount || 0,
            edgeCount: vaultSummary.canvas?.edgeCount || 0
        },
        notes: {
            count: vaultSummary.notes?.count || 0,
            screenshotsCount: vaultSummary.notes?.screenshotsCount || 0
        }
    }

    return {
        course,
        added,
        removed,
        updated,
        moved,
        unchanged,
        assetUpdates,
        newModules,
        removedModules,
        flatScannedModules,
        thumbnailChanged,
        totalBefore: existingVideos.length,
        totalAfter: scannedVideos.length,
        vaultStats,
        scannedData,
        scannedVideos
    }
}

/**
 * Apply sync changes to the database (v4)
 */
export async function applySyncChanges(courseId, preview) {
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

    // 2. Update changed videos (duration)
    for (const video of updated) {
        await updateVideo(video.id, { duration: video.newDuration })
    }

    // 2.5 Update all existing videos with latest AI assets (subtitles, dubs, summaries) from disk
    const existingVideosToUpdate = [...preview.unchanged, ...moved, ...updated]
    for (const video of existingVideosToUpdate) {
        const sv = preview.scannedVideos.find(v => v.filePath === video.filePath)
        if (sv) {
            const updates = {
                subtitleSources: sv.subtitleFiles || [],
                dubbedTracks: sv.availableDubs || []
            }
            if (sv.hasSummary !== undefined) {
                updates.hasSummary = Boolean(sv.hasSummary)
            }
            if ((sv.subtitleFiles || []).length > 0) {
                updates.hasTranscript = true
            }
            await updateVideo(video.id, updates)
        }
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
                subtitleSources: nv.subtitleFiles || [],
                dubbedTracks: nv.availableDubs || [],
                hasSummary: Boolean(nv.hasSummary),
                hasTranscript: (nv.subtitleFiles || []).length > 0,
                order: nv.order !== undefined ? nv.order : 999
            })
        }
    }

    // 6. Remove empty/removed modules
    for (const modId of removedModules) {
        await deleteModule(modId)
    }

    // 7. Hydrate any notes/canvas/settings changes from .tutin vault
    try {
        await api.post(`/api/courses/${courseId}/hydrate-vault`)
    } catch (e) {
        console.warn('Sync vault hydration notice:', e)
    }

    return true
}

