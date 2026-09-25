import { pipeline, env } from '@xenova/transformers'
import path from 'path'
import { fileURLToPath } from 'url'
import { getOne } from '../database.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

env.cacheDir = path.join(__dirname, '..', '..', 'models', 'ai')
env.allowLocalModels = true

/**
 * aiTranslation.js
 * Routes translation to:
 *   - OpenRouter (GPT-4o-mini) for dialectal Arabic: ar-eg (Egyptian), ar-sa (Gulf/Saudi)
 *   - NLLB-200 (local, offline) for all other languages including standard Arabic (ar)
 */

const NLLB_LANG_MAP = {
    'en': 'eng_Latn', 'ar': 'arb_Arab', 'es': 'spa_Latn', 'fr': 'fra_Latn',
    'de': 'deu_Latn', 'zh': 'zho_Hans', 'ja': 'jpn_Jpan', 'ko': 'kor_Hang',
    'ru': 'rus_Cyrl', 'pt': 'por_Latn', 'it': 'ita_Latn', 'hi': 'hin_Deva',
    'tr': 'tur_Latn', 'nl': 'nld_Latn', 'pl': 'pol_Latn', 'vi': 'vie_Latn',
    'th': 'tha_Thai', 'cs': 'ces_Latn', 'hu': 'hun_Latn', 'uk': 'ukr_Cyrl',
    'id': 'ind_Latn', 'sv': 'swe_Latn', 'da': 'dan_Latn', 'no': 'nob_Latn',
    'fi': 'fin_Latn', 'el': 'ell_Grek', 'he': 'heb_Hebr'
}

const DIALECT_PROMPTS = {
    'ar-eg': 'You are a translator specializing in spoken Egyptian Arabic (العامية المصرية). Translate the following text to natural, conversational Egyptian Arabic dialect — NOT formal Modern Standard Arabic (MSA). Use colloquial vocabulary, contractions, and everyday phrasing that a native Egyptian speaker would use in casual conversation.',
    'ar-sa': 'You are a translator specializing in spoken Gulf Arabic (اللهجة الخليجية). Translate the following text to natural, conversational Gulf/Saudi Arabic dialect — NOT formal Modern Standard Arabic (MSA). Use colloquial Gulf vocabulary and everyday phrasing that a native Saudi or Gulf speaker would use in casual conversation.'
}

function getOpenRouterKey() {
    try {
        const row = getOne("SELECT value FROM settings WHERE key = 'openRouterApiKey'")
        if (!row?.value) return null
        const val = JSON.parse(row.value)
        return typeof val === 'string' && val.trim() ? val.trim() : null
    } catch { return null }
}

async function translateOneWithOpenRouter(text, dialect, apiKey) {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://tutin.app',
            'X-Title': 'TutIn'
        },
        body: JSON.stringify({
            model: 'openai/gpt-4o-mini',
            messages: [
                { role: 'system', content: DIALECT_PROMPTS[dialect] },
                { role: 'user', content: `Translate ONLY the following text. Output ONLY the translated text with no explanation or extra text:\n\n${text}` }
            ],
            temperature: 0.3,
            max_tokens: 512
        })
    })
    if (!response.ok) {
        const err = await response.text()
        throw new Error(`OpenRouter API error ${response.status}: ${err}`)
    }
    const data = await response.json()
    return data.choices?.[0]?.message?.content?.trim() || text
}

/**
 * Stitches fine-grained subtitle cues into full grammatical sentences.
 * Terminal punctuation, pause gaps (> 550ms), and max duration bounds (> 7.5s)
 * determine sentence boundaries.
 */
export function stitchCuesIntoSentences(chunks) {
    if (!chunks || chunks.length === 0) return []
    const termRegex = /[.?!؟。！…]+['"]?\s*$/
    const abbrevRegex = /\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc|e\.g|i\.e)\.\s*$/i
    const sentences = []
    let current = null

    for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i]
        const text = (c.text || '').trim()
        if (!text) continue

        const start = Array.isArray(c.timestamp) ? Number(c.timestamp[0]) : Number(c.start ?? 0)
        const end = Array.isArray(c.timestamp) ? Number(c.timestamp[1]) : Number(c.end ?? (start + 2))

        const cueObj = {
            index: i,
            start,
            end,
            timestamp: [start, end],
            text
        }

        if (!current) {
            current = {
                start,
                end,
                timestamp: [start, end],
                text,
                cues: [cueObj]
            }
        } else {
            const gap = start - current.end
            const isTerm = termRegex.test(current.text) && !abbrevRegex.test(current.text)
            const isLong = (end - current.start) >= 7.5 || current.text.length >= 180
            const isGap = gap >= 0.55
            // Discourse transition word at cue boundary (e.g. Next, However, Furthermore, First, Then)
            const transitionRegex = /^(Next|However|Furthermore|Meanwhile|Finally|First|Second|Third|Moreover|Therefore|In addition|Now|Then|So)\b/i
            const isTransition = transitionRegex.test(text) && current.text.split(/\s+/).length >= 6

            if (isTerm || isGap || isLong || isTransition) {
                sentences.push(current)
                current = {
                    start,
                    end,
                    timestamp: [start, end],
                    text,
                    cues: [cueObj]
                }
            } else {
                current.end = end
                current.timestamp = [current.start, end]
                current.text = current.text + ' ' + text
                current.cues.push(cueObj)
            }
        }
    }
    if (current) sentences.push(current)
    return sentences
}

/**
 * Re-slices a translated sentence across the original cue timestamp windows
 * based on relative character/word weights, preserving exact timing synchronization.
 */
export function sliceTranslatedSentenceToCues(translatedText, originalCues) {
    if (!originalCues || originalCues.length === 0) return []
    const cleanText = (translatedText || '').trim()
    if (originalCues.length === 1) {
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

    const totalWeight = originalCues.reduce((sum, c) => sum + Math.max(1, (c.text || '').length), 0)
    const result = []
    let wordCursor = 0

    for (let i = 0; i < originalCues.length; i++) {
        const cue = originalCues[i]
        const isLast = (i === originalCues.length - 1)

        if (isLast) {
            const remainingWords = words.slice(wordCursor).join(' ')
            result.push({
                timestamp: cue.timestamp,
                start: cue.start,
                end: cue.end,
                text: remainingWords
            })
        } else {
            const cueWeight = Math.max(1, (cue.text || '').length)
            const targetWordCount = Math.max(1, Math.round((cueWeight / totalWeight) * words.length))
            const sliceEnd = Math.min(words.length - (originalCues.length - 1 - i), wordCursor + targetWordCount)
            const cueWords = words.slice(wordCursor, sliceEnd).join(' ')
            wordCursor = sliceEnd
            result.push({
                timestamp: cue.timestamp,
                start: cue.start,
                end: cue.end,
                text: cueWords
            })
        }
    }

    return result
}

async function translateChunksOpenRouter(chunks, targetLanguage, onProgress, req) {
    const apiKey = getOpenRouterKey()
    if (!apiKey) throw new Error('OpenRouter API key is required for dialect Arabic translation. Please add your key in Settings.')

    const dialectLabel = targetLanguage === 'ar-eg' ? 'Egyptian Arabic' : 'Gulf Arabic'
    const stitchedSentences = stitchCuesIntoSentences(chunks)
    const total = stitchedSentences.length
    const translatedSentences = []
    const startTime = Date.now()

    console.log(`[OpenRouter] Translating ${total} stitched sentences (${chunks.length} cues) to ${dialectLabel} via GPT-4o-mini`)
    onProgress?.({ step: 'loading', message: `Connecting to OpenRouter for ${dialectLabel}...`, percent: 0 })

    for (let i = 0; i < total; i++) {
        if (req?.socket?.destroyed) throw new Error('Translation cancelled by client')
        onProgress?.({ step: 'translating', message: `Translating sentence ${i + 1} of ${total} (${dialectLabel})...`, batch: i + 1, of: total, percent: Math.round((i / total) * 100) })
        const translated = await translateOneWithOpenRouter(stitchedSentences[i].text, targetLanguage, apiKey)
        translatedSentences.push(translated)
    }

    // Re-slice sentences back into original cue windows
    const translatedChunks = []
    for (let i = 0; i < total; i++) {
        const sliced = sliceTranslatedSentenceToCues(translatedSentences[i], stitchedSentences[i].cues)
        translatedChunks.push(...sliced)
    }

    console.log(`[OpenRouter] ${dialectLabel} translation done in ${((Date.now() - startTime) / 1000).toFixed(2)}s`)
    onProgress?.({ step: 'done', message: 'Translation complete!', percent: 100, lang: targetLanguage, chunkCount: translatedChunks.length })
    return translatedChunks
}

async function translateChunksNLLB(chunks, targetLanguage, onProgress, req, sourceLanguage) {
    const modelId = 'Xenova/nllb-200-distilled-600M'
    const tgt_lang = NLLB_LANG_MAP[targetLanguage]
    const src_lang = NLLB_LANG_MAP[sourceLanguage] || 'eng_Latn'
    if (!tgt_lang) throw new Error(`Unsupported language code: ${targetLanguage}`)

    const stitchedSentences = stitchCuesIntoSentences(chunks)
    console.log(`[NLLB-200] ${stitchedSentences.length} stitched sentences from ${chunks.length} cues | ${sourceLanguage} -> ${targetLanguage}`)
    const startTime = Date.now()
    onProgress?.({ step: 'loading', message: 'Loading NLLB-200 model (1.2GB, downloads once)...', percent: 0 })

    let translator
    try {
        translator = await pipeline('translation', modelId, {
            progress_callback: (p) => {
                if (p.status === 'progress' || p.status === 'downloading') {
                    onProgress?.({ step: 'downloading', message: `Downloading model... (${Math.round(p.progress)}%)`, percent: p.progress })
                } else if (p.status === 'ready') {
                    onProgress?.({ step: 'loading', message: 'Model loaded. Preparing...', percent: 100 })
                }
            }
        })
    } catch (err) {
        throw new Error(`Failed to load NLLB-200 for '${targetLanguage}': ${err.message}`)
    }

    const BATCH_SIZE = 10
    const translatedSentences = []
    const totalBatches = Math.ceil(stitchedSentences.length / BATCH_SIZE)

    for (let i = 0; i < stitchedSentences.length; i += BATCH_SIZE) {
        if (req?.socket?.destroyed) throw new Error('Translation cancelled by client')
        const batch = stitchedSentences.slice(i, i + BATCH_SIZE)
        const batchNum = Math.floor(i / BATCH_SIZE) + 1
        onProgress?.({ step: 'translating', message: `Translating batch ${batchNum} of ${totalBatches}...`, batch: batchNum, of: totalBatches, percent: Math.round(((batchNum - 1) / totalBatches) * 100) })

        try {
            const output = await translator(batch.map(c => c.text), { src_lang, tgt_lang })
            for (let j = 0; j < batch.length; j++) {
                const text = Array.isArray(output[j]) ? output[j][0].translation_text : output[j].translation_text
                translatedSentences.push(text)
            }
        } catch (err) {
            throw new Error(`NLLB-200 crashed on batch ${batchNum}: ${err.message}`)
        }
    }

    // Re-slice sentences back into original cue windows for subtitle display
    const translatedChunks = []
    for (let i = 0; i < stitchedSentences.length; i++) {
        const sliced = sliceTranslatedSentenceToCues(translatedSentences[i], stitchedSentences[i].cues)
        translatedChunks.push(...sliced)
    }

    console.log(`[NLLB-200] Done in ${((Date.now() - startTime) / 1000).toFixed(2)}s: ${translatedChunks.length} chunks`)
    onProgress?.({ step: 'done', message: 'Translation complete!', batch: totalBatches, of: totalBatches, percent: 100, lang: targetLanguage, chunkCount: translatedChunks.length })
    return translatedChunks
}

export async function translateChunks(chunks, targetLanguage, apiKey, modelParams, onProgress, req, sourceLanguage = 'en') {
    if (targetLanguage === 'ar-eg' || targetLanguage === 'ar-sa') {
        return translateChunksOpenRouter(chunks, targetLanguage, onProgress, req)
    }
    return translateChunksNLLB(chunks, targetLanguage, onProgress, req, sourceLanguage)
}

export function hasOpenRouterKey() {
    return !!getOpenRouterKey()
}

