import express from 'express'
import { getDb, getOne, run, getAll, getDataDir } from '../database.js'
import { submitDubJob, pollJobStatus, cancelJob, isServiceRunning } from '../services/dubbingService.js'
import { getDubsDir, getDubFilePath, loadCaptionChunks } from '../utils/courseAssets.js'
import fs from 'fs'
import path from 'path'

const router = express.Router()

// Helper to fetch video + path info
function getVideoInfo(videoId) {
    const video = getOne(`
        SELECT v.*, c.file_path as course_path, m.file_path as module_path
        FROM videos v
        JOIN courses c ON v.course_id = c.id
        LEFT JOIN modules m ON v.module_id = m.id
        WHERE v.id = ?
    `, [videoId])
    if (!video) throw new Error("Video not found")
    
    // Resolve full video path: check direct video.file_path first
    let videoPath = video.file_path
    const relModPath = video.module_path ? path.relative(video.course_path, video.module_path) : ''
    
    if (!videoPath || !fs.existsSync(videoPath)) {
        if (video.course_path && video.file_name) {
            videoPath = path.join(video.course_path, relModPath, video.file_name)
        }
    }
    
    return { video, coursePath: video.course_path, relModPath, videoPath }
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
        const { targetLanguage, voiceReferencePath } = req.body
        if (!targetLanguage) return res.status(400).json({ error: 'targetLanguage required' })
        
        const { video, videoPath } = getVideoInfo(req.params.videoId)
        
        // 1. Get captions for target language
        const subtitleSources = JSON.parse(video.subtitle_sources || '[]')
        const chunks = loadCaptionChunks(video.id, targetLanguage, subtitleSources)
        if (!chunks || chunks.length === 0) {
            return res.status(400).json({ error: `Captions for language '${targetLanguage}' must be generated/translated before dubbing.` })
        }
        
        // 2. Submit to python backend
        const jobId = await submitDubJob(video.id, videoPath, chunks, targetLanguage, voiceReferencePath)
        
        // 3. Save job to DB
        const now = new Date().toISOString()
        run(`
            INSERT INTO dub_jobs (id, video_id, language, status, created_at)
            VALUES (?, ?, ?, ?, ?)
        `, [jobId, video.id, targetLanguage, 'queued', now])

        // 4. Update video dubbed_tracks to record generating status
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
                    const { coursePath, relModPath, video } = getVideoInfo(req.params.videoId)
                    
                    let finalPath = null
                    // Save to course folder if available
                    if (coursePath && fs.existsSync(coursePath)) {
                        const dubsDir = getDubsDir(coursePath, relModPath)
                        finalPath = getDubFilePath(coursePath, relModPath, video.file_name || video.id, job.language)
                        fs.copyFileSync(liveStatus.audio_path, finalPath)
                    }

                    // Also save to AppData dubs directory as cache
                    const appDataDubsDir = path.join(getDataDir(), 'dubs')
                    if (!fs.existsSync(appDataDubsDir)) fs.mkdirSync(appDataDubsDir, { recursive: true })
                    const cachePath = path.join(appDataDubsDir, `${video.id}.${job.language}.mp3`)
                    fs.copyFileSync(liveStatus.audio_path, cachePath)

                    if (!finalPath) finalPath = cachePath

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
        const video = getOne('SELECT dubbed_tracks FROM videos WHERE id = ?', [req.params.videoId])
        if (!video) return res.status(404).json({ error: 'Video not found' })

        const tracks = JSON.parse(video.dubbed_tracks || '[]')
        res.json(tracks)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// GET /api/dub/video/:videoId/languages
router.get('/video/:videoId/languages', (req, res) => {
    try {
        // Look in DB for successful jobs
        const completed = getAll(`
            SELECT language, audio_path FROM dub_jobs 
            WHERE video_id = ? AND status = 'done'
        `, [req.params.videoId])
        
        const langs = new Set(completed.map(c => c.language))

        // Also check videos.dubbed_tracks
        const video = getOne('SELECT dubbed_tracks FROM videos WHERE id = ?', [req.params.videoId])
        if (video && video.dubbed_tracks) {
            try {
                const tracks = JSON.parse(video.dubbed_tracks)
                tracks.filter(t => t.status === 'ready').forEach(t => langs.add(t.language))
            } catch {}
        }
        
        res.json(Array.from(langs))
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// GET /api/dub/audio/:videoId
router.get('/audio/:videoId', (req, res) => {
    try {
        const lang = req.query.lang
        if (!lang) return res.status(400).json({ error: 'lang query parameter required' })
        
        // 1. Try dub_jobs table
        const job = getOne(`
            SELECT audio_path FROM dub_jobs 
            WHERE video_id = ? AND language = ? AND status = 'done'
            ORDER BY created_at DESC LIMIT 1
        `, [req.params.videoId, lang])
        
        if (job && job.audio_path && fs.existsSync(job.audio_path)) {
            return res.sendFile(job.audio_path)
        }

        // 2. Try AppData cache directory
        const cachePath = path.join(getDataDir(), 'dubs', `${req.params.videoId}.${lang}.mp3`)
        if (fs.existsSync(cachePath)) {
            return res.sendFile(cachePath)
        }

        // 3. Try course Dubs directory
        try {
            const { coursePath, relModPath, video } = getVideoInfo(req.params.videoId)
            if (coursePath) {
                const dubPath = getDubFilePath(coursePath, relModPath, video.file_name || video.id, lang)
                if (fs.existsSync(dubPath)) {
                    return res.sendFile(dubPath)
                }
            }
        } catch {}

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

        // Also clean cache file
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

export default router
