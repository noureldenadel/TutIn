import express from 'express'
import { getAll, getOne, run, transaction } from '../database.js'

const router = express.Router()

// GET /api/courses/:courseId/modules
router.get('/by-course/:courseId', (req, res) => {
    try {
        const modules = getAll('SELECT * FROM modules WHERE course_id = ? ORDER BY "order" ASC', [req.params.courseId])
        const mappedModules = modules.map(mod => ({
            id: mod.id,
            courseId: mod.course_id,
            parentModuleId: mod.parent_module_id,
            title: mod.title,
            originalTitle: mod.original_title,
            description: mod.description,
            thumbnailData: mod.thumbnail_data,
            folderPath: mod.folder_path,
            order: mod.order,
            totalDuration: mod.total_duration,
            totalVideos: mod.total_videos,
            completedVideos: mod.completed_videos,
            dateAdded: mod.date_added
        }))
        res.json(mappedModules)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// POST /api/modules
router.post('/', (req, res) => {
    const data = req.body
    if (!data.id || !data.courseId || !data.title) {
        return res.status(400).json({ error: 'Missing required fields' })
    }

    try {
        const now = new Date().toISOString()
        run(`
            INSERT INTO modules (
                id, course_id, parent_module_id, title, original_title,
                description, thumbnail_data, folder_path, "order",
                total_duration, total_videos, completed_videos, date_added
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            data.id, data.courseId, data.parentModuleId || null, data.title,
            data.originalTitle || null, data.description || '', data.thumbnailData || null,
            data.folderPath || null, data.order || 0, data.totalDuration || 0,
            data.totalVideos || 0, data.completedVideos || 0, data.dateAdded || now
        ])
        res.status(201).json({ success: true, id: data.id })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// PUT /api/modules/:id
router.put('/:id', (req, res) => {
    const id = req.params.id
    const data = req.body

    try {
        const mod = getOne('SELECT * FROM modules WHERE id = ?', [id])
        if (!mod) return res.status(404).json({ error: 'Module not found' })

        const updateFields = []
        const params = []

        const fieldMap = {
            title: 'title',
            originalTitle: 'original_title',
            description: 'description',
            thumbnailData: 'thumbnail_data',
            folderPath: 'folder_path',
            order: '"order"',
            totalDuration: 'total_duration',
            totalVideos: 'total_videos',
            completedVideos: 'completed_videos',
            parentModuleId: 'parent_module_id'
        }

        for (const [key, dbField] of Object.entries(fieldMap)) {
            if (data[key] !== undefined) {
                updateFields.push(`${dbField} = ?`)
                params.push(data[key])
            }
        }

        if (updateFields.length === 0) {
            return res.json({ success: true, message: 'No fields to update' })
        }

        params.push(id)
        run(`UPDATE modules SET ${updateFields.join(', ')} WHERE id = ?`, params)
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// DELETE /api/modules/:id
router.delete('/:id', (req, res) => {
    try {
        run('DELETE FROM modules WHERE id = ?', [req.params.id])
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

export default router
