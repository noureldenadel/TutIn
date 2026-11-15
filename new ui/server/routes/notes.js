import express from 'express'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { getAll, getOne, run, transaction, getDataDir } from '../database.js'
import { getScreenshotsDir, saveVaultNotes } from '../utils/courseAssets.js'
import { deleteLinkedCanvasNodesForNotes, syncCourseCanvasToVault } from './canvas.js'

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

function sanitizeMediaKey(rawKey, fallback = 'shared') {
    const base = path.basename(String(rawKey || '').trim())
    const clean = base.replace(/[^a-zA-Z0-9._-]/g, '_')
    return !clean || clean === '.' || clean === '..' ? fallback : clean
}

function resolveSafePathWithin(baseDir, fileName) {
    if (!baseDir || !fileName) return null
    const resolvedBase = path.resolve(baseDir)
    const resolvedTarget = path.resolve(resolvedBase, fileName)
    const rel = path.relative(resolvedBase, resolvedTarget)
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null
    return resolvedTarget
}

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

function getMediaStorageDir(courseId) {
    if (courseId) {
        const course = getOne('SELECT folder_path FROM courses WHERE id = ?', [courseId])
        if (course?.folder_path && fs.existsSync(course.folder_path)) {
            const dir = getScreenshotsDir(course.folder_path)
            if (dir) return dir
        }
    }
    const fallback = path.join(getDataDir(), 'screenshots', sanitizeMediaKey(courseId))
    if (!fs.existsSync(fallback)) {
        fs.mkdirSync(fallback, { recursive: true })
    }
    return fallback
}

/**
 * Synchronize notes for a course to <courseFolder>/.tutin/notes/notes.json
 */
export function syncCourseNotesToVault(courseId) {
    if (!courseId) return
    try {
        const course = getOne('SELECT folder_path FROM courses WHERE id = ?', [courseId])
        if (!course || !course.folder_path || !fs.existsSync(course.folder_path)) return

        const courseFolder = course.folder_path
        const videos = getAll('SELECT id, file_name, file_path FROM videos WHERE course_id = ?', [courseId])
        const videoById = new Map(videos.map(v => [v.id, v]))
        const rawNotes = getAll('SELECT * FROM notes WHERE course_id = ? ORDER BY timestamp ASC', [courseId])

        const portableNotes = rawNotes.map(note => {
            const video = videoById.get(note.video_id)
            const images = safeParseJsonArray(note.images)
            const noteTags = safeParseJsonArray(note.tags)

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

const mediaHashIndexByDir = new Map()

function getDirHashMap(targetDir) {
    let dirMap = mediaHashIndexByDir.get(targetDir)
    if (!dirMap) {
        dirMap = new Map()
        mediaHashIndexByDir.set(targetDir, dirMap)
    }
    return dirMap
}

function findExistingMediaByHash(targetDir, targetSize, targetHash) {
    if (!targetDir || !fs.existsSync(targetDir)) return null
    const dirMap = getDirHashMap(targetDir)
    const cachedName = dirMap.get(targetHash)
    if (cachedName) {
        const cachedPath = resolveSafePathWithin(targetDir, cachedName)
        try {
            if (cachedPath && fs.statSync(cachedPath).size === targetSize) {
                return cachedName
            }
        } catch {
            // File removed externally; clear stale cache entry and fall through to scan
        }
        dirMap.delete(targetHash)
    }

    try {
        const entries = fs.readdirSync(targetDir, { withFileTypes: true })
        for (const entry of entries) {
            if (!entry.isFile()) continue
            const fileExt = path.extname(entry.name).toLowerCase()
            if (!EXT_TO_MIME[fileExt]) continue
            const candidatePath = resolveSafePathWithin(targetDir, entry.name)
            if (!candidatePath) continue
            let stat
            try {
                stat = fs.statSync(candidatePath)
            } catch {
                continue
            }
            if (!stat.isFile() || stat.size !== targetSize) continue
            try {
                const candidateHash = crypto
                    .createHash('sha256')
                    .update(fs.readFileSync(candidatePath))
                    .digest('hex')
                dirMap.set(candidateHash, entry.name)
                if (candidateHash === targetHash) {
                    return entry.name
                }
            } catch {
                // Skip unreadable candidate file
            }
        }
    } catch {
        // Fallback cleanly to writing a new file if directory scan fails
    }
    return null
}

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
    const ext = MIME_TO_EXT[mime]
    if (!ext) {
        return res.status(400).json({ error: `Unsupported image MIME type: ${mime}` })
    }
    const safeCourseId = sanitizeMediaKey(courseId)

    try {
        const targetDir = getMediaStorageDir(courseId || null)
        const buffer = Buffer.from(match[2], 'base64')
        const targetHash = crypto.createHash('sha256').update(buffer).digest('hex')
        const existingName = findExistingMediaByHash(targetDir, buffer.length, targetHash)
        if (existingName) {
            const existingUrl = `/api/notes/media/${encodeURIComponent(safeCourseId)}/${encodeURIComponent(existingName)}`
            return res.status(200).json({ url: existingUrl, filename: existingName, deduplicated: true })
        }

        const baseSlug = (filename ? path.basename(filename, path.extname(filename)) : 'shot')
            .replace(/[^a-zA-Z0-9_-]/g, '_')
            .slice(0, 40) || 'shot'
        const outName = `${baseSlug}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}.${ext}`
        const outPath = resolveSafePathWithin(targetDir, outName)
        if (!outPath) {
            return res.status(400).json({ error: 'Invalid output filename' })
        }

        fs.writeFileSync(outPath, buffer)
        getDirHashMap(targetDir).set(targetHash, outName)

        const url = `/api/notes/media/${encodeURIComponent(safeCourseId)}/${encodeURIComponent(outName)}`
        res.status(201).json({ url, filename: outName })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// GET /api/notes/media/:courseId/:filename — Serve stored screenshot from .tutin vault or AppData
router.get('/media/:courseId/:filename', (req, res) => {
    const { courseId, filename } = req.params
    const safeCourseId = sanitizeMediaKey(courseId)
    const safeName = path.basename(filename || '')
    if (!safeName || safeName === '.' || safeName === '..') {
        return res.status(400).send('Invalid filename')
    }

    try {
        const candidates = []
        if (courseId && safeCourseId !== 'shared') {
            const course = getOne('SELECT folder_path FROM courses WHERE id = ?', [courseId])
            if (course?.folder_path) {
                const vaultPath = resolveSafePathWithin(
                    path.join(course.folder_path, '.tutin', 'notes', 'screenshots'),
                    safeName
                )
                if (vaultPath) candidates.push(vaultPath)
            }
        }
        const fallbackPath = resolveSafePathWithin(
            path.join(getDataDir(), 'screenshots', safeCourseId),
            safeName
        )
        if (fallbackPath) candidates.push(fallbackPath)

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
        const affectedNotes = getAll('SELECT id, course_id FROM notes WHERE video_id = ?', [req.params.videoId])
        const courseId = video?.course_id || affectedNotes[0]?.course_id || null
        const noteIds = affectedNotes.map(n => n.id)
        let removedCanvasNodes = 0

        transaction(() => {
            if (courseId && noteIds.length > 0) {
                removedCanvasNodes = deleteLinkedCanvasNodesForNotes(courseId, noteIds)
            }
            run('DELETE FROM notes WHERE video_id = ?', [req.params.videoId])
        })

        if (courseId) {
            syncCourseNotesToVault(courseId)
            if (removedCanvasNodes > 0) {
                syncCourseCanvasToVault(courseId)
            }
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
        let removedCanvasNodes = 0

        transaction(() => {
            if (note?.course_id) {
                removedCanvasNodes = deleteLinkedCanvasNodesForNotes(note.course_id, [req.params.id])
            }
            run('DELETE FROM notes WHERE id = ?', [req.params.id])
        })

        if (note?.course_id) {
            syncCourseNotesToVault(note.course_id)
            if (removedCanvasNodes > 0) {
                syncCourseCanvasToVault(note.course_id)
            }
        }
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

export default router
