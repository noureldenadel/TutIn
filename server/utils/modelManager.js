import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getDataDir } from '../database.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Get the centralized AppData TutIn models directory
 * e.g. %APPDATA%/TutIn/models/ (Windows) or ~/.config/TutIn/models/ (Linux/Mac)
 */
export function getModelsDir() {
    const dataDir = getDataDir()
    const modelsDir = path.join(dataDir, 'models')
    
    if (!fs.existsSync(modelsDir)) {
        fs.mkdirSync(modelsDir, { recursive: true })
    }
    
    return modelsDir
}

export function getAiModelsDir() {
    const dir = path.join(getModelsDir(), 'ai')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    return dir
}

export function getTtsModelsDir() {
    const dir = path.join(getModelsDir(), 'tts')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    return dir
}

export function getPunctuationModelsDir() {
    const dir = path.join(getModelsDir(), 'punctuation')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    return dir
}

export function getHuggingFaceModelsDir() {
    const dir = path.join(getModelsDir(), 'huggingface')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    return dir
}

export function getPythonEnv() {
    const modelsDir = getModelsDir()
    // Coqui TTS respects XDG_DATA_HOME / TTS_HOME for caching models
    // Demucs & Hugging Face models respect HF_HOME
    // Punctuation engine respects PUNCT_MODELS_DIR
    return {
        ...process.env,
        COQUI_TOS_AGREED: "1",
        PYTHONUNBUFFERED: "1",
        XDG_DATA_HOME: modelsDir,
        TTS_HOME: modelsDir,
        HF_HOME: getHuggingFaceModelsDir(),
        PUNCT_MODELS_DIR: getPunctuationModelsDir()
    }
}

