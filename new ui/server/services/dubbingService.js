import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { getPythonEnv } from '../utils/modelManager.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..')

let pythonProcess = null
let isStarting = false

export async function isServiceRunning() {
    try {
        const res = await fetch('http://127.0.0.1:9475/health', {
            signal: AbortSignal.timeout(1500)
        })
        return res.ok
    } catch {
        return false
    }
}

export async function ensureServiceRunning() {
    if (await isServiceRunning()) return true

    if (isStarting) {
        for (let i = 0; i < 60; i++) {
            await new Promise(r => setTimeout(r, 1000))
            if (await isServiceRunning()) return true
            if (!isStarting) break
        }
        return false
    }

    isStarting = true
    try {
        await startPythonService()
        for (let i = 0; i < 60; i++) {
            await new Promise(r => setTimeout(r, 1000))
            if (await isServiceRunning()) {
                isStarting = false
                return true
            }
            if (!pythonProcess) break
        }
    } catch (err) {
        console.error('[Python AI Service] Failed to start:', err.message)
    }
    isStarting = false
    return false
}

function getPythonExecutable() {
    const venvPythonWin = path.join(WORKSPACE_ROOT, '.venv', 'Scripts', 'python.exe')
    const venvPythonPosix = path.join(WORKSPACE_ROOT, '.venv', 'bin', 'python')
    if (fs.existsSync(venvPythonWin)) return venvPythonWin
    if (fs.existsSync(venvPythonPosix)) return venvPythonPosix
    return null
}

function startPythonService() {
    return new Promise((resolve, reject) => {
        const pythonPath = getPythonExecutable()
        const scriptPath = path.join(WORKSPACE_ROOT, 'python', 'dubbing_server.py')
        if (!pythonPath || !fs.existsSync(scriptPath)) {
            return reject(new Error('Python .venv or dubbing_server.py not found'))
        }

        console.log(`[Python AI Service] Starting python server using "${pythonPath}" at ${scriptPath}...`)
        pythonProcess = spawn(pythonPath, [scriptPath], {
            env: getPythonEnv()
        })

        pythonProcess.stdout.on('data', (data) => {
            console.log(`[Python AI Service] ${data.toString().trim()}`)
        })

        pythonProcess.stderr.on('data', (data) => {
            console.error(`[Python AI Service:stderr] ${data.toString().trim()}`)
        })

        pythonProcess.on('close', (code) => {
            console.log(`[Python AI Service] Process exited with code ${code}`)
            pythonProcess = null
            isStarting = false
        })

        pythonProcess.on('error', (err) => {
            console.error('[Python AI Service] Failed to start process:', err)
            pythonProcess = null
            reject(err)
        })

        resolve()
    })
}

export async function transcribeWithPythonService({ videoPath, language, modelName = 'large-v3-turbo' }) {
    const isRunning = await ensureServiceRunning()
    if (!isRunning) {
        return null
    }

    const pyRes = await fetch('http://127.0.0.1:9475/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            videoPath,
            language: language || 'en',
            modelName: modelName || 'large-v3-turbo',
            wordTimestamps: true
        })
    })

    if (!pyRes.ok) {
        const errData = await pyRes.json().catch(() => ({}))
        throw new Error(errData.detail || `Python transcription failed: HTTP ${pyRes.status}`)
    }

    return await pyRes.json()
}
