import path from 'path'
import fs from 'fs'
import { getDataDir } from '../database.js'

/**
 * Centralized AI Model Directory Manager
 * Ensures all AI models (Whisper, NLLB-200, HuggingFace, and future XTTS/Demucs)
 * are stored inside %APPDATA%/TutIn/models (or platform equivalent).
 */

export function getModelsRootDir() {
    const root = path.join(getDataDir(), 'models')
    if (!fs.existsSync(root)) {
        fs.mkdirSync(root, { recursive: true })
    }
    return root
}

/**
 * Directory for Node.js @xenova/transformers models (e.g., NLLB-200)
 */
export function getXenovaCacheDir() {
    const dir = path.join(getModelsRootDir(), 'ai')
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
    }
    return dir
}

/**
 * Directory for HuggingFace Hub cache (used by Python faster-whisper / transformers)
 */
export function getHuggingFaceCacheDir() {
    const dir = path.join(getModelsRootDir(), 'huggingface')
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
    }
    return dir
}

/**
 * Environment variables to pass to Python subprocesses so all models
 * download into the centralized AppData directory.
 */
export function getPythonEnv() {
    const modelsRoot = getModelsRootDir()
    const hfHome = getHuggingFaceCacheDir()
    const torchHome = path.join(modelsRoot, 'torch')

    return {
        ...process.env,
        COQUI_TOS_AGREED: '1',
        TTS_HOME: modelsRoot,
        HF_HOME: hfHome,
        HUGGINGFACE_HUB_CACHE: path.join(hfHome, 'hub'),
        TORCH_HOME: torchHome,
        XDG_CACHE_HOME: modelsRoot,
        XDG_DATA_HOME: modelsRoot
    }
}
