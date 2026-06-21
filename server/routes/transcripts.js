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
    const courseRecord = getOne('SELECT folder_path FROM courses WHERE id = ?', [video.course_id])

    let relModulePath = ''
    if (moduleRecord && courseRecord && moduleRecord.folder_path && courseRecord.folder_path) {
        relModulePath = path.relative(courseRecord.folder_path, moduleRecord.folder_path)
        if (relModulePath === '.') relModulePath = ''
    }

    return {
        id: video.id,
        courseFolder: courseRecord?.folder_path || null,
        relModulePath,
        videoBaseName: path.basename(video.file_name, path.extname(video.file_name)),
        subtitleSources: JSON.parse(video.subtitle_sources || '[]')
    }
}

// ── Routes ────────────────────────────────────────────────────

// POST /api/transcripts/:videoId/upload
router.post('/:videoId/upload', upload.single('file'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
        
        const fileContent = req.file.buffer.toString('utf8')
        const originalName = req.file.originalname
        const format = detectFormat(originalName) || 'srt'
        
        const videoMeta = getVideoMeta(req.params.videoId)
        
        // Use user-provided lang, or extract from filename, or default to source
        const reqLang = req.body.lang || extractLangCode(originalName, videoMeta.videoBaseName) || 'source'
        
        // Parse the file
        const chunks = parseSubtitleFile(fileContent, originalName)
        if (!chunks.length) return res.status(400).json({ error: 'Could not parse caption file' })

        // Save to Captions\ and AppData cache
        const filePath = saveCaptionFile(videoMeta, reqLang, chunks)

        // Update DB
        const currentSources = videoMeta.subtitleSources.filter(s => !(s.lang === reqLang && s.origin === 'uploaded'))
        currentSources.push({
            lang: reqLang,
            filePath,
            origin: 'uploaded',
            format: 'vtt' // we always convert to VTT internally
        })

        run(`UPDATE videos SET has_transcript = 1, subtitle_sources = ? WHERE id = ?`, [
            JSON.stringify(currentSources),
            req.params.videoId
        ])

        res.json({ success: true, chunkCount: chunks.length, format, language: reqLang })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// GET /api/transcripts/:videoId/languages
router.get('/:videoId/languages', (req, res) => {
    try {
        const videoMeta = getVideoMeta(req.params.videoId)
        const langs = listVideoLanguages(req.params.videoId, videoMeta.subtitleSources)
        res.json(langs)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// GET /api/transcripts/:videoId/chunks
router.get('/:videoId/chunks', (req, res) => {
    try {
        const lang = req.query.lang || 'source'
        const videoMeta = getVideoMeta(req.params.videoId)
        const chunks = loadCaptionChunks(req.params.videoId, lang, videoMeta.subtitleSources)

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
        const { targetLanguage } = req.body
        if (!targetLanguage) {
            sendEvent({ error: 'Missing target language' })
            return res.end()
        }

        const videoMeta = getVideoMeta(req.params.videoId)
        let sourceChunks = loadCaptionChunks(req.params.videoId, 'source', videoMeta.subtitleSources)

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
            req
        )

        // Save translation
        const filePath = saveCaptionFile(videoMeta, targetLanguage, translatedChunks)

        const currentSources = videoMeta.subtitleSources.filter(s => s.lang !== targetLanguage)
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
        let chunks = loadCaptionChunks(req.params.videoId, lang, videoMeta.subtitleSources)

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
        const chunks = loadCaptionChunks(req.params.videoId, lang, videoMeta.subtitleSources)

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
    const { chunks } = req.body
    if (!Array.isArray(chunks)) return res.status(400).json({ error: 'Chunks must be an array' })

    try {
        const videoMeta = getVideoMeta(req.params.videoId)
        
        // AI generation is always 'source' English for now
        const filePath = saveCaptionFile(videoMeta, 'source', chunks)

        const currentSources = videoMeta.subtitleSources.filter(s => !(s.lang === 'source' && s.origin === 'generated'))
        currentSources.push({
            lang: 'source',
            filePath,
            origin: 'generated',
            format: 'vtt'
        })

        run(`UPDATE videos SET has_transcript = 1, transcript_generated_at = ?, subtitle_sources = ? WHERE id = ?`, [
            new Date().toISOString(),
            JSON.stringify(currentSources),
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

export default router
