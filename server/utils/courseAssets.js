/**
 * TutIn — Course Assets Utility
 *
 * Manages reading and writing of course-local caption and dub files.
 * All app-generated captions go to:   <courseFolder>/Captions/<relModPath>/<base>.<lang>.vtt
 * All app-generated dubs go to:       <courseFolder>/Dubs/<relModPath>/<base>.<lang>.mp3
 *
 * Pre-existing subtitle files (next to videos) are NEVER touched by this module.
 */

import fs from 'fs'
import path from 'path'
import { getDataDir } from '../database.js'
import { chunksToVTT, parseVTT, parseSRT, parseASS } from './captionParser.js'

// ── Directory helpers ─────────────────────────────────────────

/**
 * Returns (and creates) the Captions dir inside a course folder.
 * @param {string} courseFolder    - Absolute path to the course root
 * @param {string} relModulePath   - Relative path of the module folder ('' for root)
 */
export function getCaptionsDir(courseFolder, relModulePath = '') {
    const dir = path.join(courseFolder, 'Captions', relModulePath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    return dir
}

/**
 * Returns (and creates) the Dubs dir inside a course folder.
 */
export function getDubsDir(courseFolder, relModulePath = '') {
    const dir = path.join(courseFolder, 'Dubs', relModulePath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    return dir
}

/**
 * Full path for a managed caption file.
 * e.g. /Course/Captions/Module 1/01 - Intro.ar.vtt
 */
export function getCaptionFilePath(courseFolder, relModulePath, videoBaseName, lang) {
    return path.join(getCaptionsDir(courseFolder, relModulePath), `${videoBaseName}.${lang}.vtt`)
}

/**
 * Full path for a dubbed audio file.
 * e.g. /Course/Dubs/Module 1/01 - Intro.ar.mp3
 */
export function getDubFilePath(courseFolder, relModulePath, videoBaseName, lang) {
    return path.join(getDubsDir(courseFolder, relModulePath), `${videoBaseName}.${lang}.mp3`)
}

// ── AppData cache helpers ─────────────────────────────────────

function getTranscriptsDir() {
    const dir = path.join(getDataDir(), 'transcripts')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    return dir
}

function getCacheFilePath(videoId, lang) {
    const suffix = lang && lang !== 'source' ? `.${lang}` : ''
    return path.join(getTranscriptsDir(), `${videoId}${suffix}.json`)
}

// ── Caption save / load ───────────────────────────────────────

/**
 * Save caption chunks to both:
 *   1. Course folder: Captions/<relModPath>/<base>.<lang>.vtt
 *   2. AppData cache:  transcripts/<videoId>.<lang>.json
 *
 * @param {object} videoMeta  - { id, courseFolder, relModulePath, videoBaseName }
 * @param {string} lang       - ISO 639-1 code or 'source'
 * @param {Array}  chunks     - Internal chunk array
 * @returns {string} filePath of the written VTT file
 */
export function saveCaptionFile(videoMeta, lang, chunks) {
    const { id, courseFolder, relModulePath = '', videoBaseName } = videoMeta

    // 1. Write to course folder (if courseFolder known — not for external links)
    let vttPath = null
    if (courseFolder && fs.existsSync(courseFolder)) {
        vttPath = getCaptionFilePath(courseFolder, relModulePath, videoBaseName, lang)
        fs.writeFileSync(vttPath, chunksToVTT(chunks), 'utf8')
    }

    // 2. Write to AppData cache
    const cachePath = getCacheFilePath(id, lang)
    fs.writeFileSync(cachePath, JSON.stringify(chunks, null, 2), 'utf8')

    return vttPath || cachePath
}

/**
 * Load caption chunks for a video + language.
 * Fallback order: AppData cache → Captions\ VTT file → sibling subtitle paths
 *
 * @param {string} videoId
 * @param {string} lang
 * @param {Array}  subtitleSources  - From DB subtitle_sources column (parsed JSON)
 * @returns {Array} chunks or []
 */
export function loadCaptionChunks(videoId, lang, subtitleSources = []) {
    // 1. Try AppData cache
    const cachePath = getCacheFilePath(videoId, lang)
    if (fs.existsSync(cachePath)) {
        try { return JSON.parse(fs.readFileSync(cachePath, 'utf8')) } catch { /* fall through */ }
    }

    // 2. Try subtitle_sources — find a matching lang entry
    const sourceEntry = subtitleSources.find(s =>
        (lang === 'source' && (!s.lang || s.lang === 'source')) ||
        s.lang === lang
    )
    if (sourceEntry?.filePath && fs.existsSync(sourceEntry.filePath)) {
        const text = fs.readFileSync(sourceEntry.filePath, 'utf8')
        const chunks = readCaptionFile(text, sourceEntry.filePath)
        // Warm the cache
        if (chunks.length) {
            try { fs.writeFileSync(cachePath, JSON.stringify(chunks, null, 2)) } catch { }
        }
        return chunks
    }

    return []
}

/**
 * Parse caption text using the appropriate parser based on file extension.
 */
export function readCaptionFile(text, filePath) {
    const ext = path.extname(filePath).toLowerCase()
    if (ext === '.vtt') return parseVTT(text)
    if (ext === '.ass' || ext === '.ssa') return parseASS(text)
    return parseSRT(text) // default: SRT
}

// ── Language discovery ────────────────────────────────────────

/**
 * List all caption languages available for a course folder.
 * Scans the Captions\ subfolder for *.*.vtt files.
 *
 * @param {string} courseFolder
 * @returns {{ langs: string[] }}
 */
export function listCourseLanguages(courseFolder) {
    const captionsRoot = path.join(courseFolder, 'Captions')
    if (!fs.existsSync(captionsRoot)) return { langs: [] }

    const langs = new Set()

    function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                walk(path.join(dir, entry.name))
            } else if (entry.name.endsWith('.vtt')) {
                // Expect: <videoBase>.<lang>.vtt
                const parts = entry.name.split('.')
                if (parts.length >= 3) {
                    langs.add(parts[parts.length - 2]) // second-to-last part
                }
            }
        }
    }

    walk(captionsRoot)
    return { langs: [...langs] }
}

/**
 * List all languages available for a specific video from the AppData cache.
 * @param {string} videoId
 * @param {Array}  subtitleSources - Parsed from DB
 * @returns {{ sourceExists: bool, translatedLangs: string[], existingLangs: string[] }}
 */
export function listVideoLanguages(videoId, subtitleSources = []) {
    const transcriptsDir = getTranscriptsDir()
    const translatedLangs = []

    // Scan AppData cache for <videoId>.<lang>.json
    try {
        const files = fs.readdirSync(transcriptsDir)
        for (const f of files) {
            if (!f.startsWith(videoId)) continue
            const withoutId = f.slice(videoId.length)
            const match = withoutId.match(/^\.([a-z]{2,3})\.json$/)
            if (match) translatedLangs.push(match[1])
        }
    } catch { /* AppData not ready */ }

    const sourceExists = fs.existsSync(path.join(transcriptsDir, `${videoId}.json`))
    const existingLangs = Array.from(new Set(subtitleSources
        .filter(s => s.origin === 'existing' || s.origin === 'uploaded')
        .map(s => s.lang || 'source')))

    return { sourceExists, translatedLangs, existingLangs }
}

// ── Dub file helpers ──────────────────────────────────────────

/**
 * List all dubbed languages available for a video.
 * Checks AppData/dubs/<videoId>.*.mp3
 * @param {string} videoId
 * @returns {string[]} language codes
 */
export function listDubLanguages(videoId) {
    const dubsDir = path.join(getDataDir(), 'dubs')
    if (!fs.existsSync(dubsDir)) return []
    return fs.readdirSync(dubsDir)
        .filter(f => f.startsWith(videoId) && f.endsWith('.mp3'))
        .map(f => {
            const match = f.match(new RegExp(`^${videoId}\\.([a-z]{2,3})\\.mp3$`))
            return match ? match[1] : null
        })
        .filter(Boolean)
}

/**
 * Get the path to a dubbed audio file.
 * @param {string} videoId
 * @param {string} lang
 * @returns {string|null}
 */
export function getDubCachePath(videoId, lang) {
    const p = path.join(getDataDir(), 'dubs', `${videoId}.${lang}.mp3`)
    return fs.existsSync(p) ? p : null
}
