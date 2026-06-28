/**
 * TutIn Server — Main Entry Point
 * 
 * Lightweight Express server that provides:
 * - REST API for all data operations (SQLite)
 * - Video streaming with range request support
 * - Native filesystem access (no browser permission needed)
 * 
 * The React web app talks to this server via fetch().
 * The server is required — the React app cannot function without it.
 */

import express from 'express'
import cors from 'cors'
import { initDatabase, closeDatabase, getDb, getDataDir, getAll, getOne, run, transaction, saveDatabase } from './database.js'
import { streamVideo, setAllowedRoots, addAllowedRoot } from './services/videoStreamer.js'
import { repairPaths } from './services/pathRepair.js'
import { parseMp4Duration } from './utils/mp4Parser.js'
import path from 'path'
import fs from 'fs'

const app = express()
const DEFAULT_PORT = 9474

// ============================================
// MIDDLEWARE
// ============================================

// CORS — allow the React dev server (and any localhost origin)
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (same-origin, curl, etc.)
        if (!origin) return callback(null, true)
        // Allow any localhost origin
        if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
            return callback(null, true)
        }
        callback(new Error('CORS not allowed'), false)
    },
    credentials: true,
}))

// Parse JSON bodies (generous limit for base64 images)
app.use(express.json({ limit: '50mb' }))

// ============================================
// HEALTH CHECK
// ============================================

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        version: '4.0.0',
        port: server?.address()?.port || DEFAULT_PORT,
        dataDir: getDataDir(),
        uptime: Math.floor(process.uptime()),
    })
})

// ============================================
// VIDEO STREAMING
// ============================================

app.get('/video/*filePath', streamVideo)

import coursesRouter from './routes/courses.js'
import modulesRouter from './routes/modules.js'
import videosRouter from './routes/videos.js'
import notesRouter from './routes/notes.js'
import analyticsRouter from './routes/analytics.js'
import instructorsRouter from './routes/instructors.js'
import roadmapsRouter from './routes/roadmaps.js'
import settingsRouter from './routes/settings.js'
import transcriptsRouter from './routes/transcripts.js'
import summariesRouter from './routes/summaries.js'
import searchRouter from './routes/search.js'
import dataRouter from './routes/data.js'
import fsRouter from './routes/filesystem.js'
import dubbingRouter from './routes/dubbing.js'
import youtubeRouter from './routes/youtube.js'

// ============================================
// MOUNT ROUTES
// ============================================

app.use('/api/courses', coursesRouter)
app.use('/api/modules', modulesRouter)
app.use('/api/videos', videosRouter)
app.use('/api/notes', notesRouter)
app.use('/api/analytics', analyticsRouter)
app.use('/api/instructors', instructorsRouter)
app.use('/api/roadmaps', roadmapsRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/transcripts', transcriptsRouter)
app.use('/api/summaries', summariesRouter)
app.use('/api/search', searchRouter)
app.use('/api/data', dataRouter)
app.use('/api/fs', fsRouter)
app.use('/api/dub', dubbingRouter)
app.use('/api/youtube', youtubeRouter)

// ============================================
// STATIC FILE SERVING (PRODUCTION)
// ============================================
import { fileURLToPath } from 'url'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(__dirname, '../dist')
    if (fs.existsSync(distPath)) {
        app.use(express.static(distPath))
        app.use((req, res, next) => {
            if (req.method === 'GET' && !req.path.startsWith('/api/')) {
                res.sendFile(path.join(distPath, 'index.html'))
            } else {
                next()
            }
        })
    } else {
        console.warn('\n[Warning] Production mode enabled but dist/ folder not found. Please run "npm run build".\n')
    }
}
// ============================================
// STARTUP
// ============================================

let server

async function start() {
    // Initialize database (async because sql.js loads WASM)
    await initDatabase()

    // Load allowed roots from settings
    loadAllowedRoots()

    // Repair missing file paths (for courses missing filesystem paths)
    try {
        repairPaths()
    } catch (err) {
        console.error('[PathRepair] Error:', err.message)
    }

    // Find available port and start
    const port = await findAvailablePort(DEFAULT_PORT)

    server = app.listen(port, '127.0.0.1', () => {
        console.log('')
        console.log('  ╔══════════════════════════════════════════╗')
        console.log('  ║                                          ║')
        console.log(`  ║   🎓 TutIn Server v4.0                   ║`)
        console.log(`  ║   http://127.0.0.1:${port}                 ║`)
        console.log('  ║                                          ║')
        console.log(`  ║   Data: ${getDataDir()}`)
        console.log('  ║                                          ║')
        console.log('  ╚══════════════════════════════════════════╝')
        console.log('')
    })

    // Background job: Scan videos periodically and fix missing/invalid durations silently
    setInterval(async () => {
        try {
            const videos = getAll('SELECT id, file_path, duration, course_id FROM videos WHERE (duration < 1 OR duration > 36000) AND file_path IS NOT NULL')
            if (videos.length === 0) return

            let updated = 0
            const coursesToRecalc = new Set()

            for (const video of videos) {
                if (!video.file_path || !fs.existsSync(video.file_path)) continue
                try {
                    const duration = await parseMp4Duration(video.file_path)
                    if (duration >= 1 && duration <= 36000) {
                        run('UPDATE videos SET duration = ? WHERE id = ?', [Math.floor(duration), video.id])
                        coursesToRecalc.add(video.course_id)
                        updated++
                    }
                } catch (e) { }
            }

            for (const courseId of coursesToRecalc) {
                const courseVideos = getAll('SELECT duration FROM videos WHERE course_id = ?', [courseId])
                const totalDuration = courseVideos.reduce((sum, v) => sum + (v.duration || 0), 0)
                run('UPDATE courses SET total_duration = ? WHERE id = ?', [totalDuration, courseId])
            }

            if (updated > 0) {
                saveDatabase()
                console.log(`[BackgroundJob] Silently fixed ${updated} video durations.`)
            }
        } catch (err) {
            console.error('[BackgroundJob] Error fixing durations:', err.message)
        }
    }, 60 * 60 * 1000) // Run every 1 hour
}

function loadAllowedRoots() {
    try {
        const row = getOne('SELECT value FROM settings WHERE key = ?', ['root_folder_path'])
        if (row?.value) {
            const rootPath = JSON.parse(row.value)
            setAllowedRoots([rootPath])
        }

        // Also allow parent dirs of all known course folders
        const courses = getAll('SELECT DISTINCT folder_path FROM courses WHERE folder_path IS NOT NULL')
        for (const course of courses) {
            if (course.folder_path) {
                addAllowedRoot(path.dirname(course.folder_path))
                addAllowedRoot(course.folder_path)
            }
        }
    } catch {
        // Settings table might be empty on first run
    }
}

function findAvailablePort(startPort) {
    return new Promise((resolve, reject) => {
        const testServer = app.listen(startPort, '127.0.0.1')
        testServer.on('listening', () => {
            testServer.close(() => resolve(startPort))
        })
        testServer.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                resolve(findAvailablePort(startPort + 1))
            } else {
                reject(err)
            }
        })
    })
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n[Server] Shutting down...')
    closeDatabase()
    server?.close()
    process.exit(0)
})

process.on('SIGTERM', () => {
    console.log('\n[Server] Shutting down...')
    closeDatabase()
    server?.close()
    process.exit(0)
})

start().catch(err => {
    console.error('Failed to start server:', err)
    process.exit(1)
})
