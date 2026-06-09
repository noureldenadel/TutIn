/**
 * Whisper Transcription Web Worker
 * 
 * Runs Whisper AI transcription off the main thread to prevent UI freezing.
 */

let transcriptionPipeline = null
let isLoadingPipeline = false

// Handle messages from main thread
self.onmessage = async function (e) {
    console.log('[Worker] Received message:', e.data?.type, 'buffer size:', e.data?.audioBuffer?.byteLength)
    const { type, audioBuffer, id } = e.data

    if (type === 'transcribe') {
        try {
            // Load pipeline if not loaded
            const { device } = e.data
            if (!transcriptionPipeline) {
                console.log(`[Worker] Loading pipeline (device: ${device})...`)
                await loadTranscriptionPipeline(device)
                console.log('[Worker] Pipeline loaded!')
            }

            // Report progress
            self.postMessage({ type: 'progress', id, stage: 'transcribing', progress: 0, message: 'Transcribing audio (this may take a minute)…' })

            // Convert ArrayBuffer to Float32Array
            console.log('[Worker] Converting buffer to Float32Array...')
            const audioFloat32 = new Float32Array(audioBuffer)
            console.log('[Worker] Audio samples:', audioFloat32.length)

            // Run transcription with timestamps
            console.log('[Worker] Starting transcription...')
            const result = await transcriptionPipeline(audioFloat32, {
                chunk_length_s: 30,
                stride_length_s: 5,
                return_timestamps: 'word',
                force_full_sequences: false
            })
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

async function loadTranscriptionPipeline(device = 'auto') {
    if (transcriptionPipeline) return transcriptionPipeline
    if (isLoadingPipeline) {
        while (isLoadingPipeline) {
            await new Promise(resolve => setTimeout(resolve, 100))
        }
        return transcriptionPipeline
    }

    isLoadingPipeline = true

    try {
        self.postMessage({ type: 'progress', stage: 'loading_model', progress: 0, message: 'Loading Whisper model...' })

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

        console.log('[Worker] Loading Whisper model...')
        // Load Whisper model
        transcriptionPipeline = await pipeline(
            'automatic-speech-recognition',
            'Xenova/whisper-tiny.en',
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
