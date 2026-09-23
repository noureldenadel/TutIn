/**
 * Whisper Transcription Web Worker
 * 
 * Runs Whisper AI transcription off the main thread to prevent UI freezing.
 * Dynamically supports English-optimized and Multilingual Whisper models based on course spoken language.
 */

let transcriptionPipeline = null
let currentModelLoaded = null
let isLoadingPipeline = false

// Handle messages from main thread
self.onmessage = async function (e) {
    console.log('[Worker] Received message:', e.data?.type, 'buffer size:', e.data?.audioBuffer?.byteLength)
    const { type, audioBuffer, id, language = 'en', device = 'auto' } = e.data

    if (type === 'transcribe') {
        try {
            const cleanLang = (language || 'en').toLowerCase().trim()
            const targetModel = cleanLang === 'en' ? 'Xenova/whisper-tiny.en' : 'Xenova/whisper-tiny'

            // Load pipeline if not loaded or if model mismatch (e.g. switched between English-only and Multilingual)
            if (!transcriptionPipeline || currentModelLoaded !== targetModel) {
                console.log(`[Worker] Loading pipeline for ${targetModel} (lang: ${cleanLang}, device: ${device})...`)
                await loadTranscriptionPipeline(device, targetModel)
                console.log('[Worker] Pipeline loaded!')
            }

            // Report progress
            self.postMessage({ type: 'progress', id, stage: 'transcribing', progress: 0, message: `Transcribing audio (${cleanLang.toUpperCase()})…` })

            // Convert ArrayBuffer to Float32Array
            console.log('[Worker] Converting buffer to Float32Array...')
            const audioFloat32 = new Float32Array(audioBuffer)
            console.log('[Worker] Audio samples:', audioFloat32.length)

            // Run transcription with timestamps & explicit language
            console.log('[Worker] Starting transcription...')
            const options = {
                chunk_length_s: 30,
                stride_length_s: 5,
                return_timestamps: 'word',
                force_full_sequences: false
            }

            // For multilingual model, specify language and task
            if (targetModel !== 'Xenova/whisper-tiny.en') {
                options.language = cleanLang
                options.task = 'transcribe'
            }

            const result = await transcriptionPipeline(audioFloat32, options)
            console.log('[Worker] Transcription complete!')

            self.postMessage({ type: 'progress', id, stage: 'transcribing', progress: 1, message: 'Transcription complete!' })

            // Send result back
            self.postMessage({
                type: 'result',
                id,
                text: result.text.trim(),
                chunks: result.chunks || []
            })
        } catch (err) {
            console.error('[Worker] Error:', err)
            self.postMessage({
                type: 'error',
                id,
                error: err.message
            })
        }
    }
}

async function loadTranscriptionPipeline(device = 'auto', modelName = 'Xenova/whisper-tiny.en') {
    if (transcriptionPipeline && currentModelLoaded === modelName) return transcriptionPipeline
    if (isLoadingPipeline) {
        while (isLoadingPipeline) {
            await new Promise(resolve => setTimeout(resolve, 100))
        }
        if (transcriptionPipeline && currentModelLoaded === modelName) return transcriptionPipeline
    }

    isLoadingPipeline = true

    try {
        self.postMessage({ type: 'progress', stage: 'loading_model', progress: 0, message: `Loading Whisper AI model (${modelName})...` })

        console.log('[Worker] Importing transformers from CDN...')

        // Use v3 CDN for WebGPU support
        const { pipeline, env } = await import(
            /* @vite-ignore */
            'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.2.1/dist/transformers.min.js'
        )
        console.log('[Worker] Transformers imported from CDN!')

        // Configure for browser usage
        env.allowLocalModels = false
        env.useBrowserCache = true

        console.log(`[Worker] Loading Whisper model: ${modelName}...`)
        // Load Whisper model
        transcriptionPipeline = await pipeline(
            'automatic-speech-recognition',
            modelName,
            {
                device: device === 'auto' ? (('gpu' in navigator) ? 'webgpu' : 'wasm') : (device === 'gpu' ? 'webgpu' : 'wasm'),
                revision: 'main',
                progress_callback: (progress) => {
                    if (progress.status === 'progress') {
                        self.postMessage({
                            type: 'progress',
                            stage: 'loading_model',
                            progress: progress.progress / 100,
                            message: `Downloading model: ${Math.round(progress.progress)}%`
                        })
                    }
                }
            }
        )
        currentModelLoaded = modelName
        console.log('[Worker] Whisper model loaded!')

        self.postMessage({ type: 'progress', stage: 'loading_model', progress: 1, message: 'Model loaded!' })
        return transcriptionPipeline
    } catch (err) {
        console.error('[Worker] Failed to load transcription pipeline:', err)
        throw new Error('Failed to load AI model: ' + err.message)
    } finally {
        isLoadingPipeline = false
    }
}
