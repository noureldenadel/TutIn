import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { getPythonEnv } from '../utils/modelManager.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const SERVER_ROOT = path.resolve(__dirname, '..')
const APP_ROOT = path.resolve(SERVER_ROOT, '..')
const PARENT_ROOT = path.resolve(APP_ROOT, '..')

const PYTHON_SERVICE_URL = 'http://127.0.0.1:9475'

let pythonProcess = null
let isStarting = false

export async function isServiceRunning() {
    try {
        const res = await fetch(`${PYTHON_SERVICE_URL}/health`, {
            signal: AbortSignal.timeout(1500)
        })
        return res.ok
    } catch {
        return false
    }
}

export async function getServiceHealth() {
    try {
        const res = await fetch(`${PYTHON_SERVICE_URL}/health`, {
            signal: AbortSignal.timeout(2000)
        })
        if (!res.ok) return null
        return await res.json()
    } catch {
        return null
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
    const candidateRoots = [APP_ROOT, SERVER_ROOT, PARENT_ROOT]
    for (const rootDir of candidateRoots) {
        const venvWin = path.join(rootDir, '.venv', 'Scripts', 'python.exe')
        if (fs.existsSync(venvWin)) return venvWin
        const venvPosix = path.join(rootDir, '.venv', 'bin', 'python')
        if (fs.existsSync(venvPosix)) return venvPosix
    }
    return process.platform === 'win32' ? 'python' : 'python3'
}

function startPythonService() {
    return new Promise((resolve, reject) => {
        const pythonPath = getPythonExecutable()
        const scriptPath = path.join(SERVER_ROOT, 'python', 'dubbing_server.py')
        if (!fs.existsSync(scriptPath)) {
            return reject(new Error(`dubbing_server.py not found at ${scriptPath}`))
        }

        console.log(`[Python AI Service] Starting "${pythonPath}" -> ${scriptPath}`)
        pythonProcess = spawn(pythonPath, [scriptPath], {
            env: getPythonEnv()
        })

        pythonProcess.stdout.on('data', (data) => {
            const msg = data.toString().trim()
            if (msg) console.log(`[Python AI Service] ${msg}`)
        })

        pythonProcess.stderr.on('data', (data) => {
            const msg = data.toString().trim()
            if (msg) console.error(`[Python AI Service:stderr] ${msg}`)
        })

        pythonProcess.on('close', (code) => {
            console.log(`[Python AI Service] Process exited with code ${code}`)
            pythonProcess = null
            isStarting = false
        })

        pythonProcess.on('error', (err) => {
            console.error('[Python AI Service] Failed to spawn process:', err)
            pythonProcess = null
            reject(err)
        })

        resolve()
    })
}

export async function submitDubJob({
    videoPath,
    segments,
    targetLang,
    engine = 'neural',
    voiceGender = 'male',
    bgMode = 'ducking',
    voiceReferencePath = null,
    voiceProfileDir = null,
    device = null,
    unloadIdleModel = true
}) {
    const isRunning = await ensureServiceRunning()
    if (!isRunning) {
        throw new Error('Python dubbing service could not be started.')
    }

    const body = {
        videoPath,
        segments,
        targetLang,
        engine,
        voiceGender,
        bgMode,
        voiceReferencePath,
        voiceProfileDir,
        unloadIdleModel: Boolean(unloadIdleModel)
    }
    if (device) body.device = device

    const res = await fetch(`${PYTHON_SERVICE_URL}/dub`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    })

    if (!res.ok) {
        const errData = await res.json().catch(() => null)
        const errText = errData?.detail || (await res.text().catch(() => 'Python dub service error'))
        throw new Error(errText)
    }

    const data = await res.json()
    return data.job_id
}

export async function pollJobStatus(jobId) {
    const res = await fetch(`${PYTHON_SERVICE_URL}/status/${encodeURIComponent(jobId)}`)
    if (!res.ok) {
        throw new Error('Job not found')
    }
    return await res.json()
}

export async function cancelJob(jobId) {
    try {
        await fetch(`${PYTHON_SERVICE_URL}/job/${encodeURIComponent(jobId)}`, {
            method: 'DELETE'
        })
    } catch { }
}

export async function setServiceDevice(device, unloadIdleModel) {
    const isUp = await isServiceRunning()
    if (!isUp) {
        return {
            service_running: false,
            preference: device
        }
    }
    const res = await fetch(`${PYTHON_SERVICE_URL}/set-device`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device, unloadIdleModel })
    })
    if (!res.ok) throw new Error('Failed to update dubbing device')
    return await res.json()
}

export async function unloadServiceModels() {
    const isUp = await isServiceRunning()
    if (!isUp) return { success: true, model_loaded: false }
    const res = await fetch(`${PYTHON_SERVICE_URL}/unload-models`, { method: 'POST' })
    if (!res.ok) return { success: false }
    return await res.json()
}

export async function transcribeWithPythonService({ videoPath, language, modelName = 'large-v3-turbo' }) {
    const isRunning = await ensureServiceRunning()
    if (!isRunning) {
        return null
    }

    const pyRes = await fetch(`${PYTHON_SERVICE_URL}/transcribe`, {
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
