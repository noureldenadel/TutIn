import express from 'express'
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { getAll, getOne, run, transaction } from '../database.js'
import { recalculateCourseProgress } from './courses.js'
import { getFfmpegPath } from '../utils/ffmpeg.js'

const router = express.Router()

/**
 * Map a raw SQLite video row (snake_case) to a camelCase API response object.
 */
function mapVideoRow(video) {
    return {
        id: video.id,
        courseId: video.course_id,
        moduleId: video.module_id,
        title: video.title,
        originalTitle: video.original_title,
        description: video.description,
        fileName: video.file_name,
        filePath: video.file_path,
        fileSize: video.file_size,
        duration: video.duration,
        thumbnailData: video.thumbnail_data,
        order: video.order,
        isRequired: video.is_required === 1,
        isCompleted: video.is_completed === 1,
        isFavorite: video.is_favorite === 1,
        watchProgress: video.watch_progress,
        lastWatchedPosition: video.last_watched_position,
        lastWatchedAt: video.last_watched_at,
        completedAt: video.completed_at,
        watchCount: video.watch_count,
        tags: JSON.parse(video.tags || '[]'),
        bookmarks: JSON.parse(video.bookmarks || '[]'),
        youtubeId: video.youtube_id,
        url: video.url,
        hasTranscript: video.has_transcript === 1,
        hasSummary: video.has_summary === 1,
        primaryTranscript: video.primary_transcript,
        subtitleSources: JSON.parse(video.subtitle_sources || '[]').filter(s => !s.filePath || fs.existsSync(s.filePath)),
        dubbedTracks: JSON.parse(video.dubbed_tracks || '[]').filter(t => t.filePath && fs.existsSync(t.filePath))
    }
}

// GET /api/videos/:id/audio-16k - Stream 16kHz mono WAV for Whisper AI without downloading gigabytes of video
router.get('/:id/audio-16k', (req, res) => {
    try {
        const video = getOne('SELECT * FROM videos WHERE id = ?', [req.params.id])
        if (!video) return res.status(404).json({ error: 'Video not found' })

        let filePath = video.file_path
        if (!filePath || !fs.existsSync(filePath)) {
            if (video.course_id && video.file_name) {
                const course = getOne('SELECT folder_path FROM courses WHERE id = ?', [video.course_id])
                if (course && course.folder_path) {
                    let relMod = ''
                    if (video.module_id) {
                        const mod = getOne('SELECT folder_path FROM modules WHERE id = ?', [video.module_id])
                        if (mod && mod.folder_path) {
                            relMod = path.relative(course.folder_path, mod.folder_path)
                        }
                    }
                    const candidate = path.join(course.folder_path, relMod, video.file_name)
                    if (fs.existsSync(candidate)) {
                        filePath = candidate
                    }
                }
            }
        }

        if (!filePath || !fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Video source file not found on disk' })
        }

        const ffmpegPath = getFfmpegPath()
        res.setHeader('Content-Type', 'audio/wav')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Access-Control-Allow-Origin', '*')

        const ffmpegArgs = [
            '-loglevel', 'error',
            '-i', filePath,
            '-vn',
            '-acodec', 'pcm_s16le',
            '-ar', '16000',
            '-ac', '1',
            '-f', 'wav',
            'pipe:1'
        ]

        const proc = spawn(ffmpegPath, ffmpegArgs, { stdio: ['ignore', 'pipe', 'pipe'] })

        proc.stdout.pipe(res)

        proc.stderr.on('data', (data) => {
            console.error(`[AudioStream 16k] FFmpeg error: ${data.toString()}`)
        })

        proc.on('error', (err) => {
            console.error(`[AudioStream 16k] Failed to spawn FFmpeg: ${err.message}`)
            if (!res.headersSent) res.status(500).json({ error: 'Audio extraction failed' })
        })

        res.on('close', () => {
            if (!proc.killed) {
                try {
                    proc.kill()
                } catch {
                    // Ignored
                }
            }
        })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// GET /api/videos/by-course/:courseId
router.get('/by-course/:courseId', (req, res) => {
    try {
        const videos = getAll('SELECT * FROM videos WHERE course_id = ? ORDER BY "order" ASC', [req.params.courseId])
        res.json(videos.map(mapVideoRow))
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// GET /api/videos/by-module/:moduleId
router.get('/by-module/:moduleId', (req, res) => {
    try {
        const videos = getAll('SELECT * FROM videos WHERE module_id = ? ORDER BY "order" ASC', [req.params.moduleId])
        res.json(videos.map(mapVideoRow))
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// POST /api/videos
router.post('/', (req, res) => {
    const data = req.body
    if (!data.id || !data.courseId || !data.moduleId || !data.title) {
        return res.status(400).json({ error: 'Missing required fields' })
    }

    try {
        run(`
            INSERT INTO videos (
                id, course_id, module_id, title, original_title, description,
                file_name, file_path, file_size, duration, thumbnail_data,
                "order", is_required, is_completed, is_favorite, watch_progress,
                last_watched_position, tags, bookmarks, youtube_id, url,
                subtitle_sources, dubbed_tracks, has_transcript, has_summary
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            data.id, data.courseId, data.moduleId, data.title, data.originalTitle || null,
            data.description || '', data.fileName || '', data.filePath || null,
            data.fileSize || 0, data.duration || 0, data.thumbnailData || null,
            data.order || 0, data.isRequired !== false ? 1 : 0,
            data.isCompleted ? 1 : 0, data.isFavorite ? 1 : 0,
            data.watchProgress || 0, data.lastWatchedPosition || 0,
            JSON.stringify(data.tags || []), JSON.stringify(data.bookmarks || []),
            data.youtubeId || null, data.url || null,
            JSON.stringify(data.subtitleSources || []), JSON.stringify(data.dubbedTracks || []),
            data.hasTranscript ? 1 : 0, data.hasSummary ? 1 : 0
        ])
        recalculateCourseProgress(data.courseId)
        res.status(201).json({ success: true, id: data.id })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// GET /api/videos/:id
router.get('/:id', (req, res) => {
    try {
        const video = getOne('SELECT * FROM videos WHERE id = ?', [req.params.id])
        if (!video) return res.status(404).json({ error: 'Video not found' })

        res.json(mapVideoRow(video))
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// PUT /api/videos/:id
router.put('/:id', (req, res) => {
    const id = req.params.id
    const data = req.body

    try {
        const video = getOne('SELECT * FROM videos WHERE id = ?', [id])
        if (!video) return res.status(404).json({ error: 'Video not found' })

        const updateFields = []
        const params = []

        const fieldMap = {
            title: 'title',
            originalTitle: 'original_title',
            description: 'description',
            fileName: 'file_name',
            filePath: 'file_path',
            duration: 'duration',
            thumbnailData: 'thumbnail_data',
            order: '"order"',
            moduleId: 'module_id',
            isRequired: 'is_required',
            isCompleted: 'is_completed',
            isFavorite: 'is_favorite',
            watchProgress: 'watch_progress',
            lastWatchedPosition: 'last_watched_position',
            lastWatchedAt: 'last_watched_at',
            completedAt: 'completed_at',
            watchCount: 'watch_count',
            youtubeId: 'youtube_id',
            url: 'url',
            primaryTranscript: 'primary_transcript',
            hasTranscript: 'has_transcript',
            hasSummary: 'has_summary'
        }

        for (const [key, dbField] of Object.entries(fieldMap)) {
            if (data[key] !== undefined) {
                updateFields.push(`${dbField} = ?`)
                // Handle booleans
                let val = data[key]
                if (typeof val === 'boolean') val = val ? 1 : 0
                params.push(val)
            }
        }

        if (data.tags !== undefined) {
            updateFields.push('tags = ?')
            params.push(JSON.stringify(data.tags))
        }

        if (data.bookmarks !== undefined) {
            updateFields.push('bookmarks = ?')
            params.push(JSON.stringify(data.bookmarks))
        }

        if (data.subtitleSources !== undefined) {
            updateFields.push('subtitle_sources = ?')
            params.push(JSON.stringify(data.subtitleSources))
        }

        if (data.dubbedTracks !== undefined) {
            updateFields.push('dubbed_tracks = ?')
            params.push(JSON.stringify(data.dubbedTracks))
        }

        if (updateFields.length === 0) {
            return res.json({ success: true, message: 'No fields to update' })
        }

        params.push(id)
        run(`UPDATE videos SET ${updateFields.join(', ')} WHERE id = ?`, params)

        if (data.duration !== undefined || data.isCompleted !== undefined) {
            recalculateCourseProgress(video.course_id)
        }

        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// PUT /api/videos/:id/progress
// Update playback resume position and conditionally commit watch history + course last_accessed
router.put('/:id/progress', (req, res) => {
    const { watchProgress, lastWatchedPosition, recordHistory, recordPosition } = req.body ?? {}
    const safeProgress = Math.min(1, Math.max(0, Number(watchProgress) || 0))
    const safePosition = Math.max(0, Number(lastWatchedPosition) || 0)
    try {
        const existing = getOne(
            'SELECT course_id, last_watched_at FROM videos WHERE id = ?',
            [req.params.id]
        )
        if (!existing) {
            return res.status(404).json({ error: 'Video not found' })
        }

        const shouldUpdatePosition = recordPosition !== false
        const shouldRecordHistory =
            recordHistory === true || (recordHistory === undefined && Boolean(existing.last_watched_at))
        const now = new Date().toISOString()

        if (shouldUpdatePosition && shouldRecordHistory) {
            run(`
                UPDATE videos 
                SET watch_progress = ?, last_watched_position = ?, last_watched_at = ?
                WHERE id = ?
            `, [safeProgress, safePosition, now, req.params.id])
        } else if (shouldUpdatePosition) {
            run(`
                UPDATE videos 
                SET watch_progress = ?, last_watched_position = ?
                WHERE id = ?
            `, [safeProgress, safePosition, req.params.id])
        } else if (shouldRecordHistory) {
            run(`
                UPDATE videos 
                SET last_watched_at = ?
                WHERE id = ?
            `, [now, req.params.id])
        }

        if (shouldRecordHistory && existing.course_id) {
            run(
                'UPDATE courses SET last_accessed = ? WHERE id = ?',
                [now, existing.course_id]
            )
        }

        res.json({
            success: true,
            recordedHistory: shouldRecordHistory,
            lastWatchedAt: shouldRecordHistory ? now : existing.last_watched_at,
        })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// POST /api/videos/:id/complete
router.post('/:id/complete', (req, res) => {
    const { isCompleted, mode } = req.body
    try {
        const video = getOne('SELECT course_id FROM videos WHERE id = ?', [req.params.id])
        if (!video) return res.status(404).json({ error: 'Video not found' })

        const completedAt = isCompleted ? new Date().toISOString() : null
        run(`
            UPDATE videos 
            SET is_completed = ?, completed_at = ?
            WHERE id = ?
        `, [isCompleted ? 1 : 0, completedAt, req.params.id])

        // Recalculate course progress using the unified function
        const { completedVideos, totalVideos, totalDuration, completionPercentage } = recalculateCourseProgress(video.course_id, mode || null)

        res.json({ success: true, completedVideos, totalVideos, totalDuration, completionPercentage })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// POST /api/videos/:id/favorite
router.post('/:id/favorite', (req, res) => {
    const { isFavorite } = req.body
    try {
        run('UPDATE videos SET is_favorite = ? WHERE id = ?', [isFavorite ? 1 : 0, req.params.id])
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// DELETE /api/videos/:id
router.delete('/:id', (req, res) => {
    try {
        const video = getOne('SELECT course_id FROM videos WHERE id = ?', [req.params.id])
        run('DELETE FROM videos WHERE id = ?', [req.params.id])
        if (video?.course_id) {
            recalculateCourseProgress(video.course_id)
        }
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

export default router
