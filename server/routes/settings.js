import express from 'express'
import fs from 'fs'
import path from 'path'
import { getAll, getOne, run, transaction, getDataDir, getDb, saveDatabase } from '../database.js'

const router = express.Router()

// GET /api/settings
router.get('/', (req, res) => {
    try {
        const rows = getAll('SELECT * FROM settings')
        const settings = {}
        
        for (const row of rows) {
            try {
                settings[row.key] = JSON.parse(row.value)
            } catch (e) {
                // Handle raw strings if they were saved incorrectly
                settings[row.key] = row.value
            }
        }
        
        res.json(settings)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// PUT /api/settings
router.put('/', (req, res) => {
    const updates = req.body
    
    if (!updates || typeof updates !== 'object') {
        return res.status(400).json({ error: 'Invalid settings object' })
    }

    try {
        const now = new Date().toISOString()
        
        transaction(() => {
            for (const [key, value] of Object.entries(updates)) {
                // We serialize everything to JSON
                const stringValue = JSON.stringify(value)
                
                run(`
                    INSERT INTO settings (key, value, updated_at) 
                    VALUES (?, ?, ?)
                    ON CONFLICT(key) DO UPDATE SET 
                        value = excluded.value, 
                        updated_at = excluded.updated_at
                `, [key, stringValue, now])
            }
        })
        
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// DELETE /api/settings/reset
router.delete('/reset', (req, res) => {
    try {
        const db = getDb()
        db.run('PRAGMA foreign_keys = OFF')
        try {
            transaction(() => {
                db.run('DELETE FROM watch_sessions')
                db.run('DELETE FROM notes')
                db.run('DELETE FROM videos')
                db.run('DELETE FROM modules')
                db.run('DELETE FROM courses')
                db.run('DELETE FROM analytics')
                db.run('DELETE FROM instructors')
                db.run('DELETE FROM roadmaps')
                db.run('DELETE FROM settings')
            })
        } finally {
            db.run('PRAGMA foreign_keys = ON')
        }

        saveDatabase()

        // Clear file storage (transcripts and summaries)
        const dataDir = getDataDir()
        const dirsToClear = ['transcripts', 'summaries']
        
        for (const dirName of dirsToClear) {
            const dirPath = path.join(dataDir, dirName)
            if (fs.existsSync(dirPath)) {
                const files = fs.readdirSync(dirPath)
                for (const file of files) {
                    try {
                        fs.unlinkSync(path.join(dirPath, file))
                    } catch (e) {
                        console.error(`Failed to delete ${file}:`, e)
                    }
                }
            }
        }

        res.json({ success: true, message: 'All data deleted successfully' })
    } catch (err) {
        console.error('[Settings Reset] Failed:', err.message)
        res.status(500).json({ error: err.message })
    }
})

export default router
