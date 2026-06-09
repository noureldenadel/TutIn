import express from 'express'
import { getAll, getOne, run, transaction } from '../database.js'

const router = express.Router()

// GET /api/videos/by-course/:courseId
router.get('/by-course/:courseId', (req, res) => {
    try {
        const videos = getAll('SELECT * FROM videos WHERE course_id = ? ORDER BY "order" ASC', [req.params.courseId])
        const mappedVideos = videos.map(video => ({
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
            url: video.url
        }))
        res.json(mappedVideos)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// GET /api/videos/by-module/:moduleId
router.get('/by-module/:moduleId', (req, res) => {
    try {
        const videos = getAll('SELECT * FROM videos WHERE module_id = ? ORDER BY "order" ASC', [req.params.moduleId])
        const mappedVideos = videos.map(video => ({
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
            url: video.url
        }))
        res.json(mappedVideos)
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
                last_watched_position, tags, bookmarks, youtube_id, url
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            data.id, data.courseId, data.moduleId, data.title, data.originalTitle || null,
            data.description || '', data.fileName || '', data.filePath || null,
            data.fileSize || 0, data.duration || 0, data.thumbnailData || null,
            data.order || 0, data.isRequired !== false ? 1 : 0,
            data.isCompleted ? 1 : 0, data.isFavorite ? 1 : 0,
            data.watchProgress || 0, data.lastWatchedPosition || 0,
            JSON.stringify(data.tags || []), JSON.stringify(data.bookmarks || []),
            data.youtubeId || null, data.url || null
        ])
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

        res.json({
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
            url: video.url
        })
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
            url: 'url'
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

        if (updateFields.length === 0) {
            return res.json({ success: true, message: 'No fields to update' })
        }

        params.push(id)
        run(`UPDATE videos SET ${updateFields.join(', ')} WHERE id = ?`, params)

        // If completion status changed, we might need to update the course completion percentage
        // In a full app, we'd fire an event or recalculate here, but frontend usually handles this
        // or we can add a specific endpoint for recalculating course progress

        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// PUT /api/videos/:id/progress
router.put('/:id/progress', (req, res) => {
    const { watchProgress, lastWatchedPosition } = req.body
    try {
        run(`
            UPDATE videos 
            SET watch_progress = ?, last_watched_position = ?, last_watched_at = ?
            WHERE id = ?
        `, [watchProgress || 0, lastWatchedPosition || 0, new Date().toISOString(), req.params.id])
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// POST /api/videos/:id/complete
router.post('/:id/complete', (req, res) => {
    const { isCompleted } = req.body
    try {
        const video = getOne('SELECT course_id FROM videos WHERE id = ?', [req.params.id])
        if (!video) return res.status(404).json({ error: 'Video not found' })

        const completedAt = isCompleted ? new Date().toISOString() : null
        run(`
            UPDATE videos 
            SET is_completed = ?, completed_at = ?
            WHERE id = ?
        `, [isCompleted ? 1 : 0, completedAt, req.params.id])

        // Recalculate course progress
        const allVideos = getAll('SELECT is_completed FROM videos WHERE course_id = ?', [video.course_id])
        const totalVideos = allVideos.length
        const completedVideos = allVideos.filter(v => v.is_completed === 1).length
        const completionPercentage = totalVideos > 0 ? (completedVideos / totalVideos) * 100 : 0
        run(`
            UPDATE courses SET completed_videos = ?, completion_percentage = ? WHERE id = ?
        `, [completedVideos, completionPercentage, video.course_id])

        res.json({ success: true, completedVideos, totalVideos, completionPercentage })
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
        run('DELETE FROM videos WHERE id = ?', [req.params.id])
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

export default router
