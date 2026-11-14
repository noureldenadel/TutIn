import express from 'express'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { getAll, getOne, run, getDataDir } from '../database.js'
import { getScreenshotsDir, saveVaultNotes } from '../utils/courseAssets.js'

const router = express.Router()

const MIME_TO_EXT = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
}

const EXT_TO_MIME = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
}

function getMediaStorageDir(courseId) {
    if (courseId) {
        const course = getOne('SELECT folder_path FROM courses WHERE id = ?', [courseId])
        if (course?.folder_path && fs.existsSync(course.folder_path)) {
            const dir = getScreenshotsDir(course.folder_path)
            if (dir) return dir
        }
    }
    const fallback = path.join(getDataDir(), 'screenshots', courseId || 'shared')
    if (!fs.existsSync(fallback)) {
        fs.mkdirSync(fallback, { recursive: true })
    }
    return fallback
}

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

// GET /api/notes/stats
router.get('/stats', (req, res) => {
    try {
        const row = getOne('SELECT COUNT(*) as totalNotes FROM notes')
        res.json({ totalNotes: Number(row?.totalNotes) || 0 })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// POST /api/notes/media — Persist note/canvas image inside .tutin/notes/screenshots (or AppData fallback)
router.post('/media', (req, res) => {
    const { courseId, dataUrl, filename } = req.body || {}
    if (!dataUrl || typeof dataUrl !== 'string') {
        return res.status(400).json({ error: 'Missing dataUrl' })
    }

    const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
    if (!match) {
        return res.status(400).json({ error: 'Invalid base64 image dataUrl' })
    }

    const mime = match[1].toLowerCase()
    const ext = MIME_TO_EXT[mime] || 'png'
    const safeCourseId = courseId ? String(courseId) : 'shared'

    try {
        const targetDir = getMediaStorageDir(courseId || null)
        const baseSlug = (filename ? path.basename(filename, path.extname(filename)) : 'shot')
            .replace(/[^a-zA-Z0-9_-]/g, '_')
            .slice(0, 40) || 'shot'
        const outName = `${baseSlug}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}.${ext}`
        const outPath = path.join(targetDir, outName)

        fs.writeFileSync(outPath, Buffer.from(match[2], 'base64'))

        const url = `/api/notes/media/${encodeURIComponent(safeCourseId)}/${encodeURIComponent(outName)}`
        res.status(201).json({ url, filename: outName })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// GET /api/notes/media/:courseId/:filename — Serve stored screenshot from .tutin vault or AppData
router.get('/media/:courseId/:filename', (req, res) => {
    const { courseId, filename } = req.params
    const safeName = path.basename(filename || '')
    if (!safeName || safeName === '.' || safeName === '..') {
        return res.status(400).send('Invalid filename')
    }

    try {
        const candidates = []
        if (courseId && courseId !== 'shared') {
            const course = getOne('SELECT folder_path FROM courses WHERE id = ?', [courseId])
            if (course?.folder_path) {
                candidates.push(path.join(course.folder_path, '.tutin', 'notes', 'screenshots', safeName))
            }
        }
        candidates.push(path.join(getDataDir(), 'screenshots', courseId || 'shared', safeName))

        const found = candidates.find(p => fs.existsSync(p) && fs.statSync(p).isFile())
        if (!found) {
            return res.status(404).send('Media not found')
        }

        const ext = path.extname(found).toLowerCase()
        res.setHeader('Content-Type', EXT_TO_MIME[ext] || 'application/octet-stream')
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        res.sendFile(path.resolve(found), { dotfiles: 'allow' })
    } catch (err) {
        res.status(500).send(err.message)
    }
})

function safeParseJsonArray(raw) {
    if (Array.isArray(raw)) return raw
    if (typeof raw !== 'string' || !raw.trim()) return []
    try {
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed : []
    } catch {
        return []
    }
}

function formatNoteRow(note) {
    return {
        ...note,
        videoId: note.video_id,
        courseId: note.course_id,
        createdAt: note.created_at,
        updatedAt: note.updated_at,
        images: safeParseJsonArray(note.images),
        tags: safeParseJsonArray(note.tags),
    }
}

// GET /api/notes/by-video/:videoId
router.get('/by-video/:videoId', (req, res) => {
    try {
        const notes = getAll('SELECT * FROM notes WHERE video_id = ? ORDER BY timestamp ASC', [req.params.videoId])
        res.json(notes.map(formatNoteRow))
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// GET /api/notes/by-course/:courseId
router.get('/by-course/:courseId', (req, res) => {
    try {
        const notes = getAll('SELECT * FROM notes WHERE course_id = ? ORDER BY timestamp ASC', [req.params.courseId])
        res.json(notes.map(formatNoteRow))
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
