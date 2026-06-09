import express from 'express'
import { getAll } from '../database.js'

const router = express.Router()

// GET /api/search?q=query
router.get('/', (req, res) => {
    const q = req.query.q
    if (!q) return res.json([])

    const searchTerm = `%${q}%`
    
    try {
        // Search courses
        const courses = getAll(`
            SELECT id, 'course' as type, title, description, instructor, tags
            FROM courses 
            WHERE title LIKE ? OR description LIKE ? OR instructor LIKE ? OR tags LIKE ?
        `, [searchTerm, searchTerm, searchTerm, searchTerm])
        
        // Search modules
        const modules = getAll(`
            SELECT m.id, 'module' as type, m.title, m.description, c.title as course_title, c.id as course_id
            FROM modules m
            JOIN courses c ON m.course_id = c.id
            WHERE m.title LIKE ? OR m.description LIKE ?
        `, [searchTerm, searchTerm])
        
        // Search videos
        const videos = getAll(`
            SELECT v.id, 'video' as type, v.title, v.description, v.tags, c.title as course_title, c.id as course_id
            FROM videos v
            JOIN courses c ON v.course_id = c.id
            WHERE v.title LIKE ? OR v.description LIKE ? OR v.tags LIKE ?
        `, [searchTerm, searchTerm, searchTerm])
        
        // Search notes
        const notes = getAll(`
            SELECT n.id, 'note' as type, n.content, n.tags, v.title as video_title, v.id as video_id, c.id as course_id
            FROM notes n
            JOIN videos v ON n.video_id = v.id
            JOIN courses c ON n.course_id = c.id
            WHERE n.content LIKE ? OR n.tags LIKE ?
        `, [searchTerm, searchTerm])
        
        // Combine results
        const results = [...courses, ...modules, ...videos, ...notes]
        res.json(results)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

export default router
