import { useState, useRef, useEffect } from 'react'
import { X, Globe, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useSettings } from '../../contexts/SettingsContext'
import { SERVER_URL } from '../../utils/api'
import { SUPPORTED_LANGUAGES, getLanguageInfo } from '../../utils/languages'

export default function BulkTranslateModal({ isOpen, onClose, videos, course, onSuccess }) {
    const { settings } = useSettings()
    const sourceLang = (course?.language || 'en').toLowerCase().trim()
    const sourceInfo = getLanguageInfo(sourceLang)

    const availableTargets = SUPPORTED_LANGUAGES.filter(l => l.code !== sourceLang)
    const [targetLang, setTargetLang] = useState(sourceLang === 'en' ? 'es' : 'en')
    
    const [isProcessing, setIsProcessing] = useState(false)
    const [isDone, setIsDone] = useState(false)
    const [results, setResults] = useState({}) // { videoId: { status: 'pending'|'processing'|'done'|'error', error?: string, progress: number, message: string } }
    
    const abortControllerRef = useRef(null)

    useEffect(() => {
        if (isOpen && videos) {
            const initialResults = {}
            videos.forEach(v => {
                initialResults[v.id] = { status: 'pending', progress: 0, message: 'Waiting...' }
            })
            setResults(initialResults)
            setIsProcessing(false)
            setIsDone(false)
        }
    }, [isOpen, videos])

    async function handleStart() {
        if (isProcessing || videos.length === 0) return
        
        setIsProcessing(true)
        setIsDone(false)
        abortControllerRef.current = new AbortController()

        // Process sequentially to avoid overloading the backend / GPU
        for (const video of videos) {
            if (abortControllerRef.current.signal.aborted) break;

            setResults(prev => ({
                ...prev,
                [video.id]: { status: 'processing', progress: 0, message: 'Starting translation...' }
            }))

            try {
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
                    throw new Error(`Translation error: ${response.status}`)
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
                                    setResults(prev => ({
                                        ...prev,
                                        [video.id]: { status: 'processing', progress: data.percent || 0, message: data.message }
                                    }))
                                } else if (data.step === 'done') {
                                    setResults(prev => ({
                                        ...prev,
                                        [video.id]: { status: 'done', progress: 100, message: 'Complete!' }
                                    }))
                                }
                            } catch (e) {
                                if (e.message !== 'Unexpected end of JSON input') throw e
                            }
                        }
                    }
                }
            } catch (err) {
                if (err.name === 'AbortError') break
                setResults(prev => ({
                    ...prev,
                    [video.id]: { status: 'error', progress: 0, message: err.message, error: err.message }
                }))
            }
        }

        if (!abortControllerRef.current.signal.aborted) {
            setIsProcessing(false)
            setIsDone(true)
            onSuccess?.(targetLang)
        }
    }

    function handleCancel() {
        if (isProcessing && abortControllerRef.current) {
            abortControllerRef.current.abort()
        }
        onClose()
    }

    if (!isOpen) return null

    const successCount = Object.values(results).filter(r => r.status === 'done').length
    const errorCount = Object.values(results).filter(r => r.status === 'error').length

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-dark-surface w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden border border-light-border dark:border-dark-border flex flex-col max-h-[85vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <Globe className="w-5 h-5 text-blue-500" />
                        Bulk Translate ({videos.length} videos)
                    </h2>
                    <button onClick={handleCancel} className="p-1 hover:bg-light-bg dark:hover:bg-dark-bg rounded-lg transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 flex-1 overflow-y-auto">
                    {!isProcessing && !isDone && (
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium mb-2">Source Language</label>
                                <div className="p-3 bg-light-bg dark:bg-dark-bg rounded-lg border border-light-border dark:border-dark-border text-sm flex items-center gap-2">
                                    <span className="text-lg" title={sourceInfo.name}>{sourceInfo.flag}</span>
                                    <span>{sourceInfo.name}</span>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">Target Language</label>
                                <select
                                    value={targetLang}
                                    onChange={(e) => setTargetLang(e.target.value)}
                                    className="w-full p-3 bg-white dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-lg outline-none focus:ring-2 focus:ring-blue-500/50"
                                >
                                    {availableTargets.map(l => (
                                        <option key={l.code} value={l.code}>{l.flag} {l.name} ({l.nativeName})</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    )}

                    {(isProcessing || isDone) && (
                        <div className="space-y-3">
                            {videos.map(v => {
                                const res = results[v.id] || {}
                                return (
                                    <div key={v.id} className="p-3 bg-light-bg dark:bg-dark-bg rounded-lg border border-light-border dark:border-dark-border flex items-center justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate" title={v.title}>{v.title}</p>
                                            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1 truncate">
                                                {res.message}
                                            </p>
                                        </div>
                                        <div className="w-32 flex-shrink-0 flex items-center gap-3">
                                            {res.status === 'processing' && (
                                                <>
                                                    <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                                        <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${res.progress}%` }}></div>
                                                    </div>
                                                    <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                                                </>
                                            )}
                                            {res.status === 'done' && <CheckCircle2 className="w-5 h-5 text-green-500 mx-auto" />}
                                            {res.status === 'error' && <AlertCircle className="w-5 h-5 text-danger mx-auto" title={res.error} />}
                                            {res.status === 'pending' && <div className="w-5 h-5 mx-auto opacity-20"><Loader2 className="w-full h-full" /></div>}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-light-border dark:border-dark-border flex items-center justify-between bg-light-surface dark:bg-dark-bg/50">
                    <div className="text-sm font-medium">
                        {isDone && (
                            <span className={errorCount > 0 ? 'text-warning' : 'text-green-500'}>
                                Completed: {successCount} successful{errorCount > 0 ? `, ${errorCount} failed` : ''}
                            </span>
                        )}
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={handleCancel}
                            className="px-4 py-2 text-sm font-medium hover:bg-light-bg dark:hover:bg-dark-bg rounded-lg transition-colors"
                        >
                            {isProcessing ? 'Cancel Translation' : (isDone ? 'Close' : 'Cancel')}
                        </button>
                        {!isProcessing && !isDone && (
                            <button
                                onClick={handleStart}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                            >
                                <Globe className="w-4 h-4" />
                                Start Translation
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
