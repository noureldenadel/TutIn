import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getDb } from '../database.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Find the root .tutin/models directory
 */
export function getModelsDir() {
    // Traverse up to find .tutin folder
    const tutinRoot = path.join(__dirname, '..', '..')
    const modelsDir = path.join(tutinRoot, 'models')
    
    if (!fs.existsSync(modelsDir)) {
        fs.mkdirSync(modelsDir, { recursive: true })
    }
    
    return modelsDir
}

export function getPythonEnv() {
    const modelsDir = getModelsDir()
    // Coqui TTS respects XDG_DATA_HOME / TTS_HOME for caching models
    return {
        ...process.env,
        COQUI_TOS_AGREED: "1",
        PYTHONUNBUFFERED: "1",
        XDG_DATA_HOME: modelsDir,
        TTS_HOME: modelsDir
    }
}
