import { useState, useEffect, useRef } from 'react'
import { FileText, Sparkles, Loader2, AlertCircle, Download, Copy, RefreshCw, Upload, Captions, X, Globe, Headphones, Volume2, ChevronDown, Check } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { getVideo, updateVideo } from '../../utils/db'
import { SERVER_URL } from '../../utils/api'
import { processVideoForSummary, isAIAvailable, regenerateSummaryOnly } from '../../utils/aiSummarization'
import { verifyPermission } from '../../utils/fileSystem'
import { useSettings } from '../../contexts/SettingsContext'
import { getLanguageInfo } from '../../utils/languages'
import TranslateModal from './TranslateModal'
import SmartCaptionsModal from './SmartCaptionsModal'
import DubModal from './DubModal'

// Format seconds to MM:SS or HH:MM:SS
function formatTime(seconds) {
    if (seconds == null || isNaN(seconds)) return '0:00'
    const totalSecs = Math.max(0, Math.floor(Number(seconds)))
    const h = Math.floor(totalSecs / 3600)
    const m = Math.floor((totalSecs % 3600) / 60)
    const s = Math.floor(totalSecs % 60)
    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    }
    return `${m}:${s.toString().padStart(2, '0')}`
}

function getChunkStart(c) {
    if (!c) return 0
    if (c.start !== undefined && !isNaN(Number(c.start))) return Number(c.start)
    if (Array.isArray(c.timestamp) && c.timestamp.length > 0 && !isNaN(Number(c.timestamp[0]))) return Number(c.timestamp[0])
    if (c.start_time !== undefined && !isNaN(Number(c.start_time))) return Number(c.start_time)
    if (c.startTime !== undefined && !isNaN(Number(c.startTime))) return Number(c.startTime)
    return 0
}

function AISummaryPanel({ video, courseId, course, onSeek, onVideoDataChange, currentTime = 0 }) {
    const { settings, updateSettings } = useSettings()
    const [transcript, setTranscript] = useState(null)
    const [summary, setSummary] = useState(null)
    const [captionChunks, setCaptionChunks] = useState([])
    const [isProcessing, setIsProcessing] = useState(false)
    const [progress, setProgress] = useState({ stage: '', progress: 0, message: '' })
    const [error, setError] = useState(null)
    const [activeTab, setActiveTab] = useState('transcript')
    const [missingCaptions, setMissingCaptions] = useState(false)
    const [languages, setLanguages] = useState({ sourceExists: false, translatedLangs: [], existingLangs: [] })
    const [dubLanguages, setDubLanguages] = useState([])
    const [showTranslateModal, setShowTranslateModal] = useState(false)
    const [showDubModal, setShowDubModal] = useState(false)
    const [smartCaptionData, setSmartCaptionData] = useState(null)
    const [isTracksExpanded, setIsTracksExpanded] = useState(false)
    const fileInputRef = useRef(null)
    const activeVideoIdRef = useRef(null)

    useEffect(() => {
        if (video?.id) {
            activeVideoIdRef.current = video.id
            loadData()
        }
    }, [video?.id])

    async function loadData() {
        if (!video) return
        const currentTargetId = video.id
        setIsProcessing(false)
        setError(null)
        setProgress({ stage: '', progress: 0, message: '' })

        try {
            // Fetch directly from server (single source of truth)
            const res = await fetch(`${SERVER_URL}/api/summaries/${video.id}`)
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const data = await res.json()
            if (activeVideoIdRef.current !== currentTargetId) return

            const summaryContent = data.content || ''
            setSummary(summaryContent)
            setTranscript(null)

            // Check caption languages
            await checkLanguages()
        } catch (err) {
            if (activeVideoIdRef.current !== currentTargetId) return
            console.error('Failed to load summary from server:', err)
            // Fallback to IndexedDB video object if available
            setSummary(video.summary || null)
            setTranscript(video.transcript || null)
            await checkLanguages()
        }
    }

    async function checkLanguages() {
        if (!video) return
        const currentTargetId = video.id
        try {
            const res = await fetch(`${SERVER_URL}/api/transcripts/${video.id}/languages`)
            if (res.ok) {
                const data = await res.json()
                if (activeVideoIdRef.current !== currentTargetId) return
                setLanguages(data)
                
                // If captions exist, load the active one
                const activeLang = video?.primaryTranscript || settings.captionLanguage || 'source'
                loadCaptionChunks(activeLang)
            }
        } catch { }

        // Also check dub languages
        try {
            const res = await fetch(`${SERVER_URL}/api/dub/video/${video.id}/languages`)
            if (res.ok) {
                const langs = await res.json()
                if (activeVideoIdRef.current !== currentTargetId) return
                setDubLanguages(langs)
            }
        } catch { }
    }

    async function loadCaptionChunks(lang) {
        if (!video) return
        const currentTargetId = video.id
        try {
            const res = await fetch(`${SERVER_URL}/api/transcripts/${video.id}/chunks?lang=${lang}`)
            if (res.ok) {
                const chunks = await res.json()
                if (activeVideoIdRef.current !== currentTargetId) return
                setCaptionChunks(chunks || [])
            }
        } catch { }
    }

    async function handleGenerateSummary() {
        if (!video || isProcessing) return
        const targetVideoId = video.id
        activeVideoIdRef.current = targetVideoId

        setIsProcessing(true)
        setError(null)

        try {
            const result = await processVideoForSummary(
                video,
                (progressData) => {
                    if (activeVideoIdRef.current === targetVideoId) {
                        setProgress(progressData)
                    }
                },
                course,
                settings.openRouterApiKey,
                settings.openRouterModel,
                settings.aiDevice
            )

            if (activeVideoIdRef.current !== targetVideoId) return

            setTranscript(result.transcript)
            setSummary(result.summary)
            setMissingCaptions(false)

            // Save summary to server
            await fetch(`${SERVER_URL}/api/summaries/${targetVideoId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: result.summary })
            })

            // Refresh languages
            await checkLanguages()

            onVideoDataChange?.({
                ...video,
                has_summary: 1,
                has_transcript: 1,
                summary: result.summary,
                transcript: result.transcript
            })
        } catch (err) {
            if (activeVideoIdRef.current !== targetVideoId) return
            console.error('AI Processing failed:', err)
            setError(err.message)
        } finally {
            if (activeVideoIdRef.current === targetVideoId) setIsProcessing(false)
        }
    }

    async function handleRegenerateSummary() {
        if (!video || isProcessing) return
        const targetVideoId = video.id
        activeVideoIdRef.current = targetVideoId

        setIsProcessing(true)
        setError(null)

        try {
            let fullText = transcript
            if (!fullText && captionChunks.length > 0) {
                fullText = captionChunks.map(c => c.text).join(' ')
            }

            if (!fullText) {
                throw new Error('No transcript available to summarize.')
            }

            const newSummary = await regenerateSummaryOnly(
                targetVideoId, 
                fullText, 
                (progressData) => {
                    if (activeVideoIdRef.current === targetVideoId) {
                        setProgress(progressData)
                    }
                },
                settings.openRouterApiKey,
                settings.openRouterModel
            )

            if (activeVideoIdRef.current !== targetVideoId) return

            setSummary(newSummary)

            // Save summary to server
            await fetch(`${SERVER_URL}/api/summaries/${targetVideoId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: newSummary })
            })

            onVideoDataChange?.({
                ...video,
                has_summary: 1,
                summary: newSummary
            })
        } catch (err) {
            if (activeVideoIdRef.current !== targetVideoId) return
            console.error('Summary regeneration failed:', err)
            setError(err.message)
        } finally {
            if (activeVideoIdRef.current === targetVideoId) setIsProcessing(false)
        }
    }

    function exportAsMarkdown() {
        if (!video) return
        const content = summary || transcript || ''
        const blob = new Blob([content], { type: 'text/markdown' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${video.title.replace(/[^a-z0-9]/gi, '_')}_summary.md`
        a.click()
        URL.revokeObjectURL(url)
    }

    async function handleFileUpload(e) {
        const file = e.target.files?.[0]
        if (!file || !video?.id) return

        try {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('caption', file)

            const res = await fetch(`${SERVER_URL}/api/transcripts/${video.id}/upload`, {
                method: 'POST',
                body: formData
            })

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}))
                throw new Error(errorData.error || 'Failed to upload captions')
            }
            const data = await res.json()

            const uploadedLang = data.language || 'source'
            updateSettings({ captionLanguage: uploadedLang })

            // Refresh languages and chunks
            await checkLanguages()
            await loadCaptionChunks(uploadedLang)
            onVideoDataChange?.()
            
            if (data.detectedMatches && data.detectedMatches.length > 0) {
                setSmartCaptionData({
                    language: data.language,
                    languageName: data.languageName,
                    matches: data.detectedMatches
                })
            } else {
                window.dispatchEvent(new CustomEvent('tutin:transcript-updated', {
                    detail: { videoId: video.id, lang: uploadedLang }
                }))
            }
        } catch (err) {
            console.error('Caption upload failed:', err)
            setError(err.message || 'Caption upload failed')
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    async function handleSetMaster(lang, origin) {
        if (!video?.id) return
        try {
            const res = await fetch(`${SERVER_URL}/api/transcripts/${video.id}/set-master`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lang, origin })
            })
            if (res.ok) {
                await checkLanguages()
                await loadCaptionChunks(lang)
            }
        } catch (err) {
            console.error('Failed to set master track:', err)
        }
    }

    async function handleMakeSource(lang, origin) {
        if (!video?.id) return
        try {
            const res = await fetch(`${SERVER_URL}/api/transcripts/${video.id}/make-source`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lang, origin })
            })
            if (res.ok) {
                await checkLanguages()
                updateSettings({ captionLanguage: lang })
                await loadCaptionChunks(lang)
                onVideoDataChange?.()
                window.dispatchEvent(new CustomEvent('tutin:transcript-updated', {
                    detail: { videoId: video.id, lang }
                }))
            }
        } catch (err) {
            console.error('Failed to make source transcript:', err)
        }
    }

    if (!video) return null

    // Compute clean, deduplicated available caption tracks
    const availableTracks = []
    
    // Group sources by language
    const sourcesByLang = {}
    ;(languages.subtitleSources || []).forEach(s => {
        if (!sourcesByLang[s.lang]) sourcesByLang[s.lang] = []
        sourcesByLang[s.lang].push(s)
    })

    if (languages.sourceExists) {
        const sourceSources = sourcesByLang['source'] || []
        
        availableTracks.push({
            id: 'source',
            lang: 'source',
            label: 'Source (Original)',
            icon: Captions,
            badge: null,
            sources: sourceSources
        })
    }

    // Add uploaded / existing tracks
    for (const lang of (languages.existingLangs || [])) {
        if (lang === 'source') continue
        if (!availableTracks.some(t => t.lang === lang)) {
            const info = getLanguageInfo(lang)
            availableTracks.push({
                id: `uploaded-${lang}`,
                lang,
                label: info.nativeName ? `${info.nativeName} (${info.name})` : (info.name || lang.toUpperCase()),
                icon: Captions,
                badge: 'Uploaded',
                sources: sourcesByLang[lang] || []
            })
        }
    }

    // Add translated tracks (skip if already in availableTracks)
    for (const lang of (languages.translatedLangs || [])) {
        if (lang === 'source') continue
        if (!availableTracks.some(t => t.lang === lang)) {
            const info = getLanguageInfo(lang)
            availableTracks.push({
                id: `trans-${lang}`,
                lang,
                label: info.nativeName ? `${info.nativeName} (${info.name})` : (info.name || lang.toUpperCase()),
                icon: Globe,
                badge: 'Translated',
                sources: sourcesByLang[lang] || []
            })
        }
    }

    // Compute dub tracks
    const dubTracks = (dubLanguages || []).map(lang => {
        const info = getLanguageInfo(lang)
        return {
            id: `dub-${lang}`,
            lang,
            label: info.nativeName ? `${info.nativeName} (${info.name})` : (info.name || lang.toUpperCase()),
            icon: Volume2,
            badge: 'Dubbed Audio'
        }
    })

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Tab Switcher */}
            <div className="p-4 pb-3 flex-shrink-0">
                <div className="flex bg-light-surface dark:bg-dark-bg rounded-lg p-1">
                    <button
                        onClick={() => setActiveTab('transcript')}
                        className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${activeTab === 'transcript'
                            ? 'bg-white dark:bg-dark-surface shadow-sm'
                            : 'text-light-text-secondary dark:text-dark-text-secondary'
                            }`}
                    >
                        Transcript
                    </button>
                    <button
                        onClick={() => setActiveTab('summary')}
                        className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${activeTab === 'summary'
                            ? 'bg-white dark:bg-dark-surface shadow-sm'
                            : 'text-light-text-secondary dark:text-dark-text-secondary'
                            }`}
                    >
                        Summary
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-h-0 px-4 pb-4 overflow-hidden">
                {/* Error State */}
                {error && (
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg flex items-start gap-3 mb-3 shrink-0">
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
                    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-start gap-3 mb-3 shrink-0">
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

                {/* Main Unified Container */}
                <div className="p-4 bg-light-surface dark:bg-dark-bg rounded-xl flex-1 flex flex-col min-h-0 overflow-hidden border border-light-border dark:border-dark-border/40">
                    {/* Processing State */}
                    {isProcessing ? (
                        <div className="text-center py-8 flex-1 flex flex-col items-center justify-center">
                            <Loader2 className="w-10 h-10 mx-auto mb-4 text-primary-fg animate-spin" />
                            <h3 className="font-medium text-sm mb-2">{progress.message || 'Processing...'}</h3>
                            <div className="w-full max-w-xs mx-auto bg-black/10 dark:bg-white/10 rounded-full h-2 overflow-hidden">
                                <div
                                    className="h-full bg-primary-fg transition-all duration-300"
                                    style={{ width: `${progress.progress * 100}%` }}
                                />
                            </div>
                            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-2">
                                {Math.round(progress.progress * 100)}% - {progress.stage}
                            </p>
                        </div>
                    ) : activeTab === 'summary' ? (
                        summary ? (
                            <>
                                {/* Header bar for Summary tab with content */}
                                <div className="flex items-center justify-between mb-3 shrink-0 pb-2 border-b border-light-border dark:border-dark-border/40">
                                    <div className="flex items-center gap-2">
                                        <Sparkles className="w-4 h-4 text-primary-fg" />
                                        <span className="text-sm font-semibold">
                                            Summary
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {(transcript || captionChunks.length > 0) && (
                                            <button
                                                onClick={handleRegenerateSummary}
                                                className="p-1.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-colors text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text"
                                                title="Regenerate Summary"
                                            >
                                                <RefreshCw className="w-4 h-4" />
                                            </button>
                                        )}
                                        <button
                                            onClick={exportAsMarkdown}
                                            className="p-1.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-colors text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text"
                                            title="Export as Markdown"
                                        >
                                            <Download className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => {
                                                navigator.clipboard.writeText(summary)
                                            }}
                                            className="p-1.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-colors text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text"
                                            title="Copy to clipboard"
                                        >
                                            <Copy className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                <div className="note-content flex-1 overflow-y-auto pr-1" dir="auto">
                                    <ReactMarkdown>{summary}</ReactMarkdown>
                                </div>
                            </>
                        ) : (
                            <div className="text-center py-8 flex-1 flex flex-col items-center justify-center">
                                <Sparkles className="w-8 h-8 mx-auto mb-3 opacity-30 text-primary-fg" />
                                <h3 className="font-medium text-sm mb-1">Generate Summary</h3>
                                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary max-w-xs mx-auto mb-4">
                                    Transcribe and summarize this video using Whisper AI.
                                </p>
                                <button
                                    onClick={() => (transcript || captionChunks.length > 0) ? handleRegenerateSummary() : handleGenerateSummary()}
                                    className="px-4 py-2 rounded-lg font-medium text-xs flex items-center gap-2 mx-auto transition-opacity bg-primary text-primary-content hover:opacity-90 cursor-pointer"
                                >
                                    <Sparkles className="w-3.5 h-3.5" />
                                    Generate Summary
                                </button>
                                <p className="text-[10px] text-light-text-secondary dark:text-dark-text-secondary mt-3">
                                    First run downloads a ~40MB AI model (cached for offline use)
                                </p>
                            </div>
                        )
                    ) : (
                            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                                {/* Action bar inside Transcript tab */}
                                <div className="flex flex-wrap items-center gap-2 mb-3 pb-3 border-b border-light-border dark:border-dark-border shrink-0">
                                    <button
                                        onClick={() => setShowTranslateModal(true)}
                                        className="text-xs bg-light-surface dark:bg-dark-surface hover:bg-black/10 dark:hover:bg-white/10 px-3 py-1.5 rounded-lg flex items-center gap-1.5 border border-light-border dark:border-dark-border font-medium transition-colors"
                                        title="Generate original transcript or translate subtitles"
                                    >
                                        <Captions className="w-3.5 h-3.5 text-primary-fg" />
                                        Transcript
                                    </button>

                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="text-xs bg-light-surface dark:bg-dark-surface hover:bg-black/10 dark:hover:bg-white/10 px-3 py-1.5 rounded-lg flex items-center gap-1.5 border border-light-border dark:border-dark-border transition-colors"
                                    >
                                        <Upload className="w-3 h-3" />
                                        Upload
                                    </button>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".vtt,.srt,.ass,.ssa"
                                        onChange={handleFileUpload}
                                        className="hidden"
                                    />

                                    <button
                                        onClick={() => setShowDubModal(true)}
                                        className="text-xs bg-primary-fg/10 text-primary-fg hover:bg-primary-fg/20 px-3 py-1.5 rounded-lg flex items-center gap-1.5 border border-primary-fg/30 font-medium transition-colors"
                                    >
                                        <Headphones className="w-3 h-3" />
                                        AI Dub
                                    </button>

                                    {(captionChunks.length > 0 || transcript) && (
                                        <button
                                            onClick={() => {
                                                const text = captionChunks.length > 0
                                                    ? captionChunks.map(c => `[${formatTime(getChunkStart(c))}] ${c.text}`).join('\n')
                                                    : transcript
                                                navigator.clipboard.writeText(text)
                                            }}
                                            className="ml-auto p-1.5 hover:bg-black/5 dark:hover:bg-white/10 rounded transition-colors text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text"
                                            title="Copy full transcript"
                                        >
                                            <Copy className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>

                                {/* Available Tracks List (Collapsible Accordion) */}
                                {(availableTracks.length > 0 || dubTracks.length > 0) && (
                                    <div className="rounded-xl border border-light-border dark:border-dark-border/60 bg-black/5 dark:bg-white/5 mb-3 shrink-0 overflow-hidden transition-all duration-200">
                                        <button
                                            type="button"
                                            onClick={() => setIsTracksExpanded(prev => !prev)}
                                            className="w-full flex items-center justify-between p-2.5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer text-left select-none"
                                        >
                                            <div className="flex items-center gap-2 min-w-0">
                                                <Globe className="w-3.5 h-3.5 text-primary-fg shrink-0" />
                                                <span className="text-xs font-semibold text-light-text dark:text-dark-text">Available Tracks</span>
                                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary-fg/10 text-primary-fg font-medium">
                                                    {availableTracks.length + dubTracks.length}
                                                </span>
                                            </div>
                                            
                                            <div className="flex items-center gap-2 shrink-0">
                                                {/* Current active track mini preview pill */}
                                                {(() => {
                                                    const activeTrack = availableTracks.find(t => (!settings.captionLanguage && t.lang === 'source') || settings.captionLanguage === t.lang)
                                                    if (activeTrack) {
                                                        return (
                                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary truncate max-w-[120px]">
                                                                {activeTrack.label}
                                                            </span>
                                                        )
                                                    }
                                                    return null
                                                })()}
                                                <ChevronDown className={`w-3.5 h-3.5 text-light-text-secondary dark:text-dark-text-secondary transition-transform duration-200 ${isTracksExpanded ? 'rotate-180' : ''}`} />
                                            </div>
                                        </button>

                                        {isTracksExpanded && (
                                            <div className="p-2 pt-1 border-t border-light-border/60 dark:border-dark-border/40 space-y-1 max-h-40 overflow-y-auto">
                                                {/* Caption Tracks */}
                                                {availableTracks.map(track => {
                                                    const isActive = (!settings.captionLanguage && track.lang === 'source') || settings.captionLanguage === track.lang
                                                    const hasMultipleSources = track.sources && track.sources.length > 1

                                                    return (
                                                        <div key={track.id} className="flex flex-col gap-0.5">
                                                            <div 
                                                                onClick={() => {
                                                                    updateSettings({ captionLanguage: track.lang })
                                                                    loadCaptionChunks(track.lang)
                                                                }}
                                                                className={`flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors group ${
                                                                    isActive 
                                                                        ? 'bg-primary text-primary-content font-medium shadow-xs' 
                                                                        : 'hover:bg-black/5 dark:hover:bg-white/5 text-light-text-secondary dark:text-dark-text-secondary'
                                                                }`}
                                                            >
                                                                <div className="flex items-center gap-2 truncate mr-2">
                                                                    <span className="truncate">{track.label}</span>
                                                                    {track.sources.some(s => s.is_ai_source) && (
                                                                        <span className="text-[9px] bg-primary-fg/10 text-primary-fg px-1.5 py-0.5 rounded-sm font-semibold">
                                                                            AI Source {course?.language && track.lang !== course.language ? `(${track.lang.toUpperCase()} • Spoken ${course.language.toUpperCase()})` : ''}
                                                                        </span>
                                                                    )}
                                                                    {!track.sources.some(s => s.is_ai_source) && (track.sources.length > 0 || track.badge) && (
                                                                        <span className={`text-[10px] ${isActive ? 'opacity-80' : 'opacity-50'}`}>
                                                                            ({track.sources.length > 0 ? track.sources.map(s => s.origin === 'generated' ? 'Generated' : 'Uploaded').join(' & ') : track.badge})
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center gap-2 shrink-0">
                                                                    {!track.sources.some(s => s.is_ai_source) && (
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation()
                                                                                const masterSrc = track.sources.find(s => s.is_master) || track.sources[0]
                                                                                if (masterSrc) handleMakeSource(track.lang, masterSrc.origin)
                                                                            }}
                                                                            className="opacity-0 group-hover:opacity-100 px-2 py-0.5 rounded bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 transition-all text-[9px] font-medium"
                                                                            title="Copy this file to be used as the original transcript for AI"
                                                                        >
                                                                            Use as AI Source
                                                                        </button>
                                                                    )}
                                                                    {isActive && (
                                                                        <Check className="w-3.5 h-3.5 shrink-0 text-white" />
                                                                    )}
                                                                </div>
                                                            </div>
                                                            
                                                            {/* Sub-sources if multiple exist */}
                                                            {hasMultipleSources && isTracksExpanded && (
                                                                <div className="ml-4 pl-2 border-l border-light-border dark:border-dark-border space-y-0.5 my-1">
                                                                    {track.sources.map((src, i) => (
                                                                        <div 
                                                                            key={i}
                                                                            className="flex items-center justify-between text-[11px] px-2 py-1 rounded cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 text-light-text-secondary dark:text-dark-text-secondary group"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation()
                                                                                if (track.lang === 'source') {
                                                                                    if (!src.is_master) handleSetMaster(track.lang, src.origin)
                                                                                } else {
                                                                                    handleMakeSource(track.lang, src.origin)
                                                                                }
                                                                            }}
                                                                        >
                                                                            <span>Origin: <span className="capitalize font-medium">{src.origin || 'Legacy'}</span></span>
                                                                            <div className="flex gap-2">
                                                                                {track.lang === 'source' ? (
                                                                                    src.is_master ? (
                                                                                        <span className="text-[9px] bg-primary-fg/10 text-primary-fg px-1.5 py-0.5 rounded-sm font-semibold">Master</span>
                                                                                    ) : (
                                                                                        <span className="text-[9px] opacity-0 group-hover:opacity-100 hover:text-primary-fg transition-opacity">Set Master</span>
                                                                                    )
                                                                                ) : (
                                                                                    <span className="text-[9px] opacity-0 group-hover:opacity-100 hover:text-primary-fg transition-opacity" title="Copy this file to be used as the original transcript for AI">Use as AI Source</span>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )
                                                })}

                                                {/* Dub Tracks */}
                                                {dubTracks.map(track => {
                                                    const isPlaying = settings.dubLanguage === track.lang && settings.isDubbingEnabled
                                                    return (
                                                        <div 
                                                            key={track.id}
                                                            onClick={() => {
                                                                if (isPlaying) {
                                                                    updateSettings({ dubLanguage: 'none', isDubbingEnabled: false })
                                                                } else {
                                                                    updateSettings({ dubLanguage: track.lang, isDubbingEnabled: true })
                                                                }
                                                            }}
                                                            className={`flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${
                                                                isPlaying
                                                                    ? 'bg-purple-600 text-white font-medium shadow-xs' 
                                                                    : 'hover:bg-black/5 dark:hover:bg-white/5 text-light-text-secondary dark:text-dark-text-secondary'
                                                            }`}
                                                        >
                                                            <div className="flex items-center gap-2 truncate mr-2">
                                                                <span className="truncate">{track.label}</span>
                                                                <span className={`text-[10px] ${isPlaying ? 'opacity-80' : 'opacity-50'}`}>({track.badge})</span>
                                                            </div>
                                                            {isPlaying && (
                                                                <Check className="w-3.5 h-3.5 shrink-0 text-white" />
                                                            )}
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Caption Chunks List / Full Height Scroll Area */}
                                <div className="flex-1 overflow-y-auto min-h-0 space-y-1.5 pr-1">
                                    {captionChunks.length > 0 ? (
                                        captionChunks.map((chunk, index) => {
                                            const start = getChunkStart(chunk)
                                            return (
                                                <div
                                                    key={index}
                                                    onClick={() => onSeek?.(start)}
                                                    className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer text-sm transition-colors flex gap-2.5 items-start"
                                                >
                                                    <span className="text-primary-fg font-mono text-xs shrink-0 pt-0.5 font-medium">
                                                        {formatTime(start)}
                                                    </span>
                                                    <span className="text-light-text-secondary dark:text-dark-text-secondary text-xs leading-relaxed" dir="auto">
                                                        {chunk.text}
                                                    </span>
                                                </div>
                                            )
                                        })
                                    ) : transcript ? (
                                        <p className="text-sm whitespace-pre-wrap" dir="auto">{transcript}</p>
                                    ) : (
                                        <div className="text-center py-10 text-light-text-secondary dark:text-dark-text-secondary space-y-3 flex-1 flex flex-col items-center justify-center">
                                            <Captions className="w-10 h-10 mx-auto opacity-30 text-primary-fg" />
                                            <div>
                                                <p className="text-sm font-medium text-light-text dark:text-dark-text">No captions available yet</p>
                                                <p className="text-xs opacity-75 mt-0.5">Generate automatically with Whisper AI or upload an existing file.</p>
                                            </div>
                                            <div className="flex items-center justify-center gap-2 pt-1">
                                                <button
                                                    onClick={() => setShowTranslateModal(true)}
                                                    className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-content hover:opacity-90 flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                                                >
                                                    <Sparkles className="w-3.5 h-3.5" />
                                                    Generate Transcript
                                                </button>
                                                <button
                                                    onClick={() => fileInputRef.current?.click()}
                                                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-light-surface dark:bg-dark-surface hover:bg-black/5 dark:hover:bg-white/5 border border-light-border dark:border-dark-border flex items-center gap-1.5 transition-colors cursor-pointer"
                                                >
                                                    <Upload className="w-3.5 h-3.5" />
                                                    Upload
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                </div>
            </div>

            {/* Translate Modal */}
            {showTranslateModal && (
                <TranslateModal
                    isOpen={showTranslateModal}
                    onClose={() => setShowTranslateModal(false)}
                    video={video}
                    course={course}
                    chunkCount={captionChunks.length}
                    onSuccess={() => checkLanguages()}
                />
            )}

            {/* Smart Captions Modal */}
            {smartCaptionData && (
                <SmartCaptionsModal
                    isOpen={Boolean(smartCaptionData)}
                    onClose={() => setSmartCaptionData(null)}
                    language={smartCaptionData?.language}
                    languageName={smartCaptionData?.languageName}
                    matches={smartCaptionData?.matches}
                    onBatchImported={() => {
                        setSmartCaptionData(null)
                        checkLanguages()
                        onVideoDataChange?.()
                    }}
                />
            )}

            {/* AI Dub Modal */}
            {showDubModal && (
                <DubModal
                    isOpen={showDubModal}
                    onClose={() => setShowDubModal(false)}
                    video={video}
                    course={course}
                    onSuccess={(lang) => {
                        checkLanguages()
                        if (lang && video?.id) {
                            window.dispatchEvent(new CustomEvent('tutin:dub-updated', {
                                detail: { videoId: video.id, lang }
                            }))
                        }
                    }}
                />
            )}
        </div>
    )
}

export default AISummaryPanel
