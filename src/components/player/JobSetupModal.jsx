import { useState, useEffect } from 'react'
import { X, Headphones, Globe, Lock } from 'lucide-react'
import { SUPPORTED_LANGUAGES, getLanguageInfo } from '../../utils/languages'
import { SERVER_URL } from '../../utils/api'

// Languages that require OpenRouter API key
const REQUIRES_OPENROUTER = new Set(['ar-eg', 'ar-sa'])

export function JobSetupModal({ isOpen, onClose, videos, course, type, onStart }) {
    const [hasOpenRouterKey, setHasOpenRouterKey] = useState(false)

    useEffect(() => {
        if (!isOpen) return
        fetch(`${SERVER_URL}/api/settings/openrouter-status`)
            .then(r => r.json())
            .then(d => setHasOpenRouterKey(!!d.hasKey))
            .catch(() => setHasOpenRouterKey(false))
    }, [isOpen])

    if (!isOpen) return null

    const sourceLang = (course?.language || 'en').toLowerCase().trim()
    const sourceInfo = getLanguageInfo(sourceLang)

    const availableTargets = SUPPORTED_LANGUAGES.filter(l => l.code !== sourceLang)

    const defaultLang = sourceLang === 'ar' ? 'es' : 'ar'
    const [targetLang, setTargetLang] = useState(defaultLang)

    // If the currently selected lang requires OpenRouter but key is missing, reset
    const selectedLangInfo = SUPPORTED_LANGUAGES.find(l => l.code === targetLang)
    const isSelectedDisabled = REQUIRES_OPENROUTER.has(targetLang) && !hasOpenRouterKey

    // Group languages: regular + dialect (grayed if no key)
    const regularLangs = availableTargets.filter(l => !l.requiresOpenRouter)
    const dialectLangs = availableTargets.filter(l => l.requiresOpenRouter)

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-dark-surface w-full max-w-md rounded-xl shadow-2xl overflow-hidden border border-light-border dark:border-dark-border flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        {type === 'dub' ? <Headphones className="w-5 h-5 text-purple-500" /> : <Globe className="w-5 h-5 text-blue-500" />}
                        Start Bulk {type === 'dub' ? 'Dub' : 'Translate'} ({videos.length} videos)
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
                            <label className="block text-sm font-medium mb-2">Target Language</label>
                            <select
                                value={isSelectedDisabled ? defaultLang : targetLang}
                                onChange={(e) => setTargetLang(e.target.value)}
                                className="w-full p-3 bg-white dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-lg outline-none focus:ring-2 focus:ring-primary/50"
                            >
                                {/* Regular languages */}
                                <optgroup label="Standard (Local · Offline)">
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
                        onClick={() => {
                            onStart(isSelectedDisabled ? defaultLang : targetLang)
                            onClose()
                        }}
                        className={`px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${type === 'dub' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                    >
                        Start Background Jobs
                    </button>
                </div>
            </div>
        </div>
    )
}

