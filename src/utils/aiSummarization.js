/**
 * AI Summarization Utilities
 * 
 * Uses Transformers.js (Hugging Face) for Whisper transcription.
 * All processing happens in-browser, offline after initial model download.
 */

import { updateVideo, getVideo } from './db'

// Transformers.js pipeline (loaded on demand)
let transcriptionPipeline = null
let isLoadingPipeline = false

/**
 * Check if AI features are available
 */
export function isAIAvailable() {
    const hasAudioContext = typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined'
    const hasWasm = typeof WebAssembly !== 'undefined'
    return hasAudioContext && hasWasm
}

/**
 * Load the Whisper transcription pipeline
 */
async function loadTranscriptionPipeline(onProgress) {
    if (transcriptionPipeline) return transcriptionPipeline
    if (isLoadingPipeline) {
        // Wait for existing load
        while (isLoadingPipeline) {
            await new Promise(resolve => setTimeout(resolve, 100))
        }
        return transcriptionPipeline
    }

    isLoadingPipeline = true

    try {
        onProgress?.({ stage: 'loading_model', progress: 0, message: 'Loading Whisper model...' })

        // Use CDN import to avoid Vite bundling issues with ONNX runtime
        const transformers = await import(
            /* @vite-ignore */
            'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js'
        )
        const { pipeline, env } = transformers

        // CRITICAL: Disable local model check BEFORE any model loading
        // This prevents the "Unexpected token '<'" error when local server returns 404 HTML
        env.allowLocalModels = false
        env.useBrowserCache = true


        // Use whisper-tiny for faster loading and processing
        // Model will be cached in browser after first download (~40MB)
        transcriptionPipeline = await pipeline(
            'automatic-speech-recognition',
            'Xenova/whisper-tiny.en',
            {
                revision: 'main',
                progress_callback: (progress) => {
                    if (progress.status === 'progress') {
                        onProgress?.({
                            stage: 'loading_model',
                            progress: progress.progress / 100,
                            message: `Downloading model: ${Math.round(progress.progress)}%`
                        })
                    }
                }
            }
        )

        onProgress?.({ stage: 'loading_model', progress: 1, message: 'Model loaded!' })
        return transcriptionPipeline
    } catch (err) {
        console.error('Failed to load transcription pipeline:', err)
        throw new Error('Failed to load AI model: ' + err.message)
    } finally {
        isLoadingPipeline = false
    }
}

/**
 * Extract audio from a video file and convert to the format needed by Whisper
 */
async function extractAndProcessAudio(fileOrHandle, onProgress) {
    onProgress?.({ stage: 'extracting_audio', progress: 0, message: 'Extracting audio...' })

    let arrayBuffer
    if (fileOrHandle.getFile) {
        const file = await fileOrHandle.getFile()
        arrayBuffer = await file.arrayBuffer()
    } else if (fileOrHandle instanceof File) {
        arrayBuffer = await fileOrHandle.arrayBuffer()
    } else {
        throw new Error('Invalid file input')
    }

    // Decode audio at 16kHz (Whisper requirement)
    const audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000
    })

    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

    // Convert to mono Float32Array
    const audioData = audioBuffer.getChannelData(0)

    await audioContext.close()

    onProgress?.({ stage: 'extracting_audio', progress: 1, message: 'Audio extracted!' })

    return audioData
}

/**
 * Transcribe audio using Whisper via Web Worker (prevents UI freezing)
 * Returns both plain text and timestamped chunks for CC support
 */
let whisperWorker = null

export async function transcribeAudio(audioData, onProgress) {
    // Try Web Worker first for non-blocking transcription
    if (typeof Worker !== 'undefined') {
        try {
            return await transcribeWithWorker(audioData, onProgress)
        } catch (err) {
            console.warn('Worker transcription failed, falling back to main thread:', err)
            // Fall through to main thread fallback
        }
    }

    // Fallback: Run on main thread (may freeze UI)
    return await transcribeOnMainThread(audioData, onProgress)
}

/**
 * Transcribe using Web Worker (non-blocking)
 */
async function transcribeWithWorker(audioData, onProgress) {
    return new Promise((resolve, reject) => {
        console.log('[AI] Starting transcribeWithWorker, samples:', audioData.length)

        // Create worker if not exists
        if (!whisperWorker) {
            console.log('[AI] Creating new Whisper worker...')

            // Use Vite's worker import syntax - creates a proper ES module worker
            const workerUrl = new URL('./whisperWorker.js', import.meta.url)
            whisperWorker = new Worker(workerUrl, {
                type: 'module',
                name: 'whisper-worker'
            })

            // Handle worker-level errors
            whisperWorker.onerror = (err) => {
                console.error('[AI] Worker error:', err)
                reject(new Error('Worker failed to load: ' + (err.message || 'Unknown error')))
            }
        }

        const requestId = Date.now().toString()

        function handleMessage(e) {
            const { type, id, stage, progress, message, text, chunks, error } = e.data

            // Progress updates (may not have id)
            if (type === 'progress') {
                onProgress?.({ stage, progress, message })
                return
            }

            // Only process messages for our request
            if (id !== requestId) return

            if (type === 'result') {
                whisperWorker.removeEventListener('message', handleMessage)
                resolve({ text, chunks })
            } else if (type === 'error') {
                whisperWorker.removeEventListener('message', handleMessage)
                reject(new Error(error))
            }
        }

        whisperWorker.addEventListener('message', handleMessage)

        // Show progress while preparing data
        onProgress?.({ stage: 'preparing', progress: 0, message: 'Preparing audio data...' })

        // Use requestAnimationFrame to let UI update, then send data
        requestAnimationFrame(() => {
            console.log('[AI] Copying audio to transferable buffer...')

            // Create a copy of the audio data buffer for transfer
            // This is necessary because audioData.buffer might be shared with AudioContext
            const audioBuffer = new ArrayBuffer(audioData.length * 4)
            const view = new Float32Array(audioBuffer)
            view.set(audioData)

            console.log('[AI] Posting to worker, buffer size:', audioBuffer.byteLength)

            whisperWorker.postMessage({
                type: 'transcribe',
                audioBuffer: audioBuffer,
                id: requestId
            }, [audioBuffer])  // Transfer ownership - no copy over to worker!

            console.log('[AI] Message posted to worker successfully')
        })
    })
}

/**
 * Fallback: Transcribe on main thread (may freeze UI)
 */
async function transcribeOnMainThread(audioData, onProgress) {
    const pipeline = await loadTranscriptionPipeline(onProgress)

    onProgress?.({ stage: 'transcribing', progress: 0, message: 'Transcribing audio...' })

    try {
        // Run transcription with word-level timestamps for CC support
        const result = await pipeline(audioData, {
            chunk_length_s: 30,
            stride_length_s: 5,
            return_timestamps: 'word',
        })

        onProgress?.({ stage: 'transcribing', progress: 1, message: 'Transcription complete!' })

        // Return both text and chunks for CC captions
        return {
            text: result.text.trim(),
            chunks: result.chunks || []
        }
    } catch (err) {
        console.error('Transcription failed:', err)
        throw new Error('Transcription failed: ' + err.message)
    }
}

/**
 * Generate a structured summary using Gemini 2.0 Flash via OpenRouter API
 */
async function generateAISummary(transcript, onProgress) {
    if (!transcript || transcript.length < 50) {
        return transcript || 'No content to summarize.'
    }

    onProgress?.({ stage: 'summarizing', progress: 0.1, message: 'Connecting to AI...' })

    const OPENROUTER_API_KEY = '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'

    // Truncate transcript if too long (Gemini has token limits)
    const maxChars = 15000
    const truncatedTranscript = transcript.length > maxChars
        ? transcript.slice(0, maxChars) + '... [truncated]'
        : transcript

    const prompt = `You are an expert at summarizing educational video content. Analyze the following video transcript and create a well-structured summary.

**Instructions:**
1. Create a clear, descriptive title for this video content
2. Write a brief overview (2-3 sentences)
3. List the main topics/key points as bullet points
4. Include any important notes, tips, or takeaways
5. If there are any actionable steps mentioned, list them

**Format your response exactly like this:**

## [Video Title]

### Overview
[Brief overview of what the video covers]

### Key Points
- [Point 1]
- [Point 2]
- [Point 3]
...

### Important Notes
- [Note 1]
- [Note 2]
...

### Action Items (if applicable)
1. [Step 1]
2. [Step 2]
...

---

**Transcript to summarize:**

${truncatedTranscript}`

    try {
        onProgress?.({ stage: 'summarizing', progress: 0.3, message: 'Generating summary...' })

        // Retry logic for rate limiting (429 errors)
        const maxRetries = 3
        let lastError = null

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': window.location.origin,
                        'X-Title': 'TutIn Course Player'
                    },
                    body: JSON.stringify({
                        model: 'google/gemini-2.0-flash-exp:free',
                        messages: [
                            {
                                role: 'user',
                                content: prompt
                            }
                        ],
                        max_tokens: 2000,
                        temperature: 0.3
                    })
                })

                if (response.status === 429) {
                    // Rate limited - wait and retry
                    const waitTime = Math.pow(2, attempt) * 2000 // 4s, 8s, 16s
                    onProgress?.({
                        stage: 'summarizing',
                        progress: 0.3,
                        message: `Rate limited. Retrying in ${waitTime / 1000}s... (${attempt}/${maxRetries})`
                    })
                    await new Promise(resolve => setTimeout(resolve, waitTime))
                    continue
                }

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}))
                    throw new Error(`API error: ${response.status} - ${errorData.error?.message || response.statusText}`)
                }

                const data = await response.json()

                onProgress?.({ stage: 'summarizing', progress: 1, message: 'Summary complete!' })

                const summary = data.choices?.[0]?.message?.content?.trim()

                if (!summary) {
                    throw new Error('No summary content received from API')
                }

                return summary
            } catch (err) {
                lastError = err
                if (attempt < maxRetries && err.message?.includes('429')) {
                    const waitTime = Math.pow(2, attempt) * 2000
                    onProgress?.({
                        stage: 'summarizing',
                        progress: 0.3,
                        message: `Error, retrying in ${waitTime / 1000}s... (${attempt}/${maxRetries})`
                    })
                    await new Promise(resolve => setTimeout(resolve, waitTime))
                } else {
                    throw err
                }
            }
        }

        throw lastError || new Error('Max retries exceeded')
    } catch (err) {
        console.error('Gemini API summarization failed:', err)
        // Fallback to simple summary if API fails
        return generateFallbackSummary(transcript, err.message)
    }
}

/**
 * Fallback summary if API fails
 */
function generateFallbackSummary(transcript, errorReason) {
    const sentences = transcript.match(/[^.!?]+[.!?]+/g) || [transcript]
    const maxSentences = Math.min(5, sentences.length)
    const summary = sentences.slice(0, maxSentences).join(' ').trim()

    return `## Summary

### Overview
${summary}

---
*Note: AI-powered summary unavailable (${errorReason}). This is an extractive summary from the first ${maxSentences} sentences.*`
}

/**
 * Convert timestamp chunks to WebVTT format for CC display
 */
export function chunksToVTT(chunks) {
    if (!chunks || chunks.length === 0) return null

    const formatTime = (seconds) => {
        const h = Math.floor(seconds / 3600)
        const m = Math.floor((seconds % 3600) / 60)
        const s = Math.floor(seconds % 60)
        const ms = Math.floor((seconds % 1) * 1000)
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`
    }

    // Group words into caption segments (~5-8 words per segment for readability)
    const segments = []
    let currentSegment = { text: '', start: null, end: null }
    let wordCount = 0

    for (const chunk of chunks) {
        if (!chunk.timestamp || chunk.timestamp.length < 2) continue

        const [start, end] = chunk.timestamp
        if (start === null || end === null) continue

        if (currentSegment.start === null) {
            currentSegment.start = start
        }

        currentSegment.text += (currentSegment.text ? ' ' : '') + chunk.text.trim()
        currentSegment.end = end
        wordCount++

        // Create a new segment every 6-8 words or at sentence boundaries
        const isPunctuation = /[.!?]$/.test(chunk.text.trim())
        if (wordCount >= 6 || (wordCount >= 4 && isPunctuation)) {
            segments.push({ ...currentSegment })
            currentSegment = { text: '', start: null, end: null }
            wordCount = 0
        }
    }

    // Add remaining segment
    if (currentSegment.text && currentSegment.start !== null) {
        segments.push(currentSegment)
    }

    // Build VTT content
    let vtt = 'WEBVTT\n\n'
    segments.forEach((segment, index) => {
        vtt += `${index + 1}\n`
        vtt += `${formatTime(segment.start)} --> ${formatTime(segment.end)}\n`
        vtt += `${segment.text}\n\n`
    })

    return vtt
}

/**
 * Process a video for transcription and summarization
 */
export async function processVideoForSummary(videoId, fileSource, onProgress) {
    try {
        // Step 1: Extract audio
        const audioData = await extractAndProcessAudio(fileSource, onProgress)

        // Step 2: Transcribe using Whisper (now returns { text, chunks })
        const transcription = await transcribeAudio(audioData, onProgress)
        const transcript = transcription.text
        const captionChunks = transcription.chunks

        // Save transcript and caption chunks to DB
        await updateVideo(videoId, {
            transcript: transcript,
            captionChunks: captionChunks,
            transcriptGeneratedAt: new Date().toISOString()
        })

        // Step 3: Generate summary using Gemini AI
        const summary = await generateAISummary(transcript, onProgress)

        // Save summary to DB
        await updateVideo(videoId, {
            summary: summary,
            summaryGeneratedAt: new Date().toISOString()
        })

        onProgress?.({ stage: 'complete', progress: 1, message: 'Done!' })

        return { transcript, summary, captionChunks }
    } catch (err) {
        console.error('AI processing failed:', err)
        throw err
    }
}

