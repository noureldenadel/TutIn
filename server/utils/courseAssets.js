/**
 * TutIn — Course Assets & Portable Vault Utility
 *
 * Manages reading and writing of course-local portable vaults inside `<courseFolder>/.tutin/`.
 *
 * Directory Layout:
 *   <courseFolder>/.tutin/
 *     ├── metadata.json
 *     ├── canvas.json
 *     ├── notes/
 *     │   ├── notes.json
 *     │   └── screenshots/
 *     ├── captions/<relModPath>/<base>.<lang>.vtt
 *     └── dubs/<relModPath>/<base>.<lang>.mp3
 *
 * Pre-existing subtitle files (next to videos) are NEVER modified.
 */

import fs from 'fs'
import path from 'path'
import { getDataDir } from '../database.js'
import { chunksToVTT, parseVTT, parseSRT, parseASS } from './captionParser.js'
export { chunksToVTT, parseVTT, parseSRT, parseASS }

// ── Vault Directory Helpers ─────────────────────────────────────

/**
 * Returns (and creates) the root .tutin vault directory for a course.
 */
export function getVaultDir(courseFolder) {
    if (!courseFolder) return null
    const dir = path.join(courseFolder, '.tutin')
    if (!fs.existsSync(dir)) {
        try { fs.mkdirSync(dir, { recursive: true }) } catch { return null }
    }
    return dir
}

/**
 * Returns (and creates) the captions directory inside .tutin (or fallback to legacy Captions/).
 */
export function getCaptionsDir(courseFolder, relModulePath = '') {
    if (!courseFolder) return null
    const vaultDir = getVaultDir(courseFolder)
    const dir = path.join(vaultDir || courseFolder, 'captions', relModulePath)
    if (!fs.existsSync(dir)) {
        try { fs.mkdirSync(dir, { recursive: true }) } catch { return null }
    }
    return dir
}

/**
 * Returns (and creates) the dubs directory inside .tutin (or fallback to legacy Dubs/).
 */
export function getDubsDir(courseFolder, relModulePath = '') {
    if (!courseFolder) return null
    const vaultDir = getVaultDir(courseFolder)
    const dir = path.join(vaultDir || courseFolder, 'dubs', relModulePath)
    if (!fs.existsSync(dir)) {
        try { fs.mkdirSync(dir, { recursive: true }) } catch { return null }
    }
    return dir
}

/**
 * Returns (and creates) the notes directory inside .tutin.
 */
export function getNotesDir(courseFolder) {
    if (!courseFolder) return null
    const vaultDir = getVaultDir(courseFolder)
    if (!vaultDir) return null
    const dir = path.join(vaultDir, 'notes')
    if (!fs.existsSync(dir)) {
        try { fs.mkdirSync(dir, { recursive: true }) } catch { return null }
    }
    return dir
}

/**
 * Returns (and creates) the screenshots directory inside .tutin/notes/screenshots.
 */
export function getScreenshotsDir(courseFolder) {
    if (!courseFolder) return null
    const notesDir = getNotesDir(courseFolder)
    if (!notesDir) return null
    const dir = path.join(notesDir, 'screenshots')
    if (!fs.existsSync(dir)) {
        try { fs.mkdirSync(dir, { recursive: true }) } catch { return null }
    }
    return dir
}

/**
 * Returns (and creates) the summaries directory inside .tutin/summaries.
 */
export function getSummariesVaultDir(courseFolder, relModulePath = '') {
    if (!courseFolder) return null
    const vaultDir = getVaultDir(courseFolder)
    if (!vaultDir) return null
    const dir = path.join(vaultDir, 'summaries', relModulePath)
    if (!fs.existsSync(dir)) {
        try { fs.mkdirSync(dir, { recursive: true }) } catch { return null }
    }
    return dir
}

/**
 * Full path for a managed caption file.
 * e.g. /Course/.tutin/captions/Module 1/01 - Intro.ar.vtt
 */
export function getCaptionFilePath(courseFolder, relModulePath, videoBaseName, lang, origin = null) {
    const dir = getCaptionsDir(courseFolder, relModulePath)
    if (!dir) return null
    
    const isGenerated = origin === 'generated'
    const originSuffix = isGenerated ? '-generated' : ''
    const safeLang = (lang && lang !== 'source') ? lang : 'en'
    
    return path.join(dir, `${videoBaseName}${originSuffix}.${safeLang}.vtt`)
}

/**
 * Full path for a dubbed audio file.
 * e.g. /Course/.tutin/dubs/Module 1/01 - Intro.ar.mp3
 */
export function getDubFilePath(courseFolder, relModulePath, videoBaseName, lang) {
    const dir = getDubsDir(courseFolder, relModulePath)
    if (!dir) return null
    return path.join(dir, `${videoBaseName}.${lang}.mp3`)
}

/**
 * Full path for a summary markdown file.
 * e.g. /Course/.tutin/summaries/Module 1/01 - Intro.md
 */
export function getSummaryFilePath(courseFolder, relModulePath, videoBaseName) {
    const dir = getSummariesVaultDir(courseFolder, relModulePath)
    if (!dir) return null
    return path.join(dir, `${videoBaseName}.md`)
}

// ── AppData Cache Helpers (used ONLY for Web / Cloud Stream Courses) ─────────────

export function getTranscriptsDir() {
    const dir = path.join(getDataDir(), 'transcripts')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    return dir
}

export function getCacheFilePath(videoId, lang) {
    const suffix = lang && lang !== 'source' ? `.${lang}` : ''
    return path.join(getTranscriptsDir(), `${videoId}${suffix}.json`)
}

// ── Caption Save & Load ─────────────────────────────────────────

/**
 * Save caption chunks.
 * For local courses: writes exclusively to `<courseFolder>/.tutin/captions/` and removes any stale AppData cache.
 * For cloud courses: writes to AppData cache.
 */
export function saveCaptionFile(videoMeta, lang, chunks, origin = null) {
    const { id, courseFolder, relModulePath = '', videoBaseName } = videoMeta

    if (courseFolder && fs.existsSync(courseFolder)) {
        const vttPath = getCaptionFilePath(courseFolder, relModulePath, videoBaseName, lang, origin)
        if (vttPath) {
            try {
                fs.writeFileSync(vttPath, chunksToVTT(chunks), 'utf8')
            } catch (err) {
                console.warn('[CourseAssets] Failed to write caption file in vault:', err.message)
            }
        }

        // Clean up any stale AppData cache file so the local course folder is the sole source of truth
        try {
            const staleCache = getCacheFilePath(id, lang)
            if (fs.existsSync(staleCache)) fs.unlinkSync(staleCache)
        } catch { }

        return vttPath
    }

    // Cloud course fallback: save to AppData
    const cachePath = getCacheFilePath(id, lang)
    try {
        fs.writeFileSync(cachePath, JSON.stringify(chunks, null, 2), 'utf8')
    } catch { }

    return cachePath
}

/**
 * Load caption chunks for a video + language.
 * Local course:
 *   1. Course .tutin/captions/ VTT file
 *   2. Legacy Captions/ VTT file
 *   3. Subtitle sources (sibling files next to video)
 *   (Never loads from AppData cache for local courses)
 * Cloud course:
 *   1. AppData cache
 *   2. Subtitle sources
 */
function normalizeChunks(rawChunks) {
    if (!Array.isArray(rawChunks)) return []
    return rawChunks.map(c => {
        const start = typeof c.start === 'number' ? c.start : (Array.isArray(c.timestamp) ? c.timestamp[0] : 0)
        const end = typeof c.end === 'number' ? c.end : (Array.isArray(c.timestamp) ? c.timestamp[1] : (start + 2))
        return {
            start: Number(start) || 0,
            end: Number(end) || (Number(start) + 2),
            timestamp: [Number(start) || 0, Number(end) || (Number(start) + 2)],
            text: (c.text || '').trim()
        }
    })
}

export function loadCaptionChunks(videoId, lang, subtitleSources = [], courseFolder = null, relModulePath = '', videoBaseName = '') {
    const isLocalCourse = Boolean(courseFolder && fs.existsSync(courseFolder))

    if (isLocalCourse) {
        // 1. Try subtitle_sources entry if available and valid
        let targetLang = lang
        let targetOrigin = null
        if (lang && lang.includes(':')) {
            const parts = lang.split(':')
            targetLang = parts[0]
            targetOrigin = parts[1]
        }

        let sourceEntry = subtitleSources.find(s =>
            ((targetLang === 'source' && (!s.lang || s.lang === 'source')) || s.lang === targetLang) && 
            (!targetOrigin || s.origin === targetOrigin) &&
            s.is_master
        )
        if (!sourceEntry) {
            sourceEntry = subtitleSources.find(s =>
                ((targetLang === 'source' && (!s.lang || s.lang === 'source')) || s.lang === targetLang) && 
                (!targetOrigin || s.origin === targetOrigin)
            )
        }
        if (sourceEntry?.filePath && fs.existsSync(sourceEntry.filePath)) {
            try {
                const text = fs.readFileSync(sourceEntry.filePath, 'utf8')
                const chunks = readCaptionFile(text, sourceEntry.filePath)
                if (chunks.length) return normalizeChunks(chunks)
            } catch { /* fall through */ }
        }

        // 2. Direct checks in course vault .tutin/captions/
        if (videoBaseName) {
            const cleanLang = (lang && lang !== 'source') ? lang : ''
            const captionsDir = path.join(courseFolder, '.tutin', 'captions', relModulePath)

            if (fs.existsSync(captionsDir) && cleanLang) {
                // Check user provided / uploaded format: <base>.<lang>.vtt
                const userVtt = path.join(captionsDir, `${videoBaseName}.${cleanLang}.vtt`)
                if (fs.existsSync(userVtt)) {
                    try {
                        const text = fs.readFileSync(userVtt, 'utf8')
                        const chunks = parseVTT(text)
                        if (chunks.length) return normalizeChunks(chunks)
                    } catch { /* fall through */ }
                }

                // Check AI generated format: <base>-generated.<lang>.vtt
                const genVtt = path.join(captionsDir, `${videoBaseName}-generated.${cleanLang}.vtt`)
                if (fs.existsSync(genVtt)) {
                    try {
                        const text = fs.readFileSync(genVtt, 'utf8')
                        const chunks = parseVTT(text)
                        if (chunks.length) return normalizeChunks(chunks)
                    } catch { /* fall through */ }
                }

                // Check legacy format with -uploaded: <base>-uploaded.<lang>.vtt
                const legacyUploadedVtt = path.join(captionsDir, `${videoBaseName}-uploaded.${cleanLang}.vtt`)
                if (fs.existsSync(legacyUploadedVtt)) {
                    try {
                        const text = fs.readFileSync(legacyUploadedVtt, 'utf8')
                        const chunks = parseVTT(text)
                        if (chunks.length) return normalizeChunks(chunks)
                    } catch { /* fall through */ }
                }
            }

            // Also check for default .vtt when lang is 'source'
            if (lang === 'source') {
                const vaultSourceVtt = path.join(courseFolder, '.tutin', 'captions', relModulePath, `${videoBaseName}.vtt`)
                if (fs.existsSync(vaultSourceVtt)) {
                    try {
                        const text = fs.readFileSync(vaultSourceVtt, 'utf8')
                        const chunks = parseVTT(text)
                        if (chunks.length) return normalizeChunks(chunks)
                    } catch { /* fall through */ }
                }
                const vaultGenSourceVtt = path.join(courseFolder, '.tutin', 'captions', relModulePath, `${videoBaseName}-generated.vtt`)
                if (fs.existsSync(vaultGenSourceVtt)) {
                    try {
                        const text = fs.readFileSync(vaultGenSourceVtt, 'utf8')
                        const chunks = parseVTT(text)
                        if (chunks.length) return normalizeChunks(chunks)
                    } catch { /* fall through */ }
                }
            }

            // Check legacy /Captions/ folder
            if (cleanLang) {
                const legacyVtt = path.join(courseFolder, 'Captions', relModulePath, `${videoBaseName}.${cleanLang}.vtt`)
                if (fs.existsSync(legacyVtt)) {
                    try {
                        const text = fs.readFileSync(legacyVtt, 'utf8')
                        const chunks = parseVTT(text)
                        if (chunks.length) return normalizeChunks(chunks)
                    } catch { /* fall through */ }
                }
            }
        }
    } else {
        // Cloud course: check AppData cache
        const cachePath = getCacheFilePath(videoId, lang)
        if (fs.existsSync(cachePath)) {
            try { return normalizeChunks(JSON.parse(fs.readFileSync(cachePath, 'utf8'))) } catch { /* fall through */ }
        }
    }

    // Try any matching subtitle_sources fallback
    let sourceEntry = subtitleSources.find(s =>
        ((lang === 'source' && (!s.lang || s.lang === 'source')) || s.lang === lang)
    )
    if (!sourceEntry && subtitleSources.length > 0) {
        sourceEntry = subtitleSources[0]
    }
    if (sourceEntry?.filePath && fs.existsSync(sourceEntry.filePath)) {
        try {
            const text = fs.readFileSync(sourceEntry.filePath, 'utf8')
            const chunks = readCaptionFile(text, sourceEntry.filePath)
            if (chunks.length) return normalizeChunks(chunks)
        } catch { /* fall through */ }
    }

    return []
}

/**
 * Parse caption text based on file extension.
 */
export function readCaptionFile(text, filePath) {
    const ext = path.extname(filePath).toLowerCase()
    if (ext === '.vtt') return parseVTT(text)
    if (ext === '.ass' || ext === '.ssa') return parseASS(text)
    return parseSRT(text)
}

// ── Language Discovery ──────────────────────────────────────────

/**
 * List all available caption languages in course vault or legacy folder.
 */
export function listCourseLanguages(courseFolder) {
    if (!courseFolder) return { langs: [] }
    const langs = new Set()

    const checkDir = (dir) => {
        if (!fs.existsSync(dir)) return
        function walk(current) {
            try {
                for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
                    if (entry.isDirectory()) {
                        walk(path.join(current, entry.name))
                    } else if (entry.name.endsWith('.vtt')) {
                        const parts = entry.name.split('.')
                        if (parts.length >= 3) {
                            langs.add(parts[parts.length - 2])
                        }
                    }
                }
            } catch { }
        }
        walk(dir)
    }

    checkDir(path.join(courseFolder, '.tutin', 'captions'))
    checkDir(path.join(courseFolder, 'Captions'))

    return { langs: [...langs] }
}

/**
 * List all languages available for a specific video.
 * For local courses: inspects exclusively the course folder (.tutin/captions, Captions, sibling files).
 * For cloud courses: inspects AppData cache and subtitleSources.
 */
export function listVideoLanguages(videoId, subtitleSources = [], courseFolder = null, relModulePath = '', videoBaseName = '') {
    const translatedLangs = new Set()
    const isLocalCourse = Boolean(courseFolder && fs.existsSync(courseFolder))

    if (isLocalCourse && videoBaseName) {
        // Inspect course vault .tutin/captions/
        const checkVaultDir = (baseDir) => {
            const modDir = path.join(baseDir, relModulePath)
            if (fs.existsSync(modDir)) {
                try {
                    const files = fs.readdirSync(modDir)
                    for (const f of files) {
                        if (f.startsWith(videoBaseName) && f.endsWith('.vtt')) {
                            const parts = f.split('.')
                            if (parts.length >= 3) {
                                const l = parts[parts.length - 2]
                                if (l && l !== 'source') translatedLangs.add(l)
                            }
                        }
                    }
                } catch { }
            }
        }
        checkVaultDir(path.join(courseFolder, '.tutin', 'captions'))
        checkVaultDir(path.join(courseFolder, 'Captions'))
    } else if (!isLocalCourse) {
        // Cloud course: check AppData cache
        const transcriptsDir = getTranscriptsDir()
        try {
            const files = fs.readdirSync(transcriptsDir)
            for (const f of files) {
                if (!f.startsWith(videoId)) continue
                const withoutId = f.slice(videoId.length)
                const match = withoutId.match(/^\.([a-z]{2,3})\.json$/)
                if (match) translatedLangs.add(match[1])
            }
        } catch { }
    }

    let sourceExists = false
    if (isLocalCourse && videoBaseName) {
        sourceExists = (
            fs.existsSync(path.join(courseFolder, '.tutin', 'captions', relModulePath, `${videoBaseName}.source.vtt`)) ||
            fs.existsSync(path.join(courseFolder, '.tutin', 'captions', relModulePath, `${videoBaseName}.vtt`)) ||
            fs.existsSync(path.join(courseFolder, '.tutin', 'captions', relModulePath, `${videoBaseName}-generated.vtt`)) ||
            fs.existsSync(path.join(courseFolder, 'Captions', relModulePath, `${videoBaseName}.vtt`))
        )
    } else if (!isLocalCourse) {
        sourceExists = fs.existsSync(path.join(getTranscriptsDir(), `${videoId}.json`))
    }

    const dbSources = subtitleSources.filter(s => {
        if (s.filePath && !fs.existsSync(s.filePath)) return false
        return true
    })

    const existingLangs = Array.from(new Set(dbSources
        .filter(s => s.origin === 'existing' || s.origin === 'uploaded')
        .map(s => s.lang || 'source')))

    if (existingLangs.includes('source') || dbSources.some(s => s.lang === 'source' || !s.lang)) {
        sourceExists = true
    }

    dbSources
        .filter(s => s.origin === 'generated' && s.lang !== 'source')
        .forEach(s => translatedLangs.add(s.lang))

    // Exclude languages that already exist as uploaded/existing sources
    const uniqueTranslatedLangs = [...translatedLangs].filter(l => !existingLangs.includes(l))

    return { sourceExists: Boolean(sourceExists), translatedLangs: uniqueTranslatedLangs, existingLangs }
}

// ── Dubbing Helpers ─────────────────────────────────────────────

/**
 * List all dubbed languages available for a video.
 */
export function listDubLanguages(videoId, courseFolder = null, relModulePath = '', videoBaseName = '') {
    const langs = new Set()
    const isLocalCourse = Boolean(courseFolder && fs.existsSync(courseFolder))

    if (isLocalCourse && videoBaseName) {
        const checkDubs = (baseDir) => {
            const modDir = path.join(baseDir, relModulePath)
            if (fs.existsSync(modDir)) {
                try {
                    fs.readdirSync(modDir)
                        .filter(f => f.startsWith(videoBaseName) && f.endsWith('.mp3'))
                        .forEach(f => {
                            const parts = f.split('.')
                            if (parts.length >= 3) langs.add(parts[parts.length - 2])
                        })
                } catch { }
            }
        }
        checkDubs(path.join(courseFolder, '.tutin', 'dubs'))
        checkDubs(path.join(courseFolder, 'Dubs'))
    } else if (!isLocalCourse) {
        const dubsDir = path.join(getDataDir(), 'dubs')
        if (fs.existsSync(dubsDir)) {
            try {
                fs.readdirSync(dubsDir)
                    .filter(f => f.startsWith(videoId) && f.endsWith('.mp3'))
                    .forEach(f => {
                        const match = f.match(new RegExp(`^${videoId}\\.([a-z]{2,3})\\.mp3$`))
                        if (match) langs.add(match[1])
                    })
            } catch { }
        }
    }

    return [...langs]
}

/**
 * Get path to dubbed audio file.
 * For local courses: checks exclusively the course folder (.tutin/dubs and Dubs).
 * For cloud courses: checks AppData cache.
 */
export function getDubFilePathForPlayback(videoId, lang, courseFolder = null, relModulePath = '', videoBaseName = '') {
    const isLocalCourse = Boolean(courseFolder && fs.existsSync(courseFolder))

    if (isLocalCourse && videoBaseName) {
        const vaultDub = path.join(courseFolder, '.tutin', 'dubs', relModulePath, `${videoBaseName}.${lang}.mp3`)
        if (fs.existsSync(vaultDub)) return vaultDub

        const legacyDub = path.join(courseFolder, 'Dubs', relModulePath, `${videoBaseName}.${lang}.mp3`)
        if (fs.existsSync(legacyDub)) return legacyDub

        return null
    }

    // Cloud course fallback
    const cachePath = path.join(getDataDir(), 'dubs', `${videoId}.${lang}.mp3`)
    return fs.existsSync(cachePath) ? cachePath : null
}

export function getDubCachePath(videoId, lang) {
    const p = path.join(getDataDir(), 'dubs', `${videoId}.${lang}.mp3`)
    return fs.existsSync(p) ? p : null
}

// ── Vault Notes, Screenshots, Canvas & Summaries Persistence ──────────────

/**
 * Save notes for a course to <courseFolder>/.tutin/notes/notes.json.
 */
export function saveVaultNotes(courseFolder, notes) {
    if (!courseFolder || !fs.existsSync(courseFolder)) return false
    const notesDir = getNotesDir(courseFolder)
    if (!notesDir) return false

    const filePath = path.join(notesDir, 'notes.json')
    try {
        fs.writeFileSync(filePath, JSON.stringify(notes, null, 2), 'utf8')
        return true
    } catch (err) {
        console.error('[CourseAssets] Failed to save vault notes:', err.message)
        return false
    }
}

/**
 * Load notes from <courseFolder>/.tutin/notes/notes.json.
 */
export function loadVaultNotes(courseFolder) {
    if (!courseFolder) return []
    const filePath = path.join(courseFolder, '.tutin', 'notes', 'notes.json')
    if (fs.existsSync(filePath)) {
        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'))
        } catch { }
    }
    return []
}

/**
 * Save canvas whiteboard data to <courseFolder>/.tutin/canvas.json.
 */
export function saveVaultCanvas(courseFolder, canvasData) {
    if (!courseFolder || !fs.existsSync(courseFolder)) return false
    const vaultDir = getVaultDir(courseFolder)
    if (!vaultDir) return false

    const filePath = path.join(vaultDir, 'canvas.json')
    try {
        fs.writeFileSync(filePath, JSON.stringify(canvasData, null, 2), 'utf8')
        return true
    } catch (err) {
        console.error('[CourseAssets] Failed to save vault canvas:', err.message)
        return false
    }
}

/**
 * Load canvas whiteboard data from <courseFolder>/.tutin/canvas.json.
 */
export function loadVaultCanvas(courseFolder) {
    if (!courseFolder) return null
    const filePath = path.join(courseFolder, '.tutin', 'canvas.json')
    if (fs.existsSync(filePath)) {
        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'))
        } catch { }
    }
    return null
}

/**
 * Save course metadata (language, instructor, tags, title) to <courseFolder>/.tutin/metadata.json.
 */
export function saveVaultMetadata(courseFolder, metadata) {
    if (!courseFolder || !fs.existsSync(courseFolder)) return false
    const vaultDir = getVaultDir(courseFolder)
    if (!vaultDir) return false

    const filePath = path.join(vaultDir, 'metadata.json')
    try {
        fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2), 'utf8')
        return true
    } catch (err) {
        console.error('[CourseAssets] Failed to save vault metadata:', err.message)
        return false
    }
}

/**
 * Load course metadata from <courseFolder>/.tutin/metadata.json.
 */
export function loadVaultMetadata(courseFolder) {
    if (!courseFolder) return null
    const filePath = path.join(courseFolder, '.tutin', 'metadata.json')
    if (fs.existsSync(filePath)) {
        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'))
        } catch { }
    }
    return null
}

/**
 * Save video summary to <courseFolder>/.tutin/summaries/<relModPath>/<base>.md.
 */
export function saveVaultSummary(courseFolder, relModulePath, videoBaseName, content) {
    if (!courseFolder || !fs.existsSync(courseFolder)) return false
    const summaryPath = getSummaryFilePath(courseFolder, relModulePath, videoBaseName)
    if (!summaryPath) return false
    try {
        fs.writeFileSync(summaryPath, content || '', 'utf8')
        return true
    } catch (err) {
        console.error('[CourseAssets] Failed to save vault summary:', err.message)
        return false
    }
}

/**
 * Load video summary from <courseFolder>/.tutin/summaries/<relModPath>/<base>.md.
 */
export function loadVaultSummary(courseFolder, relModulePath, videoBaseName) {
    if (!courseFolder || !fs.existsSync(courseFolder)) return null
    const summaryPath = getSummaryFilePath(courseFolder, relModulePath, videoBaseName)
    if (summaryPath && fs.existsSync(summaryPath)) {
        try {
            return fs.readFileSync(summaryPath, 'utf8')
        } catch { }
    }
    return null
}

/**
 * Delete video summary from vault.
 */
export function deleteVaultSummary(courseFolder, relModulePath, videoBaseName) {
    if (!courseFolder || !fs.existsSync(courseFolder)) return false
    const summaryPath = getSummaryFilePath(courseFolder, relModulePath, videoBaseName)
    if (summaryPath && fs.existsSync(summaryPath)) {
        try {
            fs.unlinkSync(summaryPath)
            return true
        } catch { }
    }
    return false
}

/**
 * Scan and return detailed metrics for the entire .tutin vault and all assets:
 * Dubs, Transcripts, Summaries, Canvas, Notes, Screenshots, Metadata, and Disk Size.
 */
export function scanVaultSummary(courseFolder) {
    if (!courseFolder || !fs.existsSync(courseFolder)) {
        return { hasVault: false }
    }

    const vaultDir = path.join(courseFolder, '.tutin')
    const hasVault = fs.existsSync(vaultDir)

    let totalSizeBytes = 0
    let totalFileCount = 0

    function walkDir(dir) {
        if (!fs.existsSync(dir)) return
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true })
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name)
                if (entry.isFile()) {
                    totalFileCount++
                    try {
                        const stat = fs.statSync(fullPath)
                        totalSizeBytes += stat.size
                    } catch { }
                } else if (entry.isDirectory()) {
                    walkDir(fullPath)
                }
            }
        } catch { }
    }

    if (hasVault) {
        walkDir(vaultDir)
    }

    // 1. Dubs (.tutin/dubs and legacy Dubs/)
    const dubFiles = []
    const dubLangs = new Set()
    let dubsSizeBytes = 0
    const scanDubsDir = (baseDir) => {
        if (!fs.existsSync(baseDir)) return
        function walk(dir) {
            try {
                for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                    const p = path.join(dir, e.name)
                    if (e.isDirectory()) walk(p)
                    else if (e.isFile() && e.name.endsWith('.mp3')) {
                        let size = 0
                        try {
                            const stat = fs.statSync(p)
                            size = stat.size
                            dubsSizeBytes += size
                        } catch { }
                        const parts = e.name.slice(0, -4).split('.')
                        const lang = parts.length >= 2 ? parts[parts.length - 1] : 'unknown'
                        dubLangs.add(lang)
                        dubFiles.push({ fileName: e.name, filePath: p, lang, sizeBytes: size })
                    }
                }
            } catch { }
        }
        walk(baseDir)
    }
    scanDubsDir(path.join(courseFolder, '.tutin', 'dubs'))
    scanDubsDir(path.join(courseFolder, 'Dubs'))

    // 2. Transcripts (.tutin/captions, legacy Captions, and sibling subs)
    const captionFiles = []
    const captionLangs = new Set()
    let generatedCaptionsCount = 0
    let uploadedCaptionsCount = 0
    const scanCaptionsDir = (baseDir) => {
        if (!fs.existsSync(baseDir)) return
        function walk(dir) {
            try {
                for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                    const p = path.join(dir, e.name)
                    if (e.isDirectory()) walk(p)
                    else if (e.isFile() && (e.name.endsWith('.vtt') || e.name.endsWith('.srt') || e.name.endsWith('.ass'))) {
                        const parts = e.name.slice(0, e.name.lastIndexOf('.')).split('.')
                        const lang = parts.length >= 2 ? parts[parts.length - 1].replace(/-generated$/, '') : 'source'
                        const isGenerated = e.name.includes('-generated')
                        if (isGenerated) generatedCaptionsCount++
                        else uploadedCaptionsCount++
                        captionLangs.add(lang)
                        captionFiles.push({
                            fileName: e.name,
                            filePath: p,
                            lang,
                            format: path.extname(e.name).slice(1),
                            isGenerated
                        })
                    }
                }
            } catch { }
        }
        walk(baseDir)
    }
    scanCaptionsDir(path.join(courseFolder, '.tutin', 'captions'))
    scanCaptionsDir(path.join(courseFolder, 'Captions'))

    // 3. Summaries (.tutin/summaries/)
    const summaryFiles = []
    const scanSummariesDir = (baseDir) => {
        if (!fs.existsSync(baseDir)) return
        function walk(dir) {
            try {
                for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                    const p = path.join(dir, e.name)
                    if (e.isDirectory()) walk(p)
                    else if (e.isFile() && e.name.endsWith('.md')) {
                        const baseName = e.name.replace(/\.md$/, '')
                        summaryFiles.push({ fileName: e.name, filePath: p, baseName })
                    }
                }
            } catch { }
        }
        walk(baseDir)
    }
    scanSummariesDir(path.join(courseFolder, '.tutin', 'summaries'))

    // 4. Canvas Whiteboard
    const canvasData = loadVaultCanvas(courseFolder)
    const hasCanvas = Boolean(canvasData && (canvasData.nodes?.length > 0 || canvasData.edges?.length > 0))
    const canvasNodeCount = canvasData?.nodes?.length || 0
    const canvasEdgeCount = canvasData?.edges?.length || 0

    // 5. Notes & Screenshots
    const notes = loadVaultNotes(courseFolder)
    const notesCount = notes?.length || 0
    let screenshotsCount = 0
    const screenshotsDir = path.join(courseFolder, '.tutin', 'notes', 'screenshots')
    if (fs.existsSync(screenshotsDir)) {
        try {
            screenshotsCount = fs.readdirSync(screenshotsDir).filter(f => {
                try { return !fs.statSync(path.join(screenshotsDir, f)).isDirectory() } catch { return false }
            }).length
        } catch { }
    }

    // 6. Metadata
    const metadata = loadVaultMetadata(courseFolder)

    return {
        hasVault,
        vaultPath: hasVault ? vaultDir : null,
        totalSizeBytes,
        totalFileCount,
        dubs: {
            count: dubFiles.length,
            languages: Array.from(dubLangs).sort(),
            sizeBytes: dubsSizeBytes,
            files: dubFiles
        },
        transcripts: {
            count: captionFiles.length,
            languages: Array.from(captionLangs).sort(),
            generatedCount: generatedCaptionsCount,
            uploadedCount: uploadedCaptionsCount,
            files: captionFiles
        },
        summaries: {
            count: summaryFiles.length,
            files: summaryFiles
        },
        canvas: {
            exists: hasCanvas,
            nodeCount: canvasNodeCount,
            edgeCount: canvasEdgeCount,
            viewport: canvasData?.viewport || null
        },
        notes: {
            count: notesCount,
            screenshotsCount,
            notesList: notes
        },
        metadata
    }
}

/**
 * Full Vault Loader: reads all existing vault data when a course folder is scanned / imported.
 */
export function loadFullVaultData(courseFolder) {
    if (!courseFolder || !fs.existsSync(courseFolder)) {
        return null
    }

    const summary = scanVaultSummary(courseFolder)

    return {
        hasVault: summary.hasVault,
        vaultPath: summary.vaultPath,
        metadata: summary.metadata,
        notes: summary.notes?.notesList || [],
        notesCount: summary.notes?.count || 0,
        screenshotsCount: summary.notes?.screenshotsCount || 0,
        canvas: summary.canvas,
        languages: listCourseLanguages(courseFolder),
        dubs: summary.dubs,
        transcripts: summary.transcripts,
        summaries: summary.summaries,
        totalSizeBytes: summary.totalSizeBytes,
        totalFileCount: summary.totalFileCount,
        vaultSummary: summary
    }
}

