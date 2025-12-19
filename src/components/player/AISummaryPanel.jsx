import { useState, useEffect } from 'react'
import {
    FileText, Sparkles, Loader2, AlertCircle,
    Download, Copy, RefreshCw, Upload, FolderOpen
} from 'lucide-react'
import { getVideo, updateVideo } from '../../utils/db'
import { processVideoForSummary, isAIAvailable } from '../../utils/aiSummarization'
import { verifyPermission } from '../../utils/fileSystem'

function AISummaryPanel({ video, courseId }) {
    const [transcript, setTranscript] = useState(null)
    const [summary, setSummary] = useState(null)
    const [isProcessing, setIsProcessing] = useState(false)
    const [progress, setProgress] = useState({ stage: '', progress: 0, message: '' })
    const [error, setError] = useState(null)
    const [activeTab, setActiveTab] = useState('summary')
    const [manualFile, setManualFile] = useState(null)

    // Load existing data when video changes
    useEffect(() => {
        if (video?.id) {
            loadExistingData()
        } else {
            setTranscript(null)
            setSummary(null)
        }
    }, [video?.id])

    async function loadExistingData() {
        try {
            const videoData = await getVideo(video.id)
            setTranscript(videoData?.transcript || null)
            setSummary(videoData?.summary || null)
        } catch (err) {
            console.error('Failed to load AI data:', err)
        }
    }

    // Handle manual file selection for browsers without File System Access API
    function handleManualFilePick(e) {
        const file = e.target.files?.[0]
        if (file) {
            setManualFile(file)
            setError(null)
        }
    }

    async function handleGenerateSummary(fileOverride = null) {
        if (!isAIAvailable()) {
            setError('AI features require a modern browser with WebAssembly support.')
            return
        }

        // Get file source - try fileHandle first, then manual file, then prompt
        let fileSource = fileOverride || manualFile || video?.fileHandle

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
                setProgress
            )

            setTranscript(result.transcript)
            setSummary(result.summary)
            setManualFile(null) // Clear manual file after success
        } catch (err) {
            console.error('AI processing failed:', err)
            setError(err.message)
        } finally {
            setIsProcessing(false)
        }
    }

    function copyToClipboard(text) {
        navigator.clipboard.writeText(text)
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

    if (!video) return null

    const hasFileAccess = !!video?.fileHandle
    const hasManualFile = !!manualFile
    const canGenerate = hasFileAccess || hasManualFile

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-light-border dark:border-dark-border">
                <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-primary" />
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
                {/* Generate Button */}
                {!transcript && !summary && !isProcessing && (
                    <div className="text-center py-8">
                        <Sparkles className="w-12 h-12 mx-auto mb-4 text-primary/50" />
                        <h3 className="font-medium mb-2">Generate AI Summary</h3>
                        <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mb-4">
                            Transcribe and summarize this video using Whisper AI.
                        </p>

                        {/* File picker for browsers without File System Access API */}
                        {!hasFileAccess && (
                            <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-left">
                                <p className="text-sm text-yellow-700 dark:text-yellow-400 mb-2">
                                    📁 Select the video file to transcribe:
                                </p>
                                <label className="inline-flex items-center gap-2 px-3 py-2 bg-white dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-lg cursor-pointer hover:bg-light-surface dark:hover:bg-dark-bg transition-colors">
                                    <Upload className="w-4 h-4" />
                                    <span className="text-sm">{manualFile ? manualFile.name : 'Choose Video File'}</span>
                                    <input
                                        type="file"
                                        accept="video/*,audio/*"
                                        onChange={handleManualFilePick}
                                        className="hidden"
                                    />
                                </label>
                                {manualFile && (
                                    <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                                        ✓ Ready to transcribe
                                    </p>
                                )}
                            </div>
                        )}

                        <button
                            onClick={() => handleGenerateSummary()}
                            disabled={!canGenerate}
                            className={`px-4 py-2 rounded-lg flex items-center gap-2 mx-auto transition-colors ${canGenerate
                                    ? 'bg-primary text-white hover:bg-primary/90'
                                    : 'bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed'
                                }`}
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
                        <Loader2 className="w-12 h-12 mx-auto mb-4 text-primary animate-spin" />
                        <h3 className="font-medium mb-2">{progress.message || 'Processing...'}</h3>
                        <div className="w-full max-w-xs mx-auto bg-light-surface dark:bg-dark-bg rounded-full h-2 overflow-hidden">
                            <div
                                className="h-full bg-primary transition-all duration-300"
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
                            {hasFileAccess && (
                                <button
                                    onClick={handleGenerateSummary}
                                    className="mt-2 text-sm underline flex items-center gap-1"
                                >
                                    <RefreshCw className="w-3 h-3" />
                                    Try Again
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* Results */}
                {(transcript || summary) && !isProcessing && (
                    <>
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

                        {/* Content Display */}
                        <div className="p-4 bg-light-surface dark:bg-dark-bg rounded-lg">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    {activeTab === 'summary' ? (
                                        <Sparkles className="w-4 h-4 text-primary" />
                                    ) : (
                                        <FileText className="w-4 h-4 text-primary" />
                                    )}
                                    <span className="text-sm font-medium">
                                        {activeTab === 'summary' ? 'AI Summary' : 'Full Transcript'}
                                    </span>
                                </div>
                                <button
                                    onClick={() => copyToClipboard(activeTab === 'summary' ? summary : transcript)}
                                    className="p-1.5 hover:bg-gray-100 dark:hover:bg-dark-surface rounded"
                                    title="Copy"
                                >
                                    <Copy className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="text-sm whitespace-pre-wrap max-h-96 overflow-y-auto prose prose-sm dark:prose-invert">
                                {activeTab === 'summary' ? (
                                    summary || <span className="italic opacity-60">No summary generated yet.</span>
                                ) : (
                                    transcript || <span className="italic opacity-60">No transcript generated yet.</span>
                                )}
                            </div>
                        </div>

                        {/* Regenerate Button */}
                        {hasFileAccess && (
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
        </div>
    )
}

export default AISummaryPanel
