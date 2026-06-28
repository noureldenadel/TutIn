import express from 'express'
import { getAll, getOne, run, transaction } from '../database.js'

const router = express.Router()

/**
 * Map a raw SQLite course row (snake_case) to a camelCase API response object.
 */
function mapCourseRow(course) {
    return {
        id: course.id,
        title: course.title,
        originalTitle: course.original_title,
        description: course.description,
        instructor: course.instructor,
        tags: JSON.parse(course.tags || '[]'),
        thumbnailData: course.thumbnail_data,
        folderPath: course.folder_path,
        sourceType: course.source_type,
        courseUrl: course.course_url,
        dateAdded: course.date_added,
        dateModified: course.date_modified,
        lastAccessed: course.last_accessed,
        lastAccessedClickTime: course.last_accessed_click_time,
        totalDuration: course.total_duration,
        totalVideos: course.total_videos,
        completedVideos: course.completed_videos,
        completionPercentage: course.completion_percentage,
        customMetadata: JSON.parse(course.custom_metadata || '{}'),
        order: course.order
    }
}

// GET /api/courses
router.get('/', (req, res) => {
    try {
        let query = 'SELECT * FROM courses'
        const params = []

        if (req.query.instructor) {
            query += ' WHERE LOWER(instructor) = LOWER(?)'
            params.push(req.query.instructor.trim())
        }

        query += ' ORDER BY "order" ASC, last_accessed DESC'

        const courses = getAll(query, params)
        res.json(courses.map(mapCourseRow))
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// GET /api/courses/:id
router.get('/:id', (req, res) => {
    try {
        const course = getOne('SELECT * FROM courses WHERE id = ?', [req.params.id])
        if (!course) return res.status(404).json({ error: 'Course not found' })

        res.json(mapCourseRow(course))
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// POST /api/courses
router.post('/', (req, res) => {
    const data = req.body
    if (!data.id || !data.title) {
        return res.status(400).json({ error: 'Missing required fields' })
    }

    try {
        const now = new Date().toISOString()
        run(`
            INSERT INTO courses (
                id, title, original_title, description, instructor, tags,
                thumbnail_data, folder_path, source_type, course_url,
                date_added, date_modified, last_accessed, last_accessed_click_time,
                total_duration, total_videos, completed_videos, completion_percentage,
                custom_metadata, "order"
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            data.id, data.title, data.originalTitle || null, data.description || '', data.instructor || '',
            JSON.stringify(data.tags || []), data.thumbnailData || null, data.folderPath || null,
            data.sourceType || 'local', data.courseUrl || null, data.dateAdded || now, data.dateModified || now,
            data.lastAccessed || now, data.lastAccessedClickTime || now, data.totalDuration || 0,
            data.totalVideos || 0, data.completedVideos || 0, data.completionPercentage || 0,
            JSON.stringify(data.customMetadata || {}), data.order || 0
        ])
        res.status(201).json({ success: true, id: data.id })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// POST /api/courses/recalculate-progress — MUST be before PUT /:id
router.post('/recalculate-progress', (req, res) => {
    const { mode } = req.body // 'videos' | 'duration'

    try {
        const courses = getAll('SELECT id FROM courses')

        transaction(() => {
            for (const course of courses) {
                const videos = getAll(
                    'SELECT is_completed, duration, watch_progress FROM videos WHERE course_id = ?',
                    [course.id]
                )
                const totalVideos = videos.length
                if (totalVideos === 0) continue

                let completedVideos, completionPercentage

                if (mode === 'duration') {
                    // Progress based on total watch time
                    const totalDuration = videos.reduce((s, v) => s + (v.duration || 0), 0)
                    const watchedDuration = videos.reduce((s, v) => s + ((v.duration || 0) * (v.watch_progress || 0)), 0)
                    completedVideos = videos.filter(v => v.is_completed === 1).length
                    completionPercentage = totalDuration > 0 ? (watchedDuration / totalDuration) * 100 : 0
                } else {
                    // Default: progress based on completed video count
                    completedVideos = videos.filter(v => v.is_completed === 1).length
                    completionPercentage = (completedVideos / totalVideos) * 100
                }

                run(
                    'UPDATE courses SET completed_videos = ?, completion_percentage = ? WHERE id = ?',
                    [completedVideos, completionPercentage, course.id]
                )
            }
        })

        res.json({ success: true, coursesUpdated: courses.length })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// PUT /api/courses/reorder — MUST be before PUT /:id to avoid route shadowing
router.put('/reorder', (req, res) => {
    const { updates } = req.body // Array of { id, order }

    if (!Array.isArray(updates)) {
        return res.status(400).json({ error: 'Updates must be an array' })
    }

    try {
        transaction(() => {
            for (const update of updates) {
                if (update.id && update.order !== undefined) {
                    run('UPDATE courses SET "order" = ? WHERE id = ?', [update.order, update.id])
                }
            }
        })
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// PUT /api/courses/:id
router.put('/:id', (req, res) => {
    const id = req.params.id
    const data = req.body

    try {
        const course = getOne('SELECT * FROM courses WHERE id = ?', [id])
        if (!course) return res.status(404).json({ error: 'Course not found' })

        // Extract and format fields to update
        const updateFields = []
        const params = []

        const fieldMap = {
            title: 'title',
            originalTitle: 'original_title',
            description: 'description',
            instructor: 'instructor',
            thumbnailData: 'thumbnail_data',
            folderPath: 'folder_path',
            sourceType: 'source_type',
            courseUrl: 'course_url',
            dateModified: 'date_modified',
            lastAccessed: 'last_accessed',
            lastAccessedClickTime: 'last_accessed_click_time',
            totalDuration: 'total_duration',
            totalVideos: 'total_videos',
            completedVideos: 'completed_videos',
            completionPercentage: 'completion_percentage',
            order: '"order"'
        }

        for (const [key, dbField] of Object.entries(fieldMap)) {
            if (data[key] !== undefined) {
                updateFields.push(`${dbField} = ?`)
                params.push(data[key])
            }
        }

        if (data.tags !== undefined) {
            updateFields.push('tags = ?')
            params.push(JSON.stringify(data.tags))
        }

        if (data.customMetadata !== undefined) {
            updateFields.push('custom_metadata = ?')
            params.push(JSON.stringify(data.customMetadata))
        }

        if (updateFields.length === 0) {
            return res.json({ success: true, message: 'No fields to update' })
        }

        // Add ID to params
        params.push(id)

        run(`UPDATE courses SET ${updateFields.join(', ')} WHERE id = ?`, params)
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// DELETE /api/courses/:id
router.delete('/:id', (req, res) => {
    try {
        // SQLite will cascade delete modules, videos, notes if PRAGMA foreign_keys = ON
        run('DELETE FROM courses WHERE id = ?', [req.params.id])
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

export default router
