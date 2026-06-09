import express from 'express'
import { getAll, getOne, run } from '../database.js'

const router = express.Router()

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
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// DELETE /api/notes/by-video/:videoId — MUST be before DELETE /:id
router.delete('/by-video/:videoId', (req, res) => {
    try {
        run('DELETE FROM notes WHERE video_id = ?', [req.params.videoId])
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// DELETE /api/notes/:id
router.delete('/:id', (req, res) => {
    try {
        run('DELETE FROM notes WHERE id = ?', [req.params.id])
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

export default router
