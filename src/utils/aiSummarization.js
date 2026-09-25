/**
 * AI Summarization Utilities
 * 
 * Uses Transformers.js (Hugging Face) for Whisper transcription.
 * All processing happens in-browser, offline after initial model download.
 */

import { updateVideo, getVideo } from './db'
import { SERVER_URL, isServerAvailable, put } from './api'
import { verifyPermission } from './fileSystem'

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
async function loadTranscriptionPipeline(onProgress, device = 'auto') {
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

        // Use v3 CDN for WebGPU support
        const transformers = await import(
            /* @vite-ignore */
            'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.2.1/dist/transformers.min.js'
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
                device: device === 'auto' ? (('gpu' in navigator) ? 'webgpu' : 'wasm') : (device === 'gpu' ? 'webgpu' : 'wasm'),
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
    if (typeof fileOrHandle === 'string' && fileOrHandle.startsWith('http')) {
        onProgress?.({ stage: 'extracting_audio', progress: 0.1, message: 'Downloading video for AI processing...' })
        const response = await fetch(fileOrHandle)
        if (!response.ok) throw new Error('Failed to download video for processing')
        arrayBuffer = await response.arrayBuffer()
    } else if (fileOrHandle && fileOrHandle.getFile) {
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
let workerQueuePromise = Promise.resolve()

export function cancelActiveTranscription() {
    console.log('[AI] Cancelling active Whisper transcription and terminating worker...')
    if (whisperWorker) {
        try {
            whisperWorker.terminate()
        } catch (e) {
            console.warn('[AI] Error terminating whisper worker:', e)
        }
        whisperWorker = null
    }
    workerQueuePromise = Promise.resolve()
}

function getOrCreateWhisperWorker() {
    if (!whisperWorker) {
        console.log('[AI] Creating new Whisper worker...')
        const workerUrl = new URL('./whisperWorker.js', import.meta.url)
        whisperWorker = new Worker(workerUrl, {
            type: 'module',
            name: 'whisper-worker'
        })
        whisperWorker.onerror = (err) => {
            console.error('[AI] Global Whisper Worker error:', err)
        }
    }
    return whisperWorker
}

export async function transcribeAudio(audioData, onProgress, device = 'auto', language = 'en') {
    // Try Web Worker first for non-blocking transcription
    if (typeof Worker !== 'undefined') {
        try {
            return await transcribeWithWorker(audioData, onProgress, device, language)
        } catch (err) {
            console.warn('Worker transcription failed, falling back to main thread:', err)
            // Fall through to main thread fallback
        }
    }

    // Fallback: Run on main thread (may freeze UI)
    return await transcribeOnMainThread(audioData, onProgress, device, language)
}

/**
 * Transcribe using Web Worker (non-blocking with queue mutex)
 */
async function transcribeWithWorker(audioData, onProgress, device = 'auto', language = 'en') {
    // Chain to queue to ensure only one worker transcription runs at a time (WebGPU safe)
    const resultPromise = workerQueuePromise.then(() => {
        return new Promise((resolve, reject) => {
            console.log('[AI] Starting transcribeWithWorker, samples:', audioData.length, 'lang:', language)
            const worker = getOrCreateWhisperWorker()
            const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`

            function handleMessage(e) {
                const { type, id, stage, progress, message, text, chunks, error } = e.data || {}

                // Filter out messages that don't belong to this request
                if (id && id !== requestId) return

                if (type === 'progress') {
                    onProgress?.({ stage, progress, message })
                    return
                }

                if (type === 'result') {
                    cleanup()
                    resolve({ text, chunks })
                } else if (type === 'error') {
                    cleanup()
                    reject(new Error(error || 'Worker transcription failed'))
                }
            }

            function handleError(err) {
                cleanup()
                reject(new Error('Worker error: ' + (err?.message || 'Unknown worker error')))
            }

            function cleanup() {
                worker.removeEventListener('message', handleMessage)
                worker.removeEventListener('error', handleError)
            }

            worker.addEventListener('message', handleMessage)
            worker.addEventListener('error', handleError)

            onProgress?.({ stage: 'preparing', progress: 0, message: 'Preparing audio data...' })

            requestAnimationFrame(() => {
                try {
                    const audioBuffer = new ArrayBuffer(audioData.length * 4)
                    const view = new Float32Array(audioBuffer)
                    view.set(audioData)

                    worker.postMessage({
                        type: 'transcribe',
                        audioBuffer: audioBuffer,
                        device: device,
                        language: language || 'en',
                        id: requestId
                    }, [audioBuffer])
                } catch (postErr) {
                    cleanup()
                    reject(postErr)
                }
            })
        })
    })

    // Advance queue, catching error so subsequent queued items can still proceed
    workerQueuePromise = resultPromise.catch(() => { })

    return resultPromise
}

/**
 * Fallback: Transcribe on main thread (may freeze UI)
 */
async function transcribeOnMainThread(audioData, onProgress, device = 'auto', language = 'en') {
    const pipeline = await loadTranscriptionPipeline(onProgress, device)

    onProgress?.({ stage: 'transcribing', progress: 0, message: `Transcribing audio (${(language || 'en').toUpperCase()})…` })

    try {
        const cleanLang = (language || 'en').toLowerCase().trim()
        const options = {
            chunk_length_s: 30,
            stride_length_s: 5,
            return_timestamps: true,
            force_full_sequences: false
        }
        if (cleanLang !== 'en') {
            options.language = cleanLang
            options.task = 'transcribe'
        }

        // Run transcription with word-level timestamps for CC support
        const result = await pipeline(audioData, options)

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
async function generateAISummary(transcript, apiKey, model, onProgress) {
    if (!transcript || transcript.length < 50) {
        return transcript || 'No content to summarize.'
    }

    onProgress?.({ stage: 'summarizing', progress: 0.1, message: 'Connecting to AI...' })

    // Use provided API key (from Settings → API Keys)
    const OPENROUTER_API_KEY = apiKey || import.meta.env.VITE_OPENROUTER_API_KEY

    if (!OPENROUTER_API_KEY) {
        throw new Error('OpenRouter API key not configured. Go to Settings → API Keys to add it.')
    }

    // Truncate transcript if too long (Gemini has token limits)
    const maxChars = 15000
    const truncatedTranscript = transcript.length > maxChars
        ? transcript.slice(0, maxChars) + '... [truncated]'
        : transcript

    const prompt = `You are an expert note-taker who creates comprehensive study notes from video lectures. Your goal is to extract ALL important information and present it in a well-organized, visually clear format that's perfect for studying and quick reference.

**Your Task:**
Create detailed study notes from the transcript below. Write as if you're taking notes for someone who couldn't watch the video but needs to understand everything important.

**Format Requirements:**
- Use markdown formatting extensively (headers, bullet points, bold, code blocks)
- Use horizontal dividers (---) between major sections
- Use bullet points (•) for lists
- Use **bold** for key terms, definitions, and important concepts
- Use \`code blocks\` for technical terms, commands, or code snippets
- Include numbered lists for step-by-step processes
- Keep the notes scannable and easy to read

**Structure your notes like this:**

## 📝 [Descriptive Title Based on Content]

### 🎯 Quick Summary
> [2-3 sentence summary of the main topic/lesson]

---

### 📌 Key Concepts

**[Concept 1]:** [Clear explanation]

**[Concept 2]:** [Clear explanation]

---

### 📋 Main Points

• **[Point 1]** — [Detailed explanation]

• **[Point 2]** — [Detailed explanation]

• **[Point 3]** — [Detailed explanation]

---

### 💡 Tips & Best Practices
• [Tip 1]
• [Tip 2]

---

### ⚠️ Important Notes / Warnings
• [Warning or important note]

---

### ✅ Action Items / Steps
1. [Step 1]
2. [Step 2]
3. [Step 3]

---

### 🔑 Key Takeaways
• [Most important thing to remember]
• [Second most important]

---

**Notes:**
- Only include sections that are relevant to the content
- Skip empty sections
- Be thorough - capture all important details
- Use emojis sparingly for section headers only
- Make it easy to copy/paste into personal notes

---

**Transcript:**

${truncatedTranscript}`

    const selectedModel = model || 'google/gemini-2.0-flash-exp:free'
    console.log(`[AI Summary] 🤖 Requesting summary from model: ${selectedModel} | Input transcript length: ${transcript.length} chars`)
    const startTime = performance.now()

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
                        model: selectedModel,
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
                    console.warn(`[AI Summary] ⚠️ Rate limit 429 encountered, retrying in ${waitTime / 1000}s... (Attempt ${attempt}/${maxRetries})`)
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

                const elapsed = ((performance.now() - startTime) / 1000).toFixed(2)
                console.log(`[AI Summary] ✅ Summary received in ${elapsed}s: ${summary.length} characters generated.`)

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
        console.error('[AI Summary] ❌ Summarization failed:', err)
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
 * Transcribe a video to generate or regenerate timestamped captions (VTT chunks).
 * Runs Whisper AI speech-to-text in the video's spoken language.
 */
export function formatFriendlyDuration(sec) {
    if (typeof sec !== 'number') sec = parseFloat(sec) || 0
    if (sec < 60) return `${sec.toFixed(2)}s`
    const mins = (sec / 60).toFixed(1)
    const m = Math.floor(sec / 60)
    const s = Math.round(sec % 60)
    return `${mins} min (${m}m ${s}s / ${sec.toFixed(1)}s)`
}

export async function transcribeVideoCaptions(video, onProgress, device = 'auto', language = 'en') {
    let fileSource = video?.fileHandle || (video?.filePath ? `${SERVER_URL}/video/${encodeURIComponent(video.filePath)}` : video?.url)
    if (!fileSource) {
        throw new Error('Video source file not accessible for transcription')
    }
    if (fileSource.getFile) {
        const hasPerm = await verifyPermission(fileSource)
        if (!hasPerm) throw new Error('File access permission was denied')
    }

    const t0 = performance.now()

    // Step 1: Extract audio
    const audioData = await extractAndProcessAudio(fileSource, onProgress)
    const tExtract = performance.now() - t0

    // Step 2: Transcribe using Whisper Web Worker or main thread
    const tTransStart = performance.now()
    const transcription = await transcribeAudio(audioData, onProgress, device, language)
    const tTranscribe = performance.now() - tTransStart
    const totalElapsedSec = (performance.now() - t0) / 1000
    const audioDurationSec = audioData.length / 16000
    const speedX = (audioDurationSec / Math.max(0.1, totalElapsedSec)).toFixed(1)

    const transcript = transcription.text
    const captionChunks = transcription.chunks

    console.group('%c[TutIn AI Speech Transcription Debugger]', 'color: #10b981; font-weight: bold; font-size: 13px;')
    console.log(`Video ID: ${video.id} | Language: ${language} | Audio Duration: ${formatFriendlyDuration(audioDurationSec)} | Processing Speed: ${speedX}x real-time`)
    console.table([
        { Process: 'Audio Extraction & 16kHz Decoding', Role: 'Extracts video audio track and downsamples to 16kHz mono', Time: formatFriendlyDuration(tExtract / 1000) },
        { Process: `Whisper Neural Transcription (${(captionChunks || []).length} cues)`, Role: 'Speech-to-text recognition with timestamp alignment', Time: formatFriendlyDuration(tTranscribe / 1000) },
        { Process: 'Total Transcription Pipeline', Role: 'Full audio extraction and subtitle generation process', Time: formatFriendlyDuration(totalElapsedSec) }
    ])
    console.groupEnd()

    // Step 3: Save timestamped caption chunks to server / course folder
    const serverAvailable = await isServerAvailable()

    if (serverAvailable) {
        await put(`/api/transcripts/${video.id}`, { chunks: captionChunks, language: language || 'en' })
    } else {
        await updateVideo(video.id, {
            transcript: transcript,
            captionChunks: captionChunks,
            transcriptGeneratedAt: new Date().toISOString()
        })
    }

    onProgress?.({ stage: 'complete', progress: 1, message: 'Captions generated successfully!' })

    return { transcript, captionChunks }
}

/**
 * Process a video for transcription and summarization
 */
export async function processVideoForSummary(videoIdOrVideo, fileSourceOrOnProgress, onProgressOrCourse, apiKey, model, device = 'auto', language = 'en') {
    let videoId = videoIdOrVideo
    let fileSource = fileSourceOrOnProgress
    let onProgress = onProgressOrCourse
    let lang = language

    // Handle when first argument is video object: processVideoForSummary(video, onProgress, course)
    if (typeof videoIdOrVideo === 'object' && videoIdOrVideo !== null) {
        const video = videoIdOrVideo
        videoId = video.id
        onProgress = fileSourceOrOnProgress
        const course = onProgressOrCourse
        lang = course?.language || video?.language || 'en'
        fileSource = video?.fileHandle || (video?.filePath ? `${SERVER_URL}/video/${encodeURIComponent(video.filePath)}` : video?.url)
    }

    if (!fileSource) {
        throw new Error('Video source file not accessible for transcription')
    }
    if (fileSource.getFile) {
        const hasPerm = await verifyPermission(fileSource)
        if (!hasPerm) throw new Error('File access permission was denied')
    }

    const t0 = performance.now()

    try {
        // Step 1: Extract audio
        const audioData = await extractAndProcessAudio(fileSource, onProgress)
        const tExtract = performance.now() - t0

        // Step 2: Transcribe using Whisper (returns { text, chunks })
        const tTransStart = performance.now()
        const transcription = await transcribeAudio(audioData, onProgress, device, lang)
        const tTranscribe = performance.now() - tTransStart
        const totalTransSec = (performance.now() - t0) / 1000
        const audioDurationSec = audioData.length / 16000
        const speedX = (audioDurationSec / Math.max(0.1, totalTransSec)).toFixed(1)

        const transcript = transcription.text
        const captionChunks = transcription.chunks

        console.group('%c[TutIn AI Speech Transcription Debugger]', 'color: #10b981; font-weight: bold; font-size: 13px;')
        console.log(`Video ID: ${videoId} | Language: ${lang} | Audio Duration: ${formatFriendlyDuration(audioDurationSec)} | Processing Speed: ${speedX}x real-time`)
        console.table([
            { Process: 'Audio Extraction & 16kHz Resampling', Role: 'Extracts video audio track and downsamples to 16kHz mono', Time: formatFriendlyDuration(tExtract / 1000) },
            { Process: `Whisper Speech Recognition (${(captionChunks || []).length} cues)`, Role: 'Speech-to-text recognition with timestamp alignment', Time: formatFriendlyDuration(tTranscribe / 1000) },
            { Process: 'Total Transcription Pipeline', Role: 'Full audio extraction and subtitle generation process', Time: formatFriendlyDuration(totalTransSec) }
        ])
        console.groupEnd()

        // Save transcript and caption chunks
        const serverAvailable = await isServerAvailable()

        if (serverAvailable) {
            await put(`/api/transcripts/${videoId}`, { chunks: captionChunks, language: lang || 'en' })
        } else {
            await updateVideo(videoId, {
                transcript: transcript,
                captionChunks: captionChunks,
                transcriptGeneratedAt: new Date().toISOString()
            })
        }

        // Step 3: Generate summary using OpenRouter
        let summary = null
        let summaryError = null
        try {
            summary = await generateAISummary(transcript, apiKey, model, onProgress)

            // Save summary
            if (serverAvailable) {
                await put(`/api/summaries/${videoId}`, { content: summary })
            } else {
                await updateVideo(videoId, {
                    summary: summary,
                    summaryGeneratedAt: new Date().toISOString()
                })
            }
        } catch (summaryErr) {
            console.warn('Summary generation skipped or failed:', summaryErr.message)
            summaryError = summaryErr.message
            onProgress?.({ stage: 'complete', progress: 1, message: 'Transcription done (Summary skipped: API key missing)' })
            return { transcript, summary: null, captionChunks, summaryError }
        }

        onProgress?.({ stage: 'complete', progress: 1, message: 'Done!' })

        return { transcript, summary, captionChunks }
    } catch (err) {
        console.error('AI processing failed:', err)
        throw err
    }
}

/**
 * Regenerate just the summary from existing transcript (no file needed)
 */
export async function regenerateSummaryOnly(videoId, existingTranscript, onProgress, apiKey, model) {
    if (!existingTranscript || existingTranscript.length < 50) {
        throw new Error('No transcript available to summarize')
    }

    try {
        onProgress?.({ stage: 'summarizing', progress: 0.1, message: 'Regenerating summary...' })

        // Generate new summary using Gemini AI
        const summary = await generateAISummary(existingTranscript, apiKey, model, onProgress)

        // Save updated summary
        if (await isServerAvailable()) {
            await put(`/api/summaries/${videoId}`, { content: summary })
        } else {
            await updateVideo(videoId, {
                summary: summary,
                summaryGeneratedAt: new Date().toISOString()
            })
        }

        onProgress?.({ stage: 'complete', progress: 1, message: 'Summary updated!' })

        return summary
    } catch (err) {
        console.error('Summary regeneration failed:', err)
        throw err
    }
}
