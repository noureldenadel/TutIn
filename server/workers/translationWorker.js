import { pipeline, env } from '@xenova/transformers'
import { parentPort } from 'node:worker_threads'
import path from 'path'
import { fileURLToPath } from 'url'

import { getAiModelsDir } from '../utils/modelManager.js'
import {
    NLLB_LANG_MAP,
    isNonSpeechText,
    stitchCuesIntoSentences,
    sliceTranslatedSentenceToCues
} from '../utils/aiTranslation.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

env.cacheDir = getAiModelsDir()
env.allowLocalModels = true

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
