import { useState, useRef, useEffect } from 'react'
import { X, Globe, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useSettings } from '../../contexts/SettingsContext'
import { SERVER_URL } from '../../utils/api'

export const TRANSLATION_LANGUAGES = [
    { code: 'ar', name: 'Arabic' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'zh', name: 'Chinese' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' },
    { code: 'ru', name: 'Russian' },
    { code: 'pt', name: 'Portuguese' },
    { code: 'it', name: 'Italian' },
    { code: 'hi', name: 'Hindi' },
    { code: 'tr', name: 'Turkish' },
    { code: 'nl', name: 'Dutch' },
    { code: 'pl', name: 'Polish' },
    { code: 'vi', name: 'Vietnamese' },
    { code: 'th', name: 'Thai' }
]

export default function TranslateModal({ isOpen, onClose, video, onSuccess, chunkCount = 0 }) {
    const { settings } = useSettings()
    const [targetLang, setTargetLang] = useState('ar')
    const [isTranslating, setIsTranslating] = useState(false)
    const [progress, setProgress] = useState(0)
    const [statusText, setStatusText] = useState('')
    const [error, setError] = useState(null)
    const [isDone, setIsDone] = useState(false)
    
    const abortControllerRef = useRef(null)

    useEffect(() => {
        if (!isOpen) {
            // Reset state when closed
            setIsTranslating(false)
            setProgress(0)
            setStatusText('')
            setError(null)
            setIsDone(false)
            if (abortControllerRef.current) {
                abortControllerRef.current.abort()
                abortControllerRef.current = null
            }
        }
    }, [isOpen])

    async function handleTranslate() {
        setIsTranslating(true)
        setError(null)
        setProgress(0)
        setStatusText('Initializing local model...')
        setIsDone(false)

        abortControllerRef.current = new AbortController()

        try {
            const response = await fetch(`${SERVER_URL}/api/transcripts/${video.id}/translate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    targetLanguage: targetLang
                }),
                signal: abortControllerRef.current.signal
            })

            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`)
            }

            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ''

            while (true) {
                const { value, done } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n\n')
                buffer = lines.pop() || '' // Keep the last incomplete part

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const dataStr = line.replace('data: ', '')
                        try {
                            const data = JSON.parse(dataStr)
                            
                            if (data.error) {
                                throw new Error(data.error)
                            }
                            
                            if (data.step === 'loading' || data.step === 'downloading') {
                                setProgress(data.percent)
                                setStatusText(data.message)
                            } else if (data.step === 'translating') {
                                setProgress(data.percent)
                                setStatusText(data.message)
                            } else if (data.step === 'done') {
                                setProgress(100)
                                setStatusText(data.message)
                                setIsDone(true)
                                setTimeout(() => {
                                    onSuccess?.(data.lang)
                                    onClose()
                                }, 1500)
                            }
                        } catch (e) {
                            if (e.message !== 'Unexpected end of JSON input') {
                                throw e
                            }
                        }
                    }
                }
            }
        } catch (err) {
            if (err.name === 'AbortError') {
                setStatusText('Translation cancelled.')
                setTimeout(() => onClose(), 1000)
            } else {
                console.error('Translation failed:', err)
                setError(err.message)
            }
        } finally {
            if (!isDone && !abortControllerRef.current?.signal.aborted) {
                setIsTranslating(false)
            }
        }
    }

    function handleCancel() {
        if (isTranslating && abortControllerRef.current) {
            abortControllerRef.current.abort()
        } else {
            onClose()
        }
    }

    if (!isOpen) return null

    const estimatedBatches = Math.ceil((chunkCount || 100) / 40)
    const estimatedTimeMin = estimatedBatches * 3
    const estimatedTimeMax = estimatedBatches * 6

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white dark:bg-dark-surface w-full max-w-md rounded-xl shadow-2xl overflow-hidden border border-light-border dark:border-dark-border">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <Globe className="w-5 h-5 text-primary-fg" />
                        Translate Captions
                    </h2>
                    <button
                        onClick={handleCancel}
                        className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors"
                        disabled={isDone}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Language Selector */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-light-text-secondary dark:text-dark-text-secondary block">
                            Target Language
                        </label>
                        <select
                            value={targetLang}
                            onChange={(e) => setTargetLang(e.target.value)}
                            disabled={isTranslating || isDone}
                            className="w-full px-3 py-2 bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-lg focus:outline-none focus:border-primary-fg transition-colors"
                        >
                            {TRANSLATION_LANGUAGES.map(lang => (
                                <option key={lang.code} value={lang.code}>
                                    {lang.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Info Card */}
                    <div className="bg-light-bg dark:bg-dark-bg p-4 rounded-lg border border-light-border dark:border-dark-border space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="opacity-70">Source:</span>
                            <span className="font-medium">English (Source)</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="opacity-70">Model:</span>
                            <span className="font-medium truncate max-w-[150px]" title="NLLB-200 Distilled (600M)">
                                NLLB-200 (Local)
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="opacity-70">Est. Time:</span>
                            <span className="font-medium">{estimatedTimeMin} - {estimatedTimeMax} seconds</span>
                        </div>
                    </div>

                    {/* Progress / Status */}
                    {(isTranslating || isDone || error) && (
                        <div className="space-y-3 pt-2">
                            {error ? (
                                <div className="flex items-start gap-2 text-red-500 bg-red-500/10 p-3 rounded-lg text-sm">
                                    <AlertCircle className="w-5 h-5 shrink-0" />
                                    <span>{error}</span>
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
                                            {statusText}
                                        </span>
                                        <span>{progress}%</span>
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
                <div className="p-4 border-t border-light-border dark:border-dark-border flex justify-end gap-3 bg-light-surface dark:bg-black/20">
                    <button
                        onClick={handleCancel}
                        disabled={isDone}
                        className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
                    >
                        {isTranslating ? 'Cancel' : 'Close'}
                    </button>
                    {!isTranslating && !isDone && (
                        <button
                            onClick={handleTranslate}
                            className="px-4 py-2 rounded-lg text-sm font-medium bg-primary-fg text-white hover:bg-primary-dark transition-colors flex items-center gap-2"
                        >
                            <Globe className="w-4 h-4" />
                            Start Translation
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
