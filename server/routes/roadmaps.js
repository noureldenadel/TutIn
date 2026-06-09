import express from 'express'
import { getAll, getOne, run } from '../database.js'

const router = express.Router()

// GET /api/roadmaps
router.get('/', (req, res) => {
    try {
        const roadmaps = getAll('SELECT * FROM roadmaps ORDER BY created_at DESC')
        for (const roadmap of roadmaps) {
            roadmap.nodes = JSON.parse(roadmap.nodes || '[]')
            roadmap.connections = JSON.parse(roadmap.connections || '[]')
            roadmap.viewport = JSON.parse(roadmap.viewport || '{}')
            roadmap.is_active = !!roadmap.is_active
        }
        res.json(roadmaps)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// POST /api/roadmaps
router.post('/', (req, res) => {
    const data = req.body
    // Accept 'title' (frontend) or 'name' (legacy) field
    const name = data.name || data.title
    if (!data.id || !name) {
        return res.status(400).json({ error: 'Missing required fields (id and name/title)' })
    }

    try {
        const now = new Date().toISOString()
        // Support both { viewport: {pan, zoom} } and separate { pan, zoom } fields from frontend
        const viewport = data.viewport || { pan: data.pan || { x: 0, y: 0 }, zoom: data.zoom || 1 }
        run(`
            INSERT INTO roadmaps (
                id, name, nodes, connections, viewport, is_active, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            data.id, name,
            JSON.stringify(data.nodes || []),
            JSON.stringify(data.connections || []),
            JSON.stringify(viewport),
            data.isActive ? 1 : 0,
            data.createdAt || now,
            now
        ])
        res.status(201).json({ success: true, id: data.id })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// PUT /api/roadmaps/:id
router.put('/:id', (req, res) => {
    const id = req.params.id
    const data = req.body

    try {
        const roadmap = getOne('SELECT * FROM roadmaps WHERE id = ?', [id])
        if (!roadmap) return res.status(404).json({ error: 'Roadmap not found' })

        const updateFields = []
        const params = []

        // Accept 'title' (frontend) or 'name' (legacy)
        const name = data.name !== undefined ? data.name : data.title
        if (name !== undefined) {
            updateFields.push('name = ?')
            params.push(name)
        }
        if (data.nodes !== undefined) {
            updateFields.push('nodes = ?')
            params.push(JSON.stringify(data.nodes))
        }
        if (data.connections !== undefined) {
            updateFields.push('connections = ?')
            params.push(JSON.stringify(data.connections))
        }
        // Support both { viewport } and separate { pan, zoom } from frontend
        if (data.viewport !== undefined) {
            updateFields.push('viewport = ?')
            params.push(JSON.stringify(data.viewport))
        } else if (data.pan !== undefined || data.zoom !== undefined) {
            const existingViewport = JSON.parse(roadmap.viewport || '{}')
            const newViewport = {
                ...existingViewport,
                pan: data.pan !== undefined ? data.pan : existingViewport.pan,
                zoom: data.zoom !== undefined ? data.zoom : existingViewport.zoom
            }
            updateFields.push('viewport = ?')
            params.push(JSON.stringify(newViewport))
        }
        if (data.isActive !== undefined) {
            updateFields.push('is_active = ?')
            params.push(data.isActive ? 1 : 0)
        }

        if (updateFields.length === 0) {
            return res.json({ success: true, message: 'No fields to update' })
        }

        updateFields.push('updated_at = ?')
        params.push(new Date().toISOString())

        params.push(id)
        run(`UPDATE roadmaps SET ${updateFields.join(', ')} WHERE id = ?`, params)
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// DELETE /api/roadmaps/:id
router.delete('/:id', (req, res) => {
    try {
        run('DELETE FROM roadmaps WHERE id = ?', [req.params.id])
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

export default router
