import express from 'express'
import path from 'path'
import { YoutubeTranscript } from 'youtube-transcript'
import { getOne, run } from '../database.js'
import {
    saveCaptionFile,
    normalizeSubtitleSources,
    buildTrackId
} from '../utils/courseAssets.js'
import { normalizeCuesIntoClauses } from '../utils/aiTranslation.js'

const router = express.Router()

router.get('/transcript', async (req, res) => {
    try {
        const { videoId, dbVideoId, lang } = req.query

        if (!videoId) {
            return res.status(400).json({ error: 'videoId is required' })
        }

        let transcriptList
        try {
            if (lang && lang !== 'none' && lang !== 'source') {
                transcriptList = await YoutubeTranscript.fetchTranscript(videoId, { lang })
            } else {
                transcriptList = await YoutubeTranscript.fetchTranscript(videoId)
            }
        } catch (fetchErr) {
            console.error('[YouTube API] Failed to fetch transcript:', fetchErr.message)
            return res.status(404).json({ error: 'Transcript not available for this YouTube video or language' })
        }

        const rawChunks = transcriptList.map(item => ({
            text: item.text,
            start: item.offset / 1000,
            end: (item.offset + item.duration) / 1000,
            timestamp: [
                item.offset / 1000,
                (item.offset + item.duration) / 1000
            ]
        }))

        const targetLang = (lang && lang !== 'none' && lang !== 'source' ? String(lang) : 'en').toLowerCase().trim()
        const chunks = normalizeCuesIntoClauses(rawChunks, targetLang)

        // If dbVideoId is provided, persist the fetched YouTube captions into subtitle_sources as 'uploaded'
        let savedTrack = null
        if (dbVideoId && chunks.length > 0) {
            try {
                const video = getOne('SELECT * FROM videos WHERE id = ?', [String(dbVideoId)])
                if (video) {
                    const courseRecord = video.course_id
                        ? getOne('SELECT folder_path, language FROM courses WHERE id = ?', [video.course_id])
                        : null
                    const courseLang = (courseRecord?.language || 'en').toLowerCase().trim()
                    const effectiveLang = (lang && lang !== 'none' && lang !== 'source') ? targetLang : courseLang
                    const videoBaseName = video.file_name
                        ? path.basename(video.file_name, path.extname(video.file_name))
                        : video.id

                    const videoMeta = {
                        id: video.id,
                        courseFolder: courseRecord?.folder_path || null,
                        relModulePath: '',
                        videoBaseName
                    }

                    const filePath = saveCaptionFile(videoMeta, effectiveLang, chunks, 'uploaded', 1)
                    const trackId = buildTrackId(effectiveLang, 'uploaded', 1)
                    const existingSources = JSON.parse(video.subtitle_sources || '[]').filter(s => s.id !== trackId)

                    const newTrack = {
                        id: trackId,
                        lang: effectiveLang,
                        origin: 'uploaded',
                        version: 1,
                        label: 'Uploaded',
                        fileName: `${videoId}.${effectiveLang}.vtt`,
                        filePath,
                        format: 'vtt',
                        is_master: true,
                        is_ai_source: false
                    }
                    existingSources.forEach(s => {
                        if (s.lang === effectiveLang) s.is_master = false
                    })
                    existingSources.push(newTrack)

                    const finalSources = normalizeSubtitleSources(existingSources, courseLang)
                    run(`UPDATE videos SET has_transcript = 1, subtitle_sources = ? WHERE id = ?`, [
                        JSON.stringify(finalSources),
                        video.id
                    ])
                    savedTrack = finalSources.find(s => s.id === trackId) || newTrack
                }
            } catch (saveErr) {
                console.warn('[YouTube API] Could not persist YouTube captions:', saveErr.message)
            }
        }

        res.json({ chunks, lang: targetLang, track: savedTrack })
    } catch (err) {
        console.error('[YouTube API] Route error:', err)
        res.status(500).json({ error: err.message })
    }
})

export default router
