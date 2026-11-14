import express from 'express'
import fs from 'fs'
import path from 'path'
import { getAll, getOne, run } from '../database.js'
import {
    listDubLanguages,
    getDubFilePathForPlayback,
    getDubCachePath
} from '../utils/courseAssets.js'

const router = express.Router()

/**
 * Resolve course, module, and filename metadata needed to locate dubbed MP3 assets for a video.
 */
function getVideoDubMeta(videoId) {
    const video = getOne('SELECT * FROM videos WHERE id = ?', [videoId])
    if (!video) return null

    const moduleRecord = video.module_id
        ? getOne('SELECT folder_path FROM modules WHERE id = ?', [video.module_id])
        : null
    const courseRecord = video.course_id
        ? getOne('SELECT folder_path FROM courses WHERE id = ?', [video.course_id])
        : null

    let relModulePath = ''
    if (moduleRecord?.folder_path && courseRecord?.folder_path) {
        relModulePath = path.relative(courseRecord.folder_path, moduleRecord.folder_path)
        if (relModulePath === '.' || relModulePath.startsWith('..')) relModulePath = ''
    } else if (video.file_path && courseRecord?.folder_path) {
        const relDir = path.dirname(path.relative(courseRecord.folder_path, video.file_path))
        if (relDir && relDir !== '.' && !relDir.startsWith('..')) relModulePath = relDir
    }

    const videoBaseName = video.file_name
        ? path.basename(video.file_name, path.extname(video.file_name))
        : video.id

    let dubbedTracks = []
    try {
        dubbedTracks = JSON.parse(video.dubbed_tracks || '[]')
    } catch {
        dubbedTracks = []
    }

    return {
        id: video.id,
        courseFolder: courseRecord?.folder_path || null,
        relModulePath,
        videoBaseName,
        dubbedTracks: Array.isArray(dubbedTracks) ? dubbedTracks : []
    }
}

function normalizeLangParam(rawLang) {
    const lang = String(rawLang || 'en').trim().toLowerCase()
    if (!lang || lang.includes('..') || lang.includes('/') || lang.includes('\\')) {
        return null
    }
    return lang
}

function resolveDubAudioPath(meta, lang) {
    const resolvedFromVault = getDubFilePathForPlayback(
        meta.id,
        lang,
        meta.courseFolder,
        meta.relModulePath,
        meta.videoBaseName
    )
    if (resolvedFromVault && fs.existsSync(resolvedFromVault)) {
        return resolvedFromVault
    }

    const doneJob = getOne(
        `SELECT audio_path FROM dub_jobs
         WHERE video_id = ? AND LOWER(language) = ? AND status = 'done'
         ORDER BY completed_at DESC, created_at DESC LIMIT 1`,
        [meta.id, lang]
    )
    if (doneJob?.audio_path && fs.existsSync(doneJob.audio_path)) {
        return doneJob.audio_path
    }

    const trackEntry = meta.dubbedTracks.find(
        (t) =>
            t?.language &&
            String(t.language).trim().toLowerCase() === lang &&
            t.status !== 'failed' &&
            t.filePath &&
            fs.existsSync(t.filePath)
    )
    if (trackEntry?.filePath) {
        return trackEntry.filePath
    }

    const cachePath = getDubCachePath(meta.id, lang)
    if (cachePath && fs.existsSync(cachePath)) {
        return cachePath
    }

    return null
}

// GET /api/dub/video/:videoId/languages - List available dubbed audio languages whose MP3 exists on disk
router.get('/video/:videoId/languages', (req, res) => {
    try {
        const meta = getVideoDubMeta(req.params.videoId)
        if (!meta) {
            return res.status(404).json({ error: 'Video not found' })
        }

        const langs = new Set()

        const fsLangs = listDubLanguages(
            meta.id,
            meta.courseFolder,
            meta.relModulePath,
            meta.videoBaseName
        )
        for (const l of fsLangs) {
            if (l) langs.add(String(l).trim().toLowerCase())
        }

        const dbJobs = getAll(
            "SELECT DISTINCT language, audio_path FROM dub_jobs WHERE video_id = ? AND status = 'done'",
            [meta.id]
        )
        for (const j of dbJobs) {
            if (j.language && j.audio_path && fs.existsSync(j.audio_path)) {
                langs.add(String(j.language).trim().toLowerCase())
            }
        }

        for (const t of meta.dubbedTracks) {
            if (
                t?.language &&
                t.status !== 'failed' &&
                t.filePath &&
                fs.existsSync(t.filePath)
            ) {
                langs.add(String(t.language).trim().toLowerCase())
            }
        }

        res.json({
            videoId: meta.id,
            languages: Array.from(langs)
        })
    } catch (err) {
        console.error('Failed to list dub languages:', err)
        res.status(500).json({ error: err.message })
    }
})

// GET /api/dub/audio/:videoId?lang=ar - Stream dubbed MP3 audio with HTTP Range support
router.get('/audio/:videoId', (req, res) => {
    try {
        const lang = normalizeLangParam(req.query.lang)
        if (!lang) {
            return res.status(400).json({ error: 'Invalid language parameter' })
        }

        const meta = getVideoDubMeta(req.params.videoId)
        if (!meta) {
            return res.status(404).json({ error: 'Video not found' })
        }

        const audioPath = resolveDubAudioPath(meta, lang)
        if (!audioPath || !fs.existsSync(audioPath)) {
            return res.status(404).json({ error: 'Dubbed audio not found' })
        }

        const stat = fs.statSync(audioPath)
        const fileSize = stat.size
        const range = req.headers.range

        if (range) {
            const parts = range.replace(/bytes=/, '').split('-')
            const start = Number.parseInt(parts[0], 10)
            const end = parts[1] ? Number.parseInt(parts[1], 10) : fileSize - 1

            if (Number.isNaN(start) || Number.isNaN(end) || start > end || start < 0 || end >= fileSize) {
                res.status(416).set({ 'Content-Range': `bytes */${fileSize}` }).end()
                return
            }

            const chunkSize = end - start + 1
            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunkSize,
                'Content-Type': 'audio/mpeg',
                'Cache-Control': 'no-cache'
            })
            const stream = fs.createReadStream(audioPath, { start, end })
            res.on('close', () => stream.destroy())
            stream.pipe(res)
            return
        }

        res.writeHead(200, {
            'Content-Length': fileSize,
            'Content-Type': 'audio/mpeg',
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-cache'
        })
        const stream = fs.createReadStream(audioPath)
        res.on('close', () => stream.destroy())
        stream.pipe(res)
    } catch (err) {
        console.error('Failed to stream dubbed audio:', err)
        res.status(500).json({ error: err.message })
    }
})

// DELETE /api/dub/video/:videoId?lang=ar - Delete a dubbed audio track
router.delete('/video/:videoId', (req, res) => {
    try {
        const lang = normalizeLangParam(req.query.lang)
        if (!lang) {
            return res.status(400).json({ error: 'Invalid language parameter' })
        }

        const meta = getVideoDubMeta(req.params.videoId)
        if (!meta) {
            return res.status(404).json({ error: 'Video not found' })
        }

        const candidatePaths = new Set()
        const vaultPath = getDubFilePathForPlayback(
            meta.id,
            lang,
            meta.courseFolder,
            meta.relModulePath,
            meta.videoBaseName
        )
        if (vaultPath) candidatePaths.add(vaultPath)

        const cachePath = getDubCachePath(meta.id, lang)
        if (cachePath) candidatePaths.add(cachePath)

        const dbJobs = getAll(
            'SELECT audio_path FROM dub_jobs WHERE video_id = ? AND LOWER(language) = ?',
            [meta.id, lang]
        )
        for (const j of dbJobs) {
            if (j?.audio_path) candidatePaths.add(j.audio_path)
        }

        for (const t of meta.dubbedTracks) {
            if (t?.language && String(t.language).trim().toLowerCase() === lang && t.filePath) {
                candidatePaths.add(t.filePath)
            }
        }

        for (const p of candidatePaths) {
            try {
                if (p && fs.existsSync(p)) fs.unlinkSync(p)
            } catch { }
        }

        try {
            run('DELETE FROM dub_jobs WHERE video_id = ? AND LOWER(language) = ?', [meta.id, lang])
        } catch { }

        const remainingTracks = meta.dubbedTracks.filter(
            (t) => !t?.language || String(t.language).trim().toLowerCase() !== lang
        )
        run('UPDATE videos SET dubbed_tracks = ? WHERE id = ?', [
            JSON.stringify(remainingTracks),
            meta.id
        ])

        res.json({ success: true, language: lang })
    } catch (err) {
        console.error('Failed to delete dub track:', err)
        res.status(500).json({ error: err.message })
    }
})

export default router
