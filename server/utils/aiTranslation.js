import { pipeline, env } from '@xenova/transformers'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Configure cache directory inside the main TutIn folder
env.cacheDir = path.join(__dirname, '..', '..', 'models', 'ai')
env.allowLocalModels = true

/**
 * aiTranslation.js
 * Translates an array of caption chunks to a target language using NLLB-200 model.
 */

const NLLB_LANG_MAP = {
    'en': 'eng_Latn',
    'ar': 'arb_Arab',
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

export async function translateChunks(chunks, targetLanguage, apiKey, modelParams, onProgress, req, sourceLanguage = 'en') {
    const modelId = `Xenova/nllb-200-distilled-600M`
    const tgt_lang = NLLB_LANG_MAP[targetLanguage]
    const src_lang = NLLB_LANG_MAP[sourceLanguage] || 'eng_Latn'
    
    if (!tgt_lang) {
        throw new Error(`Unsupported language code: ${targetLanguage}`)
    }
    
    console.log(`[NLLB-200] 🌐 Initializing translation: ${chunks.length} chunks | ${sourceLanguage} (${src_lang}) ➔ ${targetLanguage} (${tgt_lang})`)
    const startTime = Date.now()

    onProgress?.({
        step: 'loading',
        message: `Loading NLLB-200 model (1.2GB, downloads once)...`,
        percent: 0
    })

    let translator
    try {
        translator = await pipeline('translation', modelId, {
            progress_callback: (progress) => {
                if (progress.status === 'progress' || progress.status === 'downloading') {
                    onProgress?.({
                        step: 'downloading',
                        message: `Downloading model files... (${Math.round(progress.progress)}%)`,
                        percent: progress.progress
                    })
                } else if (progress.status === 'ready') {
                    onProgress?.({
                        step: 'loading',
                        message: 'Model loaded. Preparing translation...',
                        percent: 100
                    })
                }
            }
        })
    } catch (err) {
        console.error("[NLLB-200] ❌ Failed to load local model:", err)
        throw new Error(`Failed to load translation model for '${targetLanguage}'. Model ${modelId} might not exist. Error: ${err.message}`)
    }

    const BATCH_SIZE = 10 // Safe batch size for local memory
    const translatedChunks = []
    const totalBatches = Math.ceil(chunks.length / BATCH_SIZE)

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        if (req && req.socket && req.socket.destroyed) {
            console.log('[NLLB-200] 🛑 Translation cancelled by client')
            throw new Error("Translation cancelled by client")
        }

        const batch = chunks.slice(i, i + BATCH_SIZE)
        const batchTexts = batch.map(c => c.text)
        const batchNum = Math.floor(i / BATCH_SIZE) + 1
        
        onProgress?.({
            step: 'translating',
            message: `Translating batch ${batchNum} of ${totalBatches}...`,
            batch: batchNum,
            of: totalBatches,
            percent: Math.round(((batchNum - 1) / totalBatches) * 100)
        })

        try {
            // Local translation using NLLB
            const batchStart = Date.now()
            const output = await translator(batchTexts, {
                src_lang: src_lang,
                tgt_lang: tgt_lang
            })
            const batchElapsed = Date.now() - batchStart
            console.log(`[NLLB-200] ⚡ Batch ${batchNum}/${totalBatches} (${batch.length} lines) translated in ${batchElapsed}ms`)

            // Reconstruct chunks
            for (let j = 0; j < batch.length; j++) {
                const translatedText = Array.isArray(output[j]) ? output[j][0].translation_text : output[j].translation_text
                
                translatedChunks.push({
                    timestamp: batch[j].timestamp,
                    text: translatedText
                })
            }
        } catch (err) {
            console.error(`[NLLB-200] ❌ Local translation batch ${batchNum} failed:`, err)
            throw new Error(`Translation engine crashed on batch ${batchNum}: ${err.message}`)
        }
    }

    const totalSeconds = ((Date.now() - startTime) / 1000).toFixed(2)
    console.log(`[NLLB-200] ✅ Translation complete in ${totalSeconds}s: ${translatedChunks.length} chunks generated for '${targetLanguage}'`)

    onProgress?.({
        step: 'done',
        message: 'Translation complete!',
        batch: totalBatches,
        of: totalBatches,
        percent: 100,
        lang: targetLanguage,
        chunkCount: translatedChunks.length
    })

    return translatedChunks
}
