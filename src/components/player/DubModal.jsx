import { useState, useRef, useEffect } from 'react'
import { X, Headphones, Loader2, AlertCircle, CheckCircle2, Play } from 'lucide-react'
import { useSettings } from '../../contexts/SettingsContext'
import { TRANSLATION_LANGUAGES } from './TranslateModal'
import { SERVER_URL } from '../../utils/api'

export default function DubModal({ isOpen, onClose, video, onSuccess }) {
    const { settings } = useSettings()
    const [targetLang, setTargetLang] = useState('ar')
    const [isDubbing, setIsDubbing] = useState(false)
    const [status, setStatus] = useState(null)
    const [error, setError] = useState(null)
    const [isDone, setIsDone] = useState(false)
    const [serviceRunning, setServiceRunning] = useState(null) // null = checking
    const [isStartingService, setIsStartingService] = useState(false)
    const pollRef = useRef(null)

    // Check if Python dubbing service is running
    useEffect(() => {
        if (!isOpen) return
        setServiceRunning(null)
        checkService()
    }, [isOpen])

    async function checkService() {
        try {
            const res = await fetch(`${SERVER_URL}/api/dub/service/status`)
            const data = await res.json()
            setServiceRunning(data.running)
        } catch {
            setServiceRunning(false)
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
        }
    }, [isOpen])

    async function handleStartService() {
        setIsStartingService(true)
        setError(null)
        
        try {
            // Tell the Node backend to spawn the Python process
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
            
            setError('Service did not start within 60 seconds. Check the server console for errors.')
        } catch (err) {
            setError(`Failed to start service: ${err.message}`)
        }
        setIsStartingService(false)
    }

    async function handleStartDub() {
        setIsDubbing(true)
        setError(null)
        setStatus({ step: 'Submitting job...', progress: 0 })

        try {
            const res = await fetch(`${SERVER_URL}/api/dub/video/${video.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetLanguage: targetLang })
            })

            if (!res.ok) {
                const errData = await res.json()
                throw new Error(errData.error || `Server error: ${res.status}`)
            }

            const { jobId } = await res.json()

            // Poll for status every 3 seconds
            pollRef.current = setInterval(async () => {
                try {
                    const statusRes = await fetch(`${SERVER_URL}/api/dub/video/${video.id}/status`)
                    const data = await statusRes.json()
                    setStatus(data)

                    if (data.status === 'done') {
                        clearInterval(pollRef.current)
                        setIsDone(true)
                        setTimeout(() => {
                            onSuccess?.(targetLang)
                            onClose()
                        }, 1500)
                    } else if (data.status === 'failed') {
                        clearInterval(pollRef.current)
                        setError(data.error_message || data.error || 'Dubbing failed')
                        setIsDubbing(false)
                    }
                } catch (err) {
                    console.error('Polling error:', err)
                }
            }, 3000)

        } catch (err) {
            console.error('Dub submission failed:', err)
            setError(err.message)
            setIsDubbing(false)
        }
    }

    if (!isOpen) return null

    const langName = TRANSLATION_LANGUAGES.find(l => l.code === targetLang)?.name || targetLang

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white dark:bg-dark-surface w-full max-w-md rounded-xl shadow-2xl overflow-hidden border border-light-border dark:border-dark-border">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <Headphones className="w-5 h-5 text-primary-fg" />
                        AI Dubbing
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors"
                        disabled={isDone}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    {/* Service Status */}
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
                                        AI dubbing uses Coqui XTTS v2 which requires Python. Click below to auto-start it, or run manually:
                                    </p>
                                </div>
                            </div>
                            
                            <div className="bg-black/10 dark:bg-white/5 rounded-md p-2 font-mono text-xs">
                                <p className="opacity-60 mb-1"># One-time setup:</p>
                                <p>pip install TTS fastapi uvicorn pydub</p>
                                <p className="opacity-60 mt-2 mb-1"># Start service:</p>
                                <p>python python/dubbing_server.py</p>
                            </div>

                            <button
                                onClick={handleStartService}
                                className="w-full py-2 rounded-lg text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 transition-colors flex items-center justify-center gap-2"
                            >
                                <Play className="w-4 h-4" />
                                Auto-Start Service
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
                                <p className="text-xs mt-0.5 opacity-70">This may take a minute on first run (loading model)</p>
                            </div>
                        </div>
                    )}

                    {serviceRunning === true && (
                        <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 bg-green-500/10 p-2.5 rounded-lg">
                            <CheckCircle2 className="w-4 h-4" />
                            <span className="font-medium">Dubbing service running</span>
                        </div>
                    )}

                    {/* Language Selector */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-light-text-secondary dark:text-dark-text-secondary block">
                            Target Language
                        </label>
                        <select
                            value={targetLang}
                            onChange={(e) => setTargetLang(e.target.value)}
                            disabled={isDubbing || isDone}
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
                            <span className="opacity-70">Engine:</span>
                            <span className="font-medium">Coqui XTTS v2 (Local)</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="opacity-70">Voice Cloning:</span>
                            <span className="font-medium">Auto (from video)</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="opacity-70">Output:</span>
                            <span className="font-medium">MP3 audio track</span>
                        </div>
                    </div>

                    {/* Prerequisites Note */}
                    <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary bg-light-bg dark:bg-dark-bg p-3 rounded-lg">
                        <p className="font-medium mb-1">&#9888;&#65039; Prerequisites:</p>
                        <ul className="list-disc list-inside space-y-0.5 opacity-80">
                            <li>Translated captions in {langName} must exist first</li>
                            <li>ffmpeg must be installed and in PATH</li>
                            <li>First run downloads XTTS v2 model (~1.8 GB)</li>
                        </ul>
                    </div>

                    {/* Progress / Status */}
                    {(isDubbing || isDone || error) && (
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
                                            {status?.step || 'Processing...'}
                                        </span>
                                        <span>{status?.progress || 0}%</span>
                                    </div>
                                    <div className="h-2 w-full bg-light-border dark:bg-dark-border rounded-full overflow-hidden">
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
                    <button
                        onClick={onClose}
                        disabled={isDone}
                        className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
                    >
                        {isDubbing ? 'Cancel' : 'Close'}
                    </button>
                    {!isDubbing && !isDone && (
                        <button
                            onClick={handleStartDub}
                            disabled={!serviceRunning}
                            className="px-4 py-2 rounded-lg text-sm font-medium bg-primary-fg text-white hover:bg-primary-dark transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Headphones className="w-4 h-4" />
                            Start Dubbing
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
