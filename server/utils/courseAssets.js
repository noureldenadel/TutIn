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
 *     ├── subtitles/<relModPath>/<base>.<lang>.vtt
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

function ensureDir(dir, label) {
    if (!dir) return null
    if (!fs.existsSync(dir)) {
        try {
            fs.mkdirSync(dir, { recursive: true })
        } catch (err) {
            console.warn(`[CourseAssets] Failed to create ${label} directory (${dir}):`, err.message)
            return null
        }
    }
    return dir
}

/**
 * Returns (and creates) the root .tutin vault directory for a course.
 */
export function getVaultDir(courseFolder) {
    if (!courseFolder) return null
    return ensureDir(path.join(courseFolder, '.tutin'), 'vault')
}

/**
 * Returns (and creates) the subtitles directory inside .tutin/subtitles.
 */
export function getSubtitlesDir(courseFolder, relModulePath = '') {
    if (!courseFolder) return null
    const vaultDir = getVaultDir(courseFolder)
    return ensureDir(path.join(vaultDir || courseFolder, 'subtitles', relModulePath), 'subtitles')
}

/**
 * Rewrites legacy `.tutin/captions/` file paths to `.tutin/subtitles/` while keeping separator style.
 */
export function remapVaultSubtitlePath(filePath) {
    if (typeof filePath !== 'string' || !filePath) return filePath
    return filePath.replace(/([/\\])\.tutin([/\\])captions([/\\]|$)/i, '$1.tutin$2subtitles$3')
}

/**
 * Returns (and creates) the dubs directory inside .tutin/dubs.
 */
export function getDubsDir(courseFolder, relModulePath = '') {
    if (!courseFolder) return null
    const vaultDir = getVaultDir(courseFolder)
    return ensureDir(path.join(vaultDir || courseFolder, 'dubs', relModulePath), 'dubs')
}

/**
 * Returns (and creates) the course-level cached speaker voice profile directory:
 * - Local courses: <courseFolder>/.tutin/dubs/_voice_profile
 * - Cloud courses: %APPDATA%/TutIn/dubs/_voice_profiles/<courseId>
 */
export function getCourseVoiceProfileDir(courseFolder = null, courseId = 'default') {
    if (courseFolder && fs.existsSync(courseFolder)) {
        const vaultDir = getVaultDir(courseFolder)
        if (vaultDir) {
            return ensureDir(path.join(vaultDir, 'dubs', '_voice_profile'), 'voice_profile')
        }
    }
    const safeCourseId = String(courseId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_')
    return ensureDir(path.join(getDataDir(), 'dubs', '_voice_profiles', safeCourseId), 'voice_profile')
}

function moveDirectoryTree(srcRoot, destRoot, fileFilter = null) {
    if (!srcRoot || !fs.existsSync(srcRoot)) return
    const moveRecursive = (srcDir, rel = '') => {
        try {
            for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
                const srcPath = path.join(srcDir, entry.name)
                const nextRel = rel ? path.join(rel, entry.name) : entry.name
                if (entry.isDirectory()) {
                    moveRecursive(srcPath, nextRel)
                    try { fs.rmdirSync(srcPath) } catch { }
                } else if (entry.isFile() && (!fileFilter || fileFilter(entry.name))) {
                    const targetDir = ensureDir(path.join(destRoot, rel), 'vault_migration')
                    if (targetDir) {
                        const destPath = path.join(targetDir, entry.name)
                        if (!fs.existsSync(destPath)) {
                            try {
                                fs.renameSync(srcPath, destPath)
                            } catch {
                                try {
                                    fs.copyFileSync(srcPath, destPath)
                                    fs.unlinkSync(srcPath)
                                } catch { }
                            }
                        } else {
                            try { fs.unlinkSync(srcPath) } catch { }
                        }
                    }
                }
            }
        } catch { }
    }
    moveRecursive(srcRoot)
    try { fs.rmdirSync(srcRoot) } catch { }
}

/**
 * One-time migration helper:
 * - Relocates legacy `<courseFolder>/Dubs/` MP3s into `<courseFolder>/.tutin/dubs/`
 * - Renames/merges legacy `<courseFolder>/.tutin/captions/` into `<courseFolder>/.tutin/subtitles/`
 */
export function migrateLegacyCourseAssets(courseFolder) {
    if (!courseFolder || !fs.existsSync(courseFolder)) return

    const legacyDubsRoot = path.join(courseFolder, 'Dubs')
    if (fs.existsSync(legacyDubsRoot)) {
        moveDirectoryTree(legacyDubsRoot, path.join(courseFolder, '.tutin', 'dubs'), name => name.endsWith('.mp3'))
    }

    const legacyCaptionsDir = path.join(courseFolder, '.tutin', 'captions')
    const vaultSubtitlesDir = path.join(courseFolder, '.tutin', 'subtitles')
    if (fs.existsSync(legacyCaptionsDir)) {
        if (!fs.existsSync(vaultSubtitlesDir)) {
            try {
                fs.renameSync(legacyCaptionsDir, vaultSubtitlesDir)
                return
            } catch {
                // Fall back to recursive merge below if cross-device or directory lock occurs
            }
        }
        moveDirectoryTree(legacyCaptionsDir, vaultSubtitlesDir)
    }
}

/**
 * Returns (and creates) the notes directory inside .tutin.
 */
export function getNotesDir(courseFolder) {
    const vaultDir = getVaultDir(courseFolder)
    if (!vaultDir) return null
    return ensureDir(path.join(vaultDir, 'notes'), 'notes')
}

/**
 * Returns (and creates) the screenshots directory inside .tutin/notes/screenshots.
 */
export function getScreenshotsDir(courseFolder) {
    const notesDir = getNotesDir(courseFolder)
    if (!notesDir) return null
    return ensureDir(path.join(notesDir, 'screenshots'), 'screenshots')
}

/**
 * Returns (and creates) the summaries directory inside .tutin/summaries.
 */
export function getSummariesVaultDir(courseFolder, relModulePath = '') {
    const vaultDir = getVaultDir(courseFolder)
    if (!vaultDir) return null
    return ensureDir(path.join(vaultDir, 'summaries', relModulePath), 'summaries')
}

/**
 * Full path for a managed subtitle file.
 * e.g.
 *   uploaded v1: /Course/.tutin/subtitles/Module 1/01 - Intro.ar.vtt
 *   uploaded v2: /Course/.tutin/subtitles/Module 1/01 - Intro-u2.ar.vtt
 *   generated:   /Course/.tutin/subtitles/Module 1/01 - Intro-generated.ar.vtt
 */
export function getCaptionFilePath(courseFolder, relModulePath, videoBaseName, lang, origin = 'uploaded', version = 1) {
    migrateLegacyCourseAssets(courseFolder)
    const dir = getSubtitlesDir(courseFolder, relModulePath)
    if (!dir) return null

    const isGenerated = origin === 'generated'
    const ver = Number(version) > 1 ? Number(version) : 1
    const originSuffix = isGenerated ? '-generated' : (ver > 1 ? `-u${ver}` : '')
    const safeLang = (lang && lang !== 'source') ? lang : 'en'

    return path.join(dir, `${videoBaseName}${originSuffix}.${safeLang}.vtt`)
}

/**
 * Build a deterministic track ID from (lang, origin, version).
 * e.g. 'en:uploaded', 'en:uploaded:2', 'en:generated'
 */
export function buildTrackId(lang, origin = 'uploaded', version = 1) {
    const safeLang = (lang && lang !== 'source') ? lang.toLowerCase().trim() : 'en'
    const safeOrigin = origin === 'generated' ? 'generated' : 'uploaded'
    const ver = safeOrigin === 'uploaded' && Number(version) > 1 ? Number(version) : 1
    return ver > 1 ? `${safeLang}:${safeOrigin}:${ver}` : `${safeLang}:${safeOrigin}`
}

/**
 * Build display label for origin + version.
 * e.g. 'AI', 'Uploaded', 'Uploaded #2'
 */
export function buildTrackOriginLabel(origin = 'uploaded', version = 1) {
    if (origin === 'generated') return 'AI'
    const ver = Number(version) > 1 ? Number(version) : 1
    return ver > 1 ? `Uploaded #${ver}` : 'Uploaded'
}

/**
 * Normalize an array of subtitle_sources so that:
 * 1. Every entry has `id`, `lang`, `origin` ('uploaded' | 'generated'), `version`, `label`.
 * 2. Every language present has at least one `is_master: true` and at most one `is_master: true`.
 */
export function normalizeSubtitleSources(rawSources = [], courseLanguage = 'en') {
    if (!Array.isArray(rawSources)) return []
    const fallbackLang = (courseLanguage || 'en').toLowerCase().trim()

    // Track assigned versions per lang for uploaded tracks
    const usedUploadedVersions = new Map()
    const normalized = []

    for (const raw of rawSources) {
        if (!raw || typeof raw !== 'object') continue
        const rawLang = (raw.lang || raw.language || fallbackLang).toLowerCase().trim()
        const lang = rawLang === 'source' ? fallbackLang : rawLang
        const origin = raw.origin === 'generated' ? 'generated' : 'uploaded'

        let version = 1
        if (origin === 'uploaded') {
            // Check if filename or raw.id or raw.version specifies a version > 1
            let explicitVer = Number(raw.version) || 0
            if (!explicitVer && typeof raw.id === 'string') {
                const m = raw.id.match(/:uploaded:(\d+)$/)
                if (m) explicitVer = Number(m[1])
            }
            if (!explicitVer && typeof raw.filePath === 'string') {
                const base = path.basename(raw.filePath)
                const m = base.match(/-u(\d+)\.[a-z0-9\-]+\.vtt$/i)
                if (m) explicitVer = Number(m[1])
            }

            const usedSet = usedUploadedVersions.get(lang) || new Set()
            if (explicitVer >= 1 && !usedSet.has(explicitVer)) {
                version = explicitVer
            } else {
                let candidate = 1
                while (usedSet.has(candidate)) candidate++
                version = candidate
            }
            usedSet.add(version)
            usedUploadedVersions.set(lang, usedSet)
        }

        const id = buildTrackId(lang, origin, version)
        // Skip exact duplicate IDs (keep latest if AI generated)
        const existingIdx = normalized.findIndex(item => item.id === id)
        const entry = {
            id,
            lang,
            origin,
            version,
            label: buildTrackOriginLabel(origin, version),
            fileName: raw.fileName || (raw.filePath ? path.basename(raw.filePath) : undefined),
            filePath: raw.filePath,
            format: raw.format || 'vtt',
            is_master: Boolean(raw.is_master),
            is_ai_source: Boolean(raw.is_ai_source)
        }

        if (existingIdx >= 0) {
            normalized[existingIdx] = {
                ...normalized[existingIdx],
                ...entry,
                is_master: normalized[existingIdx].is_master || entry.is_master,
                is_ai_source: normalized[existingIdx].is_ai_source || entry.is_ai_source
            }
        } else {
            normalized.push(entry)
        }
    }

    // Ensure each language has exactly one master track
    const byLang = new Map()
    for (const item of normalized) {
        const list = byLang.get(item.lang) || []
        list.push(item)
        byLang.set(item.lang, list)
    }

    for (const [, list] of byLang.entries()) {
        const masters = list.filter(x => x.is_master)
        if (masters.length === 0) {
            // Prefer latest uploaded track, otherwise AI generated
            const uploadedTracks = list.filter(x => x.origin === 'uploaded')
            const winner = uploadedTracks.length > 0
                ? uploadedTracks[uploadedTracks.length - 1]
                : list[0]
            if (winner) winner.is_master = true
        } else if (masters.length > 1) {
            // Keep only the last marked master
            masters.slice(0, -1).forEach(m => { m.is_master = false })
        }
    }

    // Ensure exactly one is_ai_source across the video when tracks exist
    const aiSources = normalized.filter(x => x.is_ai_source)
    if (aiSources.length > 1) {
        aiSources.slice(0, -1).forEach(s => { s.is_ai_source = false })
    } else if (aiSources.length === 0 && normalized.length > 0) {
        const defaultSource =
            normalized.find(x => x.lang === fallbackLang && x.is_master) ||
            normalized.find(x => x.lang === fallbackLang) ||
            normalized.find(x => x.is_master) ||
            normalized[0]
        if (defaultSource) defaultSource.is_ai_source = true
    }

    return normalized
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

export function getCacheFilePath(videoId, lang, origin = 'uploaded', version = 1) {
    const isGenerated = origin === 'generated'
    const ver = Number(version) > 1 ? Number(version) : 1
    const originSuffix = isGenerated ? '-generated' : (ver > 1 ? `-u${ver}` : '')
    const safeLang = (lang && lang !== 'source') ? `.${lang}` : '.en'
    return path.join(getTranscriptsDir(), `${videoId}${originSuffix}${safeLang}.json`)
}

// ── Caption Save & Load ─────────────────────────────────────────

/**
 * Save subtitle chunks.
 * For local courses: writes exclusively to `<courseFolder>/.tutin/subtitles/` and removes any stale AppData cache.
 * For cloud courses: writes to AppData cache.
 */
export function saveCaptionFile(videoMeta, lang, chunks, origin = 'uploaded', version = 1) {
    const { id, courseFolder, relModulePath = '', videoBaseName } = videoMeta

    if (courseFolder && fs.existsSync(courseFolder)) {
        const vttPath = getCaptionFilePath(courseFolder, relModulePath, videoBaseName, lang, origin, version)
        if (vttPath) {
            try {
                fs.writeFileSync(vttPath, chunksToVTT(chunks), 'utf8')
            } catch (err) {
                console.warn('[CourseAssets] Failed to write caption file in vault:', err.message)
            }
        }

        // Clean up any stale AppData cache file so the local course folder is the sole source of truth
        try {
            const staleCache = getCacheFilePath(id, lang, origin, version)
            if (fs.existsSync(staleCache)) fs.unlinkSync(staleCache)
        } catch (err) {
            console.warn('[CourseAssets] Failed to remove stale caption cache:', err.message)
        }

        return vttPath
    }

    // Cloud course fallback: save to AppData
    const cachePath = getCacheFilePath(id, lang, origin, version)
    try {
        fs.writeFileSync(cachePath, JSON.stringify(chunks, null, 2), 'utf8')
    } catch (err) {
        console.warn('[CourseAssets] Failed to write caption cache file:', err.message)
    }

    return cachePath
}

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

/**
 * Resolve the matching subtitle_sources entry for a requested track identifier:
 * - Exact track id: e.g. 'en:uploaded:2', 'ar:generated', 'en:uploaded'
 * - Language + origin: e.g. 'en:uploaded'
 * - Plain language: e.g. 'ar' -> returns the `is_master: true` entry for 'ar'
 * - 'source' -> returns `is_ai_source: true`, else `is_master` of courseLanguage, else first master
 */
export function resolveSubtitleSourceEntry(langOrTrackId, subtitleSources = [], courseLanguage = 'en') {
    const normalized = normalizeSubtitleSources(subtitleSources, courseLanguage)
    if (normalized.length === 0) return null

    const reqStr = (langOrTrackId || 'source').toLowerCase().trim()

    if (reqStr === 'source') {
        const aiSrc = normalized.find(s => s.is_ai_source)
        if (aiSrc) return aiSrc
        const cLang = (courseLanguage || 'en').toLowerCase().trim()
        const courseMaster = normalized.find(s => s.lang === cLang && s.is_master) || normalized.find(s => s.lang === cLang)
        if (courseMaster) return courseMaster
        return normalized.find(s => s.is_master) || normalized[0]
    }

    // 1. Exact ID match ('en:uploaded:2', 'en:generated', 'en:uploaded')
    const exactId = normalized.find(s => s.id === reqStr)
    if (exactId) return exactId

    // 2. lang:origin[:version] match
    if (reqStr.includes(':')) {
        const parts = reqStr.split(':')
        const tLang = parts[0]
        const tOrigin = parts[1] === 'generated' ? 'generated' : 'uploaded'
        const tVer = parts[2] ? Number(parts[2]) : null

        if (tVer) {
            const byVer = normalized.find(s => s.lang === tLang && s.origin === tOrigin && s.version === tVer)
            if (byVer) return byVer
        }
        const byOriginMaster = normalized.find(s => s.lang === tLang && s.origin === tOrigin && s.is_master)
        if (byOriginMaster) return byOriginMaster
        const byOriginAny = normalized.find(s => s.lang === tLang && s.origin === tOrigin)
        if (byOriginAny) return byOriginAny
    }

    // 3. Plain language match -> prefer `is_master: true`
    const langMaster = normalized.find(s => s.lang === reqStr && s.is_master)
    if (langMaster) return langMaster
    return normalized.find(s => s.lang === reqStr) || null
}

export function loadCaptionChunks(videoId, lang, subtitleSources = [], courseFolder = null, relModulePath = '', videoBaseName = '', courseLanguage = 'en') {
    const isLocalCourse = Boolean(courseFolder && fs.existsSync(courseFolder))
    const resolvedEntry = resolveSubtitleSourceEntry(lang, subtitleSources, courseLanguage)

    if (resolvedEntry?.filePath && fs.existsSync(resolvedEntry.filePath)) {
        try {
            const text = fs.readFileSync(resolvedEntry.filePath, 'utf8')
            if (resolvedEntry.filePath.endsWith('.json')) {
                const parsed = JSON.parse(text)
                if (Array.isArray(parsed) && parsed.length > 0) return normalizeChunks(parsed)
            } else {
                const chunks = readCaptionFile(text, resolvedEntry.filePath)
                if (chunks.length) return normalizeChunks(chunks)
            }
        } catch (err) {
            console.warn('[CourseAssets] Failed to read caption source file:', err.message)
        }
    }

    let targetLang = (lang || 'en').toLowerCase().trim()
    let targetOrigin = null
    let targetVersion = 1
    if (targetLang.includes(':')) {
        const parts = targetLang.split(':')
        targetLang = parts[0]
        targetOrigin = parts[1]
        if (parts[2]) targetVersion = Number(parts[2]) || 1
    }
    if (targetLang === 'source') {
        targetLang = (courseLanguage || 'en').toLowerCase().trim()
    }

    if (isLocalCourse && videoBaseName) {
        migrateLegacyCourseAssets(courseFolder)
        const subtitlesDir = path.join(courseFolder, '.tutin', 'subtitles', relModulePath)
        if (fs.existsSync(subtitlesDir) && targetLang) {
            const candidates = []
            if (targetOrigin === 'generated') {
                candidates.push(path.join(subtitlesDir, `${videoBaseName}-generated.${targetLang}.vtt`))
            } else if (targetOrigin === 'uploaded' && targetVersion > 1) {
                candidates.push(path.join(subtitlesDir, `${videoBaseName}-u${targetVersion}.${targetLang}.vtt`))
            } else {
                candidates.push(
                    path.join(subtitlesDir, `${videoBaseName}.${targetLang}.vtt`),
                    path.join(subtitlesDir, `${videoBaseName}-generated.${targetLang}.vtt`)
                )
            }

            for (const candidate of candidates) {
                if (fs.existsSync(candidate)) {
                    try {
                        const text = fs.readFileSync(candidate, 'utf8')
                        const chunks = parseVTT(text)
                        if (chunks.length) return normalizeChunks(chunks)
                    } catch (err) {
                        console.warn('[CourseAssets] Failed to read vault VTT file:', err.message)
                    }
                }
            }
        }
    } else if (!isLocalCourse) {
        const cacheCandidates = [
            getCacheFilePath(videoId, targetLang, targetOrigin || 'uploaded', targetVersion),
            getCacheFilePath(videoId, targetLang, 'generated', 1),
            path.join(getTranscriptsDir(), `${videoId}.${targetLang}.json`),
            path.join(getTranscriptsDir(), `${videoId}.json`)
        ]
        for (const cPath of cacheCandidates) {
            if (fs.existsSync(cPath)) {
                try {
                    const parsed = JSON.parse(fs.readFileSync(cPath, 'utf8'))
                    if (Array.isArray(parsed) && parsed.length > 0) return normalizeChunks(parsed)
                } catch (err) {
                    console.warn('[CourseAssets] Failed to read cached caption JSON:', err.message)
                }
            }
        }
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
                            const l = parts[parts.length - 2]
                            if (l && l !== 'source') langs.add(l)
                        }
                    }
                }
            } catch (err) {
                console.warn(`[CourseAssets] Failed to scan captions directory (${current}):`, err.message)
            }
        }
        walk(dir)
    }

    migrateLegacyCourseAssets(courseFolder)
    checkDir(path.join(courseFolder, '.tutin', 'subtitles'))

    return { langs: [...langs] }
}

/**
 * List all languages and normalized track sources available for a specific video.
 */
export function listVideoLanguages(videoId, subtitleSources = [], courseFolder = null, relModulePath = '', videoBaseName = '', courseLanguage = 'en') {
    const normalized = normalizeSubtitleSources(subtitleSources, courseLanguage).filter(s => {
        if (s.filePath && !fs.existsSync(s.filePath)) return false
        return true
    })

    const existingLangs = Array.from(new Set(
        normalized.filter(s => s.origin === 'uploaded').map(s => s.lang)
    ))

    const translatedLangs = Array.from(new Set(
        normalized.filter(s => s.origin === 'generated').map(s => s.lang)
    ))

    const cLang = (courseLanguage || 'en').toLowerCase().trim()
    const sourceExists = normalized.some(s => s.is_ai_source || s.lang === cLang) || normalized.length > 0

    return {
        sourceExists: Boolean(sourceExists),
        translatedLangs,
        existingLangs,
        allSources: normalized
    }
}

// ── Dubbing Helpers ─────────────────────────────────────────────

/**
 * Strict filename boundary parser for dubbed MP3 files: `<videoBaseName>.<lang>.mp3`
 * Prevents prefix collisions between e.g. "01 - Intro.mp4" and "01 - Intro to Arnold.mp4".
 */
export function extractDubLangFromFileName(fileName, videoBaseName) {
    if (!fileName || !videoBaseName || !fileName.endsWith('.mp3')) return null
    if (!fileName.startsWith(videoBaseName)) return null
    const suffix = fileName.slice(videoBaseName.length)
    const match = suffix.match(/^\.([a-z]{2,3}(?:-[a-z]{2,4})?)\.mp3$/i)
    return match ? match[1].toLowerCase() : null
}

/**
 * Full path where a dubbed MP3 should be stored for a local course video.
 */
export function getDubFilePath(courseFolder, relModulePath = '', videoBaseName = '', lang = 'en') {
    const dir = getDubsDir(courseFolder, relModulePath)
    if (!dir || !videoBaseName) return null
    const safeLang = String(lang || 'en').trim().toLowerCase()
    return path.join(dir, `${videoBaseName}.${safeLang}.mp3`)
}

/**
 * Full path where dub track metadata sidecar JSON is stored for a local course video.
 */
export function getDubMetaFilePath(courseFolder, relModulePath = '', videoBaseName = '', lang = 'en') {
    const dir = getDubsDir(courseFolder, relModulePath)
    if (!dir || !videoBaseName) return null
    const safeLang = String(lang || 'en').trim().toLowerCase()
    return path.join(dir, `${videoBaseName}.${safeLang}.meta.json`)
}

export function getDubCacheDir() {
    return ensureDir(path.join(getDataDir(), 'dubs'), 'dubs_cache')
}

export function getDubCacheWritePath(videoId, lang) {
    const safeLang = String(lang || 'en').trim().toLowerCase()
    return path.join(getDubCacheDir(), `${videoId}.${safeLang}.mp3`)
}

export function getDubCacheMetaPath(videoId, lang) {
    const safeLang = String(lang || 'en').trim().toLowerCase()
    return path.join(getDubCacheDir(), `${videoId}.${safeLang}.meta.json`)
}

export function getDubCachePath(videoId, lang) {
    const p = getDubCacheWritePath(videoId, lang)
    return fs.existsSync(p) ? p : null
}

/**
 * Save dub track metadata sidecar (engine, bgMode, voiceGender, generatedAt)
 * in `.tutin/dubs/` for local courses or `%APPDATA%/TutIn/dubs/` for cloud courses.
 */
export function saveDubTrackMeta(videoMeta, lang, metaPayload) {
    const { id, courseFolder, relModulePath = '', videoBaseName } = videoMeta
    const safeLang = String(lang || 'en').trim().toLowerCase()
    const isLocalCourse = Boolean(courseFolder && fs.existsSync(courseFolder))
    const targetPath = (isLocalCourse && videoBaseName)
        ? getDubMetaFilePath(courseFolder, relModulePath, videoBaseName, safeLang)
        : getDubCacheMetaPath(id, safeLang)

    if (!targetPath) return null
    try {
        fs.writeFileSync(targetPath, JSON.stringify(metaPayload, null, 2), 'utf8')
        return targetPath
    } catch (err) {
        console.warn('[CourseAssets] Failed to write dub track metadata:', err.message)
        return null
    }
}

/**
 * Load dub track metadata sidecar if available.
 */
export function loadDubTrackMeta(videoMeta, lang) {
    const { id, courseFolder, relModulePath = '', videoBaseName } = videoMeta
    const safeLang = String(lang || 'en').trim().toLowerCase()
    const isLocalCourse = Boolean(courseFolder && fs.existsSync(courseFolder))
    const targetPath = (isLocalCourse && videoBaseName)
        ? getDubMetaFilePath(courseFolder, relModulePath, videoBaseName, safeLang)
        : getDubCacheMetaPath(id, safeLang)

    if (!targetPath || !fs.existsSync(targetPath)) return null
    try {
        return JSON.parse(fs.readFileSync(targetPath, 'utf8'))
    } catch {
        return null
    }
}

/**
 * Delete dub track metadata sidecar if present.
 */
export function deleteDubTrackMeta(videoMeta, lang) {
    const { id, courseFolder, relModulePath = '', videoBaseName } = videoMeta
    const safeLang = String(lang || 'en').trim().toLowerCase()
    const candidates = []
    if (courseFolder && videoBaseName) {
        const vaultMeta = getDubMetaFilePath(courseFolder, relModulePath, videoBaseName, safeLang)
        if (vaultMeta) candidates.push(vaultMeta)
    }
    if (id) {
        candidates.push(getDubCacheMetaPath(id, safeLang))
    }
    for (const p of candidates) {
        try {
            if (p && fs.existsSync(p)) fs.unlinkSync(p)
        } catch { }
    }
}

/**
 * List all dubbed languages available for a video (strictly inside .tutin/dubs/ for local courses).
 */
export function listDubLanguages(videoId, courseFolder = null, relModulePath = '', videoBaseName = '') {
    const langs = new Set()
    const isLocalCourse = Boolean(courseFolder && fs.existsSync(courseFolder))

    if (isLocalCourse && videoBaseName) {
        migrateLegacyCourseAssets(courseFolder)
        const modDir = path.join(courseFolder, '.tutin', 'dubs', relModulePath)
        if (fs.existsSync(modDir)) {
            try {
                for (const f of fs.readdirSync(modDir)) {
                    const lang = extractDubLangFromFileName(f, videoBaseName)
                    if (lang) langs.add(lang)
                }
            } catch (err) {
                console.warn(`[CourseAssets] Failed to list vault dubs (${modDir}):`, err.message)
            }
        }
    } else if (!isLocalCourse) {
        const dubsDir = path.join(getDataDir(), 'dubs')
        if (fs.existsSync(dubsDir)) {
            try {
                for (const f of fs.readdirSync(dubsDir)) {
                    const lang = extractDubLangFromFileName(f, videoId)
                    if (lang) langs.add(lang)
                }
            } catch (err) {
                console.warn(`[CourseAssets] Failed to list cached dubs (${dubsDir}):`, err.message)
            }
        }
    }

    return [...langs]
}

/**
 * Get path to dubbed audio file for playback.
 * For local courses: checks exclusively `<courseFolder>/.tutin/dubs/`.
 * For cloud courses: checks `%APPDATA%/TutIn/dubs/`.
 */
export function getDubFilePathForPlayback(videoId, lang, courseFolder = null, relModulePath = '', videoBaseName = '') {
    const isLocalCourse = Boolean(courseFolder && fs.existsSync(courseFolder))
    const safeLang = String(lang || 'en').trim().toLowerCase()

    if (isLocalCourse && videoBaseName) {
        migrateLegacyCourseAssets(courseFolder)
        const vaultDub = path.join(courseFolder, '.tutin', 'dubs', relModulePath, `${videoBaseName}.${safeLang}.mp3`)
        return fs.existsSync(vaultDub) ? vaultDub : null
    }

    const cachePath = path.join(getDataDir(), 'dubs', `${videoId}.${safeLang}.mp3`)
    return fs.existsSync(cachePath) ? cachePath : null
}

// ── Vault Notes, Screenshots, Canvas & Summaries Persistence ──────────────

function writeVaultJsonFile(dir, fileName, payload, label) {
    if (!dir) return false
    const filePath = path.join(dir, fileName)
    try {
        fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8')
        return true
    } catch (err) {
        console.error(`[CourseAssets] Failed to save ${label}:`, err.message)
        return false
    }
}

function readVaultJsonFile(filePath, fallback, label) {
    if (!fs.existsSync(filePath)) return fallback
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'))
    } catch (err) {
        console.warn(`[CourseAssets] Failed to parse ${label} (${filePath}):`, err.message)
        return fallback
    }
}

/**
 * Save notes for a course to <courseFolder>/.tutin/notes/notes.json.
 */
export function saveVaultNotes(courseFolder, notes) {
    if (!courseFolder || !fs.existsSync(courseFolder)) return false
    return writeVaultJsonFile(getNotesDir(courseFolder), 'notes.json', notes, 'vault notes')
}

/**
 * Load notes from <courseFolder>/.tutin/notes/notes.json.
 */
export function loadVaultNotes(courseFolder) {
    if (!courseFolder) return []
    return readVaultJsonFile(
        path.join(courseFolder, '.tutin', 'notes', 'notes.json'),
        [],
        'vault notes'
    )
}

/**
 * Save canvas whiteboard data to <courseFolder>/.tutin/canvas.json.
 */
export function saveVaultCanvas(courseFolder, canvasData) {
    if (!courseFolder || !fs.existsSync(courseFolder)) return false
    return writeVaultJsonFile(getVaultDir(courseFolder), 'canvas.json', canvasData, 'vault canvas')
}

/**
 * Load canvas whiteboard data from <courseFolder>/.tutin/canvas.json.
 */
export function loadVaultCanvas(courseFolder) {
    if (!courseFolder) return null
    return readVaultJsonFile(
        path.join(courseFolder, '.tutin', 'canvas.json'),
        null,
        'vault canvas'
    )
}

/**
 * Save course metadata (language, instructor, tags, title) to <courseFolder>/.tutin/metadata.json.
 */
export function saveVaultMetadata(courseFolder, metadata) {
    if (!courseFolder || !fs.existsSync(courseFolder)) return false
    return writeVaultJsonFile(getVaultDir(courseFolder), 'metadata.json', metadata, 'vault metadata')
}

/**
 * Load course metadata from <courseFolder>/.tutin/metadata.json.
 */
export function loadVaultMetadata(courseFolder) {
    if (!courseFolder) return null
    return readVaultJsonFile(
        path.join(courseFolder, '.tutin', 'metadata.json'),
        null,
        'vault metadata'
    )
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
        } catch (err) {
            console.warn('[CourseAssets] Failed to load vault summary:', err.message)
        }
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
        } catch (err) {
            console.warn('[CourseAssets] Failed to delete vault summary:', err.message)
        }
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
                    } catch (err) {
                        console.warn(`[CourseAssets] Failed to stat vault file (${fullPath}):`, err.message)
                    }
                } else if (entry.isDirectory()) {
                    walkDir(fullPath)
                }
            }
        } catch (err) {
            console.warn(`[CourseAssets] Failed to read vault directory (${dir}):`, err.message)
        }
    }

    if (hasVault) {
        walkDir(vaultDir)
    }

    // 1. Dubs (.tutin/dubs)
    migrateLegacyCourseAssets(courseFolder)
    const dubFiles = []
    const dubLangs = new Set()
    let dubsSizeBytes = 0
    const scanDubsDir = (baseDir) => {
        if (!fs.existsSync(baseDir)) return
        function walk(dir) {
            try {
                for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                    if (e.name === '_voice_profile') continue
                    const p = path.join(dir, e.name)
                    if (e.isDirectory()) walk(p)
                    else if (e.isFile() && e.name.endsWith('.mp3')) {
                        let size = 0
                        try {
                            const stat = fs.statSync(p)
                            size = stat.size
                            dubsSizeBytes += size
                        } catch (err) {
                            console.warn(`[CourseAssets] Failed to stat dub file (${p}):`, err.message)
                        }
                        const parts = e.name.slice(0, -4).split('.')
                        const lang = parts.length >= 2 ? parts[parts.length - 1] : 'unknown'
                        dubLangs.add(lang)
                        dubFiles.push({ fileName: e.name, filePath: p, lang, sizeBytes: size })
                    }
                }
            } catch (err) {
                console.warn(`[CourseAssets] Failed to scan dubs directory (${dir}):`, err.message)
            }
        }
        walk(baseDir)
    }
    scanDubsDir(path.join(courseFolder, '.tutin', 'dubs'))

    // 2. Subtitles (.tutin/subtitles)
    const captionFiles = []
    const captionLangs = new Set()
    let generatedCaptionsCount = 0
    let uploadedCaptionsCount = 0
    const scanSubtitlesDir = (baseDir) => {
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
            } catch (err) {
                console.warn(`[CourseAssets] Failed to scan subtitles vault (${dir}):`, err.message)
            }
        }
        walk(baseDir)
    }
    scanSubtitlesDir(path.join(courseFolder, '.tutin', 'subtitles'))

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
            } catch (err) {
                console.warn(`[CourseAssets] Failed to scan summaries vault (${dir}):`, err.message)
            }
        }
        walk(baseDir)
    }
    scanSummariesDir(path.join(courseFolder, '.tutin', 'summaries'))

    // 4. Canvas Whiteboard (supports both v2 cards/groups and legacy v1 nodes)
    const canvasData = loadVaultCanvas(courseFolder)
    const canvasNodeCount = canvasData?.cards?.length ?? canvasData?.nodes?.length ?? 0
    const canvasGroupCount = canvasData?.groups?.length ?? 0
    const canvasEdgeCount = canvasData?.edges?.length ?? 0
    const canvasStrokeCount = canvasData?.strokes?.length ?? 0
    const hasCanvas = Boolean(
        canvasData &&
        (canvasNodeCount > 0 || canvasGroupCount > 0 || canvasEdgeCount > 0 || canvasStrokeCount > 0)
    )

    // 5. Notes & Screenshots
    const notes = loadVaultNotes(courseFolder)
    const notesCount = notes?.length || 0
    let screenshotsCount = 0
    const screenshotsDir = path.join(courseFolder, '.tutin', 'notes', 'screenshots')
    if (fs.existsSync(screenshotsDir)) {
        try {
            screenshotsCount = fs.readdirSync(screenshotsDir, { withFileTypes: true }).filter(e => !e.isDirectory()).length
        } catch (err) {
            console.warn('[CourseAssets] Failed to scan screenshots directory:', err.message)
        }
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
            groupCount: canvasGroupCount,
            edgeCount: canvasEdgeCount,
            strokeCount: canvasStrokeCount,
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

