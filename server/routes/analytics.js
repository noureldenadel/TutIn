import express from 'express'
import { getAll, getOne, run, transaction } from '../database.js'

const router = express.Router()

// GET /api/analytics
router.get('/', (req, res) => {
    try {
        const stats = getAll('SELECT * FROM analytics ORDER BY date DESC')
        for (const stat of stats) {
            stat.courses_accessed = JSON.parse(stat.courses_accessed || '[]')
        }
        res.json(stats)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// POST /api/analytics/session
router.post('/session', (req, res) => {
    const data = req.body
    if (!data.id || !data.videoId || !data.courseId || !data.startedAt) {
        return res.status(400).json({ error: 'Missing required fields' })
    }

    try {
        transaction(() => {
            // 1. Insert the watch session
            run(`
                INSERT INTO watch_sessions (
                    id, video_id, course_id, started_at, ended_at,
                    duration_seconds, start_position, end_position
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                data.id, data.videoId, data.courseId, data.startedAt,
                data.endedAt || null, data.durationSeconds || 0,
                data.startPosition || 0, data.endPosition || 0
            ])

            // 2. Update daily analytics
            const date = data.startedAt.split('T')[0] // YYYY-MM-DD
            const duration = data.durationSeconds || 0

            // Get existing or create new
            const existing = getOne('SELECT * FROM analytics WHERE date = ?', [date])
            
            if (existing) {
                const courses = JSON.parse(existing.courses_accessed || '[]')
                if (!courses.includes(data.courseId)) {
                    courses.push(data.courseId)
                }
                
                run(`
                    UPDATE analytics SET 
                        watch_time_seconds = watch_time_seconds + ?,
                        sessions_count = sessions_count + 1,
                        courses_accessed = ?
                    WHERE date = ?
                `, [duration, JSON.stringify(courses), date])
            } else {
                run(`
                    INSERT INTO analytics (
                        id, date, watch_time_seconds, videos_watched, 
                        videos_completed, courses_accessed, sessions_count
                    ) VALUES (?, ?, ?, 0, 0, ?, 1)
                `, [
                    `stat_${date}`, date, duration, 
                    JSON.stringify([data.courseId])
                ])
            }
        })
        
        res.status(201).json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// GET /api/analytics/history
// Get recently watched videos
router.get('/history', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20
        // Join with videos and courses to get rich history
        const videoHistory = getAll(`
            SELECT 
                v.id, v.title, v.duration, v.watch_progress, v.last_watched_position, v.last_watched_at,
                c.id as course_id, c.title as course_title, c.thumbnail_data as course_thumbnail,
                c.instructor as course_instructor, c.source_type as course_source_type, c.course_url,
                m.id as module_id, m.title as module_title
            FROM videos v
            JOIN courses c ON v.course_id = c.id
            LEFT JOIN modules m ON v.module_id = m.id
            WHERE v.last_watched_at IS NOT NULL
        `)
        
        const externalHistory = getAll(`
            SELECT 
                id as course_id, title as course_title, thumbnail_data as course_thumbnail,
                instructor as course_instructor, source_type as course_source_type, course_url,
                last_accessed_click_time
            FROM courses
            WHERE (source_type = 'external-link' OR course_url IS NOT NULL) 
            AND last_accessed_click_time IS NOT NULL
        `)

        const combined = []

        for (const item of videoHistory) {
            combined.push({
                video: {
                    id: item.id,
                    title: item.title,
                    duration: item.duration,
                    watchProgress: item.watch_progress,
                    lastWatchedPosition: item.last_watched_position,
                    lastWatchedAt: item.last_watched_at,
                },
                course: {
                    id: item.course_id,
                    title: item.course_title,
                    thumbnailData: item.course_thumbnail,
                    instructor: item.course_instructor,
                    sourceType: item.course_source_type,
                    courseUrl: item.course_url,
                },
                module: {
                    id: item.module_id,
                    title: item.module_title,
                },
                _sortTime: new Date(item.last_watched_at).getTime()
            })
        }

        for (const item of externalHistory) {
            combined.push({
                video: {
                    id: item.course_id + '_ext_mock',
                    title: item.course_title,
                    duration: 0,
                    watchProgress: 1,
                    lastWatchedPosition: 0,
                    lastWatchedAt: item.last_accessed_click_time,
                },
                course: {
                    id: item.course_id,
                    title: item.course_title,
                    thumbnailData: item.course_thumbnail,
                    instructor: item.course_instructor,
                    sourceType: item.course_source_type,
                    courseUrl: item.course_url,
                },
                module: null,
                _sortTime: new Date(item.last_accessed_click_time).getTime()
            })
        }

        // Sort descending by time
        combined.sort((a, b) => b._sortTime - a._sortTime)

        const mappedHistory = combined.slice(0, limit).map(({ _sortTime, ...rest }) => rest)
        
        res.json(mappedHistory)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

export default router
