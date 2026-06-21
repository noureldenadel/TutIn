import { useState, useRef } from 'react'
import {
    X, Sun, Moon, Monitor, Palette, Layout, Type,
    Play, SkipForward, FastForward, Check, Download, Upload, Database, AlertTriangle, KeyRound, Eye, EyeOff, ExternalLink, Sparkles, Clock, PictureInPicture
} from 'lucide-react'
import { useSettings } from '../../contexts/SettingsContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useNotification } from '../../contexts/NotificationContext'
import { exportAllData, clearAllData, importData, recalculateAllCoursesProgress, detectAllDurations } from '../../utils/db'

const accentColors = [
    { name: 'Classic / Glass', value: 'classic' },
    { name: 'Blue', value: '#3B82F6' },
    { name: 'Purple', value: '#8B5CF6' },
    { name: 'Pink', value: '#EC4899' },
    { name: 'Red', value: '#EF4444' },
    { name: 'Orange', value: '#F97316' },
    { name: 'Green', value: '#22C55E' },
    { name: 'Teal', value: '#14B8A6' },
    { name: 'Cyan', value: '#06B6D4' }
]


const completionThresholds = [
    { label: '90%', value: 90 },
    { label: '95%', value: 95 },
    { label: '100%', value: 100 }
]

function SettingsModal({ isOpen, onClose }) {
    const { settings, updateSettings, resetSettings } = useSettings()
    const { theme, setTheme } = useTheme()
    const [activeTab, setActiveTab] = useState('appearance')
    const [showApiKeys, setShowApiKeys] = useState({ youtube: false, openRouter: false, googleDrive: false })
    const [detectingDurations, setDetectingDurations] = useState(false)
    const [durationResult, setDurationResult] = useState(null)
    const { showNotification } = useNotification()

    if (!isOpen) return null

    const tabs = [
        { id: 'appearance', label: 'Appearance', icon: Palette },
        { id: 'playback', label: 'Playback', icon: Play },
        { id: 'shortcuts', label: 'Shortcuts', icon: FastForward },
        { id: 'ai_keys', label: 'AI & API Keys', icon: Sparkles },
        { id: 'data', label: 'Data', icon: Database }
    ]

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-white dark:bg-dark-surface rounded-xl shadow-2xl w-[672px] h-[600px] flex flex-col animate-scale-in overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border">
                    <h2 className="text-xl font-semibold text-light-text-primary dark:text-dark-text-primary">
                        Settings
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-light-surface dark:hover:bg-dark-bg rounded-lg transition-colors"
                        aria-label="Close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Tabs Sidebar */}
                    <div className="w-48 border-r border-light-border dark:border-dark-border p-2 flex-shrink-0">
                        {tabs.map(tab => {
                            const Icon = tab.icon
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`
                    w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm
                    transition-colors mb-1
                    ${activeTab === tab.id
                                            ? 'bg-primary/10 dark:bg-primary-fg/10 text-primary-fg font-medium'
                                            : 'hover:bg-gray-100 dark:hover:bg-white/10 text-light-text-secondary dark:text-dark-text-secondary'
                                        }
                   `}
                                >
                                    <Icon className="w-4 h-4" />
                                    {tab.label}
                                </button>
                            )
                        })}
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-6">
                        {/* Appearance Tab */}
                        {activeTab === 'appearance' && (
                            <div className="space-y-6">
                                {/* Theme */}
                                <div>
                                    <label className="block text-sm font-medium mb-3">Theme</label>
                                    <div className="flex gap-3">
                                        {[
                                            { value: 'light', label: 'Light', icon: Sun },
                                            { value: 'dark', label: 'Dark', icon: Moon },
                                            { value: 'auto', label: 'System', icon: Monitor }
                                        ].map(option => {
                                            const Icon = option.icon
                                            const isSelected = theme === option.value ||
                                                (option.value === 'auto' && settings.theme === 'auto')
                                            return (
                                                <button
                                                    key={option.value}
                                                    onClick={() => {
                                                        if (option.value === 'auto') {
                                                            updateSettings({ theme: 'auto' })
                                                            // Let system preference take over
                                                            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
                                                            setTheme(prefersDark ? 'dark' : 'light')
                                                        } else {
                                                            updateSettings({ theme: option.value })
                                                            setTheme(option.value)
                                                        }
                                                    }}
                                                    className={`
                             flex-1 flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all
                             ${isSelected
                                                             ? 'border-primary-fg/40 bg-primary-fg/5'
                                                             : 'border-light-border dark:border-dark-border hover:border-primary-fg/30'
                                                         }
                           `}
                                                >
                                                    <Icon className={`w-5 h-5 ${isSelected ? 'text-primary-fg' : ''}`} />
                                                    <span className="text-sm">{option.label}</span>
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>

                                {/* Accent Color */}
                                <div>
                                    <label className="block text-sm font-medium mb-3">Accent Color</label>
                                    <div className="flex flex-wrap gap-2">
                                        {accentColors.map(color => (
                                            <button
                                                key={color.value}
                                                onClick={() => updateSettings({ accentColor: color.value })}
                                                className={`
                           w-10 h-10 rounded-full transition-all flex items-center justify-center
                           ${settings.accentColor === color.value
                                                         ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-offset-dark-surface'
                                                         : 'hover:scale-110'
                                                     }
                         `}
                                                style={{ backgroundColor: color.value === 'classic' ? '#374151' : color.value }}
                                                title={color.name}
                                            >
                                                {settings.accentColor === color.value && (
                                                    <Check className="w-5 h-5 text-white" />
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Playback Tab */}
                        {activeTab === 'playback' && (
                            <div className="space-y-6">

                                {/* Resume Playback */}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="font-medium text-sm">Resume Playback</div>
                                        <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                                            Continue from where you left off
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => updateSettings({ resumePlayback: !settings.resumePlayback })}
                                        className={`
                       w-12 h-6 rounded-full transition-colors relative
                       ${settings.resumePlayback ? 'bg-primary dark:bg-primary-fg/30 text-primary-content' : 'bg-gray-300 dark:bg-gray-600'}
                     `}
                                    >
                                        <div className={`
                       absolute top-1 w-4 h-4 rounded-full bg-white transition-transform
                       ${settings.resumePlayback ? 'translate-x-7' : 'translate-x-1'}
                     `} />
                                    </button>
                                </div>

                                {/* Auto-mark Complete Threshold */}
                                <div>
                                    <label className="block text-sm font-medium mb-3">
                                        Mark Complete When Watched
                                    </label>
                                    <div className="flex gap-3">
                                        {completionThresholds.map(option => (
                                            <button
                                                key={option.value}
                                                onClick={() => updateSettings({ autoMarkCompleteAt: option.value })}
                                                className={`
                           flex-1 p-3 rounded-lg border-2 transition-all text-center
                           ${settings.autoMarkCompleteAt === option.value
                                                         ? 'border-primary-fg/40 bg-primary-fg/5'
                                                         : 'border-light-border dark:border-dark-border hover:border-primary-fg/30'
                                                     }
                         `}
                                            >
                                                <span className="text-sm font-medium">{option.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Progress Calculation Mode */}
                                <div>
                                    <label className="block text-sm font-medium mb-3">
                                        Progress Calculation
                                    </label>
                                    <div className="space-y-2">
                                        {[
                                            { value: 'videos', label: 'By Videos Completed', description: 'Count of completed videos ÷ total videos' },
                                            { value: 'duration', label: 'By Time Watched', description: 'Total time watched ÷ total course duration' }
                                        ].map(option => (
                                            <button
                                                key={option.value}
                                                onClick={async () => {
                                                    updateSettings({ progressCalculationMode: option.value })
                                                    // Recalculate all courses with the new mode
                                                    await recalculateAllCoursesProgress(option.value)
                                                }}
                                                className={`
                           w-full flex items-center justify-between p-3 rounded-lg border-2 transition-all text-left
                           ${settings.progressCalculationMode === option.value
                                                         ? 'border-primary-fg/40 bg-primary-fg/5'
                                                         : 'border-light-border dark:border-dark-border hover:border-primary-fg/30'
                                                     }
                         `}
                                            >
                                                <div>
                                                    <div className="font-medium text-sm">{option.label}</div>
                                                    <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                                                        {option.description}
                                                    </div>
                                                </div>
                                                {settings.progressCalculationMode === option.value && (
                                                    <Check className="w-5 h-5 text-primary-fg" />
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Shortcuts Tab */}
                        {activeTab === 'shortcuts' && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <div className="font-medium text-sm">Enable Keyboard Shortcuts</div>
                                        <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                                            Use keyboard to control video playback
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => updateSettings({ keyboardShortcuts: !settings.keyboardShortcuts })}
                                        className={`
                       w-12 h-6 rounded-full transition-colors relative
                       ${settings.keyboardShortcuts ? 'bg-primary dark:bg-primary-fg/30 text-primary-content' : 'bg-gray-300 dark:bg-gray-600'}
                     `}
                                    >
                                        <div className={`
                       absolute top-1 w-4 h-4 rounded-full bg-white transition-transform
                       ${settings.keyboardShortcuts ? 'translate-x-7' : 'translate-x-1'}
                     `} />
                                    </button>
                                </div>

                                <div className="border border-light-border dark:border-dark-border rounded-lg overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead className="bg-light-surface dark:bg-dark-bg">
                                            <tr>
                                                <th className="text-left p-3 font-medium">Action</th>
                                                <th className="text-left p-3 font-medium">Shortcut</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {[
                                                { action: 'Play / Pause', key: 'Space or K' },
                                                { action: 'Seek Back 5s', key: '← Arrow' },
                                                { action: 'Seek Forward 5s', key: '→ Arrow' },
                                                { action: 'Seek Back 10s', key: 'J' },
                                                { action: 'Seek Forward 10s', key: 'L' },
                                                { action: 'Jump to 0%-90%', key: '0-9' },
                                                { action: 'Volume Up', key: '↑ Arrow' },
                                                { action: 'Volume Down', key: '↓ Arrow' },
                                                { action: 'Mute / Unmute', key: 'M' },
                                                { action: 'Decrease Speed', key: '< or ,' },
                                                { action: 'Increase Speed', key: '> or .' },
                                                { action: 'Toggle Auto-play', key: 'A' },
                                                { action: 'Fullscreen', key: 'F' },
                                                { action: 'Picture-in-Picture', key: 'P' },
                                                { action: 'Next Video', key: 'Shift + N' }
                                            ].map((shortcut, i) => (
                                                <tr key={i} className="border-t border-light-border dark:border-dark-border">
                                                    <td className="p-3">{shortcut.action}</td>
                                                    <td className="p-3">
                                                        <kbd className="px-2 py-1 bg-light-surface dark:bg-dark-bg rounded text-xs font-mono">
                                                            {shortcut.key}
                                                        </kbd>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* AI & API Keys Tab */}
                        {activeTab === 'ai_keys' && (
                            <div className="space-y-6">
                                {/* AI Features Section */}
                                <div className="space-y-6">
                                    <h3 className="text-sm font-bold text-primary-fg uppercase tracking-wider">AI Features</h3>
                                    
                                    {/* AI Acceleration */}
                                    <div>
                                        <label className="block text-sm font-medium mb-3">Transcription Acceleration</label>
                                        <div className="space-y-2">
                                            {[
                                                { value: 'auto', label: 'Auto (Recommended)', description: 'Uses GPU (WebGPU) if available, otherwise CPU' },
                                                { value: 'gpu', label: 'GPU (WebGPU)', description: 'Fastest. Requires compatible browser & hardware' },
                                                { value: 'cpu', label: 'CPU (WASM)', description: 'Slowest. High compatibility, works everywhere' }
                                            ].map(option => (
                                                <button
                                                    key={option.value}
                                                    onClick={() => updateSettings({ aiDevice: option.value })}
                                                    className={`
                                                        w-full flex items-center justify-between p-3 rounded-lg border-2 transition-all text-left
                                                        ${settings.aiDevice === option.value
                                                            ? 'border-primary-fg/40 bg-primary-fg/5'
                                                            : 'border-light-border dark:border-dark-border hover:border-primary-fg/30'
                                                        }
                                                    `}
                                                >
                                                    <div>
                                                        <div className="font-medium text-sm">{option.label}</div>
                                                        <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                                                            {option.description}
                                                        </div>
                                                    </div>
                                                    {settings.aiDevice === option.value && (
                                                        <Check className="w-5 h-5 text-primary-fg" />
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium mb-3">Summarization Model</label>
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1.5 ml-1">
                                                    OpenRouter Model ID
                                                </label>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={settings.openRouterModel}
                                                        onChange={(e) => updateSettings({ openRouterModel: e.target.value })}
                                                        placeholder="google/gemini-2.0-flash-exp:free"
                                                        className="flex-1 px-3 py-2 rounded-lg border border-light-border dark:border-dark-border bg-white dark:bg-dark-surface focus:border-primary outline-none text-xs font-mono"
                                                    />
                                                    <button
                                                        onClick={() => updateSettings({ openRouterModel: 'google/gemini-2.0-flash-exp:free' })}
                                                        className="px-3 py-2 text-[10px] font-bold uppercase tracking-tight bg-light-surface dark:bg-white/5 rounded-lg border border-light-border dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                                                    >
                                                        Reset
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="border-t border-light-border dark:border-dark-border pt-6 space-y-4">
                                    <h3 className="text-sm font-bold text-primary-fg uppercase tracking-wider">API Keys</h3>
                                    <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                                        Keys are saved locally in your browser and never shared.
                                    </p>

                                    {/* Google API Key */}
                                    <div className="p-4 rounded-lg border border-light-border dark:border-dark-border bg-light-surface dark:bg-dark-bg">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center">
                                                    <span className="text-red-500 text-sm font-bold">G</span>
                                                </div>
                                                <div>
                                                    <div className="text-sm font-semibold">Google API Key</div>
                                                </div>
                                            </div>
                                            <a
                                                href="https://console.cloud.google.com/apis/credentials"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs text-primary-fg hover:underline flex items-center gap-1 opacity-70 hover:opacity-100 transition-opacity"
                                            >
                                                Get key <ExternalLink className="w-3 h-3" />
                                            </a>
                                        </div>
                                        <div className="relative">
                                            <input
                                                type={showApiKeys.youtube ? 'text' : 'password'}
                                                value={settings.googleApiKey || ''}
                                                onChange={(e) => updateSettings({ googleApiKey: e.target.value })}
                                                placeholder="AIza..."
                                                className="w-full px-3 py-2 pr-10 rounded-lg border border-light-border dark:border-dark-border bg-white dark:bg-dark-surface focus:border-primary outline-none text-sm font-mono"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowApiKeys(prev => ({ ...prev, youtube: !prev.youtube }))}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-primary dark:hover:text-dark-text-primary transition-colors"
                                            >
                                                {showApiKeys.youtube ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>

                                    {/* OpenRouter */}
                                    <div className="p-4 rounded-lg border border-light-border dark:border-dark-border bg-light-surface dark:bg-dark-bg">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center">
                                                    <span className="text-purple-500 text-sm font-bold">✦</span>
                                                </div>
                                                <div>
                                                    <div className="text-sm font-semibold">OpenRouter AI</div>
                                                </div>
                                            </div>
                                            <a
                                                href="https://openrouter.ai/keys"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs text-primary-fg hover:underline flex items-center gap-1 opacity-70 hover:opacity-100 transition-opacity"
                                            >
                                                Get key <ExternalLink className="w-3 h-3" />
                                            </a>
                                        </div>
                                        <div className="relative">
                                            <input
                                                type={showApiKeys.openRouter ? 'text' : 'password'}
                                                value={settings.openRouterApiKey}
                                                onChange={(e) => updateSettings({ openRouterApiKey: e.target.value })}
                                                placeholder="sk-or-..."
                                                className="w-full px-3 py-2 pr-10 rounded-lg border border-light-border dark:border-dark-border bg-white dark:bg-dark-surface focus:border-primary outline-none text-sm font-mono"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowApiKeys(prev => ({ ...prev, openRouter: !prev.openRouter }))}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-primary dark:hover:text-dark-text-primary transition-colors"
                                            >
                                                {showApiKeys.openRouter ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Security Notice */}
                                    <div className="flex items-center gap-2.5 px-4 py-3 bg-light-surface dark:bg-dark-bg rounded-lg border border-light-border dark:border-dark-border">
                                        <KeyRound className="w-4 h-4 text-light-text-secondary dark:text-dark-text-secondary flex-shrink-0" />
                                        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                                            Keys are stored locally and only sent directly to each API provider.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Data Tab */}
                        {activeTab === 'data' && (
                            <div className="space-y-3">
                                
                                {/* Auto Detect Thumbnails */}
                                <div className="p-4 rounded-lg border border-light-border dark:border-dark-border bg-light-surface dark:bg-dark-bg mb-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-primary-fg/10 flex items-center justify-center flex-shrink-0">
                                                <PictureInPicture className="w-4 h-4 text-primary-fg" />
                                            </div>
                                            <div>
                                                <div className="font-medium text-sm">Auto-Detect Thumbnails</div>
                                                <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                                                    Look for thumbnail.jpg or cover.png in course folders
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => updateSettings({ autoDetectThumbnails: !settings.autoDetectThumbnails })}
                                            className={`
                       w-12 h-6 rounded-full transition-colors relative
                       ${settings.autoDetectThumbnails ? 'bg-primary dark:bg-primary-fg/30 text-primary-content' : 'bg-gray-300 dark:bg-gray-600'}
                     `}
                                        >
                                            <div className={`
                       absolute top-1 w-4 h-4 rounded-full bg-white transition-transform
                       ${settings.autoDetectThumbnails ? 'translate-x-7' : 'translate-x-1'}
                     `} />
                                        </button>
                                    </div>
                                </div>

                                {/* Export */}
                                <div className="p-4 rounded-lg border border-light-border dark:border-dark-border bg-light-surface dark:bg-dark-bg">
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-primary-fg/10 flex items-center justify-center flex-shrink-0">
                                                <Upload className="w-4 h-4 text-primary-fg" />
                                            </div>
                                            <div>
                                                <div className="text-sm font-semibold">Export Backup</div>
                                                <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary">Download courses, progress & notes as a JSON file</div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={async () => {
                                                try {
                                                    const data = await exportAllData()
                                                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
                                                    const url = URL.createObjectURL(blob)
                                                    const a = document.createElement('a')
                                                    a.href = url
                                                    a.download = `tutin_backup_${new Date().toISOString().split('T')[0]}.json`
                                                    a.click()
                                                    URL.revokeObjectURL(url)
                                                } catch (err) { showNotification('Failed to export: ' + err.message, 'error') }
                                            }}
                                            className="flex-shrink-0 text-xs px-3 py-1.5 bg-primary text-primary-content rounded-lg hover:bg-primary-hover transition-colors font-medium flex items-center gap-1.5"
                                        >
                                            <Upload className="w-3.5 h-3.5" />
                                            Export
                                        </button>
                                    </div>
                                </div>

                                {/* Import */}
                                <div className="p-4 rounded-lg border border-light-border dark:border-dark-border bg-light-surface dark:bg-dark-bg">
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-primary-fg/10 flex items-center justify-center flex-shrink-0">
                                                <Download className="w-4 h-4 text-primary-fg" />
                                            </div>
                                            <div>
                                                <div className="text-sm font-semibold">Import Backup</div>
                                                <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary">Restore from a JSON backup — merges with existing data</div>
                                            </div>
                                        </div>
                                        <input
                                            type="file"
                                            id="import-file"
                                            accept=".json"
                                            className="hidden"
                                            onChange={async (e) => {
                                                const file = e.target.files?.[0]
                                                if (!file) return
                                                try {
                                                    const text = await file.text()
                                                    const data = JSON.parse(text)
                                                    await importData(data)
                                                    showNotification('Data imported successfully! Refreshing...', 'success')
                                                    window.location.reload()
                                                } catch (err) { showNotification('Failed to import: ' + err.message, 'error') }
                                                e.target.value = ''
                                            }}
                                        />
                                        <button
                                            onClick={() => document.getElementById('import-file')?.click()}
                                            className="flex-shrink-0 text-xs px-3 py-1.5 border border-light-border dark:border-dark-border rounded-lg hover:bg-light-surface dark:hover:bg-dark-bg transition-colors font-medium flex items-center gap-1.5"
                                        >
                                            <Download className="w-3.5 h-3.5" />
                                            Import
                                        </button>
                                    </div>
                                </div>



                                {/* Detect Durations */}
                                <div className="p-4 rounded-lg border border-light-border dark:border-dark-border bg-light-surface dark:bg-dark-bg">
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-primary-fg/10 flex items-center justify-center flex-shrink-0">
                                                <Clock className="w-4 h-4 text-primary-fg" />
                                            </div>
                                            <div>
                                                <div className="text-sm font-semibold">Detect Video Durations</div>
                                                <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                                                    {durationResult
                                                        ? `Updated ${durationResult.updated} of ${durationResult.total} videos`
                                                        : 'Fix 0:00 durations by scanning video file headers'
                                                    }
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            disabled={detectingDurations}
                                            onClick={async () => {
                                                try {
                                                    setDetectingDurations(true)
                                                    setDurationResult(null)
                                                    const result = await detectAllDurations()
                                                    setDurationResult(result)
                                                    if (result.updated > 0) {
                                                        setTimeout(() => window.location.reload(), 1500)
                                                    }
                                                } catch (err) {
                                                    showNotification('Failed to detect durations: ' + err.message, 'error')
                                                } finally {
                                                    setDetectingDurations(false)
                                                }
                                            }}
                                            className="flex-shrink-0 text-xs px-3 py-1.5 border border-light-border dark:border-dark-border rounded-lg hover:bg-light-surface dark:hover:bg-dark-bg transition-colors font-medium flex items-center gap-1.5 disabled:opacity-50"
                                        >
                                            <Clock className={`w-3.5 h-3.5 ${detectingDurations ? 'animate-spin' : ''}`} />
                                            {detectingDurations ? 'Scanning...' : 'Detect'}
                                        </button>
                                    </div>
                                </div>

                                {/* Danger Zone */}
                                <div className="p-4 rounded-xl border border-error/20 bg-error/5">
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-error/10 flex items-center justify-center flex-shrink-0">
                                                <AlertTriangle className="w-4 h-4 text-error" />
                                            </div>
                                            <div>
                                                <div className="text-sm font-semibold text-error">Reset All Data</div>
                                                <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary">Permanently deletes all courses, progress & settings</div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={async () => {
                                                const confirmed = confirm('Are you absolutely sure you want to delete all data?\n\nThis will permanently remove all courses, watch progress, notes and settings.\n\nThis action CANNOT be undone!')
                                                if (!confirmed) return
                                                const doubleConfirm = confirm('Last chance! Click OK to permanently delete all data.')
                                                if (!doubleConfirm) return
                                                try {
                                                    await clearAllData()
                                                    localStorage.clear()
                                                    showNotification('All data deleted. Reloading...', 'success')
                                                    window.location.reload()
                                                } catch (err) { showNotification('Failed to reset: ' + err.message, 'error') }
                                            }}
                                            className="flex-shrink-0 text-xs px-3 py-1.5 bg-error/10 text-error rounded-lg hover:bg-error/20 transition-colors border border-error/20 font-medium flex items-center gap-1.5"
                                        >
                                            <AlertTriangle className="w-3.5 h-3.5" />
                                            Reset
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between p-4 border-t border-light-border dark:border-dark-border">
                    <button
                        onClick={resetSettings}
                        className="text-sm text-light-text-secondary dark:text-dark-text-secondary hover:text-error transition-colors"
                    >
                        Reset to Defaults
                    </button>
                    <button
                        onClick={onClose}
                        className="px-6 py-2 rounded-lg bg-primary text-primary-content hover:bg-primary-hover transition-colors text-sm font-medium"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    )
}

export default SettingsModal
