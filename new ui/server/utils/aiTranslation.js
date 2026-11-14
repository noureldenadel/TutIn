/**
 * TutIn Server — AI Subtitle Normalization & Translation Service
 *
 * Best-practice architecture for Subtitles + Future AI Dubbing:
 * 1. Clause-Level Cue Normalization (`normalizeCuesIntoClauses`):
 *    - Strips Whisper silence hallucinations and non-speech noise tags (`[Music]`, `♪`).
 *    - When word-level timestamps (`cue.words`) are available from faster-whisper,
 *      groups words into natural grammatical clauses (1.5s – 6.5s, max ~84 chars)
 *      breaking on terminal punctuation, commas, or acoustic pauses (>= 350ms).
 *    - When raw unpunctuated cues are imported (e.g. YouTube auto-captions or legacy SRTs),
 *      restores punctuation using acoustic inter-cue pause gaps (>= 500ms) + discourse
 *      transition/question markers and merges tiny fragments into 1.5s – 6.5s clauses.
 * 2. 1-to-1 Context-Windowed Translation (`translateChunks`):
 *    - Offline Engine: Local NLLB-200 worker (`Xenova/nllb-200-distilled-600M`) for 25+ languages.
 *    - Cloud LLM Engine (OpenRouter): Sliding window of 12 indexed cues with `durationSec`
 *      isochrony constraints so translations fit naturally inside each speaker time window
 *      for both readable subtitles and natural XTTS voice dubbing.
 */

import { fork } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import { getXenovaCacheDir } from './modelManager.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const NLLB_LANG_MAP = {
    'en': 'eng_Latn',
    'ar': 'arb_Arab',
    'ar-eg': 'arz_Arab',
    'ar-sa': 'ars_Arab',
    'es': 'spa_Latn',
    'fr': 'fra_Latn',
    'de': 'deu_Latn',
    'zh': 'zho_Hans',
    'ja': 'jpn_Jpan',
    'ko': 'kor_Hang',
    'ru': 'rus_Cyrl',
    'pt': 'por_Latn',
    'it': 'ita_Latn',
    'hi': 'hin_Deva',
    'tr': 'tur_Latn',
    'nl': 'nld_Latn',
    'pl': 'pol_Latn',
    'vi': 'vie_Latn',
    'th': 'tha_Thai',
    'cs': 'ces_Latn',
    'hu': 'hun_Latn',
    'uk': 'ukr_Cyrl',
    'id': 'ind_Latn',
    'sv': 'swe_Latn',
    'da': 'dan_Latn',
    'no': 'nob_Latn',
    'fi': 'fin_Latn',
    'el': 'ell_Grek',
    'he': 'heb_Hebr'
}

export const LANG_DISPLAY_MAP = {
    'en': 'English',
    'ar': 'Arabic',
    'ar-eg': 'Arabic (Egyptian)',
    'ar-sa': 'Arabic (Saudi / Gulf)',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'zh': 'Chinese (Simplified)',
    'ja': 'Japanese',
    'ko': 'Korean',
    'ru': 'Russian',
    'pt': 'Portuguese',
    'it': 'Italian',
    'hi': 'Hindi',
    'tr': 'Turkish',
    'nl': 'Dutch',
    'pl': 'Polish',
    'vi': 'Vietnamese',
    'th': 'Thai',
    'cs': 'Czech',
    'hu': 'Hungarian',
    'uk': 'Ukrainian',
    'id': 'Indonesian',
    'sv': 'Swedish',
    'da': 'Danish',
    'no': 'Norwegian',
    'fi': 'Finnish',
    'el': 'Greek',
    'he': 'Hebrew'
}

export const XTTS_SUPPORTED_LANGS = new Set([
    'en', 'es', 'fr', 'de', 'it', 'pt', 'pl', 'tr', 'ru', 'nl', 'cs', 'ar', 'ar-eg', 'ar-sa', 'zh', 'hu', 'ko', 'ja', 'hi'
])

export function isDubbingLanguageSupported(langCode) {
    if (!langCode) return false
    const clean = langCode.toLowerCase().trim()
    return XTTS_SUPPORTED_LANGS.has(clean) || XTTS_SUPPORTED_LANGS.has(clean.split('-')[0])
}

// ── Hallucination & Noise Stripping ──────────────────────────────

const HALLUCINATION_PATTERNS = [
    /^thank you( very much)? for watching[.!]*$/i,
    /^thanks for watching[.!]*$/i,
    /^please (like and )?subscribe[.!]*$/i,
    /^subtitles by /i,
    /^captions by /i,
    /^translated by /i,
    /^amara\.org/i,
    /^www\./i,
    /^\[.*(music|applause|laughter|silence|noise|blank_audio).*\]$/i,
    /^\(.*(music|applause|laughter|silence|noise).*\)$/i,
    /^[♪♫♬\s.…\-_]+$/
]

export function cleanSubtitleText(rawText, { stripSdhTags = false } = {}) {
    if (!rawText || typeof rawText !== 'string') return ''
    let text = rawText
        .replace(/<[^>]+>/g, '') // Strip HTML/VTT styling tags
        .replace(/\{[^}]+\}/g, '') // Strip ASS override tags
        .replace(/\s+/g, ' ')
        .trim()

    if (stripSdhTags) {
        text = text
            .replace(/\[[^\]]*\]/g, '')
            .replace(/\([^)]*(?:music|applause|laugh|sigh|cough|noise|audio)[^)]*\)/gi, '')
            .replace(/^[>\-\s]+:\s*/, '')
            .replace(/\s+/g, ' ')
            .trim()
    }

    if (!text) return ''
    for (const pat of HALLUCINATION_PATTERNS) {
        if (pat.test(text)) return ''
    }
    return text
}

// ── Acoustic Pause + Clause Normalization ────────────────────────

const EN_SENTENCE_STARTERS = new Set([
    'so', 'now', 'next', 'first', 'second', 'third', 'finally', 'however', 'therefore',
    'moreover', 'furthermore', 'meanwhile', 'instead', 'otherwise', 'actually', 'basically',
    'essentially', 'remember', 'notice', 'look', 'let', "let's", 'here', 'today', 'welcome'
])

const EN_QUESTION_STARTERS = new Set([
    'what', 'why', 'how', 'when', 'where', 'who', 'which', 'can', 'could', 'would', 'should', 'do', 'does', 'did', 'is', 'are'
])

function hasTerminalPunctuation(text) {
    return /[.?!؟।。！？][\s"')\]]*$/.test((text || '').trim())
}

function hasClausePunctuation(text) {
    return /[,;:،؛—–\-][\s"')\]]*$/.test((text || '').trim())
}

export function needsPunctuationRestoration(chunks) {
    if (!Array.isArray(chunks) || chunks.length === 0) return false
    const fullText = chunks.map(c => (c.text || '').trim()).join(' ')
    const words = fullText.split(/\s+/).filter(Boolean)
    if (words.length < 12) return false
    const punctMatches = fullText.match(/[.?!؟।。！？]/g)
    const punctCount = punctMatches ? punctMatches.length : 0
    return (punctCount / words.length) < (1 / 28)
}

/**
 * Normalizes raw cues (either with word-level timestamps from faster-whisper,
 * or raw chunk cues from browser Whisper / YouTube / SRT) into clean,
 * punctuated grammatical clauses (1.5s - 6.5s, max ~84 chars) ready for
 * both broadcast subtitling and XTTS voice dubbing.
 */
export function normalizeCuesIntoClauses(rawChunks, lang = 'en') {
    if (!Array.isArray(rawChunks) || rawChunks.length === 0) return []
    const isArabic = lang.toLowerCase().startsWith('ar')
    const questionMark = isArabic ? '؟' : '?'

    // Path A: Word-level timestamps present (from faster-whisper)
    const allWords = []
    for (const chunk of rawChunks) {
        if (Array.isArray(chunk.words) && chunk.words.length > 0) {
            for (const w of chunk.words) {
                const text = (w.word || w.text || '').trim()
                if (!text) continue
                allWords.push({
                    word: text,
                    start: Number(w.start ?? chunk.start ?? 0),
                    end: Number(w.end ?? chunk.end ?? 0)
                })
            }
        }
    }

    if (allWords.length > 0) {
        const clauses = []
        let currentWords = []

        const flushWords = () => {
            if (currentWords.length === 0) return
            const joined = cleanSubtitleText(currentWords.map(w => w.word).join(' '))
            if (joined) {
                const start = Math.max(0, Number(currentWords[0].start.toFixed(2)))
                const end = Math.max(start + 0.6, Number(currentWords[currentWords.length - 1].end.toFixed(2)))
                clauses.push({
                    start,
                    end,
                    timestamp: [start, end],
                    text: joined
                })
            }
            currentWords = []
        }

        for (let i = 0; i < allWords.length; i++) {
            const w = allWords[i]
            const nextW = allWords[i + 1]
            currentWords.push(w)

            const currentText = currentWords.map(x => x.word).join(' ')
            const duration = w.end - currentWords[0].start
            const pauseAfter = nextW ? Math.max(0, nextW.start - w.end) : 999

            const endsSentence = hasTerminalPunctuation(w.word)
            const endsClause = hasClausePunctuation(w.word)

            const shouldBreak =
                !nextW ||
                (endsSentence && duration >= 1.2) ||
                (pauseAfter >= 0.45 && duration >= 1.4) ||
                (endsClause && (duration >= 3.2 || currentText.length >= 52)) ||
                duration >= 6.2 ||
                currentText.length >= 82

            if (shouldBreak) {
                flushWords()
            }
        }
        flushWords()
        if (clauses.length > 0) return clauses
    }

    // Path B: Chunk-level cues (Browser Whisper, YouTube auto-captions, or uploaded SRT/VTT)
    const cleaned = []
    for (const c of rawChunks) {
        const text = cleanSubtitleText(c.text)
        if (!text) continue
        const start = typeof c.start === 'number' ? c.start : (Array.isArray(c.timestamp) ? Number(c.timestamp[0]) : 0)
        const end = typeof c.end === 'number' ? c.end : (Array.isArray(c.timestamp) ? Number(c.timestamp[1]) : start + 2)
        const safeStart = Math.max(0, Number(start.toFixed(2)))
        const safeEnd = Math.max(safeStart + 0.5, Number(end.toFixed(2)))
        const dur = safeEnd - safeStart

        // Split run-on single cues (> 84 chars or > 6.5s) at clause/sentence boundaries proportionally
        if (text.length > 84 || dur > 6.5) {
            const parts = text
                .split(/(?<=[.?!؟।。！？,;:،؛])\s+/)
                .map(p => p.trim())
                .filter(Boolean)
            if (parts.length > 1) {
                const totalChars = parts.reduce((acc, p) => acc + p.length, 0) || 1
                let cursor = safeStart
                for (let pIdx = 0; pIdx < parts.length; pIdx++) {
                    const partText = parts[pIdx]
                    const ratio = partText.length / totalChars
                    const partEnd = pIdx === parts.length - 1
                        ? safeEnd
                        : Number((cursor + dur * ratio).toFixed(2))
                    cleaned.push({
                        start: Number(cursor.toFixed(2)),
                        end: Math.max(Number((cursor + 0.4).toFixed(2)), partEnd),
                        text: partText
                    })
                    cursor = partEnd
                }
                continue
            }
        }

        cleaned.push({
            start: safeStart,
            end: safeEnd,
            text
        })
    }

    if (cleaned.length === 0) return []

    const unpunctuated = needsPunctuationRestoration(cleaned)

    // Merge micro-fragments (e.g. YouTube 1s auto-captions) into natural 1.5s-6.0s clauses
    const merged = []
    let current = null

    const finalizeCue = (cue, isLast = false, nextFirstWord = '') => {
        if (!cue) return
        let text = cue.text.trim()
        if (unpunctuated && text) {
            if (!isArabic && /^[a-z]/.test(text)) {
                text = text.charAt(0).toUpperCase() + text.slice(1)
            }
            text = text.replace(/\bi\b/g, 'I')
            if (!hasTerminalPunctuation(text) && !hasClausePunctuation(text)) {
                const firstWord = text.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '') || ''
                if (EN_QUESTION_STARTERS.has(firstWord)) {
                    text += questionMark
                } else if (isLast || EN_SENTENCE_STARTERS.has(nextFirstWord) || (cue.pauseAfter ?? 0) >= 0.55) {
                    text += '.'
                }
            }
        }
        merged.push({
            start: cue.start,
            end: cue.end,
            timestamp: [cue.start, cue.end],
            text
        })
    }

    for (let i = 0; i < cleaned.length; i++) {
        const item = cleaned[i]
        const next = cleaned[i + 1]
        const pauseAfter = next ? Math.max(0, next.start - item.end) : 999
        const nextFirstWord = next
            ? (next.text.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '') || '')
            : ''

        if (!current) {
            current = { start: item.start, end: item.end, text: item.text, pauseAfter }
        } else {
            const combinedText = `${current.text} ${item.text}`
            const combinedDur = item.end - current.start
            const prevEndsSentence = hasTerminalPunctuation(current.text)
            const prevPause = current.pauseAfter ?? 0

            const canMerge =
                !prevEndsSentence &&
                prevPause < 0.45 &&
                combinedDur <= 5.8 &&
                combinedText.length <= 84 &&
                !(unpunctuated && EN_SENTENCE_STARTERS.has(item.text.split(/\s+/)[0]?.toLowerCase() || '') && (current.end - current.start) >= 1.8)

            if (canMerge) {
                current.end = item.end
                current.text = combinedText
                current.pauseAfter = pauseAfter
            } else {
                const firstW = item.text.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '') || ''
                finalizeCue(current, false, firstW)
                current = { start: item.start, end: item.end, text: item.text, pauseAfter }
            }
        }

        if (!next) {
            finalizeCue(current, true, nextFirstWord)
            current = null
        }
    }

    return merged
}

/**
 * Sanitizes cues specifically before feeding into Translation or XTTS Dubbing
 * (strips SDH bracket tags like `[Music]` while preserving natural clause boundaries).
 */
export function sanitizeCuesForSpeechAndTranslation(chunks, lang = 'en') {
    if (!Array.isArray(chunks) || chunks.length === 0) return []
    const stripped = chunks
        .map(c => ({
            ...c,
            text: cleanSubtitleText(c.text, { stripSdhTags: true })
        }))
        .filter(c => c.text.length > 0)
    return normalizeCuesIntoClauses(stripped, lang)
}

// ── OpenRouter Context-Windowed Isochrony Translator ─────────────

async function translateBatchWithOpenRouter({
    batch,
    sourceLangCode,
    targetLangCode,
    apiKey,
    model = 'openai/gpt-4o-mini',
    courseTitle = '',
    signal = null
}) {
    const srcName = LANG_DISPLAY_MAP[sourceLangCode] || sourceLangCode || 'English'
    const tgtName = LANG_DISPLAY_MAP[targetLangCode] || targetLangCode

    let dialectInstruction = ''
    if (targetLangCode === 'ar-eg') {
        dialectInstruction = `Translate into natural, idiomatic **Egyptian Arabic (العامية المصرية)** as spoken by an experienced Egyptian instructor explaining technical/creative concepts. Keep technical terms natural, use standard unvowelized Egyptian Arabic spelling, and avoid stiff Modern Standard Arabic (فصحى).`
    } else if (targetLangCode === 'ar-sa') {
        dialectInstruction = `Translate into natural, idiomatic **Saudi / Gulf Arabic (اللهجة السعودية / الخليجية)** as spoken by an experienced Saudi instructor explaining technical/creative concepts. Keep technical terms natural, use standard unvowelized Gulf Arabic spelling, and avoid stiff Modern Standard Arabic (فصحى).`
    } else {
        dialectInstruction = `Translate into natural, fluent **${tgtName}** suitable for both on-screen video subtitles and spoken voice dubbing.`
    }

    const payloadItems = batch.map((c, idx) => ({
        i: idx,
        durationSec: Math.max(0.8, Number(((c.end ?? 2) - (c.start ?? 0)).toFixed(1))),
        text: c.text
    }))

    const systemPrompt = [
        `You are an expert technical video localization and dubbing translator (${srcName} -> ${tgtName}).`,
        courseTitle ? `Course context: "${courseTitle}".` : '',
        dialectInstruction,
        `CRITICAL RULES:`,
        `1. Return ONLY a valid JSON object with key "items" containing an array of objects: {"items": [{"i": 0, "text": "..."}, ...]}.`,
        `2. Preserve exact 1-to-1 index mapping ("i"). Never merge, drop, or reorder indices.`,
        `3. ISOCHRONY / PACING FOR DUBBING: Each item includes "durationSec" (how long the speaker talks in the video). Keep each translation concise enough to be spoken comfortably within "durationSec" seconds and read easily as a 1-2 line subtitle.`
    ].filter(Boolean).join('\n')

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost:5173',
            'X-Title': 'TutIn Study Companion'
        },
        body: JSON.stringify({
            model: model || 'openai/gpt-4o-mini',
            temperature: 0.2,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: JSON.stringify({ items: payloadItems }) }
            ]
        }),
        ...(signal ? { signal } : {})
    })

    if (!response.ok) {
        const errText = await response.text().catch(() => '')
        throw new Error(`OpenRouter HTTP ${response.status}: ${errText.slice(0, 160)}`)
    }

    const data = await response.json()
    const rawContent = data?.choices?.[0]?.message?.content || '{}'
    const parsed = JSON.parse(rawContent)
    const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.items) ? parsed.items : (Array.isArray(parsed.translations) ? parsed.translations : []))

    const byIndex = new Map()
    for (const item of list) {
        if (typeof item?.i === 'number' && typeof item?.text === 'string' && item.text.trim()) {
            byIndex.set(item.i, item.text.trim())
        }
    }

    return batch.map((orig, idx) => ({
        start: orig.start,
        end: orig.end,
        timestamp: orig.timestamp || [orig.start, orig.end],
        text: byIndex.get(idx) || orig.text
    }))
}

// ── Main Translation Entrypoint ──────────────────────────────────

export async function translateChunks(
    chunks,
    targetLangCode,
    onProgress = null,
    signal = null,
    openRouterApiKey = null,
    openRouterModel = null,
    sourceLangCode = 'en',
    courseTitle = ''
) {
    const tgt = (targetLangCode || '').toLowerCase().trim()
    const src = (sourceLangCode || 'en').toLowerCase().split(':')[0].trim()

    if (!NLLB_LANG_MAP[tgt]) {
        throw new Error(`Unsupported target language code: ${targetLangCode}. Supported: ${Object.keys(NLLB_LANG_MAP).join(', ')}`)
    }

    // Normalize source cues into clean clauses before translating
    const normalizedInput = normalizeCuesIntoClauses(chunks, src)
    if (normalizedInput.length === 0) return []

    const isDialect = tgt === 'ar-eg' || tgt === 'ar-sa'
    const hasCloudKey = Boolean(openRouterApiKey && openRouterApiKey.trim().length > 10)

    if (isDialect && !hasCloudKey) {
        throw new Error(
            `${LANG_DISPLAY_MAP[tgt]} requires an OpenRouter API key in Settings → AI for natural dialect translation, or choose standard Arabic (ar) for 100% offline translation.`
        )
    }

    // Path 1: Cloud LLM Translation (Used for Egyptian/Saudi dialects, or when OpenRouter key is configured & preferred)
    if (hasCloudKey && isDialect) {
        onProgress?.({
            step: 'loading',
            percent: 8,
            message: `Connecting to OpenRouter (${openRouterModel || 'openai/gpt-4o-mini'}) for ${LANG_DISPLAY_MAP[tgt]}…`
        })

        const WINDOW_SIZE = 14
        const total = normalizedInput.length
        const translated = []

        for (let i = 0; i < total; i += WINDOW_SIZE) {
            if (signal?.aborted) throw new Error('Translation cancelled by user')
            const batch = normalizedInput.slice(i, i + WINDOW_SIZE)
            const batchResult = await translateBatchWithOpenRouter({
                batch,
                sourceLangCode: src,
                targetLangCode: tgt,
                apiKey: openRouterApiKey.trim(),
                model: openRouterModel || 'openai/gpt-4o-mini',
                courseTitle,
                signal
            })
            translated.push(...batchResult)

            const doneCount = Math.min(i + WINDOW_SIZE, total)
            const percent = Math.round(10 + (doneCount / total) * 88)
            onProgress?.({
                step: 'translating',
                current: doneCount,
                total,
                percent,
                message: `Translating to ${LANG_DISPLAY_MAP[tgt]} (${doneCount}/${total})…`
            })
        }

        onProgress?.({
            step: 'done',
            current: total,
            total,
            percent: 100,
            message: 'Translation complete'
        })
        return translated
    }

    // Path 2: 100% Offline Local NLLB-200 Isolated Child Process
    // Uses child_process.fork instead of worker_threads so cancelling ONNX Runtime
    // mid-inference never tears down the host Express server process.
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            return reject(new Error('Translation cancelled by user'))
        }

        const workerPath = path.join(__dirname, '..', 'workers', 'translationWorker.js')
        const child = fork(workerPath, [], {
            env: {
                ...process.env,
                TUTIN_XENOVA_CACHE_DIR: getXenovaCacheDir() || ''
            }
        })

        let settled = false
        let onAbort = null

        const cleanup = () => {
            if (signal && onAbort) {
                signal.removeEventListener('abort', onAbort)
            }
        }

        const stopChild = () => {
            try {
                if (child.connected) {
                    child.send({ type: 'cancel' })
                }
            } catch { }
            setTimeout(() => {
                try {
                    if (!child.killed && child.exitCode === null) {
                        child.kill()
                    }
                } catch { }
            }, 80).unref?.()
        }

        if (signal) {
            onAbort = () => {
                if (settled) return
                settled = true
                cleanup()
                stopChild()
                reject(new Error('Translation cancelled by user'))
            }
            signal.addEventListener('abort', onAbort, { once: true })
        }

        child.on('message', (msg) => {
            if (msg?.type === 'progress') {
                if (!settled) onProgress?.(msg.data)
            } else if (msg?.type === 'done') {
                if (settled) return
                settled = true
                cleanup()
                resolve(msg.result)
            } else if (msg?.type === 'error') {
                if (settled) return
                settled = true
                cleanup()
                reject(new Error(msg.error))
            }
        })

        child.on('error', (err) => {
            if (settled) return
            settled = true
            cleanup()
            reject(err)
        })

        child.on('exit', (code, exitSignal) => {
            if (!settled) {
                settled = true
                cleanup()
                if (code === 0) {
                    reject(new Error('Translation worker exited before returning subtitles'))
                } else {
                    reject(
                        new Error(
                            `Translation worker stopped (${exitSignal ? `signal ${exitSignal}` : `exit code ${code}`})`,
                        ),
                    )
                }
            }
        })

        child.send({
            type: 'translate',
            chunks: normalizedInput,
            targetLangCode: tgt,
            sourceLangCode: src
        })
    })
}

export function getSupportedTranslationLanguages() {
    return Object.entries(LANG_DISPLAY_MAP).map(([code, name]) => ({
        code,
        name,
        requiresCloudKey: code === 'ar-eg' || code === 'ar-sa'
    }))
}
