import express from 'express'
import { getAll, getOne, run } from '../database.js'

const router = express.Router()

// GET /api/instructors
router.get('/', (req, res) => {
    try {
        const instructors = getAll('SELECT * FROM instructors ORDER BY name ASC')
        const mappedInstructors = instructors.map(inst => ({
            id: inst.id,
            name: inst.name,
            displayName: inst.display_name,
            avatarData: inst.avatar_data,
            updatedAt: inst.updated_at
        }))
        res.json(mappedInstructors)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// GET /api/instructors/:id
router.get('/:id', (req, res) => {
    try {
        const inst = getOne('SELECT * FROM instructors WHERE id = ?', [req.params.id])
        if (!inst) return res.status(404).json({ error: 'Instructor not found' })
        
        res.json({
            id: inst.id,
            name: inst.name,
            displayName: inst.display_name,
            avatarData: inst.avatar_data,
            updatedAt: inst.updated_at
        })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// POST /api/instructors
router.post('/', (req, res) => {
    const data = req.body
    if (!data.id || !data.name) {
        return res.status(400).json({ error: 'Missing required fields' })
    }

    try {
        const now = new Date().toISOString()
        run(`
            INSERT INTO instructors (id, name, display_name, avatar_data, updated_at)
            VALUES (?, ?, ?, ?, ?)
        `, [
            data.id, data.name, data.displayName || null,
            data.avatarData || null, now
        ])
        res.status(201).json({ success: true, id: data.id })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// PUT /api/instructors/:id
router.put('/:id', (req, res) => {
    const id = req.params.id
    const data = req.body

    try {
        const instructor = getOne('SELECT * FROM instructors WHERE id = ?', [id])
        if (!instructor) return res.status(404).json({ error: 'Instructor not found' })

        const updateFields = []
        const params = []

        if (data.name !== undefined) {
            updateFields.push('name = ?')
            params.push(data.name)
        }
        if (data.displayName !== undefined) {
            updateFields.push('display_name = ?')
            params.push(data.displayName)
        }
        if (data.avatarData !== undefined) {
            updateFields.push('avatar_data = ?')
            params.push(data.avatarData)
        }

        if (updateFields.length === 0) {
            return res.json({ success: true, message: 'No fields to update' })
        }

        updateFields.push('updated_at = ?')
        params.push(new Date().toISOString())

        params.push(id)
        run(`UPDATE instructors SET ${updateFields.join(', ')} WHERE id = ?`, params)
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// DELETE /api/instructors/:id
router.delete('/:id', (req, res) => {
    try {
        run('DELETE FROM instructors WHERE id = ?', [req.params.id])
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

export default router
