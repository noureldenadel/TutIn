import express from 'express'
import fs from 'fs'
import path from 'path'
import { run, getDataDir } from '../database.js'

const router = express.Router()

function getSummariesDir() {
    const dir = path.join(getDataDir(), 'summaries')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    return dir
}

// GET /api/summaries/:videoId
router.get('/:videoId', (req, res) => {
    try {
        const filePath = path.join(getSummariesDir(), `${req.params.videoId}.md`)
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8')
            res.json({ content })
        } else {
            res.json({ content: '' })
        }
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// PUT /api/summaries/:videoId
router.put('/:videoId', (req, res) => {
    const { content } = req.body
    
    try {
        const filePath = path.join(getSummariesDir(), `${req.params.videoId}.md`)
        fs.writeFileSync(filePath, content || '')
        
        run(`UPDATE videos SET has_summary = 1, summary_generated_at = ? WHERE id = ?`, [
            new Date().toISOString(),
            req.params.videoId
        ])
        
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// DELETE /api/summaries/:videoId
router.delete('/:videoId', (req, res) => {
    try {
        const filePath = path.join(getSummariesDir(), `${req.params.videoId}.md`)
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath)
        }
        
        run(`UPDATE videos SET has_summary = 0, summary_generated_at = NULL WHERE id = ?`, [
            req.params.videoId
        ])
        
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

export default router
