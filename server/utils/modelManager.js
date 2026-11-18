import path from 'path'
import fs from 'fs'
import os from 'os'
import { getDataDir } from '../database.js'

/**
 * Centralized AI Model Directory Manager
 *
 * Canonical Layout inside %APPDATA%/TutIn/models/:
 *   ├── whisper/       (Faster-Whisper CTranslate2 models)
 *   ├── translation/   (Node.js @xenova/transformers NLLB-200 ONNX models)
 *   ├── tts/           (Coqui XTTS-v2 zero-shot voice cloning model)
 *   ├── demucs/        (HTDemucs stem separation checkpoints via TORCH_HOME)
 *   └── huggingface/   (Shared HuggingFace Hub cache)
 *
 * Automatically relocates pre-existing models from legacy folders so no model
 * is ever re-downloaded, and purges obsolete legacy directories (e.g. punctuation/).
 */

let migrationCompleted = false

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true })
    }
    return dirPath
}

export function getModelsRootDir() {
    if (process.env.TUTIN_MODELS_DIR) {
        return ensureDir(path.resolve(process.env.TUTIN_MODELS_DIR))
    }
    return ensureDir(path.join(getDataDir(), 'models'))
}

export function getWhisperModelsDir() {
    relocateAndCleanModelsDir()
    return ensureDir(path.join(getModelsRootDir(), 'whisper'))
}

export function getXenovaCacheDir() {
    relocateAndCleanModelsDir()
    return ensureDir(path.join(getModelsRootDir(), 'translation'))
}

export function getTtsModelsDir() {
    relocateAndCleanModelsDir()
    return ensureDir(path.join(getModelsRootDir(), 'tts'))
}

export function getDemucsModelsDir() {
    relocateAndCleanModelsDir()
    return ensureDir(path.join(getModelsRootDir(), 'demucs'))
}

export function getHuggingFaceCacheDir() {
    relocateAndCleanModelsDir()
    return ensureDir(path.join(getModelsRootDir(), 'huggingface'))
}

function moveDirectoryContents(srcDir, destDir) {
    if (!fs.existsSync(srcDir)) return
    ensureDir(destDir)
    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
        const srcPath = path.join(srcDir, entry.name)
        const destPath = path.join(destDir, entry.name)
        if (entry.isDirectory()) {
            moveDirectoryContents(srcPath, destPath)
            try {
                fs.rmdirSync(srcPath)
            } catch { }
        } else if (entry.isFile()) {
            if (!fs.existsSync(destPath)) {
                try {
                    fs.renameSync(srcPath, destPath)
                } catch {
                    try {
                        fs.copyFileSync(srcPath, destPath)
                        fs.unlinkSync(srcPath)
                    } catch { }
                }
            } else {
                try {
                    fs.unlinkSync(srcPath)
                } catch { }
            }
        }
    }
    try {
        fs.rmdirSync(srcDir)
    } catch { }
}

/**
 * Relocates downloaded models from legacy paths into the canonical v6 structure
 * and deletes obsolete legacy model folders and incomplete temp files.
 */
export function relocateAndCleanModelsDir() {
    if (migrationCompleted) return
    migrationCompleted = true

    try {
        const root = getModelsRootDir()

        // 1. Relocate legacy NLLB-200 (@xenova/transformers): models/ai -> models/translation
        const legacyAiDir = path.join(root, 'ai')
        const translationDir = path.join(root, 'translation')
        if (fs.existsSync(legacyAiDir)) {
            moveDirectoryContents(legacyAiDir, translationDir)
        }

        // 2. Relocate legacy Demucs checkpoints: models/torch -> models/demucs
        // Also check ~/.cache/torch/hub/checkpoints for HTDemucs weights downloaded before TORCH_HOME was set
        const legacyTorchDir = path.join(root, 'torch')
        const demucsDir = path.join(root, 'demucs')
        if (fs.existsSync(legacyTorchDir)) {
            moveDirectoryContents(legacyTorchDir, demucsDir)
        }
        try {
            const userTorchCheckpoints = path.join(os.homedir(), '.cache', 'torch', 'hub', 'checkpoints')
            const targetCheckpoints = path.join(demucsDir, 'hub', 'checkpoints')
            if (fs.existsSync(userTorchCheckpoints)) {
                for (const file of fs.readdirSync(userTorchCheckpoints)) {
                    // Demucs htdemucs checkpoint (955717e8-8726e21a.th or similar .th/.pth files)
                    if (file.endsWith('.th') || file.includes('demucs')) {
                        ensureDir(targetCheckpoints)
                        const srcFile = path.join(userTorchCheckpoints, file)
                        const destFile = path.join(targetCheckpoints, file)
                        if (!fs.existsSync(destFile)) {
                            fs.copyFileSync(srcFile, destFile)
                        }
                    }
                }
            }
        } catch { }

        // 3. Relocate Faster-Whisper models if any were cached under models/huggingface/hub/
        const hfHubDir = path.join(root, 'huggingface', 'hub')
        const whisperDir = path.join(root, 'whisper')
        if (fs.existsSync(hfHubDir)) {
            for (const entry of fs.readdirSync(hfHubDir, { withFileTypes: true })) {
                if (entry.isDirectory() && entry.name.startsWith('models--Systran--faster-whisper-')) {
                    const srcModelDir = path.join(hfHubDir, entry.name)
                    const destModelDir = path.join(whisperDir, entry.name)
                    moveDirectoryContents(srcModelDir, destModelDir)
                }
            }
        }

        // 4. Relocate Coqui XTTS-v2 if placed at root models/tts_models--* instead of models/tts/tts_models--*
        const ttsDir = path.join(root, 'tts')
        for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
            if (entry.isDirectory() && entry.name.startsWith('tts_models--')) {
                moveDirectoryContents(path.join(root, entry.name), path.join(ttsDir, entry.name))
            }
        }

        // 5. Remove obsolete legacy punctuation models directory (replaced by clause normalization)
        const legacyPunctDir = path.join(root, 'punctuation')
        if (fs.existsSync(legacyPunctDir)) {
            try {
                fs.rmSync(legacyPunctDir, { recursive: true, force: true })
            } catch { }
        }
    } catch (err) {
        console.warn('[ModelManager] Non-fatal model relocation warning:', err.message)
    }
}

/**
 * Compute disk usage statistics across all canonical AI model directories.
 */
export function getModelsDiskStats() {
    relocateAndCleanModelsDir()
    const root = getModelsRootDir()

    const measureDir = (dirPath) => {
        let bytes = 0
        let files = 0
        if (!fs.existsSync(dirPath)) return { bytes, files }
        const walk = (curr) => {
            try {
                for (const entry of fs.readdirSync(curr, { withFileTypes: true })) {
                    const full = path.join(curr, entry.name)
                    if (entry.isDirectory()) {
                        walk(full)
                    } else if (entry.isFile()) {
                        try {
                            bytes += fs.statSync(full).size
                            files += 1
                        } catch { }
                    }
                }
            } catch { }
        }
        walk(dirPath)
        return { bytes, files }
    }

    const whisper = measureDir(path.join(root, 'whisper'))
    const translation = measureDir(path.join(root, 'translation'))
    const tts = measureDir(path.join(root, 'tts'))
    const demucs = measureDir(path.join(root, 'demucs'))
    const huggingface = measureDir(path.join(root, 'huggingface'))

    const totalBytes = whisper.bytes + translation.bytes + tts.bytes + demucs.bytes + huggingface.bytes

    return {
        modelsDir: root,
        totalBytes,
        totalMb: Math.round((totalBytes / (1024 * 1024)) * 10) / 10,
        categories: {
            whisper: { bytes: whisper.bytes, mb: Math.round(whisper.bytes / (1024 * 1024)) },
            translation: { bytes: translation.bytes, mb: Math.round(translation.bytes / (1024 * 1024)) },
            tts: { bytes: tts.bytes, mb: Math.round(tts.bytes / (1024 * 1024)) },
            demucs: { bytes: demucs.bytes, mb: Math.round(demucs.bytes / (1024 * 1024)) }
        }
    }
}

/**
 * Environment variables for Python AI subprocesses.
 * Note: Coqui TTS automatically appends `/tts` to `TTS_HOME`, so setting
 * `TTS_HOME = modelsRoot` resolves to `<modelsRoot>/tts/tts_models--...`.
 */
export function getPythonEnv() {
    relocateAndCleanModelsDir()
    const modelsRoot = getModelsRootDir()
    const hfHome = getHuggingFaceCacheDir()
    const demucsHome = getDemucsModelsDir()
    const whisperHome = getWhisperModelsDir()

    return {
        ...process.env,
        COQUI_TOS_AGREED: '1',
        PYTHONUNBUFFERED: '1',
        PYTHONIOENCODING: 'utf-8',
        TUTIN_MODELS_DIR: modelsRoot,
        TUTIN_WHISPER_DIR: whisperHome,
        TTS_HOME: modelsRoot,
        HF_HOME: hfHome,
        HUGGINGFACE_HUB_CACHE: path.join(hfHome, 'hub'),
        TORCH_HOME: demucsHome
    }
}
