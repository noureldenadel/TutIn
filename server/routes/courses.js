import express from 'express'
import fs from 'fs'
import path from 'path'
import { getAll, getOne, run, transaction } from '../database.js'
import { loadFullVaultData, saveVaultMetadata } from '../utils/courseAssets.js'

const router = express.Router()

/**
 * Map a raw SQLite course row (snake_case) to a camelCase API response object.
 */
function mapCourseRow(course) {
    let thumbUrl = null
    if (course.has_thumbnail !== undefined) {
        // Optimized bulk query
        if (course.is_base64_thumbnail) {
            thumbUrl = `http://127.0.0.1:9474/api/courses/${course.id}/thumbnail`
        } else if (course.external_thumbnail) {
            thumbUrl = course.external_thumbnail
        }
    } else if (course.thumbnail_data) {
        // Single course query with full data
        if (course.thumbnail_data.startsWith('data:')) {
            thumbUrl = `http://127.0.0.1:9474/api/courses/${course.id}/thumbnail`
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
    let mode = dbMode
    if (!mode) {
        const modeRow = getOne("SELECT value FROM settings WHERE key = 'progressCalculationMode'")
        try {
             mode = modeRow ? JSON.parse(modeRow.value) : 'videos'
        } catch {
             mode = 'videos'
        }
    }
    
    const videos = getAll(
        'SELECT is_completed, duration, watch_progress FROM videos WHERE course_id = ?',
        [courseId]
    )
    const totalVideos = videos.length
    if (totalVideos === 0) return { completedVideos: 0, completionPercentage: 0 }

    let completedVideos, completionPercentage

    if (mode === 'duration') {
        // Progress based on total watch time
        const totalDuration = videos.reduce((s, v) => s + (v.duration || 0), 0)
        // If a video is marked complete, treat as 100%. Otherwise require at least 15s watched to avoid phantom preview progress.
        const watchedDuration = videos.reduce((s, v) => {
            if (v.is_completed === 1) {
                return s + (v.duration || 0)
            }
            const videoDuration = v.duration || 0
            const watchedSecs = videoDuration * (v.watch_progress || 0)
            // Ignore accidental clicks/previews under 15 seconds
            if (watchedSecs < 15) return s
            return s + watchedSecs
        }, 0)
        completedVideos = videos.filter(v => v.is_completed === 1).length
        completionPercentage = totalDuration > 0 ? (watchedDuration / totalDuration) * 100 : 0
        if (completionPercentage < 0.5) completionPercentage = 0
    } else {
        // Default: progress based on completed video count
        completedVideos = videos.filter(v => v.is_completed === 1).length
        completionPercentage = (completedVideos / totalVideos) * 100
    }

    run(
        'UPDATE courses SET completed_videos = ?, completion_percentage = ? WHERE id = ?',
        [completedVideos, completionPercentage, courseId]
    )
    
    return { completedVideos, completionPercentage, totalVideos }
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
        if (!vaultData) {
            return res.json({ success: true, message: 'No .tutin vault found' })
        }

        let hydratedNotes = 0
        let hydratedNodes = 0
        let hydratedEdges = 0

        transaction(() => {
            // 1. Hydrate Metadata if available
            if (vaultData.metadata) {
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
            if (Array.isArray(vaultData.notes) && vaultData.notes.length > 0) {
                const videos = getAll('SELECT id, title, file_name, file_path FROM videos WHERE course_id = ?', [id])
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
                        const imagesJson = JSON.stringify(note.images || [])
                        const tagsJson = JSON.stringify(note.tags || [])

                        if (existingNote) {
                            run(`
                                UPDATE notes SET 
                                    video_id = ?, timestamp = ?, content = ?, 
                                    images = ?, tags = ?, updated_at = ?
                                WHERE id = ?
                            `, [
                                matchedVideo.id, note.timestamp || 0, note.content || '',
                                imagesJson, tagsJson, note.updatedAt || now, note.id
                            ])
                        } else {
                            run(`
                                INSERT INTO notes (
                                    id, video_id, course_id, timestamp, content, images, tags, created_at, updated_at
                                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                            `, [
                                note.id, matchedVideo.id, id, note.timestamp || 0,
                                note.content || '', imagesJson, tagsJson,
                                note.createdAt || now, note.updatedAt || now
                            ])
                        }
                        hydratedNotes++
                    }
                }
            }

            // 3. Hydrate Canvas
            if (vaultData.canvas) {
                const { nodes, edges, viewport } = vaultData.canvas
                const now = new Date().toISOString()

                if (viewport) {
                    const panX = viewport.pan?.x ?? 0
                    const panY = viewport.pan?.y ?? 0
                    const zoom = viewport.zoom ?? 1
                    run(`
                        INSERT INTO canvas_viewports (course_id, pan_x, pan_y, zoom, updated_at)
                        VALUES (?, ?, ?, ?, ?)
                        ON CONFLICT(course_id) DO UPDATE SET
                            pan_x = excluded.pan_x,
                            pan_y = excluded.pan_y,
                            zoom = excluded.zoom,
                            updated_at = excluded.updated_at
                    `, [id, panX, panY, zoom, now])
                }

                if (Array.isArray(nodes) && nodes.length > 0) {
                    for (const node of nodes) {
                        run(`
                            INSERT INTO canvas_nodes (
                                id, course_id, note_id, type, content, title,
                                x, y, width, height, color, parent_group_id, collapsed,
                                created_at, updated_at
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ON CONFLICT(id) DO UPDATE SET
                                note_id = excluded.note_id,
                                type = excluded.type,
                                content = excluded.content,
                                title = excluded.title,
                                x = excluded.x,
                                y = excluded.y,
                                width = excluded.width,
                                height = excluded.height,
                                color = excluded.color,
                                parent_group_id = excluded.parent_group_id,
                                collapsed = excluded.collapsed,
                                updated_at = excluded.updated_at
                        `, [
                            node.id,
                            id,
                            node.noteId || null,
                            node.type || 'note',
                            node.content || '',
                            node.title || '',
                            node.x || 0,
                            node.y || 0,
                            node.width || 280,
                            node.height || 180,
                            node.color || '',
                            node.parentGroupId || null,
                            node.collapsed ? 1 : 0,
                            node.createdAt || now,
                            node.updatedAt || now
                        ])
                        hydratedNodes++
                    }
                }

                if (Array.isArray(edges) && edges.length > 0) {
                    for (const edge of edges) {
                        run(`
                            INSERT INTO canvas_edges (id, course_id, from_node_id, to_node_id, created_at)
                            VALUES (?, ?, ?, ?, ?)
                            ON CONFLICT(id) DO UPDATE SET
                                from_node_id = excluded.from_node_id,
                                to_node_id = excluded.to_node_id
                        `, [
                            edge.id,
                            id,
                            edge.fromNodeId,
                            edge.toNodeId,
                            edge.createdAt || now
                        ])
                        hydratedEdges++
                    }
                }
            }

            // 4. Hydrate Summaries
            let hydratedSummaries = 0
            if (vaultData.summaries?.files?.length > 0) {
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
