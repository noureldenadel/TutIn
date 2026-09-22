import { useState } from 'react'
import { Captions, Check, X, Sparkles, Loader2 } from 'lucide-react'
import { SERVER_URL } from '../../utils/api'

export default function SmartCaptionsModal({
    isOpen,
    onClose,
    language,
    languageName,
    matches = [],
    onBatchImported
}) {
    const [isSubmitting, setIsSubmitting] = useState(false)

    if (!isOpen || !matches || matches.length === 0) return null

    async function handleApplyAll() {
        try {
            setIsSubmitting(true)
            const res = await fetch(`${SERVER_URL}/api/transcripts/batch-apply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ matches })
            })
            const data = await res.json()
            if (data.success) {
                // Dispatch global update event
                window.dispatchEvent(new CustomEvent('tutin:transcript-updated', {
                    detail: {
                        lang: language,
                        updatedVideoIds: data.updatedVideoIds || matches.map(m => m.videoId)
                    }
                }))
                onBatchImported?.(data.count || matches.length)
                onClose()
            }
        } catch (err) {
            console.error('Failed to batch import captions:', err)
        } finally {
            setIsSubmitting(false)
        }
    }

    const displayLang = languageName || language?.toUpperCase() || 'Captions'

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="w-full max-w-lg bg-white dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                
                {/* Header */}
                <div className="px-5 py-4 border-b border-light-border dark:border-dark-border flex items-center justify-between bg-light-surface/50 dark:bg-dark-bg/50">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-primary/15 text-primary-fg flex items-center justify-center">
                            <Captions className="w-4 h-4" />
                        </div>
                        <div>
                            <h3 className="text-base font-semibold text-light-text dark:text-dark-text flex items-center gap-2">
                                Smart Caption Detection
                                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary-fg font-medium border border-primary/20">
                                    {displayLang}
                                </span>
                            </h3>
                            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                                Found matching {displayLang} captions for other videos
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="p-1 rounded-md text-light-text-secondary hover:text-light-text dark:text-dark-text-secondary dark:hover:text-dark-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Body / Info */}
                <div className="p-5 overflow-y-auto space-y-4 flex-1">
                    <div className="p-3 bg-primary/5 dark:bg-primary/10 border border-primary/20 rounded-lg text-xs text-light-text-secondary dark:text-dark-text-secondary leading-relaxed">
                        <p className="font-medium text-light-text dark:text-dark-text mb-1 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-primary-fg shrink-0" />
                            <span>Same-Language Smart Matching</span>
                        </p>
                        We detected <strong className="text-primary-fg font-semibold">{matches.length} other {displayLang}</strong> ({language}) subtitle files for videos in this course. Subtitles in other languages in the folder were safely ignored.
                    </div>

                    {/* Detected Matches List */}
                    <div>
                        <div className="flex items-center justify-between text-xs font-semibold text-light-text-secondary dark:text-dark-text-secondary mb-2 px-1">
                            <span>Detected Course Captions ({matches.length})</span>
                            <span className="uppercase text-[10px] tracking-wider text-primary-fg">Language: {language}</span>
                        </div>

                        <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                            {matches.map((match, idx) => (
                                <div
                                    key={match.videoId || idx}
                                    className="p-2.5 rounded-lg border border-light-border dark:border-dark-border bg-light-surface/40 dark:bg-dark-bg/40 flex items-center justify-between gap-3 text-xs"
                                >
                                    <div className="min-w-0 flex-1">
                                        <p className="font-medium text-light-text dark:text-dark-text truncate">
                                            {match.videoTitle}
                                        </p>
                                        <p className="text-[11px] text-light-text-secondary dark:text-dark-text-secondary truncate font-mono mt-0.5 opacity-80">
                                            {match.fileName}
                                        </p>
                                    </div>
                                    <span className="shrink-0 px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/5 border border-light-border dark:border-dark-border text-[10px] font-mono uppercase text-light-text-secondary dark:text-dark-text-secondary">
                                        {match.format || 'SRT'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-5 py-3 border-t border-light-border dark:border-dark-border flex items-center justify-end gap-2 bg-light-surface/30 dark:bg-dark-bg/30">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="px-3.5 py-2 rounded-lg text-xs font-medium text-light-text-secondary hover:text-light-text dark:text-dark-text-secondary dark:hover:text-dark-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                    >
                        Skip (Only Current Video)
                    </button>
                    <button
                        type="button"
                        onClick={handleApplyAll}
                        disabled={isSubmitting}
                        className="px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-content hover:bg-primary-hover transition-all flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>Importing...</span>
                            </>
                        ) : (
                            <>
                                <Check className="w-3.5 h-3.5" />
                                <span>Import All ({matches.length})</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}
