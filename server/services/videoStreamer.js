/**
 * TutIn Server — Video Streaming Service
 * 
 * Serves local video files over HTTP with range request support.
 * This replaces the File System Access API — no browser permission needed.
 */

import fs from 'fs'
import path from 'path'

/**
 * MIME types for supported video formats
 */
const VIDEO_MIME_TYPES = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.ogg': 'video/ogg',
    '.m4v': 'video/mp4',
    '.ts': 'video/mp2t',
}

/**
 * List of allowed root directories for video serving.
 * Updated at runtime from settings.
 */
let allowedRoots = []

/**
 * Set the allowed root directories for security
 */
export function setAllowedRoots(roots) {
    allowedRoots = roots.map(r => path.resolve(r))
    console.log(`[VideoStreamer] Allowed roots: ${allowedRoots.join(', ')}`)
}

/**
 * Add an allowed root directory
 */
export function addAllowedRoot(root) {
    const resolved = path.resolve(root)
    if (!allowedRoots.includes(resolved)) {
        allowedRoots.push(resolved)
        console.log(`[VideoStreamer] Added allowed root: ${resolved}`)
    }
}

/**
 * Check if a file path is within allowed directories
 */
function isPathAllowed(filePath) {
    // If no roots configured, allow nothing (secure by default)
    if (allowedRoots.length === 0) return false

    const resolved = path.resolve(filePath)
    return allowedRoots.some(root => resolved.startsWith(root))
}

/**
 * Express route handler for video streaming
 * 
 * Supports HTTP range requests for seeking.
 * Usage: app.get('/video/*', streamVideo)
 */
export function streamVideo(req, res) {
    // Express 5 named wildcard param
    let rawPath = req.params.filePath
    if (!rawPath) {
        return res.status(400).json({ error: 'No file path provided' })
    }

    // Ensure it's a string (Express 5 wildcards could be array-like)
    if (Array.isArray(rawPath)) rawPath = rawPath.join('/')
    rawPath = String(rawPath)

    // Try the path as-is first (Express 5 auto-decodes), then try decoding
    let filePath = rawPath
    if (!fs.existsSync(filePath)) {
        try { filePath = decodeURIComponent(rawPath) } catch { /* already decoded */ }
    }

    console.log(`[VideoStreamer] Streaming: ${path.basename(filePath)}`)

    // Security check: path must be within allowed directories
    if (!isPathAllowed(filePath)) {
        console.warn(`[VideoStreamer] Blocked — not in allowed roots`)
        return res.status(403).json({ error: 'Access denied — path not in allowed directories' })
    }

    // Check file exists
    if (!fs.existsSync(filePath)) {
        console.warn(`[VideoStreamer] File not found: ${filePath}`)
        return res.status(404).json({ error: 'Video file not found' })
    }

    // Get file info
    const stat = fs.statSync(filePath)
    const fileSize = stat.size
    const ext = path.extname(filePath).toLowerCase()
    const contentType = VIDEO_MIME_TYPES[ext] || 'application/octet-stream'

    // Check for range request (needed for seeking)
    const range = req.headers.range

    if (range) {
        // Parse range header
        const parts = range.replace(/bytes=/, '').split('-')
        const start = parseInt(parts[0], 10)
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1

        // Validate range
        if (start >= fileSize || end >= fileSize || start > end) {
            res.writeHead(416, {
                'Content-Range': `bytes */${fileSize}`
            })
            return res.end()
        }

        const chunkSize = end - start + 1

        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': contentType,
            'Cache-Control': 'no-cache',
        })

        const stream = fs.createReadStream(filePath, { start, end })
        stream.on('error', (err) => {
            console.error(`[VideoStreamer] Stream error: ${err.message}`)
            if (!res.headersSent) {
                res.status(500).json({ error: 'Stream error' })
            }
        })
        stream.pipe(res)
    } else {
        // Full file response
        res.writeHead(200, {
            'Content-Length': fileSize,
            'Content-Type': contentType,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-cache',
        })

        const stream = fs.createReadStream(filePath)
        stream.on('error', (err) => {
            console.error(`[VideoStreamer] Stream error: ${err.message}`)
            if (!res.headersSent) {
                res.status(500).json({ error: 'Stream error' })
            }
        })
        stream.pipe(res)
    }
}
