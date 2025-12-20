/**
 * Whisper Transcription Web Worker
 * 
 * Runs Whisper AI transcription off the main thread to prevent UI freezing.
 */

let transcriptionPipeline = null
let isLoadingPipeline = false

// Handle messages from main thread
self.onmessage = async function (e) {
    const { type, audioData, id } = e.data

    if (type === 'transcribe') {
        try {
            // Load pipeline if not loaded
            if (!transcriptionPipeline) {
                await loadTranscriptionPipeline()
            }

            // Report progress
            self.postMessage({ type: 'progress', id, stage: 'transcribing', progress: 0, message: 'Transcribing audio...' })

            // Convert array back to Float32Array
            const audioFloat32 = new Float32Array(audioData)

            // Run transcription with timestamps
            const result = await transcriptionPipeline(audioFloat32, {
                chunk_length_s: 30,
                stride_length_s: 5,
                return_timestamps: 'word',
            })

            self.postMessage({ type: 'progress', id, stage: 'transcribing', progress: 1, message: 'Transcription complete!' })

            // Send result back
            self.postMessage({
                type: 'result',
                id,
                text: result.text.trim(),
                chunks: result.chunks || []
            })
        } catch (err) {
            self.postMessage({
                type: 'error',
                id,
                error: err.message
            })
        }
    }
}

async function loadTranscriptionPipeline() {
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

        // Import Transformers.js
        const { pipeline, env } = await import('@xenova/transformers')

        // Configure for browser usage
        env.allowLocalModels = false
        env.useBrowserCache = true
        env.backends.onnx.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/'

        // Load Whisper model
        transcriptionPipeline = await pipeline(
            'automatic-speech-recognition',
            'Xenova/whisper-tiny.en',
            {
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

        self.postMessage({ type: 'progress', stage: 'loading_model', progress: 1, message: 'Model loaded!' })
        return transcriptionPipeline
    } catch (err) {
        console.error('Failed to load transcription pipeline:', err)
        throw new Error('Failed to load AI model: ' + err.message)
    } finally {
        isLoadingPipeline = false
    }
}
