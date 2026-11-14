import { pipeline, env } from '@xenova/transformers'

env.allowLocalModels = false
env.useBrowserCache = false
if (process.env.TUTIN_XENOVA_CACHE_DIR) {
    env.cacheDir = process.env.TUTIN_XENOVA_CACHE_DIR
}

const MODEL_NAME = 'Xenova/nllb-200-distilled-600M'

const NLLB_LANG_MAP = {
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

let translatorInstance = null
let isCancelled = false

function sendToParent(payload) {
    try {
        if (typeof process.send === 'function') {
            process.send(payload)
        }
    } catch { }
}

async function getTranslator() {
    if (!translatorInstance) {
        sendToParent({
            type: 'progress',
            data: { step: 'loading', message: 'Loading NLLB-200 translation model…', percent: 5 }
        })

        translatorInstance = await pipeline('translation', MODEL_NAME, {
            progress_callback: (info) => {
                if (isCancelled) return
                if (info.status === 'progress' && info.progress) {
                    sendToParent({
                        type: 'progress',
                        data: {
                            step: 'downloading',
                            file: info.file,
                            percent: Math.round(info.progress),
                            message: `Downloading model: ${Math.round(info.progress)}%`
                        }
                    })
                } else if (info.status === 'done') {
                    sendToParent({
                        type: 'progress',
                        data: {
                            step: 'loaded_file',
                            file: info.file,
                            message: `Loaded ${info.file}`
                        }
                    })
                }
            }
        })

        if (isCancelled) return null

        sendToParent({
            type: 'progress',
            data: { step: 'ready', message: 'Translation model ready', percent: 15 }
        })
    }
    return translatorInstance
}

process.on('message', async (msg) => {
    if (msg?.type === 'cancel') {
        isCancelled = true
        setTimeout(() => process.exit(0), 25).unref?.()
        return
    }
    if (msg?.type !== 'translate') return

    const { chunks, targetLangCode, sourceLangCode } = msg
    const tgtLang = NLLB_LANG_MAP[targetLangCode]
    if (!tgtLang) {
        sendToParent({ type: 'error', error: `Unsupported target language code: ${targetLangCode}` })
        setTimeout(() => process.exit(1), 50)
        return
    }
    const srcLang = NLLB_LANG_MAP[sourceLangCode] || 'eng_Latn'

    try {
        const translator = await getTranslator()
        if (!translator || isCancelled) {
            process.exit(0)
            return
        }

        const total = chunks.length
        const BATCH_SIZE = 10
        const translatedChunks = []

        for (let i = 0; i < total; i += BATCH_SIZE) {
            if (isCancelled) {
                process.exit(0)
                return
            }

            const batch = chunks.slice(i, i + BATCH_SIZE)
            const texts = batch.map(c => (c.text || '').trim())
            const nonEmptyIndices = []
            const nonEmptyTexts = []

            texts.forEach((t, idx) => {
                if (t.length > 0) {
                    nonEmptyIndices.push(idx)
                    nonEmptyTexts.push(t)
                }
            })

            let translatedTexts = new Array(batch.length).fill('')

            if (nonEmptyTexts.length > 0) {
                const results = await translator(nonEmptyTexts, {
                    src_lang: srcLang,
                    tgt_lang: tgtLang,
                    max_length: 512
                })

                if (isCancelled) {
                    process.exit(0)
                    return
                }

                if (Array.isArray(results)) {
                    nonEmptyIndices.forEach((origIdx, resIdx) => {
                        const r = results[resIdx]
                        translatedTexts[origIdx] = r?.translation_text || (Array.isArray(r) ? r[0]?.translation_text : '') || ''
                    })
                } else if (results && results.translation_text) {
                    translatedTexts[nonEmptyIndices[0]] = results.translation_text
                }
            }

            for (let j = 0; j < batch.length; j++) {
                const orig = batch[j]
                translatedChunks.push({
                    start: orig.start,
                    end: orig.end,
                    timestamp: orig.timestamp || [orig.start, orig.end],
                    text: translatedTexts[j] || orig.text
                })
            }

            const processed = Math.min(i + BATCH_SIZE, total)
            const percent = Math.round(15 + (processed / total) * 84)
            sendToParent({
                type: 'progress',
                data: {
                    step: 'translating',
                    current: processed,
                    total,
                    percent,
                    message: `Translating cues (${processed}/${total})…`
                }
            })
        }

        sendToParent({
            type: 'progress',
            data: { step: 'done', current: total, total, percent: 100, message: 'Translation complete' }
        })

        sendToParent({ type: 'done', result: translatedChunks })
        setTimeout(() => process.exit(0), 50)
    } catch (err) {
        if (!isCancelled) {
            sendToParent({ type: 'error', error: err.message || 'Worker translation error' })
        }
        setTimeout(() => process.exit(isCancelled ? 0 : 1), 50)
    }
})
