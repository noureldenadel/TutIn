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

// GET /api/settings/openrouter-status — returns whether key is configured (does NOT expose the key)
router.get('/openrouter-status', (req, res) => {
    try {
        const row = getOne("SELECT value FROM settings WHERE key = 'openRouterApiKey'")
        const hasKey = !!row?.value && JSON.parse(row.value)?.trim()?.length > 0
        res.json({ hasKey: !!hasKey })
    } catch {
        res.json({ hasKey: false })
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

// ── Punctuation Model Cache Management ─────────────────────────

function getDirSizeBytes(dirPath) {
    let size = 0
    if (!fs.existsSync(dirPath)) return 0
    try {
        const files = fs.readdirSync(dirPath, { withFileTypes: true })
        for (const file of files) {
            const p = path.join(dirPath, file.name)
            if (file.isDirectory()) {
                size += getDirSizeBytes(p)
            } else if (file.isFile()) {
                size += fs.statSync(p).size
            }
        }
    } catch {}
    return size
}

// GET /api/settings/punctuation-models
router.get('/punctuation-models', async (req, res) => {
    try {
        const modelsDir = path.join(process.cwd(), 'models', 'punctuation')
        const langs = ['en', 'ar', 'es', 'fr', 'de', 'it']
        const models = []
        let totalBytes = 0

        // Check python server loaded models if running
        let loadedInPython = []
        try {
            const pyRes = await fetch('http://127.0.0.1:9475/models/punctuation')
            if (pyRes.ok) {
                const pyData = await pyRes.json()
                loadedInPython = pyData.loaded_models || []
            }
        } catch {}

        for (const lang of langs) {
            const langDir = path.join(modelsDir, lang)
            const sizeBytes = getDirSizeBytes(langDir)
            const isLoaded = loadedInPython.includes(lang)
            const isCached = sizeBytes > 0 || isLoaded

            if (isCached) {
                totalBytes += sizeBytes
                models.push({
                    lang,
                    sizeMb: Number((sizeBytes / (1024 * 1024)).toFixed(1)),
                    isLoaded,
                    isCached: true
                })
            }
        }

        res.json({
            models,
            totalSizeMb: Number((totalBytes / (1024 * 1024)).toFixed(1)),
            supportedLanguages: langs
        })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// DELETE /api/settings/punctuation-models/:lang
router.delete('/punctuation-models/:lang', async (req, res) => {
    try {
        const { lang } = req.params
        const norm = (lang || '').toLowerCase().trim()
        const modelsDir = path.join(process.cwd(), 'models', 'punctuation')
        const langDir = path.join(modelsDir, norm)

        if (fs.existsSync(langDir)) {
            fs.rmSync(langDir, { recursive: true, force: true })
        }

        // Notify python server to unload
        try {
            await fetch(`http://127.0.0.1:9475/models/punctuation/${norm}`, { method: 'DELETE' })
        } catch {}

        res.json({ success: true, lang: norm })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// DELETE /api/settings/punctuation-models
router.delete('/punctuation-models', async (req, res) => {
    try {
        const modelsDir = path.join(process.cwd(), 'models', 'punctuation')
        if (fs.existsSync(modelsDir)) {
            fs.rmSync(modelsDir, { recursive: true, force: true })
            fs.mkdirSync(modelsDir, { recursive: true })
        }

        // Notify python server
        try {
            const pyRes = await fetch('http://127.0.0.1:9475/models/punctuation')
            if (pyRes.ok) {
                const pyData = await pyRes.json()
                for (const m of (pyData.loaded_models || [])) {
                    await fetch(`http://127.0.0.1:9475/models/punctuation/${m}`, { method: 'DELETE' })
                }
            }
        } catch {}

        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

export default router
