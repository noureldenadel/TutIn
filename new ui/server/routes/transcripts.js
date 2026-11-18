import express from 'express'
import fs from 'fs'
import path from 'path'
import multer from 'multer'
import { getOne, run, getAll, getDataDir } from '../database.js'
import { parseSubtitleFile, chunksToSRT, chunksToVTT, extractLangCode, detectFormat } from '../utils/captionParser.js'
import {
    saveCaptionFile,
    loadCaptionChunks,
    listVideoLanguages,
    normalizeSubtitleSources,
    resolveSubtitleSourceEntry,
    buildTrackId,
    buildTrackOriginLabel,
    getCacheFilePath,
    readCaptionFile
} from '../utils/courseAssets.js'
import {
    translateChunks,
    normalizeCuesIntoClauses,
    LANG_DISPLAY_MAP as AI_LANG_DISPLAY_MAP,
    getSupportedTranslationLanguages
} from '../utils/aiTranslation.js'
import { transcribeWithPythonService } from '../services/dubbingService.js'

const router = express.Router()

const upload = multer({ storage: multer.memoryStorage() })

const LANG_DISPLAY_MAP = {
    ...AI_LANG_DISPLAY_MAP,
    ro: 'Romanian',
    source: 'Original'
}

// ── Helpers ───────────────────────────────────────────────────

function chunksToText(chunks) {
    if (!chunks || chunks.length === 0) return ''
    return chunks.map(c => (c.text || '').trim()).filter(Boolean).join(' ')
}

function getVideoMeta(videoId) {
    const video = getOne('SELECT * FROM videos WHERE id = ?', [videoId])
    if (!video) throw new Error('Video not found')

    const moduleRecord = video.module_id ? getOne('SELECT folder_path FROM modules WHERE id = ?', [video.module_id]) : null
    const courseRecord = video.course_id ? getOne('SELECT title, folder_path, language FROM courses WHERE id = ?', [video.course_id]) : null

    let relModulePath = ''
    if (moduleRecord?.folder_path && courseRecord?.folder_path) {
        relModulePath = path.relative(courseRecord.folder_path, moduleRecord.folder_path)
        if (relModulePath === '.' || relModulePath.startsWith('..')) relModulePath = ''
    } else if (video.file_path && courseRecord?.folder_path) {
        const relDir = path.dirname(path.relative(courseRecord.folder_path, video.file_path))
        if (relDir && relDir !== '.' && !relDir.startsWith('..')) relModulePath = relDir
    }

    const videoBaseName = video.file_name
        ? path.basename(video.file_name, path.extname(video.file_name))
        : video.id

    let videoFilePath = video.file_path
    if ((!videoFilePath || !fs.existsSync(videoFilePath)) && courseRecord?.folder_path && video.file_name) {
        const candidate = path.join(courseRecord.folder_path, relModulePath, video.file_name)
        if (fs.existsSync(candidate)) videoFilePath = candidate
    }

    return {
        id: video.id,
        courseId: video.course_id,
        courseTitle: courseRecord?.title || '',
        courseFolder: courseRecord?.folder_path || null,
        courseLanguage: (courseRecord?.language || 'en').toLowerCase().trim(),
        relModulePath,
        videoFilePath: videoFilePath || null,
        videoBaseName,
        subtitleSources: JSON.parse(video.subtitle_sources || '[]')
    }
}

/**
 * Reconciles `subtitle_sources` in SQLite with managed caption files in
 * `<courseFolder>/.tutin/captions/` (local courses) or `%APPDATA%/TutIn/transcripts/` (cloud courses).
 */
function reconcileVideoSubtitleSources(videoMeta) {
    const { id, courseFolder, courseLanguage, relModulePath, videoBaseName } = videoMeta
    let rawSources = Array.isArray(videoMeta.subtitleSources) ? [...videoMeta.subtitleSources] : []
    let changed = false

    const isLocalCourse = Boolean(courseFolder && fs.existsSync(courseFolder))
    const vaultCaptionsDir = isLocalCourse ? path.join(courseFolder, '.tutin', 'captions', relModulePath) : null

    // 1. Validate existing DB entries and remove missing files or un-migrated outside paths
    const validated = []
    for (const src of rawSources) {
        if (!src || typeof src !== 'object') {
            changed = true
            continue
        }
        if (src.filePath && !fs.existsSync(src.filePath)) {
            changed = true
            continue
        }
        if (src.lang === 'source' || !src.lang) {
            changed = true
            validated.push({ ...src, lang: courseLanguage || 'en' })
        } else {
            validated.push(src)
        }
    }

    rawSources = validated

    // 2. Auto-discover .vtt files in .tutin/captions/ for local courses
    if (isLocalCourse && vaultCaptionsDir && fs.existsSync(vaultCaptionsDir) && videoBaseName) {
        try {
            const files = fs.readdirSync(vaultCaptionsDir)
            for (const f of files) {
                if (!f.startsWith(videoBaseName) || !f.endsWith('.vtt')) continue
                const suffix = f.slice(videoBaseName.length)
                if (!/^(?:\.|-(?:generated|u\d+)\.)/i.test(suffix)) continue
                const fullPath = path.join(vaultCaptionsDir, f)
                if (rawSources.some(s => s.filePath && path.resolve(s.filePath) === path.resolve(fullPath))) {
                    continue
                }
                const isGenerated = f.includes('-generated.')
                const verMatch = f.match(/-u(\d+)\.[a-z0-9\-]+\.vtt$/i)
                const version = verMatch ? Number(verMatch[1]) : 1
                const lang = (extractLangCode(f, videoBaseName) || courseLanguage || 'en').toLowerCase().trim()
                rawSources.push({
                    lang: lang === 'source' ? (courseLanguage || 'en') : lang,
                    filePath: fullPath,
                    fileName: f,
                    origin: isGenerated ? 'generated' : 'uploaded',
                    version,
                    format: 'vtt'
                })
                changed = true
            }
        } catch { }
    } else if (!isLocalCourse) {
        // Cloud / YouTube courses: auto-discover AppData transcripts/<videoId>*.json
        const transcriptsDir = path.join(getDataDir(), 'transcripts')
        if (fs.existsSync(transcriptsDir)) {
            try {
                const files = fs.readdirSync(transcriptsDir)
                for (const f of files) {
                    if (!f.startsWith(id) || !f.endsWith('.json')) continue
                    const rest = f.slice(id.length, -5)
                    if (!/^(?:\.|-(?:generated|u\d+)\.)[a-z0-9\-]+$/i.test(rest)) continue
                    const fullPath = path.join(transcriptsDir, f)
                    if (rawSources.some(s => s.filePath && path.resolve(s.filePath) === path.resolve(fullPath))) {
                        continue
                    }
                    const isGenerated = rest.startsWith('-generated.')
                    const verMatch = rest.match(/^-u(\d+)\.([a-z0-9\-]+)$/i)
                    const langMatch = rest.match(/(?:^-generated\.|^-u\d+\.|^\.)([a-z0-9\-]+)$/i)
                    const lang = (verMatch?.[2] || langMatch?.[1] || courseLanguage || 'en').toLowerCase()
                    const version = verMatch ? Number(verMatch[1]) : 1
                    rawSources.push({
                        lang: lang === 'source' ? (courseLanguage || 'en') : lang,
                        filePath: fullPath,
                        fileName: f,
                        origin: isGenerated ? 'generated' : 'uploaded',
                        version,
                        format: 'vtt'
                    })
                    changed = true
                }
            } catch { }
        }
    }

    const normalized = normalizeSubtitleSources(rawSources, courseLanguage)
    if (changed || JSON.stringify(normalized) !== JSON.stringify(videoMeta.subtitleSources)) {
        const hasTranscript = normalized.length > 0 ? 1 : 0
        run(`UPDATE videos SET has_transcript = ?, subtitle_sources = ? WHERE id = ?`, [
            hasTranscript,
            JSON.stringify(normalized),
            id
        ])
        videoMeta.subtitleSources = normalized
    }

    return normalized
}

const SUBTITLE_EXTS = new Set(['.srt', '.vtt', '.ass', '.ssa', '.lrc'])

function findSubtitleFilesRecursive(dir, maxDepth = 4, currentDepth = 0) {
    if (currentDepth > maxDepth || !dir || !fs.existsSync(dir)) return []
    let results = []
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name)
            if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase()
                if (SUBTITLE_EXTS.has(ext)) {
                    results.push({ name: entry.name, fullPath, ext })
                }
            } else if (entry.isDirectory()) {
                if (!['.git', 'node_modules', '$RECYCLE.BIN', '.tutin'].includes(entry.name)) {
                    results = results.concat(findSubtitleFilesRecursive(fullPath, maxDepth, currentDepth + 1))
                }
            }
        }
    } catch { }
    return results
}

function isSubtitleMatchForVideo(subFileName, videoBaseName, targetLang, courseLang = 'en') {
    const subExt = path.extname(subFileName).toLowerCase()
    if (!SUBTITLE_EXTS.has(subExt)) return false

    const rawExtracted = extractLangCode(subFileName, videoBaseName)
    const extractedLang = (!rawExtracted || rawExtracted === 'source') ? courseLang : rawExtracted.toLowerCase()
    if (extractedLang !== targetLang.toLowerCase()) return false

    const subNameWithoutExt = subFileName.replace(/\.[a-z0-9]+$/i, '')
    const baseLower = videoBaseName.toLowerCase()
    const subLower = subNameWithoutExt.toLowerCase()

    if (subLower.startsWith(baseLower)) return true

    const normalize = str => str.replace(/[\s._\-\u2013\u2014]+/g, ' ').toLowerCase().trim()
    const normBase = normalize(videoBaseName)
    const normSub = normalize(subNameWithoutExt)
    if (normSub.startsWith(normBase)) return true

    const baseNum = videoBaseName.match(/^0*(\d+)/)
    const subNum = subFileName.match(/^0*(\d+)/)
    if (baseNum && subNum && baseNum[1] === subNum[1]) {
        const baseWords = normBase.split(' ').filter(w => w.length > 2)
        const subWords = normSub.split(' ').filter(w => w.length > 2)
        const hasCommonWord = baseWords.some(w => subWords.includes(w))
        if (hasCommonWord || baseWords.length === 0) return true
    }

    return false
}

function detectCourseSiblingCaptions(videoId, targetLang) {
    const matches = []
    try {
        const video = getOne('SELECT * FROM videos WHERE id = ?', [videoId])
        if (!video || !video.course_id) return matches

        const otherVideos = getAll('SELECT * FROM videos WHERE course_id = ? AND id != ?', [video.course_id, videoId])
        const courseRecord = getOne('SELECT folder_path, language FROM courses WHERE id = ?', [video.course_id])
        const courseLang = (courseRecord?.language || 'en').toLowerCase().trim()

        const candidateDirs = new Set()
        if (courseRecord?.folder_path && fs.existsSync(courseRecord.folder_path)) {
            candidateDirs.add(courseRecord.folder_path)
        }
        if (video.file_path && fs.existsSync(video.file_path)) {
            candidateDirs.add(path.dirname(video.file_path))
            const parentDir = path.dirname(path.dirname(video.file_path))
            if (fs.existsSync(parentDir)) candidateDirs.add(parentDir)
        }

        const allSubs = []
        const seenSubs = new Set()
        for (const dir of candidateDirs) {
            for (const s of findSubtitleFilesRecursive(dir)) {
                if (!seenSubs.has(s.fullPath)) {
                    seenSubs.add(s.fullPath)
                    allSubs.push(s)
                }
            }
        }

        for (const otherVideo of otherVideos) {
            if (!otherVideo.file_name) continue
            let currentSources = JSON.parse(otherVideo.subtitle_sources || '[]')
            currentSources = currentSources.filter(s => !s.filePath || fs.existsSync(s.filePath))

            if (currentSources.some(s => (s.lang || courseLang).toLowerCase() === targetLang.toLowerCase())) continue

            const baseName = path.basename(otherVideo.file_name, path.extname(otherVideo.file_name))
            for (const sub of allSubs) {
                if (isSubtitleMatchForVideo(sub.name, baseName, targetLang, courseLang)) {
                    matches.push({
                        videoId: otherVideo.id,
                        videoTitle: otherVideo.title || baseName,
                        fileName: sub.name,
                        filePath: sub.fullPath,
                        lang: targetLang,
                        format: sub.ext.slice(1).replace('ssa', 'ass')
                    })
                    break
                }
            }
        }
    } catch (err) {
        console.error('Error detecting sibling captions:', err)
    }
    return matches
}

// ── Routes ────────────────────────────────────────────────────

// GET /api/transcripts/supported-languages
router.get('/supported-languages', (_req, res) => {
    res.json(getSupportedTranslationLanguages())
})

// POST /api/transcripts/:videoId/upload
// Allows multiple uploaded versions per language (e.g. en:uploaded, en:uploaded:2)
router.post('/:videoId/upload', upload.any(), async (req, res) => {
    try {
        const uploadedFile = req.file || (req.files && req.files[0])
        if (!uploadedFile) return res.status(400).json({ error: 'No file uploaded' })

        const fileContent = uploadedFile.buffer.toString('utf8')
        const originalName = uploadedFile.originalname
        const format = detectFormat(originalName) || 'srt'

        const videoMeta = getVideoMeta(req.params.videoId)
        const existingSources = reconcileVideoSubtitleSources(videoMeta)

        const extracted = extractLangCode(originalName, videoMeta.videoBaseName)
        const rawLang = (req.body.lang || (extracted && extracted !== 'source' ? extracted : null) || videoMeta.courseLanguage || 'en').toLowerCase().trim()
        const reqLang = rawLang === 'source' ? (videoMeta.courseLanguage || 'en') : rawLang

        const rawChunks = parseSubtitleFile(fileContent, originalName)
        if (!rawChunks.length) return res.status(400).json({ error: 'Could not parse subtitle file' })

        // Normalize unpunctuated or fragmented cues into clean clauses
        const chunks = normalizeCuesIntoClauses(rawChunks, reqLang)

        // Determine next uploaded version for reqLang (or replace if replaceTrackId is specified)
        const replaceTrackId = req.body.replaceTrackId ? String(req.body.replaceTrackId).trim() : null
        let targetVersion = 1

        if (replaceTrackId) {
            const toReplace = existingSources.find(s => s.id === replaceTrackId && s.origin === 'uploaded')
            if (toReplace) {
                targetVersion = toReplace.version || 1
            }
        } else {
            const sameLangUploaded = existingSources.filter(s => s.lang === reqLang && s.origin === 'uploaded')
            if (sameLangUploaded.length > 0) {
                const maxVer = Math.max(...sameLangUploaded.map(s => Number(s.version) || 1))
                targetVersion = maxVer + 1
            }
        }

        const filePath = saveCaptionFile(videoMeta, reqLang, chunks, 'uploaded', targetVersion)
        const trackId = buildTrackId(reqLang, 'uploaded', targetVersion)

        // Clear is_master on other tracks of this language so the newly uploaded track becomes Master
        const updatedSources = existingSources
            .filter(s => s.id !== trackId)
            .map(s => s.lang === reqLang ? { ...s, is_master: false } : s)

        const newTrack = {
            id: trackId,
            lang: reqLang,
            origin: 'uploaded',
            version: targetVersion,
            label: buildTrackOriginLabel('uploaded', targetVersion),
            fileName: originalName,
            filePath,
            format: 'vtt',
            is_master: true,
            is_ai_source: false
        }
        updatedSources.push(newTrack)

        const finalSources = normalizeSubtitleSources(updatedSources, videoMeta.courseLanguage)

        run(`UPDATE videos SET has_transcript = 1, subtitle_sources = ? WHERE id = ?`, [
            JSON.stringify(finalSources),
            req.params.videoId
        ])

        const detectedMatches = detectCourseSiblingCaptions(req.params.videoId, reqLang)

        res.json({
            success: true,
            track: finalSources.find(s => s.id === trackId) || newTrack,
            chunkCount: chunks.length,
            format,
            language: reqLang,
            languageName: LANG_DISPLAY_MAP[reqLang] || reqLang,
            detectedMatches
        })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// PUT /api/transcripts/:videoId — Save AI-generated transcript (overwrites the single AI slot for that language)
router.put('/:videoId', (req, res) => {
    try {
        const { chunks: rawChunks, language } = req.body
        if (!Array.isArray(rawChunks) || rawChunks.length === 0) {
            return res.status(400).json({ error: 'Transcript chunks array required' })
        }

        const videoMeta = getVideoMeta(req.params.videoId)
        const existingSources = reconcileVideoSubtitleSources(videoMeta)

        const rawLang = (language && language !== 'source' ? language : videoMeta.courseLanguage || 'en').toLowerCase().trim()
        const targetLang = rawLang === 'source' ? (videoMeta.courseLanguage || 'en') : rawLang

        const chunks = normalizeCuesIntoClauses(rawChunks, targetLang)
        if (chunks.length === 0) {
            return res.status(400).json({ error: 'No valid speech cues found in transcript' })
        }

        const filePath = saveCaptionFile(videoMeta, targetLang, chunks, 'generated', 1)

        const trackId = buildTrackId(targetLang, 'generated', 1)
        const prevAiTrack = existingSources.find(s => s.id === trackId)
        const otherSources = existingSources.filter(s => s.id !== trackId)
        const hasOtherMaster = otherSources.some(s => s.lang === targetLang && s.is_master)

        const newTrack = {
            id: trackId,
            lang: targetLang,
            origin: 'generated',
            version: 1,
            label: 'AI',
            fileName: path.basename(filePath || `${videoMeta.videoBaseName}-generated.${targetLang}.vtt`),
            filePath,
            format: 'vtt',
            is_master: prevAiTrack?.is_master || !hasOtherMaster,
            is_ai_source: Boolean(prevAiTrack?.is_ai_source)
        }
        otherSources.push(newTrack)

        const finalSources = normalizeSubtitleSources(otherSources, videoMeta.courseLanguage)
        const now = new Date().toISOString()

        run(`UPDATE videos SET has_transcript = 1, transcript_generated_at = ?, subtitle_sources = ? WHERE id = ?`, [
            now,
            JSON.stringify(finalSources),
            req.params.videoId
        ])

        res.json({
            success: true,
            track: finalSources.find(s => s.id === trackId) || newTrack,
            chunkCount: chunks.length,
            language: targetLang
        })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// POST /api/transcripts/:videoId/transcribe — Backend faster-whisper ASR (with browser fallback flag)
router.post('/:videoId/transcribe', async (req, res) => {
    try {
        const videoMeta = getVideoMeta(req.params.videoId)
        const existingSources = reconcileVideoSubtitleSources(videoMeta)

        const rawLang = (req.body?.language || videoMeta.courseLanguage || 'en').toLowerCase().trim()
        const targetLang = rawLang === 'source' ? (videoMeta.courseLanguage || 'en') : rawLang
        const modelPref = req.body?.model || 'large-v3-turbo'

        // If no local video file on disk, instruct client to use browser / YouTube path
        if (!videoMeta.videoFilePath || !fs.existsSync(videoMeta.videoFilePath)) {
            return res.json({ fallbackToBrowser: true, reason: 'No local video file on disk' })
        }

        let pyData = null
        try {
            pyData = await transcribeWithPythonService({
                videoPath: videoMeta.videoFilePath,
                language: targetLang,
                modelName: modelPref === 'base' || modelPref === 'whisper-base' ? 'base' : (modelPref === 'small' || modelPref === 'whisper-small' ? 'small' : 'large-v3-turbo')
            })
        } catch (pyErr) {
            console.warn('[Transcribe] Python faster-whisper unavailable, falling back to browser Whisper:', pyErr.message)
            return res.json({ fallbackToBrowser: true, reason: pyErr.message })
        }

        if (!pyData || !Array.isArray(pyData.chunks) || pyData.chunks.length === 0) {
            return res.json({ fallbackToBrowser: true, reason: 'Python transcription service not running' })
        }

        const chunks = normalizeCuesIntoClauses(pyData.chunks, targetLang)
        if (chunks.length === 0) {
            return res.status(400).json({ error: 'No speech detected in audio track' })
        }

        const filePath = saveCaptionFile(videoMeta, targetLang, chunks, 'generated', 1)

        const trackId = buildTrackId(targetLang, 'generated', 1)
        const prevAiTrack = existingSources.find(s => s.id === trackId)
        const otherSources = existingSources.filter(s => s.id !== trackId)
        const hasOtherMaster = otherSources.some(s => s.lang === targetLang && s.is_master)

        const newTrack = {
            id: trackId,
            lang: targetLang,
            origin: 'generated',
            version: 1,
            label: 'AI',
            fileName: path.basename(filePath || `${videoMeta.videoBaseName}-generated.${targetLang}.vtt`),
            filePath,
            format: 'vtt',
            is_master: prevAiTrack?.is_master || !hasOtherMaster,
            is_ai_source: Boolean(prevAiTrack?.is_ai_source)
        }
        otherSources.push(newTrack)

        const finalSources = normalizeSubtitleSources(otherSources, videoMeta.courseLanguage)
        const now = new Date().toISOString()

        run(`UPDATE videos SET has_transcript = 1, transcript_generated_at = ?, subtitle_sources = ? WHERE id = ?`, [
            now,
            JSON.stringify(finalSources),
            req.params.videoId
        ])

        res.json({
            success: true,
            engine: 'faster-whisper',
            track: finalSources.find(s => s.id === trackId) || newTrack,
            chunkCount: chunks.length,
            language: targetLang,
            chunks
        })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// POST /api/transcripts/:videoId/translate — SSE Streaming Subtitle Translation
router.post('/:videoId/translate', async (req, res) => {
    const {
        targetLanguage,
        sourceLanguage,
        sourceTrackId,
        openRouterApiKey: bodyApiKey,
        openRouterModel: bodyModel
    } = req.body || {}

    if (!targetLanguage) {
        return res.status(400).json({ error: 'targetLanguage is required' })
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders?.()

    const sendEvent = (payload) => {
        try {
            res.write(`data: ${JSON.stringify(payload)}\n\n`)
        } catch { }
    }

    const abortController = new AbortController()
    res.on('close', () => {
        if (!res.writableEnded) {
            abortController.abort()
        }
    })

    try {
        const videoMeta = getVideoMeta(req.params.videoId)
        const existingSources = reconcileVideoSubtitleSources(videoMeta)

        // Resolve source track: explicit sourceTrackId -> is_ai_source -> Master of sourceLanguage -> Master of courseLanguage
        const aiSourceTrack = existingSources.find(s => s.is_ai_source)
        const lookupKey = sourceTrackId || (aiSourceTrack ? aiSourceTrack.id : (sourceLanguage || videoMeta.courseLanguage || 'source'))
        const resolvedSourceEntry = resolveSubtitleSourceEntry(lookupKey, existingSources, videoMeta.courseLanguage)

        const effectiveSourceLang = (
            resolvedSourceEntry?.lang ||
            (sourceLanguage && sourceLanguage !== 'source' ? sourceLanguage : videoMeta.courseLanguage) ||
            'en'
        ).toLowerCase().split(':')[0].trim()

        const sourceChunks = loadCaptionChunks(
            req.params.videoId,
            resolvedSourceEntry ? resolvedSourceEntry.id : lookupKey,
            existingSources,
            videoMeta.courseFolder,
            videoMeta.relModulePath,
            videoMeta.videoBaseName,
            videoMeta.courseLanguage
        )

        if (!sourceChunks || sourceChunks.length === 0) {
            sendEvent({ error: 'No source transcript found for this lesson. Generate or upload a source transcript first.' })
            return res.end()
        }

        // Resolve OpenRouter credentials from request body or settings DB table
        let apiKey = bodyApiKey || null
        let modelName = bodyModel || null
        if (!apiKey) {
            try {
                const row = getOne('SELECT value FROM settings WHERE key = ?', ['openRouterApiKey'])
                if (row?.value) apiKey = row.value
            } catch { }
        }
        if (!modelName) {
            try {
                const row = getOne('SELECT value FROM settings WHERE key = ?', ['openRouterModel'])
                if (row?.value) modelName = row.value
            } catch { }
        }

        sendEvent({
            step: 'loading',
            percent: 5,
            message: `Preparing ${sourceChunks.length} cues from ${LANG_DISPLAY_MAP[effectiveSourceLang] || effectiveSourceLang}…`
        })

        const targetLang = targetLanguage.toLowerCase().trim()
        const translatedChunks = await translateChunks(
            sourceChunks,
            targetLang,
            (progress) => sendEvent(progress),
            abortController.signal,
            apiKey,
            modelName,
            effectiveSourceLang,
            videoMeta.courseTitle
        )

        if (!translatedChunks || translatedChunks.length === 0) {
            throw new Error('Translation produced no subtitle cues')
        }

        const filePath = saveCaptionFile(videoMeta, targetLang, translatedChunks, 'generated', 1)

        const trackId = buildTrackId(targetLang, 'generated', 1)
        const prevAiTrack = existingSources.find(s => s.id === trackId)
        const otherSources = existingSources.filter(s => s.id !== trackId)
        const hasOtherMaster = otherSources.some(s => s.lang === targetLang && s.is_master)

        const newTrack = {
            id: trackId,
            lang: targetLang,
            origin: 'generated',
            version: 1,
            label: 'AI',
            fileName: path.basename(filePath || `${videoMeta.videoBaseName}-generated.${targetLang}.vtt`),
            filePath,
            format: 'vtt',
            is_master: prevAiTrack?.is_master || !hasOtherMaster,
            is_ai_source: Boolean(prevAiTrack?.is_ai_source)
        }
        otherSources.push(newTrack)

        const finalSources = normalizeSubtitleSources(otherSources, videoMeta.courseLanguage)

        run(`UPDATE videos SET has_transcript = 1, subtitle_sources = ? WHERE id = ?`, [
            JSON.stringify(finalSources),
            req.params.videoId
        ])

        sendEvent({
            step: 'done',
            percent: 100,
            done: true,
            language: targetLang,
            track: finalSources.find(s => s.id === trackId) || newTrack,
            message: `Translated to ${LANG_DISPLAY_MAP[targetLang] || targetLang}`
        })
        res.end()
    } catch (err) {
        sendEvent({ error: err.message || 'Translation failed' })
        res.end()
    }
})

// GET /api/transcripts/:videoId/languages
router.get('/:videoId/languages', (req, res) => {
    try {
        const videoMeta = getVideoMeta(req.params.videoId)
        const sources = reconcileVideoSubtitleSources(videoMeta)

        const langs = listVideoLanguages(
            req.params.videoId,
            sources,
            videoMeta.courseFolder,
            videoMeta.relModulePath,
            videoMeta.videoBaseName,
            videoMeta.courseLanguage
        )
        res.json({
            ...langs,
            courseLanguage: videoMeta.courseLanguage,
            subtitleSources: sources
        })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// GET /api/transcripts/:videoId/chunks
router.get('/:videoId/chunks', (req, res) => {
    try {
        const lang = req.query.lang || 'source'
        const videoMeta = getVideoMeta(req.params.videoId)
        const sources = reconcileVideoSubtitleSources(videoMeta)

        const chunks = loadCaptionChunks(
            req.params.videoId,
            lang,
            sources,
            videoMeta.courseFolder,
            videoMeta.relModulePath,
            videoMeta.videoBaseName,
            videoMeta.courseLanguage
        )

        res.json(chunks)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// GET /api/transcripts/:videoId/text
router.get('/:videoId/text', (req, res) => {
    try {
        const lang = req.query.lang || 'source'
        const videoMeta = getVideoMeta(req.params.videoId)
        const sources = reconcileVideoSubtitleSources(videoMeta)

        const chunks = loadCaptionChunks(
            req.params.videoId,
            lang,
            sources,
            videoMeta.courseFolder,
            videoMeta.relModulePath,
            videoMeta.videoBaseName,
            videoMeta.courseLanguage
        )

        res.type('text/plain').send(chunksToText(chunks))
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// GET /api/transcripts/:videoId/download
router.get('/:videoId/download', (req, res) => {
    try {
        const lang = req.query.lang || 'source'
        const format = (req.query.format || 'srt').toLowerCase()
        const videoMeta = getVideoMeta(req.params.videoId)
        const sources = reconcileVideoSubtitleSources(videoMeta)
        const resolved = resolveSubtitleSourceEntry(lang, sources, videoMeta.courseLanguage)

        const chunks = loadCaptionChunks(
            req.params.videoId,
            lang,
            sources,
            videoMeta.courseFolder,
            videoMeta.relModulePath,
            videoMeta.videoBaseName,
            videoMeta.courseLanguage
        )

        if (!chunks || chunks.length === 0) {
            return res.status(404).json({ error: 'Caption not found' })
        }

        const langSlug = resolved ? `${resolved.lang}-${resolved.origin}${resolved.version > 1 ? `-v${resolved.version}` : ''}` : lang.replace(/:/g, '-')
        const fileName = `${videoMeta.videoBaseName}.${langSlug}.${format}`

        if (format === 'vtt') {
            res.setHeader('Content-Type', 'text/vtt; charset=utf-8')
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
            return res.send(chunksToVTT(chunks))
        }

        res.setHeader('Content-Type', 'application/x-subrip; charset=utf-8')
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
        return res.send(chunksToSRT(chunks))
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// POST /api/transcripts/:videoId/set-master
router.post('/:videoId/set-master', (req, res) => {
    const { id, lang, origin, version } = req.body || {}
    if (!id && !lang) return res.status(400).json({ error: 'Missing track id or lang' })

    try {
        const videoMeta = getVideoMeta(req.params.videoId)
        const sources = reconcileVideoSubtitleSources(videoMeta)

        const target = id
            ? sources.find(s => s.id === id)
            : sources.find(s => s.lang === lang && (!origin || s.origin === origin) && (!version || s.version === Number(version)))

        if (!target) return res.status(404).json({ error: 'Specified subtitle track not found' })

        sources.forEach(s => {
            if (s.lang === target.lang) s.is_master = (s.id === target.id)
        })

        const finalSources = normalizeSubtitleSources(sources, videoMeta.courseLanguage)
        run(`UPDATE videos SET subtitle_sources = ? WHERE id = ?`, [
            JSON.stringify(finalSources),
            req.params.videoId
        ])

        res.json({ success: true, subtitleSources: finalSources })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// POST /api/transcripts/:videoId/make-source
router.post('/:videoId/make-source', (req, res) => {
    const { id, lang, origin, version, clear } = req.body || {}
    if (!clear && !id && !lang) return res.status(400).json({ error: 'Missing track id or lang' })

    try {
        const videoMeta = getVideoMeta(req.params.videoId)
        const sources = reconcileVideoSubtitleSources(videoMeta)

        if (clear) {
            sources.forEach(s => { s.is_ai_source = false })
        } else {
            const target = id
                ? sources.find(s => s.id === id)
                : sources.find(s => s.lang === lang && (!origin || s.origin === origin) && (!version || s.version === Number(version)))

            if (!target) return res.status(404).json({ error: 'Specified subtitle track not found' })

            sources.forEach(s => {
                s.is_ai_source = (s.id === target.id)
            })
        }

        const finalSources = normalizeSubtitleSources(sources, videoMeta.courseLanguage)
        run(`UPDATE videos SET subtitle_sources = ? WHERE id = ?`, [
            JSON.stringify(finalSources),
            req.params.videoId
        ])

        res.json({ success: true, subtitleSources: finalSources })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// DELETE /api/transcripts/:videoId
// Supports ?id=<trackId> or ?lang=<lang>&origin=<origin>&version=<version>
router.delete('/:videoId', (req, res) => {
    try {
        const trackId = req.query.id ? String(req.query.id).trim() : null
        const lang = req.query.lang ? String(req.query.lang).trim() : null
        const origin = req.query.origin ? String(req.query.origin).trim() : null
        const version = req.query.version ? Number(req.query.version) : null

        const videoMeta = getVideoMeta(req.params.videoId)
        const sources = reconcileVideoSubtitleSources(videoMeta)

        let sourceIndex = -1
        if (trackId) {
            sourceIndex = sources.findIndex(s => s.id === trackId)
        }
        if (sourceIndex === -1 && lang) {
            if (lang.includes(':')) {
                sourceIndex = sources.findIndex(s => s.id === lang)
            }
            if (sourceIndex === -1) {
                sourceIndex = sources.findIndex(s =>
                    s.lang === lang.split(':')[0] &&
                    (!origin || s.origin === origin) &&
                    (!version || s.version === version)
                )
            }
        }

        if (sourceIndex === -1) {
            return res.status(404).json({ error: 'Subtitle track not found' })
        }

        const source = sources[sourceIndex]

        // Delete the managed VTT / cache file if inside .tutin or AppData
        if (source.filePath && fs.existsSync(source.filePath)) {
            const normalizedPath = path.resolve(source.filePath).toLowerCase()
            const isManagedVault = normalizedPath.includes(`${path.sep}.tutin${path.sep}`) ||
                normalizedPath.startsWith(path.resolve(getDataDir()).toLowerCase())
            if (isManagedVault) {
                try { fs.unlinkSync(source.filePath) } catch { }
            }
        }

        // Also clean up AppData cache file if present
        try {
            const cachePath = getCacheFilePath(req.params.videoId, source.lang, source.origin, source.version || 1)
            if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath)
        } catch { }

        sources.splice(sourceIndex, 1)

        // Re-normalize so if the deleted track was Master, the next remaining track for that language becomes Master
        const finalSources = normalizeSubtitleSources(sources, videoMeta.courseLanguage)
        const hasTranscript = finalSources.length > 0 ? 1 : 0
        const generatedAt = hasTranscript ? new Date().toISOString() : null

        run(`UPDATE videos SET has_transcript = ?, transcript_generated_at = ?, subtitle_sources = ? WHERE id = ?`, [
            hasTranscript,
            generatedAt,
            JSON.stringify(finalSources),
            req.params.videoId
        ])

        res.json({ success: true, subtitleSources: finalSources })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// GET /api/transcripts/:videoId/detect-sibling-captions
router.get('/:videoId/detect-sibling-captions', (req, res) => {
    try {
        const lang = req.query.lang || 'en'
        const matches = detectCourseSiblingCaptions(req.params.videoId, lang)
        res.json({
            language: lang,
            languageName: LANG_DISPLAY_MAP[lang] || lang,
            matches
        })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// POST /api/transcripts/batch-apply
router.post('/batch-apply', (req, res) => {
    try {
        const { matches } = req.body
        if (!Array.isArray(matches) || matches.length === 0) {
            return res.status(400).json({ error: 'Matches array required' })
        }

        let appliedCount = 0
        const updatedVideoIds = []

        for (const match of matches) {
            try {
                if (!match.videoId || !match.filePath || !fs.existsSync(match.filePath)) continue
                const content = fs.readFileSync(match.filePath, 'utf8')
                const fileName = match.fileName || path.basename(match.filePath)
                const rawChunks = parseSubtitleFile(content, fileName)
                if (!rawChunks || !rawChunks.length) continue

                const videoMeta = getVideoMeta(match.videoId)
                const existingSources = reconcileVideoSubtitleSources(videoMeta)
                const rawLang = (match.lang && match.lang !== 'source' ? match.lang : videoMeta.courseLanguage || 'en').toLowerCase().trim()

                const chunks = normalizeCuesIntoClauses(rawChunks, rawLang)
                const filePath = saveCaptionFile(videoMeta, rawLang, chunks, 'uploaded', 1)
                const trackId = buildTrackId(rawLang, 'uploaded', 1)

                const updated = existingSources
                    .filter(s => s.id !== trackId)
                    .map(s => s.lang === rawLang ? { ...s, is_master: false } : s)

                updated.push({
                    id: trackId,
                    lang: rawLang,
                    origin: 'uploaded',
                    version: 1,
                    label: 'Uploaded',
                    fileName,
                    filePath,
                    format: 'vtt',
                    is_master: true,
                    is_ai_source: false
                })

                const finalSources = normalizeSubtitleSources(updated, videoMeta.courseLanguage)

                run(`UPDATE videos SET has_transcript = 1, subtitle_sources = ? WHERE id = ?`, [
                    JSON.stringify(finalSources),
                    match.videoId
                ])

                appliedCount++
                updatedVideoIds.push(match.videoId)
            } catch (err) {
                console.error(`Failed to batch apply caption for video ${match.videoId}:`, err)
            }
        }

        res.json({ success: true, count: appliedCount, updatedVideoIds })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

export default router
