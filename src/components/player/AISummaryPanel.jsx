import { useState, useEffect, useRef } from 'react'
import { FileText, Sparkles, Loader2, AlertCircle, Download, Copy, RefreshCw, Upload, Captions, X, Globe } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { getVideo, updateVideo } from '../../utils/db'
import { SERVER_URL } from '../../utils/api'
import { processVideoForSummary, isAIAvailable, regenerateSummaryOnly } from '../../utils/aiSummarization'
import { verifyPermission } from '../../utils/fileSystem'
import { useSettings } from '../../contexts/SettingsContext'
import TranslateModal from './TranslateModal'

// Format seconds to MM:SS or HH:MM:SS
function formatTime(seconds) {
    if (seconds == null || isNaN(seconds)) return '0:00'
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    }
    return `${m}:${s.toString().padStart(2, '0')}`
}

function AISummaryPanel({ video, courseId, onSeek, onVideoDataChange, currentTime = 0 }) {
    const { settings, updateSettings } = useSettings()
    const [transcript, setTranscript] = useState(null)
    const [summary, setSummary] = useState(null)
    const [captionChunks, setCaptionChunks] = useState([])
    const [isProcessing, setIsProcessing] = useState(false)
    const [progress, setProgress] = useState({ stage: '', progress: 0, message: '' })
    const [error, setError] = useState(null)
    const [activeTab, setActiveTab] = useState('summary')
    const [missingCaptions, setMissingCaptions] = useState(false)
    const [languages, setLanguages] = useState({ sourceExists: false, translatedLangs: [], existingLangs: [] })
    const [showTranslateModal, setShowTranslateModal] = useState(false)
    const fileInputRef = useRef(null)
    const activeVideoIdRef = useRef(video?.id)

    // Load existing data when video changes
    useEffect(() => {
        activeVideoIdRef.current = video?.id
        
        if (video?.id) {
            loadExistingData()
        } else {
            setTranscript(null)
            setSummary(null)
            setCaptionChunks([])
            setMissingCaptions(false)
        }
        
        // Reset processing state and errors when switching videos
        setIsProcessing(false)
        setError(null)
        setProgress({ stage: '', progress: 0, message: '' })
    }, [video?.id])

    // Re-fetch chunks when active language changes
    useEffect(() => {
        if (!video?.id) return
        const fetchChunks = async () => {
            try {
                const { isServerAvailable, get } = await import('../../utils/api')
                const serverAvailable = await isServerAvailable()
                if (serverAvailable) {
                    const lang = settings.captionLanguage || 'source'
                    const chunks = await get(`/api/transcripts/${video.id}/chunks?lang=${lang}`)
                    setCaptionChunks(chunks || [])
                    setMissingCaptions(!chunks || chunks.length === 0)
                }
            } catch (err) {
                console.error('Failed to fetch translated chunks:', err)
            }
        }
        fetchChunks()
    }, [video?.id, settings.captionLanguage])

    async function loadExistingData(forceLang = null) {
        try {
            const { isServerAvailable, get } = await import('../../utils/api')
            const serverAvailable = await isServerAvailable()
            
            if (serverAvailable) {
                try {
                    const videoData = await getVideo(video.id)
                    // In server mode, videoData just has flags, we must fetch the content
                    if (videoData.has_transcript) {
                        const transcriptText = await fetch(`${SERVER_URL}/api/transcripts/${video.id}/text`).then(r => r.text())
                        setTranscript(transcriptText || null)
                        
                        const lang = forceLang || settings.captionLanguage || 'source'
                        const chunks = await get(`/api/transcripts/${video.id}/chunks?lang=${lang}`)
                        setCaptionChunks(chunks || [])
                        setMissingCaptions(!chunks || chunks.length === 0)

                        const langs = await get(`/api/transcripts/${video.id}/languages`)
                        if (langs) setLanguages(langs)
                    } else {
                        setTranscript(null)
                        setCaptionChunks([])
                        setMissingCaptions(false)
                    }
                    
                    if (videoData.has_summary) {
                        const summaryData = await get(`/api/summaries/${video.id}`)
                        setSummary(summaryData?.content || null)
                    } else {
                        setSummary(null)
                    }
                } catch (e) {
                    console.error('Server AI fetch error', e)
                }
            } else {
                const videoData = await getVideo(video.id)
                setTranscript(videoData?.transcript || null)
                setSummary(videoData?.summary || null)
                setCaptionChunks(videoData?.captionChunks || [])
                // Check if transcript exists but no caption chunks (old transcript without CC support)
                const hasCaptions = videoData?.captionChunks && videoData.captionChunks.length > 0
                setMissingCaptions(!!videoData?.transcript && !hasCaptions)
            }
        } catch (err) {
            console.error('Failed to load AI data:', err)
        }
    }

    async function handleGenerateSummary() {
        const targetVideoId = video.id

        if (!isAIAvailable()) {
            setError('AI features require a modern browser with WebAssembly support.')
            return
        }

        // Get file source - try fileHandle first, then fallback to backend stream URL
        let fileSource = video?.fileHandle || (video?.filePath ? `${SERVER_URL}/video/${encodeURIComponent(video.filePath)}` : null)

        if (!fileSource) {
            setError('Please select a video file first.')
            return
        }

        // If using fileHandle, verify permission
        if (fileSource.getFile) {
            try {
                const hasPermission = await verifyPermission(fileSource)
                if (!hasPermission) {
                    setError('File access was denied. Please grant permission when prompted.')
                    return
                }
            } catch (err) {
                setError('Could not verify file access: ' + err.message)
                return
            }
        }

        try {
            setIsProcessing(true)
            setError(null)
            setProgress({ stage: 'starting', progress: 0, message: 'Starting...' })

            const result = await processVideoForSummary(
                video.id,
                fileSource,
                setProgress,
                settings.openRouterApiKey,
                settings.openRouterModel,
                settings.aiDevice
            )

            if (activeVideoIdRef.current !== targetVideoId) return

            setTranscript(result.transcript)
            setSummary(result.summary)
            setCaptionChunks(result.captionChunks || [])
            setMissingCaptions(false) // Captions now available

            // Notify parent that video data has changed (for CC icon update)
            onVideoDataChange?.()
        } catch (err) {
            if (activeVideoIdRef.current !== targetVideoId) return
            console.error('AI processing failed:', err)
            setError(err.message)
        } finally {
            if (activeVideoIdRef.current === targetVideoId) setIsProcessing(false)
        }
    }

    function copyToClipboard(text) {
        navigator.clipboard.writeText(text)
    }

    function handleUploadCaptions(e) {
        const file = e.target.files?.[0]
        if (!file || !video?.id) return

        const formData = new FormData()
        formData.append('file', file)

        fetch(`${SERVER_URL}/api/transcripts/${video.id}/upload`, {
            method: 'POST',
            body: formData
        })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    if (data.language) {
                        updateSettings({ captionLanguage: data.language })
                    }
                    loadExistingData(data.language || 'source')
                    onVideoDataChange?.()
                }
            })
            .catch(err => console.error('Failed to upload captions:', err))
    }

    function handleDeleteCaption(lang) {
        if (!confirm(`Delete caption for language: ${lang}?`)) return
        fetch(`${SERVER_URL}/api/transcripts/${video.id}?lang=${lang}`, { method: 'DELETE' })
            .then(res => res.json())
            .then(() => {
                loadExistingData()
                onVideoDataChange?.()
            })
    }

    function exportAsMarkdown() {
        const content = `# ${video.title}\n\n## Summary\n${summary || 'No summary available'}\n\n## Transcript\n${transcript || 'No transcript available'}`
        const blob = new Blob([content], { type: 'text/markdown' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${video.title.replace(/[^a-z0-9]/gi, '_')}_ai_summary.md`
        a.click()
        URL.revokeObjectURL(url)
    }

    // Regenerate just the summary (no file needed, uses existing transcript)
    async function handleRegenerateSummary() {
        const targetVideoId = video.id
        const textToSummarize = transcript || captionChunks.map(c => c.text).join(' ')

        if (!textToSummarize) {
            setError('No transcript available. Generate one first.')
            return
        }

        try {
            setIsProcessing(true)
            setError(null)
            setProgress({ stage: 'summarizing', progress: 0, message: 'Regenerating summary...' })

            const newSummary = await regenerateSummaryOnly(video.id, textToSummarize, setProgress, settings.openRouterApiKey, settings.openRouterModel)
            
            if (activeVideoIdRef.current !== targetVideoId) return
            
            setSummary(newSummary)
        } catch (err) {
            if (activeVideoIdRef.current !== targetVideoId) return
            console.error('Summary regeneration failed:', err)
            setError(err.message)
        } finally {
            if (activeVideoIdRef.current === targetVideoId) setIsProcessing(false)
        }
    }

    if (!video) return null

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-light-border dark:border-dark-border">
                <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-primary-fg" />
                    <span className="font-medium">AI Summary</span>
                </div>
                {(transcript || summary) && (
                    <button
                        onClick={exportAsMarkdown}
                        className="p-1.5 hover:bg-light-surface dark:hover:bg-dark-bg rounded"
                        title="Export"
                    >
                        <Download className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                
                {/* Tab Switcher */}
                <div className="flex bg-light-surface dark:bg-dark-bg rounded-lg p-1">
                    <button
                        onClick={() => setActiveTab('summary')}
                        className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${activeTab === 'summary'
                            ? 'bg-white dark:bg-dark-surface shadow-sm'
                            : 'text-light-text-secondary dark:text-dark-text-secondary'
                            }`}
                    >
                        Summary
                    </button>
                    <button
                        onClick={() => setActiveTab('transcript')}
                        className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${activeTab === 'transcript'
                            ? 'bg-white dark:bg-dark-surface shadow-sm'
                            : 'text-light-text-secondary dark:text-dark-text-secondary'
                            }`}
                    >
                        Transcript
                    </button>
                </div>

                {/* Generate Button for Summary Tab */}
                {!summary && !isProcessing && activeTab === 'summary' && (
                    <div className="text-center py-8">
                        <Sparkles className="w-12 h-12 mx-auto mb-4 text-primary-fg/50" />
                        <h3 className="font-medium mb-2">Generate AI Summary</h3>
                        <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mb-4">
                            Transcribe and summarize this video using Whisper AI.
                        </p>

                        <button
                            onClick={() => (transcript || captionChunks.length > 0) ? handleRegenerateSummary() : handleGenerateSummary()}
                            className="px-4 py-2 rounded-lg flex items-center gap-2 mx-auto transition-colors bg-primary text-primary-content hover:bg-primary-hover"
                        >
                            <Sparkles className="w-4 h-4" />
                            Generate Summary
                        </button>
                        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-4">
                            First run downloads a ~40MB AI model (cached for offline use)
                        </p>
                    </div>
                )}

                {/* Processing State */}
                {isProcessing && (
                    <div className="text-center py-8">
                        <Loader2 className="w-12 h-12 mx-auto mb-4 text-primary-fg animate-spin" />
                        <h3 className="font-medium mb-2">{progress.message || 'Processing...'}</h3>
                        <div className="w-full max-w-xs mx-auto bg-light-surface dark:bg-dark-bg rounded-full h-2 overflow-hidden">
                            <div
                                className="h-full bg-primary-fg transition-all duration-300"
                                style={{ width: `${progress.progress * 100}%` }}
                            />
                        </div>
                        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-2">
                            {Math.round(progress.progress * 100)}% - {progress.stage}
                        </p>
                    </div>
                )}

                {/* Error State */}
                {error && (
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="font-medium">Error</p>
                            <p className="text-sm">{error}</p>
                            <button
                                onClick={handleGenerateSummary}
                                className="mt-2 text-sm underline flex items-center gap-1"
                            >
                                <RefreshCw className="w-3 h-3" />
                                Try Again
                            </button>
                        </div>
                    </div>
                )}

                {/* Missing Captions Warning */}
                {missingCaptions && !isProcessing && (transcript || summary) && (
                    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-start gap-3">
                        <Captions className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">
                                Captions not available
                            </p>
                            <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                                This transcript was generated before CC support. Regenerate to enable closed captions.
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2 items-center">
                                    <button
                                        onClick={() => handleGenerateSummary()}
                                        className="text-xs bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors"
                                    >
                                        <RefreshCw className="w-3 h-3" />
                                        Regenerate with Captions
                                    </button>
                                </div>
                            </div>
                        </div>
                )}

                {/* Results */}
                {!isProcessing && (
                    <>
                        {/* Content Display */}
                        <div className="p-4 bg-light-surface dark:bg-dark-bg rounded-lg">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    {activeTab === 'summary' ? (
                                        <Sparkles className="w-4 h-4 text-primary-fg" />
                                    ) : (
                                        <FileText className="w-4 h-4 text-primary-fg" />
                                    )}
                                    <span className="text-sm font-medium">
                                        {activeTab === 'summary' ? 'AI Summary' : 'Full Transcript'}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1">
                                    {transcript && activeTab === 'summary' && (
                                        <button
                                            onClick={handleRegenerateSummary}
                                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-dark-surface rounded"
                                            title="Regenerate Summary"
                                        >
                                            <RefreshCw className="w-4 h-4" />
                                        </button>
                                    )}
                                    <button
                                        onClick={() => copyToClipboard(activeTab === 'summary' ? summary : transcript)}
                                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-dark-surface rounded"
                                        title="Copy"
                                    >
                                        <Copy className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            <div className="max-h-[60vh] overflow-y-auto">
                                {activeTab === 'summary' ? (
                                    summary ? (
                                        <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-primary-fg prose-headings:font-semibold prose-h2:text-lg prose-h3:text-base prose-ul:my-2 prose-li:my-0.5">
                                            <ReactMarkdown>{summary}</ReactMarkdown>
                                        </div>
                                    ) : null
                                ) : (
                                    <>
                                        <div className="mb-4 space-y-3">
                                            <div className="flex flex-wrap gap-2">
                                                <button
                                                    onClick={() => fileInputRef.current?.click()}
                                                    className="text-xs bg-light-surface dark:bg-dark-surface hover:bg-black/10 dark:hover:bg-white/10 px-3 py-1.5 rounded flex items-center gap-1.5 border border-light-border dark:border-dark-border"
                                                >
                                                    <Upload className="w-3 h-3" />
                                                    Upload Captions
                                                </button>
                                                <input 
                                                    type="file" 
                                                    accept=".srt,.vtt,.ass,.lrc"
                                                    className="hidden"
                                                    ref={fileInputRef}
                                                    onChange={handleUploadCaptions}
                                                />
                                                <button
                                                    onClick={() => setShowTranslateModal(true)}
                                                    className="text-xs bg-light-surface dark:bg-dark-surface hover:bg-black/10 dark:hover:bg-white/10 px-3 py-1.5 rounded flex items-center gap-1.5 border border-light-border dark:border-dark-border"
                                                >
                                                    <Globe className="w-3 h-3" />
                                                    Translate
                                                </button>

                                                {captionChunks.length > 0 && (
                                                    <>
                                                        <a
                                                            href={`${SERVER_URL}/api/transcripts/${video.id}/download?format=srt`}
                                                            download
                                                            className="text-xs bg-light-surface dark:bg-dark-surface hover:bg-black/10 dark:hover:bg-white/10 px-3 py-1.5 rounded flex items-center gap-1.5 border border-light-border dark:border-dark-border"
                                                        >
                                                            <Download className="w-3 h-3" />
                                                            SRT
                                                        </a>
                                                        <a
                                                            href={`${SERVER_URL}/api/transcripts/${video.id}/download?format=vtt`}
                                                            download
                                                            className="text-xs bg-light-surface dark:bg-dark-surface hover:bg-black/10 dark:hover:bg-white/10 px-3 py-1.5 rounded flex items-center gap-1.5 border border-light-border dark:border-dark-border"
                                                        >
                                                            <Download className="w-3 h-3" />
                                                            VTT
                                                        </a>
                                                    </>
                                                )}
                                            </div>

                                            {/* Languages List */}
                                            {(languages.sourceExists || languages.existingLangs.length > 0 || languages.translatedLangs.length > 0) && (
                                                <div className="flex flex-col gap-1 p-2 bg-black/5 dark:bg-white/5 rounded border border-light-border dark:border-dark-border">
                                                    <span className="text-xs font-semibold mb-1 opacity-70">Available Languages:</span>
                                                    {languages.sourceExists && (
                                                        <div 
                                                            onClick={() => updateSettings({ captionLanguage: 'source' })}
                                                            className={`flex items-center justify-between text-sm px-2 py-1 rounded cursor-pointer ${settings.captionLanguage === 'source' || !settings.captionLanguage ? 'bg-primary-fg/20 border border-primary-fg/50' : 'bg-white dark:bg-black/20 hover:bg-black/5 dark:hover:bg-white/5'}`}
                                                        >
                                                            <span className="flex items-center gap-2"><span>✨</span> Source / Generated</span>
                                                            <button onClick={(e) => { e.stopPropagation(); handleDeleteCaption('source') }} className="text-red-500 hover:text-red-700 p-1"><X className="w-3 h-3" /></button>
                                                        </div>
                                                    )}
                                                    {languages.existingLangs.map(lang => (
                                                        <div 
                                                            key={lang} 
                                                            onClick={() => updateSettings({ captionLanguage: lang })}
                                                            className={`flex items-center justify-between text-sm px-2 py-1 rounded cursor-pointer ${settings.captionLanguage === lang ? 'bg-primary-fg/20 border border-primary-fg/50' : 'bg-white dark:bg-black/20 hover:bg-black/5 dark:hover:bg-white/5'}`}
                                                        >
                                                            <span className="flex items-center gap-2"><span>📄</span> {lang === 'source' ? 'Original File' : lang}</span>
                                                            {/* Cannot delete existing */}
                                                        </div>
                                                    ))}
                                                    {languages.translatedLangs.map(lang => (
                                                        <div 
                                                            key={lang} 
                                                            onClick={() => updateSettings({ captionLanguage: lang })}
                                                            className={`flex items-center justify-between text-sm px-2 py-1 rounded cursor-pointer ${settings.captionLanguage === lang ? 'bg-primary-fg/20 border border-primary-fg/50' : 'bg-white dark:bg-black/20 hover:bg-black/5 dark:hover:bg-white/5'}`}
                                                        >
                                                            <span className="flex items-center gap-2"><span>🌐</span> {lang.toUpperCase()}</span>
                                                            <button onClick={(e) => { e.stopPropagation(); handleDeleteCaption(lang) }} className="text-red-500 hover:text-red-700 p-1"><X className="w-3 h-3" /></button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                    {captionChunks.length > 0 ? (() => {
                                        // Group chunks into sentences (combine words within 5 second windows)
                                        const groupedChunks = []
                                        let currentGroup = { text: '', timestamp: null, endTime: 0 }

                                        for (const chunk of captionChunks) {
                                            const chunkStart = chunk.timestamp?.[0] || 0
                                            const chunkEnd = chunk.timestamp?.[1] || chunkStart + 1
                                            const currentStart = currentGroup.timestamp?.[0]

                                            // Start new group if this chunk is >5s from current group start
                                            // or if we've accumulated enough text (~100 chars)
                                            if (currentStart === null ||
                                                currentStart === undefined ||
                                                chunkStart - currentStart > 5 ||
                                                currentGroup.text.length > 100) {
                                                if (currentGroup.text.trim()) {
                                                    groupedChunks.push(currentGroup)
                                                }
                                                currentGroup = {
                                                    text: chunk.text,
                                                    timestamp: chunk.timestamp,
                                                    endTime: chunkEnd
                                                }
                                            } else {
                                                // Add to current group
                                                currentGroup.text += ' ' + chunk.text
                                                currentGroup.endTime = Math.max(currentGroup.endTime, chunkEnd)
                                            }
                                        }
                                        // Don't forget the last group
                                        if (currentGroup.text.trim()) {
                                            groupedChunks.push(currentGroup)
                                        }

                                        // Find which group is currently active
                                        const currentGroupIndex = groupedChunks.findIndex((group, i) => {
                                            const start = group.timestamp?.[0] || 0
                                            const nextStart = groupedChunks[i + 1]?.timestamp?.[0] || Infinity
                                            return currentTime >= start && currentTime < nextStart
                                        })

                                        return (
                                            <div className="space-y-2">
                                                {groupedChunks.map((group, i) => {
                                                    const isActive = i === currentGroupIndex
                                                    return (
                                                        <div
                                                            key={i}
                                                            className={`flex gap-3 group rounded px-2 py-1.5 -mx-2 transition-colors duration-200 ${isActive
                                                                ? 'bg-primary-fg/20 border-l-2 border-primary-fg'
                                                                : 'hover:bg-light-surface dark:hover:bg-dark-surface'
                                                                }`}
                                                        >
                                                            <button
                                                                onClick={() => onSeek?.(group.timestamp?.[0] || 0)}
                                                                className={`text-xs hover:underline shrink-0 w-12 text-left font-mono group-hover:opacity-100 ${isActive ? 'text-primary-fg font-medium opacity-100' : 'text-primary-fg opacity-70'
                                                                    }`}
                                                                title="Click to seek"
                                                            >
                                                                {formatTime(group.timestamp?.[0])}
                                                            </button>
                                                            <span className={`text-sm leading-relaxed ${isActive ? 'font-medium' : ''}`}>
                                                                {group.text.trim()}
                                                            </span>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )
                                    })() : transcript ? (
                                        <p className="text-sm whitespace-pre-wrap">{transcript}</p>
                                    ) : (
                                        <span className="italic opacity-60">No transcript generated yet.</span>
                                    )}
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Regenerate Button */}
                        {(transcript || summary || captionChunks.length > 0) && (
                            <button
                                onClick={handleGenerateSummary}
                                className="w-full py-2 border border-light-border dark:border-dark-border rounded-lg hover:bg-light-surface dark:hover:bg-dark-bg transition-colors text-sm flex items-center justify-center gap-2"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Regenerate
                            </button>
                        )}
                    </>
                )}
            </div>

            <TranslateModal
                isOpen={showTranslateModal}
                onClose={() => setShowTranslateModal(false)}
                video={video}
                chunkCount={captionChunks.length}
                onSuccess={(lang) => {
                    loadExistingData()
                    updateSettings({ captionLanguage: lang })
                    onVideoDataChange?.()
                }}
            />
        </div>
    )
}

export default AISummaryPanel
