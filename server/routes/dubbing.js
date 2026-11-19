import express from 'express'
import fs from 'fs'
import path from 'path'
import { getAll, getOne, run } from '../database.js'
import {
    listDubLanguages,
    getDubFilePath,
    getDubFilePathForPlayback,
    getDubCachePath,
    getDubCacheWritePath,
    getCourseVoiceProfileDir,
    saveDubTrackMeta,
    loadDubTrackMeta,
    deleteDubTrackMeta,
    saveSubtitleTrackMeta,
    loadSubtitleTrackMeta,
    loadCaptionChunks,
    saveCaptionFile,
    normalizeSubtitleSources,
    resolveSubtitleSourceEntry,
    buildTrackId
} from '../utils/courseAssets.js'
import {
    translateChunks,
    normalizeCuesIntoClauses,
    sanitizeCuesForSpeechAndTranslation,
    LANG_DISPLAY_MAP,
    isDubbingLanguageSupported
} from '../utils/aiTranslation.js'
import {
    submitDubJob,
    pollJobStatus,
    cancelJob,
    getServiceHealth,
    setServiceDevice,
    unloadServiceModels,
    transcribeWithPythonService
} from '../services/dubbingService.js'
import { getModelsDiskStats } from '../utils/modelManager.js'

const router = express.Router()

function normalizeLangParam(rawLang) {
    const lang = String(rawLang || 'en').trim().toLowerCase()
    if (!lang || lang.includes('..') || lang.includes('/') || lang.includes('\\')) {
        return null
    }
    return lang
}

/**
 * Resolve course, module, and filename metadata needed to locate dubbed MP3 assets for a video.
 */
function getVideoDubMeta(videoId) {
    const video = getOne('SELECT * FROM videos WHERE id = ?', [videoId])
    if (!video) return null

    const moduleRecord = video.module_id
        ? getOne('SELECT folder_path FROM modules WHERE id = ?', [video.module_id])
        : null
    const courseRecord = video.course_id
        ? getOne('SELECT id, title, folder_path, language FROM courses WHERE id = ?', [video.course_id])
        : null

    let relModulePath = ''
    if (moduleRecord?.folder_path && courseRecord?.folder_path) {
        relModulePath = path.relative(courseRecord.folder_path, moduleRecord.folder_path)
        if (relModulePath === '.' || relModulePath.startsWith('..')) relModulePath = ''
    } else if (video.file_path && courseRecord?.folder_path) {
        const relDir = path.dirname(path.relative(courseRecord.folder_path, video.file_path))
        if (relDir && relDir !== '.' && !relDir.startsWith('..')) relModulePath = relDir
    }

    const videoBaseName = video.file_name
        ? path.basename(video.file_name, path.extname(video.file_name))
        : video.id

    let videoFilePath = video.file_path
    if ((!videoFilePath || !fs.existsSync(videoFilePath)) && courseRecord?.folder_path && video.file_name) {
        const candidate = path.join(courseRecord.folder_path, relModulePath, video.file_name)
        if (fs.existsSync(candidate)) videoFilePath = candidate
    }

    let dubbedTracks = []
    try {
        dubbedTracks = JSON.parse(video.dubbed_tracks || '[]')
    } catch {
        dubbedTracks = []
    }

    let subtitleSources = []
    try {
        subtitleSources = JSON.parse(video.subtitle_sources || '[]')
    } catch {
        subtitleSources = []
    }

    return {
        id: video.id,
        courseId: video.course_id,
        courseTitle: courseRecord?.title || '',
        courseFolder: courseRecord?.folder_path || null,
        courseLanguage: (courseRecord?.language || 'en').toLowerCase().trim(),
        relModulePath,
        videoFilePath: videoFilePath || null,
        videoBaseName,
        dubbedTracks: Array.isArray(dubbedTracks) ? dubbedTracks : [],
        subtitleSources: Array.isArray(subtitleSources) ? subtitleSources : []
    }
}

function resolveDubAudioPath(meta, lang) {
    const resolvedFromVault = getDubFilePathForPlayback(
        meta.id,
        lang,
        meta.courseFolder,
        meta.relModulePath,
        meta.videoBaseName
    )
    if (resolvedFromVault && fs.existsSync(resolvedFromVault)) {
        return resolvedFromVault
    }

    const doneJob = getOne(
        `SELECT audio_path FROM dub_jobs
         WHERE video_id = ? AND LOWER(language) = ? AND status = 'done'
         ORDER BY completed_at DESC, created_at DESC LIMIT 1`,
        [meta.id, lang]
    )
    if (doneJob?.audio_path && fs.existsSync(doneJob.audio_path)) {
        return doneJob.audio_path
    }

    const trackEntry = meta.dubbedTracks.find(
        (t) =>
            t?.language &&
            String(t.language).trim().toLowerCase() === lang &&
            t.status !== 'failed' &&
            t.filePath &&
            fs.existsSync(t.filePath)
    )
    if (trackEntry?.filePath) {
        return trackEntry.filePath
    }

    const cachePath = getDubCachePath(meta.id, lang)
    if (cachePath && fs.existsSync(cachePath)) {
        return cachePath
    }

    return null
}

/**
 * Reconciles `videos.dubbed_tracks` in SQLite with actual `.mp3` and `.meta.json` files
 * inside `<courseFolder>/.tutin/dubs/` (or `%APPDATA%/TutIn/dubs/` for cloud courses).
 */
function reconcileVideoDubbedTracks(meta) {
    const diskLangs = new Set(
        listDubLanguages(meta.id, meta.courseFolder, meta.relModulePath, meta.videoBaseName)
            .map(l => String(l || '').trim().toLowerCase())
            .filter(Boolean)
    )

    const dbJobs = getAll(
        "SELECT DISTINCT language, audio_path FROM dub_jobs WHERE video_id = ? AND status = 'done'",
        [meta.id]
    )
    for (const j of dbJobs) {
        if (j.language && j.audio_path && fs.existsSync(j.audio_path)) {
            diskLangs.add(String(j.language).trim().toLowerCase())
        }
    }

    for (const t of meta.dubbedTracks) {
        if (t?.language && t.status !== 'failed' && t.filePath && fs.existsSync(t.filePath)) {
            diskLangs.add(String(t.language).trim().toLowerCase())
        }
    }

    const reconciledTracks = []
    for (const lang of diskLangs) {
        const audioPath = resolveDubAudioPath(meta, lang)
        if (!audioPath || !fs.existsSync(audioPath)) continue

        const existingEntry = meta.dubbedTracks.find(
            t => String(t?.language || '').trim().toLowerCase() === lang
        )
        const sidecarMeta = loadDubTrackMeta(meta, lang)

        reconciledTracks.push({
            language: lang,
            filePath: audioPath,
            status: 'ready',
            engine: sidecarMeta?.engine || existingEntry?.engine || 'neural',
            bgMode: (sidecarMeta?.bgMode || existingEntry?.bgMode) === 'demucs' ? 'demucs' : 'none',
            voiceGender: sidecarMeta?.voiceGender || existingEntry?.voiceGender || 'male',
            ttsModel: sidecarMeta?.ttsModel || existingEntry?.ttsModel || null,
            backgroundModel: sidecarMeta?.backgroundModel || existingEntry?.backgroundModel || null,
            pipeline: sidecarMeta?.pipeline || existingEntry?.pipeline || null,
            generationSeconds: typeof sidecarMeta?.generationSeconds === 'number'
                ? sidecarMeta.generationSeconds
                : (typeof existingEntry?.generationSeconds === 'number' ? existingEntry.generationSeconds : null),
            sourceTranscriptFile: sidecarMeta?.sourceTranscriptFile || existingEntry?.sourceTranscriptFile || null,
            transcriptionModel: sidecarMeta?.transcriptionModel || existingEntry?.transcriptionModel || null,
            translationModel: sidecarMeta?.translationModel || existingEntry?.translationModel || null,
            generatedAt: sidecarMeta?.generatedAt || existingEntry?.generatedAt || null
        })
    }

    const serializedNew = JSON.stringify(reconciledTracks)
    const serializedOld = JSON.stringify(meta.dubbedTracks)
    if (serializedNew !== serializedOld) {
        try {
            run('UPDATE videos SET dubbed_tracks = ? WHERE id = ?', [serializedNew, meta.id])
            meta.dubbedTracks = reconciledTracks
        } catch { }
    }

    return reconciledTracks
}

/**
 * Atomic file copy via `.tmp` rename so interrupted jobs never leave corrupt `.mp3` files in the vault.
 */
function atomicCopyAudioFile(srcPath, destPath) {
    const dir = path.dirname(destPath)
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
    }
    const tmpPath = `${destPath}.tmp.${Date.now()}`
    fs.copyFileSync(srcPath, tmpPath)
    fs.renameSync(tmpPath, destPath)
}

// GET /api/dub/video/:videoId/languages - List available dubbed audio languages and their track metadata
router.get('/video/:videoId/languages', (req, res) => {
    try {
        const meta = getVideoDubMeta(req.params.videoId)
        if (!meta) {
            return res.status(404).json({ error: 'Video not found' })
        }

        const tracks = reconcileVideoDubbedTracks(meta)
        res.json({
            videoId: meta.id,
            languages: tracks.map(t => t.language),
            tracks
        })
    } catch (err) {
        console.error('Failed to list dub languages:', err)
        res.status(500).json({ error: err.message })
    }
})

// POST /api/dub/video/:videoId/generate - SSE Streaming AI Voice Dubbing Pipeline
router.post('/video/:videoId/generate', async (req, res) => {
    const {
        targetLanguage,
        sourceLanguage,
        sourceTrackId,
        engine: rawEngine = 'neural',
        voiceGender: rawGender = 'male',
        bgMode: rawBgMode = 'none',
        device: rawDevice = null,
        unloadIdleModel = true,
        openRouterApiKey: bodyApiKey = null,
        openRouterModel: bodyModel = null
    } = req.body || {}

    const targetLang = normalizeLangParam(targetLanguage)
    if (!targetLang) {
        return res.status(400).json({ error: 'targetLanguage is required' })
    }

    const engine = String(rawEngine || 'neural').toLowerCase().trim() === 'clone' ? 'clone' : 'neural'
    const voiceGender = String(rawGender || 'male').toLowerCase().trim() === 'female' ? 'female' : 'male'
    const bgMode = String(rawBgMode || 'none').toLowerCase().trim() === 'demucs' ? 'demucs' : 'none'

    if (engine === 'clone' && !isDubbingLanguageSupported(targetLang)) {
        return res.status(400).json({
            error: `Language '${targetLang}' is not supported by voice cloning. Switch voice engine to Neural.`
        })
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders?.()

    const sendEvent = (payload) => {
        try {
            res.write(`data: ${JSON.stringify(payload)}\n\n`)
        } catch { }
    }

    const abortController = new AbortController()
    let activePythonJobId = null

    res.on('close', () => {
        if (!res.writableEnded) {
            abortController.abort()
            if (activePythonJobId) {
                cancelJob(activePythonJobId).catch(() => {})
            }
        }
    })

    try {
        const meta = getVideoDubMeta(req.params.videoId)
        if (!meta) {
            sendEvent({ error: 'Video not found' })
            return res.end()
        }

        if ((engine === 'clone' || bgMode === 'demucs') && (!meta.videoFilePath || !fs.existsSync(meta.videoFilePath))) {
            sendEvent({
                error: 'Voice cloning and music stem separation require a local video file on disk.'
            })
            return res.end()
        }

        const dubStartMs = Date.now()
        let didTranscribe = false
        let didTranslate = false
        let usedTranscriptionModel = null
        let usedTranslationModel = null
        let baseTranscriptFilePath = null
        let baseTranscriptFileName = null

        const normalizedSources = normalizeSubtitleSources(meta.subtitleSources, meta.courseLanguage)

        // 1. Check if target language subtitle track already exists
        const existingTargetEntry = resolveSubtitleSourceEntry(targetLang, normalizedSources, meta.courseLanguage)
        let targetChunks = loadCaptionChunks(
            meta.id,
            targetLang,
            normalizedSources,
            meta.courseFolder,
            meta.relModulePath,
            meta.videoBaseName,
            meta.courseLanguage
        )

        if (targetChunks && targetChunks.length > 0 && existingTargetEntry) {
            baseTranscriptFilePath = existingTargetEntry.filePath || null
            baseTranscriptFileName = existingTargetEntry.fileName || (baseTranscriptFilePath ? path.basename(baseTranscriptFilePath) : null)
            const existingSubMeta = loadSubtitleTrackMeta(baseTranscriptFilePath)
            if (existingSubMeta?.transcriptionModel) usedTranscriptionModel = existingSubMeta.transcriptionModel
            if (existingSubMeta?.translationModel) usedTranslationModel = existingSubMeta.translationModel
        }

        // 2. If no target language subtitles exist, auto-prepare from source (transcribe if needed -> translate)
        if (!targetChunks || targetChunks.length === 0) {
            const aiSourceTrack = normalizedSources.find(s => s.is_ai_source)
            const lookupKey = sourceTrackId || (aiSourceTrack ? aiSourceTrack.id : (sourceLanguage || meta.courseLanguage || 'source'))
            const resolvedSourceEntry = resolveSubtitleSourceEntry(lookupKey, normalizedSources, meta.courseLanguage)
            const effectiveSourceLang = (
                resolvedSourceEntry?.lang ||
                (sourceLanguage && sourceLanguage !== 'source' ? sourceLanguage : meta.courseLanguage) ||
                'en'
            ).toLowerCase().split(':')[0].trim()

            let sourceChunks = loadCaptionChunks(
                meta.id,
                resolvedSourceEntry ? resolvedSourceEntry.id : lookupKey,
                normalizedSources,
                meta.courseFolder,
                meta.relModulePath,
                meta.videoBaseName,
                meta.courseLanguage
            )

            if (sourceChunks && sourceChunks.length > 0 && resolvedSourceEntry) {
                baseTranscriptFilePath = resolvedSourceEntry.filePath || null
                baseTranscriptFileName = resolvedSourceEntry.fileName || (baseTranscriptFilePath ? path.basename(baseTranscriptFilePath) : null)
                const srcMeta = loadSubtitleTrackMeta(baseTranscriptFilePath)
                if (srcMeta?.transcriptionModel) usedTranscriptionModel = srcMeta.transcriptionModel
            }

            // 2a. If no source subtitles exist at all, transcribe local video first
            if ((!sourceChunks || sourceChunks.length === 0) && meta.videoFilePath && fs.existsSync(meta.videoFilePath)) {
                sendEvent({
                    step: 'transcribing',
                    percent: 8,
                    message: `Transcribing ${LANG_DISPLAY_MAP[effectiveSourceLang] || effectiveSourceLang} audio…`
                })
                const transcribeT0 = Date.now()
                const pyTranscript = await transcribeWithPythonService({
                    videoPath: meta.videoFilePath,
                    language: effectiveSourceLang,
                    modelName: 'large-v3-turbo'
                })
                if (abortController.signal.aborted) return res.end()

                if (pyTranscript && Array.isArray(pyTranscript.chunks) && pyTranscript.chunks.length > 0) {
                    sourceChunks = normalizeCuesIntoClauses(pyTranscript.chunks, effectiveSourceLang)
                    if (sourceChunks.length > 0) {
                        didTranscribe = true
                        usedTranscriptionModel = `Faster-Whisper · ${pyTranscript.model || 'large-v3-turbo'}`
                        const savedSourcePath = saveCaptionFile(meta, effectiveSourceLang, sourceChunks, 'generated', 1)
                        const srcFileName = path.basename(savedSourcePath || `${meta.videoBaseName}-generated.${effectiveSourceLang}.vtt`)
                        const srcSubMeta = {
                            pipeline: 'Transcribe',
                            generationSeconds: typeof pyTranscript.elapsed_seconds === 'number'
                                ? Math.round(pyTranscript.elapsed_seconds * 10) / 10
                                : Math.round(((Date.now() - transcribeT0) / 1000) * 10) / 10,
                            transcriptionModel: usedTranscriptionModel,
                            generatedAt: new Date().toISOString()
                        }
                        saveSubtitleTrackMeta(savedSourcePath, srcSubMeta)
                        baseTranscriptFilePath = savedSourcePath
                        baseTranscriptFileName = srcFileName
                        const srcTrackId = buildTrackId(effectiveSourceLang, 'generated', 1)
                        const otherSrcs = normalizedSources.filter(s => s.id !== srcTrackId)
                        otherSrcs.push({
                            id: srcTrackId,
                            lang: effectiveSourceLang,
                            origin: 'generated',
                            version: 1,
                            label: 'AI',
                            fileName: srcFileName,
                            filePath: savedSourcePath,
                            format: 'vtt',
                            is_master: !otherSrcs.some(s => s.lang === effectiveSourceLang && s.is_master),
                            is_ai_source: !otherSrcs.some(s => s.is_ai_source),
                            meta: srcSubMeta
                        })
                        const nextNormalized = normalizeSubtitleSources(otherSrcs, meta.courseLanguage)
                        run('UPDATE videos SET has_transcript = 1, subtitle_sources = ? WHERE id = ?', [
                            JSON.stringify(nextNormalized),
                            meta.id
                        ])
                        meta.subtitleSources = nextNormalized
                    }
                }
            }

            if (!sourceChunks || sourceChunks.length === 0) {
                sendEvent({
                    error: 'No subtitles found for this lesson. Generate or import subtitles first.'
                })
                return res.end()
            }

            if (effectiveSourceLang === targetLang) {
                targetChunks = sourceChunks
            } else {
                // 2b. Translate source subtitles to targetLanguage with durationSec isochrony
                let apiKey = bodyApiKey || null
                let modelName = bodyModel || null
                if (!apiKey) {
                    try {
                        const row = getOne('SELECT value FROM settings WHERE key = ?', ['openRouterApiKey'])
                        if (row?.value) apiKey = row.value
                    } catch { }
                }
                if (!modelName) {
                    try {
                        const row = getOne('SELECT value FROM settings WHERE key = ?', ['openRouterModel'])
                        if (row?.value) modelName = row.value
                    } catch { }
                }

                sendEvent({
                    step: 'translating',
                    percent: 12,
                    message: `Translating subtitles to ${LANG_DISPLAY_MAP[targetLang] || targetLang}…`
                })

                const translateT0 = Date.now()
                const translated = await translateChunks(
                    sourceChunks,
                    targetLang,
                    (prog) => {
                        const scaledPct = Math.round(12 + ((prog.percent || 10) / 100) * 23)
                        sendEvent({
                            step: 'translating',
                            percent: scaledPct,
                            message: prog.message || `Translating to ${LANG_DISPLAY_MAP[targetLang] || targetLang}…`
                        })
                    },
                    abortController.signal,
                    apiKey,
                    modelName,
                    effectiveSourceLang,
                    meta.courseTitle
                )

                if (abortController.signal.aborted) return res.end()
                if (!translated || translated.length === 0) {
                    throw new Error(`Could not translate subtitles to ${LANG_DISPLAY_MAP[targetLang] || targetLang}.`)
                }

                didTranslate = true
                const usedOpenRouter = Boolean(apiKey && String(apiKey).trim())
                usedTranslationModel = usedOpenRouter
                    ? `OpenRouter · ${modelName || 'openai/gpt-4o-mini'}`
                    : 'NLLB-200 (Local)'

                // Save translated subtitles to vault so both Subtitles & Dub stay in sync
                const currentSources = normalizeSubtitleSources(meta.subtitleSources, meta.courseLanguage)
                const savedTgtPath = saveCaptionFile(meta, targetLang, translated, 'generated', 1)
                const tgtFileName = path.basename(savedTgtPath || `${meta.videoBaseName}-generated.${targetLang}.vtt`)
                const tgtSubMeta = {
                    pipeline: 'Translate',
                    generationSeconds: Math.round(((Date.now() - translateT0) / 1000) * 10) / 10,
                    ...(usedTranscriptionModel ? { transcriptionModel: usedTranscriptionModel } : {}),
                    translationModel: usedTranslationModel,
                    ...(baseTranscriptFileName ? { sourceTrackFile: baseTranscriptFileName } : {}),
                    sourceLanguage: effectiveSourceLang,
                    generatedAt: new Date().toISOString()
                }
                saveSubtitleTrackMeta(savedTgtPath, tgtSubMeta)
                baseTranscriptFilePath = savedTgtPath
                baseTranscriptFileName = tgtFileName
                const tgtTrackId = buildTrackId(targetLang, 'generated', 1)
                const otherTgtSrcs = currentSources.filter(s => s.id !== tgtTrackId)
                otherTgtSrcs.push({
                    id: tgtTrackId,
                    lang: targetLang,
                    origin: 'generated',
                    version: 1,
                    label: 'AI',
                    fileName: tgtFileName,
                    filePath: savedTgtPath,
                    format: 'vtt',
                    is_master: !otherTgtSrcs.some(s => s.lang === targetLang && s.is_master),
                    is_ai_source: false,
                    meta: tgtSubMeta
                })
                const updatedSources = normalizeSubtitleSources(otherTgtSrcs, meta.courseLanguage)
                run('UPDATE videos SET has_transcript = 1, subtitle_sources = ? WHERE id = ?', [
                    JSON.stringify(updatedSources),
                    meta.id
                ])
                targetChunks = translated
            }
        }

        // 3. Sanitize & normalize clauses for speech synthesis
        const speechSegments = sanitizeCuesForSpeechAndTranslation(targetChunks, targetLang)
        if (!speechSegments || speechSegments.length === 0) {
            throw new Error('No speakable dialogue found in subtitle track.')
        }

        const voiceProfileDir = getCourseVoiceProfileDir(meta.courseFolder, meta.courseId)

        sendEvent({
            step: 'starting-dub',
            percent: 36,
            message: engine === 'clone'
                ? 'Preparing instructor voice cloning…'
                : `Starting ${LANG_DISPLAY_MAP[targetLang] || targetLang} neural voice synthesis…`
        })

        // 4. Submit dubbing job to Python service
        const jobId = await submitDubJob({
            videoPath: meta.videoFilePath,
            segments: speechSegments,
            targetLang,
            engine,
            voiceGender,
            bgMode,
            voiceProfileDir,
            device: rawDevice,
            unloadIdleModel
        })
        activePythonJobId = jobId

        const now = new Date().toISOString()
        run(
            `INSERT INTO dub_jobs (id, video_id, language, status, step, progress, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [jobId, meta.id, targetLang, 'running', 'Synthesizing voice…', 38, now]
        )

        // 5. Poll Python job status and stream progress to client
        while (!abortController.signal.aborted) {
            await new Promise(r => setTimeout(r, 450))
            if (abortController.signal.aborted) break

            const live = await pollJobStatus(jobId)
            const scaledPercent = Math.min(98, Math.max(38, Math.round(36 + ((live.progress || 0) / 100) * 62)))

            run(
                `UPDATE dub_jobs SET status = ?, step = ?, progress = ?, error_message = ? WHERE id = ?`,
                [live.status, live.step || '', scaledPercent, live.error || null, jobId]
            )

            if (live.status === 'failed') {
                throw new Error(live.error || 'Voice dubbing failed')
            }
            if (live.status === 'cancelled') {
                throw new Error('Dubbing cancelled by user')
            }

            if (live.status === 'done' && live.audio_path && fs.existsSync(live.audio_path)) {
                const isLocalCourse = Boolean(meta.courseFolder && fs.existsSync(meta.courseFolder))
                const finalPath = isLocalCourse
                    ? getDubFilePath(meta.courseFolder, meta.relModulePath, meta.videoBaseName, targetLang)
                    : getDubCacheWritePath(meta.id, targetLang)

                atomicCopyAudioFile(live.audio_path, finalPath)

                // Clean up stale AppData duplicate if local course
                if (isLocalCourse) {
                    try {
                        const staleCache = getDubCacheWritePath(meta.id, targetLang)
                        if (fs.existsSync(staleCache)) fs.unlinkSync(staleCache)
                    } catch { }
                }

                const completedAt = new Date().toISOString()
                const resolvedBgMode = live.bg_mode === 'demucs' ? 'demucs' : 'none'
                const pipelineParts = []
                if (didTranscribe) pipelineParts.push('Transcribe')
                if (didTranslate) pipelineParts.push('Translate')
                pipelineParts.push('Dub')
                const totalGenerationSec = Math.round(((Date.now() - dubStartMs) / 1000) * 10) / 10

                const trackMeta = {
                    language: targetLang,
                    filePath: finalPath,
                    status: 'ready',
                    engine: live.engine || engine,
                    bgMode: resolvedBgMode,
                    voiceGender: live.voice_gender || voiceGender,
                    ttsModel: live.tts_model || (engine === 'clone' ? 'Coqui XTTS-v2' : 'Edge-TTS'),
                    backgroundModel: resolvedBgMode === 'demucs' ? 'HTDemucs' : null,
                    pipeline: pipelineParts.join(' → '),
                    generationSeconds: totalGenerationSec > 0 ? totalGenerationSec : (live.timings?.total_seconds ?? null),
                    sourceTranscriptFile: baseTranscriptFileName,
                    transcriptionModel: usedTranscriptionModel,
                    translationModel: usedTranslationModel,
                    generatedAt: completedAt
                }

                saveDubTrackMeta(meta, targetLang, trackMeta)

                run(
                    `UPDATE dub_jobs SET status = 'done', step = 'Complete', progress = 100, audio_path = ?, completed_at = ? WHERE id = ?`,
                    [finalPath, completedAt, jobId]
                )

                // Clean up Python job temp folder now that MP3 is safely in vault
                cancelJob(jobId).catch(() => {})
                activePythonJobId = null

                const reconciled = reconcileVideoDubbedTracks(meta)
                const savedTrack = reconciled.find(t => t.language === targetLang) || trackMeta

                sendEvent({
                    step: 'done',
                    percent: 100,
                    done: true,
                    language: targetLang,
                    track: savedTrack,
                    message: `${LANG_DISPLAY_MAP[targetLang] || targetLang} dub ready`
                })
                return res.end()
            }

            sendEvent({
                step: live.bg_mode === 'demucs' && (live.progress || 0) < 20 ? 'separating' : 'synthesizing',
                percent: scaledPercent,
                message: live.step || 'Synthesizing dubbed audio…'
            })
        }

        res.end()
    } catch (err) {
        if (activePythonJobId) {
            cancelJob(activePythonJobId).catch(() => {})
        }
        sendEvent({ error: err.message || 'Voice dubbing failed' })
        res.end()
    }
})

// GET /api/dub/audio/:videoId?lang=ar - Stream dubbed MP3 audio with HTTP Range support
router.get('/audio/:videoId', (req, res) => {
    try {
        const lang = normalizeLangParam(req.query.lang)
        if (!lang) {
            return res.status(400).json({ error: 'Invalid language parameter' })
        }

        const meta = getVideoDubMeta(req.params.videoId)
        if (!meta) {
            return res.status(404).json({ error: 'Video not found' })
        }

        const audioPath = resolveDubAudioPath(meta, lang)
        if (!audioPath || !fs.existsSync(audioPath)) {
            return res.status(404).json({ error: 'Dubbed audio not found' })
        }

        const stat = fs.statSync(audioPath)
        const fileSize = stat.size
        const range = req.headers.range

        if (range) {
            const parts = range.replace(/bytes=/, '').split('-')
            const start = Number.parseInt(parts[0], 10)
            const end = parts[1] ? Number.parseInt(parts[1], 10) : fileSize - 1

            if (Number.isNaN(start) || Number.isNaN(end) || start > end || start < 0 || end >= fileSize) {
                res.status(416).set({ 'Content-Range': `bytes */${fileSize}` }).end()
                return
            }

            const chunkSize = end - start + 1
            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunkSize,
                'Content-Type': 'audio/mpeg',
                'Cache-Control': 'no-cache'
            })
            const stream = fs.createReadStream(audioPath, { start, end })
            res.on('close', () => stream.destroy())
            stream.pipe(res)
            return
        }

        res.writeHead(200, {
            'Content-Length': fileSize,
            'Content-Type': 'audio/mpeg',
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-cache'
        })
        const stream = fs.createReadStream(audioPath)
        res.on('close', () => stream.destroy())
        stream.pipe(res)
    } catch (err) {
        console.error('Failed to stream dubbed audio:', err)
        res.status(500).json({ error: err.message })
    }
})

// DELETE /api/dub/video/:videoId?lang=ar - Delete a dubbed audio track and its metadata sidecar
router.delete('/video/:videoId', (req, res) => {
    try {
        const lang = normalizeLangParam(req.query.lang)
        if (!lang) {
            return res.status(400).json({ error: 'Invalid language parameter' })
        }

        const meta = getVideoDubMeta(req.params.videoId)
        if (!meta) {
            return res.status(404).json({ error: 'Video not found' })
        }

        const candidatePaths = new Set()
        const vaultPath = getDubFilePathForPlayback(
            meta.id,
            lang,
            meta.courseFolder,
            meta.relModulePath,
            meta.videoBaseName
        )
        if (vaultPath) candidatePaths.add(vaultPath)

        const cachePath = getDubCachePath(meta.id, lang)
        if (cachePath) candidatePaths.add(cachePath)

        const dbJobs = getAll(
            'SELECT id, audio_path, status FROM dub_jobs WHERE video_id = ? AND LOWER(language) = ?',
            [meta.id, lang]
        )
        for (const j of dbJobs) {
            if (j?.status === 'queued' || j?.status === 'running') {
                cancelJob(j.id).catch(() => {})
            }
            if (j?.audio_path) candidatePaths.add(j.audio_path)
        }

        for (const t of meta.dubbedTracks) {
            if (t?.language && String(t.language).trim().toLowerCase() === lang && t.filePath) {
                candidatePaths.add(t.filePath)
            }
        }

        for (const p of candidatePaths) {
            try {
                if (p && fs.existsSync(p)) fs.unlinkSync(p)
            } catch { }
        }

        deleteDubTrackMeta(meta, lang)

        try {
            run('DELETE FROM dub_jobs WHERE video_id = ? AND LOWER(language) = ?', [meta.id, lang])
        } catch { }

        const remainingTracks = reconcileVideoDubbedTracks(meta).filter(
            (t) => String(t?.language || '').trim().toLowerCase() !== lang
        )
        run('UPDATE videos SET dubbed_tracks = ? WHERE id = ?', [
            JSON.stringify(remainingTracks),
            meta.id
        ])

        res.json({ success: true, language: lang, tracks: remainingTracks })
    } catch (err) {
        console.error('Failed to delete dub track:', err)
        res.status(500).json({ error: err.message })
    }
})

// GET /api/dub/gpu-info - Return Python AI service hardware status & local AI models disk usage
router.get('/gpu-info', async (_req, res) => {
    try {
        const modelsStats = getModelsDiskStats()
        const health = await getServiceHealth()
        if (!health) {
            return res.json({
                service_running: false,
                gpu_available: false,
                gpu_name: null,
                current_device: 'auto',
                models: modelsStats
            })
        }
        res.json({
            service_running: true,
            ...health,
            models: modelsStats
        })
    } catch (err) {
        res.json({
            service_running: false,
            gpu_available: false,
            models: getModelsDiskStats(),
            error: err.message
        })
    }
})

// POST /api/dub/set-device - Configure dubbing compute device & idle VRAM reaper
router.post('/set-device', async (req, res) => {
    try {
        const { device, unloadIdleModel } = req.body || {}
        if (!device) return res.status(400).json({ error: 'device is required' })
        const data = await setServiceDevice(device, unloadIdleModel)
        res.json(data)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// POST /api/dub/unload-models - Manually free GPU VRAM
router.post('/unload-models', async (_req, res) => {
    try {
        const data = await unloadServiceModels()
        res.json(data)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

export default router
