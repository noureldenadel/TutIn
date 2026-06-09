import express from 'express'
import { getDb, getOne, run, getAll } from '../database.js'
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
    
    // Resolve full video path
    const relModPath = video.module_path ? path.relative(video.course_path, video.module_path) : ''
    const videoPath = path.join(video.course_path, relModPath, video.file_name)
    
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
        const { targetLanguage } = req.body
        if (!targetLanguage) return res.status(400).json({ error: 'targetLanguage required' })
        
        const { video, videoPath } = getVideoInfo(req.params.videoId)
        
        // 1. Get captions for target language
        const chunks = loadCaptionChunks(video.id, targetLanguage, video.subtitle_sources)
        if (!chunks || chunks.length === 0) {
            return res.status(400).json({ error: 'Target language captions must be generated before dubbing.' })
        }
        
        // 2. Submit to python backend
        const jobId = await submitDubJob(video.id, videoPath, chunks, targetLanguage)
        
        // 3. Save job to DB
        const now = new Date().toISOString()
        run(`
            INSERT INTO dub_jobs (id, video_id, language, status, created_at)
            VALUES (?, ?, ?, ?, ?)
        `, [jobId, video.id, targetLanguage, 'queued', now])
        
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
                    const dubsDir = getDubsDir(coursePath, relModPath)
                    const finalPath = getDubFilePath(coursePath, relModPath, video.file_name, job.language)
                    
                    fs.copyFileSync(liveStatus.audio_path, finalPath)
                    
                    run(`UPDATE dub_jobs SET completed_at = ?, audio_path = ? WHERE id = ?`, 
                        [new Date().toISOString(), finalPath, job.id])
                    
                    return res.json({ ...job, status: 'done', progress: 100, step: 'Complete', audio_path: finalPath })
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

// GET /api/dub/video/:videoId/languages
router.get('/video/:videoId/languages', (req, res) => {
    try {
        // Look in DB for successful jobs
        const completed = getAll(`
            SELECT language, audio_path FROM dub_jobs 
            WHERE video_id = ? AND status = 'done'
        `, [req.params.videoId])
        
        res.json(completed.map(c => c.language))
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// GET /api/dub/audio/:videoId
router.get('/audio/:videoId', (req, res) => {
    try {
        const lang = req.query.lang
        if (!lang) return res.status(400).json({ error: 'lang query parameter required' })
        
        const job = getOne(`
            SELECT audio_path FROM dub_jobs 
            WHERE video_id = ? AND language = ? AND status = 'done'
            ORDER BY created_at DESC LIMIT 1
        `, [req.params.videoId, lang])
        
        if (!job || !job.audio_path || !fs.existsSync(job.audio_path)) {
            return res.status(404).json({ error: 'Audio file not found' })
        }
        
        res.sendFile(job.audio_path)
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
        
        if (!job) return res.json({ success: true })
        
        if (job.status === 'queued' || job.status === 'running') {
            await cancelJob(job.id)
        }
        
        if (job.audio_path && fs.existsSync(job.audio_path)) {
            fs.unlinkSync(job.audio_path)
        }
        
        run(`DELETE FROM dub_jobs WHERE video_id = ? AND language = ?`, [req.params.videoId, lang])
        
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
