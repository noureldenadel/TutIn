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

        // Dynamic import to avoid issues if not used
        const transformers = await import('@xenova/transformers')
        const { pipeline, env } = transformers

        // CRITICAL: Disable local model check BEFORE any model loading
        // This prevents the "Unexpected token '<'" error when local server returns 404 HTML
        env.allowLocalModels = false
        env.useBrowserCache = true

        // Additional settings to ensure models are fetched from HuggingFace
        env.backends.onnx.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/'

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
 * Transcribe audio using Whisper via Transformers.js
 */
export async function transcribeAudio(audioData, onProgress) {
    const pipeline = await loadTranscriptionPipeline(onProgress)

    onProgress?.({ stage: 'transcribing', progress: 0, message: 'Transcribing audio...' })

    try {
        // Run transcription
        const result = await pipeline(audioData, {
            chunk_length_s: 30,
            stride_length_s: 5,
            return_timestamps: false,
        })

        onProgress?.({ stage: 'transcribing', progress: 1, message: 'Transcription complete!' })

        return result.text.trim()
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
                        'X-Title': 'MEARN Course Player'
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
 * Process a video for transcription and summarization
 */
export async function processVideoForSummary(videoId, fileSource, onProgress) {
    try {
        // Step 1: Extract audio
        const audioData = await extractAndProcessAudio(fileSource, onProgress)

        // Step 2: Transcribe using Whisper
        const transcript = await transcribeAudio(audioData, onProgress)

        // Save transcript to DB
        await updateVideo(videoId, {
            transcript: transcript,
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

        return { transcript, summary }
    } catch (err) {
        console.error('AI processing failed:', err)
        throw err
    }
}
