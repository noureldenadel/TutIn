import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let cachedFfmpegPath = null

/**
 * Locate FFmpeg executable across environment variables, bundled virtualenvs,
 * or system PATH.
 */
export function getFfmpegPath() {
    if (cachedFfmpegPath && fs.existsSync(cachedFfmpegPath)) {
        return cachedFfmpegPath
    }

    // 1. Explicit environment variable
    if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
        cachedFfmpegPath = process.env.FFMPEG_PATH
        return cachedFfmpegPath
    }

    // 2. Project virtualenv (imageio-ffmpeg binary)
    const projectRoot = path.resolve(__dirname, '..', '..')
    const venvBinDir = path.join(projectRoot, '.venv', 'Lib', 'site-packages', 'imageio_ffmpeg', 'binaries')
    if (fs.existsSync(venvBinDir)) {
        try {
            const files = fs.readdirSync(venvBinDir).filter(f => f.startsWith('ffmpeg') && f.endsWith('.exe'))
            if (files.length > 0) {
                cachedFfmpegPath = path.join(venvBinDir, files[0])
                return cachedFfmpegPath
            }
        } catch (e) {
            // Continue search
        }
    }

    // 3. System PATH check
    try {
        const cmd = process.platform === 'win32' ? 'where.exe ffmpeg' : 'which ffmpeg'
        const stdout = execSync(cmd, { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim().split(/\r?\n/)[0]
        if (stdout && fs.existsSync(stdout)) {
            cachedFfmpegPath = stdout
            return cachedFfmpegPath
        }
    } catch (e) {
        // Not in PATH
    }

    // 4. Default fallback
    cachedFfmpegPath = 'ffmpeg'
    return cachedFfmpegPath
}
