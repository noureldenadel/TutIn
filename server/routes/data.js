/**
 * Data Routes — /api/data/*
 *
 * Handles database lifecycle operations:
 * - Export all data as JSON
 * - Import / restore from JSON
 * - Reset (clear) all data
 * - Detect and fix missing video durations
 */

import express from 'express'
import fs from 'fs'
import { getAll, run, transaction, saveDatabase, getDb } from '../database.js'
import { parseMp4Duration } from '../utils/mp4Parser.js'

const router = express.Router()

// DELETE /api/data/reset
// Wipes all user data from the database
router.delete('/reset', (req, res) => {
    try {
        const db = getDb()
        const tables = [
            'dub_jobs',
            'watch_sessions',
            'analytics',
            'notes',
            'videos',
            'modules',
            'courses',
            'instructors',
            'roadmaps',
            'settings',
        ]
        db.run('PRAGMA foreign_keys = OFF')
        try {
            transaction(() => {
                for (const table of tables) {
                    db.run(`DELETE FROM ${table}`)
                }
            })
        } finally {
            db.run('PRAGMA foreign_keys = ON')
        }
        saveDatabase()
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// POST /api/data/download-image
// Downloads an image from a URL and returns it as a Base64 string for offline storage
router.post('/download-image', async (req, res) => {
    const { url } = req.body
    if (!url) return res.status(400).json({ error: 'Missing URL' })

    try {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`)
        
        const arrayBuffer = await response.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        const contentType = response.headers.get('content-type') || 'image/jpeg'
        const base64 = `data:${contentType};base64,${buffer.toString('base64')}`
        
        res.json({ base64 })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// GET /api/data/export
// Returns the full database contents as a JSON snapshot
router.get('/export', (req, res) => {
    try {
        const courses     = getAll('SELECT * FROM courses')
        const modules     = getAll('SELECT * FROM modules')
        const videos      = getAll('SELECT * FROM videos')
        const notes       = getAll('SELECT * FROM notes')
        const analytics   = getAll('SELECT * FROM analytics')
        const sessions    = getAll('SELECT * FROM watch_sessions')
        const instructors = getAll('SELECT * FROM instructors')
        const roadmaps    = getAll('SELECT * FROM roadmaps')
        const settings    = getAll('SELECT * FROM settings')
        const dub_jobs    = getAll('SELECT * FROM dub_jobs')

        res.json({
            version: 4,
            exportedAt: new Date().toISOString(),
            courses,
            modules,
            videos,
            notes,
            analytics,
            watch_sessions: sessions,
            instructors,
            roadmaps,
            settings,
            dub_jobs,
        })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// POST /api/data/import
// Restores data from a JSON snapshot (merges or replaces)
router.post('/import', (req, res) => {
    const data = req.body
    if (!data || typeof data !== 'object') {
        return res.status(400).json({ error: 'Invalid import data' })
    }

    try {
        const db = getDb()
        db.run('PRAGMA foreign_keys = OFF')
        try {
            transaction(() => {

            // Helper: upsert rows into a table
            const upsert = (table, rows, columns) => {
                if (!Array.isArray(rows) || rows.length === 0) return
                const placeholders = columns.map(() => '?').join(', ')
                const colList = columns.join(', ')
                const updateSet = columns
                    .filter(c => c !== 'id')
                    .map(c => `${c} = excluded.${c}`)
                    .join(', ')

                for (const row of rows) {
                    const values = columns.map(c => {
                        // Strip surrounding double-quotes for key lookup (e.g. '"order"' → 'order')
                        const key = c.replace(/^"|"$/g, '')
                        const v = row[key]
                        return v === undefined ? null : v
                    })
                    db.run(
                        `INSERT INTO ${table} (${colList}) VALUES (${placeholders})
                         ON CONFLICT(id) DO UPDATE SET ${updateSet}`,
                        values
                    )
                }
            }

            if (data.courses) {
                upsert('courses', data.courses, [
                    'id','title','original_title','description','instructor','tags',
                    'thumbnail_data','folder_path','source_type','course_url',
                    'date_added','date_modified','last_accessed','last_accessed_click_time',
                    'total_duration','total_videos','completed_videos','completion_percentage',
                    'custom_metadata','"order"'
                ])
            }
            if (data.modules) {
                upsert('modules', data.modules, [
                    'id','course_id','parent_module_id','title','original_title',
                    'description','thumbnail_data','folder_path','"order"',
                    'total_duration','total_videos','completed_videos','date_added'
                ])
            }
            if (data.videos) {
                upsert('videos', data.videos, [
                    'id','course_id','module_id','title','original_title','description',
                    'file_name','file_path','file_size','duration','thumbnail_data','"order"',
                    'is_required','is_completed','is_favorite','watch_progress',
                    'last_watched_position','last_watched_at','completed_at','watch_count',
                    'tags','bookmarks','youtube_id','url','has_transcript','has_summary',
                    'transcript_generated_at','summary_generated_at','subtitle_sources'
                ])
            }
            if (data.notes) {
                upsert('notes', data.notes, [
                    'id','video_id','course_id','timestamp','content','images','tags',
                    'created_at','updated_at'
                ])
            }
            if (data.analytics) {
                upsert('analytics', data.analytics, [
                    'id','date','watch_time_seconds','videos_watched','videos_completed',
                    'courses_accessed','sessions_count'
                ])
            }
            if (data.watch_sessions) {
                upsert('watch_sessions', data.watch_sessions, [
                    'id','video_id','course_id','started_at','ended_at',
                    'duration_seconds','start_position','end_position'
                ])
            }
            if (data.instructors) {
                upsert('instructors', data.instructors, [
                    'id','name','display_name','avatar_data','updated_at'
                ])
            }
            if (data.roadmaps) {
                upsert('roadmaps', data.roadmaps, [
                    'id','name','nodes','connections','viewport','is_active',
                    'created_at','updated_at'
                ])
            }
            if (data.dub_jobs) {
                upsert('dub_jobs', data.dub_jobs, [
                    'id','video_id','language','status','step','progress',
                    'audio_path','file_size','error_message','created_at','completed_at'
                ])
            }
            if (data.settings) {
                for (const row of data.settings) {
                    db.run(
                        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
                         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
                        [row.key, row.value, row.updated_at || new Date().toISOString()]
                    )
                }
            }

        })
        } finally {
            db.run('PRAGMA foreign_keys = ON')
        }

        saveDatabase()
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// POST /api/data/detect-durations
// Scans all videos with missing/zero durations and attempts to repair them
router.post('/detect-durations', async (req, res) => {
    try {
        const videos = getAll(
            `SELECT id, file_path, duration, course_id
             FROM videos
             WHERE (duration < 1 OR duration > 36000) AND file_path IS NOT NULL`
        )

        let fixed = 0
        let failed = 0
        const coursesToRecalc = new Set()

        for (const video of videos) {
            if (!video.file_path || !fs.existsSync(video.file_path)) {
                failed++
                continue
            }
            try {
                const duration = await parseMp4Duration(video.file_path)
                const floored = Math.floor(duration || 0)
                if (floored >= 1 && floored <= 36000) {
                    run('UPDATE videos SET duration = ? WHERE id = ?', [floored, video.id])
                    coursesToRecalc.add(video.course_id)
                    fixed++
                } else {
                    failed++
                }
            } catch {
                failed++
            }
        }

        // Recalculate total_duration for affected courses
        for (const courseId of coursesToRecalc) {
            const courseVideos = getAll(
                'SELECT duration FROM videos WHERE course_id = ?', [courseId]
            )
            const totalDuration = courseVideos.reduce((sum, v) => sum + (v.duration || 0), 0)
            run('UPDATE courses SET total_duration = ? WHERE id = ?', [totalDuration, courseId])
        }

        if (fixed > 0) saveDatabase()

        res.json({
            success: true,
            total: videos.length,
            fixed,
            failed,
        })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

export default router
