import { pipeline, env } from '@xenova/transformers'
import { parentPort } from 'node:worker_threads'
import path from 'path'
import { fileURLToPath } from 'url'

import { getAiModelsDir } from '../utils/modelManager.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

env.cacheDir = getAiModelsDir()
env.allowLocalModels = true

const NLLB_LANG_MAP = {
    'en': 'eng_Latn', 'ar': 'arb_Arab', 'es': 'spa_Latn', 'fr': 'fra_Latn',
    'de': 'deu_Latn', 'zh': 'zho_Hans', 'ja': 'jpn_Jpan', 'ko': 'kor_Hang',
    'ru': 'rus_Cyrl', 'pt': 'por_Latn', 'it': 'ita_Latn', 'hi': 'hin_Deva',
    'tr': 'tur_Latn', 'nl': 'nld_Latn', 'pl': 'pol_Latn', 'vi': 'vie_Latn',
    'th': 'tha_Thai', 'cs': 'ces_Latn', 'hu': 'hun_Latn', 'uk': 'ukr_Cyrl',
    'id': 'ind_Latn', 'sv': 'swe_Latn', 'da': 'dan_Latn', 'no': 'nob_Latn',
    'fi': 'fin_Latn', 'el': 'ell_Grek', 'he': 'heb_Hebr',
    'ar-eg': 'arb_Arab', 'ar-sa': 'arb_Arab', 'zh-cn': 'zho_Hans', 'zh-tw': 'zho_Hant',
    'pt-br': 'por_Latn'
}

const WHISPER_HALLUCINATION_REGEX = /^\s*(?:thank\s+you\s+for\s+watching|thanks\s+for\s+watching|please\s+like\s+and\s+subscribe|please\s+subscribe|like\s+and\s+subscribe|don'?t\s+forget\s+to\s+subscribe|subscribe\s+to\s+my\s+channel|see\s+you\s+in\s+the\s+next\s+video|subtitles?\s+by\b|transcribed\s+by\b)[.!]?\s*$/i

function isNonSpeechText(text) {
    if (!text || typeof text !== 'string') return true
    const trimmed = text.trim()
    if (!trimmed) return true
    if (WHISPER_HALLUCINATION_REGEX.test(trimmed)) return true
    const stripped = trimmed
        .replace(/<[^>]+>/g, '')
        .replace(/\[[^\]]*\]/g, '')
        .replace(/\([^)]*\)/g, '')
        .replace(/[♪♫#*]+/g, '')
        .replace(/[\s.\-_–—…,:;!?]+/g, '')
        .trim()
    return stripped.length === 0
}

function sanitizeCueText(text) {
    if (!text || typeof text !== 'string') return ''
    let cleaned = text
        .replace(/<[^>]+>/g, '')
        .replace(/\[(?:music|applause|laughter|silence|cheering|cough|sigh|sound|audio|intro|outro|instrumental)[^\]]*\]/gi, '')
        .replace(/\((?:music|applause|laughter|silence|cheering|cough|sigh|sound|audio|intro|outro|instrumental)[^)]*\)/gi, '')
        .replace(/[♪♫]+/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    return cleaned
}

function stitchCuesIntoSentences(chunks) {
    if (!chunks || chunks.length === 0) return []
    const termRegex = /[.?!؟。！…]+['"]?\s*$/
    const abbrevRegex = /\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc|e\.g|i\.e)\.\s*$/i
    const sentences = []
    let current = null

    for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i]
        const rawText = (c.text || '').trim()
        const start = Array.isArray(c.timestamp) ? Number(c.timestamp[0]) : Number(c.start ?? 0)
        const end = Array.isArray(c.timestamp) ? Number(c.timestamp[1]) : Number(c.end ?? (start + 2))

        const isNonSpeech = isNonSpeechText(rawText)
        const sanitized = sanitizeCueText(rawText)

        if (!rawText || isNonSpeech || !sanitized) {
            if (current) {
                sentences.push(current)
                current = null
            }
            sentences.push({
                start,
                end,
                timestamp: [start, end],
                text: '',
                isNonSpeech: true,
                cues: [{ index: i, start, end, timestamp: [start, end], text: rawText || '', isNonSpeech: true }]
            })
            continue
        }

        const cueObj = {
            index: i,
            start,
            end,
            timestamp: [start, end],
            text: sanitized
        }

        if (!current) {
            current = {
                start,
                end,
                timestamp: [start, end],
                text: sanitized,
                cues: [cueObj]
            }
        } else {
            const gap = start - current.end
            const isTerm = termRegex.test(current.text) && !abbrevRegex.test(current.text)
            const isLong = (end - current.start) >= 4.5 || current.text.length >= 90
            const isGap = gap >= 0.35
            const transitionRegex = /^(Next|However|Furthermore|Meanwhile|Finally|First|Second|Third|Moreover|Therefore|In addition|Now|Then|So)\b/i
            const isTransition = transitionRegex.test(sanitized) && current.text.split(/\s+/).length >= 5

            if (isTerm || isGap || isLong || isTransition) {
                sentences.push(current)
                current = {
                    start,
                    end,
                    timestamp: [start, end],
                    text: sanitized,
                    cues: [cueObj]
                }
            } else {
                current.end = end
                current.timestamp = [current.start, end]
                current.text = current.text + ' ' + sanitized
                current.cues.push(cueObj)
            }
        }
    }
    if (current) sentences.push(current)
    return sentences
}

function sliceTranslatedSentenceToCues(translatedText, originalCues) {
    if (!originalCues || originalCues.length === 0) return []
    const cleanText = (translatedText || '').trim()
    if (originalCues.length === 1) {
        if (isNonSpeechText(originalCues[0].text)) {
            return [{
                timestamp: originalCues[0].timestamp,
                start: originalCues[0].start,
                end: originalCues[0].end,
                text: ''
            }]
        }
        return [{
            timestamp: originalCues[0].timestamp,
            start: originalCues[0].start,
            end: originalCues[0].end,
            text: cleanText
        }]
    }

    const words = cleanText.split(/\s+/).filter(Boolean)
    if (words.length === 0) {
        return originalCues.map(c => ({
            timestamp: c.timestamp,
            start: c.start,
            end: c.end,
            text: ''
        }))
    }

    const cueSpeechWeights = originalCues.map(c => {
        if (c.isNonSpeech || isNonSpeechText(c.text)) return 0
        const speechOnly = sanitizeCueText(c.text).replace(/[\s\p{P}\p{S}]+/gu, '')
        return Math.max(1, speechOnly.length)
    })
    const totalWeight = cueSpeechWeights.reduce((sum, w) => sum + w, 0)

    if (totalWeight === 0) {
        return originalCues.map(c => ({
            timestamp: c.timestamp,
            start: c.start,
            end: c.end,
            text: ''
        }))
    }

    const speechIndices = []
    for (let i = 0; i < originalCues.length; i++) {
        if (cueSpeechWeights[i] > 0) speechIndices.push(i)
    }

    const result = new Array(originalCues.length)
    let wordCursor = 0

    for (let si = 0; si < speechIndices.length; si++) {
        const idx = speechIndices[si]
        const cue = originalCues[idx]
        const isLastSpeechCue = (si === speechIndices.length - 1)

        if (isLastSpeechCue) {
            const remainingWords = words.slice(wordCursor).join(' ')
            result[idx] = {
                timestamp: cue.timestamp,
                start: cue.start,
                end: cue.end,
                text: remainingWords
            }
        } else {
            const cueWeight = cueSpeechWeights[idx]
            const targetWordCount = Math.max(1, Math.round((cueWeight / totalWeight) * words.length))
            let sliceEnd = wordCursor + targetWordCount
            const remainingSpeechCues = speechIndices.length - 1 - si
            if (words.length - sliceEnd < remainingSpeechCues && words.length >= speechIndices.length) {
                sliceEnd = words.length - remainingSpeechCues
            }
            sliceEnd = Math.max(wordCursor, Math.min(words.length, sliceEnd))
            const cueWords = words.slice(wordCursor, sliceEnd).join(' ')
            wordCursor = sliceEnd
            result[idx] = {
                timestamp: cue.timestamp,
                start: cue.start,
                end: cue.end,
                text: cueWords
            }
        }
    }

    for (let i = 0; i < originalCues.length; i++) {
        if (!result[i]) {
            result[i] = {
                timestamp: originalCues[i].timestamp,
                start: originalCues[i].start,
                end: originalCues[i].end,
                text: ''
            }
        }
    }

    return result
}

let cachedNllbTranslator = null
let nllbLoadingPromise = null

async function getCachedNLLBTranslator(onProgress) {
    if (cachedNllbTranslator) {
        onProgress?.({ step: 'loading', message: 'Using loaded NLLB-200 model...', percent: 100 })
        return cachedNllbTranslator
    }
    if (nllbLoadingPromise) {
        return nllbLoadingPromise
    }

    const modelId = 'Xenova/nllb-200-distilled-600M'
    nllbLoadingPromise = pipeline('translation', modelId, {
        progress_callback: (p) => {
            if (p.status === 'progress' || p.status === 'downloading') {
                onProgress?.({ step: 'downloading', message: `Downloading model... (${Math.round(p.progress)}%)`, percent: p.progress })
            } else if (p.status === 'ready') {
                onProgress?.({ step: 'loading', message: 'Model loaded. Preparing...', percent: 100 })
            }
        }
    }).then(instance => {
        cachedNllbTranslator = instance
        nllbLoadingPromise = null
        return instance
    }).catch(err => {
        nllbLoadingPromise = null
        throw err
    })

    return nllbLoadingPromise
}

const cancelledTasks = new Set()

async function handleTranslateTask({ taskId, chunks, targetLanguage, sourceLanguage }) {
    const onProgress = (data) => {
        parentPort?.postMessage({ type: 'progress', taskId, data })
    }

    try {
        const tgt_lang = NLLB_LANG_MAP[targetLanguage]
        const src_lang = NLLB_LANG_MAP[sourceLanguage] || 'eng_Latn'
        if (!tgt_lang) throw new Error(`Unsupported language code: ${targetLanguage}`)

        const stitchedSentences = stitchCuesIntoSentences(chunks)
        console.log(`[Worker:NLLB-200] ${stitchedSentences.length} stitched sentences from ${chunks.length} cues | ${sourceLanguage} -> ${targetLanguage}`)
        const startTime = Date.now()
        onProgress({ step: 'loading', message: 'Loading NLLB-200 model (1.2GB, downloads once)...', percent: 0 })

        const translator = await getCachedNLLBTranslator(onProgress)

        const BATCH_SIZE = 10
        const translatedSentences = []
        const totalBatches = Math.ceil(stitchedSentences.length / BATCH_SIZE)

        for (let i = 0; i < stitchedSentences.length; i += BATCH_SIZE) {
            if (cancelledTasks.has(taskId)) {
                cancelledTasks.delete(taskId)
                throw new Error('Translation cancelled by client')
            }

            const batch = stitchedSentences.slice(i, i + BATCH_SIZE)
            const batchNum = Math.floor(i / BATCH_SIZE) + 1
            onProgress({
                step: 'translating',
                message: `Translating batch ${batchNum} of ${totalBatches}...`,
                batch: batchNum,
                of: totalBatches,
                percent: Math.round(((batchNum - 1) / totalBatches) * 100)
            })

            const textsToTranslate = batch.map(c => (c.isNonSpeech || isNonSpeechText(c.text)) ? '' : c.text)
            const validIndices = []
            const validTexts = []
            for (let j = 0; j < textsToTranslate.length; j++) {
                if (textsToTranslate[j]) {
                    validIndices.push(j)
                    validTexts.push(textsToTranslate[j])
                }
            }

            const batchResults = new Array(textsToTranslate.length).fill('')
            if (validTexts.length > 0) {
                const output = await translator(validTexts, { src_lang, tgt_lang })
                for (let k = 0; k < validTexts.length; k++) {
                    const text = Array.isArray(output[k]) ? output[k][0].translation_text : output[k].translation_text
                    batchResults[validIndices[k]] = text || ''
                }
            }

            translatedSentences.push(...batchResults)

            // Micro-yield to allow message handling
            await new Promise(resolve => setImmediate(resolve))
        }

        const translatedChunks = []
        for (let i = 0; i < stitchedSentences.length; i++) {
            const sliced = sliceTranslatedSentenceToCues(translatedSentences[i], stitchedSentences[i].cues)
            translatedChunks.push(...sliced)
        }

        const ttsSegments = stitchedSentences.map((s, idx) => ({
            start: s.start,
            end: s.end,
            timestamp: [s.start, s.end],
            caption: translatedSentences[idx] || '',
            text: translatedSentences[idx] || ''
        })).filter(seg => seg.text && seg.text.trim())

        translatedChunks.ttsSegments = ttsSegments

        console.log(`[Worker:NLLB-200] Done in ${((Date.now() - startTime) / 1000).toFixed(2)}s: ${translatedChunks.length} chunks`)
        onProgress({
            step: 'done',
            message: 'Translation complete!',
            batch: totalBatches,
            of: totalBatches,
            percent: 100,
            lang: targetLanguage,
            chunkCount: translatedChunks.length
        })

        parentPort?.postMessage({ type: 'done', taskId, result: translatedChunks })
    } catch (err) {
        cancelledTasks.delete(taskId)
        parentPort?.postMessage({ type: 'error', taskId, error: err.message })
    }
}

if (parentPort) {
    parentPort.on('message', async (msg) => {
        if (msg.type === 'translate') {
            await handleTranslateTask(msg)
        } else if (msg.type === 'cancel') {
            if (msg.taskId) cancelledTasks.add(msg.taskId)
        }
    })
}
