import { useState, useRef, useEffect } from 'react'
import { X, Globe, Loader2, AlertCircle, CheckCircle2, Captions, Sparkles, RefreshCw } from 'lucide-react'
import { useSettings } from '../../contexts/SettingsContext'
import { SERVER_URL } from '../../utils/api'
import { SUPPORTED_LANGUAGES, getLanguageInfo, getLanguageLabel } from '../../utils/languages'
import { transcribeVideoCaptions } from '../../utils/aiSummarization'

export default function TranslateModal({ isOpen, onClose, video, course, sourceLanguage: propSourceLang, onSuccess, chunkCount = 0 }) {
    const { settings, updateSettings } = useSettings()
    const sourceLang = (propSourceLang || course?.language || video?.language || 'en').toLowerCase().trim()
    const sourceInfo = getLanguageInfo(sourceLang)

    // Available target languages
    const availableTargets = SUPPORTED_LANGUAGES.filter(l => l.code !== sourceLang)

    const [targetLang, setTargetLang] = useState(sourceLang)
    const [hasSourceCaptions, setHasSourceCaptions] = useState(false)
    const [isLoadingStatus, setIsLoadingStatus] = useState(false)
    const [isProcessing, setIsProcessing] = useState(false)
    const [progress, setProgress] = useState(0)
    const [statusText, setStatusText] = useState('')
    const [error, setError] = useState(null)
    const [isDone, setIsDone] = useState(false)
    
    const abortControllerRef = useRef(null)

    useEffect(() => {
        if (!isOpen) {
            // Reset state when closed
            setIsProcessing(false)
            setProgress(0)
            setStatusText('')
            setError(null)
            setIsDone(false)
            if (abortControllerRef.current) {
                abortControllerRef.current.abort()
                abortControllerRef.current = null
            }
        } else {
            // Check if source captions exist for this video
            checkSourceCaptions()
            setTargetLang(sourceLang)
        }
    }, [isOpen, video?.id, sourceLang])

    const [hasGeneratedSource, setHasGeneratedSource] = useState(false)
    const [hasGeneratedTarget, setHasGeneratedTarget] = useState(false)

    async function checkSourceCaptions() {
        if (!video?.id) return
        try {
            setIsLoadingStatus(true)
            const res = await fetch(`${SERVER_URL}/api/transcripts/${video.id}/languages`)
            if (res.ok) {
                const data = await res.json()
                const sources = data.subtitleSources || []
                
                // Does it have a generated track for 'source'?
                setHasGeneratedSource(sources.some(s => s.lang === 'source' && s.origin === 'generated'))
                
                // Does it have a generated track for targetLang?
                setHasGeneratedTarget(sources.some(s => s.lang === targetLang && s.origin === 'generated'))
                
                // Keep hasSourceCaptions for knowing if we *can* translate
                setHasSourceCaptions(data.sourceExists || sources.some(s => s.lang === 'source'))
            } else {
                setHasSourceCaptions(false)
                setHasGeneratedSource(false)
                setHasGeneratedTarget(false)
            }
        } catch {
            setHasSourceCaptions(false)
            setHasGeneratedSource(false)
            setHasGeneratedTarget(false)
        } finally {
            setIsLoadingStatus(false)
        }
    }

    const isTargetSource = targetLang === 'source' || targetLang === sourceLang

    async function handleStart() {
        if (!video) return
        setIsProcessing(true)
        setError(null)
        setProgress(0)
        setIsDone(false)
        abortControllerRef.current = new AbortController()

        try {
            if (isTargetSource) {
                // ==========================================
                // Case A: Transcribe Spoken Language (Whisper AI)
                // ==========================================
                setStatusText(`Transcribing audio in ${sourceInfo.name} (${sourceLang.toUpperCase()})...`)
                setProgress(10)

                await transcribeVideoCaptions(
                    video,
                    (p) => {
                        const pct = Math.round(10 + (p.progress || 0) * 85)
                        setProgress(Math.min(pct, 95))
                        setStatusText(p.message || `Transcribing audio (${sourceLang.toUpperCase()})...`)
                    },
                    settings.aiDevice,
                    sourceLang
                )

                updateSettings({ captionLanguage: 'source' })
                window.dispatchEvent(new CustomEvent('tutin:transcript-updated', {
                    detail: { videoId: video.id, lang: 'source' }
                }))

                setProgress(100)
                setStatusText('Captions generated successfully!')
                setIsDone(true)
                setTimeout(() => {
                    onSuccess?.('source')
                    onClose()
                }, 1200)

            } else {
                // ==========================================
                // Case B: Transcribe & Translate to Target Lang
                // ==========================================
                let needInitialTranscribe = !hasSourceCaptions

                if (needInitialTranscribe) {
                    // Step 1: Transcribe source first
                    setStatusText(`Step 1/2: Transcribing spoken audio with Whisper AI (${sourceInfo.name})...`)
                    setProgress(10)

                    await transcribeVideoCaptions(
                        video,
                        (p) => {
                            const pct = Math.round(10 + (p.progress || 0) * 40)
                            setProgress(Math.min(pct, 50))
                            setStatusText(`Step 1/2: ${p.message || 'Transcribing audio...'}`)
                        },
                        settings.aiDevice,
                        sourceLang
                    )

                    setHasSourceCaptions(true)
                    window.dispatchEvent(new CustomEvent('tutin:transcript-updated', {
                        detail: { videoId: video.id, lang: 'source' }
                    }))
                }

                // Step 2: Translate via NLLB-200
                const targetInfo = getLanguageInfo(targetLang)
                setStatusText(needInitialTranscribe 
                    ? `Step 2/2: Translating subtitles to ${targetInfo.name}...` 
                    : `Translating subtitles to ${targetInfo.name}...`
                )
                setProgress(needInitialTranscribe ? 55 : 10)

                const response = await fetch(`${SERVER_URL}/api/transcripts/${video.id}/translate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        targetLanguage: targetLang,
                        sourceLanguage: sourceLang
                    }),
                    signal: abortControllerRef.current.signal
                })

                if (!response.ok) {
                    throw new Error(`Translation server error: ${response.status}`)
                }

                const reader = response.body.getReader()
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
                            const dataStr = line.replace('data: ', '')
                            try {
                                const data = JSON.parse(dataStr)
                                
                                if (data.error) throw new Error(data.error)
                                
                                if (data.step === 'loading' || data.step === 'downloading' || data.step === 'translating') {
                                    const baseProgress = needInitialTranscribe ? 55 : 0
                                    const scale = needInitialTranscribe ? 0.45 : 1.0
                                    const currentPct = Math.round(baseProgress + (data.percent || 0) * scale)
                                    setProgress(Math.min(currentPct, 98))
                                    setStatusText(data.message)
                                } else if (data.step === 'done') {
                                    setProgress(100)
                                    setStatusText(`Subtitles ready in ${targetInfo.nativeName}!`)
                                    setIsDone(true)
                                    updateSettings({ captionLanguage: targetLang })
                                    setTimeout(() => {
                                        window.dispatchEvent(new CustomEvent('tutin:transcript-updated', {
                                            detail: { videoId: video.id, lang: data.lang }
                                        }))
                                        onSuccess?.(data.lang)
                                        onClose()
                                    }, 1200)
                                }
                            } catch (e) {
                                if (e.message !== 'Unexpected end of JSON input') throw e
                            }
                        }
                    }
                }
            }
        } catch (err) {
            if (err.name === 'AbortError') {
                setStatusText('Cancelled.')
                setTimeout(() => onClose(), 800)
            } else {
                console.error('Caption generation / translation failed:', err)
                setError(err.message)
            }
        } finally {
            if (!isDone && !abortControllerRef.current?.signal.aborted) {
                setIsProcessing(false)
            }
        }
    }

    function handleCancel() {
        if (isProcessing && abortControllerRef.current) {
            abortControllerRef.current.abort()
        } else {
            onClose()
        }
    }

    if (!isOpen) return null

    const targetInfo = isTargetSource ? sourceInfo : getLanguageInfo(targetLang)

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-dark-surface w-full max-w-md rounded-xl shadow-2xl overflow-hidden border border-light-border dark:border-dark-border">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <Captions className="w-5 h-5 text-primary-fg" />
                        Subtitles
                    </h2>
                    <button
                        onClick={handleCancel}
                        className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors"
                        disabled={isDone}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    {/* Course Language Indicator Banner */}
                    <div className="flex items-center justify-between p-3.5 bg-primary-fg/5 dark:bg-primary-fg/10 border border-primary-fg/20 rounded-xl">
                        <div className="flex items-center gap-3">
                            <div>
                                <div className="text-[11px] font-medium text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wider">
                                    Language
                                </div>
                                <div className="text-sm font-semibold text-light-text dark:text-dark-text flex items-center gap-1.5">
                                    <span>{sourceInfo.nativeName}</span>
                                    <span className="opacity-70 font-normal">({sourceInfo.name})</span>
                                </div>
                            </div>
                        </div>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary-fg/15 text-primary-fg border border-primary-fg/20">
                            Audio
                        </span>
                    </div>

                    {/* Language Selector */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-light-text-secondary dark:text-dark-text-secondary block">
                            Translate To
                        </label>
                        <select
                            value={targetLang}
                            onChange={(e) => setTargetLang(e.target.value)}
                            disabled={isProcessing || isDone}
                            className="w-full px-3 py-2.5 bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-lg focus:outline-none focus:border-primary-fg transition-colors text-sm font-medium"
                        >
                            {/* Spoken Language Option */}
                            <option value={sourceLang}>
                                {sourceInfo.nativeName} ({sourceInfo.name}) — Course Spoken Language
                            </option>
                            
                            {/* Translation Options */}
                            <optgroup label="Translate to other languages">
                                {availableTargets.map(lang => (
                                    <option key={lang.code} value={lang.code}>
                                        {lang.nativeName} ({lang.name})
                                    </option>
                                ))}
                            </optgroup>
                        </select>
                    </div>

                    {/* AI Pipeline Details Card */}
                    <div className="bg-light-bg dark:bg-dark-bg p-4 rounded-xl border border-light-border dark:border-dark-border space-y-2 text-xs">
                        <div className="flex justify-between items-center">
                            <span className="opacity-70">Source Audio:</span>
                            <span className="font-semibold text-primary-fg">
                                <span>{sourceInfo.nativeName} ({sourceInfo.name})</span>
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="opacity-70">AI Engine:</span>
                            <span className="font-medium text-light-text dark:text-dark-text">
                                {isTargetSource 
                                    ? 'Whisper AI (Offline Speech-to-Text)' 
                                    : (hasSourceCaptions ? 'Meta NLLB-200 (Translator)' : 'Whisper AI + Meta NLLB-200')
                                }
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="opacity-70">Action:</span>
                            <span className="font-medium text-light-text dark:text-dark-text">
                                {isTargetSource 
                                    ? (hasSourceCaptions ? 'Regenerate original captions' : 'Generate original captions')
                                    : (hasSourceCaptions ? `Translate directly to ${targetInfo.name}` : `Transcribe in ${sourceInfo.name} & translate to ${targetInfo.name}`)
                                }
                            </span>
                        </div>
                    </div>

                    {/* Progress / Status */}
                    {(isProcessing || isDone || error) && (
                        <div className="space-y-3 pt-1">
                            {error ? (
                                <div className="flex items-start gap-2 text-red-500 bg-red-500/10 p-3 rounded-lg text-sm">
                                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                                    <div className="flex-1">
                                        <div className="font-medium">Error</div>
                                        <div className="text-xs opacity-90">{error}</div>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-center justify-between text-xs font-medium">
                                        <span className="flex items-center gap-2">
                                            {isDone ? (
                                                <CheckCircle2 className="w-4 h-4 text-green-500" />
                                            ) : (
                                                <Loader2 className="w-4 h-4 animate-spin text-primary-fg" />
                                            )}
                                            {statusText}
                                        </span>
                                        <span className="font-mono text-primary-fg">{progress}%</span>
                                    </div>
                                    <div className="h-2 w-full bg-light-border dark:bg-dark-border rounded-full overflow-hidden">
                                        <div 
                                            className={`h-full transition-all duration-300 ${isDone ? 'bg-green-500' : 'bg-primary-fg'}`}
                                            style={{ width: `${progress}%` }}
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-light-border dark:border-dark-border flex justify-end gap-2.5 bg-light-surface dark:bg-black/20">
                    <button
                        onClick={handleCancel}
                        disabled={isDone}
                        className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
                    >
                        {isProcessing ? 'Cancel' : 'Close'}
                    </button>
                    {!isProcessing && !isDone && (
                        <button
                            onClick={handleStart}
                            className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-content hover:opacity-90 transition-all flex items-center gap-2 shadow-sm"
                        >
                            {isTargetSource ? (
                                <>
                                    <Sparkles className="w-4 h-4" />
                                    {hasGeneratedSource ? 'Regenerate Transcript' : 'Generate Transcript'}
                                </>
                            ) : (
                                <>
                                    <Globe className="w-4 h-4" />
                                    {hasGeneratedTarget ? `Regenerate Translation` : (hasSourceCaptions ? `Translate to ${targetInfo.name}` : `Transcribe & Translate`)}
                                </>
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

