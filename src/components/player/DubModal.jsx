import { useState, useRef, useEffect } from 'react'
import { X, Headphones, Loader2, AlertCircle, CheckCircle2, Play, Globe, Sparkles, Volume2 } from 'lucide-react'
import { useSettings } from '../../contexts/SettingsContext'
import { SERVER_URL } from '../../utils/api'
import { transcribeVideoCaptions, isAIAvailable, formatFriendlyDuration } from '../../utils/aiSummarization'
import { verifyPermission } from '../../utils/fileSystem'
import { SUPPORTED_LANGUAGES, getLanguageInfo } from '../../utils/languages'

export default function DubModal({ isOpen, onClose, video, course, sourceLanguage: propSourceLang, onSuccess }) {
    const { settings } = useSettings()

    // Decouple transcript source language from video spoken audio language
    const parsedSources = typeof video?.subtitle_sources === 'string'
        ? JSON.parse(video.subtitle_sources || '[]')
        : (video?.subtitle_sources || [])
    const aiSource = parsedSources.find(s => s.is_ai_source)
    const effectiveTranscriptLang = (aiSource?.lang && aiSource.lang !== 'source')
        ? aiSource.lang
        : (propSourceLang || course?.language || 'en').toLowerCase().trim()
    const spokenAudioLang = (course?.language || 'en').toLowerCase().trim()
    const sourceLang = effectiveTranscriptLang
    const sourceInfo = getLanguageInfo(sourceLang)

    // Filter available target languages (exclude transcript language, NOT spoken audio)
    const availableTargets = SUPPORTED_LANGUAGES.filter(l => l.code !== effectiveTranscriptLang)
    const defaultTarget = effectiveTranscriptLang === 'ar' ? (spokenAudioLang !== 'es' ? 'es' : 'en') : 'ar'

    const [targetLang, setTargetLang] = useState(defaultTarget)
    const [isDubbing, setIsDubbing] = useState(false)
    const [status, setStatus] = useState(null)
    const [error, setError] = useState(null)
    const [isDone, setIsDone] = useState(false)
    const [serviceRunning, setServiceRunning] = useState(null) // null = checking
    const [isStartingService, setIsStartingService] = useState(false)
    const [existingLangs, setExistingLangs] = useState({ sourceExists: false, translatedLangs: [], existingLangs: [] })
    const [dubbedLangs, setDubbedLangs] = useState([])
    const [preserveBackgroundAudio, setPreserveBackgroundAudio] = useState(false)

    const pollRef = useRef(null)
    const activeAbortController = useRef(null)

    // Load available caption languages and dub tracks when opened
    useEffect(() => {
        if (!isOpen || !video?.id) return
        setServiceRunning(null)
        checkService()
        loadLanguageInfo()
    }, [isOpen, video?.id])

    useEffect(() => {
        if (targetLang === sourceLang) {
            setTargetLang(sourceLang === 'ar' ? 'es' : 'ar')
        }
    }, [sourceLang])

    async function checkService() {
        try {
            const res = await fetch(`${SERVER_URL}/api/dub/service/status`)
            const data = await res.json()
            setServiceRunning(data.running)
        } catch {
            setServiceRunning(false)
        }
    }

    async function loadLanguageInfo() {
        if (!video?.id) return
        try {
            const [transRes, dubRes] = await Promise.all([
                fetch(`${SERVER_URL}/api/transcripts/${video.id}/languages`).catch(() => null),
                fetch(`${SERVER_URL}/api/dub/video/${video.id}/languages`).catch(() => null)
            ])
            if (transRes?.ok) {
                const transData = await transRes.json()
                setExistingLangs(transData || { sourceExists: false, translatedLangs: [], existingLangs: [] })
            }
            if (dubRes?.ok) {
                const dubData = await dubRes.json()
                if (Array.isArray(dubData)) setDubbedLangs(dubData)
            }
        } catch (e) {
            console.error('Failed to load language info:', e)
        }
    }

    useEffect(() => {
        if (!isOpen) {
            setIsDubbing(false)
            setStatus(null)
            setError(null)
            setIsDone(false)
            setIsStartingService(false)
            if (pollRef.current) clearInterval(pollRef.current)
            if (activeAbortController.current) {
                activeAbortController.current.abort()
                activeAbortController.current = null
            }
        }
    }, [isOpen])

    async function handleStartService() {
        setIsStartingService(true)
        setError(null)

        try {
            const res = await fetch(`${SERVER_URL}/api/dub/service/start`, { method: 'POST' })
            const data = await res.json()

            if (data.error) {
                setError(data.error)
                setIsStartingService(false)
                return
            }

            // Poll until service is ready (up to 60s for model download)
            for (let i = 0; i < 30; i++) {
                await new Promise(r => setTimeout(r, 2000))
                const check = await fetch(`${SERVER_URL}/api/dub/service/status`)
                const checkData = await check.json()
                if (checkData.running) {
                    setServiceRunning(true)
                    setIsStartingService(false)
                    return
                }
            }

            setError('Service did not start within 60 seconds. Check console for details.')
        } catch (err) {
            setError(`Failed to start service: ${err.message}`)
        }
        setIsStartingService(false)
    }

    // Step 1: Ensure captions for target language exist (auto-transcribe in sourceLang & auto-translate if needed)
    async function ensureTargetCaptions() {
        // Re-check existing languages
        const langRes = await fetch(`${SERVER_URL}/api/transcripts/${video.id}/languages`)
        let currentLangs = { sourceExists: false, translatedLangs: [], existingLangs: [] }
        if (langRes.ok) {
            currentLangs = await langRes.json()
            setExistingLangs(currentLangs)
        }

        const hasTarget = (targetLang === 'source' && (currentLangs.sourceExists || currentLangs.existingLangs.length > 0)) ||
            currentLangs.translatedLangs.includes(targetLang) ||
            currentLangs.existingLangs.includes(targetLang) ||
            (targetLang === sourceLang && (currentLangs.sourceExists || currentLangs.existingLangs.includes(sourceLang)))

        if (hasTarget) {
            return true
        }

        // Need source captions first
        const hasSource = currentLangs.sourceExists || currentLangs.existingLangs.length > 0
        if (!hasSource) {
            setStatus({ step: `Transcribing audio with Whisper (${sourceInfo.nativeName})...`, progress: 10 })

            await transcribeVideoCaptions(
                video,
                (p) => {
                    const pct = Math.round(10 + (p.progress || 0) * 30)
                    setStatus({ step: `Transcribing audio: ${p.message || ''}`, progress: pct })
                },
                settings.aiDevice,
                sourceLang
            )

            window.dispatchEvent(new CustomEvent('tutin:transcript-updated', {
                detail: { videoId: video.id, lang: 'source' }
            }))
        }

        // Now translate to target language if not source language
        if (targetLang !== 'source' && targetLang !== sourceLang) {
            setStatus({ step: `Translating subtitles to ${langName}...`, progress: 45 })

            activeAbortController.current = new AbortController()
            const transResponse = await fetch(`${SERVER_URL}/api/transcripts/${video.id}/translate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetLanguage: targetLang, sourceLanguage: sourceLang }),
                signal: activeAbortController.current.signal
            })

            if (!transResponse.ok) {
                throw new Error(`Translation failed with status: ${transResponse.status}`)
            }

            const reader = transResponse.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ''

            while (true) {
                const { value, done } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n\n')
                buffer = lines.pop() || ''

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.replace('data: ', ''))
                            if (data.error) throw new Error(data.error)
                            if (data.percent) {
                                const transPct = Math.round(45 + (data.percent / 100) * 15)
                                setStatus({ step: `Translating subtitles (${data.percent}%)...`, progress: transPct })
                            }
                        } catch (e) {
                            if (e.message !== 'Unexpected end of JSON input') throw e
                        }
                    }
                }
            }

            window.dispatchEvent(new CustomEvent('tutin:transcript-updated', {
                detail: { videoId: video.id, lang: targetLang }
            }))
        }

        return true
    }

    async function handleStartDub() {
        setIsDubbing(true)
        setError(null)
        setStatus({ step: 'Checking prerequisites...', progress: 5 })

        try {
            // 1. Ensure target captions exist
            await ensureTargetCaptions()

            // 2. Ensure python service is running
            setStatus({ step: 'Connecting to AI dubbing engine...', progress: 60 })
            const serviceOk = await ensureServiceIsRunning()
            if (!serviceOk) {
                throw new Error('Could not connect to Python dubbing service. Please ensure requirements are installed.')
            }

            // 3. Submit dubbing job
            setStatus({ step: 'Extracting voice reference & synthesizing speech...', progress: 65 })
            const res = await fetch(`${SERVER_URL}/api/dub/video/${video.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    targetLanguage: targetLang,
                    sourceLanguage: sourceLang,
                    preserveBackgroundAudio: Boolean(preserveBackgroundAudio)
                })
            })

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}))
                throw new Error(errData.error || `Server error: ${res.status}`)
            }

            const { jobId } = await res.json()

            // 4. Poll for status every 2 seconds
            pollRef.current = setInterval(async () => {
                try {
                    const statusRes = await fetch(`${SERVER_URL}/api/dub/video/${video.id}/status`)
                    const data = await statusRes.json()

                    if (data.status === 'running' || data.status === 'queued') {
                        const basePct = 65
                        const jobProgress = data.progress || 0
                        const scaledPct = Math.round(basePct + (jobProgress / 100) * 33)
                        setStatus({
                            step: data.step || 'Synthesizing voice & aligning timeline...',
                            progress: scaledPct
                        })
                    } else if (data.status === 'done') {
                        clearInterval(pollRef.current)
                        setStatus({ step: 'Dubbing completed successfully!', progress: 100 })
                        setIsDone(true)
                        setDubbedLangs(prev => Array.from(new Set([...prev, targetLang])))

                        if (data.timings) {
                            console.group('%c[TutIn AI Dubbing Performance Debugger]', 'color: #3b82f6; font-weight: bold; font-size: 13px;')
                            console.log(`Video ID: ${video.id} | Target Lang: ${targetLang} | Total Pipeline: ${formatFriendlyDuration(data.timings.total_seconds)}`)
                            console.table([
                                { Process: 'Demucs Vocal Separation', Time: formatFriendlyDuration(data.timings.demucs_separation_seconds) },
                                { Process: 'XTTS Model Load / Warmup', Time: formatFriendlyDuration(data.timings.model_load_seconds) },
                                { Process: 'Voice Reference Extraction', Time: formatFriendlyDuration(data.timings.voice_reference_seconds) },
                                { Process: `Neural Speech Synthesis (${data.timings.segments_synthesized} cues)`, Time: formatFriendlyDuration(data.timings.tts_synthesis_seconds) },
                                { Process: 'Normalization & Audio Mixdown', Time: formatFriendlyDuration(data.timings.mix_export_seconds) },
                                { Process: 'Total End-to-End Pipeline', Time: formatFriendlyDuration(data.timings.total_seconds) }
                            ])
                            console.log(`Average Latency per Segment: ${data.timings.avg_ms_per_segment}ms`)
                            console.groupEnd()
                        }

                        window.dispatchEvent(new CustomEvent('tutin:dub-updated', {
                            detail: { videoId: video.id, lang: targetLang }
                        }))

                        setTimeout(() => {
                            onSuccess?.(targetLang)
                            onClose()
                        }, 1800)
                    } else if (data.status === 'failed') {
                        clearInterval(pollRef.current)
                        setError(data.error_message || data.error || 'Dubbing generation failed')
                        setIsDubbing(false)
                    }
                } catch (err) {
                    console.error('Polling error:', err)
                }
            }, 2000)

        } catch (err) {
            console.error('Dub submission failed:', err)
            setError(err.message)
            setIsDubbing(false)
        }
    }

    async function handleCancelDub() {
        if (pollRef.current) clearInterval(pollRef.current)
        if (activeAbortController.current) {
            activeAbortController.current.abort()
            activeAbortController.current = null
        }
        
        setIsDubbing(false)
        setStatus(null)
        
        try {
            await fetch(`${SERVER_URL}/api/dub/video/${video.id}/cancel`, { method: 'POST' })
            console.log('[Dub] Cancellation request sent to server.')
        } catch (e) {
            console.warn('[Dub] Cancel request error:', e)
        }
        
        setError('Dubbing process was cancelled by user.')
    }

    async function ensureServiceIsRunning() {
        try {
            const check = await fetch(`${SERVER_URL}/api/dub/service/status`)
            const data = await check.json()
            if (data.running) {
                setServiceRunning(true)
                return true
            }

            const startRes = await fetch(`${SERVER_URL}/api/dub/service/start`, { method: 'POST' })
            const startData = await startRes.json()
            if (startData.running) {
                setServiceRunning(true)
                return true
            }

            for (let i = 0; i < 20; i++) {
                await new Promise(r => setTimeout(r, 1500))
                const recheck = await fetch(`${SERVER_URL}/api/dub/service/status`)
                const recheckData = await recheck.json()
                if (recheckData.running) {
                    setServiceRunning(true)
                    return true
                }
            }
            return false
        } catch {
            return false
        }
    }

    if (!isOpen) return null

    const langName = SUPPORTED_LANGUAGES.find(l => l.code === targetLang)?.name || targetLang
    const isTargetAlreadyDubbed = dubbedLangs.includes(targetLang)
    const hasTargetCaptions = (targetLang === 'source' && (existingLangs.sourceExists || existingLangs.existingLangs.length > 0)) ||
        existingLangs.translatedLangs.includes(targetLang) ||
        existingLangs.existingLangs.includes(targetLang) ||
        (targetLang === sourceLang && (existingLangs.sourceExists || existingLangs.existingLangs.includes(sourceLang)))

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white dark:bg-dark-surface w-full max-w-lg rounded-xl shadow-2xl overflow-hidden border border-light-border dark:border-dark-border flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <Headphones className="w-5 h-5 text-primary-fg" />
                        AI Voice Dubbing
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors"
                        disabled={isDubbing && !isDone && !error}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-5 overflow-y-auto flex-1">
                    {/* Persistent AI Disclaimer Banner */}
                    <div className="bg-amber-500/10 border border-amber-500/25 p-3.5 rounded-lg text-xs text-amber-800 dark:text-amber-300 space-y-1">
                        <div className="flex items-center gap-1.5 font-semibold">
                            <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                            Voice Cloning Notice
                        </div>
                        <p className="leading-relaxed opacity-90">
                            AI-dubbed audio approximates the original speaker&apos;s voice using cloned TTS. Emotional tone, pacing, and background music from the original are not preserved in this version.
                        </p>
                    </div>

                    {/* Service Status Check */}
                    {serviceRunning === null && (
                        <div className="flex items-center gap-2 text-sm opacity-70">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Checking dubbing service...
                        </div>
                    )}

                    {serviceRunning === false && !isStartingService && (
                        <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-lg space-y-3">
                            <div className="flex items-start gap-2 text-amber-600 dark:text-amber-400">
                                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-semibold text-sm">Dubbing service not running</p>
                                    <p className="text-xs mt-1 opacity-80">
                                        AI dubbing uses Coqui XTTS v2 with zero-shot voice cloning. Click below to start the local Python engine:
                                    </p>
                                </div>
                            </div>

                            <div className="bg-black/10 dark:bg-white/5 rounded-md p-2 font-mono text-xs">
                                <p className="opacity-60 mb-1"># Setup requirements (one-time):</p>
                                <p>pip install -r python/requirements.txt</p>
                                <p className="opacity-60 mt-2 mb-1"># Manual run (optional):</p>
                                <p>python python/dubbing_server.py</p>
                            </div>

                            <button
                                onClick={handleStartService}
                                className="w-full py-2 rounded-lg text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 transition-colors flex items-center justify-center gap-2"
                            >
                                <Play className="w-4 h-4" />
                                Auto-Start Dubbing Service
                            </button>

                            <p className="text-[11px] opacity-50 text-center">
                                Requires: Python 3.9+ &bull; CUDA GPU recommended &bull; ffmpeg in PATH
                            </p>
                        </div>
                    )}

                    {isStartingService && (
                        <div className="flex items-center gap-3 text-sm p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-600 dark:text-blue-400">
                            <Loader2 className="w-5 h-5 animate-spin shrink-0" />
                            <div>
                                <p className="font-medium">Starting Python dubbing service...</p>
                                <p className="text-xs mt-0.5 opacity-70">Loading XTTS v2 model into memory...</p>
                            </div>
                        </div>
                    )}

                    {serviceRunning === true && (
                        <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 bg-green-500/10 p-2.5 rounded-lg">
                            <CheckCircle2 className="w-4 h-4" />
                            <span className="font-medium">Dubbing engine active & ready</span>
                        </div>
                    )}

                    {/* Language Selector */}
                    <div className="space-y-2">
                        {effectiveTranscriptLang !== spokenAudioLang && (
                            <div className="flex items-center justify-between text-xs px-3 py-2 bg-blue-500/10 text-blue-700 dark:text-blue-300 rounded-lg border border-blue-500/20">
                                <span>AI Source Subtitles: <strong>{sourceInfo.name}</strong></span>
                                <span>Original Audio: <strong>{getLanguageInfo(spokenAudioLang).name}</strong></span>
                            </div>
                        )}
                        <label className="text-sm font-medium text-light-text-secondary dark:text-dark-text-secondary block">
                            Target Language
                        </label>
                        <select
                            value={targetLang}
                            onChange={(e) => setTargetLang(e.target.value)}
                            disabled={isDubbing || isDone}
                            className="w-full px-3 py-2 bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-lg focus:outline-none focus:border-primary-fg transition-colors"
                        >
                            {availableTargets.map(lang => (
                                <option key={lang.code} value={lang.code}>
                                    {lang.nativeName} ({lang.name}) {dubbedLangs.includes(lang.code) ? '✓ (Dub Available)' : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Preserve Background Audio (Demucs) Toggle */}
                    <div className="bg-light-bg dark:bg-dark-bg p-3.5 rounded-lg border border-light-border dark:border-dark-border space-y-2">
                        <div className="flex items-center justify-between">
                            <label htmlFor="preserveBackgroundAudio" className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    id="preserveBackgroundAudio"
                                    checked={preserveBackgroundAudio}
                                    onChange={(e) => setPreserveBackgroundAudio(e.target.checked)}
                                    disabled={isDubbing || isDone}
                                    className="w-4 h-4 rounded text-primary-fg border-light-border dark:border-dark-border focus:ring-primary-fg cursor-pointer"
                                />
                                <span className="text-sm font-medium">Preserve Background Music & Effects</span>
                                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-600 dark:text-purple-400">
                                    Demucs AI
                                </span>
                            </label>
                            <span className="text-[11px] text-light-text-secondary dark:text-dark-text-secondary opacity-75">
                                GPU Recommended
                            </span>
                        </div>
                        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary opacity-75 pl-6">
                            Isolates original background music and SFX with Demucs, ducking them smoothly under the dubbed voice and adding a subtle room-tone ambience.
                        </p>
                    </div>

                    {/* Feature Highlights & Pipeline Status */}
                    <div className="bg-light-bg dark:bg-dark-bg p-4 rounded-lg border border-light-border dark:border-dark-border space-y-2.5 text-sm">
                        <div className="flex justify-between items-center">
                            <span className="opacity-70">Source Audio:</span>
                            <span className="font-semibold text-primary-fg">
                                <span>{sourceInfo.nativeName} ({sourceInfo.name})</span>
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="opacity-70">Engine:</span>
                            <span className="font-medium">Coqui XTTS v2 (Local Clone)</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="opacity-70">Voice Reference:</span>
                            <span className="font-medium text-primary-fg">Auto 8–10s clean sample</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="opacity-70">Target Subtitles:</span>
                            <span className={`text-xs px-2 py-0.5 rounded ${hasTargetCaptions ? 'bg-green-500/20 text-green-600 dark:text-green-400' : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'}`}>
                                {hasTargetCaptions ? 'Ready' : 'Will auto-generate'}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="opacity-70">Cadence & Timing:</span>
                            <span className="font-medium">Rubber Band + Pause Absorption</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="opacity-70">Background Audio:</span>
                            <span className={`text-xs px-2 py-0.5 rounded ${preserveBackgroundAudio ? 'bg-purple-500/20 text-purple-600 dark:text-purple-400' : 'opacity-70'}`}>
                                {preserveBackgroundAudio ? 'Demucs Ducking + Room Tone' : 'Clean Voiceover (Fast)'}
                            </span>
                        </div>
                    </div>

                    {isTargetAlreadyDubbed && !isDubbing && !isDone && (
                        <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                                <Volume2 className="w-4 h-4" />
                                <span>Dubbed track in {langName} is ready!</span>
                            </div>
                            <button
                                onClick={() => {
                                    onSuccess?.(targetLang)
                                    onClose()
                                }}
                                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors"
                            >
                                Play Now
                            </button>
                        </div>
                    )}

                    {/* Progress / Status */}
                    {(isDubbing || isDone || error) && (
                        <div className="space-y-3 pt-2">
                            {error ? (
                                <div className="flex items-start gap-2 text-red-500 bg-red-500/10 p-3.5 rounded-lg text-sm">
                                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                                    <div className="space-y-1">
                                        <p className="font-medium">Dubbing Error</p>
                                        <p className="text-xs opacity-90">{error}</p>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-center justify-between text-sm font-medium">
                                        <span className="flex items-center gap-2">
                                            {isDone ? (
                                                <CheckCircle2 className="w-4 h-4 text-green-500" />
                                            ) : (
                                                <Loader2 className="w-4 h-4 animate-spin text-primary-fg" />
                                            )}
                                            {status?.step || 'Processing dubbing pipeline...'}
                                        </span>
                                        <span>{status?.progress || 0}%</span>
                                    </div>
                                    <div className="h-2 w-full bg-light-border dark:border-dark-border rounded-full overflow-hidden">
                                        <div
                                            className={`h-full transition-all duration-300 ${isDone ? 'bg-green-500' : 'bg-primary-fg'}`}
                                            style={{ width: `${status?.progress || 0}%` }}
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-light-border dark:border-dark-border flex justify-end gap-3 bg-light-surface dark:bg-black/20">
                    {isDubbing && !isDone && !error ? (
                        <button
                            onClick={handleCancelDub}
                            className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 border border-red-500/30 transition-colors flex items-center gap-1.5"
                        >
                            Cancel Dubbing
                        </button>
                    ) : (
                        <button
                            onClick={onClose}
                            className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                        >
                            {isDone ? 'Close' : 'Cancel'}
                        </button>
                    )}
                    {!isDubbing && !isDone && (
                        <button
                            onClick={handleStartDub}
                            className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-content hover:bg-primary-hover transition-colors flex items-center gap-2"
                        >
                            <Headphones className="w-4 h-4" />
                            {isTargetAlreadyDubbed ? 'Regenerate Dub' : 'Start Dubbing'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
