import express from 'express'
import fs from 'fs'
import path from 'path'
import { getAll, getOne, run } from '../database.js'
import { saveVaultNotes } from '../utils/courseAssets.js'

const router = express.Router()

/**
 * Synchronize notes for a course to <courseFolder>/.tutin/notes/notes.json
 */
function syncCourseNotesToVault(courseId) {
    if (!courseId) return
    try {
        const course = getOne('SELECT folder_path FROM courses WHERE id = ?', [courseId])
        if (!course || !course.folder_path || !fs.existsSync(course.folder_path)) return

        const courseFolder = course.folder_path
        const videos = getAll('SELECT id, file_name, file_path FROM videos WHERE course_id = ?', [courseId])
        const rawNotes = getAll('SELECT * FROM notes WHERE course_id = ? ORDER BY timestamp ASC', [courseId])

        const portableNotes = rawNotes.map(note => {
            const video = videos.find(v => v.id === note.video_id)
            let images = []
            let noteTags = []
            try { images = JSON.parse(note.images || '[]') } catch { }
            try { noteTags = JSON.parse(note.tags || '[]') } catch { }

            const relVideoPath = video && video.file_path 
                ? path.relative(courseFolder, video.file_path).replace(/\\/g, '/')
                : (video?.file_name || '')

            return {
                id: note.id,
                videoId: note.video_id,
                videoFileName: video?.file_name || null,
                relativeVideoPath: relVideoPath,
                timestamp: note.timestamp,
                content: note.content,
                images,
                tags: noteTags,
                createdAt: note.created_at,
                updatedAt: note.updated_at
            }
        })

        saveVaultNotes(courseFolder, portableNotes)
    } catch (err) {
        console.error('[VaultNotes] Failed to sync notes to vault:', err)
    }
}

// GET /api/notes/by-video/:videoId
router.get('/by-video/:videoId', (req, res) => {
    try {
        const notes = getAll('SELECT * FROM notes WHERE video_id = ? ORDER BY timestamp ASC', [req.params.videoId])
        for (const note of notes) {
            note.images = JSON.parse(note.images || '[]')
            note.tags = JSON.parse(note.tags || '[]')
        }
        res.json(notes)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// GET /api/notes/by-course/:courseId
router.get('/by-course/:courseId', (req, res) => {
    try {
        const notes = getAll('SELECT * FROM notes WHERE course_id = ? ORDER BY timestamp ASC', [req.params.courseId])
        for (const note of notes) {
            note.images = JSON.parse(note.images || '[]')
            note.tags = JSON.parse(note.tags || '[]')
        }
        res.json(notes)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// POST /api/notes
router.post('/', (req, res) => {
    const data = req.body
    if (!data.id || !data.videoId || !data.courseId) {
        return res.status(400).json({ error: 'Missing required fields' })
    }

    try {
        const now = new Date().toISOString()
        run(`
            INSERT INTO notes (
                id, video_id, course_id, timestamp, content, images, tags, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            data.id, data.videoId, data.courseId, data.timestamp || 0,
            data.content || '', JSON.stringify(data.images || []),
            JSON.stringify(data.tags || []), data.createdAt || now, data.updatedAt || now
        ])

        syncCourseNotesToVault(data.courseId)
        res.status(201).json({ success: true, id: data.id })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// PUT /api/notes/:id
router.put('/:id', (req, res) => {
    const id = req.params.id
    const data = req.body

    try {
        const note = getOne('SELECT * FROM notes WHERE id = ?', [id])
        if (!note) return res.status(404).json({ error: 'Note not found' })

        const updateFields = []
        const params = []

        const fieldMap = {
            timestamp: 'timestamp',
            content: 'content'
        }

        for (const [key, dbField] of Object.entries(fieldMap)) {
            if (data[key] !== undefined) {
                updateFields.push(`${dbField} = ?`)
                params.push(data[key])
            }
        }

        if (data.images !== undefined) {
            updateFields.push('images = ?')
            params.push(JSON.stringify(data.images))
        }

        if (data.tags !== undefined) {
            updateFields.push('tags = ?')
            params.push(JSON.stringify(data.tags))
        }

        updateFields.push('updated_at = ?')
        params.push(new Date().toISOString())

        params.push(id)
        run(`UPDATE notes SET ${updateFields.join(', ')} WHERE id = ?`, params)

        syncCourseNotesToVault(note.course_id)
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// DELETE /api/notes/by-video/:videoId — MUST be before DELETE /:id
router.delete('/by-video/:videoId', (req, res) => {
    try {
        const video = getOne('SELECT course_id FROM videos WHERE id = ?', [req.params.videoId])
        run('DELETE FROM notes WHERE video_id = ?', [req.params.videoId])

        if (video?.course_id) {
            syncCourseNotesToVault(video.course_id)
        }
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// DELETE /api/notes/:id
router.delete('/:id', (req, res) => {
    try {
        const note = getOne('SELECT course_id FROM notes WHERE id = ?', [req.params.id])
        run('DELETE FROM notes WHERE id = ?', [req.params.id])

        if (note?.course_id) {
            syncCourseNotesToVault(note.course_id)
        }
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

export default router
