import express from 'express'
import fs from 'fs'
import path from 'path'
import multer from 'multer'
import { getOne, run, getAll, getDataDir } from '../database.js'
import { parseSubtitleFile, chunksToSRT, chunksToVTT, extractLangCode, detectFormat } from '../utils/captionParser.js'
import { saveCaptionFile, loadCaptionChunks, listVideoLanguages } from '../utils/courseAssets.js'
import { translateChunks } from '../utils/aiTranslation.js'

const router = express.Router()

// Multer for memory upload
const upload = multer({ storage: multer.memoryStorage() })

// ── Helpers ───────────────────────────────────────────────────

function chunksToText(chunks) {
    if (!chunks || chunks.length === 0) return ''
    return chunks.map(c => c.text.trim()).join(' ')
}

function getVideoMeta(videoId) {
    const video = getOne('SELECT * FROM videos WHERE id = ?', [videoId])
    if (!video) throw new Error('Video not found')

    const moduleRecord = getOne('SELECT folder_path FROM modules WHERE id = ?', [video.module_id])
    const courseRecord = getOne('SELECT folder_path, language FROM courses WHERE id = ?', [video.course_id])

    let relModulePath = ''
    if (moduleRecord && courseRecord && moduleRecord.folder_path && courseRecord.folder_path) {
        relModulePath = path.relative(courseRecord.folder_path, moduleRecord.folder_path)
        if (relModulePath === '.') relModulePath = ''
    }

    return {
        id: video.id,
        courseFolder: courseRecord?.folder_path || null,
        courseLanguage: courseRecord?.language || 'en',
        relModulePath,
        videoBaseName: path.basename(video.file_name, path.extname(video.file_name)),
        subtitleSources: JSON.parse(video.subtitle_sources || '[]')
    }
}

const LANG_DISPLAY_MAP = {
    ar: 'Arabic', en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
    pt: 'Portuguese', ru: 'Russian', ja: 'Japanese', ko: 'Korean', zh: 'Chinese',
    hi: 'Hindi', tr: 'Turkish', nl: 'Dutch', pl: 'Polish', id: 'Indonesian',
    vi: 'Vietnamese', he: 'Hebrew', el: 'Greek', sv: 'Swedish', da: 'Danish',
    no: 'Norwegian', fi: 'Finnish', cs: 'Czech', hu: 'Hungarian', ro: 'Romanian',
    th: 'Thai', uk: 'Ukrainian', source: 'Source / Original'
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
                if (!['.git', 'node_modules', '$RECYCLE.BIN'].includes(entry.name)) {
                    results = results.concat(findSubtitleFilesRecursive(fullPath, maxDepth, currentDepth + 1))
                }
            }
        }
    } catch (e) {}
    return results
}

function isSubtitleMatchForVideo(subFileName, videoBaseName, targetLang) {
    const subExt = path.extname(subFileName).toLowerCase()
    if (!SUBTITLE_EXTS.has(subExt)) return false

    const extractedLang = extractLangCode(subFileName, videoBaseName) || 'source'
    // Strict language match
    if (extractedLang !== targetLang) return false

    const subNameWithoutExt = subFileName.replace(/\.[a-z0-9]+$/i, '')
    const baseLower = videoBaseName.toLowerCase()
    const subLower = subNameWithoutExt.toLowerCase()

    // 1. Direct prefix match
    if (subLower.startsWith(baseLower)) return true

    // 2. Normalized punctuation match (e.g. "02 - Intro" vs "02. Intro" vs "02_Intro")
    const normalize = str => str.replace(/[\s._\-\u2013\u2014]+/g, ' ').toLowerCase().trim()
    const normBase = normalize(videoBaseName)
    const normSub = normalize(subNameWithoutExt)
    if (normSub.startsWith(normBase)) return true

    // 3. Numbered prefix match (e.g. "02 - Title" vs "02 Title [spa]")
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

/**
 * Scan course for other videos that have subtitle files for the EXACT same language.
 * Ensures multi-language folders (e.g. .en.vtt and .ar.vtt) only match the target language.
 */
function detectCourseSiblingCaptions(videoId, targetLang) {
    const matches = []
    try {
        const video = getOne('SELECT * FROM videos WHERE id = ?', [videoId])
        if (!video || !video.course_id) return matches

        const otherVideos = getAll('SELECT * FROM videos WHERE course_id = ? AND id != ?', [video.course_id, videoId])
        const courseRecord = getOne('SELECT folder_path FROM courses WHERE id = ?', [video.course_id])

        // Collect all candidate directories to scan
        const candidateDirs = new Set()
        if (courseRecord?.folder_path && fs.existsSync(courseRecord.folder_path)) {
            candidateDirs.add(courseRecord.folder_path)
        }
        if (video.file_path && fs.existsSync(video.file_path)) {
            candidateDirs.add(path.dirname(video.file_path))
            const parentDir = path.dirname(path.dirname(video.file_path))
            if (fs.existsSync(parentDir)) candidateDirs.add(parentDir)
        }

        // Collect all subtitle files from candidate directories recursively
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
            let currentSources = JSON.parse(otherVideo.subtitle_sources || '[]')
            currentSources = currentSources.filter(s => !s.filePath || fs.existsSync(s.filePath))
            
            // If already has this language registered and valid, skip
            if (currentSources.some(s => s.lang === targetLang)) continue

            const baseName = path.basename(otherVideo.file_name, path.extname(otherVideo.file_name))
            for (const sub of allSubs) {
                if (isSubtitleMatchForVideo(sub.name, baseName, targetLang)) {
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

// POST /api/transcripts/:videoId/upload
router.post('/:videoId/upload', upload.any(), (req, res) => {
    try {
        const uploadedFile = req.file || (req.files && req.files[0])
        if (!uploadedFile) return res.status(400).json({ error: 'No file uploaded' })
        
        const fileContent = uploadedFile.buffer.toString('utf8')
        const originalName = uploadedFile.originalname
        const format = detectFormat(originalName) || 'srt'
        
        const videoMeta = getVideoMeta(req.params.videoId)
        
        // Use user-provided lang, or extract from filename, or default to courseLanguage / en
        const reqLang = req.body.lang || extractLangCode(originalName, videoMeta.videoBaseName) || videoMeta.courseLanguage || 'en'
        
        // Parse the file
        const chunks = parseSubtitleFile(fileContent, originalName)
        if (!chunks.length) return res.status(400).json({ error: 'Could not parse caption file' })

        // Save to .tutin/captions/ without -uploaded (e.g. 01 - Intro.es.vtt)
        const filePath = saveCaptionFile(videoMeta, reqLang, chunks, 'uploaded')

        // Update DB
        const currentSources = videoMeta.subtitleSources.filter(s => !(s.lang === reqLang && s.origin === 'uploaded'))
        
        // If no master exists for this lang, make this the master
        const hasMaster = currentSources.some(s => s.lang === reqLang && s.is_master)
        
        currentSources.push({
            lang: reqLang,
            filePath,
            origin: 'uploaded',
            format: 'vtt', // we always convert to VTT internally
            is_master: !hasMaster
        })

        run(`UPDATE videos SET has_transcript = 1, subtitle_sources = ? WHERE id = ?`, [
            JSON.stringify(currentSources),
            req.params.videoId
        ])

        // Smart detect same-language captions for the rest of the course
        const detectedMatches = detectCourseSiblingCaptions(req.params.videoId, reqLang)

        res.json({
            success: true,
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

// GET /api/transcripts/:videoId/languages
router.get('/:videoId/languages', (req, res) => {
    try {
        const videoMeta = getVideoMeta(req.params.videoId)
        let sources = videoMeta.subtitleSources || []
        let dbNeedsUpdate = false

        sources = sources.filter(s => {
            if (s.filePath && !fs.existsSync(s.filePath)) {
                dbNeedsUpdate = true
                return false
            }
            return true
        })

        // Also auto-discover any manually placed caption files in .tutin/captions/
        if (videoMeta.courseFolder && fs.existsSync(videoMeta.courseFolder) && videoMeta.videoBaseName) {
            const captionsDir = path.join(videoMeta.courseFolder, '.tutin', 'captions', videoMeta.relModulePath)
            if (fs.existsSync(captionsDir)) {
                try {
                    const files = fs.readdirSync(captionsDir)
                    for (const f of files) {
                        if (f.startsWith(videoMeta.videoBaseName) && f.endsWith('.vtt')) {
                            const fullPath = path.join(captionsDir, f)
                            if (!sources.some(s => s.filePath === fullPath)) {
                                const isGenerated = f.includes('-generated')
                                const lang = extractLangCode(f, videoMeta.videoBaseName) || videoMeta.courseLanguage || 'en'
                                const origin = isGenerated ? 'generated' : 'uploaded'
                                const hasMaster = sources.some(s => s.lang === lang && s.is_master)
                                sources.push({
                                    lang,
                                    filePath: fullPath,
                                    origin,
                                    format: 'vtt',
                                    is_master: !hasMaster
                                })
                                dbNeedsUpdate = true
                            }
                        }
                    }
                } catch {}
            }
        }

        if (dbNeedsUpdate) {
            run(`UPDATE videos SET subtitle_sources = ? WHERE id = ?`, [
                JSON.stringify(sources),
                req.params.videoId
            ])
            videoMeta.subtitleSources = sources
        }

        const langs = listVideoLanguages(
            req.params.videoId,
            videoMeta.subtitleSources,
            videoMeta.courseFolder,
            videoMeta.relModulePath,
            videoMeta.videoBaseName
        )
        res.json({
            ...langs,
            subtitleSources: sources
        })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// GET /api/transcripts/:videoId/chunks
router.get('/:videoId/chunks', (req, res) => {
    try {
        let lang = req.query.lang || 'source'
        const videoMeta = getVideoMeta(req.params.videoId)
        
        if (lang === 'source') {
            const aiSource = videoMeta.subtitleSources?.find(s => s.is_ai_source)
            if (aiSource) lang = aiSource.lang
        }

        const chunks = loadCaptionChunks(
            req.params.videoId,
            lang,
            videoMeta.subtitleSources,
            videoMeta.courseFolder,
            videoMeta.relModulePath,
            videoMeta.videoBaseName
        )

        // custom_metadata fallback removed due to missing column
        res.json(chunks)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// POST /api/transcripts/:videoId/translate
router.post('/:videoId/translate', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const sendEvent = (data) => {
        if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify(data)}\n\n`)
            res.flush?.()
        }
    }

    try {
        const { targetLanguage, sourceLanguage = 'en' } = req.body
        if (!targetLanguage) {
            sendEvent({ error: 'Missing target language' })
            return res.end()
        }

        const videoMeta = getVideoMeta(req.params.videoId)
        
        let actualSourceLang = 'source'
        const aiSource = videoMeta.subtitleSources?.find(s => s.is_ai_source)
        if (aiSource) actualSourceLang = aiSource.lang

        let sourceChunks = loadCaptionChunks(
            req.params.videoId,
            actualSourceLang,
            videoMeta.subtitleSources,
            videoMeta.courseFolder,
            videoMeta.relModulePath,
            videoMeta.videoBaseName
        )

        if (sourceChunks.length === 0) {
        // custom_metadata fallback removed
        }

        if (sourceChunks.length === 0) {
            sendEvent({ error: 'No source captions found to translate' })
            return res.end()
        }

        // Start translation
        const translatedChunks = await translateChunks(
            sourceChunks,
            targetLanguage,
            null, // apiKey unused
            null, // model unused
            sendEvent,
            req,
            sourceLanguage
        )

        // Save translation with origin 'generated' (e.g. 01 - Intro-generated.es.vtt)
        const filePath = saveCaptionFile(videoMeta, targetLanguage, translatedChunks, 'generated')

        const currentSources = videoMeta.subtitleSources.filter(s => !(s.lang === targetLanguage && s.origin === 'generated'))
        currentSources.push({
            lang: targetLanguage,
            filePath,
            origin: 'generated',
            format: 'vtt'
        })

        run(`UPDATE videos SET subtitle_sources = ? WHERE id = ?`, [
            JSON.stringify(currentSources),
            req.params.videoId
        ])

        res.end()
    } catch (err) {
        console.error('Translation error:', err)
        sendEvent({ error: err.message })
        res.end()
    }
})

// GET /api/transcripts/:videoId/text
router.get('/:videoId/text', (req, res) => {
    try {
        const lang = req.query.lang || 'source'
        const videoMeta = getVideoMeta(req.params.videoId)
        let chunks = loadCaptionChunks(
            req.params.videoId,
            lang,
            videoMeta.subtitleSources,
            videoMeta.courseFolder,
            videoMeta.relModulePath,
            videoMeta.videoBaseName
        )

        // custom_metadata fallback removed
        
        res.type('text/plain').send(chunksToText(chunks))
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// GET /api/transcripts/:videoId/download
router.get('/:videoId/download', (req, res) => {
    try {
        const lang = req.query.lang || 'source'
        const format = req.query.format || 'srt'
        const videoMeta = getVideoMeta(req.params.videoId)
        const chunks = loadCaptionChunks(
            req.params.videoId,
            lang,
            videoMeta.subtitleSources,
            videoMeta.courseFolder,
            videoMeta.relModulePath,
            videoMeta.videoBaseName
        )

        if (!chunks.length) return res.status(404).send('Captions not found')

        let content, mimeType, ext
        if (format === 'vtt') {
            content = chunksToVTT(chunks)
            mimeType = 'text/vtt'
            ext = 'vtt'
        } else {
            content = chunksToSRT(chunks)
            mimeType = 'application/x-subrip'
            ext = 'srt'
        }

        const langSuffix = lang === 'source' ? '' : `.${lang}`
        const filename = `${videoMeta.videoBaseName}${langSuffix}.${ext}`

        res.setHeader('Content-disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
        res.setHeader('Content-type', mimeType)
        res.send(content)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// PUT /api/transcripts/:videoId (Save JSON chunks - used by AI generator)
router.put('/:videoId', (req, res) => {
    const { chunks, language } = req.body
    if (!Array.isArray(chunks)) return res.status(400).json({ error: 'Chunks must be an array' })

    try {
        const videoMeta = getVideoMeta(req.params.videoId)
        const genLang = language || req.body.lang || videoMeta.courseLanguage || 'en'
        
        // AI generation is always saved with origin 'generated' and explicit language code
        // e.g. 01 - Intro-generated.en.vtt
        const filePath = saveCaptionFile(videoMeta, genLang, chunks, 'generated')

        const currentSources = videoMeta.subtitleSources.filter(s => !(s.lang === genLang && s.origin === 'generated'))
        const hasMaster = currentSources.some(s => s.lang === genLang && s.is_master)

        currentSources.push({
            lang: genLang,
            filePath,
            origin: 'generated',
            format: 'vtt',
            is_master: !hasMaster
        })

        run(`UPDATE videos SET has_transcript = 1, transcript_generated_at = ?, subtitle_sources = ? WHERE id = ?`, [
            new Date().toISOString(),
            JSON.stringify(currentSources),
            req.params.videoId
        ])
        
        res.json({ success: true, language: genLang })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// POST /api/transcripts/:videoId/set-master
router.post('/:videoId/set-master', (req, res) => {
    const { lang, origin } = req.body
    if (!lang || !origin) return res.status(400).json({ error: 'Missing lang or origin' })

    try {
        const videoMeta = getVideoMeta(req.params.videoId)
        const sources = videoMeta.subtitleSources
        
        // Ensure the source exists
        const targetExists = sources.some(s => s.lang === lang && s.origin === origin)
        if (!targetExists) return res.status(404).json({ error: 'Specified subtitle source not found' })

        // Clear is_master for all sources of this language
        sources.forEach(s => {
            if (s.lang === lang) s.is_master = false
        })

        // Set is_master for the target
        const target = sources.find(s => s.lang === lang && s.origin === origin)
        if (target) target.is_master = true

        run(`UPDATE videos SET subtitle_sources = ? WHERE id = ?`, [
            JSON.stringify(sources),
            req.params.videoId
        ])

        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// POST /api/transcripts/:videoId/make-source
router.post('/:videoId/make-source', (req, res) => {
    const { lang, origin } = req.body
    if (!lang || !origin) return res.status(400).json({ error: 'Missing lang or origin' })

    try {
        const videoMeta = getVideoMeta(req.params.videoId)
        const sources = videoMeta.subtitleSources
        
        // Find the target source
        const target = sources.find(s => s.lang === lang && s.origin === origin)
        if (!target || !target.filePath || !fs.existsSync(target.filePath)) {
            return res.status(404).json({ error: 'Specified subtitle source file not found' })
        }

        // Clear is_ai_source for all tracks
        sources.forEach(s => {
            s.is_ai_source = false
        })

        // Set is_ai_source for the target
        target.is_ai_source = true

        run(`UPDATE videos SET subtitle_sources = ? WHERE id = ?`, [
            JSON.stringify(sources),
            req.params.videoId
        ])

        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// DELETE /api/transcripts/:videoId
router.delete('/:videoId', (req, res) => {
    try {
        const lang = req.query.lang || 'source'
        const videoMeta = getVideoMeta(req.params.videoId)
        
        // Find the source
        const sourceIndex = videoMeta.subtitleSources.findIndex(s => s.lang === lang)
        if (sourceIndex === -1) return res.status(404).json({ error: 'Caption not found' })
        
        const source = videoMeta.subtitleSources[sourceIndex]
        if (source.origin === 'existing') {
            return res.status(403).json({ error: 'Cannot delete pre-existing subtitle files' })
        }

        // Delete the VTT file from the course folder
        if (source.filePath && fs.existsSync(source.filePath)) fs.unlinkSync(source.filePath)

        // Also delete from AppData cache (avoids stale data on next load)
        // Cache naming mirrors getCacheFilePath() in courseAssets.js: <videoId>[.<lang>].json
        try {
            const cacheFile = lang === 'source'
                ? `${req.params.videoId}.json`
                : `${req.params.videoId}.${lang}.json`
            const cachePath = path.join(getDataDir(), 'transcripts', cacheFile)
            if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath)
        } catch { /* non-fatal */ }
        
        videoMeta.subtitleSources.splice(sourceIndex, 1)
        
        const hasTranscript = videoMeta.subtitleSources.length > 0 ? 1 : 0
        const generatedAt = hasTranscript ? new Date().toISOString() : null

        run(`UPDATE videos SET has_transcript = ?, transcript_generated_at = ?, subtitle_sources = ? WHERE id = ?`, [
            hasTranscript,
            generatedAt,
            JSON.stringify(videoMeta.subtitleSources),
            req.params.videoId
        ])
        
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// GET /api/transcripts/:videoId/detect-sibling-captions
router.get('/:videoId/detect-sibling-captions', (req, res) => {
    try {
        const lang = req.query.lang || 'source'
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
                const chunks = parseSubtitleFile(content, fileName)
                if (!chunks || !chunks.length) continue

                const lang = match.lang || 'source'
                const videoMeta = getVideoMeta(match.videoId)
                const filePath = saveCaptionFile(videoMeta, lang, chunks)

                const currentSources = videoMeta.subtitleSources.filter(s => !(s.lang === lang && s.origin === 'uploaded'))
                currentSources.push({
                    lang,
                    filePath,
                    origin: 'uploaded',
                    format: 'vtt'
                })

                run(`UPDATE videos SET has_transcript = 1, subtitle_sources = ? WHERE id = ?`, [
                    JSON.stringify(currentSources),
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
