import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { getOne } from '../database.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PYTHON_DUBBING_SERVER_URL = 'http://127.0.0.1:9475'

// Punctuation cache directory: <workspace>/models/punctuation/
export const PUNCTUATION_MODELS_DIR = path.join(__dirname, '..', '..', 'models', 'punctuation')

/**
 * Checks whether the given subtitle chunks lack adequate punctuation.
 * Computes punctuation density: terminal marks (. ? ! ؟ 。 ！ …) / total words.
 * If density < 0.04 (less than 1 mark per 25 words), restoration is recommended.
 */
export function needsPunctuationRestoration(chunks) {
    if (!chunks || !Array.isArray(chunks) || chunks.length === 0) return false

    const allText = chunks.map(c => c.text || '').join(' ').trim()
    const words = allText.split(/\s+/).filter(Boolean)
    if (words.length < 8) return false

    const terminalMarks = (allText.match(/[.?!؟。！…]+/g) || []).length
    const density = terminalMarks / words.length

    // If fewer than 1 terminal mark every 25 words, file lacks normal punctuation
    return density < 0.04
}

/**
 * Re-maps a continuous stream of punctuated words back to the original subtitle cues,
 * strictly preserving each cue's exact millisecond [start, end] timestamps.
 */
export function remapPunctuatedTextToCues(originalChunks, punctuatedText) {
    if (!originalChunks || originalChunks.length === 0) return []
    if (!punctuatedText || !punctuatedText.trim()) return originalChunks

    const punctWords = punctuatedText.trim().split(/\s+/).filter(Boolean)
    if (punctWords.length === 0) return originalChunks

    let punctIdx = 0
    const remapped = []

    for (let c = 0; c < originalChunks.length; c++) {
        const chunk = originalChunks[c]
        const origWords = (chunk.text || '').trim().split(/\s+/).filter(Boolean)
        
        if (origWords.length === 0) {
            remapped.push({ ...chunk })
            continue
        }

        const assignedWords = []
        for (let w = 0; w < origWords.length; w++) {
            if (punctIdx < punctWords.length) {
                assignedWords.push(punctWords[punctIdx++])
            } else {
                assignedWords.push(origWords[w])
            }
        }

        remapped.push({
            ...chunk,
            text: assignedWords.join(' ')
        })
    }

    // If any trailing punctuated words remain, append them to the last chunk
    if (punctIdx < punctWords.length && remapped.length > 0) {
        const remaining = punctWords.slice(punctIdx).join(' ')
        remapped[remapped.length - 1].text += ' ' + remaining
    }

    return remapped
}

/**
 * Zero-download, 100% offline heuristic punctuation restorer.
 * Uses acoustic pause gaps (>= 550ms), discourse transition words,
 * question markers, and word bounds to insert appropriate punctuation.
 */
export function restorePunctuationHeuristic(chunks, lang = 'en') {
    if (!chunks || chunks.length === 0) return []

    const isArabic = (lang || '').toLowerCase().startsWith('ar')
    const termMark = isArabic ? '.' : '.'
    const qMark = isArabic ? '؟' : '?'
    const commaMark = isArabic ? '،' : ','

    const transitionRegex = /^(Next|However|Furthermore|Meanwhile|Finally|First|Second|Third|Moreover|Therefore|In addition|Now|Then|So)\b/i
    const arabicTransitionRegex = /^(ثم|بعد ذلك|علاوة على ذلك|أخيرا|أولا|ثانيا|لذلك|بناء على ذلك|بالإضافة إلى ذلك)(\s|$)/
    const questionRegex = /^(What|Why|How|When|Where|Who|Which|Is|Are|Do|Does|Can|Could|Would|Should)\b/i
    const arabicQuestionRegex = /^(هل|لماذا|كيف|متى|أين|من|ما|ماذا|كم)(\s|$)/

    const result = []

    for (let i = 0; i < chunks.length; i++) {
        const curr = { ...chunks[i] }
        let text = (curr.text || '').trim()
        if (!text) {
            result.push(curr)
            continue
        }

        // Capitalize first letter of sentence if not already
        if (!isArabic && text.length > 0) {
            text = text.charAt(0).toUpperCase() + text.slice(1)
        }

        const currStart = Array.isArray(curr.timestamp) ? Number(curr.timestamp[0]) : Number(curr.start ?? 0)
        const currEnd = Array.isArray(curr.timestamp) ? Number(curr.timestamp[1]) : Number(curr.end ?? (currStart + 2))

        const next = chunks[i + 1]
        let shouldEndSentence = false
        let isQuestion = false

        if (next) {
            const nextStart = Array.isArray(next.timestamp) ? Number(next.timestamp[0]) : Number(next.start ?? 0)
            const gap = nextStart - currEnd
            const nextText = (next.text || '').trim()

            // 1. Acoustic pause gap >= 550ms
            if (gap >= 0.55) {
                shouldEndSentence = true
            }

            // 2. Next cue starts with transition word
            if (!shouldEndSentence) {
                if (isArabic && arabicTransitionRegex.test(nextText)) {
                    shouldEndSentence = true
                } else if (!isArabic && transitionRegex.test(nextText)) {
                    shouldEndSentence = true
                }
            }

            // 3. Question marker detection
            if (isArabic ? arabicQuestionRegex.test(text) : questionRegex.test(text)) {
                isQuestion = true
            }
        } else {
            // Last chunk always ends with terminal punctuation
            shouldEndSentence = true
            if (isArabic ? arabicQuestionRegex.test(text) : questionRegex.test(text)) {
                isQuestion = true
            }
        }

        // Apply terminal mark if not already present
        const hasTerminal = /[.?!؟。！…]$/.test(text)
        if (shouldEndSentence && !hasTerminal) {
            text += isQuestion ? qMark : termMark
        }

        curr.text = text
        result.push(curr)
    }

    return result
}

/**
 * OpenRouter fast zero-download one-shot punctuation pass.
 * Uses GPT-4o-mini to restore punctuation & capitalization with strict word preservation.
 */
export async function restorePunctuationWithOpenRouter(chunks, lang = 'en', apiKey) {
    if (!chunks || chunks.length === 0) return []
    const fullText = chunks.map(c => c.text || '').join(' ')

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
                {
                    role: 'system',
                    content: `You are an expert subtitle editor. Restore punctuation (periods, commas, question marks, exclamation marks) and proper capitalization to the provided subtitle transcript.
CRITICAL RULES:
1. DO NOT change, delete, add, or reorder any words.
2. The number and order of words in your output MUST match the input exactly.
3. Only insert punctuation marks and fix casing.
4. Output ONLY the punctuated text with no introductory text or markdown formatting.`
                },
                {
                    role: 'user',
                    content: fullText
                }
            ],
            temperature: 0.1,
            max_tokens: Math.max(1024, Math.round(fullText.split(/\s+/).length * 1.5))
        })
    })

    if (!response.ok) {
        const err = await response.text()
        throw new Error(`OpenRouter punctuation error (${response.status}): ${err}`)
    }

    const data = await response.json()
    const punctuatedText = data.choices?.[0]?.message?.content?.trim() || fullText
    return remapPunctuatedTextToCues(chunks, punctuatedText)
}

/**
 * Local neural model punctuation pass via the Python dubbing server.
 * Connects to http://127.0.0.1:9475/punctuate with on-demand model download.
 */
export async function restorePunctuationWithEngine(chunks, lang = 'en') {
    if (!chunks || chunks.length === 0) return []
    const fullText = chunks.map(c => c.text || '').join(' ')

    const res = await fetch(`${PYTHON_DUBBING_SERVER_URL}/punctuate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            text: fullText,
            lang: (lang || 'en').toLowerCase().trim()
        })
    })

    if (!res.ok) {
        const err = await res.text()
        throw new Error(`Local punctuation engine error (${res.status}): ${err}`)
    }

    const data = await res.json()
    if (!data.punctuated_text) {
        throw new Error('Local punctuation engine returned empty text')
    }

    return remapPunctuatedTextToCues(chunks, data.punctuated_text)
}

/**
 * Master punctuation restoration orchestrator.
 * Evaluates need, chooses optimal engine (OpenRouter cloud pass if configured,
 * local on-demand neural model, or instant acoustic/transition heuristic fallback).
 */
export async function restorePunctuation(chunks, lang = 'en', options = {}, onProgress) {
    if (!chunks || chunks.length === 0) return []

    // 1. Check if restoration is necessary
    if (!needsPunctuationRestoration(chunks)) {
        return chunks
    }

    console.log(`[Punctuation] Subtitles lack punctuation for '${lang}'. Running on-demand restoration...`)
    onProgress?.({ step: 'punctuation', message: `Restoring punctuation for ${lang}...`, percent: 10 })

    // 2. Check if OpenRouter key is configured and preferred
    let openRouterKey = null
    try {
        const row = getOne("SELECT value FROM settings WHERE key = 'openRouterApiKey'")
        if (row?.value) {
            const parsed = JSON.parse(row.value)
            if (typeof parsed === 'string' && parsed.trim()) openRouterKey = parsed.trim()
        }
    } catch {}

    if (openRouterKey && options.preferCloud) {
        try {
            console.log('[Punctuation] Using OpenRouter zero-download cloud pass...')
            onProgress?.({ step: 'punctuation', message: 'Restoring punctuation via cloud AI...', percent: 40 })
            const result = await restorePunctuationWithOpenRouter(chunks, lang, openRouterKey)
            onProgress?.({ step: 'punctuation', message: 'Punctuation restored!', percent: 100 })
            return result
        } catch (err) {
            console.warn('[Punctuation] Cloud pass failed, falling back to local engine:', err.message)
        }
    }

    // 3. Try local neural model via Python server
    try {
        onProgress?.({ step: 'punctuation', message: `Running local punctuation restoration (${lang})...`, percent: 35 })
        const result = await restorePunctuationWithEngine(chunks, lang)
        console.log(`[Punctuation] Successfully restored punctuation via local neural model (${lang}).`)
        onProgress?.({ step: 'punctuation', message: 'Punctuation restored!', percent: 100 })
        return result
    } catch (err) {
        console.warn(`[Punctuation] Local neural engine unavailable (${err.message}). Using resilient heuristic fallback.`)
    }

    // 4. Instant resilient heuristic fallback (Pause gaps + Transition words)
    onProgress?.({ step: 'punctuation', message: 'Applying acoustic pause boundary formatting...', percent: 80 })
    const heuristicResult = restorePunctuationHeuristic(chunks, lang)
    onProgress?.({ step: 'punctuation', message: 'Punctuation restored!', percent: 100 })
    return heuristicResult
}
