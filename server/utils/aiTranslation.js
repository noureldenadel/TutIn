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
    'ar-eg': `You are an expert translator specializing in spoken Egyptian Arabic (العامية المصرية) and text-to-speech phonetic adaptation.
Translate the input into authentic spoken Egyptian Arabic dialect — NOT formal Modern Standard Arabic (MSA). Use colloquial vocabulary, contractions, and everyday phrasing that a native Egyptian speaker would use in casual conversation.

You MUST output a strict JSON object with EXACTLY two fields:
{
  "caption": "Natural, conversational Egyptian Arabic text in standard readable spelling. DO NOT include diacritics/tashkeel. Use standard everyday written spelling (e.g. use 'دلوقتي', 'قلتله', 'كده', 'علشان').",
  "tts": "Phonetically optimized Egyptian Arabic for speech synthesis pronunciation. Add selective tashkeel (fatḥah, ḍammah, kasrah, shaddah) on ambiguous dialect words, and respell dialectal sounds phonetically where needed (e.g. use glottal hamza 'أ' for colloquial 'ق' in words like 'دِلْوَأْتي', 'أُلتِلُه', and lengthen dialect vowels like 'كِدا', 'عَشَان') so the voice synthesizer speaks authentic street Egyptian without Classical Arabic stiffness."
}

Do NOT wrap in markdown code blocks. Output ONLY the raw JSON object.`,

    'ar-sa': `You are an expert translator specializing in spoken Gulf/Saudi Arabic (اللهجة الخليجية) and text-to-speech phonetic adaptation.
Translate the input into natural, conversational Gulf/Saudi Arabic dialect — NOT formal Modern Standard Arabic (MSA). Use colloquial Gulf vocabulary and everyday phrasing that a native Saudi or Gulf speaker would use in casual conversation.

You MUST output a strict JSON object with EXACTLY two fields:
{
  "caption": "Natural, conversational Gulf Arabic text in standard readable spelling. DO NOT include diacritics/tashkeel. Use standard everyday written spelling (e.g. use 'الحين', 'قلت له', 'شلونك', 'عشان').",
  "tts": "Phonetically optimized Gulf Arabic for speech synthesis pronunciation. Add selective tashkeel (fatḥah, ḍammah, kasrah, shaddah) on ambiguous dialect words and phonetically nudged vowels so the voice synthesizer speaks authentic Gulf dialect without Classical Arabic stiffness."
}

Do NOT wrap in markdown code blocks. Output ONLY the raw JSON object.`
}

export const EGYPTIAN_PHONETIC_GLOSSARY = [
    { pattern: /(?<=^|[^\p{L}\p{N}_])دلوقتي(?=[^\p{L}\p{N}_]|$)/gu, replace: 'دِلْوَأْتي' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])قلتله(?=[^\p{L}\p{N}_]|$)/gu, replace: 'أُلتِلُه' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])قلتلها(?=[^\p{L}\p{N}_]|$)/gu, replace: 'أُلتِلْهَا' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])قلتلك(?=[^\p{L}\p{N}_]|$)/gu, replace: 'أُلتِلَك' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])قلتلهم(?=[^\p{L}\p{N}_]|$)/gu, replace: 'أُلتِلْهُم' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])قلت(?=[^\p{L}\p{N}_]|$)/gu, replace: 'أُلت' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])قوي(?=[^\p{L}\p{N}_]|$)/gu, replace: 'أَوِي' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])يبقى(?=[^\p{L}\p{N}_]|$)/gu, replace: 'يِبْأَى' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])بقى(?=[^\p{L}\p{N}_]|$)/gu, replace: 'بَقَى' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])قريب(?=[^\p{L}\p{N}_]|$)/gu, replace: 'أُرَيِّب' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])طريق(?=[^\p{L}\p{N}_]|$)/gu, replace: 'طَرِيء' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])فوق(?=[^\p{L}\p{N}_]|$)/gu, replace: 'فُوء' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])قبل(?=[^\p{L}\p{N}_]|$)/gu, replace: 'أَبْل' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])قدام(?=[^\p{L}\p{N}_]|$)/gu, replace: 'أُدَّام' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])قدر(?=[^\p{L}\p{N}_]|$)/gu, replace: 'أِدِر' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])وقعت(?=[^\p{L}\p{N}_]|$)/gu, replace: 'وِئْعِت' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])وقع(?=[^\p{L}\p{N}_]|$)/gu, replace: 'وِئِع' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])قفل(?=[^\p{L}\p{N}_]|$)/gu, replace: 'أَفَل' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])قاعد(?=[^\p{L}\p{N}_]|$)/gu, replace: 'أَاعِد' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])علشان(?=[^\p{L}\p{N}_]|$)/gu, replace: 'عَشَان' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])عشان(?=[^\p{L}\p{N}_]|$)/gu, replace: 'عَشَان' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])كده(?=[^\p{L}\p{N}_]|$)/gu, replace: 'كِدا' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])إيه(?=[^\p{L}\p{N}_]|$)/gu, replace: 'إِيه' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])إزاي(?=[^\p{L}\p{N}_]|$)/gu, replace: 'إِزَّاي' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])فين(?=[^\p{L}\p{N}_]|$)/gu, replace: 'فِين' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])ليه(?=[^\p{L}\p{N}_]|$)/gu, replace: 'لِيه' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])مين(?=[^\p{L}\p{N}_]|$)/gu, replace: 'مِين' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])دي(?=[^\p{L}\p{N}_]|$)/gu, replace: 'دِي' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])ده(?=[^\p{L}\p{N}_]|$)/gu, replace: 'دَه' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])دول(?=[^\p{L}\p{N}_]|$)/gu, replace: 'دُول' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])مش(?=[^\p{L}\p{N}_]|$)/gu, replace: 'مِش' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])برضه(?=[^\p{L}\p{N}_]|$)/gu, replace: 'بَرضُه' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])برضو(?=[^\p{L}\p{N}_]|$)/gu, replace: 'بَرضُه' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])كمان(?=[^\p{L}\p{N}_]|$)/gu, replace: 'كَمَان' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])شوية(?=[^\p{L}\p{N}_]|$)/gu, replace: 'شُوَيَّة' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])كتير(?=[^\p{L}\p{N}_]|$)/gu, replace: 'كِتِير' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])خالص(?=[^\p{L}\p{N}_]|$)/gu, replace: 'خَالِص' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])يعني(?=[^\p{L}\p{N}_]|$)/gu, replace: 'يَعْنِي' }
]

export const GULF_PHONETIC_GLOSSARY = [
    { pattern: /(?<=^|[^\p{L}\p{N}_])الحين(?=[^\p{L}\p{N}_]|$)/gu, replace: 'إِلْحِين' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])علشان(?=[^\p{L}\p{N}_]|$)/gu, replace: 'عَشَان' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])عشان(?=[^\p{L}\p{N}_]|$)/gu, replace: 'عَشَان' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])شلونك(?=[^\p{L}\p{N}_]|$)/gu, replace: 'شْلُونِك' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])شنو(?=[^\p{L}\p{N}_]|$)/gu, replace: 'شِنُو' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])ايش(?=[^\p{L}\p{N}_]|$)/gu, replace: 'إِيش' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])إيش(?=[^\p{L}\p{N}_]|$)/gu, replace: 'إِيش' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])كذا(?=[^\p{L}\p{N}_]|$)/gu, replace: 'كِذَا' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])وايد(?=[^\p{L}\p{N}_]|$)/gu, replace: 'وَايِد' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])زين(?=[^\p{L}\p{N}_]|$)/gu, replace: 'زِين' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])بعدين(?=[^\p{L}\p{N}_]|$)/gu, replace: 'بَعْدِين' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])تبي(?=[^\p{L}\p{N}_]|$)/gu, replace: 'تَبِي' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])ابي(?=[^\p{L}\p{N}_]|$)/gu, replace: 'أَبِي' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])أبي(?=[^\p{L}\p{N}_]|$)/gu, replace: 'أَبِي' },
    { pattern: /(?<=^|[^\p{L}\p{N}_])يبي(?=[^\p{L}\p{N}_]|$)/gu, replace: 'يَبِي' }
]

export function applyDialectPhoneticNudges(text, dialect) {
    if (!text || typeof text !== 'string') return text || ''
    let nudged = text
    if (dialect === 'ar-eg') {
        for (const item of EGYPTIAN_PHONETIC_GLOSSARY) {
            nudged = nudged.replace(item.pattern, item.replace)
        }
    } else if (dialect === 'ar-sa') {
        for (const item of GULF_PHONETIC_GLOSSARY) {
            nudged = nudged.replace(item.pattern, item.replace)
        }
    }
    return nudged
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
                { role: 'user', content: `Translate the following text into the requested dual JSON format:\n\n${text}` }
            ],
            temperature: 0.25,
            response_format: { type: 'json_object' },
            max_tokens: 650
        })
    })
    if (!response.ok) {
        const err = await response.text()
        throw new Error(`OpenRouter API error ${response.status}: ${err}`)
    }
    const data = await response.json()
    const content = data.choices?.[0]?.message?.content?.trim() || ''

    // Parse JSON dual output
    try {
        const parsed = JSON.parse(content)
        if (parsed.caption && parsed.tts) {
            return {
                caption: String(parsed.caption).trim(),
                tts: String(parsed.tts).trim()
            }
        }
        if (parsed.caption) {
            const cap = String(parsed.caption).trim()
            const tts = parsed.tts ? String(parsed.tts).trim() : applyDialectPhoneticNudges(cap, dialect)
            return {
                caption: cap,
                tts: tts || cap
            }
        }
    } catch {
        // Fallback: search for json object in case of markdown wrapping
        const match = content.match(/\{[\s\S]*\}/)
        if (match) {
            try {
                const parsed = JSON.parse(match[0])
                if (parsed.caption) {
                    const cap = String(parsed.caption).trim()
                    const tts = parsed.tts ? String(parsed.tts).trim() : applyDialectPhoneticNudges(cap, dialect)
                    return {
                        caption: cap,
                        tts: tts || cap
                    }
                }
            } catch {}
        }
    }

    // Fallback if plain text returned: strip diacritics for caption, apply dialect nudges for tts
    const cleanCaption = content.replace(/[\u0617-\u061A\u064B-\u0652]/g, '').trim()
    const ttsText = applyDialectPhoneticNudges(content || text, dialect)
    return {
        caption: cleanCaption || text,
        tts: ttsText || text
    }
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
            let sliceEnd = wordCursor + targetWordCount
            const remainingCues = originalCues.length - 1 - i
            if (words.length - sliceEnd < remainingCues && words.length >= originalCues.length) {
                sliceEnd = words.length - remainingCues
            }
            sliceEnd = Math.max(wordCursor, Math.min(words.length, sliceEnd))
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
    const captionSentences = []
    const ttsSentences = []
    const startTime = Date.now()

    console.log(`[OpenRouter] Translating ${total} stitched sentences (${chunks.length} cues) to ${dialectLabel} via GPT-4o-mini (Dual-Transcript)`)
    onProgress?.({ step: 'loading', message: `Connecting to OpenRouter for ${dialectLabel}...`, percent: 0 })

    for (let i = 0; i < total; i++) {
        if (req?.socket?.destroyed) throw new Error('Translation cancelled by client')
        onProgress?.({ step: 'translating', message: `Translating sentence ${i + 1} of ${total} (${dialectLabel})...`, batch: i + 1, of: total, percent: Math.round((i / total) * 100) })
        const pair = await translateOneWithOpenRouter(stitchedSentences[i].text, targetLanguage, apiKey)
        captionSentences.push(pair.caption)
        ttsSentences.push(pair.tts)
    }

    // Re-slice caption sentences back into original cue windows for player subtitles
    const translatedChunks = []
    for (let i = 0; i < total; i++) {
        const sliced = sliceTranslatedSentenceToCues(captionSentences[i], stitchedSentences[i].cues)
        translatedChunks.push(...sliced)
    }

    // Attach companion phonetic TTS segments (sentence-level timing + phonetically nudged text)
    const ttsSegments = stitchedSentences.map((s, idx) => ({
        start: s.start,
        end: s.end,
        timestamp: [s.start, s.end],
        caption: captionSentences[idx],
        text: ttsSentences[idx]
    }))

    translatedChunks.ttsSegments = ttsSegments

    console.log(`[OpenRouter] ${dialectLabel} dual translation done in ${((Date.now() - startTime) / 1000).toFixed(2)}s`)
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

    // Standard language ttsSegments
    translatedChunks.ttsSegments = stitchedSentences.map((s, idx) => ({
        start: s.start,
        end: s.end,
        timestamp: [s.start, s.end],
        caption: translatedSentences[idx],
        text: translatedSentences[idx]
    }))

    console.log(`[NLLB-200] Done in ${((Date.now() - startTime) / 1000).toFixed(2)}s: ${translatedChunks.length} chunks`)
    onProgress?.({ step: 'done', message: 'Translation complete!', batch: totalBatches, of: totalBatches, percent: 100, lang: targetLanguage, chunkCount: translatedChunks.length })
    return translatedChunks
}

export async function translateChunks(chunks, targetLanguage, apiKey, modelParams, onProgress, req, sourceLanguage = 'en') {
    if (targetLanguage === 'ar-eg' || targetLanguage === 'ar-sa') {
        if (hasOpenRouterKey()) {
            return translateChunksOpenRouter(chunks, targetLanguage, onProgress, req)
        }
        // Offline / No-API-Key Fallback: Use local NLLB-200 for Arabic ('ar') and apply dialect phonetic nudging
        const dialectLabel = targetLanguage === 'ar-eg' ? 'Egyptian Arabic' : 'Gulf Arabic'
        console.warn(`[aiTranslation] OpenRouter API key not configured for ${dialectLabel}. Translating via local NLLB-200 with dialect phonetic nudging.`)
        onProgress?.({ step: 'loading', message: `OpenRouter key not found. Using offline NLLB-200 with ${dialectLabel} phonetic nudging...`, percent: 0 })
        const translated = await translateChunksNLLB(chunks, 'ar', onProgress, req, sourceLanguage)
        // Transform the ttsSegments text with dialect phonetic nudges while preserving clean caption
        if (translated.ttsSegments && Array.isArray(translated.ttsSegments)) {
            for (const seg of translated.ttsSegments) {
                seg.text = applyDialectPhoneticNudges(seg.text, targetLanguage)
            }
        }
        return translated
    }
    return translateChunksNLLB(chunks, targetLanguage, onProgress, req, sourceLanguage)
}

export function hasOpenRouterKey() {
    return !!getOpenRouterKey()
}

