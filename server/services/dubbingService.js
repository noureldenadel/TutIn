import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import { getPythonEnv } from '../utils/modelManager.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let pythonProcess = null
let isStarting = false

export async function isServiceRunning() {
    try {
        const res = await fetch('http://127.0.0.1:9475/health')
        return res.ok
    } catch {
        return false
    }
}

export async function ensureServiceRunning() {
    if (await isServiceRunning()) return true
    
    if (isStarting) {
        // Wait for it to start
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 1000))
            if (await isServiceRunning()) return true
        }
        return false
    }
    
    isStarting = true
    try {
        await startPythonService()
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 1000))
            if (await isServiceRunning()) {
                isStarting = false
                return true
            }
        }
    } catch (err) {
        console.error('Failed to start Python dubbing service:', err)
    }
    isStarting = false
    return false
}

function startPythonService() {
    return new Promise((resolve, reject) => {
        const pythonPath = 'python' // assumes python is in PATH
        const scriptPath = path.join(__dirname, '..', '..', 'python', 'dubbing_server.py')
        
        console.log(`[DubbingService] Starting python server at ${scriptPath}...`)
        pythonProcess = spawn(pythonPath, [scriptPath], {
            env: getPythonEnv()
        })
        
        pythonProcess.stdout.on('data', (data) => {
            console.log(`[Python] ${data.toString().trim()}`)
        })
        
        pythonProcess.stderr.on('data', (data) => {
            console.error(`[Python] ${data.toString().trim()}`)
        })
        
        pythonProcess.on('close', (code) => {
            console.log(`[DubbingService] Python process exited with code ${code}`)
            pythonProcess = null
            isStarting = false
        })
        
        pythonProcess.on('error', (err) => {
            console.error('[DubbingService] Failed to start python process:', err)
            pythonProcess = null
            reject(err)
        })
        
        resolve()
    })
}

export async function submitDubJob(videoId, videoPath, chunks, lang) {
    const isRunning = await ensureServiceRunning()
    if (!isRunning) {
        throw new Error("Dubbing backend service is not running and could not be started.")
    }
    
    const res = await fetch('http://127.0.0.1:9475/dub', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            videoPath,
            chunks,
            targetLang: lang
        })
    })
    
    if (!res.ok) {
        const err = await res.text()
        throw new Error(`Python service error: ${err}`)
    }
    
    const data = await res.json()
    return data.job_id
}

export async function pollJobStatus(jobId) {
    const res = await fetch(`http://127.0.0.1:9475/status/${jobId}`)
    if (!res.ok) throw new Error("Job not found")
    return await res.json()
}

export async function cancelJob(jobId) {
    try {
        await fetch(`http://127.0.0.1:9475/job/${jobId}`, { method: 'DELETE' })
    } catch (err) {
        console.error('Cancel job error:', err)
    }
}
