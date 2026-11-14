import express from 'express'
import fs from 'fs'
import path from 'path'
import { getAll, getOne, run, transaction } from '../database.js'
import { loadFullVaultData, loadVaultCanvas, saveVaultMetadata } from '../utils/courseAssets.js'
import { writeCanvasPayloadToDb } from './canvas.js'

const router = express.Router()

function rewriteMediaUrlCourseId(value, targetCourseId) {
    if (typeof value !== 'string' || !value.includes('/api/notes/media/')) return value
    const safeCourseId = encodeURIComponent(targetCourseId)
    return value.replace(
        /\/api\/notes\/media\/[^/"'\s)]+\/([^/"'\s)]+)/g,
        `/api/notes/media/${safeCourseId}/$1`
    )
}

/**
 * Map a raw SQLite course row (snake_case) to a camelCase API response object.
 */
function mapCourseRow(course) {
    let thumbUrl = null
    if (course.has_thumbnail !== undefined) {
        // Optimized bulk query
        if (course.is_base64_thumbnail) {
            thumbUrl = `/api/courses/${course.id}/thumbnail`
        } else if (course.external_thumbnail) {
            thumbUrl = course.external_thumbnail
        }
    } else if (course.thumbnail_data) {
        // Single course query with full data
        if (course.thumbnail_data.startsWith('data:')) {
            thumbUrl = `/api/courses/${course.id}/thumbnail`
        } else {
            thumbUrl = course.thumbnail_data
        }
    }

    return {
        id: course.id,
        title: course.title,
        originalTitle: course.original_title,
        description: course.description,
        instructor: course.instructor,
        tags: JSON.parse(course.tags || '[]'),
        thumbnailData: thumbUrl,
        folderPath: course.folder_path,
        sourceType: course.source_type,
        courseUrl: course.course_url,
        language: course.language || 'en',
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
        let query = `
            SELECT id, title, original_title, description, instructor, tags, 
                   folder_path, source_type, course_url, language, 
                   date_added, date_modified, last_accessed, last_accessed_click_time, 
                   total_duration, total_videos, completed_videos, completion_percentage, 
                   custom_metadata, "order",
                   CASE WHEN thumbnail_data IS NOT NULL THEN 1 ELSE 0 END as has_thumbnail,
                   CASE WHEN thumbnail_data LIKE 'data:%' THEN 1 ELSE 0 END as is_base64_thumbnail,
                   CASE WHEN thumbnail_data NOT LIKE 'data:%' THEN thumbnail_data ELSE NULL END as external_thumbnail
            FROM courses
        `
        const params = []

        if (req.query.instructor) {
            // Need to handle WHERE properly since we multiline
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

// GET /api/courses/:id/thumbnail
router.get('/:id/thumbnail', (req, res) => {
    try {
        const course = getOne('SELECT thumbnail_data FROM courses WHERE id = ?', [req.params.id])
        if (!course || !course.thumbnail_data) return res.status(404).send('Not found')
        
        const data = course.thumbnail_data
        if (data.startsWith('data:')) {
            const matches = data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/)
            if (matches && matches.length === 3) {
                res.setHeader('Content-Type', matches[1])
                res.setHeader('Cache-Control', 'public, max-age=31536000')
                return res.send(Buffer.from(matches[2], 'base64'))
            }
        }
        res.redirect(data)
    } catch (err) {
        res.status(500).send(err.message)
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
                thumbnail_data, folder_path, source_type, course_url, language,
                date_added, date_modified, last_accessed, last_accessed_click_time,
                total_duration, total_videos, completed_videos, completion_percentage,
                custom_metadata, "order"
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            data.id, data.title, data.originalTitle || null, data.description || '', data.instructor || '',
            JSON.stringify(data.tags || []), data.thumbnailData || null, data.folderPath || null,
            data.sourceType || 'local', data.courseUrl || null, data.language || 'en', data.dateAdded || now, data.dateModified || now,
            data.lastAccessed || now, data.lastAccessedClickTime || now, data.totalDuration || 0,
            data.totalVideos || 0, data.completedVideos || 0, data.completionPercentage || 0,
            JSON.stringify(data.customMetadata || {}), data.order || 0
        ])

        // If local folder, initialize/sync .tutin/metadata.json
        if (data.folderPath && fs.existsSync(data.folderPath)) {
            saveVaultMetadata(data.folderPath, {
                title: data.title,
                originalTitle: data.originalTitle || null,
                instructor: data.instructor || '',
                language: data.language || 'en',
                tags: data.tags || [],
                description: data.description || '',
                updatedAt: now
            })
        }

        res.status(201).json({ success: true, id: data.id })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// Exportable function to recalculate a single course's progress
export function recalculateCourseProgress(courseId, dbMode = null) {
    const course = getOne(
        'SELECT source_type, course_url, total_videos, total_duration, completed_videos, completion_percentage FROM courses WHERE id = ?',
        [courseId]
    )
    if (!course) {
        return { completedVideos: 0, totalVideos: 0, totalDuration: 0, completionPercentage: 0 }
    }

    let mode = dbMode
    if (!mode) {
        const modeRow = getOne("SELECT value FROM settings WHERE key = 'progressCalculationMode'")
        try {
             mode = modeRow ? JSON.parse(modeRow.value) : 'videos'
        } catch {
             mode = 'videos'
        }
    }

    // Heal any orphaned videos left behind by deleted modules before PRAGMA foreign_keys persistence fix
    const hasOrphanedVideos = getOne(
        'SELECT 1 as found FROM videos WHERE course_id = ? AND NOT EXISTS (SELECT 1 FROM modules m WHERE m.id = videos.module_id) LIMIT 1',
        [courseId]
    )
    if (hasOrphanedVideos) {
        run(
            'DELETE FROM videos WHERE course_id = ? AND NOT EXISTS (SELECT 1 FROM modules m WHERE m.id = videos.module_id)',
            [courseId]
        )
    }

    const videos = getAll(
        'SELECT is_completed, duration FROM videos WHERE course_id = ?',
        [courseId]
    )
    const totalVideos = videos.length
    if (totalVideos === 0) {
        // External-link courses manage summary counts manually without rows in `videos`
        if (course.source_type === 'external-link' || Boolean(course.course_url)) {
            return {
                completedVideos: course.completed_videos || 0,
                totalVideos: course.total_videos || 0,
                totalDuration: course.total_duration || 0,
                completionPercentage: course.completion_percentage || 0
            }
        }

        run(
            'UPDATE courses SET total_videos = 0, total_duration = 0, completed_videos = 0, completion_percentage = 0 WHERE id = ?',
            [courseId]
        )
        return { completedVideos: 0, totalVideos: 0, totalDuration: 0, completionPercentage: 0 }
    }

    const totalDuration = videos.reduce((s, v) => s + Math.max(0, Number(v.duration) || 0), 0)
    const completedVideos = videos.filter(v => Number(v.is_completed) === 1).length
    let completionPercentage

    if (completedVideos === totalVideos) {
        completionPercentage = 100
    } else if (mode === 'duration') {
        if (totalDuration > 0) {
            // Course completion only sums checked/completed videos so playback resume (`watch_progress`) stays independent.
            const completedDuration = videos.reduce((s, v) => {
                if (Number(v.is_completed) !== 1) return s
                return s + Math.max(0, Number(v.duration) || 0)
            }, 0)

            completionPercentage = (completedDuration / totalDuration) * 100

            // Do not let durationless incomplete videos make the course appear 100% completed
            const hasIncompleteWithoutDuration = videos.some(
                v => Number(v.is_completed) !== 1 && Math.max(0, Number(v.duration) || 0) === 0
            )
            if (hasIncompleteWithoutDuration && completionPercentage >= 100) {
                completionPercentage = 99
            } else if (completionPercentage >= 100) {
                // Keep incomplete courses below strict 100% due to float arithmetic
                completionPercentage = 99.9
            }
        } else {
            // Durationless courses (e.g. unprobed .mkv/YouTube) fall back to completed video ratio
            completionPercentage = (completedVideos / totalVideos) * 100
        }
    } else {
        // Default: progress based on completed video count
        completionPercentage = (completedVideos / totalVideos) * 100
    }

    completionPercentage = Math.min(100, Math.max(0, completionPercentage))

    run(
        'UPDATE courses SET total_videos = ?, total_duration = ?, completed_videos = ?, completion_percentage = ? WHERE id = ?',
        [totalVideos, totalDuration, completedVideos, completionPercentage, courseId]
    )
    
    return { completedVideos, totalVideos, totalDuration, completionPercentage }
}

// POST /api/courses/recalculate-progress — MUST be before PUT /:id
router.post('/recalculate-progress', (req, res) => {
    const { mode } = req.body // 'videos' | 'duration'

    try {
        const courses = getAll('SELECT id FROM courses')

        transaction(() => {
            for (const course of courses) {
                recalculateCourseProgress(course.id, mode)
            }
        })

        res.json({ success: true, coursesUpdated: courses.length })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// POST /api/courses/:id/recalculate-progress — Recheck and recalculate a single course's progress
router.post('/:id/recalculate-progress', (req, res) => {
    const { id } = req.params
    const { mode } = req.body || {}

    try {
        const existing = getOne(
            'SELECT id, total_videos, total_duration, completed_videos, completion_percentage FROM courses WHERE id = ?',
            [id]
        )
        if (!existing) return res.status(404).json({ error: 'Course not found' })

        const previous = {
            completedVideos: existing.completed_videos || 0,
            totalVideos: existing.total_videos || 0,
            totalDuration: existing.total_duration || 0,
            completionPercentage: existing.completion_percentage || 0
        }

        const stats = recalculateCourseProgress(id, mode || null)
        const updatedCourse = getOne('SELECT * FROM courses WHERE id = ?', [id])

        res.json({
            success: true,
            previous,
            ...stats,
            course: mapCourseRow(updatedCourse)
        })
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

// POST /api/courses/:id/hydrate-vault — restore notes, canvas, metadata from .tutin/
router.post('/:id/hydrate-vault', (req, res) => {
    const { id } = req.params
    try {
        const course = getOne('SELECT * FROM courses WHERE id = ?', [id])
        if (!course) return res.status(404).json({ error: 'Course not found' })

        const courseFolder = course.folder_path
        if (!courseFolder || !fs.existsSync(courseFolder)) {
            return res.json({ success: true, message: 'No local folder to hydrate' })
        }

        const vaultData = loadFullVaultData(courseFolder)
        const rawVaultCanvas = loadVaultCanvas(courseFolder)
        if (!vaultData && !rawVaultCanvas) {
            return res.json({ success: true, message: 'No .tutin vault found' })
        }

        let hydratedNotes = 0
        let hydratedNodes = 0
        let hydratedEdges = 0
        let hydratedSummaries = 0

        transaction(() => {
            const needsVideos =
                (Array.isArray(vaultData?.notes) && vaultData.notes.length > 0) ||
                (vaultData?.summaries?.files?.length > 0)
            const videos = needsVideos
                ? getAll('SELECT id, title, file_name, file_path FROM videos WHERE course_id = ?', [id])
                : []

            // 1. Hydrate Metadata if available
            if (vaultData?.metadata) {
                const meta = vaultData.metadata
                const updates = []
                const params = []

                if (meta.instructor && !course.instructor) {
                    updates.push('instructor = ?')
                    params.push(meta.instructor)
                }
                if (meta.language && course.language === 'en' && meta.language !== 'en') {
                    updates.push('language = ?')
                    params.push(meta.language)
                }
                if (meta.tags && Array.isArray(meta.tags) && meta.tags.length > 0) {
                    const currentTags = JSON.parse(course.tags || '[]')
                    const mergedTags = Array.from(new Set([...currentTags, ...meta.tags]))
                    updates.push('tags = ?')
                    params.push(JSON.stringify(mergedTags))
                }
                if (meta.description && !course.description) {
                    updates.push('description = ?')
                    params.push(meta.description)
                }

                if (updates.length > 0) {
                    params.push(id)
                    run(`UPDATE courses SET ${updates.join(', ')} WHERE id = ?`, params)
                }
            }

            // 2. Hydrate Notes
            if (Array.isArray(vaultData?.notes) && vaultData.notes.length > 0) {
                const now = new Date().toISOString()

                for (const note of vaultData.notes) {
                    let matchedVideo = null
                    if (note.relativeVideoPath) {
                        const normNoteRel = note.relativeVideoPath.replace(/\\/g, '/').toLowerCase()
                        matchedVideo = videos.find(v => {
                            if (!v.file_path) return false
                            const normVRel = path.relative(courseFolder, v.file_path).replace(/\\/g, '/').toLowerCase()
                            return normVRel === normNoteRel
                        })
                    }

                    if (!matchedVideo && note.videoFileName) {
                        const noteFn = note.videoFileName.toLowerCase()
                        matchedVideo = videos.find(v => (v.file_name || '').toLowerCase() === noteFn)
                    }

                    if (!matchedVideo && note.videoId) {
                        matchedVideo = videos.find(v => v.id === note.videoId)
                    }

                    if (matchedVideo) {
                        const existingNote = getOne('SELECT id FROM notes WHERE id = ?', [note.id])
                        const rewrittenContent = rewriteMediaUrlCourseId(note.content || '', id)
                        const rewrittenImages = (note.images || []).map(img => rewriteMediaUrlCourseId(img, id))
                        const imagesJson = JSON.stringify(rewrittenImages)
                        const tagsJson = JSON.stringify(note.tags || [])

                        if (existingNote) {
                            run(`
                                UPDATE notes SET 
                                    video_id = ?, timestamp = ?, content = ?, 
                                    images = ?, tags = ?, updated_at = ?
                                WHERE id = ?
                            `, [
                                matchedVideo.id, note.timestamp || 0, rewrittenContent,
                                imagesJson, tagsJson, note.updatedAt || now, note.id
                            ])
                        } else {
                            run(`
                                INSERT INTO notes (
                                    id, video_id, course_id, timestamp, content, images, tags, created_at, updated_at
                                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                            `, [
                                note.id, matchedVideo.id, id, note.timestamp || 0,
                                rewrittenContent, imagesJson, tagsJson,
                                note.createdAt || now, note.updatedAt || now
                            ])
                        }
                        hydratedNotes++
                    }
                }
            }

            // 3. Hydrate Canvas (supports both Canvas v2 and legacy Canvas v1 vaults)
            if (rawVaultCanvas) {
                const canvasPayload = {
                    ...rawVaultCanvas,
                    cards: Array.isArray(rawVaultCanvas.cards)
                        ? rawVaultCanvas.cards.map(c => ({
                            ...c,
                            htmlContent: rewriteMediaUrlCourseId(c.htmlContent || '', id),
                            imageSrc: rewriteMediaUrlCourseId(c.imageSrc, id),
                        }))
                        : undefined,
                    nodes: Array.isArray(rawVaultCanvas.nodes)
                        ? rawVaultCanvas.nodes.map(n => ({
                            ...n,
                            content: rewriteMediaUrlCourseId(n.content || '', id),
                        }))
                        : undefined,
                }
                writeCanvasPayloadToDb(id, canvasPayload, { insideTransaction: true })
                hydratedNodes = canvasPayload.cards?.length ?? canvasPayload.nodes?.length ?? 0
                hydratedEdges = canvasPayload.edges?.length ?? 0
            }

            // 4. Hydrate Summaries
            if (vaultData?.summaries?.files?.length > 0) {
                const now = new Date().toISOString()
                for (const s of vaultData.summaries.files) {
                    const baseNameLower = (s.baseName || '').toLowerCase()
                    const matchedVideo = videos.find(v => {
                        const vBase = path.basename(v.file_name || '', path.extname(v.file_name || '')).toLowerCase()
                        return vBase === baseNameLower
                    })
                    if (matchedVideo) {
                        run(`UPDATE videos SET has_summary = 1, summary_generated_at = COALESCE(summary_generated_at, ?) WHERE id = ?`, [now, matchedVideo.id])
                        hydratedSummaries++
                    }
                }
            }
        })

        res.json({
            success: true,
            hydrated: {
                notes: hydratedNotes,
                nodes: hydratedNodes,
                edges: hydratedEdges,
                summaries: hydratedSummaries
            }
        })
    } catch (err) {
        console.error('Failed to hydrate vault:', err)
        res.status(500).json({ error: err.message })
    }
})

// PUT /api/courses/reorder
router.put('/reorder', (req, res) => {
    const { updates } = req.body
    if (!Array.isArray(updates)) {
        return res.status(400).json({ error: 'updates must be an array' })
    }
    try {
        transaction(() => {
            for (const item of updates) {
                if (item?.id && item?.order !== undefined) {
                    run('UPDATE courses SET "order" = ? WHERE id = ?', [item.order, item.id])
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
            language: 'language',
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
                if (key === 'thumbnailData' && typeof data[key] === 'string' && data[key].includes('/api/courses/')) {
                    continue
                }
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

        if (updateFields.length > 0) {
            // Add ID to params
            params.push(id)
            run(`UPDATE courses SET ${updateFields.join(', ')} WHERE id = ?`, params)
        }

        // Sync metadata to .tutin/metadata.json
        const updatedCourse = getOne('SELECT * FROM courses WHERE id = ?', [id])
        if (updatedCourse?.folder_path && fs.existsSync(updatedCourse.folder_path)) {
            let currentTags = []
            try { currentTags = JSON.parse(updatedCourse.tags || '[]') } catch { }
            saveVaultMetadata(updatedCourse.folder_path, {
                title: updatedCourse.title,
                originalTitle: updatedCourse.original_title,
                instructor: updatedCourse.instructor,
                language: updatedCourse.language,
                tags: currentTags,
                description: updatedCourse.description,
                updatedAt: new Date().toISOString()
            })
        }

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
