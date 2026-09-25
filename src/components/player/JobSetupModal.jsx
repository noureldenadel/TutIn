import { useState, useEffect } from 'react'
import { X, Headphones, Globe, Lock, AlertTriangle } from 'lucide-react'
import { SUPPORTED_LANGUAGES, getLanguageInfo } from '../../utils/languages'
import { SERVER_URL } from '../../utils/api'

// Languages that require OpenRouter API key
const REQUIRES_OPENROUTER = new Set(['ar-eg', 'ar-sa'])

export function JobSetupModal({ isOpen, onClose, videos, course, type, onStart }) {
    const [hasOpenRouterKey, setHasOpenRouterKey] = useState(false)
    const sourceLang = (course?.language || 'en').toLowerCase().trim()
    const defaultLang = type === 'translate' ? sourceLang : (sourceLang === 'ar' ? 'es' : 'ar')
    const [targetLang, setTargetLang] = useState(defaultLang)

    const isVideoLocal = (v) => {
        if (!v) return false
        if (v.youtubeId || v.driveFileId) return false
        if (v.url && (v.url.includes('youtube.com') || v.url.includes('youtu.be') || v.url.includes('drive.google.com'))) return false
        return !!(v.filePath || v.fileName)
    }
    const nonLocalVideos = videos.filter(v => !isVideoLocal(v))
    const allNonLocal = nonLocalVideos.length === videos.length && videos.length > 0

    useEffect(() => {
        if (!isOpen) return
        setTargetLang(type === 'translate' ? sourceLang : (sourceLang === 'ar' ? 'es' : 'ar'))
        fetch(`${SERVER_URL}/api/settings/openrouter-status`)
            .then(r => r.json())
            .then(d => setHasOpenRouterKey(!!d.hasKey))
            .catch(() => setHasOpenRouterKey(false))
    }, [isOpen, type, sourceLang])

    if (!isOpen) return null

    const sourceInfo = getLanguageInfo(sourceLang)

    const availableTargets = SUPPORTED_LANGUAGES.filter(l => l.code !== sourceLang)

    // If the currently selected lang requires OpenRouter but key is missing, reset
    const selectedLangInfo = SUPPORTED_LANGUAGES.find(l => l.code === targetLang)
    const isSelectedDisabled = REQUIRES_OPENROUTER.has(targetLang) && !hasOpenRouterKey

    // Group languages: regular + dialect (grayed if no key)
    const regularLangs = availableTargets.filter(l => !l.requiresOpenRouter)
    const dialectLangs = availableTargets.filter(l => l.requiresOpenRouter)

    // Check if target subtitles already exist across the selected videos
    let readyCount = 0;
    videos.forEach(v => {
        try {
            const sources = v.subtitleSources || [];
            if (sources.some(s => s.lang === targetLang)) {
                readyCount++;
            }
        } catch (e) { }
    });
    
    let targetSubtitlesStatus = 'Will auto-generate';
    let targetSubtitlesClass = 'bg-amber-500/20 text-amber-600 dark:text-amber-400';
    if (readyCount === videos.length && videos.length > 0) {
        targetSubtitlesStatus = 'Ready';
        targetSubtitlesClass = 'bg-green-500/20 text-green-600 dark:text-green-400';
    } else if (readyCount > 0) {
        targetSubtitlesStatus = `Mixed (${readyCount} ready)`;
        targetSubtitlesClass = 'bg-blue-500/20 text-blue-600 dark:text-blue-400';
    }

    const isTargetSource = targetLang === sourceLang || targetLang === 'source'

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-dark-surface w-full max-w-md rounded-xl shadow-2xl overflow-hidden border border-light-border dark:border-dark-border flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        {type === 'dub' ? <Headphones className="w-5 h-5 text-purple-500" /> : <Globe className="w-5 h-5 text-blue-500" />}
                        Start Bulk {type === 'dub' ? 'Dub' : (isTargetSource ? 'Transcription' : 'Translate & Transcribe')} ({videos.length} videos)
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-light-bg dark:hover:bg-dark-bg rounded-lg transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <div className="p-6">
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium mb-2">Source Language</label>
                            <div className="p-3 bg-light-bg dark:bg-dark-bg rounded-lg border border-light-border dark:border-dark-border text-sm flex items-center gap-2">
                                <span className="text-lg">{sourceInfo.flag}</span>
                                <span>{sourceInfo.name}</span>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-2">
                                {type === 'dub' ? 'Target Audio Language' : 'Target Language'}
                            </label>
                            <select
                                value={isSelectedDisabled ? defaultLang : targetLang}
                                onChange={(e) => setTargetLang(e.target.value)}
                                className="w-full p-3 bg-white dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-lg outline-none focus:ring-2 focus:ring-primary/50"
                            >
                                {/* If translating/transcribing, allow transcribing original spoken audio */}
                                {type === 'translate' && (
                                    <optgroup label="Original Audio (Speech-to-Text)">
                                        <option value={sourceLang}>
                                            ✨ {sourceInfo.flag} {sourceInfo.name} ({sourceInfo.nativeName}) — Transcribe Original Audio (Whisper AI)
                                        </option>
                                    </optgroup>
                                )}

                                {/* Regular languages */}
                                <optgroup label={type === 'translate' ? "Translate Subtitles (Standard · Offline)" : "Standard (Local · Offline)"}>
                                    {regularLangs.map(l => (
                                        <option key={l.code} value={l.code}>{l.flag} {l.name} ({l.nativeName})</option>
                                    ))}
                                </optgroup>

                                {/* Dialect languages — group header changes based on key availability */}
                                <optgroup label={hasOpenRouterKey ? 'Arabic Dialects (via OpenRouter)' : 'Arabic Dialects (OpenRouter API key required)'}>
                                    {dialectLangs.map(l => {
                                        const disabled = !hasOpenRouterKey
                                        return (
                                            <option
                                                key={l.code}
                                                value={l.code}
                                                disabled={disabled}
                                                title={disabled ? 'Requires OpenRouter API key — add it in Settings to enable' : undefined}
                                            >
                                                {disabled ? '🔒 ' : ''}{l.name} ({l.nativeName}){disabled ? ' — needs API key' : ''}
                                            </option>
                                        )
                                    })}
                                </optgroup>
                            </select>

                            {/* API key missing hint */}
                            {!hasOpenRouterKey && (
                                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                                    <Lock className="w-3 h-3 shrink-0" />
                                    Egyptian &amp; Gulf Arabic require an OpenRouter API key. Add it in <strong>Settings → OpenRouter API Key</strong>.
                                </p>
                            )}

                            {/* Feature Highlights & Pipeline Status */}
                            {type === 'dub' && (
                                <div className="mt-6 bg-light-bg dark:bg-dark-bg p-4 rounded-lg border border-light-border dark:border-dark-border space-y-2.5 text-sm">
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
                                        <span className={`text-xs px-2 py-0.5 rounded ${targetSubtitlesClass}`}>
                                            {targetSubtitlesStatus}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="opacity-70">Timeline Fit:</span>
                                        <span className="font-medium">Adaptive atempo compression</span>
                                    </div>
                                </div>
                            )}

                            {type === 'translate' && (
                                <div className="mt-6 bg-light-bg dark:bg-dark-bg p-4 rounded-lg border border-light-border dark:border-dark-border space-y-2.5 text-sm">
                                    <div className="flex justify-between items-center">
                                        <span className="opacity-70">Source Audio:</span>
                                        <span className="font-semibold text-primary-fg">
                                            <span>{sourceInfo.nativeName} ({sourceInfo.name})</span>
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="opacity-70">Transcription:</span>
                                        <span className="font-medium text-primary-fg">Whisper AI ({isTargetSource ? 'Original Transcript' : 'Auto-transcribed if missing'})</span>
                                    </div>
                                    {!isTargetSource && (
                                        <div className="flex justify-between items-center">
                                            <span className="opacity-70">Translation:</span>
                                            <span className="font-medium">Smart LLM / NLLB-200</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Non-local video warnings for Dubbing */}
                            {type === 'dub' && allNonLocal && (
                                <div className="mt-4 p-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-xs flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 shrink-0" />
                                    <span>Selected videos are online/cloud streams. Local AI Dubbing requires local video files on disk.</span>
                                </div>
                            )}
                            {type === 'dub' && nonLocalVideos.length > 0 && !allNonLocal && (
                                <div className="mt-4 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-600 dark:text-amber-400 text-xs flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 shrink-0" />
                                    <span>{nonLocalVideos.length} online video(s) will be skipped as dubbing requires local media files.</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-light-border dark:border-dark-border flex items-center justify-end gap-3 bg-light-surface dark:bg-dark-bg/50">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium hover:bg-light-bg dark:hover:bg-dark-bg rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        disabled={isSelectedDisabled || (type === 'dub' && allNonLocal)}
                        onClick={() => {
                            if (isSelectedDisabled || (type === 'dub' && allNonLocal)) return
                            onStart(isSelectedDisabled ? defaultLang : targetLang)
                            onClose()
                        }}
                        className={`px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
                            (isSelectedDisabled || (type === 'dub' && allNonLocal))
                                ? 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed opacity-60'
                                : (type === 'dub' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-blue-600 hover:bg-blue-700')
                        }`}
                    >
                        Start Background Jobs
                    </button>
                </div>
            </div>
        </div>
    )
}

