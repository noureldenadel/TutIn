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
import path from 'path'
import { getAll, run, transaction, saveDatabase, getDb, getDataDir } from '../database.js'
import { parseMp4Duration } from '../utils/mp4Parser.js'
import { recalculateCourseProgress } from './courses.js'
import { syncCourseNotesToVault } from './notes.js'
import { syncCourseCanvasToVault } from './canvas.js'

const router = express.Router()

function extractHtmlMeta(html, attrNames) {
    for (const name of attrNames) {
        const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i')
        const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["']`, 'i')
        const m = html.match(re1) || html.match(re2)
        if (m?.[1]) return m[1].trim()
    }
    return ''
}

// POST /api/data/fetch-page-metadata
// Pure non-AI OpenGraph metadata extractor for external course URLs
router.post('/fetch-page-metadata', async (req, res) => {
    const { url } = req.body || {}
    if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'Missing URL' })
    }

    let parsed
    try {
        parsed = new URL(url.trim())
    } catch {
        return res.status(400).json({ error: 'Invalid URL' })
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
        return res.status(400).json({ error: 'Only HTTP/HTTPS URLs are supported' })
    }
    const hostLower = parsed.hostname.toLowerCase()
    if (hostLower === 'localhost' || hostLower === '127.0.0.1' || hostLower === '::1') {
        return res.status(400).json({ error: 'Local addresses are not allowed' })
    }

    try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 12000)
        const response = await fetch(parsed.href, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; TutIn/7.0)',
                Accept: 'text/html,application/xhtml+xml',
            },
        })
        clearTimeout(timer)

        if (!response.ok) {
            return res.status(502).json({ error: `Page returned HTTP ${response.status}` })
        }

        const html = await response.text()
        const ogTitle = extractHtmlMeta(html, ['og:title', 'twitter:title'])
        const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || ''
        const siteName = extractHtmlMeta(html, ['og:site_name']) || parsed.hostname.replace(/^www\./, '')
        const rawImage = extractHtmlMeta(html, ['og:image', 'twitter:image'])

        let thumbnail = null
        if (rawImage) {
            try {
                thumbnail = new URL(rawImage, parsed.href).href
            } catch {
                thumbnail = null
            }
        }

        const decodeEntities = (str) =>
            str
                .replace(/&amp;/g, '&')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .trim()

        res.json({
            title: decodeEntities(ogTitle || titleTag),
            siteName: decodeEntities(siteName),
            thumbnail,
        })
    } catch (err) {
        res.status(502).json({ error: err.message || 'Failed to fetch URL metadata' })
    }
})

// DELETE /api/data/reset
// Wipes all user data from the database
router.delete('/reset', (req, res) => {
    try {
        const db = getDb()
        const tables = [
            'dub_jobs',
            'watch_sessions',
            'canvas_strokes',
            'canvas_course_meta',
            'canvas_edges',
            'canvas_nodes',
            'canvas_groups',
            'canvas_viewports',
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

        const screenshotsDir = path.join(getDataDir(), 'screenshots')
        if (fs.existsSync(screenshotsDir)) {
            fs.rmSync(screenshotsDir, { recursive: true, force: true })
            fs.mkdirSync(screenshotsDir, { recursive: true })
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
        const courses = getAll('SELECT * FROM courses')
        const modules = getAll('SELECT * FROM modules')
        const videos = getAll('SELECT * FROM videos')
        const notes = getAll('SELECT * FROM notes')
        const analytics = getAll('SELECT * FROM analytics')
        const sessions = getAll('SELECT * FROM watch_sessions')
        const instructors = getAll('SELECT * FROM instructors')
        const roadmaps = getAll('SELECT * FROM roadmaps')
        const settings = getAll('SELECT * FROM settings')
        const canvas_groups = getAll('SELECT * FROM canvas_groups')
        const canvas_nodes = getAll('SELECT * FROM canvas_nodes')
        const canvas_edges = getAll('SELECT * FROM canvas_edges')
        const canvas_strokes = getAll('SELECT * FROM canvas_strokes')
        const canvas_viewports = getAll('SELECT * FROM canvas_viewports')
        const canvas_course_meta = getAll('SELECT * FROM canvas_course_meta')

        res.json({
            version: 5,
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
            canvas_groups,
            canvas_nodes,
            canvas_edges,
            canvas_strokes,
            canvas_viewports,
            canvas_course_meta,
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
                        'id', 'title', 'original_title', 'description', 'instructor', 'tags',
                        'thumbnail_data', 'folder_path', 'source_type', 'course_url',
                        'date_added', 'date_modified', 'last_accessed', 'last_accessed_click_time',
                        'total_duration', 'total_videos', 'completed_videos', 'completion_percentage',
                        'custom_metadata', '"order"'
                    ])
                }
                if (data.modules) {
                    upsert('modules', data.modules, [
                        'id', 'course_id', 'parent_module_id', 'title', 'original_title',
                        'description', 'thumbnail_data', 'folder_path', '"order"',
                        'total_duration', 'total_videos', 'completed_videos', 'date_added'
                    ])
                }
                if (data.videos) {
                    upsert('videos', data.videos, [
                        'id', 'course_id', 'module_id', 'title', 'original_title', 'description',
                        'file_name', 'file_path', 'file_size', 'duration', 'thumbnail_data', '"order"',
                        'is_required', 'is_completed', 'is_favorite', 'watch_progress',
                        'last_watched_position', 'last_watched_at', 'completed_at', 'watch_count',
                        'tags', 'bookmarks', 'youtube_id', 'url', 'has_transcript', 'has_summary',
                        'transcript_generated_at', 'summary_generated_at', 'subtitle_sources'
                    ])
                }
                if (data.notes) {
                    upsert('notes', data.notes, [
                        'id', 'video_id', 'course_id', 'timestamp', 'content', 'images', 'tags',
                        'created_at', 'updated_at'
                    ])
                }
                if (data.analytics) {
                    upsert('analytics', data.analytics, [
                        'id', 'date', 'watch_time_seconds', 'videos_watched', 'videos_completed',
                        'courses_accessed', 'sessions_count'
                    ])
                }
                if (data.watch_sessions) {
                    upsert('watch_sessions', data.watch_sessions, [
                        'id', 'video_id', 'course_id', 'started_at', 'ended_at',
                        'duration_seconds', 'start_position', 'end_position'
                    ])
                }
                if (data.instructors) {
                    upsert('instructors', data.instructors, [
                        'id', 'name', 'display_name', 'avatar_data', 'updated_at'
                    ])
                }
                if (data.roadmaps) {
                    upsert('roadmaps', data.roadmaps, [
                        'id', 'name', 'nodes', 'connections', 'viewport', 'is_active',
                        'created_at', 'updated_at'
                    ])
                }
                if (data.canvas_groups) {
                    upsert('canvas_groups', data.canvas_groups, [
                        'id', 'course_id', 'type', 'lesson_idx', 'video_id', 'title', 'subtitle',
                        'x', 'y', 'width', 'height', 'tint_index', 'layout_mode', 'collapsed', 'sort_order',
                        'created_at', 'updated_at'
                    ])
                }
                if (data.canvas_nodes) {
                    upsert('canvas_nodes', data.canvas_nodes, [
                        'id', 'course_id', 'note_id', 'type', 'content', 'title',
                        'x', 'y', 'width', 'height', 'color', 'parent_group_id', 'collapsed',
                        'origin_lesson_idx', 'origin_video_id', 'timestamp',
                        'membership_state', 'is_canvas_only', 'image_src', 'caption', 'accent_index',
                        'created_at', 'updated_at'
                    ])
                }
                if (data.canvas_edges) {
                    upsert('canvas_edges', data.canvas_edges, [
                        'id', 'course_id', 'from_node_id', 'to_node_id',
                        'edge_kind', 'from_side', 'to_side', 'style', 'label', 'created_at'
                    ])
                }
                if (data.canvas_strokes) {
                    upsert('canvas_strokes', data.canvas_strokes, [
                        'id', 'course_id', 'tool', 'points', 'color_token', 'size',
                        'parent_group_id', 'sort_order', 'created_at'
                    ])
                }
                if (data.canvas_viewports) {
                    for (const row of data.canvas_viewports) {
                        db.run(
                            `INSERT INTO canvas_viewports (course_id, pan_x, pan_y, zoom, updated_at) VALUES (?, ?, ?, ?, ?)
                         ON CONFLICT(course_id) DO UPDATE SET pan_x = excluded.pan_x, pan_y = excluded.pan_y, zoom = excluded.zoom, updated_at = excluded.updated_at`,
                            [row.course_id, row.pan_x ?? 0, row.pan_y ?? 0, row.zoom ?? 1, row.updated_at || new Date().toISOString()]
                        )
                    }
                }
                if (data.canvas_course_meta) {
                    for (const row of data.canvas_course_meta) {
                        db.run(
                            `INSERT INTO canvas_course_meta (course_id, dismissed_note_ids, last_sync_revision, updated_at) VALUES (?, ?, ?, ?)
                         ON CONFLICT(course_id) DO UPDATE SET dismissed_note_ids = excluded.dismissed_note_ids, last_sync_revision = excluded.last_sync_revision, updated_at = excluded.updated_at`,
                            [row.course_id, row.dismissed_note_ids || '[]', row.last_sync_revision ?? 0, row.updated_at || new Date().toISOString()]
                        )
                    }
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

        const importedNoteCourseIds = new Set(
            (Array.isArray(data.notes) ? data.notes : [])
                .map(n => n?.course_id)
                .filter(Boolean)
        )
        for (const cid of importedNoteCourseIds) {
            syncCourseNotesToVault(cid)
        }

        const importedCanvasCourseIds = new Set([
            ...(Array.isArray(data.canvas_groups) ? data.canvas_groups.map(r => r?.course_id) : []),
            ...(Array.isArray(data.canvas_nodes) ? data.canvas_nodes.map(r => r?.course_id) : []),
            ...(Array.isArray(data.canvas_edges) ? data.canvas_edges.map(r => r?.course_id) : []),
            ...(Array.isArray(data.canvas_strokes) ? data.canvas_strokes.map(r => r?.course_id) : []),
            ...(Array.isArray(data.canvas_course_meta) ? data.canvas_course_meta.map(r => r?.course_id) : []),
        ].filter(Boolean))
        for (const cid of importedCanvasCourseIds) {
            syncCourseCanvasToVault(cid)
        }

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

        // Recalculate totals and progress for affected courses
        for (const courseId of coursesToRecalc) {
            recalculateCourseProgress(courseId)
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
