import express from 'express'
import { getDb, getOne, run, getAll, getDataDir } from '../database.js'
import { submitDubJob, pollJobStatus, cancelJob, isServiceRunning } from '../services/dubbingService.js'
import { getDubsDir, getDubFilePath, loadCaptionChunks, listDubLanguages, getDubFilePathForPlayback } from '../utils/courseAssets.js'
import { stitchCuesIntoSentences } from '../utils/aiTranslation.js'
import fs from 'fs'
import path from 'path'

const router = express.Router()

// Helper to fetch video + path info
function getVideoInfo(videoId) {
    const video = getOne(`
        SELECT v.*, c.folder_path as course_path, m.folder_path as module_path
        FROM videos v
        JOIN courses c ON v.course_id = c.id
        LEFT JOIN modules m ON v.module_id = m.id
        WHERE v.id = ?
    `, [videoId])
    if (!video) throw new Error("Video not found")
    
    // Resolve full video path: check direct video.file_path first
    let videoPath = video.file_path
    const relModPath = (video.course_path && video.file_path)
        ? path.dirname(path.relative(video.course_path, video.file_path)).replace(/\\/g, '/')
        : (video.module_path && video.course_path ? path.relative(video.course_path, video.module_path).replace(/\\/g, '/') : '')
    
    const cleanRelMod = relModPath === '.' ? '' : relModPath
    const videoBaseName = video.file_name ? path.basename(video.file_name, path.extname(video.file_name)) : video.id

    if (!videoPath || !fs.existsSync(videoPath)) {
        if (video.course_path && video.file_name) {
            videoPath = path.join(video.course_path, cleanRelMod, video.file_name)
        }
    }
    
    return { video, coursePath: video.course_path, relModPath: cleanRelMod, videoPath, videoBaseName }
}

// GET /api/dub/service/status
router.get('/service/status', async (req, res) => {
    try {
        const isUp = await isServiceRunning()
        res.json({ running: isUp })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// POST /api/dub/service/start
router.post('/service/start', async (req, res) => {
    try {
        const { ensureServiceRunning } = await import('../services/dubbingService.js')
        const started = await ensureServiceRunning()
        res.json({ started, running: started })
    } catch (err) {
        res.json({ started: false, running: false, error: err.message })
    }
})

// POST /api/dub/video/:videoId
router.post('/video/:videoId', async (req, res) => {
    try {
        const { targetLanguage, voiceReferencePath, device, preserveBackgroundAudio } = req.body
        if (!targetLanguage) return res.status(400).json({ error: 'targetLanguage required' })
        
        const { video, videoPath, coursePath, relModPath, videoBaseName } = getVideoInfo(req.params.videoId)
        
        if (!videoPath || !fs.existsSync(videoPath)) {
            return res.status(400).json({ 
                error: 'Dubbing requires a local video file on disk. YouTube and cloud streaming videos are not supported.' 
            })
        }
        
        // 1. Get captions for target language (respecting primary_transcript if specified)
        const subtitleSources = JSON.parse(video.subtitle_sources || '[]')
        let langToLoad = targetLanguage
        if (video.primary_transcript) {
            const [pLang] = video.primary_transcript.split(':')
            if (pLang === targetLanguage || (targetLanguage === 'source' && pLang === 'source')) {
                langToLoad = video.primary_transcript
            }
        }
        let chunks = loadCaptionChunks(video.id, langToLoad, subtitleSources, coursePath, relModPath, videoBaseName)
        
        // If no target-language captions exist, auto-translate from source before dubbing
        if (!chunks || chunks.length === 0) {
            console.log(`[Dub] No '${targetLanguage}' captions found — auto-translating from source first...`)
            
            // Load source captions (respecting primary_transcript or ai_source or 'source')
            const aiSource = subtitleSources.find(s => s.is_ai_source)
            let actualSourceLang = 'source'
            if (video.primary_transcript) {
                const [pLang] = video.primary_transcript.split(':')
                const isSourcePrim = pLang === 'source' || subtitleSources.some(s => s.lang === pLang && s.is_ai_source)
                if (isSourcePrim) actualSourceLang = video.primary_transcript
            } else if (aiSource?.lang) {
                actualSourceLang = aiSource.lang
            }
            
            const sourceChunks = loadCaptionChunks(video.id, actualSourceLang, subtitleSources, coursePath, relModPath, videoBaseName)
            
            if (!sourceChunks || sourceChunks.length === 0) {
                return res.status(400).json({ 
                    error: `No source captions found for this video. Please transcribe the video first before dubbing.` 
                })
            }

            // Check if source language is the same as target — no translation needed
            const effectiveSource = (actualSourceLang === 'source' ? (aiSource?.lang || 'en') : actualSourceLang).split(':')[0]
            const normalizedSource = effectiveSource.toLowerCase()
            const normalizedTarget = targetLanguage.toLowerCase()

            if (normalizedSource === normalizedTarget) {
                // Same language — use source chunks directly for dubbing
                chunks = sourceChunks
                console.log(`[Dub] Source and target language are the same (${normalizedTarget}), using source captions directly.`)
            } else {
                // Different language — run translation now
                const { translateChunks } = await import('../utils/aiTranslation.js')
                const { saveCaptionFile } = await import('../utils/courseAssets.js')
                
                const courseRecord = getOne('SELECT folder_path FROM courses WHERE id = ?', [video.course_id])
                const courseFolder = courseRecord?.folder_path || null
                
                const translated = await translateChunks(sourceChunks, targetLanguage, null, null, null, null, normalizedSource)
                if (!translated || translated.length === 0) {
                    return res.status(400).json({ error: `Auto-translation to '${targetLanguage}' failed. Please translate the video captions manually first.` })
                }
                
                // Save translated captions so they're available for future dubs too
                try {
                    const videoMeta = {
                        id: video.id,
                        courseFolder,
                        relModulePath: relModPath,
                        videoBaseName
                    }
                    const filePath = saveCaptionFile(videoMeta, targetLanguage, translated, 'generated')
                    
                    const currentSources = subtitleSources.filter(s => !(s.lang === targetLanguage && s.origin === 'generated'))
                    currentSources.push({ lang: targetLanguage, filePath, origin: 'generated', format: 'vtt' })
                    run(`UPDATE videos SET subtitle_sources = ? WHERE id = ?`, [JSON.stringify(currentSources), video.id])
                    console.log(`[Dub] Auto-translated captions saved to ${filePath}`)
                } catch (saveErr) {
                    console.warn('[Dub] Could not save translated captions:', saveErr.message)
                }
                
                chunks = translated
            }
        }
        
        // 2. Resolve device preference from request or settings
        let devicePref = device || null
        if (!devicePref) {
            try {
                const settingsRow = getOne('SELECT value FROM settings WHERE key = ?', ['dubbingDevice'])
                if (settingsRow?.value) devicePref = settingsRow.value
            } catch {}
        }

        // 3. Auto-restore punctuation if cues lack sentence boundaries prior to TTS synthesis
        const { needsPunctuationRestoration, restorePunctuation } = await import('../utils/punctuationService.js')
        if (needsPunctuationRestoration(chunks)) {
            console.log(`[Dub] Dubbing captions lack punctuation. Restoring for '${targetLanguage}'...`)
            try {
                chunks = await restorePunctuation(chunks, targetLanguage)
            } catch (pErr) {
                console.warn(`[Dub] Punctuation restoration warning: ${pErr.message}`)
            }
        }

        // 4. Stitch cues into full sentences for natural TTS prosody & pacing
        const stitchedSegments = stitchCuesIntoSentences(chunks).map(s => ({
            start: s.start,
            end: s.end,
            timestamp: [s.start, s.end],
            text: s.text
        }))
        const dubSegments = stitchedSegments.length > 0 ? stitchedSegments : chunks

        // 4. Submit to python backend
        const jobId = await submitDubJob(
            video.id,
            videoPath,
            dubSegments,
            targetLanguage,
            voiceReferencePath,
            devicePref,
            Boolean(preserveBackgroundAudio)
        )
        
        // 4. Save job to DB
        const now = new Date().toISOString()
        run(`
            INSERT INTO dub_jobs (id, video_id, language, status, created_at)
            VALUES (?, ?, ?, ?, ?)
        `, [jobId, video.id, targetLanguage, 'queued', now])

        // 5. Update video dubbed_tracks to record generating status
        try {
            const existingTracks = JSON.parse(video.dubbed_tracks || '[]')
            const updatedTracks = existingTracks.filter(t => t.language !== targetLanguage)
            updatedTracks.push({
                language: targetLanguage,
                filePath: '',
                generatedAt: now,
                voiceReferenceUsed: voiceReferencePath || 'extracted_voice',
                status: 'generating'
            })
            run(`UPDATE videos SET dubbed_tracks = ? WHERE id = ?`, [JSON.stringify(updatedTracks), video.id])
        } catch (e) {
            console.error('Failed to update video.dubbed_tracks status to generating:', e)
        }
        
        res.json({ jobId })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})


// GET /api/dub/video/:videoId/status
router.get('/video/:videoId/status', async (req, res) => {
    try {
        // Get the most recent job for this video
        const job = getOne(`
            SELECT * FROM dub_jobs 
            WHERE video_id = ? 
            ORDER BY created_at DESC LIMIT 1
        `, [req.params.videoId])
        
        if (!job) return res.json({ status: 'none' })
        
        // If it's running/queued, poll python backend for live progress
        if (job.status === 'queued' || job.status === 'running') {
            try {
                const liveStatus = await pollJobStatus(job.id)
                // Update DB with live status
                run(`
                    UPDATE dub_jobs 
                    SET status = ?, step = ?, progress = ?, audio_path = ?, error_message = ?
                    WHERE id = ?
                `, [liveStatus.status, liveStatus.step, liveStatus.progress, liveStatus.audio_path, liveStatus.error, job.id])
                
                // If just finished, move file to permanent location
                if (liveStatus.status === 'done' && liveStatus.audio_path) {
                    const { coursePath, relModPath, video, videoBaseName } = getVideoInfo(req.params.videoId)
                    
                    let finalPath = null
                    // Save to course folder if local
                    if (coursePath && fs.existsSync(coursePath)) {
                        getDubsDir(coursePath, relModPath)
                        finalPath = getDubFilePath(coursePath, relModPath, videoBaseName, job.language)
                        fs.copyFileSync(liveStatus.audio_path, finalPath)
                        // Clean up stale AppData duplicate
                        try {
                            const staleAppData = path.join(getDataDir(), 'dubs', `${video.id}.${job.language}.mp3`)
                            if (fs.existsSync(staleAppData)) fs.unlinkSync(staleAppData)
                        } catch { }
                    } else {
                        // Cloud course fallback: save to AppData dubs directory
                        const appDataDubsDir = path.join(getDataDir(), 'dubs')
                        if (!fs.existsSync(appDataDubsDir)) fs.mkdirSync(appDataDubsDir, { recursive: true })
                        finalPath = path.join(appDataDubsDir, `${video.id}.${job.language}.mp3`)
                        fs.copyFileSync(liveStatus.audio_path, finalPath)
                    }

                    const completedAt = new Date().toISOString()
                    run(`UPDATE dub_jobs SET completed_at = ?, audio_path = ? WHERE id = ?`, 
                        [completedAt, finalPath, job.id])

                    // Update video dubbed_tracks column
                    try {
                        const existingTracks = JSON.parse(video.dubbed_tracks || '[]')
                        const updatedTracks = existingTracks.filter(t => t.language !== job.language)
                        updatedTracks.push({
                            language: job.language,
                            filePath: finalPath,
                            generatedAt: completedAt,
                            voiceReferenceUsed: 'extracted_voice',
                            status: 'ready'
                        })
                        run(`UPDATE videos SET dubbed_tracks = ? WHERE id = ?`, [JSON.stringify(updatedTracks), video.id])
                    } catch (e) {
                        console.error('Failed to update video.dubbed_tracks on complete:', e)
                    }
                    
                    return res.json({ ...job, status: 'done', progress: 100, step: 'Complete', audio_path: finalPath })
                }
                
                if (liveStatus.status === 'failed') {
                    // Update dubbed_tracks entry to failed
                    try {
                        const { video } = getVideoInfo(req.params.videoId)
                        const existingTracks = JSON.parse(video.dubbed_tracks || '[]')
                        const updatedTracks = existingTracks.map(t => 
                            t.language === job.language ? { ...t, status: 'failed' } : t
                        )
                        run(`UPDATE videos SET dubbed_tracks = ? WHERE id = ?`, [JSON.stringify(updatedTracks), video.id])
                    } catch {}
                }

                return res.json({ ...job, ...liveStatus })
            } catch (err) {
                // Backend might have restarted, mark as failed if not found
                if (err.message === "Job not found") {
                    run(`UPDATE dub_jobs SET status = 'failed', error_message = 'Service disconnected' WHERE id = ?`, [job.id])
                    job.status = 'failed'
                    job.error_message = 'Service disconnected'
                }
            }
        }
        
        res.json(job)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// GET /api/dub/video/:videoId/tracks
router.get('/video/:videoId/tracks', (req, res) => {
    try {
        const video = getOne('SELECT id, dubbed_tracks FROM videos WHERE id = ?', [req.params.videoId])
        if (!video) return res.status(404).json({ error: 'Video not found' })

        let tracks = JSON.parse(video.dubbed_tracks || '[]')
        let dbNeedsUpdate = false

        tracks = tracks.filter(t => {
            if (t.status === 'ready' && t.filePath && !fs.existsSync(t.filePath)) {
                dbNeedsUpdate = true
                return false
            }
            return true
        })

        if (dbNeedsUpdate) {
            run(`UPDATE videos SET dubbed_tracks = ? WHERE id = ?`, [JSON.stringify(tracks), video.id])
        }

        res.json(tracks)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// GET /api/dub/video/:videoId/languages
router.get('/video/:videoId/languages', (req, res) => {
    try {
        const { coursePath, relModPath, videoBaseName, video } = getVideoInfo(req.params.videoId)
        const langs = listDubLanguages(req.params.videoId, coursePath, relModPath, videoBaseName)
        
        // Merge with dub_jobs ready entries
        try {
            const jobs = getAll(`
                SELECT DISTINCT language, audio_path FROM dub_jobs 
                WHERE video_id = ? AND status = 'done'
            `, [req.params.videoId])
            jobs.forEach(j => {
                if (j.language && !langs.includes(j.language) && j.audio_path && fs.existsSync(j.audio_path)) {
                    langs.push(j.language)
                }
            })
        } catch {}

        // Merge with dubbed_tracks from video record
        try {
            const tracks = JSON.parse(video.dubbed_tracks || '[]')
            tracks.filter(t => t.status === 'ready' && t.language).forEach(t => {
                if (!langs.includes(t.language) && t.filePath && fs.existsSync(t.filePath)) {
                    langs.push(t.language)
                }
            })
        } catch {}

        res.json(langs)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// GET /api/dub/audio/:videoId
router.get('/audio/:videoId', (req, res) => {
    try {
        const lang = req.query.lang
        if (!lang) return res.status(400).json({ error: 'lang query parameter required' })
        
        const { coursePath, relModPath, videoBaseName, video } = getVideoInfo(req.params.videoId)
        let dubPath = getDubFilePathForPlayback(req.params.videoId, lang, coursePath, relModPath, videoBaseName)
        
        // 1. Check direct playback path from vault / legacy folder
        if (!dubPath || !fs.existsSync(dubPath)) {
            // 2. Check dub_jobs recorded output path
            const job = getOne(`
                SELECT audio_path FROM dub_jobs 
                WHERE video_id = ? AND language = ? AND status = 'done'
                ORDER BY completed_at DESC LIMIT 1
            `, [req.params.videoId, lang])
            if (job?.audio_path && fs.existsSync(job.audio_path)) {
                dubPath = job.audio_path
            }
        }

        // 3. Check video.dubbed_tracks JSON
        if (!dubPath || !fs.existsSync(dubPath)) {
            try {
                const tracks = JSON.parse(video.dubbed_tracks || '[]')
                const tr = tracks.find(t => t.language === lang && t.status === 'ready' && t.filePath)
                if (tr && fs.existsSync(tr.filePath)) {
                    dubPath = tr.filePath
                }
            } catch {}
        }

        // 4. Check AppData cache fallback
        if (!dubPath || !fs.existsSync(dubPath)) {
            const appDataPath = path.join(getDataDir(), 'dubs', `${req.params.videoId}.${lang}.mp3`)
            if (fs.existsSync(appDataPath)) {
                dubPath = appDataPath
            }
        }

        if (dubPath && fs.existsSync(dubPath)) {
            const stat = fs.statSync(dubPath)
            const fileSize = stat.size
            const range = req.headers.range

            res.setHeader('Accept-Ranges', 'bytes')
            res.setHeader('Content-Type', 'audio/mpeg')
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.setHeader('Access-Control-Allow-Headers', 'Range, Origin, Content-Type, Accept')
            res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges')

            if (range) {
                const parts = range.replace(/bytes=/, '').split('-')
                const start = parseInt(parts[0], 10)
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1

                if (start >= fileSize || end >= fileSize || start > end) {
                    res.writeHead(416, {
                        'Content-Range': `bytes */${fileSize}`,
                    })
                    return res.end()
                }

                const chunkSize = end - start + 1
                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Content-Length': chunkSize,
                    'Content-Type': 'audio/mpeg',
                })

                const stream = fs.createReadStream(dubPath, { start, end })
                stream.on('error', (err) => {
                    console.error('[DubAudio] Stream error:', err)
                    if (!res.headersSent) res.status(500).end()
                })
                return stream.pipe(res)
            } else {
                res.writeHead(200, {
                    'Content-Length': fileSize,
                    'Content-Type': 'audio/mpeg',
                })
                const stream = fs.createReadStream(dubPath)
                stream.on('error', (err) => {
                    console.error('[DubAudio] Stream error:', err)
                    if (!res.headersSent) res.status(500).end()
                })
                return stream.pipe(res)
            }
        }

        res.status(404).json({ error: 'Audio file not found' })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// DELETE /api/dub/video/:videoId
router.delete('/video/:videoId', async (req, res) => {
    try {
        const lang = req.query.lang
        if (!lang) return res.status(400).json({ error: 'lang query parameter required' })
        
        const { coursePath, relModPath, videoBaseName } = getVideoInfo(req.params.videoId)

        const job = getOne(`
            SELECT id, audio_path, status FROM dub_jobs 
            WHERE video_id = ? AND language = ?
            ORDER BY created_at DESC LIMIT 1
        `, [req.params.videoId, lang])
        
        if (job) {
            if (job.status === 'queued' || job.status === 'running') {
                await cancelJob(job.id)
            }
            if (job.audio_path && fs.existsSync(job.audio_path)) {
                try { fs.unlinkSync(job.audio_path) } catch {}
            }
            run(`DELETE FROM dub_jobs WHERE video_id = ? AND language = ?`, [req.params.videoId, lang])
        }

        // Delete from .tutin vault if local
        if (coursePath) {
            const vaultDub = getDubFilePath(coursePath, relModPath, videoBaseName, lang)
            if (vaultDub && fs.existsSync(vaultDub)) {
                try { fs.unlinkSync(vaultDub) } catch {}
            }
        }

        // Also clean legacy AppData cache file
        const cachePath = path.join(getDataDir(), 'dubs', `${req.params.videoId}.${lang}.mp3`)
        if (fs.existsSync(cachePath)) {
            try { fs.unlinkSync(cachePath) } catch {}
        }

        // Update video dubbed_tracks column
        try {
            const video = getOne('SELECT dubbed_tracks FROM videos WHERE id = ?', [req.params.videoId])
            if (video) {
                const existingTracks = JSON.parse(video.dubbed_tracks || '[]')
                const updatedTracks = existingTracks.filter(t => t.language !== lang)
                run(`UPDATE videos SET dubbed_tracks = ? WHERE id = ?`, [JSON.stringify(updatedTracks), req.params.videoId])
            }
        } catch {}
        
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// GET /api/dub/jobs
router.get('/jobs', (req, res) => {
    try {
        const status = req.query.status || 'all'
        let query = `
            SELECT d.*, v.file_name as video_name, c.title as course_name
            FROM dub_jobs d
            JOIN videos v ON d.video_id = v.id
            JOIN courses c ON v.course_id = c.id
        `
        const params = []
        
        if (status !== 'all') {
            query += ` WHERE d.status = ?`
            params.push(status)
        }
        
        query += ` ORDER BY d.created_at DESC`
        
        const jobs = getAll(query, params)
        res.json(jobs)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// GET /api/dub/gpu-info — Proxy to Python backend to get GPU details
router.get('/gpu-info', async (req, res) => {
    try {
        const isUp = await isServiceRunning()
        if (!isUp) {
            return res.json({
                service_running: false,
                gpu_available: false,
                gpu_name: null,
                current_device: 'cpu',
                device_preference: 'auto',
                message: 'Dubbing service is not running. GPU info will be available after the service starts.'
            })
        }
        const healthRes = await fetch('http://127.0.0.1:9475/health')
        if (!healthRes.ok) throw new Error('Python backend returned error')
        const data = await healthRes.json()
        res.json({ service_running: true, ...data })
    } catch (err) {
        res.json({ service_running: false, gpu_available: false, error: err.message })
    }
})

// POST /api/dub/set-device — Set the AI device preference on the Python backend
router.post('/set-device', async (req, res) => {
    try {
        const { device } = req.body
        if (!device) return res.status(400).json({ error: 'device parameter required' })

        const isUp = await isServiceRunning()
        if (!isUp) {
            return res.json({
                success: true,
                preference: device,
                message: 'Preference saved. Will apply when the dubbing service starts.',
                service_running: false
            })
        }

        const pyRes = await fetch('http://127.0.0.1:9475/set-device', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device })
        })
        if (!pyRes.ok) throw new Error('Python backend returned error')
        const data = await pyRes.json()
        res.json({ service_running: true, ...data })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

export default router
