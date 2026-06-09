/**
 * mp4Parser.js — MP4/MOV Binary Duration Parser
 *
 * Reads the moov/mvhd (or mdia/mdhd) atom from an MP4/MOV container
 * to extract video duration without requiring ffprobe or any native deps.
 *
 * Only reads a few KB of container metadata — no full file read needed.
 */

import fs from 'fs'

/**
 * Parse an MP4/MOV file and return its duration in seconds.
 * Returns 0 if the duration cannot be determined.
 *
 * @param {string} filePath - Absolute path to the video file
 * @returns {Promise<number>} Duration in seconds (floored to integer)
 */
export function parseMp4Duration(filePath) {
    return new Promise((resolve) => {
        try {
            const fd = fs.openSync(filePath, 'r')
            const fileSize = fs.statSync(filePath).size
            try {
                const duration = findMoovDuration(fd, 0, fileSize)
                resolve(Math.floor(duration || 0))
            } finally {
                fs.closeSync(fd)
            }
        } catch {
            resolve(0)
        }
    })
}

/**
 * Recursively walk MP4 atom tree to find mvhd or mdhd duration.
 *
 * @param {number} fd - Open file descriptor
 * @param {number} offset - Byte offset to start reading
 * @param {number} end - Byte offset to stop reading
 * @returns {number} Duration in seconds (0 if not found)
 */
function findMoovDuration(fd, offset, end) {
    const headerBuf = Buffer.alloc(8)

    while (offset < end) {
        const bytesRead = fs.readSync(fd, headerBuf, 0, 8, offset)
        if (bytesRead < 8) return 0

        let atomSize = headerBuf.readUInt32BE(0)
        const atomType = headerBuf.toString('ascii', 4, 8)

        if (atomSize === 0) return 0

        // Extended size (64-bit)
        if (atomSize === 1) {
            const extBuf = Buffer.alloc(8)
            fs.readSync(fd, extBuf, 0, 8, offset + 8)
            const hi = extBuf.readUInt32BE(0)
            const lo = extBuf.readUInt32BE(4)
            atomSize = hi * 0x100000000 + lo
        }

        // Recurse into container atoms
        if (atomType === 'moov' || atomType === 'trak' || atomType === 'mdia') {
            const result = findMoovDuration(fd, offset + 8, offset + atomSize)
            if (result > 0) return result
        }

        // Movie Header — contains overall movie duration
        if (atomType === 'mvhd') {
            const mvhdBuf = Buffer.alloc(Math.min(atomSize - 8, 120))
            fs.readSync(fd, mvhdBuf, 0, mvhdBuf.length, offset + 8)

            const version = mvhdBuf.readUInt8(0)
            let timescale, dur

            if (version === 0) {
                timescale = mvhdBuf.readUInt32BE(12)
                dur        = mvhdBuf.readUInt32BE(16)
            } else {
                timescale  = mvhdBuf.readUInt32BE(20)
                const hi   = mvhdBuf.readUInt32BE(24)
                const lo   = mvhdBuf.readUInt32BE(28)
                dur        = hi * 0x100000000 + lo
            }

            if (timescale > 0 && dur > 0) return dur / timescale
        }

        // Media Header — per-track duration (fallback)
        if (atomType === 'mdhd') {
            const mdhdBuf = Buffer.alloc(Math.min(atomSize - 8, 40))
            fs.readSync(fd, mdhdBuf, 0, mdhdBuf.length, offset + 8)

            const version = mdhdBuf.readUInt8(0)
            let timescale, dur

            if (version === 0) {
                timescale = mdhdBuf.readUInt32BE(12)
                dur        = mdhdBuf.readUInt32BE(16)
            } else {
                timescale  = mdhdBuf.readUInt32BE(20)
                const hi   = mdhdBuf.readUInt32BE(24)
                const lo   = mdhdBuf.readUInt32BE(28)
                dur        = hi * 0x100000000 + lo
            }

            if (timescale > 0 && dur > 0) return dur / timescale
        }

        offset += atomSize
    }

    return 0
}
