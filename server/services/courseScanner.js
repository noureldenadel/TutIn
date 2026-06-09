/**
 * TutIn Server — Course Scanner Service
 * 
 * Recursively scans directories to detect course structure.
 * Port of the browser-side fileSystem.js scanner to Node.js.
 */

import fs from 'fs'
import path from 'path'
import { execFile } from 'child_process'
import { parseMp4Duration } from '../utils/mp4Parser.js'
import { extractLangCode } from '../utils/captionParser.js'
import { parseTsDuration } from '../utils/tsParser.js'

/**
 * Supported video file extensions
 */
const VIDEO_EXTENSIONS = new Set([
    '.mp4', '.webm', '.mov', '.ogg', '.avi', '.mkv', '.m4v', '.ts'
])

const SUBTITLE_EXTENSIONS = new Set(['.srt', '.vtt', '.ass', '.ssa'])

// Folder names managed by TutIn — skip during module scanning
const MANAGED_FOLDERS = new Set(['Captions', 'Dubs'])

/**
 * Check if a filename is a video file
 */
function isVideoFile(fileName) {
    const ext = path.extname(fileName).toLowerCase()
    return VIDEO_EXTENSIONS.has(ext)
}

/**
 * Recursively find image files in a directory up to a certain depth
 */
function findImagesRecursive(dirPath, maxDepth = 3, currentDepth = 0) {
    if (currentDepth > maxDepth) return []
    let results = []
    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true })
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name)
            if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase()
                if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
                    results.push(fullPath)
                }
            } else if (entry.isDirectory() && !MANAGED_FOLDERS.has(entry.name)) {
                results = results.concat(findImagesRecursive(fullPath, maxDepth, currentDepth + 1))
            }
        }
    } catch (err) {}
    return results
}

/**
 * Natural sort comparator for alphanumeric strings
 */
function naturalSort(a, b) {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

/**
 * Clean a course title from folder name
 */
function cleanCourseTitle(name) {
    if (!name) return 'Untitled Course'
    const cleaned = name
        .replace(/^\s*\(*\s*(?:incompleted|completed)\s*\)*\s*/i, '') // Remove (incompleted)
        .replace(/^[\s._\-\u2013\u2014\d]+/, '') // Remove leading numbers/dashes
        .replace(/[_\-\u2013\u2014]/g, ' ') // Replace symbols with spaces
        .replace(/\s+/g, ' ') // Collapse multiple spaces
        .trim()
    return cleaned || name
}

/**
 * Clean a module title from folder name
 */
function cleanModuleTitle(name) {
    if (!name) return 'Untitled Module'
    const cleaned = name
        .replace(/^[\s._\-\u2013\u2014\d]+/, '') // Remove leading numbers/dashes
        .replace(/^(?:module|section|chapter)\s*\d*[\s._\-\u2013\u2014]*/i, '') // Remove "Module 01 - "
        .replace(/[_\-\u2013\u2014]/g, ' ') // Replace symbols with spaces
        .replace(/\s+/g, ' ') // Collapse multiple spaces
        .trim()
    return cleaned || name
}

/**
 * Clean a video title from filename
 */
function cleanVideoTitle(name) {
    if (!name) return 'Untitled Video'
    const base = name.replace(/\.[^.]+$/, '')
    const cleaned = base
        .replace(/^[\s._\-\u2013\u2014\d]+/, '') // Remove leading numbers/dashes
        .replace(/[_\-\u2013\u2014]/g, ' ') // Replace symbols with spaces
        .replace(/\s+/g, ' ') // Collapse multiple spaces
        .trim()
    return cleaned || base
}

let hasFfprobe = null

async function checkFfprobe() {
    if (hasFfprobe !== null) return hasFfprobe
    return new Promise((resolve) => {
        execFile('ffprobe', ['-version'], { timeout: 2000 }, (error) => {
            hasFfprobe = !error
            resolve(hasFfprobe)
        })
    })
}

function isValidDuration(duration) {
    // Valid duration is between 1 second and 10 hours (36000 seconds)
    return duration >= 1 && duration <= 36000
}

/**
 * Get video duration using ffprobe (if available), falling back to MP4 header parsing
 */
async function getVideoDuration(filePath) {
    // Try ffprobe first if available
    const ffprobeAvailable = await checkFfprobe()
    if (ffprobeAvailable) {
        const ffprobeDuration = await tryFfprobe(filePath)
        if (isValidDuration(ffprobeDuration)) return ffprobeDuration
    }

    const ext = path.extname(filePath).toLowerCase()
    if (ext === '.ts') {
        try {
            const tsDuration = await parseTsDuration(filePath)
            if (isValidDuration(tsDuration)) return tsDuration
        } catch (e) {
            console.error('[Scanner] Failed to parse TS duration:', e)
        }
        return 0
    }

    // Fallback: parse MP4/MOV container headers directly (no external tools needed)
    try {
        const fallbackDuration = await parseMp4Duration(filePath)
        const floored = Math.floor(fallbackDuration || 0)
        if (isValidDuration(floored)) return floored
        return 0
    } catch {
        return 0
    }
}

function tryFfprobe(filePath) {
    return new Promise((resolve) => {
        execFile('ffprobe', [
            '-v', 'quiet',
            '-print_format', 'json',
            '-show_format',
            filePath
        ], { timeout: 10000 }, (error, stdout) => {
            if (error) {
                resolve(0)
                return
            }
            try {
                const data = JSON.parse(stdout)
                const duration = parseFloat(data.format?.duration) || 0
                resolve(Math.floor(duration))
            } catch {
                resolve(0)
            }
        })
    })
}


/**
 * Count video files recursively in a directory
 */
function countVideosRecursive(dirPath) {
    let count = 0
    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true })
        for (const entry of entries) {
            if (entry.isFile() && isVideoFile(entry.name)) {
                count++
            } else if (entry.isDirectory()) {
                count += countVideosRecursive(path.join(dirPath, entry.name))
            }
        }
    } catch (err) {
        console.warn(`[Scanner] Cannot read directory: ${dirPath}`, err.message)
    }
    return count
}

/**
 * Recursively scan a directory and build a module structure
 */
async function scanDirectoryRecursive(dirPath, onProgress, progressState, courseRoot = dirPath, relModulePath = '') {
    let entries
    try {
        entries = fs.readdirSync(dirPath, { withFileTypes: true })
    } catch (err) {
        console.warn(`[Scanner] Cannot read directory: ${dirPath}`, err.message)
        return { title: path.basename(dirPath), videos: [], subModules: [], totalDuration: 0, totalVideos: 0 }
    }

    // Sort entries naturally
    entries.sort((a, b) => naturalSort(a.name, b.name))

    const directVideos = []
    const subfolders = []

    for (const entry of entries) {
        if (entry.isFile() && isVideoFile(entry.name)) {
            directVideos.push(entry)
        } else if (entry.isDirectory() && !MANAGED_FOLDERS.has(entry.name)) {
            subfolders.push(entry)
        }
    }

    // Process direct videos
    const videos = []
    let videoOrder = 0
    for (const videoEntry of directVideos) {
        progressState.count++
        onProgress?.(progressState.count, progressState.total)

        const videoPath = path.join(dirPath, videoEntry.name)
        const stat = fs.statSync(videoPath)
        const duration = await getVideoDuration(videoPath)

        const videoBase = path.basename(videoEntry.name, path.extname(videoEntry.name))

        // Detect pre-existing subtitle files (sibling to video)
        const subtitleFiles = entries
            .filter(e =>
                e.isFile() &&
                SUBTITLE_EXTENSIONS.has(path.extname(e.name).toLowerCase()) &&
                e.name.startsWith(videoBase)
            )
            .map(e => ({
                filePath: path.join(dirPath, e.name),
                lang: extractLangCode(e.name, videoBase) || 'source',
                format: path.extname(e.name).slice(1).replace('ssa', 'ass'),
                origin: 'existing'
            }))

        // Detect app-managed captions in Captions\ subfolder
        const captionsDir = path.join(courseRoot, 'Captions', relModulePath)
        const managedCaptions = fs.existsSync(captionsDir)
            ? fs.readdirSync(captionsDir)
                .filter(f => f.startsWith(videoBase) && SUBTITLE_EXTENSIONS.has(path.extname(f).toLowerCase()))
                .map(f => ({
                    filePath: path.join(captionsDir, f),
                    lang: extractLangCode(f, videoBase) || 'source',
                    format: path.extname(f).slice(1),
                    origin: 'generated'
                }))
            : []

        // Detect dubbed audio in Dubs\ subfolder
        const dubsDir = path.join(courseRoot, 'Dubs', relModulePath)
        const availableDubs = fs.existsSync(dubsDir)
            ? fs.readdirSync(dubsDir)
                .filter(f => f.startsWith(videoBase) && f.endsWith('.mp3'))
                .map(f => ({
                    filePath: path.join(dubsDir, f),
                    lang: extractLangCode(f.replace('.mp3', ''), videoBase) || 'unknown'
                }))
            : []

        // Merge: pre-existing files first, then managed (avoid duplicate langs)
        const seenLangs = new Set()
        const allSubtitles = [...subtitleFiles, ...managedCaptions].filter(s => {
            if (seenLangs.has(`${s.lang}:${s.origin}`)) return false
            seenLangs.add(`${s.lang}:${s.origin}`)
            return true
        })

        videos.push({
            title: cleanVideoTitle(videoEntry.name),
            originalTitle: videoEntry.name,
            fileName: videoEntry.name,
            filePath: videoPath,
            fileSize: stat.size,
            duration,
            order: videoOrder++,
            subtitleFiles: allSubtitles,
            availableDubs,
        })
    }

    // Recursively scan subfolders
    const subModules = []
    let subModuleOrder = 0
    for (const folder of subfolders) {
        const folderPath = path.join(dirPath, folder.name)
        const relChild = relModulePath ? path.join(relModulePath, folder.name) : folder.name
        const childModule = await scanDirectoryRecursive(folderPath, onProgress, progressState, courseRoot, relChild)
        if (childModule.videos.length > 0 || childModule.subModules.length > 0) {
            childModule.order = subModuleOrder++
            subModules.push(childModule)
        }
    }

    // Calculate totals
    const ownDuration = videos.reduce((sum, v) => sum + v.duration, 0)
    const descendantDuration = subModules.reduce((sum, m) => sum + m.totalDuration, 0)
    const ownVideoCount = videos.length
    const descendantVideoCount = subModules.reduce((sum, m) => sum + m.totalVideos, 0)

    return {
        title: cleanModuleTitle(path.basename(dirPath)),
        originalTitle: path.basename(dirPath),
        folderPath: dirPath,
        order: 0,
        videos,
        subModules,
        totalDuration: ownDuration + descendantDuration,
        totalVideos: ownVideoCount + descendantVideoCount,
    }
}

/**
 * Scan a course folder and return the full course structure
 * 
 * @param {string} folderPath - Absolute path to the course folder
 * @param {Function} onProgress - Optional callback (current, total)
 * @param {boolean} autoDetectThumbnails - Whether to look for thumbnail images
 * @returns {Object} Course structure with modules and videos
 */
export async function scanCourseFolder(folderPath, onProgress, autoDetectThumbnails = false) {
    const courseName = path.basename(folderPath)

    if (!fs.existsSync(folderPath)) {
        throw new Error(`Folder not found: ${folderPath}`)
    }

    // Count total videos for progress tracking
    const totalVideos = countVideosRecursive(folderPath)
    if (totalVideos === 0) {
        throw new Error('No video files found in the selected folder.')
    }

    const progressState = { count: 0, total: totalVideos }

    // Read top-level entries
    const entries = fs.readdirSync(folderPath, { withFileTypes: true })
    entries.sort((a, b) => naturalSort(a.name, b.name))

    // Detect thumbnail if setting enabled
    let thumbnailBase64 = null
    if (autoDetectThumbnails) {
        const priorityNames = ['thumbnail', 'cover', 'folder', 'poster', 'art']
        const foundImagePaths = findImagesRecursive(folderPath, 0)

        if (foundImagePaths.length > 0) {
            let selectedPath = null
            
            // Priority 1: Exact matches for common thumbnail names (anywhere in found paths)
            selectedPath = foundImagePaths.find(fPath => {
                const base = path.basename(fPath, path.extname(fPath)).toLowerCase()
                return priorityNames.includes(base)
            })
            
            // Priority 2: Partial matches
            if (!selectedPath) {
                selectedPath = foundImagePaths.find(fPath => {
                    const base = path.basename(fPath).toLowerCase()
                    return priorityNames.some(p => base.includes(p))
                })
            }
            
            // Priority 3: The largest image file
            if (!selectedPath) {
                let maxSize = -1
                for (const fPath of foundImagePaths) {
                    try {
                        const stat = fs.statSync(fPath)
                        if (stat.size > maxSize) {
                            maxSize = stat.size
                            selectedPath = fPath
                        }
                    } catch {}
                }
            }

            // Fallback: just the first image found
            if (!selectedPath) selectedPath = foundImagePaths[0]

            if (selectedPath) {
                try {
                    const buffer = fs.readFileSync(selectedPath)
                    const ext = path.extname(selectedPath).toLowerCase().replace('.', '')
                    const mime = ext === 'jpg' ? 'jpeg' : ext
                    thumbnailBase64 = `data:image/${mime};base64,${buffer.toString('base64')}`
                } catch (err) {
                    console.warn('[Scanner] Failed to read thumbnail:', err.message)
                }
            }
        }
    }

    const rootVideoEntries = []
    const subfolders = []

    for (const entry of entries) {
        if (entry.isFile() && isVideoFile(entry.name)) {
            rootVideoEntries.push(entry)
        } else if (entry.isDirectory()) {
            subfolders.push(entry)
        }
    }

    const modules = []

    // Scan subfolders as top-level modules
    if (subfolders.length > 0) {
        let moduleOrder = 0
        for (const folder of subfolders) {
            const folderFullPath = path.join(folderPath, folder.name)
            const moduleData = await scanDirectoryRecursive(folderFullPath, onProgress, progressState)
            if (moduleData.videos.length > 0 || moduleData.subModules.length > 0) {
                moduleData.order = moduleOrder++
                modules.push(moduleData)
            }
        }
    }

    // Root-level videos → "Main Content" module (placed at the top)
    if (rootVideoEntries.length > 0) {
        const rootVideos = []
        let videoOrder = 0
        for (const videoEntry of rootVideoEntries) {
            progressState.count++
            onProgress?.(progressState.count, progressState.total)

            const videoPath = path.join(folderPath, videoEntry.name)
            const stat = fs.statSync(videoPath)
            const duration = await getVideoDuration(videoPath)

            rootVideos.push({
                title: cleanVideoTitle(videoEntry.name),
                originalTitle: videoEntry.name,
                fileName: videoEntry.name,
                filePath: videoPath,
                fileSize: stat.size,
                duration,
                order: videoOrder++,
            })
        }

        modules.unshift({
            title: 'Main Content',
            originalTitle: courseName,
            folderPath: folderPath,
            order: 0,
            videos: rootVideos,
            subModules: [],
            totalDuration: rootVideos.reduce((sum, v) => sum + v.duration, 0),
            totalVideos: rootVideos.length,
        })
        
        // Reassign order for all modules to ensure they are sequential
        modules.forEach((mod, idx) => { mod.order = idx })
    }

    const totalDuration = modules.reduce((sum, m) => sum + m.totalDuration, 0)

    return {
        title: cleanCourseTitle(courseName),
        originalTitle: courseName,
        folderPath,
        totalDuration,
        totalVideos,
        thumbnailData: thumbnailBase64,
        modules,
    }
}
