import express from 'express'
import fs from 'fs'
import path from 'path'
import { run, getOne, getDataDir } from '../database.js'
import { saveVaultSummary, loadVaultSummary, deleteVaultSummary } from '../utils/courseAssets.js'

const router = express.Router()

function getAppDataSummariesDir() {
    const dir = path.join(getDataDir(), 'summaries')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    return dir
}

function getVideoMeta(videoId) {
    const video = getOne(`
        SELECT v.id, v.file_name, v.file_path, c.folder_path as course_folder
        FROM videos v
        LEFT JOIN courses c ON v.course_id = c.id
        WHERE v.id = ?
    `, [videoId])
    if (!video) return { id: videoId }
    
    const courseFolder = video.course_folder
    const relModulePath = (courseFolder && video.file_path)
        ? path.dirname(path.relative(courseFolder, video.file_path)).replace(/\\/g, '/')
        : ''
    const cleanRel = relModulePath === '.' ? '' : relModulePath
    const videoBaseName = video.file_name ? path.basename(video.file_name, path.extname(video.file_name)) : video.id

    return {
        id: video.id,
        courseFolder,
        relModulePath: cleanRel,
        videoBaseName
    }
}

// GET /api/summaries/:videoId
router.get('/:videoId', (req, res) => {
    try {
        const meta = getVideoMeta(req.params.videoId)
        
        if (meta.courseFolder && fs.existsSync(meta.courseFolder)) {
            const vaultContent = loadVaultSummary(meta.courseFolder, meta.relModulePath, meta.videoBaseName)
            if (vaultContent !== null) {
                return res.json({ content: vaultContent })
            }
            return res.json({ content: '' })
        }

        // Cloud course fallback
        const filePath = path.join(getAppDataSummariesDir(), `${req.params.videoId}.md`)
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
        const meta = getVideoMeta(req.params.videoId)
        
        if (meta.courseFolder && fs.existsSync(meta.courseFolder)) {
            saveVaultSummary(meta.courseFolder, meta.relModulePath, meta.videoBaseName, content)
            // Clean up any stale AppData summary file
            try {
                const stale = path.join(getAppDataSummariesDir(), `${req.params.videoId}.md`)
                if (fs.existsSync(stale)) fs.unlinkSync(stale)
            } catch { }
        } else {
            const filePath = path.join(getAppDataSummariesDir(), `${req.params.videoId}.md`)
            fs.writeFileSync(filePath, content || '')
        }
        
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
        const meta = getVideoMeta(req.params.videoId)
        
        if (meta.courseFolder && fs.existsSync(meta.courseFolder)) {
            deleteVaultSummary(meta.courseFolder, meta.relModulePath, meta.videoBaseName)
        }
        
        const filePath = path.join(getAppDataSummariesDir(), `${req.params.videoId}.md`)
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
