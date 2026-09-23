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
 * Full path for a managed caption file.
 * e.g. /Course/.tutin/captions/Module 1/01 - Intro.ar.vtt
 */
export function getCaptionFilePath(courseFolder, relModulePath, videoBaseName, lang) {
    const dir = getCaptionsDir(courseFolder, relModulePath)
    if (!dir) return null
    return path.join(dir, `${videoBaseName}.${lang}.vtt`)
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

// ── AppData Cache Helpers (for Web/Cloud Fallback) ─────────────

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
 * Save caption chunks to both .tutin vault (if local) and AppData cache.
 */
export function saveCaptionFile(videoMeta, lang, chunks) {
    const { id, courseFolder, relModulePath = '', videoBaseName } = videoMeta

    let vttPath = null
    if (courseFolder && fs.existsSync(courseFolder)) {
        vttPath = getCaptionFilePath(courseFolder, relModulePath, videoBaseName, lang)
        if (vttPath) {
            try {
                fs.writeFileSync(vttPath, chunksToVTT(chunks), 'utf8')
            } catch (err) {
                console.warn('[CourseAssets] Failed to write caption file in vault:', err.message)
            }
        }
    }

    // Always update AppData cache
    const cachePath = getCacheFilePath(id, lang)
    try {
        fs.writeFileSync(cachePath, JSON.stringify(chunks, null, 2), 'utf8')
    } catch { }

    return vttPath || cachePath
}

/**
 * Load caption chunks for a video + language.
 * Fallback order:
 *   1. AppData cache
 *   2. Course .tutin/captions/ VTT file
 *   3. Legacy Captions/ VTT file
 *   4. Subtitle sources (sibling files)
 */
export function loadCaptionChunks(videoId, lang, subtitleSources = [], courseFolder = null, relModulePath = '', videoBaseName = '') {
    // 1. Try AppData cache
    const cachePath = getCacheFilePath(videoId, lang)
    if (fs.existsSync(cachePath)) {
        try { return JSON.parse(fs.readFileSync(cachePath, 'utf8')) } catch { /* fall through */ }
    }

    // 2. Try course vault: .tutin/captions/<relModPath>/<base>.<lang>.vtt
    if (courseFolder && videoBaseName) {
        const vaultVtt = getCaptionFilePath(courseFolder, relModulePath, videoBaseName, lang)
        if (vaultVtt && fs.existsSync(vaultVtt)) {
            try {
                const text = fs.readFileSync(vaultVtt, 'utf8')
                const chunks = parseVTT(text)
                if (chunks.length) {
                    try { fs.writeFileSync(cachePath, JSON.stringify(chunks, null, 2)) } catch { }
                    return chunks
                }
            } catch { /* fall through */ }
        }

        // Check legacy /Captions/ folder
        const legacyVtt = path.join(courseFolder, 'Captions', relModulePath, `${videoBaseName}.${lang}.vtt`)
        if (fs.existsSync(legacyVtt)) {
            try {
                const text = fs.readFileSync(legacyVtt, 'utf8')
                const chunks = parseVTT(text)
                if (chunks.length) return chunks
            } catch { /* fall through */ }
        }
    }

    // 3. Try subtitle_sources — find matching lang entry
    let sourceEntry = subtitleSources.find(s =>
        (lang === 'source' && (!s.lang || s.lang === 'source')) ||
        s.lang === lang
    )

    if (!sourceEntry && subtitleSources.length > 0) {
        sourceEntry = subtitleSources[0]
    }

    if (sourceEntry?.filePath && fs.existsSync(sourceEntry.filePath)) {
        try {
            const text = fs.readFileSync(sourceEntry.filePath, 'utf8')
            const chunks = readCaptionFile(text, sourceEntry.filePath)
            if (chunks.length) {
                try { fs.writeFileSync(cachePath, JSON.stringify(chunks, null, 2)) } catch { }
                return chunks
            }
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
 */
export function listVideoLanguages(videoId, subtitleSources = [], courseFolder = null, relModulePath = '', videoBaseName = '') {
    const transcriptsDir = getTranscriptsDir()
    const translatedLangs = new Set()

    // 1. Check AppData cache
    try {
        const files = fs.readdirSync(transcriptsDir)
        for (const f of files) {
            if (!f.startsWith(videoId)) continue
            const withoutId = f.slice(videoId.length)
            const match = withoutId.match(/^\.([a-z]{2,3})\.json$/)
            if (match) translatedLangs.add(match[1])
        }
    } catch { }

    // 2. Check vault .tutin/captions/
    if (courseFolder && videoBaseName) {
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
    }

    const sourceExists = fs.existsSync(path.join(transcriptsDir, `${videoId}.json`)) ||
        (courseFolder && videoBaseName && (
            fs.existsSync(path.join(courseFolder, '.tutin', 'captions', relModulePath, `${videoBaseName}.source.vtt`)) ||
            fs.existsSync(path.join(courseFolder, '.tutin', 'captions', relModulePath, `${videoBaseName}.vtt`)) ||
            fs.existsSync(path.join(courseFolder, 'Captions', relModulePath, `${videoBaseName}.vtt`))
        ))

    const existingLangs = Array.from(new Set(subtitleSources
        .filter(s => s.origin === 'existing' || s.origin === 'uploaded')
        .map(s => s.lang || 'source')))

    return { sourceExists: Boolean(sourceExists), translatedLangs: [...translatedLangs], existingLangs }
}

// ── Dubbing Helpers ─────────────────────────────────────────────

/**
 * List all dubbed languages available for a video.
 */
export function listDubLanguages(videoId, courseFolder = null, relModulePath = '', videoBaseName = '') {
    const langs = new Set()

    // 1. AppData cache
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

    // 2. Vault .tutin/dubs/
    if (courseFolder && videoBaseName) {
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
    }

    return [...langs]
}

/**
 * Get path to dubbed audio file (checking vault first, then AppData cache).
 */
export function getDubFilePathForPlayback(videoId, lang, courseFolder = null, relModulePath = '', videoBaseName = '') {
    // 1. Check vault .tutin/dubs/
    if (courseFolder && videoBaseName) {
        const vaultDub = path.join(courseFolder, '.tutin', 'dubs', relModulePath, `${videoBaseName}.${lang}.mp3`)
        if (fs.existsSync(vaultDub)) return vaultDub

        const legacyDub = path.join(courseFolder, 'Dubs', relModulePath, `${videoBaseName}.${lang}.mp3`)
        if (fs.existsSync(legacyDub)) return legacyDub
    }

    // 2. Check AppData cache
    const cachePath = path.join(getDataDir(), 'dubs', `${videoId}.${lang}.mp3`)
    return fs.existsSync(cachePath) ? cachePath : null
}

export function getDubCachePath(videoId, lang) {
    const p = path.join(getDataDir(), 'dubs', `${videoId}.${lang}.mp3`)
    return fs.existsSync(p) ? p : null
}

// ── Vault Notes, Screenshots & Canvas Persistence ──────────────

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
 * Full Vault Loader: reads all existing vault data when a course folder is scanned / imported.
 */
export function loadFullVaultData(courseFolder) {
    if (!courseFolder || !fs.existsSync(path.join(courseFolder, '.tutin'))) {
        return null
    }

    return {
        hasVault: true,
        metadata: loadVaultMetadata(courseFolder),
        notes: loadVaultNotes(courseFolder),
        canvas: loadVaultCanvas(courseFolder),
        languages: listCourseLanguages(courseFolder)
    }
}
